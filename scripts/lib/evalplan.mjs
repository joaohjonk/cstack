// Diff-aware eval selection (test tiers: docs/evals.md). Cheapest evidence first:
// T0 static (free) always; T1 fixture/unit (free) when code or schemas change; T2 cheap-LLM behavior
// fixtures only for touched skills; T3 live media only for touched providers; T4 release is manual.
// A changed file nobody declared runs the full T2 gate (unknown dependency = run everything cheap).
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ROOT, exists, readData } from './core.mjs';
import { checkPropSpec } from './evalprops.mjs';

const FIXTURE_DIR = path.join(ROOT, 'evals', 'fixtures');

function globToRe(g) {
  return new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '§').replace(/\*/g, '[^/]*').replace(/§/g, '.*') + '$');
}

export function loadFixtures() {
  if (!exists(FIXTURE_DIR)) return [];
  return fs
    .readdirSync(FIXTURE_DIR)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => ({ file: `evals/fixtures/${f}`, ...readData(path.join(FIXTURE_DIR, f)) }));
}

const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// Files changed since a ref, plus unstaged and untracked ones. Argument arrays only (no shell); a failed diff throws
// so a diff-aware gate never reads as "nothing changed".
export function changedFiles(since) {
  const base = String(since ?? 'HEAD~1');
  if (!base || base.startsWith('-')) throw new Error(`--since "${base}" is not a git ref`);
  try {
    const out = [git('diff', '--name-only', base, '--', '.'), git('diff', '--name-only'), git('ls-files', '--others', '--exclude-standard')].join('\n');
    return [...new Set(out.split('\n').filter(Boolean))];
  } catch (e) {
    throw new Error(`git diff against "${base}" failed: ${String(e.stderr || e.message).trim().split('\n')[0]} (in a shallow clone, fetch the base first or pass origin/main)`);
  }
}

