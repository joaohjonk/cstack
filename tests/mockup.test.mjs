// Mockup engine (scripts/lib/mockup/). Images are synthesized here and kept small; the Chromium tests (SVG and JPEG art)
// skip with a reason when playwright-core or Chromium is unavailable. The MISSING path always runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from '../scripts/lib/image/png.mjs';
import * as paste from '../providers/local/region_paste.mjs';
import { quadMapper, cylinderMapper, meshMapper, fitRect } from '../scripts/lib/mockup/geometry.mjs';
import { renderMockup } from '../scripts/lib/mockup/render.mjs';
import { verifyMockup, compareGrids, judge, THRESHOLDS } from '../scripts/lib/mockup/verify.mjs';
import { runMockup } from '../scripts/lib/mockup/cli.mjs';
import { tmpDir } from './tmp.mjs';

// Probe Chromium once, before any test is registered (a test that points CSTACK_CHROMIUM at a missing path must not
// run first); while it is open, make a JPEG fixture with canvas (cstack has no JPEG encoder).
let chromium = null, jpeg = null;
try {
  const { loadEngine, launch } = await import('../scripts/lib/browser/launch.mjs');
  const b = await launch(await loadEngine());
  try {
    const page = await (await b.newContext()).newPage();
    const url = await page.evaluate(() => {
      const c = document.createElement('canvas');
      ((c.width = 64), (c.height = 48));
      const g = c.getContext('2d');
      ((g.fillStyle = '#f4efe2'), g.fillRect(0, 0, 64, 48), (g.fillStyle = '#c03030'), g.fillRect(0, 0, 64, 14), (g.fillStyle = '#203070'), g.fillRect(8, 22, 20, 16));
      return c.toDataURL('image/jpeg', 0.92);
    });
    jpeg = Buffer.from(url.split(',')[1], 'base64');
  } finally {
    await b.close();
  }
  chromium = true;
} catch (e) {
  chromium = e.message.split('\n')[0];
}

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'mockup', 'poster-wall');
const tmp = () => tmpDir('cstack-mockup-');
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const read = (f) => decodePNG(fs.readFileSync(f));
const write = (f, im) => fs.writeFileSync(f, encodePNG(im));
const px = (im, x, y) => Array.from(im.data.subarray((y * im.width + x) * 4, (y * im.width + x) * 4 + 4));
function image(w, h, f) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(f(x, y), (y * w + x) * 4);
  return { width: w, height: h, data };
}
// label art: checker border, a red band and rows of pseudo-glyphs (deterministic)
function labelArt(w, h) {
  let seed = 7;
  const on = Array.from({ length: 400 }, () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff > 0.45);
  return image(w, h, (x, y) => {
    if (x < 3 || y < 3 || x >= w - 3 || y >= h - 3) return ((x >> 1) + (y >> 1)) & 1 ? [20, 20, 20, 255] : [240, 240, 240, 255];
    if (y < h * 0.3) return [200, 40, 40, 255];
    const cw = Math.max(3, Math.round(w / 20)), ch = Math.max(4, Math.round(h / 10)), yy = y - Math.ceil(h * 0.3);
    return yy % ch < ch * 0.7 && (x - 3) % cw < cw * 0.75 && on[(Math.floor(yy / ch) * 37 + Math.floor((x - 3) / cw) * 11) % 400] ? [30, 30, 90, 255] : [250, 245, 230, 255];
  });
}
const wall = (w, h) => image(w, h, (x, y) => [150 + 40 * Math.sin(x / 17), 140 + 30 * Math.cos(y / 23), 128 + (y / h) * 30, 255]);
const LICENCE = { source: 'synthetic test pixels', terms: 'CC0-1.0', client_use_allowed: true };

