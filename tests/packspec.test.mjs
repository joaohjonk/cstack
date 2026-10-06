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
const bar = { id: 'bar-pack', product: 'a 30 g sachet', format: 'flow-pack', front_mm: { width: 60, height: 110 }, flat_mm: { width: 140, height: 110 }, source: { kind: 'print-file', file: 'converter-final.pdf' }, approval: { status: 'locked', by: 'owner', date: '2026-10-05' } };

test('pack spec: the schema takes the real pack, and a guess is never approved', () => {
  assert.ok(validateValue('pack-spec', bar).ok, validateValue('pack-spec', bar).errors);
  assert.ok(!validateValue('pack-spec', { ...bar, front_mm: { width: 60 } }).ok);
  const w = tmpDir('cstack-pack-');
  fs.mkdirSync(path.join(w, 'brand'));
  fs.writeFileSync(path.join(w, 'brand', 'bar.pack-spec.yaml'), YAML.stringify({ ...bar, source: { kind: 'guess' } }));
  assert.equal(approvedSpecs(w).length, 0, 'a guessed size does not count');
  fs.writeFileSync(path.join(w, 'brand', 'bar.pack-spec.yaml'), YAML.stringify(bar));
  assert.equal(approvedSpecs(w).length, 1);
  assert.equal(specAspects(bar).front.toFixed(3), '1.833');
});

test('pack check: flat artwork against the print size, a picture against the front face, angled is unverifiable', () => {
  const d = tmpDir('cstack-pack-');
  const svg = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}"/>`;
  fs.writeFileSync(path.join(d, 'good.svg'), svg(140, 110));
  fs.writeFileSync(path.join(d, 'old.svg'), svg(140, 124));
  const flat = checkPack([path.join(d, 'good.svg'), path.join(d, 'old.svg')], { spec: bar });
  assert.deepEqual(flat.images.map((i) => i.result), ['pass', 'fail']);
  fs.writeFileSync(path.join(d, 'ad.png'), encodePNG({ width: 400, height: 400, data: Buffer.alloc(400 * 400 * 4, 200) }));
  assert.equal(checkPack([path.join(d, 'ad.png')], { spec: bar, box: [100, 50, 120, 220] }).ok, true, '120 x 220 px is 60 x 110');
  const tall = checkPack([path.join(d, 'ad.png')], { spec: bar, box: [100, 50, 120, 248] });
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
  assert.match(r.stdout, /FAIL .*old\.svg.*0\.886 against the spec's 0\.786 \(12\.7% off/);
});

