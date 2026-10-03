import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { runMedia, listPending } from '../providers/runner.mjs';
import { mock } from '../providers/mock.mjs';
import { readLedger } from '../scripts/lib/ledger.mjs';
import { imageSize, sizeAudit } from '../scripts/lib/image.mjs';
import { mergeField, applyToBrand, staleArtifacts, fieldHash } from '../scripts/lib/brand.mjs';
import { record } from '../scripts/lib/lineage.mjs';
import { getProvider } from '../providers/index.mjs';
import { tmpDir } from './tmp.mjs';

const ws = () => {
  const d = tmpDir('cstack-prov-');
  fs.writeFileSync(path.join(d, 'cstack.config.yaml'), YAML.stringify({ budget: { currency: 'USD', per_run: 5, per_day: 10 } }));
  return d;
};
const req = (prompt, extra = {}) => ({ provider: 'mock', model: 'mock-1', operation: 'generate', inputs: { prompt, params: { mock_size: [1024, 1280] } }, out_dir: 'work/out', out_prefix: 'shot', expected_size: { width: 1024, height: 1280 }, ...extra });

test('runner: generates, writes sidecar with size audit, ledger ok; identical rerun is deduplicated', async () => {
  const w = ws();
  const before = mock.calls.submit;
  const r1 = await runMedia(w, req('a glass on steel'), { poll_interval_ms: 1 });
  assert.equal(r1.row.status, 'ok');
  const out = path.join(w, r1.output_ids[0]);
  const side = JSON.parse(fs.readFileSync(`${out}.gen.json`, 'utf8'));
  assert.equal(side.size_audit.ok, true);
  const r2 = await runMedia(w, req('a glass on steel'), { poll_interval_ms: 1 });
  assert.equal(r2.deduplicated, true);
  assert.equal(mock.calls.submit - before, 1, 'provider was paid once');
});

test('runner: poll timeout leaves job pending and never resubmits; next run re-attaches', async () => {
  const w = ws();
  const before = mock.calls.submit;
  const r1 = await runMedia(w, req('slow one SLOW:50'), { poll_interval_ms: 1, poll_timeout_ms: 5 });
  assert.equal(r1.pending, true);
  assert.equal(listPending(w).length, 1);
  const r2 = await runMedia(w, req('slow one SLOW:50'), { poll_interval_ms: 1, poll_timeout_ms: 2000 });
  assert.equal(r2.row.status, 'ok');
  assert.equal(mock.calls.submit - before, 1, 'one submit across both runs');
  assert.equal(listPending(w).length, 0);
});

test('runner: unintended reframe fails the size audit', async () => {
  const w = ws();
  const r = await runMedia(w, { ...req('wide'), inputs: { prompt: 'wide', params: { mock_size: [1600, 900] } } }, { poll_interval_ms: 1 });
  const side = JSON.parse(fs.readFileSync(path.join(w, `${r.output_ids[0]}.gen.json`), 'utf8'));
  assert.equal(side.size_audit.ok, false);
  assert.match(side.size_audit.findings[0].detail, /unintended reframe/);
});

test('runner: policy failure surfaces once, no retry', async () => {
  const w = ws();
  const r = await runMedia(w, req('FAIL_POLICY please'), { poll_interval_ms: 1 });
  assert.equal(r.failed, true);
  assert.equal(readLedger(w).at(-1).status, 'failed_policy');
});

test('image: header parsing and aspect tolerance', () => {
  const d = tmpDir('cstack-img-');
  const put = (name, bytes) => (fs.writeFileSync(path.join(d, name), bytes), path.join(d, name));
  const png = Buffer.alloc(33);
  Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(png);
  png.writeUInt32BE(1080, 16);
  png.writeUInt32BE(1350, 20);
  const gif = Buffer.from('GIF89a\x40\x01\xf0\x00', 'latin1');
  const webp = Buffer.alloc(30);
  webp.write('RIFF', 0);
  webp.write('WEBPVP8X', 8);
  webp.writeUIntLE(799, 24, 3);
  webp.writeUIntLE(599, 27, 3);
  const jpeg = Buffer.from('ffd8ffe000044a46ffc0000b08012c0190030100', 'hex');
  assert.deepEqual(imageSize(put('a.png', png)), { width: 1080, height: 1350, format: 'png' });
  assert.deepEqual(imageSize(put('a.gif', gif)), { width: 320, height: 240, format: 'gif' });
  assert.deepEqual(imageSize(put('a.webp', webp)), { width: 800, height: 600, format: 'webp' });
  assert.deepEqual(imageSize(put('a.jpg', jpeg)), { width: 400, height: 300, format: 'jpeg' });
  assert.throws(() => imageSize(put('a.txt', Buffer.from('not an image'))), /unsupported/);
  assert.deepEqual(sizeAudit({ width: 1000, height: 1250 }, { aspect: '4:5' }).ok, true);
  assert.equal(sizeAudit({ width: 1000, height: 1000 }, { aspect: '4:5' }).ok, false);
});