/** A template dir with a 120x90 wall base; extra layers are written from {name: image}. */
function makeTemplate(placements, { licence = LICENCE, layers = {} } = {}) {
  const d = tmp();
  write(path.join(d, 'base.png'), wall(120, 90));
  for (const [name, im] of Object.entries(layers)) write(path.join(d, name), im);
  fs.writeFileSync(path.join(d, 'template.json'), JSON.stringify({ base: 'base.png', placements, licence }));
  return d;
}
const QUAD = { id: 'front', kind: 'quad', quad: [[20, 12], [96, 18], [92, 80], [24, 74]] };
const KINDS = {
  quad: {
    ...QUAD,
    mask: 'mask.png',
    displacement: { map: 'disp.png', strength: 2 },
    shading: [{ mode: 'multiply', map: 'shade.png', opacity: 0.8 }, { mode: 'screen', from: 'base', opacity: 0.5, threshold: 0.7 }],
  },
  cylinder: { id: 'label', kind: 'cylinder', cylinder: { axis_x: 60, top: 25, bottom: 70, radius: 34, visible_arc: 170, art_arc: 190, ellipse_top: 3, ellipse_bottom: 6 }, shading: [{ mode: 'multiply', from: 'base', opacity: 0.7 }] },
  mesh: { id: 'flag', kind: 'mesh', mesh: [0, 1, 2, 3].map((i) => [0, 1, 2, 3, 4].map((j) => [16 + j * 22, 14 + i * 21 + 5 * Math.sin(j * 1.2 + i * 0.4)])), feather: 0.5 },
};
const LAYERS = {
  'mask.png': image(120, 90, (x, y) => (Math.hypot(x - 22, y - 76) < 12 ? [0, 0, 0, 255] : [255, 255, 255, 255])),
  'disp.png': image(120, 90, (x) => [...Array(3).fill(128 + 90 * Math.sin(x / 5)), 255]),
  'shade.png': image(120, 90, (x) => [255 - x, 255 - x, 255 - x, 255]),
};
function setup(kind) {
  const d = makeTemplate([KINDS[kind]], { layers: LAYERS });
  write(path.join(d, 'art.png'), labelArt(96, 64));
  return d;
}
// overwrite a w×h block of the render (a "changed glyph") starting at base px x0, y0
function corrupt(src, dst, x0, y0, w = 7, h = 6) {
  const im = read(src);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) im.data.set([255 - im.data[(y * im.width + x) * 4], 0, 255, 255], (y * im.width + x) * 4);
  write(dst, im);
}

test('png codec is shared: region_paste re-exports scripts/lib/image/png.mjs', () => {
  assert.equal(paste.decodePNG, decodePNG);
  assert.equal(paste.encodePNG, encodePNG);
});

test('geometry: quad, cylinder (u = R·asin(x/R)) and mesh invert their forward maps; bad quads refused', () => {
  const p = new Float64Array(2), q = new Float64Array(3);
  const cyl = cylinderMapper({ axis_x: 60, top: 20, bottom: 80, radius: 30, visible_arc: 180, art_arc: 180 });
  for (const m of [quadMapper(QUAD.quad), cyl, meshMapper(KINDS.mesh.mesh)])
    for (const [s, t] of [[0.1, 0.2], [0.5, 0.5], [0.93, 0.71]]) {
      assert.ok(m.fwd(s, t, p) && m.inv(p[0], p[1], q), m.kind);
      assert.ok(Math.abs(q[0] - s) < 1e-9 && Math.abs(q[1] - t) < 1e-9, `${m.kind} ${s},${t} -> ${q[0]},${q[1]}`);
    }
  // half the radius off-axis is 30° of arc: s = 0.5 + 30/180; arc length R·asin(x/R) compresses toward the rim
  cyl.inv(75, 50, q);
  assert.ok(Math.abs(q[0] - (0.5 + 30 / 180)) < 1e-12);
  cyl.fwd(0.75, 0.5, p);
  assert.ok(Math.abs(p[0] - (60 + 30 * Math.sin(Math.PI / 4))) < 1e-9);
  assert.throws(() => quadMapper([[20, 12], [96, 18], [24, 74], [92, 80]]), /convex/);
  assert.throws(() => quadMapper([[96, 18], [20, 12], [24, 74], [92, 80]]), /mirrored/);
  assert.deepEqual(fitRect('contain', 2, 1), { s0: 0, t0: 0.25, sw: 1, sh: 0.5 });
  assert.deepEqual(fitRect('cover', 2, 1), { s0: -0.5, t0: 0, sw: 2, sh: 1 });
});

