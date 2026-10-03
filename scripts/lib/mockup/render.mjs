// cstack mockup render: composite official art onto a template with deterministic math (no model calls, no new deps).
// Per placement, each base pixel in its region is displaced, inverse-mapped to art coordinates and sampled from a
// premultiplied mip pyramid (trilinear, up to 8 taps along the footprint's major axis; footprint from 1-px finite
// differences). Edges get a 1 px antialiased ramp plus `feather`. Effective alpha = art alpha × edge × mask; multiply /
// screen layers shade the art, which is then laid "over" the base. Pixels outside every placement region stay
// byte-identical to the base. Same inputs → same bytes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { writeAtomic, writeJSON, nowISO } from '../core.mjs';
import { imageSize } from '../image.mjs';
import { encodePNG } from '../image/png.mjs';
import { decodeImages, formatOf, svgInfo } from '../image/decode.mjs';
import { fitRect, footprint } from './geometry.mjs';
import { lumaMap, maskMap, quantile, buildPyramid, sampleArt, smooth } from './raster.mjs';
import { loadTemplate, licenceGate } from './template.mjs';

export const ENGINE = { name: 'cstack-mockup', version: 1 };
export const MAX_RASTER = 4096; // longest side of a rasterized SVG
const CSTACK_VERSION = createRequire(import.meta.url)('../../../package.json').version;

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
export const realish = (p) => (fs.existsSync(p) ? fs.realpathSync(p) : path.join(fs.existsSync(path.dirname(p)) ? fs.realpathSync(path.dirname(p)) : path.dirname(p), path.basename(p)));

function artInfo(file) {
  const format = formatOf(file);
  if (!format) throw new Error(`art is not PNG, JPEG, WebP, GIF or SVG: ${file}`);
  if (format === 'svg') {
    const info = svgInfo(fs.readFileSync(file, 'utf8'));
    return { format, width: info.width, height: info.height, svg: info };
  }
  const { width, height } = imageSize(file);
  return { format, width, height };
}

/**
 * Load template + art and build what the pixel loop needs. Shared by render and verify.
 * opts.placements: ids to composite (default all); opts.artRaster: {width, height} to reuse for SVG art (verify passes the
 * render's); opts.extra: more image files decoded in the same session (returned as ctx.extra).
 */
