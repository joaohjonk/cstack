// Regression tests for v0.1 bugs found while writing docs and the example brand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { runMedia } from '../providers/runner.mjs';
import { mock } from '../providers/mock.mjs';
import { readLedger } from '../scripts/lib/ledger.mjs';
import { initBrand, applyToBrand, resolveConflict, brandContext } from '../scripts/lib/brand.mjs';
import { schemaFor } from '../scripts/lib/schemas.mjs';
import { ROOT } from '../scripts/lib/core.mjs';
import { tmpDir } from './tmp.mjs';

const ws = (budget = { currency: 'USD', per_run: 1, per_day: 1, confirm_over: 1 }) => {
  const d = tmpDir('cstack-reg-');
  fs.writeFileSync(path.join(d, 'cstack.config.yaml'), YAML.stringify({ brand_id: 'reg', budget }));
  return d;
};
const req = (prompt, extra = {}) => ({ provider: 'mock', model: 'mock-1', operation: 'generate', inputs: { prompt, params: { mock_size: [64, 64] } }, out_dir: 'work/out', out_prefix: 'r', ...extra });

test('dry_run on the request never calls the provider', async () => {
  const w = ws();
  const before = mock.calls.submit;
  const r = await runMedia(w, req('a', { dry_run: true }), { poll_interval_ms: 1 });
  assert.ok(r.dry_run);
  assert.equal(mock.calls.submit, before);
  assert.equal(readLedger(w).at(-1).status, 'dry_run');
});

test('different prompts are different calls (prompt is in the idempotency key)', async () => {
  const w = ws();
  const a = await runMedia(w, req('first prompt'), { poll_interval_ms: 1 });
  const b = await runMedia(w, req('second prompt'), { poll_interval_ms: 1 });
  assert.ok(!b.deduplicated);
  assert.notEqual(a.row.idempotency_key, b.row.idempotency_key);
});

test('an unpriced call is blocked unless confirmed or allowed', async () => {
  const w = ws();
  const unpriced = { ...req('u'), estimated_cost: undefined };
  const orig = mock.estimate;
  mock.estimate = () => null;
  try {
    const blocked = await runMedia(w, unpriced, { poll_interval_ms: 1 });
    assert.ok(blocked.blocked, 'blocked without an estimate');
    const ok = await runMedia(w, { ...unpriced, confirm_unpriced: true }, { poll_interval_ms: 1 });
    assert.ok(!ok.blocked);
  } finally {
    mock.estimate = orig;
  }
});

const brandWs = () => {
  const d = tmpDir('cstack-brand-');
  initBrand(path.join(d, 'b'), { name: 'Reg', id: 'reg' });
  return path.join(d, 'b');
};
const field = (value, kind, ref = 'r') => ({ value, sources: [{ kind, ref }], confidence: 'high', approval: 'current' });

test('a newer owner instruction replaces an older one and keeps history', () => {
  const b = brandWs();
  applyToBrand(b, 'voice.tone', field('plain', 'user_instruction', 'a'));
  const r = applyToBrand(b, 'voice.tone', field('warm', 'user_instruction', 'b'));
  assert.equal(r.action, 'set');
  assert.equal(r.field.history.length, 1);
});

test('conflicts: no duplicates, unique ids, kept out of facts, resolvable', () => {
  const b = brandWs();
  applyToBrand(b, 'color.accent', field('#111111', 'official_asset', 'spec-a'));
  const c1 = applyToBrand(b, 'color.accent', field('#222222', 'official_asset', 'spec-b'));
  assert.equal(c1.action, 'conflict');
  const again = applyToBrand(b, 'color.accent', field('#222222', 'official_asset', 'spec-b'));
  assert.equal(again.action, 'keep', 'same disagreement is not recorded twice');
  const c2 = applyToBrand(b, 'color.accent', field('#333333', 'official_asset', 'spec-c'));
  assert.notEqual(c2.conflict.id, c1.conflict.id);
  const ctx = brandContext(b, { sections: ['color', 'voice'] });
  assert.equal(ctx.facts.color?.accent, undefined);
  assert.ok(ctx.not_facts.some((x) => x.startsWith('color.accent: conflict')));
  assert.ok(ctx.not_facts.some((x) => x.startsWith('voice: empty')), 'empty sections are reported');
  resolveConflict(b, c1.conflict.id, { pick: 2, by: 'owner' });
  assert.throws(() => resolveConflict(b, c2.conflict.id, { pick: 1 }), /superseded/);
  assert.equal(brandContext(b, { sections: ['color'] }).facts.color.accent, '#222222');
});

test('nested workspaces and experiment runs are schema-governed', () => {
  assert.equal(schemaFor(path.join(ROOT, 'examples/x/brand/brand-system.json')), 'brand-system');
  assert.equal(schemaFor(path.join(ROOT, 'templates/brand-workspace/brand/brand-system.json')), null);
  assert.equal(schemaFor(path.join(ROOT, 'examples/x/experiments/runs/e1/experiment-run.yaml')), 'experiment-run');
});