test('fixture package: check, render, verify; sidecar records hashes, placement, timings, licence; outside and masked pixels untouched', async () => {
  const d = tmp();
  write(path.join(d, 'art.png'), labelArt(90, 120));
  const before = fs.readdirSync(FIX).map((f) => sha(path.join(FIX, f)));
  assert.match(await runMockup('check', { template: FIX }), /template poster-wall: OK .*\n\s+poster\s+quad/);
  const rec = await renderMockup({ template: FIX, art: path.join(d, 'art.png'), out: path.join(d, 'poster.png') });
  assert.deepEqual(fs.readdirSync(FIX).map((f) => sha(path.join(FIX, f))), before, 'template files untouched');
  const side = JSON.parse(fs.readFileSync(path.join(d, 'poster.png.mockup.json'), 'utf8'));
  assert.equal(side.template.hash.length, 64);
  assert.deepEqual(Object.keys(side.template.files).sort(), ['base.png', 'displace.png', 'glare.png', 'mask.png']);
  assert.equal(side.art.sha256, sha(path.join(d, 'art.png')));
  assert.equal(side.out.sha256, sha(rec.out_file));
  assert.equal(side.placements[0].id, 'poster');
  assert.equal(side.placements[0].fit, 'contain');
  assert.ok(side.timings_ms.total >= 0 && 'render' in side.timings_ms);
  assert.deepEqual([side.licence.status, side.licence.client_facing], ['cleared', true]);
  const out = read(rec.out_file), base = read(path.join(FIX, 'base.png')), mask = read(path.join(FIX, 'mask.png'));
  const r = side.placements[0].region;
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++) {
      const outside = x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h;
      if (outside || px(mask, x, y)[3] === 0) assert.deepEqual(px(out, x, y), px(base, x, y), `${x},${y}`);
    }
  assert.notDeepEqual(px(out, 47, 30), px(base, 47, 30), 'art lands inside the quad');
  const v = await verifyMockup({ template: FIX, art: path.join(d, 'art.png'), render: rec.out_file });
  assert.equal(v.verdict, 'pass');
  assert.deepEqual([v.placements[0].metrics.mad, v.placements[0].metrics.ssim_min], [0, 1]);
  assert.equal(v.provenance.art_sha256_match, true);
});

for (const kind of ['quad', 'cylinder', 'mesh']) {
  test(`${kind}: untouched render verifies PASS; corrupted label pixels FAIL with the heatmap pointing at them`, async () => {
    const d = setup(kind);
    const art = path.join(d, 'art.png'), out = path.join(d, 'out.png');
    const rec = await renderMockup({ template: d, art, out });
    const v = await verifyMockup({ template: d, art, render: out });
    assert.equal(v.verdict, 'pass', JSON.stringify(v.placements));
    assert.equal(v.placements[0].metrics.mad, 0);
    assert.ok(fs.existsSync(v.report_file) && read(v.heatmap_files[0]).width > 0);
    // a changed "glyph" in the middle of the label
    const p = new Float64Array(2);
    const mapper = { quad: () => quadMapper(KINDS.quad.quad), cylinder: () => cylinderMapper(KINDS.cylinder.cylinder), mesh: () => meshMapper(KINDS.mesh.mesh) }[kind]();
    mapper.fwd(0.55, 0.6, p);
    const [cx, cy] = [Math.round(p[0]), Math.round(p[1])];
    corrupt(out, path.join(d, 'bad.png'), cx - 3, cy - 3);
    const bad = await verifyMockup({ template: d, art, render: path.join(d, 'bad.png') });
    assert.equal(bad.verdict, 'fail', JSON.stringify(bad.placements[0]));
    const wt = bad.placements[0].worst_tile;
    assert.ok(Math.hypot(wt.base_px.x - cx, wt.base_px.y - cy) < 10, `worst tile ${JSON.stringify(wt)} vs ${cx},${cy}`);
    // relighting the scene outside the placement region is allowed (harmonize, then paste the label back)
    const im = read(out), r = rec.placements[0].region;
    for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) if (x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h) im.data[(y * im.width + x) * 4] *= 0.7;
    write(path.join(d, 'relit.png'), im);
    assert.equal((await verifyMockup({ template: d, art, render: path.join(d, 'relit.png') })).verdict, 'pass');
  });
}

test('verify tolerates re-encode noise (±2 levels) but fails a blurred, relit label', async () => {
  const d = setup('quad');
  const art = path.join(d, 'art.png'), out = path.join(d, 'out.png');
  await renderMockup({ template: d, art, out });
  const im = read(out);
  let s = 1;
  for (let i = 0; i < im.data.length; i++) if (i % 4 !== 3) im.data[i] += ((s = (s * 1103515245 + 12345) & 0x7fffffff) % 5) - 2;
  write(path.join(d, 'noisy.png'), im);
  const noisy = await verifyMockup({ template: d, art, render: path.join(d, 'noisy.png') });
  assert.equal(noisy.verdict, 'pass', JSON.stringify(noisy.placements[0].metrics));
  // a "harmonize" pass: 3x3 blur and +12 brightness over everything
  const src = read(out), hz = read(out), W = src.width;
  for (let y = 1; y < src.height - 1; y++)
    for (let x = 1; x < W - 1; x++)
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) acc += src.data[((y + dy) * W + x + dx) * 4 + c];
        hz.data[(y * W + x) * 4 + c] = acc / 9 + 12;
      }
  write(path.join(d, 'harmonized.png'), hz);
  const h = await verifyMockup({ template: d, art, render: path.join(d, 'harmonized.png') });
  assert.equal(h.verdict, 'fail', JSON.stringify(h.placements[0].metrics));
});

