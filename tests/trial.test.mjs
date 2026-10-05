// cstack trial: plan against a floor and cap, isolated team workspaces, resumable role sessions, blind scoring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { encodePNG } from '../scripts/lib/image/png.mjs';
import { listScenarios, planTrial, writePlan, brandFiles, runTrial, scoreTrial, importTaps, ROLES } from '../scripts/lib/trial.mjs';
import { validateValue } from '../scripts/lib/schemas.mjs';
import { tmpDir } from './tmp.mjs';

function brandWs() {
  const ws = tmpDir('cstack-trial-brand-');
  fs.writeFileSync(path.join(ws, 'cstack.config.yaml'), YAML.stringify({ brand_id: 'acme', budget: { currency: 'USD', per_run: 1, per_day: 1 } }));
  fs.mkdirSync(path.join(ws, 'brand'));
  fs.writeFileSync(path.join(ws, 'brand', 'brand-system.json'), '{}');
  fs.mkdirSync(path.join(ws, 'references'));
  fs.writeFileSync(path.join(ws, 'references', 'a.reference.yaml'), 'id: a\n');
  fs.writeFileSync(path.join(ws, 'references', '.env'), 'FAL_KEY=secret');
  fs.mkdirSync(path.join(ws, 'state'));
  fs.writeFileSync(path.join(ws, 'state', 'cost-ledger.jsonl'), '');
  fs.mkdirSync(path.join(ws, 'work'));
  fs.writeFileSync(path.join(ws, 'work', 'draft.png'), 'x');
  return ws;
}

// a fake agent: writes the file its role names; makers write one PNG per application and a manifest
const png = (v) => encodePNG({ width: 2, height: 2, data: Buffer.alloc(16, v) });
function fakeRunner(argv, { cwd, input }) {
  const role = ROLES.find((r) => input.includes(`You are the ${r.id} `));
  const out = path.join(cwd, role.writes);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (role.id === 'makers') {
    const s = YAML.parse(fs.readFileSync(path.join(cwd, 'trial', 'scenario.yaml'), 'utf8'));
    for (const a of s.applications) fs.writeFileSync(path.join(cwd, 'trial', 'out', `${a.id}.png`), png(fs.existsSync(path.join(cwd, 'brand')) ? 200 : 40));
    fs.writeFileSync(out, JSON.stringify({ applications: s.applications.map((a) => ({ id: a.id, file: `${a.id}.png` })) }));
  } else if (role.id === 'reviewer') {
    const s = YAML.parse(fs.readFileSync(path.join(cwd, 'trial', 'scenario.yaml'), 'utf8'));
    fs.writeFileSync(out, JSON.stringify({ applications: s.applications.map((a, i) => ({ id: a.id, pass: i > 0 })) }));
  } else fs.writeFileSync(out, `${role.id} notes\n`);
  return { status: 0, stdout: `${role.id} done`, stderr: '' };
}

test('trial scenarios: the library validates and names applications of known kinds', () => {
  const xs = listScenarios();
  assert.ok(xs.length >= 8);
  for (const { file, ...s } of xs) assert.ok(validateValue('scenario', s).ok, s.id);
});

