// T2 runner (cstack evals run): graders, transcripts, workspaces and the spend gate, without calling a model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, readJSONL } from '../scripts/lib/core.mjs';
import { tokenize, normalizeTranscript, parseVerdict, gradeRun, prepareWorkspace, evalRecords, selectFixtures, agentPrompt } from '../scripts/lib/evalrun.mjs';
import { loadFixtures, checkFixtures } from '../scripts/lib/evalplan.mjs';
import { validateValue } from '../scripts/lib/schemas.mjs';
import { tmpDir } from './tmp.mjs';

const CLI = path.join(ROOT, 'bin', 'cstack.mjs');
const RECORDED = path.join(ROOT, 'tests', 'fixtures', 'evals-recorded');
const cli = (args, opts = {}) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...opts });
const fx = (id) => loadFixtures().find((f) => f.id === id);
const script = (dir, name, body) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, `#!/bin/sh\ncat > /dev/null\n${body}\n`);
  fs.chmodSync(p, 0o755);
  return p;
};

test('evals run: tokenize keeps quoted words and never needs a shell', () => {
  assert.deepEqual(tokenize(`claude -p --allowedTools "Bash(cstack:*)" 'two words'`), ['claude', '-p', '--allowedTools', 'Bash(cstack:*)', 'two words']);
  assert.deepEqual(tokenize('a "" b'), ['a', '', 'b']);
  assert.throws(() => tokenize('claude "-p'), /unclosed/);
});

test('evals run: a stream-json trace becomes a transcript with the commands it ran', () => {
  const raw = fs.readFileSync(path.join(RECORDED, 'expensive-overnight-batch.run1.transcript.txt'), 'utf8');
  const t = normalizeTranscript(raw);
  assert.deepEqual(t.commands, ['cstack spend plan --file work/plan.json']);
  assert.match(t.text, /\$ cstack spend plan/);
  assert.match(t.text, /Submitted 200 variations/);
  assert.deepEqual(normalizeTranscript('plain text\n').commands, []);
});

test('evals run: a judge PASS that admits a failed item is a FAIL; no JSON is no verdict', () => {
  const v = parseVerdict(fs.readFileSync(path.join(RECORDED, 'expensive-overnight-batch.run1.judge.txt'), 'utf8'));
  assert.equal(v.verdict, 'FAIL');
  assert.equal(v.overruled, true);
  assert.equal(parseVerdict('PASS, looks fine'), null);
  assert.equal(parseVerdict('{"a": 1} then {"verdict": "fail", "reason": "x"}').verdict, 'FAIL');
});

test('evals run: tool_used checks commands that ran, and says so when it can only read the text', () => {
  const f = fx('expensive-overnight-batch');
  const ran = gradeRun(f, { transcript: 'I ran it', calls: ['cstack generate x'], judgeText: null });
  assert.equal(ran.graders[0].result, 'fail', 'a trace without the command fails even if the text names it');
  const text = gradeRun(f, { transcript: 'next: cstack spend plan', judgeText: null });
  assert.equal(text.graders[0].result, 'pass');
  assert.match(text.graders[0].evidence, /no command trace/);
  assert.equal(text.result, 'pending', 'an llm grader without a judge leaves the run pending');
});

test('evals run: the workspace shim logs agent calls and runs this checkout', async () => {
  const dir = path.join(tmpDir('cstack-evws-'), 'ws');
  const prep = await prepareWorkspace(fx('creative-winner-invariant'), dir);
  assert.equal(prep.base, 'examples/tessel-kiln', 'the example named in the setup is the starting workspace');
  const env = { ...process.env, PATH: `${prep.bin}${path.delimiter}${process.env.PATH}` };
  assert.equal(spawnSync('cstack', ['help'], { cwd: dir, env }).status, 0);
  spawnSync('cstack', ['help'], { cwd: dir, env: { ...env, CSTACK_EVAL_GRADER: '1' } });
  assert.deepEqual(fs.readFileSync(prep.log, 'utf8').trim().split('\n'), ['cstack help']);
  const fresh = await prepareWorkspace({ id: 'x', setup: 'no example', setup_files: { 'work/post.md': 'approved post' } }, path.join(path.dirname(dir), 'fresh'));
  assert.equal(fresh.base, 'templates/brand-workspace');
  assert.equal(fs.readFileSync(path.join(fresh.dir, 'work', 'post.md'), 'utf8'), 'approved post');
  await assert.rejects(prepareWorkspace({ id: 'x', setup_files: { '../out.md': 'x' } }, path.join(path.dirname(dir), 'bad')), /leaves the workspace/);
  const empty = await prepareWorkspace({ id: 'x', setup: 'like examples/tessel-kiln', fresh_workspace: true }, path.join(path.dirname(dir), 'empty'));
  assert.equal(empty.base, 'templates/brand-workspace', 'fresh_workspace never infers an example from the setup');
});