test('metrics and verdicts follow the stated thresholds', () => {
  const W = 16, H = 16, E = new Float32Array(W * H * 3).map((_, i) => ((i / 3) % 4 < 2 ? 0.2 : 0.8));
  const valid = new Uint8Array(W * H).fill(1);
  const same = compareGrids(E, E, valid, W, H);
  assert.deepEqual([same.mad, same.edge_diff, same.ssim_min, same.changed_fraction], [0, 0, 1, 0]);
  assert.equal(judge(same).verdict, 'pass');
  const U = E.slice();
  for (let i = 0; i < 12; i++) U[i * 3] = U[i * 3 + 1] = U[i * 3 + 2] = 1 - E[i * 3];
  const m = compareGrids(U, E, valid, W, H);
  assert.ok(m.changed_fraction > THRESHOLDS.fail.changed_fraction && judge(m).verdict === 'fail');
  assert.match(judge(m).reasons.join(), /changed/);
  assert.equal(judge(null).verdict, 'fail');
  assert.equal(judge({ mad: 3, edge_diff: 0, ssim_min: 1, changed_fraction: 0 }).verdict, 'warn');
});

test('renders are deterministic; a parallelogram quad and a 2x2 mesh give identical pixels', async () => {
  const c = [[30, 20], [100, 26], [92, 80], [22, 74]];
  const dq = makeTemplate([{ id: 'p', kind: 'quad', quad: c }]), dm = makeTemplate([{ id: 'p', kind: 'mesh', mesh: [[c[0], c[1]], [c[3], c[2]]] }]);
  const art = path.join(dq, 'art.png');
  write(art, labelArt(80, 60));
  const a = await renderMockup({ template: dq, art, out: path.join(dq, 'a.png') });
  const b = await renderMockup({ template: dq, art, out: path.join(dq, 'b.png') });
  const m = await renderMockup({ template: dm, art, out: path.join(dm, 'm.png') });
  assert.equal(sha(a.out_file), sha(b.out_file));
  assert.equal(sha(a.out_file), sha(m.out_file));
});

test('art_region feeds one dieline art into two carton panels; verify checks each placement', async () => {
  const d = makeTemplate([
    { id: 'front', kind: 'quad', quad: [[14, 22], [70, 28], [70, 82], [14, 78]], art_region: { x: 0, y: 0, w: 0.6, h: 1 } },
    { id: 'side', kind: 'quad', quad: [[70, 28], [104, 18], [104, 72], [70, 82]], art_region: { x: 0.6, y: 0, w: 0.4, h: 1 }, shading: [{ mode: 'multiply', from: 'base', opacity: 0.4 }] },
  ]);
  write(path.join(d, 'dieline.png'), labelArt(150, 60));
  const rec = await renderMockup({ template: d, art: path.join(d, 'dieline.png'), out: path.join(d, 'box.png') });
  assert.deepEqual(rec.placements.map((p) => p.id), ['front', 'side']);
  const v = await verifyMockup({ template: d, art: path.join(d, 'dieline.png'), render: path.join(d, 'box.png') });
  assert.deepEqual(v.placements.map((p) => [p.placement, p.verdict]), [['front', 'pass'], ['side', 'pass']]);
  const one = await verifyMockup({ template: d, art: path.join(d, 'dieline.png'), render: path.join(d, 'box.png'), placement: 'side' });
  assert.deepEqual(one.placements.map((p) => p.placement), ['side']);
});