test('F29: prompt compile refuses a recipe that brand check would reject', async () => {
  const { spawnSync } = await import('node:child_process');
  const { tmpDir } = await import('./tmp.mjs');
  const fsm = (await import('node:fs')).default;
  const p = (await import('node:path')).default;
  const { ROOT } = await import('../scripts/lib/core.mjs');
  const d = tmpDir('cstack-f29-');
  const ok = { id: 'r1', version: 1, task: 'text_to_image', template: 'A cup of {tea}.', slots: { tea: { required: true } }, values: { tea: 'green tea' } };
  const run = (recipe) => {
    const f = p.join(d, 'r.prompt-recipe.json');
    fsm.writeFileSync(f, JSON.stringify(recipe));
    return spawnSync(process.execPath, [p.join(ROOT, 'bin', 'cstack.mjs'), 'prompt', 'compile', f], { encoding: 'utf8' });
  };
  const good = run(ok);
  assert.equal(good.status, 0, good.stdout + good.stderr);
  const bad = run({ ...ok, mood: 'extra field' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /\[prompt-recipe schema\].*mood/);
});

test('F28: the founder brief holds the product and the founder stance on it', async () => {
  const { validateValue } = await import('../scripts/lib/schemas.mjs');
  const brief = { id: 'FB-1', brand_id: 'x', date: '2026-10-05', why_it_exists: { reason: 'r' }, customer: { who: 'w', evidence: 'told' }, product: { what: 'canned iced tea', stance: ['no added sugar'], functional: ['adaptogens'], range: ['three flavours, 330 ml'], never: ['artificial sweeteners'] }, brand_as_person: {}, assets_and_inspirations: {}, owner_approval: { status: 'draft' } };
  assert.ok(validateValue('founder-brief', brief).ok, validateValue('founder-brief', brief).errors);
  assert.equal(validateValue('founder-brief', { ...brief, product: { flavour: 'x' } }).ok, false);
});

test('F32: brand init creates references/inspiration/ for the inspiration library', () => {
  const ws = path.join(tmpDir('cstack-f32-'), 'ws');
  initBrand(ws, { name: 'Inspo Test' });
  for (const lib of ['gold', 'anti', 'inspiration']) assert.ok(fs.statSync(path.join(ws, 'references', lib)).isDirectory(), lib);
});

test('F37: an approved founder brief re-gates after an edit or a reopen until it is approved again', async () => {
  const { approveBrief, reopenBrief, briefApproved } = await import('../scripts/lib/brief.mjs');
  const file = path.join(tmpDir('cstack-f37-'), 'founding.founder-brief.yaml');
  const brief = { id: 'FB-1', brand_id: 'x', date: '2026-10-05', why_it_exists: { reason: 'tea you can carry' }, customer: { who: 'w', evidence: 'told' }, brand_as_person: {}, assets_and_inspirations: {}, owner_approval: { status: 'draft' } };
  fs.writeFileSync(file, '# founder brief\n' + YAML.stringify(brief));
  const read = () => YAML.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(briefApproved(read()), false);
  approveBrief(file, { by: 'Founder', date: '2026-10-05' });
  assert.equal(briefApproved(read()), true);
  assert.match(fs.readFileSync(file, 'utf8'), /^# founder brief/, 'comments survive');
  // the pivot written into the brief: the fingerprint no longer matches
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('tea you can carry', 'a healthier soda'));
  assert.equal(briefApproved(read()), false);
  approveBrief(file, { by: 'Founder' });
  assert.equal(briefApproved(read()), true);
  // the pivot said only in conversation: reopen
  reopenBrief(file, { reason: 'founder pivoted to a mass-market soda', date: '2026-10-06' });
  const b = read();
  assert.equal(briefApproved(b), false);
  assert.equal(b.owner_approval.status, 'reopened');
  assert.deepEqual(b.amendments.map((a) => [a.reason, a.previous.status]), [['founder pivoted to a mass-market soda', 'owner_approved']]);
  assert.throws(() => reopenBrief(file, {}), /--reason/);
  assert.throws(() => approveBrief(file, {}), /--by/);
});

test('F39: the founder brief holds price position, the anchor brand, trend horizon, cohorts and round conflicts', async () => {
  const { validateValue } = await import('../scripts/lib/schemas.mjs');
  const brief = { id: 'FB-1', brand_id: 'x', date: '2026-10-05', interview: { rounds: 3, conflicts: [{ about: 'price', earlier: 'round 1: premium niche', later: 'round 3: mass hype at a premium price', kept: 'later' }] }, why_it_exists: { reason: 'r' }, customer: { who: 'w', evidence: 'told', cohorts: ['Gen Z, 16 to 24'] }, market: { price_position: 'masstige', price_note: 'mass hype at a premium price', anchor: 'a healthier version of a mass iced tea', trend_horizon: 'flavours rotate each season; the brand holds for years' }, brand_as_person: {}, assets_and_inspirations: {}, owner_approval: { status: 'draft' } };
  assert.ok(validateValue('founder-brief', brief).ok, validateValue('founder-brief', brief).errors);
  assert.equal(validateValue('founder-brief', { ...brief, market: { price_position: 'cheap' } }).ok, false);
});
