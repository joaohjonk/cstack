import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { listFlows, searchFlows, planFromFlow, checkFlow, checkFlowFile } from '../scripts/lib/flows.mjs';
import { validateValue } from '../scripts/lib/schemas.mjs';

const flow = (id, outcome, last_verified, extra = {}) => ({
  id, outcome, status: 'researched', last_verified, stale_after_days: 30,
  steps: [{ id: 's1', does: 'probe', kind: 'probe', gate: { type: 'owner' }, compare_to_target: 'side by side with the reference' }],
  evidence: [{ ref: 'https://example.com/doc', kind: 'documented', date: last_verified }], ...extra,
});
const followable = (id, last_verified) => flow(id, 'short product film', last_verified, {
  target: { description: 'library default target' },
  candidates_considered: [{ name: 'stills then motion', verdict: 'chosen' }, { name: 'text to video one shot', verdict: 'rejected', why: 'label drifts' }],
  cost_ladder: 'probes at draft tier; stop after two failed probe rounds',
});
const workspace = () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'cstack-flows-'));
  fs.mkdirSync(path.join(ws, 'flows'));
  return ws;
};
const write = (ws, f) => fs.writeFileSync(path.join(ws, 'flows', `${f.id}.flow.yaml`), YAML.stringify(f));
const today = new Date().toISOString().slice(0, 10);

test('flows: search, staleness, plan', () => {
  const ws = workspace();
  const f1 = flow('rotating-hero-test', 'rotating 3d product hero on a web page', '2020-01-01', { aliases: ['turntable'] });
  const f2 = followable('film-test', today);
  for (const f of [f1, f2]) {
    assert.ok(validateValue('flow', f).ok, validateValue('flow', f).errors);
    write(ws, f);
  }
  const all = listFlows(ws).filter((f) => f.scope === 'workspace');
  assert.equal(all.find((f) => f.id === 'rotating-hero-test').stale, true);
  assert.equal(all.find((f) => f.id === 'film-test').stale, false);
  // the library flows compete for the same request, so only ask that the workspace flow is found
  const hits = searchFlows(ws, 'make the product rotate in 3d on the homepage', { k: 50 }).map((r) => r.flow.id);
  assert.ok(hits.includes('rotating-hero-test'), hits.join(', '));
  const r = planFromFlow(ws, 'film-test', { target: 'like the reference, 15s, 9:16' });
  const plan = YAML.parse(fs.readFileSync(r.file, 'utf8'));
  assert.equal(plan.status, 'plan');
  assert.equal(plan.target.description, 'like the reference, 15s, 9:16');
  assert.ok(validateValue('flow', plan).ok);
  assert.throws(() => planFromFlow(ws, 'film-test'), /already exists/);
});

test('flows: a workspace flow with a library id overrides the library flow', () => {
  const ws = workspace();
  const lib = listFlows(ws).find((f) => f.id === '3d-web-hero');
  assert.equal(lib?.scope, 'cstack');
  write(ws, flow('3d-web-hero', 'our own rotating hero method', today));
  const same = listFlows(ws).filter((f) => f.id === '3d-web-hero');
  assert.equal(same.length, 1);
  assert.equal(same[0].scope, 'workspace');
  assert.equal(same[0].outcome, 'our own rotating hero method');
});

test('flows check: a plan must compare options, gate steps, compare to target, stop, and state its target', () => {
  const ok = { ...followable('x', today), status: 'plan', target: { description: 'like the reference, 15s, 9:16, label legible' } };
  assert.deepEqual(checkFlow(ok).errors, []);
  const one = { ...ok, candidates_considered: [ok.candidates_considered[0]] };
  assert.match(checkFlow(one).errors.join('\n'), /at least 2/);
  const ungated = { ...ok, steps: [{ id: 's1', does: 'render', kind: 'generative', compare_to_target: 'side by side' }] };
  assert.match(checkFlow(ungated).errors.join('\n'), /no gate/);
  const blind = { ...ok, steps: [{ id: 's1', does: 'render', kind: 'generative', gate: { type: 'owner' } }] };
  assert.match(checkFlow(blind).errors.join('\n'), /compare_to_target/);
  const endless = { ...ok, cost_ladder: undefined };
  assert.match(checkFlow(endless).errors.join('\n'), /cost_ladder/);
  assert.match(checkFlow({ ...ok, target: {} }).errors.join('\n'), /target\.description/);
  assert.match(checkFlow({ ...ok, steps: [{ ...ok.steps[0], skill: 'nope' }] }, { skills: ['copywriting'] }).errors.join('\n'), /unknown skill "nope"/);
  // a comma inside an unquoted YAML flow mapping silently splits a value into stray keys
  const stray = YAML.parse('{type: owner, check: continuity board, hands and faces}');
  assert.match(checkFlow({ ...ok, steps: [{ ...ok.steps[0], gate: stray }] }).errors.join('\n'), /schema/);
});

test('flows check: a plan still carrying the library target has not stated this run\'s target', () => {
  const ws = workspace();
  write(ws, followable('film-test', today));
  const kept = planFromFlow(ws, 'film-test');
  assert.match(checkFlowFile(ws, kept.file).errors.join('\n'), /library wording/);
  fs.rmSync(kept.file);
  const stated = planFromFlow(ws, 'film-test', { target: 'like the reference, 15s, 9:16, label legible' });
  assert.deepEqual(checkFlowFile(ws, stated.file).errors, []);
  assert.match(checkFlowFile(ws, path.join(ws, 'work', 'flows', 'missing.flow.yaml')).errors[0], /no such file/);
});

test('flows check: every library flow passes', () => {
  for (const f of listFlows(null)) {
    const { file, scope, age_days, stale, ...data } = f;
    assert.deepEqual(checkFlow(data).errors, [], file);
  }
});
