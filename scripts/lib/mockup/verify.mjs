// cstack mockup verify: prove the official art survived. Each placement region of the render is inverse-warped back to
// flat art space (displacement inverted by fixed-point iteration) and compared with the art as this template composites
// it: the art re-rendered through the same geometry, mask, shading and base. An untouched render scores exactly zero
// difference; label pixels changed by a later pass (a generative "harmonize", a retouch, a lossy re-encode) show up.
// The grid matches the placement's screen footprint (the render holds no finer detail); each cell averages 2×2 samples.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { writeJSON, nowISO, assertNotOfficial } from '../core.mjs';
import { encodePNG } from '../image/png.mjs';
import { luma, sampleMap, sampleRGBA } from './raster.mjs';
import { loadTemplate } from './template.mjs';
import { prepare, compose, realish, ENGINE } from './render.mjs';

const CSTACK_VERSION = createRequire(import.meta.url)('../../../package.json').version;

/**
 * Verdict thresholds (MAD in 0..255 levels; edge_diff = Σ|Sobel(render) − Sobel(expected)| / Σ(Sobel(render) + Sobel(expected)),
 * 0 = same edges, 1 = disjoint; SSIM per 8×8 luminance tile, stride 4; changed = share of judged cells whose largest
 * channel moved more than changed_delta). Any metric past `fail` fails; past `pass` warns.
 */
export const THRESHOLDS = {
  changed_delta: 0.1,
  min_coverage: 0.5, // cells where the art shows less than this (mask, edges, hidden arc) are not judged
  pass: { mad: 2, edge_diff: 0.03, ssim_min: 0.97, changed_fraction: 0.002 },
  fail: { mad: 8, edge_diff: 0.1, ssim_min: 0.9, changed_fraction: 0.01 },
};
const TILE = 8;
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function unwarp(job, render, expected, alpha, k = 2) {
  const W = render.width, H = render.height, { fit, E, fp, art, mapper, disp } = job;
  // cells across the whole art region at the visible part's screen density; never finer than the art, 8..1024
  const cells = (len, full, visible, px) => Math.max(8, Math.min(1024, Math.max(8, Math.round(px)), Math.round((len * full) / Math.max(1e-9, visible))));
  const gw = cells(fp.len_s, fit.sw, E.s1 - E.s0, art.rw), gh = cells(fp.len_t, fit.sh, E.t1 - E.t0, art.rh);
  const U = new Float32Array(gw * gh * 3), X = new Float32Array(gw * gh * 3), cover = new Float32Array(gw * gh);
  const p = new Float64Array(2), r4 = new Float64Array(4), e4 = new Float64Array(4), acc = new Float64Array(6);
  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++) {
      let n = 0, cv = 0;
      acc.fill(0);
      for (let sy = 0; sy < k; sy++)
        for (let sx = 0; sx < k; sx++) {
          const s = fit.s0 + ((gx + (sx + 0.5) / k) / gw) * fit.sw, t = fit.t0 + ((gy + (sy + 0.5) / k) / gh) * fit.sh;
          if (s < 0 || s > 1 || t < 0 || t > 1 || !mapper.fwd(s, t, p)) continue;
          let x = p[0], y = p[1];
          if (disp)
            for (let it = 0; it < 4; it++) {
              const d = (sampleMap(disp.luma, W, H, x, y) - disp.neutral) / 255;
              ((x = p[0] - d * disp.sx), (y = p[1] - d * disp.sy));
            }
          if (x < 0 || y < 0 || x > W || y > H) continue;
          sampleRGBA(render, x, y, r4);
          sampleRGBA(expected, x, y, e4);
          for (let c = 0; c < 3; c++) ((acc[c] += r4[c]), (acc[c + 3] += e4[c]));
          cv += sampleMap(alpha, W, H, x, y);
          n++;
        }
      const o = gy * gw + gx;
      cover[o] = cv / (k * k);
      if (n) for (let c = 0; c < 3; c++) ((U[o * 3 + c] = acc[c] / n), (X[o * 3 + c] = acc[c + 3] / n));
    }
  return { gw, gh, U, E: X, cover };
}

function sobel(Y, W, H) {
  const S = new Float32Array(W * H);
  const at = (x, y) => Y[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      S[y * W + x] = Math.hypot(gx, gy);
    }
  return S;
}

const starts = (n, t, step) => {
  const out = [];
  for (let v = 0; v + t < n; v += step) out.push(v);
  out.push(Math.max(0, n - t));
  return [...new Set(out)];
};

