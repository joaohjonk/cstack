// svg reduce: does a mark survive small sizes? (docs/research/mockups-and-vector.md: B2 reduction and single-color
// tests, E svg.reduction / svg.onecolor / svg.contrast / svg.centering). With Chromium, per size: the mark as authored on white and on
// black, and a one-color silhouette. The native small silhouette is then compared with a high-res one:
//   structure  counters (enclosed holes) and separate parts must match the high-res render (the doc's fail rule);
//   fidelity   1 - mean |native - high-res area-downsampled to the same size| over inked pixels;
//   detail     strokes under 1 device px (from the vector), and ink or gaps thinner than 1 device px (the high-res
//              silhouette minus its opening by a 1-device-px disk), as a share of the ink area.
// score = structure x (1 - detail loss) x fidelity. Verdicts per size: collapse (fail) when the structure changes;
// thin (warn) when a stroke is under 1 px or sub-pixel features cover >= 2% of the ink (inferred threshold); else ok.
// Non-square marks are fit into a square, as favicons and avatars do. A PNG, JPEG, WebP or GIF can be tested too (a
// generated logo before it is redrawn): it cannot be repainted, so its silhouette is the alpha channel (transparent
// images) or each pixel's distance from the background color (opaque images), and its on-black render is not reversed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { parseXML } from './xml.mjs';
import { buildModel } from './model.mjs';
import { sizedSVG, monoRoot } from './clean.mjs';
import { chromiumStatus, withRenderer, coverage, resample, binarize, topology, prepareThin, thinFeatures, inkAgainst, inkOver, rasterFormat, inkFromBackground } from './raster.mjs';
import { rgbHex } from './style.mjs';
import { imageSize } from '../image.mjs';
import { encodePNG } from '../../../providers/local/region_paste.mjs';

export const REDUCE_SIZES = [16, 24, 32, 48, 64];
export const THIN_AREA_WARN = 0.02;
export const CONTRAST_MIN = 3; // WCAG 2 non-text contrast for graphical objects (doc E, svg.contrast)
export const CENTER_TOL = 0.02; // reported above 2% of the canvas (inferred; doc E leaves the tolerance to the owner)
const CSTACK_VERSION = createRequire(import.meta.url)('../../../package.json').version;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const r3 = (n) => Math.round(n * 1000) / 1000;

export function parseSizes(v, def = REDUCE_SIZES) {
  if (v == null || v === true) return def;
  const n = String(v).split(',').map((s) => Number(s.trim()));
  if (!n.length || n.some((x) => !Number.isInteger(x) || x < 8 || x > 1024)) throw new Error(`bad --sizes "${v}" (comma-separated integers from 8 to 1024)`);
  return [...new Set(n)].sort((a, b) => a - b);
}

/** Refuse an existing output path unless force; never a file. */
export function prepareOut(dir, force) {
  if (!fs.existsSync(dir)) return;
  if (!fs.statSync(dir).isDirectory()) throw new Error(`--out ${dir} is a file`);
  if (!force) throw new Error(`output dir exists: ${dir} (pass --force to write into it; inputs are never overwritten)`);
}

