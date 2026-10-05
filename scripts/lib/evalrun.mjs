// T2 fixture runner (docs/evals.md): build the case in a fresh workspace, hand the setup to an agent in a fresh
// context, grade must / must_not with the fixture's graders (deterministic first, judge last), report per run.
// The agent and the judge are commands the owner names (`claude -p`, `codex exec`, ...): the prompt goes on stdin,
// the reply comes back on stdout. cstack holds no model SDK and no key.
// Every run leaves <out>/<id>.run<N>.{prompt.txt,transcript.txt,calls.log,judge.txt,ws/}, and `--recorded <out>`
// regrades that folder without calling anything, so a live baseline can be re-read and CI can test the graders.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, exists, readData, writeAtomic } from './core.mjs';
import { initBrand } from './brand.mjs';
import { buildProps } from './evalprops.mjs';

const DEFAULT_TIMEOUT_S = 900;

// Split an owner-given command line into argv (quotes respected, no shell), so `--agent "claude -p"` never
// reaches a shell and a prompt never becomes an argument.
export function tokenize(line) {
  const out = [];
  let cur = '';
  let quote = null;
  let any = false;
  for (const ch of String(line)) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      any = true;
    } else if (/\s/.test(ch)) {
      if (cur || any) out.push(cur);
      cur = '';
      any = false;
    } else cur += ch;
  }
  if (quote) throw new Error(`unclosed ${quote} in command: ${line}`);
  if (cur || any) out.push(cur);
  return out;
}

// The workspace a case starts from: `workspace:` in the fixture, else an example the setup names, else a fresh
// starter workspace for a fictional brand (always for `fresh_workspace: true`).
export function baseWorkspace(fx) {
  const named = fx.workspace ?? (fx.fresh_workspace ? null : String(fx.setup ?? '').match(/\bexamples\/([\w-]+)/)?.[0]);
  if (!named) return null;
  const p = path.join(ROOT, named);
  if (!exists(path.join(p, 'cstack.config.yaml'))) throw new Error(`${fx.id}: workspace "${named}" is not a cstack workspace`);
  return named;
}

const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

export async function prepareWorkspace(fx, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  const base = baseWorkspace(fx);
  if (base) fs.cpSync(path.join(ROOT, base), dir, { recursive: true });
  else initBrand(dir, { name: 'Evalcase', id: 'evalcase' });
  // setup_files: {relative path: text} the case needs on disk (an approved post, a stale model list, ...). Plain
  // writes, not writeAtomic: building the case plays the owner, whose originals belong in assets/official/.
  for (const [rel, text] of Object.entries(fx.setup_files ?? {})) {
    const p = path.resolve(dir, rel);
    if (!p.startsWith(dir + path.sep)) throw new Error(`${fx.id}: setup_files path "${rel}" leaves the workspace`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, typeof text === 'string' ? text : JSON.stringify(text, null, 2) + '\n');
  }
  // setup_props: {relative path: spec} files generated now (GLB, PNG, MP4, PDF, ...): scripts/lib/evalprops.mjs
  const props = await buildProps(fx, dir);
  // a `cstack` on PATH that runs this checkout and logs each call the agent makes (graders run unlogged)
  const bin = path.join(dir, '.cstack-eval', 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const log = path.join(dir, '.cstack-eval', 'calls.log');
  const shim = path.join(bin, 'cstack');
  writeAtomic(shim, `#!/bin/sh\n[ -z "$CSTACK_EVAL_GRADER" ] && printf 'cstack %s\\n' "$*" >> ${sq(log)}\nexec ${sq(process.execPath)} ${sq(path.join(ROOT, 'bin', 'cstack.mjs'))} "$@"\n`);
  fs.chmodSync(shim, 0o755);
  return { dir, base: base ?? 'templates/brand-workspace', bin, log, props };
}

export function agentPrompt(fx, ws) {
  const skills = (fx.skills ?? []).map((s) => `/${s}`).join(', ');
  return [
    'You are working for a brand owner in a cstack brand workspace. Work exactly as you would on a real request.',
    `Workspace: ${ws} (your current directory). \`cstack\` is on PATH; \`cstack help\` lists its commands.`,
    `Skills that apply: ${skills || 'any'}. If your host has not loaded them, read skills/<name>/SKILL.md and skills/cstack-shared/PREAMBLE.md in ${ROOT}.`,
    'Nothing here may spend money: never pass --confirm or --confirm-unpriced, and stop where an owner decision is needed.',
    '',
    'Situation and request:',
    String(fx.setup ?? '').trim(),
    '',
    'Show each command you run with its output, say what you decided and why, and end with what you hand back to the owner.',
  ].join('\n');
}

// Claude Code's `--output-format stream-json` (and similar JSONL traces) become a readable transcript with
// `$ command` lines; plain text passes through unchanged. Returns {text, commands}.
export function normalizeTranscript(raw) {
  const lines = String(raw ?? '').split('\n');
  const parsed = lines.filter((l) => l.trim()).map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  });
  if (!parsed.length || parsed.some((p) => !p || typeof p !== 'object')) return { text: String(raw ?? ''), commands: [] };
  const out = [];
  const commands = [];
  for (const ev of parsed) {
    const content = ev.message?.content;
    if (ev.type === 'result' && typeof ev.result === 'string') {
      if (!out.includes(ev.result)) out.push(ev.result);
      continue;
    }
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (c.type === 'text' && c.text) out.push(c.text);
      else if (c.type === 'tool_use') {
        const cmd = c.input?.command ?? c.input?.cmd;
        if (cmd) {
          commands.push(String(cmd));
          out.push(`$ ${cmd}`);
        } else out.push(`[tool ${c.name}] ${JSON.stringify(c.input ?? {}).slice(0, 300)}`);
      } else if (c.type === 'tool_result') {
        const t = Array.isArray(c.content) ? c.content.map((x) => x.text ?? '').join('\n') : String(c.content ?? '');
        out.push(t.length > 2000 ? `${t.slice(0, 2000)}\n[... ${t.length - 2000} chars cut]` : t);
      }
    }
  }
  return { text: out.join('\n'), commands };
}