export async function prepare(template, artFile, { placements: ids = null, artRaster = null, extra = [] } = {}) {
  const tpl = typeof template === 'string' ? loadTemplate(template) : template;
  const chosen = ids ? ids.map((id) => tpl.placements.find((p) => p.id === id) ?? fail(`no placement "${id}" in template (have: ${tpl.placements.map((p) => p.id).join(', ')})`)) : tpl.placements;
  const art = artInfo(artFile);
  const warnings = [];
  const geo = chosen.map((p) => {
    const ar = p.art_region ?? { x: 0, y: 0, w: 1, h: 1 };
    const regionAspect = (ar.w * art.width) / (ar.h * art.height);
    const fit = fitRect(p.fit ?? 'contain', regionAspect, p.aspect);
    const E = { s0: Math.max(0, fit.s0), s1: Math.min(1, fit.s0 + fit.sw), t0: Math.max(0, fit.t0), t1: Math.min(1, fit.t0 + fit.sh) };
    const fp = footprint(p.mapper, E);
    if (!fp) fail(`placement "${p.id}": no part of the art is visible`);
    if (p.aspect && (p.fit ?? 'contain') === 'stretch' && Math.abs(regionAspect / p.aspect - 1) > 0.03)
      warnings.push(`placement "${p.id}": art stretched ${(Math.abs(regionAspect / p.aspect - 1) * 100).toFixed(1)}% out of proportion (fit stretch); official art should not distort beyond 3%`);
    if (p.aspect && p.fit === 'cover' && Math.max(fit.sw, fit.sh) > 1.005) warnings.push(`placement "${p.id}": fit cover crops ${((1 - 1 / Math.max(fit.sw, fit.sh)) * 100).toFixed(1)}% of the art`);
    return { p, ar, fit, E, fp };
  });

  // SVG: raster so the most magnified point gets >= 2 art px per screen px (mip levels filter it down), capped
  let raster = null;
  if (art.format === 'svg') {
    if (artRaster?.width > 0 && artRaster?.height > 0) raster = { width: artRaster.width, height: artRaster.height };
    else {
      const need = Math.max(...geo.map((g) => Math.max((g.fp.js * g.fit.sw) / g.ar.w, ((g.fp.jt * g.fit.sh) / g.ar.h) * (art.width / art.height))));
      let w = Math.max(16, Math.ceil(2 * need)), h = Math.max(1, Math.round((w * art.height) / art.width));
      if (Math.max(w, h) > MAX_RASTER) {
        const k = MAX_RASTER / Math.max(w, h);
        ((w = Math.max(1, Math.round(w * k))), (h = Math.max(1, Math.round(h * k))));
        warnings.push(`SVG art rasterized at the ${MAX_RASTER}px cap (${w}x${h}); fine detail in the largest placement may soften`);
      }
      raster = { width: w, height: h };
    }
    if (art.svg.has_text) warnings.push('SVG art contains <text>: it renders with whatever fonts this machine has; outline text in masters');
    if (art.svg.has_raster) warnings.push('SVG art embeds a raster <image>: its resolution limits the render');
  }

  // decode every image once, in one Chromium session if any needs it
  const want = new Map();
  const add = (file, size) => (want.has(file) || want.set(file, { file, ...size }), file);
  add(tpl.base.file);
  for (const g of geo) [g.p.maskFile, g.p.displacementFile, ...g.p.shadingFiles].filter(Boolean).forEach((f) => add(f));
  add(artFile, raster ?? {});
  extra.forEach((f) => add(f));
  const keys = [...want.keys()];
  const imgs = await decodeImages([...want.values()]);
  const img = (f) => imgs[keys.indexOf(f)];
  const base = img(tpl.base.file), artImg = img(artFile);
  const W = base.width, H = base.height;
  for (const f of keys.filter((f) => f !== artFile && !extra.includes(f) && f !== tpl.base.file))
    if (img(f).width !== W || img(f).height !== H) fail(`${path.relative(tpl.dir, f)} is ${img(f).width}x${img(f).height}; template maps must match the ${W}x${H} base`);

  let baseLuma = null;
  const getLuma = () => (baseLuma ??= lumaMap(base));
  const q = new Float64Array(3);
  let rhoMin = Infinity;
  const jobs = geo.map(({ p, ar, fit, E, fp }) => {
    const rx = ar.x * artImg.width, ry = ar.y * artImg.height, rw = ar.w * artImg.width, rh = ar.h * artImg.height;
    const ku = rw / fit.sw, kv = rh / fit.sh;
    const mag = Math.max((fp.js * fit.sw) / rw, (fp.jt * fit.sh) / rh); // screen px per art px where most enlarged
    rhoMin = Math.min(rhoMin, 1 / mag);
    if (art.format !== 'svg' && mag > 1.5)
      warnings.push(`placement "${p.id}": art enlarged up to ${mag.toFixed(1)}x; supply at least ${Math.ceil(artImg.width * mag)}x${Math.ceil(artImg.height * mag)} px art for a sharp render`);
    const d = p.displacement;
    const sx = d ? d.strength_x ?? d.strength : 0, sy = d ? d.strength_y ?? d.strength : 0;
    const pad = 2 + (p.feather ?? 0) + Math.max(Math.abs(sx), Math.abs(sy));
    const r = p.region ?? { x: 0, y: 0, w: W, h: H };
    const region = {
      x0: Math.max(r.x, Math.floor(fp.bbox.x0 - pad)),
      y0: Math.max(r.y, Math.floor(fp.bbox.y0 - pad)),
      x1: Math.min(r.x + r.w, Math.ceil(fp.bbox.x1 + pad)),
      y1: Math.min(r.y + r.h, Math.ceil(fp.bbox.y1 + pad)),
    };
    if (region.x1 <= region.x0 || region.y1 <= region.y0) fail(`placement "${p.id}" lies outside the base (and its region)`);
    // luminance percentiles of the base inside the footprint, for maps derived from the base
    let stats = null;
    if (d?.from === 'base' || (p.shading ?? []).some((l) => l.from === 'base')) {
      const idx = [];
      for (let y = region.y0; y < region.y1; y++)
        for (let x = region.x0; x < region.x1; x++)
          if (p.mapper.inv(x + 0.5, y + 0.5, q) && q[0] >= E.s0 && q[0] <= E.s1 && q[1] >= E.t0 && q[1] <= E.t1 && q[2] >= 0) idx.push(y * W + x);
      stats = idx.length ? { p2: quantile(getLuma(), idx, 0.02), p98: quantile(getLuma(), idx, 0.98) } : { p2: 0, p98: 255 };
    }
    let disp = null;
    if (d) {
      let luma = d.map ? lumaMap(img(p.displacementFile)) : getLuma();
      if (d.from === 'base') {
        const span = Math.max(1, stats.p98 - stats.p2);
        luma = luma.map((v) => Math.min(255, Math.max(0, ((v - stats.p2) / span) * 255)));
      }
      disp = { luma, neutral: d.neutral ?? 128, sx, sy };
    }
    const layers = (p.shading ?? []).map((l, i) => {
      const layer = { screen: l.mode === 'screen', opacity: l.opacity ?? 1, rgba: null, gray: null };
      if (l.map) layer.rgba = img(p.shadingFiles[i]).data;
      else if (l.mode === 'multiply') layer.gray = getLuma().map((v) => Math.min(1, v / Math.max(1, stats.p98)));
      else {
        const th = l.threshold ?? 0.8;
        layer.gray = getLuma().map((v) => smooth((v / 255 - th) / (1 - th)));
      }
      return layer;
    });
    return {
      id: p.id,
      kind: p.kind,
      mapper: p.mapper,
      fit,
      E,
      fp,
      feather: p.feather ?? 0,
      region,
      mask: p.maskFile ? maskMap(img(p.maskFile)) : null,
      disp,
      layers,
      art: { u0: rx - fit.s0 * ku, ku, v0: ry - fit.t0 * kv, kv, ulo: rx + Math.min(0.5, rw / 2), uhi: rx + rw - Math.min(0.5, rw / 2), vlo: ry + Math.min(0.5, rh / 2), vhi: ry + rh - Math.min(0.5, rh / 2), rw, rh },
      spec: { aspect: p.aspect ?? null, fit: p.aspect ? p.fit ?? 'contain' : 'stretch', art_region: ar },
    };
  });
  const minLevel = Math.max(0, Math.floor(Math.log2(Math.max(rhoMin, 1e-9))) - 1);
  return {
    tpl,
    base,
    jobs,
    pyr: buildPyramid(artImg, minLevel),
    art: { ...art, raster: { width: artImg.width, height: artImg.height }, engine: artImg.engine },
    extra: extra.map((f) => img(f)),
    engines: [...new Set(imgs.map((i) => `${i.engine.name} ${i.engine.version}`))],
    warnings,
  };
}

