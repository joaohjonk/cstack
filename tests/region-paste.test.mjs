// Local region paste (providers/local/region_paste.mjs). Pure-Node PNG tests always run; the Chromium engine
// test (JPEG output) skips with a reason when playwright-core or Chromium is unavailable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { regionPaste, decodePNG, encodePNG, parseRegion } from '../providers/local/region_paste.mjs';
import { imageSize } from '../scripts/lib/image.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cstack-paste-'));
const solid = (w, h, rgba) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(rgba, i * 4);
  return encodePNG({ width: w, height: h, data });
};
const px = (img, x, y) => Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

function fixture() {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'base.png'), solid(64, 48, [200, 10, 10, 255]));
  fs.writeFileSync(path.join(d, 'patch.png'), solid(20, 20, [10, 10, 200, 255]));
  return d;
}

test('png codec round-trips pixels', () => {
  const data = new Uint8ClampedArray(3 * 2 * 4).map((_, i) => (i * 37) % 256);
  const back = decodePNG(encodePNG({ width: 3, height: 2, data }));
  assert.equal(back.width, 3);
  assert.deepEqual(Array.from(back.data), Array.from(data));
});

test('paste (node engine): feathered edge, solid centre, outside region untouched, inputs untouched', async () => {
  const d = fixture();
  const before = [sha(path.join(d, 'base.png')), sha(path.join(d, 'patch.png'))];
  const res = await regionPaste({ base: path.join(d, 'base.png'), patch: path.join(d, 'patch.png'), x: 10, y: 10, feather: 6, out: path.join(d, 'out.png') });
  assert.equal(res.engine.name, 'node');
  assert.deepEqual(res.changed_box, { x: 10, y: 10, w: 20, h: 20 });
  assert.deepEqual([sha(path.join(d, 'base.png')), sha(path.join(d, 'patch.png'))], before);
  const out = decodePNG(fs.readFileSync(res.out));
  assert.deepEqual([out.width, out.height], [64, 48]);
  assert.deepEqual(px(out, 20, 20), [10, 10, 200, 255]); // centre fully patch
  assert.deepEqual(px(out, 5, 5), [200, 10, 10, 255]); // outside untouched
  assert.deepEqual(px(out, 40, 30), [200, 10, 10, 255]);
  const edge = px(out, 10, 20); // first patch column: mostly base
  assert.ok(edge[0] > 150 && edge[2] < 60, `edge ${edge}`);
  const mid = px(out, 12, 20); // inside the feather: a blend
  assert.ok(mid[0] < edge[0] && mid[2] > edge[2], `mid ${mid}`);
  // outside-region diff is exactly zero
  const base = decodePNG(fs.readFileSync(path.join(d, 'base.png')));
  for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) if (x < 10 || x >= 30 || y < 10 || y >= 30) assert.deepEqual(px(out, x, y), px(base, x, y));
});

test('paste: region crop, hard edge, clipping at the base border', async () => {
  const d = fixture();
  const res = await regionPaste({ base: path.join(d, 'base.png'), patch: path.join(d, 'patch.png'), region: '0,0,8,8', x: 60, y: -2, feather: 0, out: path.join(d, 'o.png') });
  assert.deepEqual(res.changed_box, { x: 60, y: 0, w: 4, h: 6 });
  const out = decodePNG(fs.readFileSync(res.out));
  assert.deepEqual(px(out, 60, 0), [10, 10, 200, 255]);
  assert.deepEqual(px(out, 59, 0), [200, 10, 10, 255]);
  assert.throws(() => parseRegion('1,2,3'), /bad --region/);
});

test('paste: never overwrites inputs; existing output needs force', async () => {
  const d = fixture();
  const base = path.join(d, 'base.png');
  const patch = path.join(d, 'patch.png');
  await assert.rejects(regionPaste({ base, patch, x: 0, y: 0, out: base, force: true }), /overwrite an input/);
  await assert.rejects(regionPaste({ base, patch, x: 0, y: 0, out: path.join(d, '.', 'patch.png') }), /overwrite an input/);
  fs.writeFileSync(path.join(d, 'prev.png'), 'x');
  await assert.rejects(regionPaste({ base, patch, x: 0, y: 0, out: path.join(d, 'prev.png') }), /output exists/);
  await regionPaste({ base, patch, x: 0, y: 0, out: path.join(d, 'prev.png'), force: true });
  await assert.rejects(regionPaste({ base, patch, x: 1.5, y: 0, out: path.join(d, 'z.png') }), /integers/);
});

test('cli: cstack edit paste writes a new file the size of the base', () => {
  const d = fixture();
  const out = execFileSync(process.execPath, [path.join(ROOT, 'bin', 'cstack.mjs'), 'edit', 'paste', '--base', path.join(d, 'base.png'), '--patch', path.join(d, 'patch.png'), '--x', '4', '--y', '4', '--feather', '2', '--out', path.join(d, 'c.png')], { encoding: 'utf8' });
  assert.match(out, /wrote .*c\.png 64x48 \(engine node/);
  assert.deepEqual(imageSize(path.join(d, 'c.png')), { width: 64, height: 48, format: 'png' });
});

let chromium = null;
try {
  const { loadEngine, launch } = await import('../scripts/lib/browser/launch.mjs');
  const b = await launch(await loadEngine());
  await b.close();
  chromium = true;
} catch (e) {
  chromium = e.message.split('\n')[0];
}

test('paste (chromium engine): JPEG output via canvas', { skip: chromium === true ? false : `Chromium unavailable: ${chromium}` }, async () => {
  const d = fixture();
  const res = await regionPaste({ base: path.join(d, 'base.png'), patch: path.join(d, 'patch.png'), x: 10, y: 10, feather: 4, out: path.join(d, 'out.jpg') });
  assert.equal(res.engine.name, 'chromium');
  assert.deepEqual(imageSize(res.out), { width: 64, height: 48, format: 'jpeg' });
  const forced = await regionPaste({ base: path.join(d, 'base.png'), patch: path.join(d, 'patch.png'), x: 10, y: 10, feather: 4, out: path.join(d, 'out2.png'), engine: 'chromium' });
  const out = decodePNG(fs.readFileSync(forced.out));
  assert.deepEqual(px(out, 20, 20), [10, 10, 200, 255]);
  assert.deepEqual(px(out, 2, 2), [200, 10, 10, 255]);
});
