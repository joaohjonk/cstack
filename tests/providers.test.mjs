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