test('evals run: the agent prompt never shows the expected behaviour', () => {
  const f = fx('expensive-overnight-batch');
  const p = agentPrompt(f, '/ws');
  for (const m of [...f.expected.must, ...f.expected.must_not]) assert.ok(!p.includes(m));
  assert.match(p, /never pass --confirm/);
});

test('evals run: fixture format checks workspace and setup_files', () => {
  const { errors } = checkFixtures();
  assert.deepEqual(errors, []);
});

test('evals run: selection needs ids, --all or a plan, and keeps T3 out of --all', () => {
  const all = loadFixtures();
  assert.throws(() => selectFixtures(all, {}), /--all/);
  assert.throws(() => selectFixtures(all, { ids: ['nope'] }), /no fixture named nope/);
  assert.ok(selectFixtures(all, { everything: true }).every((f) => f.tier !== 'T3'));
  assert.deepEqual(selectFixtures(all, { everything: true, tier: 'T0' }).map((f) => f.tier).filter((t) => t !== 'T0'), []);
});

test('evals run --recorded regrades saved runs without calling anything', () => {
  const r = cli(['evals', 'run', 'make-it-cooler', 'expensive-overnight-batch', '--recorded', RECORDED, '--runs', '2', '--json']);
  assert.equal(r.status, 1, r.stderr);
  const s = JSON.parse(r.stdout);
  const by = Object.fromEntries(s.results.map((x) => [x.id, x]));
  assert.equal(by['make-it-cooler'].passed, 1);
  assert.equal(by['make-it-cooler'].runs[1].result, 'missing');
  assert.equal(by['expensive-overnight-batch'].runs[0].result, 'fail');
  assert.equal(by['expensive-overnight-batch'].runs[1].result, 'pending');
  assert.equal(by['expensive-overnight-batch'].result, 'fail');
});

test('evals run: T0 cases run their commands with no agent', () => {
  const r = cli(['evals', 'run', 'creative-confounded-winner', '--out', tmpDir('cstack-evout-')]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /PASS +creative-confounded-winner/);
});

test('evals run: live calls go through the spend gate, then grade, record and regrade', () => {
  const tmp = tmpDir('cstack-evlive-');
  const owner = path.join(tmp, 'owner');
  assert.equal(cli(['brand', 'init', owner, '--name', 'Owner']).status, 0);
  const agent = script(tmp, 'agent.sh', 'cstack help > /dev/null\necho "Defect: the crop hides the handle. One change: recrop."');
  const judge = script(tmp, 'judge.sh', `echo '{"verdict": "PASS", "must": [], "must_not": [], "reason": "diagnosis first"}'`);
  const out = path.join(tmp, 'out');
  const base = ['evals', 'run', 'make-it-cooler', '--agent', agent, '--judge', judge, '--out', out, '--ws', owner, '--runs', '2'];

  const blocked = cli(base);
  assert.equal(blocked.status, 1);
  assert.match(blocked.stdout, /STOPPED.*unpriced/);
  assert.ok(!fs.existsSync(path.join(out, 'make-it-cooler.run2.prompt.txt')), 'a budget refusal stops the suite');

  const ok = cli([...base, '--cost-per-call', '0', '--record']);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /PASS +make-it-cooler +2\/2/);
  assert.equal(fs.readFileSync(path.join(out, 'make-it-cooler.run1.calls.log'), 'utf8').trim(), 'cstack help');
  const ledger = readJSONL(path.join(owner, 'state', 'cost-ledger.jsonl')).filter((x) => x.status === 'ok');
  assert.deepEqual(ledger.map((x) => x.operation), ['eval_agent', 'eval_judge', 'eval_agent', 'eval_judge']);
  const recs = readJSONL(path.join(owner, 'state', 'evals.jsonl'));
  assert.equal(recs.length, 2);
  for (const rec of recs) assert.ok(validateValue('eval', rec).ok);
  assert.equal(cli(['brand', 'check', '--ws', owner]).status, 0, 'ledger and eval rows pass the workspace schemas');

  const again = cli(['evals', 'run', 'make-it-cooler', '--recorded', out, '--runs', '2']);
  assert.equal(again.status, 0, again.stdout);
  assert.match(again.stdout, /PASS +make-it-cooler +2\/2/);
});