export function writeFiles(dir, files) {
  fs.mkdirSync(dir, { recursive: true });
  const list = [];
  for (const [name, buf] of files) {
    const p = path.join(dir, name);
    const tmp = `${p}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, p);
    list.push({ path: name, bytes: buf.length, sha256: sha(buf) });
  }
  return list;
}

const lin = (c) => (c <= 10.31475 ? c / 3294.6 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const luminance = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

// Share of silhouette pixels whose rendered color reaches `min` contrast against an opaque background.
function contrastShare(img, silhouette, bgLum, min) {
  let n = 0, ok = 0;
  for (let i = 0; i < silhouette.length; i++) {
    if (!silhouette[i]) continue;
    n++;
    const o = i * 4;
    const L = luminance(img.data[o], img.data[o + 1], img.data[o + 2]);
    if ((Math.max(L, bgLum) + 0.05) / (Math.min(L, bgLum) + 0.05) >= min) ok++;
  }
  return n ? ok / n : 1;
}

const MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const rasterSVG = (src, { width, height, format }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="data:${MIME[format]};base64,${src.toString('base64')}"/></svg>`;

async function contactSheet(page, { title, rows, files, verdict }) {
  const src = (n) => `data:image/png;base64,${files.get(n).toString('base64')}`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const cells = (variant, cls) =>
    rows
      .map((r) => {
        const z = Math.max(1, Math.floor(128 / r.size)) * r.size;
        return `<td><div class="cell ${cls}"><img class="z" src="${src(r.files[variant])}" style="width:${z}px;height:${z}px"><img src="${src(r.files[variant])}" width="${r.size}" height="${r.size}"></div></td>`;
      })
      .join('');
  const cellH = 128 + Math.max(...rows.map((r) => r.size)) + 8;
  const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#eceae6;font:12px/1.35 "DejaVu Sans",Arial,sans-serif;color:#1b1b1b}
#sheet{display:inline-block;padding:16px 18px}
h1{font-size:14px;margin:0 0 10px}
table{border-collapse:separate;border-spacing:6px}
th{font-weight:600;text-align:right;padding-right:6px}
thead th{text-align:center}
.cell{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:8px;padding:10px;border-radius:4px;min-width:132px;min-height:${cellH}px;box-sizing:content-box}
.w{background:#fff}.k{background:#000}
img.z{image-rendering:pixelated}
td.v{text-align:center;font-weight:600;padding-top:2px}
.ok{color:#1b7f3b}.thin{color:#9a5b00}.collapse{color:#b00020}
p{margin:8px 0 0;color:#555;max-width:900px}
</style><div id="sheet"><h1>${esc(title)} · reduction test · ${esc(verdict)}</h1>
<table><thead><tr><th></th>${rows.map((r) => `<th>${r.size} px</th>`).join('')}</tr></thead>
<tr><th>on white</th>${cells('onwhite', 'w')}</tr>
<tr><th>on black</th>${cells('onblack', 'k')}</tr>
<tr><th>one-color</th>${cells('mono', 'w')}</tr>
<tr><th>score</th>${rows.map((r) => `<td class="v ${r.verdict}">${r.score.toFixed(2)} ${r.verdict}<br><span style="font-weight:400">counters ${r.holes.native}/${r.holes.hi_res} · parts ${r.parts.native}/${r.parts.hi_res}</span></td>`).join('')}</tr></table>
<p>Each cell: enlarged without smoothing, then actual size. Counters and parts: native render / high-res render. collapse = a counter closed or parts merged, vanished or split; thin = a stroke under 1 px or sub-pixel features over 2% of the ink.</p></div>`;
  await page.setContent(html, { waitUntil: 'load' });
  const box = await page.evaluate(() => {
    const r = document.getElementById('sheet').getBoundingClientRect();
    return { width: Math.ceil(r.width), height: Math.ceil(r.height) };
  });
  await page.setViewportSize({ width: Math.max(320, box.width), height: Math.max(200, box.height) });
  return page.locator('#sheet').screenshot({ type: 'png' });
}

/**
 * Run the reduction test. Returns the report ({ok, rows, findings, files, ...}), or {skipped: true, reason} when
 * Chromium is unavailable. Writes PNGs, contact-sheet.png and reduce.json into `out`.
 */
export async function reduceTest(file, { sizes = REDUCE_SIZES, out, force = false, display = (p) => p } = {}) {
  if (!out) throw new Error('svg reduce needs an output directory');
  const src = fs.readFileSync(file);
  const fmt = rasterFormat(src);
  const raster = fmt ? { format: fmt, ...imageSize(file) } : null;
  const doc = parseXML(raster ? rasterSVG(src, raster) : src.toString('utf8'));
  const model = buildModel(doc);
  const vb = model.viewBox;
  if (!vb) throw new Error('svg reduce needs a viewBox (or width and height) to know the drawing area');
  const status = await chromiumStatus();
  if (!status.ok) return { skipped: true, reason: status.reason, file: display(file) };
  prepareOut(out, force);
  const name = path.basename(file).replace(/\.(svg|png|jpe?g|webp|gif)$/i, '');
  const files = new Map();
  const H = Math.min(2048, Math.max(512, 8 * Math.max(...sizes)));
  const pxPerUnit = (s) => s / Math.max(vb.w, vb.h);
  const notes = [];

  const res = await withRenderer(async ({ render, page, engine }) => {
    // silhouette(s): one-color coverage at s x s px. SVG: alpha of the copy with every paint set to black.
    let silhouette, background = null;
    if (!raster) {
      const mono = monoRoot(doc.root);
      silhouette = async (s) => coverage(await render(sizedSVG(mono, s, s), { width: s, height: s }));
    } else {
      const k = 256 / Math.max(vb.w, vb.h), pw = Math.max(1, Math.round(vb.w * k)), ph = Math.max(1, Math.round(vb.h * k));
      const probe = await render(sizedSVG(doc.root, pw, ph), { width: pw, height: ph });
      const corners = [0, pw - 1, (ph - 1) * pw, ph * pw - 1].map((i) => Array.from(probe.data.subarray(i * 4, i * 4 + 4)));
      if (corners.every((c) => c[3] > 127)) {
        const bg = [0, 1, 2].map((ch) => {
          const v = corners.map((c) => c[ch]).sort((a, b) => a - b);
          return Math.round((v[1] + v[2]) / 2);
        });
        background = rgbHex(...bg);
        const onBg = async (s) => render(sizedSVG(doc.root, s, s), { width: s, height: s, background });
        const hiRaw = inkFromBackground(await onBg(H), bg);
        const scale = Math.max(0.2, hiRaw.reduce((m, v) => Math.max(m, v), 0)); // the strongest ink counts as full coverage
        silhouette = async (s) => inkFromBackground(await onBg(s), bg, scale);
        notes.push(`opaque ${fmt.toUpperCase()}: the silhouette is each pixel's distance from its background ${background}`);
      } else {
        silhouette = async (s) => coverage(await render(sizedSVG(doc.root, s, s), { width: s, height: s }));
        notes.push(`transparent ${fmt.toUpperCase()}: the silhouette is its alpha channel`);
      }
      if (Math.max(raster.width, raster.height) < H) notes.push(`the raster is ${raster.width}x${raster.height} px, below the ${H} px reference, so the reference is upscaled`);
    }
    const hiCov = await silhouette(H);
    const hiBin = binarize(hiCov);
    const minArea = Math.max(4, Math.round((H / 512) ** 2 * 4)); // ignore specks below ~4 px at 512
    const hiTopo = topology(hiBin, H, H, minArea);
    let inkPx = 0;
    for (const v of hiBin) inkPx += v;
    const prep = prepareThin(hiBin, H, H, H / Math.min(...sizes));
    // svg.centering (doc E): the ink box center and the coverage-weighted centroid, as offsets from the canvas center
    let mx = 0, my = 0, mw = 0, bx0 = H, by0 = H, bx1 = -1, by1 = -1;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < H; x++) {
        const v = hiCov[y * H + x];
        mx += v * (x + 0.5);
        my += v * (y + 0.5);
        mw += v;
        if (hiBin[y * H + x]) [bx0, by0, bx1, by1] = [Math.min(bx0, x), Math.min(by0, y), Math.max(bx1, x + 1), Math.max(by1, y + 1)];
      }
    const centering = mw && bx1 > 0 ? { box: [r3((bx0 + bx1) / 2 / H - 0.5), r3((by0 + by1) / 2 / H - 0.5)], mass: [r3(mx / mw / H - 0.5), r3(my / mw / H - 0.5)] } : null;
    const onWhiteHi = await render(sizedSVG(doc.root, H, H, { color: '#000000' }), { width: H, height: H, background: '#ffffff' });
    const onBlackHi = await render(sizedSVG(doc.root, H, H, { color: '#ffffff' }), { width: H, height: H, background: '#000000' });
    let colorTopo = null, contrast;
    if (background) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(background.slice(i, i + 2), 16));
      const onOwn = await render(sizedSVG(doc.root, H, H), { width: H, height: H, background });
      contrast = { background, on_background: r3(contrastShare(onOwn, hiBin, luminance(r, g, b), CONTRAST_MIN)) };
    } else {
      if (!raster) colorTopo = topology(inkAgainst(onWhiteHi, [255, 255, 255]), H, H, minArea);
      contrast = { on_white: r3(contrastShare(onWhiteHi, hiBin, 1, CONTRAST_MIN)), on_black: r3(contrastShare(onBlackHi, hiBin, 0, CONTRAST_MIN)) };
    }

    const rows = [];
    for (const s of sizes) {
      const onwhite = await render(sizedSVG(doc.root, s, s, { color: '#000000' }), { width: s, height: s, background: '#ffffff' });
      const onblack = await render(sizedSVG(doc.root, s, s, { color: '#ffffff' }), { width: s, height: s, background: '#000000' });
      const nat = await silhouette(s);
      const names = { onwhite: `${name}-${s}-onwhite.png`, onblack: `${name}-${s}-onblack.png`, mono: `${name}-${s}-mono.png` };
      files.set(names.onwhite, encodePNG(onwhite));
      files.set(names.onblack, encodePNG(onblack));
      files.set(names.mono, encodePNG(inkOver(nat, s, s)));
      const down = resample(hiCov, H, H, s, s);
      const tNat = topology(binarize(nat), s, s);
      const tDown = topology(binarize(down), s, s);
      let diff = 0, n = 0;
      for (let i = 0; i < s * s; i++)
        if (nat[i] > 0.02 || down[i] > 0.02) {
          diff += Math.abs(nat[i] - down[i]);
          n++;
        }
      const fidelity = n ? 1 - diff / n : 1;
      const D = H / s;
      const thin = thinFeatures(prep, D);
      const detailLoss = Math.min(1, (thin.ink.area + thin.gap.area) / Math.max(1, inkPx));
      const strokes = model.shapes.filter((sh) => sh.stroked).map((sh) => (sh.nonScaling ? sh.strokeWidth : sh.strokeWidth * sh.scale * pxPerUnit(s)));
      const minStroke = strokes.length ? strokes.reduce((m, v) => Math.min(m, v), Infinity) : null;
      const dHoles = tNat.holes - hiTopo.holes, dParts = tNat.components - hiTopo.components;
      const structure = 1 - Math.min(1, (Math.abs(dHoles) + Math.abs(dParts)) / Math.max(1, hiTopo.holes + hiTopo.components));
      const collapse = dHoles !== 0 || dParts !== 0;
      const thinFlag = (minStroke != null && minStroke < 1) || detailLoss >= THIN_AREA_WARN;
      rows.push({
        size: s,
        verdict: collapse ? 'collapse' : thinFlag ? 'thin' : 'ok',
        score: r3(structure * (1 - detailLoss) * fidelity),
        holes: { hi_res: hiTopo.holes, native: tNat.holes, downsampled: tDown.holes },
        parts: { hi_res: hiTopo.components, native: tNat.components, downsampled: tDown.components },
        fidelity: r3(fidelity),
        detail_loss: r3(detailLoss),
        thin_ink: { features: thin.ink.count, area_px: r3(thin.ink.area / D / D), thinnest_px: thin.ink.thinnest == null ? null : r3(thin.ink.thinnest) },
        thin_gaps: { features: thin.gap.count, area_px: r3(thin.gap.area / D / D), narrowest_px: thin.gap.thinnest == null ? null : r3(thin.gap.thinnest) },
        min_stroke_px: minStroke == null ? null : r3(minStroke),
        files: names,
      });
    }
    const verdict = rows.some((r) => r.verdict === 'collapse') ? 'FAIL' : rows.some((r) => r.verdict === 'thin') ? 'WARN' : 'PASS';
    files.set('contact-sheet.png', await contactSheet(page, { title: path.basename(file), rows, files, verdict }));
    return { engine, rows, hiTopo, colorTopo, contrast, centering };
  });

  const { rows, hiTopo, colorTopo, contrast, centering } = res;
  const label = display(file);
  const findings = [];
  const add = (id, level, detail) => findings.push({ id, level, file: label, detail });
  const collapsed = rows.filter((r) => r.verdict === 'collapse');
  let k = rows.length;
  while (k > 0 && rows[k - 1].verdict !== 'collapse') k--;
  const holdsFrom = rows[k]?.size ?? null;
  if (collapsed.length) {
    const why = collapsed.map((r) => {
      const bits = [];
      if (r.holes.native !== r.holes.hi_res) bits.push(`counters ${r.holes.hi_res}→${r.holes.native}`);
      if (r.parts.native !== r.parts.hi_res) bits.push(`parts ${r.parts.hi_res}→${r.parts.native}`);
      return `${r.size} px: ${bits.join(', ')}`;
    });
    add('svg.reduction', 'fail', `detail collapses at ${collapsed.map((r) => r.size).join(', ')} px (${why.join('; ')}); ${holdsFrom ? `holds from ${holdsFrom} px` : 'no tested size holds'}: draw a simplified small-size variant or set a minimum size`);
  }
  const thinRows = rows.filter((r) => r.verdict === 'thin');
  if (thinRows.length)
    add('svg.reduction', 'warn', `features under 1 device px at ${thinRows.map((r) => `${r.size} px (${[r.min_stroke_px != null && r.min_stroke_px < 1 ? `stroke ${r.min_stroke_px} px` : null, r.detail_loss ? `${Math.round(r.detail_loss * 100)}% of the ink` : null].filter(Boolean).join(', ')})`).join(', ')}: they render as faint grey`);
  if (!collapsed.length && !thinRows.length) add('svg.reduction', 'info', `holds at every tested size (${rows.map((r) => r.size).join(', ')} px)`);
  if (colorTopo && (colorTopo.holes > hiTopo.holes || colorTopo.components > hiTopo.components))
    add('svg.onecolor', 'warn', `the one-color silhouette loses ${[colorTopo.holes > hiTopo.holes ? `${colorTopo.holes - hiTopo.holes} counter(s)` : null, colorTopo.components > hiTopo.components ? `${colorTopo.components - hiTopo.components} separate part(s)` : null].filter(Boolean).join(' and ')} that the color version shows: light shapes act as knockouts; draw a one-color variant`);
  if (contrast.on_black < 0.5) add('svg.contrast', 'info', `on black only ${Math.round(contrast.on_black * 100)}% of the mark reaches ${CONTRAST_MIN}:1: use a reversed variant on dark backgrounds`);
  if (contrast.on_white < 0.5) add('svg.contrast', 'info', `on white only ${Math.round(contrast.on_white * 100)}% of the mark reaches ${CONTRAST_MIN}:1: use a dark variant on light backgrounds`);
  if (contrast.on_background < 0.5) add('svg.contrast', 'info', `on its own background ${contrast.background} only ${Math.round(contrast.on_background * 100)}% of the mark reaches ${CONTRAST_MIN}:1`);
  const pct = (v) => `(${v.map((d) => `${d >= 0 ? '+' : ''}${Math.round(d * 1000) / 10}%`).join(', ')})`;
  if (centering && Math.max(...centering.box.map(Math.abs), ...centering.mass.map(Math.abs)) > CENTER_TOL)
    add('svg.centering', 'info', `offset from the canvas center as (x, y) shares of the canvas: ink box ${pct(centering.box)}, visual mass ${pct(centering.mass)}; optical centering may be intended, the owner decides`);

  const report = {
    kind: 'svg-reduction',
    file: label,
    sha256: sha(src),
    raster: raster ? { format: raster.format, width: raster.width, height: raster.height } : null,
    viewBox: { x: vb.x, y: vb.y, w: vb.w, h: vb.h },
    sizes,
    hi_res_px: H,
    engine: res.engine,
    cstack_version: CSTACK_VERSION,
    created_at: new Date().toISOString(),
    ok: !findings.some((f) => f.level === 'fail'),
    holds_from_px: holdsFrom,
    rows,
    onecolor: colorTopo ? { color: colorTopo, silhouette: { holes: hiTopo.holes, components: hiTopo.components } } : null,
    contrast,
    centering,
    findings,
    notes,
    thresholds: { collapse: 'counters or parts differ from the high-res render', thin_stroke_px: 1, thin_area_share: THIN_AREA_WARN, contrast_min: CONTRAST_MIN, centering: CENTER_TOL, binarize: 0.5 },
  };
  report.files = writeFiles(out, files);
  const body = Buffer.from(JSON.stringify(report, null, 2) + '\n');
  writeFiles(out, new Map([['reduce.json', body]]));
  report.files.push({ path: 'reduce.json', bytes: body.length });
  return report;
}