test('pack spec-from-pdf reads the finished size; a can spec sets the can template', () => {
  const d = tmpDir('cstack-pack-');
  const pt = (mm) => (mm / 25.4) * 72;
  fs.writeFileSync(path.join(d, 'print.pdf'), `%PDF-1.4\n1 0 obj << /Type /Page /MediaBox [0 0 ${pt(160)} ${pt(130)}] /TrimBox [${pt(10)} ${pt(10)} ${pt(150)} ${pt(120)}] >> endobj\n%%EOF\n`);
  assert.deepEqual(pdfBoxes(path.join(d, 'print.pdf')).TrimBox, { width: 140, height: 110 });
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

test('pack spec: real-pack fields validate, and mismatches, changed sources and estimates are flagged for the owner', async () => {
  const { specWarnings } = await import('../scripts/lib/packspec.mjs');
  const w = tmpDir('cstack-pack-');
  fs.writeFileSync(path.join(w, 'print.pdf'), '%PDF-1.4 sample');
  const sha = (await import('node:crypto')).createHash('sha256').update(fs.readFileSync(path.join(w, 'print.pdf'))).digest('hex');
  const full = {
    ...bar,
    artwork_mm: { width: 60, height: 124 },
    film_width_mm: 140,
    repeat_mm: 100,
    panels: [{ name: 'back', width_mm: 40 }, { name: 'front', width_mm: 60, visible: true }, { name: 'back', width_mm: 40 }],
    seals: [{ where: 'top', mm: 12, style: 'serrated' }, { where: 'bottom', mm: 12, style: 'serrated' }],
    material: 'white PE film',
    contents: { what: 'the product', length_mm: { min: 100, max: 102, source: 'measured' }, height_mm: { min: 8, max: 10, source: 'pending' }, source: 'measured' },
    cartons: [{ id: 'four-box', count: 4, arrangement: '2 x 2', inner_mm: { length: 130, width: 70, height: 115 }, lid_mm: { width: 130, height: 30 }, glue_flap_mm: 12, pitch_mm: 25, faces: { front: 'pack face' }, status: 'testing', estimated: true, source: 'carton practice' }],
    source: { kind: 'print-file', file: 'print.pdf', sha256: sha },
    immutable_traits: ['seal positions'],
    forbidden_drift: ['pack drawn taller'],
  };
  const v = validateValue('pack-spec', full);
  assert.ok(v.ok, v.errors);
  const warns = specWarnings(full, { ws: w });
  assert.equal(warns.length, 3, warns.join('\n'));
  assert.match(warns[0], /60 x 124 mm, 12(\.\d)?% off .* owner decision/);
  assert.match(warns[1], /repeat 100 mm matches neither side/);
  assert.match(warns[2], /carton four-box is estimated/);
  fs.writeFileSync(path.join(w, 'print.pdf'), '%PDF-1.4 changed');
  assert.ok(specWarnings(full, { ws: w }).some((x) => /changed since the sizes were read/.test(x)));
  assert.deepEqual(specWarnings({ ...full, artwork_mismatch: 'owner: re-lay the face to 60 x 110', cartons: [], source: { kind: 'print-file' } }), [], 'a recorded owner decision clears the flag');
});

test('pack check: the band edge is strict, and a story version is made from the verified frame (F90)', async () => {
  const d = tmpDir('cstack-pack-');
  fs.writeFileSync(path.join(d, 'ad.png'), encodePNG({ width: 400, height: 400, data: Buffer.alloc(400 * 400 * 4, 200) }));
  // front 60 x 110 is h:w 1.8333; a 4% band reaches 1.9067. 100 x 190.75 is 4.05% off: shown as 4, a fail
  const edge = checkPack([path.join(d, 'ad.png')], { spec: bar, box: [0, 0, 100, 190.75] });
  assert.equal(edge.images[0].result, 'fail', edge.images[0].evidence);
  assert.equal(checkPack([path.join(d, 'ad.png')], { spec: bar, box: [0, 0, 100, 190.5] }).ok, true);
  const { extendFrame, parseAspect } = await import('../scripts/lib/image/extend.mjs');
  const px = new Uint8ClampedArray(4 * 2 * 4);
  for (let i = 0; i < 8; i++) px.set(i < 4 ? [255, 0, 0, 255] : [0, 0, 255, 255], i * 4);
  const tall = extendFrame({ width: 4, height: 2, data: px }, { aspect: '9:16', fill: '#ffffff' });
  assert.deepEqual([tall.width, tall.height, tall.box], [4, 7, [0, 3, 4, 2]]);
  assert.deepEqual([...tall.data.subarray(0, 4)], [255, 255, 255, 255], 'padding is the fill colour');
  assert.deepEqual([...tall.data.subarray(3 * 16, 3 * 16 + 4)], [255, 0, 0, 255], 'the frame is copied, untouched');
  const edgeFill = extendFrame({ width: 4, height: 2, data: px }, { aspect: '9:16' });
  assert.deepEqual([...edgeFill.data.subarray(0, 4)], [255, 0, 0, 255], 'edge fill repeats the frame edge');
  const crop = extendFrame({ width: 4, height: 2, data: px }, { aspect: '1:1', fit: 'crop' });
  assert.deepEqual([crop.width, crop.height], [2, 2]);
  assert.throws(() => parseAspect('tall'), /W:H/);
  const r = spawnSync(process.execPath, [CLI, 'image', 'extend', path.join(d, 'ad.png'), '--aspect', '9:16', '--out', path.join(d, 'story.png'), '--fill', '#000000'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /400x711\) .* nothing regenerated/);
  const meta = JSON.parse(fs.readFileSync(path.join(d, 'story.png.json'), 'utf8'));
  assert.equal(meta.method, 'pad');
  assert.match(meta.derived_from.sha256, /^[0-9a-f]{64}$/);
  assert.notEqual(spawnSync(process.execPath, [CLI, 'image', 'extend', path.join(d, 'ad.png'), '--aspect', '9:16', '--out', path.join(d, 'story.png')], { encoding: 'utf8' }).status, 0, 'refuses to overwrite without --force');
});

test('pack check: the product beside its pack is measured too (F97)', () => {
  const d = tmpDir('cstack-pack-');
  fs.writeFileSync(path.join(d, 'open.png'), encodePNG({ width: 400, height: 400, data: Buffer.alloc(400 * 400 * 4, 255) }));
  const sized = { ...bar, contents: { what: 'the bar', length_mm: { min: 88, max: 92, source: 'measured' }, width_mm: { min: 30, max: 30 }, height_mm: { min: 15, max: 18 } } };
  const pack = [20, 20, 120, 220]; // 60 x 110 at 2 px per mm
  const good = checkPack([path.join(d, 'open.png')], { spec: sized, box: pack, productBox: [200, 100, 60, 180] }).images[0];
  assert.equal(good.result, 'pass', good.evidence);
  assert.equal(good.product.measured, 0.818);
  const small = checkPack([path.join(d, 'open.png')], { spec: sized, box: pack, productBox: [200, 100, 50, 144] }).images[0];
  assert.equal(small.result, 'fail', 'a bar drawn 20% too small for its pack fails');
  assert.match(small.evidence, /product to pack/);
  const none = checkPack([path.join(d, 'open.png')], { spec: bar, box: pack, productBox: [200, 100, 60, 180] }).images[0];
  assert.equal(none.result, 'unverifiable', 'no contents size in the spec means no product check, never a pass');
  const est = checkPack([path.join(d, 'open.png')], { spec: { ...sized, contents: { ...sized.contents, estimated: true } }, box: pack, productBox: [200, 100, 60, 180] }).images[0];
  assert.equal(est.result, 'pass');
  assert.match(est.evidence, /an estimate/);
  assert.equal(checkPack([path.join(d, 'open.png')], { spec: sized, box: pack }).images[0].product, undefined, 'no product box, no product verdict');
  fs.writeFileSync(path.join(d, 'bar.pack-spec.yaml'), YAML.stringify(sized));
  const cli = spawnSync('node', [CLI, 'pack', 'check', path.join(d, 'open.png'), '--spec', path.join(d, 'bar.pack-spec.yaml'), '--box', pack.join(','), '--product-box', '200,100,50,144'], { encoding: 'utf8', cwd: d, env: { ...process.env, CSTACK_WS: d } });
  assert.equal(cli.status, 1, cli.stdout + cli.stderr);
  assert.match(cli.stdout, /FAIL/);
});