test('trial plan: refuses under the floor and over the cap, and splits the cap into workspace budgets', () => {
  const ws = brandWs();
  const out = path.join(tmpDir('cstack-trial-'), 'r1');
  const base = { brand: ws, out, scenarios: ['retail-endcap', 'price-change'], teams: 2, positioning: 'a test brand' };
  const low = planTrial({ ...base, floor: 5, cap: 8 });
  assert.equal(low.ok, false);
  assert.match(low.errors.join('\n'), /under the floor of 5: spend on quality, not less \(--pictures-scale/);
  const high = planTrial({ ...base, floor: 0, cap: 0.5 });
  assert.match(high.errors.join('\n'), /over the cap of 0\.5/);
  const ok = planTrial({ ...base, floor: 0.5, cap: 2 });
  assert.equal(ok.ok, true, ok.errors.join('\n'));
  assert.deepEqual(ok.plan.teams, ['team-a', 'team-b', 'control']);
  assert.equal(ok.plan.units.length, 6);
  assert.ok(Math.abs(ok.plan.units.reduce((a, u) => a + u.budget_usd, 0) - 2) < 0.01, 'the shares add up to the cap');
  assert.ok(planTrial({ ...base, positioning: undefined, floor: 0.5, cap: 2 }).warnings.some((w) => /control team gets only the brand name/.test(w)));
  assert.equal(planTrial({ ...base, scenarios: ['nope'] }).ok, false);
  const files = brandFiles(ws);
  assert.ok(files.includes(path.join('references', 'a.reference.yaml')));
  assert.ok(!files.some((f) => /\.env|state|work/.test(f)), files.join(', '));
});

test('trial run, score, import: isolated workspaces, resumable roles, blind sheets, attribution against control', () => {
  const ws = brandWs();
  const out = path.join(tmpDir('cstack-trial-'), 'r1');
  const { plan } = planTrial({ brand: ws, out, scenarios: ['retail-endcap', 'price-change'], teams: 2, positioning: 'a test brand', floor: 0.5, cap: 2 });
  writePlan(plan);
  // a usage limit on the third session stops the run and lists what is left
  let n = 0;
  const limited = (argv, o) => (++n === 3 ? { status: 1, stdout: '', stderr: 'You have hit your usage limit' } : fakeRunner(argv, o));
  const first = runTrial(plan, { agent: ['fake'], runner: limited });
  assert.equal(first.stopped, 'usage limit');
  assert.equal(first.ran.length, 2);
  const rest = runTrial(plan, { agent: ['fake'], runner: fakeRunner });
  assert.equal(rest.stopped, null);
  assert.equal(rest.ran.length, 6 * ROLES.length - 2, 'resumed where it stopped');
  const teamWs = path.join(out, 'runs', 'team-a', 'retail-endcap');
  assert.ok(fs.existsSync(path.join(teamWs, 'brand', 'brand-system.json')));
  assert.ok(!fs.existsSync(path.join(teamWs, 'references', '.env')), 'no secrets copied');
  assert.ok(!fs.existsSync(path.join(teamWs, 'work', 'draft.png')), 'no working state copied');
  const cfg = YAML.parse(fs.readFileSync(path.join(teamWs, 'cstack.config.yaml'), 'utf8'));
  assert.equal(cfg.budget.per_run, plan.units.find((u) => u.id === 'team-a/retail-endcap').budget_usd);
  const ctl = path.join(out, 'runs', 'control', 'retail-endcap');
  assert.ok(!fs.existsSync(path.join(ctl, 'brand')));
  assert.match(fs.readFileSync(path.join(ctl, 'trial', 'brand.md'), 'utf8'), /a test brand/);
  assert.ok(fs.existsSync(path.join(teamWs, 'trial', 'transcripts', 'makers.txt')));
  const s = scoreTrial(plan, { seed: 7 });
  assert.equal(s.count, 18);
  assert.equal(s.pair_count, 2);
  const html = fs.readFileSync(s.attribution, 'utf8');
  assert.doesNotMatch(html, /team-|control|retail-endcap/, 'the sheet shows codes only');
  assert.throws(() => scoreTrial(plan), /key\.json exists/);
  const key = JSON.parse(fs.readFileSync(path.join(s.dir, 'key.json'), 'utf8'));
  // the owner says yes to every brand piece and to one control piece; same brand on one pair of two
  const ctlCodes = key.items.filter((i) => i.control).map((i) => i.code);
  const taps = key.items.map((i) => ({ code: i.code, answer: !i.control || i.code === ctlCodes[0] ? 'yes' : 'no' }));
  const tf = path.join(out, 'a.taps.json');
  fs.writeFileSync(tf, JSON.stringify({ sheet: 'x', kind: 'attribution', taps }));
  const pf = path.join(out, 'p.taps.json');
  fs.writeFileSync(pf, JSON.stringify({ sheet: 'y', kind: 'pairs', taps: [{ code: 'P01', answer: 'yes' }, { code: 'P02', answer: 'no' }] }));
  const r = importTaps(plan, [tf, pf]);
  assert.deepEqual([r.attribution.brand.yes, r.attribution.brand.tapped, r.attribution.control.yes, r.attribution.control.tapped], [12, 12, 1, 6]);
  assert.equal(r.attribution.lift, 5.88);
  assert.deepEqual([r.pairs.same, r.pairs.tapped], [1, 2]);
  assert.deepEqual([r.reviewer_pass.passed, r.reviewer_pass.judged], [8, 12]);
  assert.equal(r.attribution.reviewer_agreement.agree, 8, 'the reviewer failed 4 pieces the owner attributed');
  assert.match(fs.readFileSync(r.report, 'utf8'), /attributed \*\*12 of 12\*\* brand-team pieces/);
  fs.writeFileSync(tf, JSON.stringify({ kind: 'attribution', taps: [{ code: 'T999', answer: 'yes' }] }));
  assert.throws(() => importTaps(plan, [tf]), /codes this trial's key does not have/);
});