test('providers: stubs throw honestly; unknown provider is an error', async () => {
  await assert.rejects(() => getProvider('higgsfield').submit({}), /documented stub/);
  assert.throws(() => getProvider('nope'), /unknown provider/);
});

// ---------- source precedence ----------
const f = (value, kind, approval = 'current') => ({ value, sources: [{ kind, ref: 'x' }], confidence: 'medium', approval });

test('precedence: inference never overwrites an official asset; owner instruction does', () => {
  assert.equal(mergeField('color.primary', f('#112233', 'official_asset'), f('#445566', 'model_inference')).action, 'keep');
  assert.equal(mergeField('color.primary', f('#112233', 'official_asset'), f('#445566', 'user_instruction')).action, 'set');
});

test('precedence: equal rank, different values becomes a conflict, never an average', () => {
  const r = mergeField('voice.tone', f('dry', 'extracted_pattern'), f('warm', 'extracted_pattern'));
  assert.equal(r.action, 'conflict');
  assert.equal(r.conflict.default_until_resolved, 'dry');
});

test('precedence: locked fields only change by owner instruction', () => {
  assert.equal(mergeField('naming.line', f('A', 'official_asset', 'locked'), f('B', 'approved_brand_state')).action, 'keep');
});

test('dependency invalidation: changing a brand field marks dependent artifacts stale', () => {
  const w = ws();
  fs.mkdirSync(path.join(w, 'brand'));
  fs.writeFileSync(path.join(w, 'brand', 'brand-system.json'), JSON.stringify({ schema_version: '0.1', metadata: { brand_id: 'b', name: 'B', updated: '2026-10-03' }, sections: { color: { primary: f('#112233', 'official_asset') } } }));
  const h = fieldHash(f('#112233', 'official_asset'));
  record(w, { artifact_id: 'hero', kind: 'image', intent_of_change: 'first', operation: 'generate', output_files: [], brand_refs: { 'color.primary': h } });
  assert.equal(staleArtifacts(w).length, 0);
  applyToBrand(w, 'color.primary', f('#998877', 'user_instruction'));
  assert.deepEqual(staleArtifacts(w), [{ artifact_id: 'hero', version: 1, changed: ['color.primary'] }]);
});

test('registry price: a call through a host uses only that host route price, never the maker list price (field test F12)', async () => {
  const { estimateFromRegistry, registryPrice } = await import('../providers/runner.mjs');
  const models = [{ model_id: 'img-x', provider: 'maker', est_unit_cost: { amount: 0.03, currency: 'USD', per: 'image' }, routes: [{ provider: 'host-a', endpoint_id: 'host-a/img-x', price: { amount: 0.05, currency: 'USD', per: 'image' }, source: 's', last_verified: '2026-10-03' }] }];
  assert.equal(estimateFromRegistry({ provider: 'maker', model: 'img-x' }, models).amount, 0.03);
  assert.equal(estimateFromRegistry({ provider: 'host-a', model: 'host-a/img-x', inputs: { params: { num_images: 2 } } }, models).amount, 0.1);
  assert.equal(estimateFromRegistry({ provider: 'host-a', model: 'img-x' }, models).amount, 0.05);
  assert.equal(estimateFromRegistry({ provider: 'host-b', model: 'img-x' }, models), null);
  assert.match(registryPrice({ provider: 'host-b', model: 'img-x' }, models).basis, /no host-b route/);
});

test('registry price: fal FLUX.2 routes reproduce fal\'s own examples and round up', async () => {
  const { estimateFromRegistry } = await import('../providers/runner.mjs');
  const est = (model, params = {}, images) => estimateFromRegistry({ provider: 'fal', model, inputs: { params, images } });
  const hd = { image_size: { width: 1920, height: 1080 } };
  assert.equal(est('fal-ai/flux-2-pro', { image_size: 'square_hd' }).amount, 0.03);
  assert.equal(est('fal-ai/flux-2-pro', hd).amount, 0.045);
  assert.equal(est('fal-ai/flux-2-flex', { image_size: 'square_hd' }).amount, 0.05);
  assert.equal(est('fal-ai/flux-2-flex', hd).amount, 0.1);
  assert.equal(est('fal-ai/flux-2-max', { ...hd, num_images: 2 }).amount, 0.2);
  assert.equal(est('fal-ai/flux-2/klein/4b', { width: 1500, height: 1500 }).amount, 0.015, '2.15 MP is billed as 3');
  // an input image of unknown size is counted at the 4 MP cap, and the estimate says so
  const edit = est('fal-ai/flux-2-pro', { image_size: 'square_hd' }, ['https://example.com/ref.png']);
  assert.equal(edit.amount, 0.09);
  assert.match(edit.basis, /counted at 4 MP/);
  assert.match(est('fal-ai/flux-2/klein/9b').basis, /1 MP assumed/);
  // the maker's per-megapixel list price is a heuristic, so a direct call stays unpriced
  assert.equal(estimateFromRegistry({ provider: 'black-forest-labs', model: 'flux-2-pro' }), null);
});