test('licence gate: false blocks before writing; unknown warns loudly; --internal labels it internal', async () => {
  const mk = (v) => {
    const d = makeTemplate([QUAD], { licence: { source: 'a stock site', terms: 'personal use only', client_use_allowed: v } });
    write(path.join(d, 'art.png'), labelArt(40, 30));
    return d;
  };
  const blocked = mk(false);
  await assert.rejects(renderMockup({ template: blocked, art: path.join(blocked, 'art.png'), out: path.join(blocked, 'o.png'), internal: true }), /BLOCKED: .*personal use only/);
  assert.ok(!fs.existsSync(path.join(blocked, 'o.png')) && !fs.existsSync(path.join(blocked, 'o.png.mockup.json')));
  const unknown = mk('unknown');
  const text = await runMockup('render', { template: unknown, art: path.join(unknown, 'art.png'), out: path.join(unknown, 'o.png') });
  assert.match(text.split('\n')[0], /^WARNING: template licence unknown .*NOT cleared for client-facing use/);
  const side = JSON.parse(fs.readFileSync(path.join(unknown, 'o.png.mockup.json'), 'utf8'));
  assert.deepEqual([side.licence.status, side.licence.client_facing], ['unknown', false]);
  const internal = await renderMockup({ template: unknown, art: path.join(unknown, 'art.png'), out: path.join(unknown, 'i.png'), internal: true });
  assert.equal(internal.licence.status, 'internal');
  assert.ok(!internal.warnings.some((w) => /licence/.test(w)), internal.warnings.join());
});

test('never overwrites inputs; an existing --out needs --force; output must be PNG', async () => {
  const d = makeTemplate([QUAD]);
  const art = path.join(d, 'art.png');
  write(art, labelArt(40, 30));
  const artSha = sha(art);
  await assert.rejects(renderMockup({ template: d, art, out: art, force: true }), /overwrite an input/);
  await assert.rejects(renderMockup({ template: d, art, out: path.join(d, '.', 'base.png'), force: true }), /overwrite an input/);
  await renderMockup({ template: d, art, out: path.join(d, 'o.png') });
  await assert.rejects(renderMockup({ template: d, art, out: path.join(d, 'o.png') }), /output exists/);
  await renderMockup({ template: d, art, out: path.join(d, 'o.png'), force: true });
  await assert.rejects(renderMockup({ template: d, art, out: path.join(d, 'o.jpg') }), /\.png/);
  await assert.rejects(verifyMockup({ template: d, art, render: path.join(d, 'o.png'), heatmap: art, force: true }), /overwrite an input/);
  assert.equal(sha(art), artSha);
});

test('template validation: clear errors for schema, geometry, paths, layer sizes and the render size', async () => {
  const bad = async (placements, re, extra = {}) => {
    const d = makeTemplate(placements, extra);
    write(path.join(d, 'art.png'), labelArt(40, 30));
    await assert.rejects(renderMockup({ template: d, art: path.join(d, 'art.png'), out: path.join(d, 'o.png') }), re);
  };
  await bad([{ id: 'x', kind: 'sphere' }], /kind/);
  await bad([{ id: 'x', kind: 'quad' }], /required property 'quad'/);
  await bad([{ ...QUAD, mask: '../outside.png' }], /inside the template directory/);
  await bad([{ ...QUAD, mask: 'small.png' }], /must match the 120x90 base/, { layers: { 'small.png': image(10, 10, () => [255, 255, 255, 255]) } });
  await bad([QUAD, QUAD], /used twice/);
  await bad([{ ...QUAD, quad: [[96, 18], [20, 12], [24, 74], [92, 80]] }], /mirrored/);
  await bad([{ ...QUAD, extra: 1 }], /additional properties/);
  const d = makeTemplate([QUAD]);
  write(path.join(d, 'art.png'), labelArt(40, 30));
  write(path.join(d, 'small-render.png'), image(60, 45, () => [0, 0, 0, 255]));
  await assert.rejects(verifyMockup({ template: d, art: path.join(d, 'art.png'), render: path.join(d, 'small-render.png') }), /template base is 120x90/);
});

test('cli: help, argv arrays, unknown subcommand, FAIL sets the exit code', async () => {
  assert.match(await runMockup('help', {}), /render --template <dir> --art/);
  await assert.rejects(runMockup('nope', {}), /unknown mockup subcommand/);
  await assert.rejects(runMockup('render', { template: FIX }), /--art required/);
  const d = setup('quad');
  const out = path.join(d, 'o.png');
  const rec = await runMockup('render', ['--template', d, '--art', path.join(d, 'art.png'), '--out', out, '--json']);
  assert.equal(rec.kind, 'cstack.mockup.render');
  corrupt(out, path.join(d, 'bad.png'), 50, 40);
  const prev = process.exitCode;
  try {
    const text = await runMockup('verify', { template: d, art: path.join(d, 'art.png'), render: path.join(d, 'bad.png') });
    assert.match(text, /^FAIL /m);
    assert.match(text, /verdict: FAIL/);
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = prev;
  }
});

