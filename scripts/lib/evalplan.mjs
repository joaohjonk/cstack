// Diff-aware eval selection (section 24A test tiers). Cheapest evidence first:
// T0 static (free) always; T1 fixture/unit (free) when code or schemas change; T2 cheap-LLM behavior
// fixtures only for touched skills; T3 live media only for touched providers; T4 release is manual.
// A changed file nobody declared runs the full T2 gate (unknown dependency = run everything cheap).
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { ROOT, exists, readData } from './core.mjs';

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

export function changedFiles(since) {
  try {
    const base = since ?? 'HEAD~1';
    const out = execSync(`git -C "${ROOT}" diff --name-only ${base} -- . && git -C "${ROOT}" diff --name-only && git -C "${ROOT}" ls-files --others --exclude-standard`, { encoding: 'utf8' });
    return [...new Set(out.split('\n').filter(Boolean))];
  } catch {
    return null;
  }
}

const KNOWN = [/^docs\//, /^README\.md$/, /^CHANGELOG\.md$/, /^LICENSE$/, /^\.gitignore$/, /^examples\//, /^references\//, /^experiments\//, /^state\//, /^registry\/skills-index\.json$/, /^evals\/static\//];

export function evalPlan({ since, files } = {}) {
  const changed = files ?? changedFiles(since) ?? [];
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
    (f) => !KNOWN.some((re) => re.test(f)) && !/^(skills|providers|scripts|bin|schemas|tests|workflows|templates|fixtures|evals\/fixtures|\.github)\//.test(f) && f !== 'package.json' && f !== 'setup' && f !== 'package-lock.json' && f !== 'registry/models.json' && f !== 'registry/providers.json',
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