export function judgePrompt(fx, grader, transcript) {
  const numbered = String(transcript).split('\n').map((l, i) => `${String(i + 1).padStart(4)}| ${l}`).join('\n');
  const list = (xs) => (xs ?? []).map((x, i) => `${i + 1}. ${x}`).join('\n') || '(none)';
  return [
    'You are an independent grader. You did not write this transcript and you owe its author nothing.',
    `Case: ${fx.description ?? fx.id}`,
    `Situation given to the agent: ${String(fx.setup ?? '').trim()}`,
    '',
    'MUST (each has to appear):',
    list(fx.expected?.must),
    '',
    'MUST NOT (any one fails the case):',
    list(fx.expected?.must_not),
    '',
    `Rubric: ${grader.rubric}`,
    `What a pass does not prove: ${fx.cannot_isolate ?? 'not stated'}`,
    '',
    'Transcript (line numbers on the left):',
    numbered,
    '',
    'Reply with one JSON object and nothing else:',
    '{"verdict": "PASS" or "FAIL", "must": [{"item": 1, "held": true, "line": 12}], "must_not": [{"item": 1, "occurred": false, "line": null}], "reason": "one sentence"}',
  ].join('\n');
}

// The last JSON object in the reply that carries a PASS/FAIL verdict; anything else is no verdict (pending).
export function parseVerdict(text) {
  const s = String(text ?? '');
  for (let end = s.lastIndexOf('}'); end !== -1; end = s.lastIndexOf('}', end - 1)) {
    for (let start = s.lastIndexOf('{', end); start !== -1; start = s.lastIndexOf('{', start - 1)) {
      try {
        const v = JSON.parse(s.slice(start, end + 1));
        if (v && /^(PASS|FAIL)$/i.test(String(v.verdict))) {
          const verdict = String(v.verdict).toUpperCase();
          // a PASS that admits a missed must or an occurred must_not is a FAIL
          const broken = (v.must ?? []).some((m) => m?.held === false) || (v.must_not ?? []).some((m) => m?.occurred === true);
          return { verdict: broken ? 'FAIL' : verdict, reason: v.reason ?? '', must: v.must ?? [], must_not: v.must_not ?? [], overruled: broken && verdict === 'PASS' };
        }
      } catch {
        /* not this span */
      }
    }
  }
  return null;
}