test('SVG art without Chromium fails with MISSING (nothing written)', async () => {
  const d = makeTemplate([QUAD]);
  fs.writeFileSync(path.join(d, 'art.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 30"><rect width="40" height="30" fill="#c33"/></svg>');
  const prev = process.env.CSTACK_CHROMIUM;
  process.env.CSTACK_CHROMIUM = path.join(d, 'no-such-chromium');
  try {
    await assert.rejects(renderMockup({ template: d, art: path.join(d, 'art.svg'), out: path.join(d, 'o.png') }), /^Error: MISSING: art\.svg \(svg\) needs headless Chromium/);
    assert.ok(!fs.existsSync(path.join(d, 'o.png')));
  } finally {
    if (prev === undefined) delete process.env.CSTACK_CHROMIUM;
    else process.env.CSTACK_CHROMIUM = prev;
  }
});



test('SVG and JPEG art (chromium): rasterized at the needed size, recorded in the sidecar, verify passes', { skip: chromium === true ? false : `Chromium unavailable: ${chromium}` }, async () => {
  const d = setup('cylinder');
  fs.writeFileSync(path.join(d, 'art.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80"><rect width="200" height="80" fill="#f4efe2"/><rect width="200" height="22" fill="#c03030"/><circle cx="60" cy="50" r="18" fill="#203070"/><path d="M110 35h60v8h-60zM110 52h45v8h-45z" fill="#203070"/></svg>');
  const rec = await renderMockup({ template: d, art: path.join(d, 'art.svg'), out: path.join(d, 'svg.png') });
  assert.equal(rec.art.format, 'svg');
  assert.ok(Math.abs(rec.art.raster.width / rec.art.raster.height - 2.5) < 0.02, JSON.stringify(rec.art.raster));
  assert.ok(rec.art.raster.width >= 2 * 34 * ((190 * Math.PI) / 180), `raster ${rec.art.raster.width}px covers 2x the front arc`);
  assert.ok(rec.engine.decoders.some((e) => e.startsWith('chromium')));
  const v = await verifyMockup({ template: d, art: path.join(d, 'art.svg'), render: path.join(d, 'svg.png') });
  assert.equal(v.verdict, 'pass', JSON.stringify(v.placements[0].metrics));
  fs.writeFileSync(path.join(d, 'art.jpg'), jpeg);
  const j = await renderMockup({ template: d, art: path.join(d, 'art.jpg'), out: path.join(d, 'jpg.png') });
  assert.deepEqual([j.art.format, j.art.raster], ['jpeg', { width: 64, height: 48 }]);
  assert.equal((await verifyMockup({ template: d, art: path.join(d, 'art.jpg'), render: path.join(d, 'jpg.png') })).verdict, 'pass');
});

test('can template (F75): drawn CC0 package checks, renders a flat wrap and verifies PASS; the CLI prints the wrap size', async () => {
  const { makeCanTemplate, wrapSize } = await import('../scripts/lib/mockup/can.mjs');
  const d = tmp();
  assert.deepEqual(wrapSize('tall-16oz').mm, { w: 207.3, h: 134 });
  assert.throws(() => wrapSize('magnum'), /unknown can size/);
  const t = makeCanTemplate({ size: 'standard-12oz', out: path.join(d, 'can') });
  assert.throws(() => makeCanTemplate({ size: 'standard-12oz', out: path.join(d, 'can') }), /--force/);
  const spec = JSON.parse(fs.readFileSync(t.template, 'utf8'));
  assert.deepEqual(spec.placements.map((p) => p.id), ['front', 'left', 'back']);
  assert.equal(spec.licence.client_use_allowed, true);
  assert.match(await runMockup('check', { template: t.dir }), /template can-standard-12oz: OK/);
  write(path.join(d, 'wrap.png'), labelArt(207, 98));
  const out = path.join(d, 'front.png');
  await renderMockup({ template: t.dir, art: path.join(d, 'wrap.png'), out, placement: 'front' });
  const v = await verifyMockup({ template: t.dir, art: path.join(d, 'wrap.png'), render: out, placement: 'front' });
  assert.equal(v.verdict, 'pass', JSON.stringify(v.placements));
  const msg = await runMockup('template', { _: ['can'], out: path.join(d, 'tall'), size: 'tall-16oz' });
  assert.match(msg, /207\.3 x 134 mm/);
});