function fail(msg) {
  throw new Error(msg);
}

// Up to 8 trilinear taps along the footprint's major axis (a cylinder rim compresses one way only), each at the level
// of major/n. (xu, xv) and (yu, yv): art px per screen px step in x and in y.
function sampleFootprint(pyr, art, u, v, xu, xv, yu, yv, out, tap) {
  const lx = Math.hypot(xu, xv), ly = Math.hypot(yu, yv), major = Math.max(lx, ly), minor = Math.min(lx, ly);
  const n = Math.max(1, Math.min(8, Math.ceil(major / Math.max(minor, 1e-9) - 1e-6)));
  const au = lx >= ly ? xu : yu, av = lx >= ly ? xv : yv;
  out[0] = out[1] = out[2] = out[3] = 0;
  for (let k = 0; k < n; k++) {
    const f = n === 1 ? 0 : (k + 0.5) / n - 0.5, su = u + au * f, sv = v + av * f;
    sampleArt(pyr, su < art.ulo ? art.ulo : su > art.uhi ? art.uhi : su, sv < art.vlo ? art.vlo : sv > art.vhi ? art.vhi : sv, major / n, tap);
    for (let c = 0; c < 4; c++) out[c] += tap[c] / n;
  }
}

function renderJob(job, pyr, out, alphaOut) {
  const { mapper, E, art, mask, disp, layers, region } = job;
  const W = out.width, px = out.data, ramp = job.feather + 1;
  const q = new Float64Array(3), qa = new Float64Array(3), c = new Float64Array(4), tap = new Float64Array(4);
  for (let y = region.y0; y < region.y1; y++) {
    for (let x = region.x0; x < region.x1; x++) {
      const i = y * W + x;
      let cx = x + 0.5, cy = y + 0.5;
      if (disp) {
        const d = (disp.luma[i] - disp.neutral) / 255;
        cx += d * disp.sx;
        cy += d * disp.sy;
      }
      if (!mapper.inv(cx, cy, q)) continue;
      const s = q[0], t = q[1];
      let dsx, dtx, dsy, dty;
      if (mapper.inv(cx + 1, cy, qa)) ((dsx = qa[0] - s), (dtx = qa[1] - t));
      else if (mapper.inv(cx - 1, cy, qa)) ((dsx = s - qa[0]), (dtx = t - qa[1]));
      else continue;
      if (mapper.inv(cx, cy + 1, qa)) ((dsy = qa[0] - s), (dty = qa[1] - t));
      else if (mapper.inv(cx, cy - 1, qa)) ((dsy = s - qa[0]), (dty = t - qa[1]));
      else continue;
      // screen-px distance to the nearest art edge (and to the mapper's visibility limit) → antialiased coverage
      const gs = Math.hypot(dsx, dsy), gt = Math.hypot(dtx, dty);
      const de = Math.min(gs > 0 ? Math.min(s - E.s0, E.s1 - s) / gs : Infinity, gt > 0 ? Math.min(t - E.t0, E.t1 - t) / gt : Infinity, q[2]);
      const cov = smooth((de + 0.5) / ramp);
      const m = mask ? mask[i] : 1;
      if (cov <= 0 || m <= 0) continue;
      sampleFootprint(pyr, art, art.u0 + s * art.ku, art.v0 + t * art.kv, dsx * art.ku, dtx * art.kv, dsy * art.ku, dty * art.kv, c, tap);
      const a = c[3] * cov * m;
      if (a < 1 / 1024) continue;
      let r = c[0] / c[3], g = c[1] / c[3], b = c[2] / c[3];
      for (const L of layers) {
        let mr, mg, mb, op = L.opacity;
        if (L.rgba) ((mr = L.rgba[i * 4] / 255), (mg = L.rgba[i * 4 + 1] / 255), (mb = L.rgba[i * 4 + 2] / 255), (op *= L.rgba[i * 4 + 3] / 255));
        else mr = mg = mb = L.gray[i];
        if (L.screen) ((r += op * mr * (1 - r)), (g += op * mg * (1 - g)), (b += op * mb * (1 - b)));
        else ((r *= 1 - op + op * mr), (g *= 1 - op + op * mg), (b *= 1 - op + op * mb));
      }
      const o = i * 4, ba = px[o + 3] / 255, oa = a + ba * (1 - a), k = ba * (1 - a);
      px[o] = (r * 255 * a + px[o] * k) / oa;
      px[o + 1] = (g * 255 * a + px[o + 1] * k) / oa;
      px[o + 2] = (b * 255 * a + px[o + 2] * k) / oa;
      px[o + 3] = oa * 255;
      if (alphaOut) alphaOut[i] = a;
    }
  }
}