test('evals run: eval records follow the gates', () => {
  const recs = evalRecords({ id: 'make-it-cooler', runs: [{ run: 1, result: 'fail', graders: [{ type: 'regex', pattern: 'x', result: 'fail', evidence: 'no match' }] }, { run: 2, result: 'error', graders: [] }] });
  assert.equal(recs.length, 1);
  assert.equal(recs[0].decision, 'fix');
  assert.equal(recs[0].evaluator.kind, 'deterministic');
  assert.ok(validateValue('eval', { id: 'EV-1', date: '2026-10-05', ...recs[0] }).ok);
});

test('evals run: a usage limit stops the suite with a resume list; a failed judge says so; records keep up (F49 to F51)', () => {
  const tmp = tmpDir('cstack-evlimit-');
  const owner = path.join(tmp, 'owner');
  assert.equal(cli(['brand', 'init', owner, '--name', 'Owner']).status, 0);
  const out = path.join(tmp, 'out');
  const two = ['evals', 'run', 'make-it-cooler', 'ai-judge-not-owner', '--out', out, '--ws', owner, '--runs', '1', '--cost-per-call', '0', '--record'];
  // the subscription runs out: the first failure stops the suite instead of marking every fixture ERROR
  const limited = script(tmp, 'limited.sh', `echo "You're out of usage credits"; exit 1`);
  const judge = script(tmp, 'judge.sh', `echo '{"verdict": "PASS", "must": [], "must_not": [], "reason": "ok"}'`);
  const r = cli([...two, '--agent', limited, '--judge', judge]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /STOPPED +ai-judge-not-owner \(usage limit\)/);
  assert.match(r.stdout, /resume with the same command and these 2 fixture id\(s\): ai-judge-not-owner make-it-cooler/);
  assert.ok(!fs.existsSync(path.join(out, 'make-it-cooler.run1.prompt.txt')));
  // the agent works but the judge call fails: the run is pending and says why, and its record is written before the suite ends
  const agent = script(tmp, 'agent.sh', 'echo "Defect: the crop hides the handle. One change: recrop."');
  const badJudge = script(tmp, 'badjudge.sh', 'echo "boom" >&2; exit 1');
  const j = cli([...two.slice(0, 3), ...two.slice(4), '--agent', agent, '--judge', badJudge]);
  assert.match(j.stdout, /llm pending: the judge call failed: judge exit 1: boom/);
  const summary = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  assert.equal(summary.fixtures, 1);
  assert.equal(readJSONL(path.join(owner, 'state', 'evals.jsonl')).length, 1);
});

test('a malformed judge reply (no closing brace) is pending, not a hang (F98)', async () => {
  const { lastJsonObject } = await import('../scripts/lib/jsonscan.mjs');
  const truncated = '{"verdict": "PASS", "reason": "the agent did the thing", "must": [{"id": "m1", "held": true}]';
  const t0 = Date.now();
  assert.equal(parseVerdict(truncated), null);
  assert.equal(parseVerdict('}'), null);
  assert.equal(parseVerdict('{'), null);
  assert.equal(lastJsonObject('{"a":1}', (v) => v.b), null);
  assert.ok(Date.now() - t0 < 2000, 'the scan ends');
  assert.equal(parseVerdict(`prose first\n${truncated}}\nand after`).verdict, 'PASS');
  assert.equal(parseVerdict('{"verdict":"FAIL"} {"verdict":"PASS"}').verdict, 'PASS', 'the last object wins');
});
