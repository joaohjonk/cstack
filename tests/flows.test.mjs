import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { listFlows, searchFlows, planFromFlow } from '../scripts/lib/flows.mjs';
import { validateValue } from '../scripts/lib/schemas.mjs';

const flow = (id, outcome, last_verified, extra = {}) => ({
  id, outcome, status: 'researched', last_verified, stale_after_days: 30,
  steps: [{ id: 's1', does: 'probe', kind: 'probe', gate: { type: 'owner' }, compare_to_target: 'side by side with the reference' }],
  evidence: [{ ref: 'https://example.com/doc', kind: 'documented', date: last_verified }], ...extra,
});

test('flows: search, workspace override, staleness, plan', () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'cstack-flows-'));
  fs.mkdirSync(path.join(ws, 'flows'));
  const today = new Date().toISOString().slice(0, 10);
  const f1 = flow('rotating-hero-test', 'rotating 3d product hero on a web page', '2020-01-01', { aliases: ['turntable'] });
  const f2 = flow('film-test', 'short product film', today);
  for (const f of [f1, f2]) {
    assert.ok(validateValue('flow', f).ok, validateValue('flow', f).errors);
    fs.writeFileSync(path.join(ws, 'flows', `${f.id}.flow.yaml`), YAML.stringify(f));
  }
  const all = listFlows(ws).filter((f) => f.scope === 'workspace');
  assert.equal(all.find((f) => f.id === 'rotating-hero-test').stale, true);
  assert.equal(all.find((f) => f.id === 'film-test').stale, false);
  assert.equal(searchFlows(ws, 'make the product rotate in 3d on the homepage')[0].flow.id, 'rotating-hero-test');
  const r = planFromFlow(ws, 'film-test', { target: 'like the reference, 15s, 9:16' });
  const plan = YAML.parse(fs.readFileSync(r.file, 'utf8'));
  assert.equal(plan.status, 'plan');
  assert.equal(plan.target.description, 'like the reference, 15s, 9:16');
  assert.ok(validateValue('flow', plan).ok);
  assert.throws(() => planFromFlow(ws, 'film-test'), /already exists/);
});
