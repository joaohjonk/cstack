// F86: cstack never invents packaging sizes. The pack spec is a file, the make gate needs it, renders are measured.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { ROOT } from '../scripts/lib/core.mjs';
import { encodePNG } from '../scripts/lib/image/png.mjs';
import { checkPack, pdfBoxes, approvedSpecs, specAspects } from '../scripts/lib/packspec.mjs';
import { sizeFromSpec, wrapSize } from '../scripts/lib/mockup/can.mjs';
import { planFromFlow } from '../scripts/lib/flows.mjs';
import { validateValue } from '../scripts/lib/schemas.mjs';
import { tmpDir } from './tmp.mjs';

const CLI = path.join(ROOT, 'bin', 'cstack.mjs');
const bar = { id: 'bar-pack', product: 'a 40 g bar', format: 'flow-pack', front_mm: { width: 70, height: 85 }, flat_mm: { width: 170, height: 85 }, source: { kind: 'print-file', file: 'converter-final.pdf' }, approval: { status: 'locked', by: 'owner', date: '2026-10-05' } };

test('pack spec: the schema takes the real pack, and a guess is never approved', () => {
  assert.ok(validateValue('pack-spec', bar).ok, validateValue('pack-spec', bar).errors);
  assert.ok(!validateValue('pack-spec', { ...bar, front_mm: { width: 70 } }).ok);
  const w = tmpDir('cstack-pack-');
  fs.mkdirSync(path.join(w, 'brand'));
  fs.writeFileSync(path.join(w, 'brand', 'bar.pack-spec.yaml'), YAML.stringify({ ...bar, source: { kind: 'guess' } }));
  assert.equal(approvedSpecs(w).length, 0, 'a guessed size does not count');
  fs.writeFileSync(path.join(w, 'brand', 'bar.pack-spec.yaml'), YAML.stringify(bar));
  assert.equal(approvedSpecs(w).length, 1);
  assert.equal(specAspects(bar).front.toFixed(3), '1.214');
});

test('pack check: flat artwork against the print size, a picture against the front face, angled is unverifiable', () => {
  const d = tmpDir('cstack-pack-');
  const svg = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}"/>`;
  fs.writeFileSync(path.join(d, 'good.svg'), svg(170, 85));
  fs.writeFileSync(path.join(d, 'old.svg'), svg(170, 96));
  const flat = checkPack([path.join(d, 'good.svg'), path.join(d, 'old.svg')], { spec: bar });
  assert.deepEqual(flat.images.map((i) => i.result), ['pass', 'fail']);
  fs.writeFileSync(path.join(d, 'ad.png'), encodePNG({ width: 400, height: 400, data: Buffer.alloc(400 * 400 * 4, 200) }));
  assert.equal(checkPack([path.join(d, 'ad.png')], { spec: bar, box: [100, 50, 140, 170] }).ok, true, '140 x 170 px is 70 x 85');
  const tall = checkPack([path.join(d, 'ad.png')], { spec: bar, box: [100, 50, 140, 192] });
  assert.equal(tall.images[0].result, 'fail');
  assert.equal(Math.round(tall.images[0].off_pct), 13);
  assert.throws(() => checkPack([path.join(d, 'ad.png')], { spec: bar }), /MISSING: a picture needs the pack's box/);
  const judge = path.join(d, 'judge.sh');
  fs.writeFileSync(judge, `#!/bin/sh\ncat >/dev/null\necho '{"view": "angled", "box": [1, 1, 10, 10]}'\n`);
  fs.chmodSync(judge, 0o755);
  assert.equal(checkPack([path.join(d, 'ad.png')], { spec: bar, judge: [judge] }).images[0].result, 'unverifiable');
  // the CLI exits 1 on an off-spec render and names the numbers
  fs.writeFileSync(path.join(d, 'bar.pack-spec.yaml'), YAML.stringify(bar));
  const r = spawnSync(process.execPath, [CLI, 'pack', 'check', path.join(d, 'old.svg'), '--spec', path.join(d, 'bar.pack-spec.yaml')], { encoding: 'utf8' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FAIL .*old\.svg.*0\.565 against the spec's 0\.5 \(12\.9% off/);
});

test('pack spec-from-pdf reads the finished size; a can spec sets the can template', () => {
  const d = tmpDir('cstack-pack-');
  const pt = (mm) => (mm / 25.4) * 72;
  fs.writeFileSync(path.join(d, 'print.pdf'), `%PDF-1.4\n1 0 obj << /Type /Page /MediaBox [0 0 ${pt(190)} ${pt(105)}] /TrimBox [${pt(10)} ${pt(10)} ${pt(180)} ${pt(95)}] >> endobj\n%%EOF\n`);
  assert.deepEqual(pdfBoxes(path.join(d, 'print.pdf')).TrimBox, { width: 170, height: 85 });
  const can = { id: 'tall-can', product: '473 ml', format: 'can', front_mm: { width: 66, height: 134 }, diameter_mm: 66, height_mm: 157, flat_mm: { width: 207.3, height: 134 }, source: { kind: 'converter-spec' }, approval: { status: 'current' } };
  assert.deepEqual(wrapSize(sizeFromSpec(can)).mm, { w: 207.3, h: 134 });
  assert.throws(() => sizeFromSpec(bar), /not a can/);
});

test('flows gate: a pack render without an approved pack spec stops at make (F86)', async () => {
  const { gateFlow } = await import('../scripts/lib/flows.mjs');
  const w = tmpDir('cstack-f86-');
  const fal = [{ id: 'fal', kind: 'media', available: true, missing_env: [] }];
  const opts = { stage: 'make', providers: fal, budget: { per_run: 2, per_day: 5 } };
  const { file } = planFromFlow(w, 'brand-hero-photo', { target: 'an ad frame with the bar pack held in a hand' });
  assert.match(gateFlow(w, file, opts).errors.join('\n'), /no approved pack spec.*never invents packaging sizes/);
  const w2 = tmpDir('cstack-f86-');
  const photo = planFromFlow(w2, 'brand-hero-photo', { target: 'a hero photo of a kitchen at dawn for the home page' });
  assert.doesNotMatch(gateFlow(w2, photo.file, opts).errors.join('\n'), /pack spec/);
  fs.mkdirSync(path.join(w, 'brand'), { recursive: true });
  fs.writeFileSync(path.join(w, 'brand', 'bar.pack-spec.yaml'), YAML.stringify(bar));
  assert.doesNotMatch(gateFlow(w, file, opts).errors.join('\n'), /pack spec/);
});
