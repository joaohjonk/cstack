import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { runMedia, listPending } from '../providers/runner.mjs';
import { mock } from '../providers/mock.mjs';
import { readLedger } from '../scripts/lib/ledger.mjs';
import { imageSize, sizeAudit } from '../scripts/lib/image.mjs';
import { mergeField, applyToBrand, staleArtifacts, fieldHash } from '../scripts/lib/brand.mjs';
import { record } from '../scripts/lib/lineage.mjs';
import { getProvider } from '../providers/index.mjs';

const ws = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cstack-prov-'));
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