/** Composite the prepared placements over a copy of the base. alphas: {placementId: Float32Array(W*H)} to receive alpha. */
export function compose(ctx, { alphas = {} } = {}) {
  const out = { width: ctx.base.width, height: ctx.base.height, data: new Uint8ClampedArray(ctx.base.data) };
  for (const job of ctx.jobs) renderJob(job, ctx.pyr, out, alphas[job.id] ?? null);
  return out;
}

/**
 * renderMockup({template, art, out, placement?, force?, internal?}): writes `out` (PNG) and `<out>.mockup.json`.
 * Never writes over an input; an existing out needs force. A licence with client_use_allowed false throws BLOCKED before
 * any work. Returns the sidecar record plus absolute out/sidecar paths.
 */
export async function renderMockup({ template, art, out, placement = null, force = false, internal = false }) {
  const T0 = performance.now();
  if (!template || !art || !out) throw new Error('usage: renderMockup({template, art, out, placement?, force?, internal?})');
  const O = path.resolve(out), A = path.resolve(art), side = `${O}.mockup.json`;
  if (path.extname(O).toLowerCase() !== '.png') throw new Error(`--out must be a .png file (got "${path.basename(O)}")`);
  if (!fs.existsSync(A)) throw new Error(`art not found: ${A}`);
  const tpl = loadTemplate(template);
  const gate = licenceGate(tpl.licence, { internal });
  if (gate.error) throw new Error(gate.error);
  const inputs = [A, tpl.file, ...Object.values(tpl.abs)].map(realish);
  for (const p of [O, side]) if (inputs.includes(realish(p))) throw new Error('refusing to overwrite an input; choose a new --out (template files and art are never edited)');
  if (!force) for (const p of [O, side]) if (fs.existsSync(p)) throw new Error(`output exists: ${p} (pass --force to replace a previous render; inputs are never replaced)`);

  const ctx = await prepare(tpl, A, { placements: placement ? [placement] : null });
  const T1 = performance.now();
  const img = compose(ctx);
  const T2 = performance.now();
  const bytes = encodePNG(img);
  const T3 = performance.now();
  writeAtomic(O, bytes);
  const rel = (p) => path.relative(path.dirname(O), p).split(path.sep).join('/') || '.';
  const warnings = [...(gate.warning ? [gate.warning] : []), ...ctx.warnings];
  const rec = {
    kind: 'cstack.mockup.render',
    cstack_version: CSTACK_VERSION,
    engine: { ...ENGINE, decoders: ctx.engines },
    created_at: nowISO(),
    out: { file: path.basename(O), sha256: sha256(bytes), width: img.width, height: img.height },
    template: { dir: rel(tpl.dir), id: tpl.id, hash: tpl.hash, files: tpl.files },
    art: { file: rel(A), sha256: sha256(fs.readFileSync(A)), format: ctx.art.format, intrinsic: { width: ctx.art.width, height: ctx.art.height }, raster: ctx.art.raster },
    placements: ctx.jobs.map((j) => ({ id: j.id, kind: j.kind, region: { x: j.region.x0, y: j.region.y0, w: j.region.x1 - j.region.x0, h: j.region.y1 - j.region.y0 }, ...j.spec })),
    licence: { ...tpl.licence, status: gate.status, client_facing: gate.client_facing },
    timings_ms: { load: Math.round(T1 - T0), render: Math.round(T2 - T1), encode: Math.round(T3 - T2), total: Math.round(performance.now() - T0) },
    warnings,
  };
  writeJSON(side, rec);
  return { ...rec, out_file: O, sidecar_file: side };
}