/** Metrics between observed (U) and expected (E) RGB grids (0..1), judged where valid[i]. null when nothing is judged. */
export function compareGrids(U, E, valid, W, H, T = THRESHOLDS) {
  const n = W * H, yu = new Float32Array(n), ye = new Float32Array(n), diff = new Float32Array(n);
  let judged = 0, sad = 0, changed = 0;
  for (let i = 0; i < n; i++) {
    const dr = Math.abs(U[i * 3] - E[i * 3]), dg = Math.abs(U[i * 3 + 1] - E[i * 3 + 1]), db = Math.abs(U[i * 3 + 2] - E[i * 3 + 2]);
    diff[i] = Math.max(dr, dg, db);
    ye[i] = luma(E[i * 3], E[i * 3 + 1], E[i * 3 + 2]);
    yu[i] = valid[i] ? luma(U[i * 3], U[i * 3 + 1], U[i * 3 + 2]) : ye[i];
    if (!valid[i]) continue;
    judged++;
    sad += (dr + dg + db) / 3;
    if (diff[i] > T.changed_delta) changed++;
  }
  if (!judged) return null;
  const su = sobel(yu, W, H), se = sobel(ye, W, H);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) if (valid[i]) ((num += Math.abs(su[i] - se[i])), (den += su[i] + se[i]));
  const C1 = 0.01 ** 2, C2 = 0.03 ** 2, t = Math.min(TILE, W, H), step = Math.max(1, t >> 1);
  let sum = 0, tiles = 0, min = 1, worst = null;
  for (const ty of starts(H, t, step))
    for (const tx of starts(W, t, step)) {
      let c = 0, mx = 0, my = 0;
      for (let y = ty; y < ty + t; y++) for (let x = tx; x < tx + t; x++) if (valid[y * W + x]) ((c++), (mx += yu[y * W + x]), (my += ye[y * W + x]));
      if (c < 0.75 * t * t) continue;
      ((mx /= c), (my /= c));
      let vx = 0, vy = 0, cxy = 0;
      for (let y = ty; y < ty + t; y++)
        for (let x = tx; x < tx + t; x++) {
          const i = y * W + x;
          if (!valid[i]) continue;
          const a = yu[i] - mx, b = ye[i] - my;
          ((vx += a * a), (vy += b * b), (cxy += a * b));
        }
      ((vx /= c), (vy /= c), (cxy /= c));
      const ssim = ((2 * mx * my + C1) * (2 * cxy + C2)) / ((mx * mx + my * my + C1) * (vx + vy + C2));
      sum += ssim;
      tiles++;
      if (!worst || ssim < min) ((min = ssim), (worst = { x: tx, y: ty, w: t, h: t }));
    }
  return {
    mad: (sad / judged) * 255,
    edge_diff: den > 1e-9 ? num / den : 0,
    ssim_mean: tiles ? sum / tiles : 1,
    ssim_min: tiles ? min : 1,
    changed_fraction: changed / judged,
    judged_cells: judged,
    worst_tile: worst,
    diff,
  };
}

/** pass / warn / fail with the metric(s) that decided it. */
export function judge(m, T = THRESHOLDS) {
  if (!m) return { verdict: 'fail', reasons: ['no art pixels are visible to check (mask, crop or hidden arc)'] };
  const over = (lim) =>
    [
      m.mad > lim.mad && `mad ${m.mad.toFixed(2)} > ${lim.mad}`,
      m.edge_diff > lim.edge_diff && `edge_diff ${m.edge_diff.toFixed(3)} > ${lim.edge_diff}`,
      m.ssim_min < lim.ssim_min && `ssim_min ${m.ssim_min.toFixed(3)} < ${lim.ssim_min}`,
      m.changed_fraction > lim.changed_fraction && `changed ${(m.changed_fraction * 100).toFixed(2)}% > ${+(lim.changed_fraction * 100).toFixed(2)}%`,
    ].filter(Boolean);
  const f = over(T.fail);
  if (f.length) return { verdict: 'fail', reasons: f };
  const w = over(T.pass);
  return { verdict: w.length ? 'warn' : 'pass', reasons: w };
}

const ramp = (t) => (t < 1 / 3 ? [t * 765, 0, 0] : t < 2 / 3 ? [255, (t - 1 / 3) * 765, 0] : [255, 255, (t - 2 / 3) * 765]);

