// assets/official/ holds the owner's originals: nothing cstack writes may overwrite them or land beside them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { writeAtomic, appendJSONL, isOfficial } from '../scripts/lib/core.mjs';
import { initBrand } from '../scripts/lib/brand.mjs';
import { record } from '../scripts/lib/lineage.mjs';
import { outputTarget } from '../providers/runner.mjs';
import { guardOutputs } from '../scripts/lib/video/ffmpeg.mjs';
import { prepareOut, writeFiles } from '../scripts/lib/svg/reduce.mjs';
import { regionPaste } from '../providers/local/region_paste.mjs';
import { tmpDir } from './tmp.mjs';

const REFUSED = /assets\/official\/ holds the owner's originals/;

function workspace() {
  const ws = path.join(tmpDir(), 'brand');
  initBrand(ws, { name: 'Test Brand' });
  const logo = path.join(ws, 'assets', 'official', 'logo.svg');
  fs.writeFileSync(logo, '<svg/>');
  return { ws, logo };
}

test('init creates assets/official/ with only its .keep, and a second init keeps it', () => {
  const { ws } = workspace();
  assert.deepEqual(fs.readdirSync(path.join(ws, 'assets', 'official')).sort(), ['.keep', 'logo.svg']);
  assert.match(initBrand(ws, { name: 'Test Brand' }), /already a workspace/);
  assert.equal(fs.readFileSync(path.join(ws, 'assets', 'official', 'logo.svg'), 'utf8'), '<svg/>');
});

test('core writes refuse an official original and any new file beside it', () => {
  const { ws, logo } = workspace();
  assert.throws(() => writeAtomic(logo, 'summary'), REFUSED);
  assert.throws(() => writeAtomic(path.join(ws, 'assets', 'official', 'logo-summary.md'), '# summary'), REFUSED);
  assert.throws(() => writeAtomic(path.join(ws, 'assets', 'official', 'sub', 'notes.md'), 'x'), REFUSED);
  assert.throws(() => appendJSONL(path.join(ws, 'assets', 'official', 'log.jsonl'), { a: 1 }), REFUSED);
  assert.equal(fs.readFileSync(logo, 'utf8'), '<svg/>');
  // neighbours that only share a prefix are fine
  writeAtomic(path.join(ws, 'assets', 'official-notes', 'a.md'), 'ok');
  writeAtomic(path.join(ws, 'work', 'summary.md'), 'ok');
});

test('a symlink pointing into assets/official/ is refused too', () => {
  const { ws, logo } = workspace();
  const link = path.join(ws, 'work', 'masters');
  fs.symlinkSync(path.join(ws, 'assets', 'official'), link);
  assert.ok(isOfficial(path.join(link, 'logo.svg')));
  assert.throws(() => writeAtomic(path.join(link, 'logo.svg'), 'x'), REFUSED);
  assert.equal(fs.readFileSync(logo, 'utf8'), '<svg/>');
});

test('lineage records an official file without writing a sidecar beside it', () => {
  const { ws } = workspace();
  const rec = record(ws, { artifact_id: 'logo', kind: 'other', intent_of_change: 'record the owner master', operation: 'human_edit', output_files: ['assets/official/logo.svg'] });
  assert.ok(rec.output_files[0].sha256);
  assert.ok(!fs.existsSync(path.join(ws, 'assets', 'official', 'logo.svg.lineage.json')));
  assert.equal(fs.readFileSync(path.join(ws, 'state', 'lineage.jsonl'), 'utf8').trim().split('\n').length, 1);
});

test('generation, video, svg and paste outputs refuse assets/official/, with --force too', async () => {
  const { ws, logo } = workspace();
  assert.throws(() => outputTarget(ws, { out_dir: 'assets/official' }, 'abcdef0123456789'), REFUSED);
  assert.throws(() => outputTarget(ws, { out_dir: 'assets/official/renders' }, 'abcdef0123456789'), REFUSED);
  assert.equal(outputTarget(ws, {}, 'abcdef0123456789').outDir, path.join(path.resolve(ws), 'work', 'out'));
  assert.throws(() => guardOutputs([path.join(ws, 'assets', 'official', 'cut.mp4')], [], { force: true }), REFUSED);
  assert.throws(() => prepareOut(path.join(ws, 'assets', 'official'), true), REFUSED);
  assert.throws(() => writeFiles(path.join(ws, 'assets', 'official', 'kit'), [['a.svg', Buffer.from('<svg/>')]]), REFUSED);
  await assert.rejects(regionPaste({ base: logo, patch: logo, x: 0, y: 0, out: path.join(ws, 'assets', 'official', 'pasted.png'), force: true }), REFUSED);
  assert.equal(fs.readFileSync(logo, 'utf8'), '<svg/>');
});