test('spend plan prices items from host routes and says why an item is unpriced (field test F13, F14)', async () => {
  const { planBatch } = await import('../scripts/lib/ledger.mjs');
  const { estimateFromRegistry, registryPrice } = await import('../providers/runner.mjs');
  const ws = tmpDir('cstack-f13-');
  fs.writeFileSync(path.join(ws, 'cstack.config.yaml'), 'budget:\n  currency: USD\n  per_run: 10\n  per_day: 20\n  confirm_over: 5\n');
  const price = (i) => {
    const req = { provider: i.provider, model: i.model, inputs: { params: i.params ?? {} } };
    const est = estimateFromRegistry(req);
    return est ? { est } : { reason: `${i.provider}/${i.model}: ${registryPrice(req).basis}` };
  };
  const twenty = Array.from({ length: 20 }, () => ({ provider: 'fal', model: 'fal-ai/flux-2-pro', params: { image_size: 'square_hd' } }));
  const ok = planBatch(ws, twenty, { stop_condition: 'stop after 4 failed probes', price });
  assert.equal(ok.ok, true, ok.problems.join('; '));
  assert.equal(ok.estimated_total, 0.6);
  assert.equal(ok.unpriced, 0);
  const mixed = planBatch(ws, [...twenty.slice(0, 2), { provider: 'fal', model: 'fal-ai/flux-2-pro/edit' }], { stop_condition: 'x', price });
  assert.equal(mixed.unpriced, 1);
  assert.equal(mixed.priced_total, 0.06);
  assert.equal(mixed.unpriced_booked, 10);
  assert.match(mixed.problems.join('\n'), /exceeds per_run 10 \(0\.06 priced \+ 10 booked for 1 unpriced item\(s\) at 10 each, unpriced call \(booked at per_run\): fal\/fal-ai\/flux-2-pro\/edit: not in registry/);
});

test('a dry run priced from a host route writes a ledger row the schema accepts (estimated_cost.basis)', async () => {
  const { validateValue } = await import('../scripts/lib/schemas.mjs');
  const ws = tmpDir('cstack-basis-');
  fs.writeFileSync(path.join(ws, 'cstack.config.yaml'), 'budget:\n  currency: USD\n  per_run: 1\n  per_day: 2\n  confirm_over: 1\n');
  const res = await runMedia(ws, { provider: 'fal', model: 'fal-ai/flux-2-pro', operation: 'text_to_image', inputs: { prompt: 'a plain cup on a table', params: { image_size: 'square_hd' } }, out_dir: 'work/gen', out_prefix: 'basis', dry_run: true });
  assert.equal(res.dry_run, true, JSON.stringify(res));
  const rows = readLedger(ws);
  assert.equal(rows.at(-1).estimated_cost.amount, 0.03);
  assert.match(rows.at(-1).estimated_cost.basis, /fal route fal-ai\/flux-2-pro/);
  for (const r of rows) assert.ok(validateValue('cost-ledger-entry', r).ok, JSON.stringify(validateValue('cost-ledger-entry', r).errors));
});

test('a request refused at submit books nothing; a near-miss endpoint names the ids the registry carries (findings 10, 11)', async () => {
  const { guardedCall, spent } = await import('../scripts/lib/ledger.mjs');
  const { registryPrice } = await import('../providers/runner.mjs');
  assert.match(registryPrice({ provider: 'fal', model: 'fal-ai/seedream-5-pro' }).basis, /fal routes it does carry: bytedance\/seedream\/v5\/pro\/text-to-image/);
  const ws = tmpDir('cstack-void-');
  fs.writeFileSync(path.join(ws, 'cstack.config.yaml'), 'budget:\n  currency: USD\n  per_run: 1\n  per_day: 2\n');
  const spec = (n) => ({ provider: 'fal', model: `m${n}`, operation: 'x', input_hashes: [String(n)], estimated_cost: { amount: 0.08, currency: 'USD' }, stop_condition: 'one', max_retries: 0 });
  const refused = Object.assign(new Error('fal HTTP 404: not found'), { not_submitted: true });
  const r1 = await guardedCall(ws, spec(1), async () => { throw refused; });
  assert.equal(r1.row.charged, false);
  const r2 = await guardedCall(ws, spec(2), async () => { throw new Error('fal HTTP 500: upstream'); });
  assert.equal(r2.row.charged, undefined, 'a 5xx may have run upstream: it stays booked');
  assert.equal(spent(readLedger(ws)), 0.08);
  // through the runner: a provider that answers 404 at submit leaves a void row
  const w2 = tmpDir('cstack-void-');
  fs.writeFileSync(path.join(w2, 'cstack.config.yaml'), 'budget:\n  currency: USD\n  per_run: 1\n  per_day: 2\n');
  const gone = { id: 'fal', submit: async () => { throw new Error('fal HTTP 404: Application not found'); } };
  const res = await runMedia(w2, { provider: 'fal', model: 'fal-ai/not-a-model', operation: 'text_to_image', inputs: { prompt: 'a cup' }, out_dir: 'work/gen', out_prefix: 'void', estimated_cost: { amount: 0.08, currency: 'USD' } }, { provider: gone });
  assert.equal(res.failed, true);
  assert.equal(res.row.charged, false);
  assert.equal(spent(readLedger(w2)), 0);
});