/** Triptych PNG: expected | observed | heat (|diff| scaled so 25% = white; unjudged cells dark blue). */
function heatmapPNG(g, m, T = THRESHOLDS) {
  const { gw, gh, U, E, cover } = g;
  const sc = Math.max(1, Math.min(8, Math.ceil(160 / Math.max(gw, gh)))), gap = 4, pw = gw * sc, W = pw * 3 + gap * 2, H = gh * sc;
  const data = new Uint8ClampedArray(W * H * 4).fill(96);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const cell = [0, 0, 0, 0, 0, 0, 0, 0, 0]; // expected rgb, observed rgb, heat rgb
  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++) {
      const o = gy * gw + gx, ok = cover[o] >= T.min_coverage, dim = ok ? 255 : 255 * 0.35;
      for (let c = 0; c < 3; c++) ((cell[c] = E[o * 3 + c] * dim), (cell[c + 3] = U[o * 3 + c] * dim));
      if (ok) {
        const t = Math.min(1, (m?.diff[o] ?? 0) / 0.25), shade = 0.3 * luma(cell[0], cell[1], cell[2]) * (1 - t), h = ramp(t);
        for (let c = 0; c < 3; c++) cell[c + 6] = h[c] + shade;
      } else ((cell[6] = 24), (cell[7] = 24), (cell[8] = 56));
      for (let y = gy * sc; y < (gy + 1) * sc; y++)
        for (let x = gx * sc; x < (gx + 1) * sc; x++)
          for (let panel = 0; panel < 3; panel++) for (let c = 0; c < 3; c++) data[(y * W + x + panel * (pw + gap)) * 4 + c] = cell[panel * 3 + c];
    }
  return encodePNG({ width: W, height: H, data });
}

/**
 * verifyMockup({template, art, render, placement?, heatmap?, force?}) → report. Writes <render-stem>.verify.json and a
 * heatmap per placement (<render-stem>.verify-<id>.png, replaced on re-run; an explicit existing --heatmap needs force).
 */