const KNOWN = [/^docs\//, /^README\.md$/, /^CHANGELOG\.md$/, /^LICENSE$/, /^\.gitignore$/, /^examples\//, /^references\//, /^experiments\//, /^state\//, /^canon\//, /^registry\/skills-index\.json$/, /^registry\/research-tools\.json$/, /^evals\/static\//];

export function evalPlan({ since, files } = {}) {
  const changed = files ?? changedFiles(since);
  const fixtures = loadFixtures();
  const tiers = { T0: ['cstack validate', 'cstack budget --check'], T1: [], T2: [], T3: [], T4: [] };
  const why = [];
  const code = changed.filter((f) => /^(scripts|bin|schemas|tests|\.github|providers\/local)\//.test(f) || f === 'package.json' || f === 'setup');
  if (code.length) {
    tiers.T1.push('node --test tests/*.test.mjs');
    why.push(`T1: code/schemas changed (${code.slice(0, 5).join(', ')}${code.length > 5 ? ', ...' : ''})`);
  }
  const touchedSkills = new Set(changed.map((f) => f.match(/^skills\/([^/]+)\//)?.[1]).filter(Boolean));
  const touchedProviders = new Set(changed.map((f) => f.match(/^providers\/([^/.]+)/)?.[1]).filter((p) => p && p !== 'local')); // providers/local/* is free, deterministic: T1
  const unknown = changed.filter(
    (f) => !KNOWN.some((re) => re.test(f)) && !/^(skills|providers|scripts|bin|schemas|tests|workflows|flows|templates|fixtures|evals\/fixtures|\.github)\//.test(f) && f !== 'package.json' && f !== 'setup' && f !== 'package-lock.json' && f !== 'registry/models.json' && f !== 'registry/providers.json',
  );
  const full = unknown.length > 0 || changed.some((f) => f.toLowerCase() === 'skills/cstack-shared/preamble.md');
  for (const fx of fixtures) {
    const hitSkill = (fx.skills ?? []).some((s) => touchedSkills.has(s));
    const hitDep = (fx.depends_on ?? []).some((g) => changed.some((f) => globToRe(g).test(f)));
    if (full || hitSkill || hitDep) (fx.tier === 'T3' ? tiers.T3 : tiers.T2).push(fx.id);
  }
  for (const p of touchedProviders) tiers.T3.push(`provider smoke: ${p} (dry-run first, then one bounded live call if credentials exist)`);
  if (full) why.push(`T2 full gate: ${unknown.length ? `undeclared changes (${unknown.slice(0, 3).join(', ')})` : 'shared preamble changed'}`);
  else if (touchedSkills.size) why.push(`T2: touched skills ${[...touchedSkills].join(', ')}`);
  tiers.T4.push('manual: run before releases (end-to-end workflow on a fixture brand + multimodal gates)');
  const text = [
    `changed files: ${changed.length}`,
    ...Object.entries(tiers).map(([t, v]) => `${t}: ${v.length ? v.join(' | ') : '-'}`),
    ...why.map((w) => `why ${w}`),
  ].join('\n');
  return { changed, tiers, why, full, text };
}

// Fixture format (docs/evals.md): tiers T0|T2|T3 (T1 lives in tests/), graders command|tool_used|regex|llm.
const GRADERS = { command: ['run', 'expect_exit'], tool_used: ['pattern'], regex: ['pattern'], llm: ['rubric'] };
// where a case starts (docs/evals.md#fixture-props): a T2 fixture declares at least one
const STARTS = ['workspace', 'setup_files', 'setup_props', 'fresh_workspace'];

export function checkFixtures({ skills = null, files = null, fixtures = null } = {}) {
  const errors = [];
  const warnings = [];
  let tracked = files;
  if (!tracked) {
    try {
      tracked = git('ls-files', '-co', '--exclude-standard').split('\n').filter(Boolean);
    } catch {
      tracked = null;
    }
  }
  for (const fx of fixtures ?? loadFixtures()) {
    const where = fx.file;
    if (fx.id !== path.basename(fx.file).replace(/\.ya?ml$/, '')) errors.push([where, `id "${fx.id}" must equal the file name`]);
    if (!['T0', 'T2', 'T3'].includes(fx.tier)) errors.push([where, `tier "${fx.tier}" must be T0, T2 or T3 (T1 lives in tests/)`]);
    if (!(fx.expected?.must ?? []).length) errors.push([where, 'expected.must is empty']);
    for (const sk of fx.skills ?? []) if (skills && !skills.includes(sk)) errors.push([where, `unknown skill "${sk}"`]);
    for (const g of fx.graders ?? []) {
      const need = GRADERS[g.type];
      if (!need) {
        errors.push([where, `grader type "${g.type}" is not one of ${Object.keys(GRADERS).join(', ')}`]);
        continue;
      }
      for (const k of need) if (g[k] == null) errors.push([where, `${g.type} grader needs "${k}"`]);
      if (g.type === 'regex' || g.type === 'tool_used')
        try {
          new RegExp(g.pattern);
        } catch (e) {
          errors.push([where, `pattern does not compile in JavaScript: ${e.message}`]);
        }
    }
    if (fx.workspace != null && !exists(path.join(ROOT, String(fx.workspace), 'cstack.config.yaml'))) errors.push([where, `workspace "${fx.workspace}" is not a cstack workspace in this repo`]);
    for (const field of ['setup_files', 'setup_props']) {
      const v = fx[field];
      if (v == null) continue;
      if (typeof v !== 'object' || Array.isArray(v)) errors.push([where, `${field} must map workspace-relative paths to ${field === 'setup_files' ? 'file text' : 'prop specs'}`]);
      else
        for (const [k, spec] of Object.entries(v)) {
          if (path.isAbsolute(k) || k.split(/[\\/]/).includes('..')) errors.push([where, `${field} path "${k}" must stay inside the workspace`]);
          if (field === 'setup_props') for (const e of checkPropSpec(spec)) errors.push([where, `setup_props "${k}": ${e}`]);
        }
    }
    // F40: a T2 setup that names files the case never provides fails on the fixture, not the agent, so every T2
    // case says where it starts; fresh_workspace: true is the deliberate empty start, never combined with files
    if (fx.fresh_workspace != null && fx.fresh_workspace !== true) errors.push([where, 'fresh_workspace is either true or absent']);
    if (fx.tier === 'T2') {
      const starts = STARTS.filter((k) => fx[k] != null);
      if (!starts.length) errors.push([where, `T2 fixture declares no starting point: set workspace, setup_files or setup_props to what the setup describes, or fresh_workspace: true when it starts empty on purpose`]);
      else if (fx.fresh_workspace && starts.length > 1) errors.push([where, `fresh_workspace: true starts the case empty; it cannot also declare ${starts.filter((k) => k !== 'fresh_workspace').join(', ')}`]);
    }
    if (tracked) for (const d of fx.depends_on ?? []) if (!tracked.some((f) => globToRe(d).test(f))) warnings.push([where, `depends_on "${d}" matches no file`]);
  }
  return { errors, warnings };
}