export function formatReduce(rep, outLabel) {
  if (rep.skipped) return `${rep.reason}\nsvg reduce: SKIPPED for ${rep.file} (lint works without a browser)`;
  const lines = [`svg reduce: ${rep.file} → ${outLabel} (high-res ${rep.hi_res_px} px, ${rep.engine.name} ${rep.engine.version})`, 'size  score  verdict   counters  parts  min stroke  sub-px share'];
  for (const r of rep.rows)
    lines.push(`${String(r.size).padEnd(5)} ${r.score.toFixed(2).padEnd(6)} ${r.verdict.padEnd(9)} ${`${r.holes.native}/${r.holes.hi_res}`.padEnd(9)} ${`${r.parts.native}/${r.parts.hi_res}`.padEnd(6)} ${(r.min_stroke_px == null ? '-' : `${r.min_stroke_px} px`).padEnd(11)} ${Math.round(r.detail_loss * 100)}%`);
  for (const f of rep.findings) lines.push(`${f.level.toUpperCase().padEnd(4)} ${f.id.padEnd(13)} ${f.detail}`);
  for (const n of rep.notes ?? []) lines.push(`note: ${n}`);
  lines.push(`files: ${rep.files.length} (per-size *-onwhite/-onblack/-mono.png, contact-sheet.png, reduce.json)`);
  const fails = rep.findings.filter((f) => f.level === 'fail').length, warns = rep.findings.filter((f) => f.level === 'warn').length;
  lines.push(`svg reduce: ${rep.ok ? 'PASS' : 'FAIL'} (${fails} fail, ${warns} warn)`);
  return lines.join('\n');
}