export async function verifyMockup({ template, art, render, placement = null, heatmap = null, force = false }) {
  if (!template || !art || !render) throw new Error('usage: verifyMockup({template, art, render, placement?, heatmap?})');
  const R = path.resolve(render), A = path.resolve(art);
  for (const [f, what] of [[R, 'render'], [A, 'art']]) if (!fs.existsSync(f)) throw new Error(`${what} not found: ${f}`);
  const tpl = loadTemplate(template);
  const known = tpl.placements.map((p) => p.id);
  if (placement && !known.includes(placement)) throw new Error(`no placement "${placement}" in template (have: ${known.join(', ')})`);
  let side = null;
  try {
    side = JSON.parse(fs.readFileSync(`${R}.mockup.json`, 'utf8'));
  } catch {}
  // the expected image repeats the render's placement selection: its sidecar's list, else --placement, else all
  const listed = side?.placements?.map((p) => p.id).filter((id) => known.includes(id));
  const rendered = listed?.length ? listed : placement ? [placement] : known;
  if (placement && !rendered.includes(placement)) throw new Error(`placement "${placement}" was not rendered into ${path.basename(R)} (its sidecar lists: ${rendered.join(', ')})`);
  const checks = placement ? [placement] : rendered;
  const warnings = side ? [] : [`no render sidecar (${path.basename(R)}.mockup.json): the expected image assumes ${placement ? `only "${placement}"` : 'every placement'} was rendered; pass --placement if the render holds fewer`];
  const ctx = await prepare(tpl, A, { placements: rendered, artRaster: side?.art?.format === 'svg' ? side.art.raster : null, extra: [R] });
  const img = ctx.extra[0], W = tpl.base.width, H = tpl.base.height;
  if (img.width !== W || img.height !== H) throw new Error(`render is ${img.width}x${img.height} but the template base is ${W}x${H}; verify needs the render at template size (a resize or crop moves the geometry)`);
  const artSha = sha256(fs.readFileSync(A)), renderSha = sha256(fs.readFileSync(R));
  let provenance = { sidecar: false };
  if (side) {
    provenance = { sidecar: true, art_sha256_match: side.art?.sha256 === artSha, template_hash_match: side.template?.hash === tpl.hash, render_sha256_match: side.out?.sha256 === renderSha, engine_match: side.engine?.version === ENGINE.version };
    if (!provenance.art_sha256_match) warnings.push('the render sidecar records a different art file (sha256); comparing against the art given here');
    if (!provenance.template_hash_match) warnings.push('the render sidecar records a different template hash; the template changed since this render');
    if (!provenance.render_sha256_match) warnings.push('the render file changed after it was written (sha256 differs from its sidecar)');
  }
  const alphas = Object.fromEntries(checks.map((id) => [id, new Float32Array(W * H)]));
  const expected = compose(ctx, { alphas });
  const stem = R.replace(/\.[^./\\]+$/, '');
  const protectedFiles = [R, A, tpl.file, ...Object.values(tpl.abs)].map(realish);
  const guard = (p, explicit) => {
    assertNotOfficial(p);
    if (protectedFiles.includes(realish(p))) throw new Error(`refusing to overwrite an input with verify output: ${p}`);
    if (explicit && fs.existsSync(p) && !force) throw new Error(`output exists: ${p} (pass --force to replace it)`);
    return p;
  };
  const relOut = (p) => path.relative(path.dirname(R), p).split(path.sep).join('/');
  const results = checks.map((id) => {
    const job = ctx.jobs.find((j) => j.id === id);
    const g = unwarp(job, img, expected, alphas[id]);
    const valid = Uint8Array.from(g.cover, (c) => (c >= THRESHOLDS.min_coverage ? 1 : 0));
    const m = compareGrids(g.U, g.E, valid, g.gw, g.gh);
    const { verdict, reasons } = judge(m);
    const hm = heatmap ? guard(checks.length > 1 ? path.resolve(heatmap).replace(/(\.png)?$/i, `-${id}.png`) : path.resolve(heatmap), true) : guard(`${stem}.verify-${id}.png`, false);
    fs.writeFileSync(hm, heatmapPNG(g, m));
    let worst = null;
    if (m?.worst_tile) {
      const wt = m.worst_tile, a = job.art, fit = job.fit, p = new Float64Array(2);
      const s = fit.s0 + ((wt.x + wt.w / 2) / g.gw) * fit.sw, t = fit.t0 + ((wt.y + wt.h / 2) / g.gh) * fit.sh;
      const hit = job.mapper.fwd(s, t, p);
      const ax = a.u0 + (fit.s0 + (wt.x / g.gw) * fit.sw) * a.ku, ay = a.v0 + (fit.t0 + (wt.y / g.gh) * fit.sh) * a.kv;
      worst = { art_px: { x: Math.round(ax), y: Math.round(ay), w: Math.round((wt.w / g.gw) * a.rw), h: Math.round((wt.h / g.gh) * a.rh) }, base_px: hit ? { x: Math.round(p[0]), y: Math.round(p[1]) } : null, ssim: +m.ssim_min.toFixed(4) };
    }
    const round = (v, d) => +v.toFixed(d);
    return {
      placement: id,
      verdict,
      reasons,
      metrics: m && { mad: round(m.mad, 3), edge_diff: round(m.edge_diff, 4), ssim_mean: round(m.ssim_mean, 4), ssim_min: round(m.ssim_min, 4), changed_fraction: round(m.changed_fraction, 5), judged_cells: m.judged_cells },
      grid: { width: g.gw, height: g.gh },
      worst_tile: worst,
      heatmap: relOut(hm),
      heatmap_file: hm,
    };
  });
  const order = { pass: 0, warn: 1, fail: 2 };
  const verdict = results.reduce((v, r) => (order[r.verdict] > order[v] ? r.verdict : v), 'pass');
  const reportFile = guard(`${stem}.verify.json`, false);
  const rep = {
    kind: 'cstack.mockup.verify',
    cstack_version: CSTACK_VERSION,
    engine: ENGINE,
    created_at: nowISO(),
    ok: verdict !== 'fail',
    verdict,
    reference: 'the art composited by this template (deterministic re-render), compared in flat art space',
    render: { file: path.basename(R), sha256: renderSha, width: img.width, height: img.height },
    template: { dir: relOut(tpl.dir) || '.', id: tpl.id, hash: tpl.hash, licence_status: tpl.licence.client_use_allowed === true ? 'cleared' : tpl.licence.client_use_allowed === false ? 'blocked' : 'unknown' },
    art: { file: relOut(A), sha256: artSha, format: ctx.art.format, raster: ctx.art.raster },
    provenance,
    thresholds: THRESHOLDS,
    placements: results.map(({ heatmap_file, ...r }) => r),
    warnings: [...warnings, ...ctx.warnings.filter((w) => !/^SVG art (contains|embeds)/.test(w))],
  };
  writeJSON(reportFile, rep);
  return { ...rep, report_file: reportFile, heatmap_files: results.map((r) => r.heatmap_file) };
}
