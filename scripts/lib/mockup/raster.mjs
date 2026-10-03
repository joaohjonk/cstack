// Pixel helpers for the mockup engine. Images are {width, height, data: Uint8ClampedArray RGBA}; continuous coordinates
// put pixel centres at +0.5. The art is sampled from a premultiplied float mip pyramid (2×2 box levels, trilinear).

export const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b; // BT.601
export const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** Float32 luminance (0..255) per pixel. */
export function lumaMap(img) {
  const n = img.width * img.height, d = img.data, out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = luma(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
  return out;
}

/** Mask 0..1: the alpha channel when the image has any transparency, otherwise luminance (white = art shows). */
export function maskMap(img) {
  const n = img.width * img.height, d = img.data, out = new Float32Array(n);
  let alpha = false;
  for (let i = 0; i < n && !alpha; i++) alpha = d[i * 4 + 3] < 255;
  for (let i = 0; i < n; i++) out[i] = alpha ? d[i * 4 + 3] / 255 : luma(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) / 255;
  return out;
}

/** p-quantile (0..1) of the values of `map` at the given pixel indices, via a 256-bin histogram of 0..255 values. */
export function quantile(map, idx, p) {
  const h = new Float64Array(256);
  for (const i of idx) h[Math.max(0, Math.min(255, Math.round(map[i])))]++;
  let acc = 0;
  for (let v = 0; v < 256; v++) if ((acc += h[v]) >= p * idx.length) return v;
  return 255;
}

function halve(src, w, h, bytes) {
  const W = Math.max(1, Math.ceil(w / 2)), H = Math.max(1, Math.ceil(h / 2)), d = new Float32Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const xa = 2 * x, xb = Math.min(2 * x + 1, w - 1), ya = 2 * y, yb = Math.min(2 * y + 1, h - 1);
      const o = (y * W + x) * 4;
      for (const k of [(ya * w + xa) * 4, (ya * w + xb) * 4, (yb * w + xa) * 4, (yb * w + xb) * 4]) {
        const a = bytes ? src[k + 3] / 255 : 1;
        const f = bytes ? a / 255 / 4 : 0.25;
        d[o] += src[k] * f;
        d[o + 1] += src[k + 1] * f;
        d[o + 2] += src[k + 2] * f;
        d[o + 3] += bytes ? a / 4 : src[k + 3] / 4;
      }
    }
  return { w: W, h: H, d };
}

/** Premultiplied pyramid down to 1×1. Levels finer than `minLevel` are never stored (bounds memory for oversized art). */
export function buildPyramid(img, minLevel = 0) {
  const { width: w0, height: h0, data } = img;
  const levels = [];
  let cur;
  if (minLevel <= 0) {
    const d = new Float32Array(w0 * h0 * 4);
    for (let i = 0; i < w0 * h0; i++) {
      const a = data[i * 4 + 3] / 255;
      d[i * 4] = (data[i * 4] / 255) * a;
      d[i * 4 + 1] = (data[i * 4 + 1] / 255) * a;
      d[i * 4 + 2] = (data[i * 4 + 2] / 255) * a;
      d[i * 4 + 3] = a;
    }
    cur = { w: w0, h: h0, d };
  } else cur = halve(data, w0, h0, true);
  let level = minLevel <= 0 ? 0 : 1, base = -1;
  for (;;) {
    const last = cur.w === 1 && cur.h === 1;
    if (level >= minLevel || (last && base < 0)) {
      if (base < 0) base = level;
      levels.push(cur);
    }
    if (last) break;
    cur = halve(cur.d, cur.w, cur.h, false);
    level++;
  }
  return { base, w0, h0, levels };
}

function bilinearLevel(pyr, k, u, v, out, wgt, reset) {
  const L = pyr.levels[k], d = L.d;
  const x = (u * L.w) / pyr.w0 - 0.5, y = (v * L.h) / pyr.h0 - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const xa = x0 < 0 ? 0 : x0 >= L.w ? L.w - 1 : x0, xb = x0 + 1 < 0 ? 0 : x0 + 1 >= L.w ? L.w - 1 : x0 + 1;
  const ya = y0 < 0 ? 0 : y0 >= L.h ? L.h - 1 : y0, yb = y0 + 1 < 0 ? 0 : y0 + 1 >= L.h ? L.h - 1 : y0 + 1;
  const o00 = (ya * L.w + xa) * 4, o10 = (ya * L.w + xb) * 4, o01 = (yb * L.w + xa) * 4, o11 = (yb * L.w + xb) * 4;
  const w00 = (1 - fx) * (1 - fy) * wgt, w10 = fx * (1 - fy) * wgt, w01 = (1 - fx) * fy * wgt, w11 = fx * fy * wgt;
  for (let c = 0; c < 4; c++) {
    const val = d[o00 + c] * w00 + d[o10 + c] * w10 + d[o01 + c] * w01 + d[o11 + c] * w11;
    out[c] = reset ? val : out[c] + val;
  }
}

/** Trilinear sample at art pixel coords (u, v); rho = art pixels per screen pixel. Writes premultiplied RGBA 0..1. */
export function sampleArt(pyr, u, v, rho, out) {
  const n = pyr.levels.length - 1;
  const li = Math.max(0, (rho > 1 ? Math.log2(rho) : 0) - pyr.base);
  if (li >= n) return bilinearLevel(pyr, n, u, v, out, 1, true);
  const l0 = Math.floor(li), f = li - l0;
  bilinearLevel(pyr, l0, u, v, out, 1 - f, true);
  if (f > 0) bilinearLevel(pyr, l0 + 1, u, v, out, f, false);
}

/** Bilinear read of an 8-bit RGBA image at continuous (x, y), clamped at the borders. Writes straight RGBA 0..1. */
export function sampleRGBA(img, x, y, out) {
  const { width: W, height: H, data: d } = img;
  const fx0 = x - 0.5, fy0 = y - 0.5, x0 = Math.floor(fx0), y0 = Math.floor(fy0), fx = fx0 - x0, fy = fy0 - y0;
  const xa = Math.min(W - 1, Math.max(0, x0)), xb = Math.min(W - 1, Math.max(0, x0 + 1));
  const ya = Math.min(H - 1, Math.max(0, y0)), yb = Math.min(H - 1, Math.max(0, y0 + 1));
  const o00 = (ya * W + xa) * 4, o10 = (ya * W + xb) * 4, o01 = (yb * W + xa) * 4, o11 = (yb * W + xb) * 4;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
  for (let c = 0; c < 4; c++) out[c] = (d[o00 + c] * w00 + d[o10 + c] * w10 + d[o01 + c] * w01 + d[o11 + c] * w11) / 255;
}

/** Bilinear read of a per-pixel Float32 map at continuous (x, y), clamped at the borders. */
export function sampleMap(map, W, H, x, y) {
  const fx0 = x - 0.5, fy0 = y - 0.5, x0 = Math.floor(fx0), y0 = Math.floor(fy0), fx = fx0 - x0, fy = fy0 - y0;
  const xa = Math.min(W - 1, Math.max(0, x0)), xb = Math.min(W - 1, Math.max(0, x0 + 1));
  const ya = Math.min(H - 1, Math.max(0, y0)), yb = Math.min(H - 1, Math.max(0, y0 + 1));
  return (map[ya * W + xa] * (1 - fx) + map[ya * W + xb] * fx) * (1 - fy) + (map[yb * W + xa] * (1 - fx) + map[yb * W + xb] * fx) * fy;
}