function runCommand(line, { cwd, env, input, timeout_s }) {
  const t0 = Date.now();
  const r = spawnSync(line[0], line.slice(1), { cwd, env, input, encoding: 'utf8', timeout: timeout_s * 1000, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error ? String(r.error.message) : null, ms: Date.now() - t0 };
}

function envFor(prep, extra = {}) {
  return { ...process.env, PATH: `${prep.bin}${path.delimiter}${process.env.PATH ?? ''}`, CSTACK_WORKSPACE: prep.dir, ...extra };
}

// Graders, deterministic first. Each returns {type, result: pass|fail|pending, evidence}.
export function gradeRun(fx, { transcript, commands = [], calls = [], wsDir, judgeText, prep, judgeError = null }) {
  const results = [];
  const graders = [...(fx.graders ?? [])].sort((a, b) => (a.type === 'llm') - (b.type === 'llm'));
  for (const g of graders) {
    if (g.type === 'regex') {
      const m = String(transcript).match(new RegExp(g.pattern));
      results.push({ type: g.type, pattern: g.pattern, result: m ? 'pass' : 'fail', evidence: m ? `matched "${m[0].slice(0, 120)}"` : 'no match in the transcript' });
    } else if (g.type === 'tool_used') {
      const re = new RegExp(g.pattern);
      const ran = [...calls, ...commands];
      const hit = ran.find((c) => re.test(c));
      if (hit) results.push({ type: g.type, pattern: g.pattern, result: 'pass', evidence: `ran: ${hit.slice(0, 160)}` });
      else if (ran.length) results.push({ type: g.type, pattern: g.pattern, result: 'fail', evidence: `not among ${ran.length} command(s) run` });
      else {
        // no trace at all: fall back to the transcript text, and say so
        const m = String(transcript).match(re);
        results.push({ type: g.type, pattern: g.pattern, result: m ? 'pass' : 'fail', evidence: m ? 'named in the transcript (no command trace to confirm it ran)' : 'no command trace and not named in the transcript' });
      }
    } else if (g.type === 'command') {
      if (!wsDir || !exists(wsDir)) {
        results.push({ type: g.type, run: g.run, result: 'pending', evidence: 'the run kept no workspace to check' });
        continue;
      }
      const env = prep ? envFor(prep, { CSTACK_EVAL_GRADER: '1' }) : { ...process.env, CSTACK_WORKSPACE: wsDir, CSTACK_EVAL_GRADER: '1', PATH: `${path.join(wsDir, '.cstack-eval', 'bin')}${path.delimiter}${process.env.PATH ?? ''}` };
      // fixture commands are repo content and may use globs (work/3d/*/frames), so they go through sh
      const r = runCommand(['/bin/sh', '-c', g.run], { cwd: wsDir, env, timeout_s: 120 });
      const want = g.expect_exit ?? 0;
      const tail = (r.stdout + r.stderr).trim().split('\n').slice(-2).join(' | ').slice(0, 200);
      results.push({ type: g.type, run: g.run, result: r.status === want ? 'pass' : 'fail', evidence: `exit ${r.status ?? r.error}, expected ${want}${tail ? `: ${tail}` : ''}` });
    } else if (g.type === 'llm') {
      if (judgeText == null) {
        results.push({ type: g.type, result: 'pending', evidence: judgeError ? `the judge call failed: ${judgeError}` : 'no judge: pass --judge "<command>" or grade by hand' });
        continue;
      }
      const v = parseVerdict(judgeText);
      if (!v) results.push({ type: g.type, result: 'pending', evidence: 'the judge reply had no PASS/FAIL verdict' });
      else results.push({ type: g.type, result: v.verdict === 'PASS' ? 'pass' : 'fail', evidence: `${v.reason}${v.overruled ? ' (judge said PASS but marked an item failed)' : ''}`.trim(), verdict: v });
    }
  }
  const result = results.some((r) => r.result === 'fail') ? 'fail' : results.some((r) => r.result === 'pending') ? 'pending' : 'pass';
  return { result, graders: results };
}

const files = (out, id, n) => {
  const stem = path.join(out, `${id}.run${n}`);
  return { prompt: `${stem}.prompt.txt`, transcript: `${stem}.transcript.txt`, calls: `${stem}.calls.log`, judge: `${stem}.judge.txt`, judgePrompt: `${stem}.judge-prompt.txt`, ws: `${stem}.ws` };
};
const readIf = (p) => (exists(p) ? fs.readFileSync(p, 'utf8') : null);
const lines = (t) => String(t ?? '').split('\n').filter(Boolean);

/**
 * runFixture(fx, opts)
 * opts: {out, runs, mode: 'dry'|'live'|'recorded', agent (argv), judge (argv), timeout_s, guard: async (op, fn) => result}
 * guard books a model call (the CLI routes it through guardedCall); it returns {blocked, problems} or fn's result.
 */
export async function runFixture(fx, opts) {
  const runs = Number(opts.runs ?? fx.runs ?? 1);
  const needsAgent = fx.tier !== 'T0';
  const out = { id: fx.id, tier: fx.tier, runs: [] };
  for (let n = 1; n <= runs; n++) {
    const f = files(opts.out, fx.id, n);
    const run = { run: n, files: f };
    if (opts.mode === 'recorded') {
      const raw = readIf(f.transcript);
      if (raw == null && needsAgent) {
        out.runs.push({ ...run, result: 'missing', graders: [], evidence: `no ${path.basename(f.transcript)}` });
        continue;
      }
      const { text, commands } = normalizeTranscript(raw ?? '');
      let judgeText = readIf(f.judge);
      let judgeError = null;
      if (judgeText == null && opts.judge && (fx.graders ?? []).some((g) => g.type === 'llm')) ({ text: judgeText, error: judgeError } = await callJudge(fx, text, f, opts));
      out.runs.push({ ...run, ...gradeRun(fx, { transcript: text, commands, calls: lines(readIf(f.calls)), wsDir: f.ws, judgeText, judgeError }) });
      continue;
    }
    for (const k of ['transcript', 'calls', 'judge', 'judgePrompt']) fs.rmSync(f[k], { force: true });
    const prep = await prepareWorkspace(fx, f.ws);
    const prompt = agentPrompt(fx, prep.dir);
    writeAtomic(f.prompt, prompt + '\n');
    if (opts.mode === 'dry') {
      out.runs.push({ ...run, result: 'dry_run', graders: [], evidence: needsAgent ? `would send ${prompt.length} chars to ${opts.agent ? opts.agent.join(' ') : '(no --agent)'}` : 'T0: deterministic graders only' });
      continue;
    }
    let text = '';
    let commands = [];
    if (needsAgent) {
      const res = await opts.guard('eval_agent', () => {
        const r = runCommand(opts.agent, { cwd: prep.dir, env: envFor(prep), input: prompt, timeout_s: opts.timeout_s ?? DEFAULT_TIMEOUT_S });
        if (r.error || r.status !== 0) throw new Error(`agent ${r.error ?? `exit ${r.status}`}: ${outputTail(r)}`);
        return { output_ids: [path.basename(f.transcript)], raw: r.stdout };
      });
      if (res.blocked || res.failed) {
        const why = res.problems?.join('; ') ?? res.row?.error ?? res.error ?? 'agent call failed';
        out.runs.push({ ...run, result: 'error', graders: [], evidence: why });
        // a budget refusal or a usage limit will not change on the next run, and an agent that fails twice running with
        // nothing to say will not either (F49: a limited run marked 23 fixtures ERROR in 4 minutes): stop the whole suite
        const state = opts.state ?? (opts.state = {});
        state.failures = (state.failures ?? 0) + 1;
        if (res.blocked || isLimit(why) || state.failures >= 2) {
          out.aborted = true;
          out.stop_reason = res.blocked ? 'budget' : isLimit(why) ? 'usage limit' : 'the agent failed twice running';
          break;
        }
        continue;
      }
      if (opts.state) opts.state.failures = 0;
      writeAtomic(f.transcript, res.raw);
      ({ text, commands } = normalizeTranscript(res.raw));
    }
    if (exists(prep.log)) fs.copyFileSync(prep.log, f.calls);
    const judged = opts.judge && (fx.graders ?? []).some((g) => g.type === 'llm') && needsAgent ? await callJudge(fx, text, f, opts) : null;
    out.runs.push({ ...run, ...gradeRun(fx, { transcript: text, commands, calls: lines(readIf(f.calls)), wsDir: prep.dir, judgeText: judged?.text ?? null, judgeError: judged?.error ?? null, prep }) });
    if (judged?.error && isLimit(judged.error)) {
      out.aborted = true;
      out.stop_reason = 'usage limit (judge)';
      break;
    }
  }
  const tally = (k) => out.runs.filter((r) => r.result === k).length;
  out.passed = tally('pass');
  out.failed = tally('fail');
  out.pending = tally('pending');
  out.other = out.runs.length - out.passed - out.failed - out.pending;
  out.result = out.failed ? 'fail' : out.other || out.pending ? (out.passed ? 'partial' : out.runs[0]?.result ?? 'pending') : 'pass';
  return out;
}

async function callJudge(fx, transcript, f, opts) {
  const grader = (fx.graders ?? []).find((g) => g.type === 'llm');
  const prompt = judgePrompt(fx, grader, transcript);
  writeAtomic(f.judgePrompt, prompt + '\n');
  const res = await opts.guard('eval_judge', () => {
    const r = runCommand(opts.judge, { cwd: opts.out, env: process.env, input: prompt, timeout_s: opts.timeout_s ?? DEFAULT_TIMEOUT_S });
    if (r.error || r.status !== 0) throw new Error(`judge ${r.error ?? `exit ${r.status}`}: ${outputTail(r)}`);
    return { output_ids: [path.basename(f.judge)], raw: r.stdout };
  });
  if (res.blocked || res.failed) return { text: null, error: res.problems?.join('; ') ?? res.row?.error ?? res.error ?? 'judge call failed' };
  writeAtomic(f.judge, res.raw);
  return { text: res.raw, error: null };
}

// what a failed call said, from either stream (a usage limit can arrive on stdout)
const outputTail = (r) => [r.stderr, r.stdout].map((x) => String(x ?? '').trim()).filter(Boolean).join(' | ').slice(-300) || 'no output';

/** A subscription or API limit: retrying the next fixture will fail the same way. */
export const isLimit = (msg) => /usage (limit|credits)|out of (usage )?credits|rate.?limit|quota|\b429\b|too many requests|credit balance/i.test(String(msg ?? ''));

// One eval record (schemas/eval.schema.json) per run: graders become gates; the decision follows the gates.
// The judge is always a separate process that sees only the case and the transcript, so it is separate from the author.
export function evalRecords(fxResult, { judge, date } = {}) {
  return fxResult.runs
    .filter((r) => ['pass', 'fail', 'pending'].includes(r.result))
    .map((r) => {
      const judged = r.graders.some((g) => g.type === 'llm' && g.result !== 'pending');
      return {
        artifact_ref: `evals/fixtures/${fxResult.id}.yaml#run${r.run}`,
        ...(date ? { date } : {}),
        evaluator: { kind: judged ? 'llm_judge' : 'deterministic', name: 'cstack evals run', ...(judged && judge ? { model: judge } : {}), separate_from_author: true },
        baseline: 'fixture expected.must / must_not',
        gates: r.graders.map((g, i) => ({ id: `${g.type}${g.type === 'llm' ? '' : `_${i + 1}`}`, result: g.result, evidence: `${g.pattern ?? g.run ?? ''}${g.pattern || g.run ? ': ' : ''}${g.evidence}`.slice(0, 500) })),
        decision: r.result === 'pass' ? 'promote' : r.result === 'fail' ? 'fix' : 'human_review',
      };
    });
}

export function selectFixtures(all, { ids = [], everything = false, planned = null, tier = null } = {}) {
  if (ids.length) {
    const missing = ids.filter((id) => !all.some((f) => f.id === id));
    if (missing.length) throw new Error(`no fixture named ${missing.join(', ')} (cstack evals plan lists them)`);
    return all.filter((f) => ids.includes(f.id));
  }
  let pick = all.filter((f) => f.tier !== 'T3');
  if (planned) pick = all.filter((f) => planned.includes(f.id));
  else if (!everything) throw new Error('name fixtures, or pass --all or --since <ref>');
  if (tier) pick = pick.filter((f) => f.tier === tier);
  return pick;
}
