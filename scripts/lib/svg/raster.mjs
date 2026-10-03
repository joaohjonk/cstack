// Rasterizing and measuring SVG for svg reduce and svg kit.
// Rendering: headless Chromium through the optional playwright-core (scripts/lib/browser/launch.mjs, which never
// downloads a browser). The SVG is drawn as an <img> from a data: URI, so it renders in secure static mode (no scripts,
// no external loads), and every network request of the page is aborted as well.
// Measuring: pure functions on coverage maps (alpha 0..1): area resampling, components and holes, an exact Euclidean
// distance transform (Felzenszwalb & Huttenlocher, "Distance Transforms of Sampled Functions", 2012) and a
// morphological opening that isolates features thinner than one device pixel.

/** {ok: true, engine} when playwright-core and a Chromium are present and launch; else {ok: false, reason: 'MISSING: ...'}. */
export async function chromiumStatus() {
  try {
    const { loadEngine, launch } = await import('../browser/launch.mjs');
    const eng = await loadEngine();
    const b = await launch(eng);
    const version = b.version();
    await b.close();
    return { ok: true, engine: { name: 'chromium', version, executable: eng.executable } };
  } catch (e) {
    const msg = e.message.split('\n')[0];
    return { ok: false, reason: msg.startsWith('MISSING') ? msg : `MISSING: Chromium unavailable (${msg})` };
  }
}

/** One browser for a batch of renders. fn({render, page, engine}); render(svgText, {width, height, background}) -> RGBA image. */
export async function withRenderer(fn) {
  const { loadEngine, launch } = await import('../browser/launch.mjs');
  const eng = await loadEngine();
  const browser = await launch(eng);
  try {
    const context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block', javaScriptEnabled: true, deviceScaleFactor: 1, viewport: { width: 1280, height: 800 } });
    await context.route('**/*', (r) => r.abort('blockedbyclient'));
    const page = await context.newPage();
    await page.setContent('<!doctype html><meta charset="utf-8"><body style="margin:0"></body>');
    const engine = { name: 'chromium', version: browser.version(), executable: eng.executable };
    const render = async (svg, { width, height, background = null }) => {
      const b64 = await page.evaluate(
        async ({ src, w, h, bg }) => {
          const img = new Image();
          img.src = src;
          try {
            await img.decode();
          } catch {
            throw new Error('Chromium could not decode the SVG as an image (malformed XML or a namespace error)');
          }
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          if (bg) {
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, w, h);
          }
          ctx.drawImage(img, 0, 0, w, h);
          const d = ctx.getImageData(0, 0, w, h).data;
          let s = '';
          for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
          return btoa(s);
        },
        { src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, w: width, h: height, bg: background },
      );
      const buf = Buffer.from(b64, 'base64');
      return { width, height, data: new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.length) };
    };
    return await fn({ render, page, engine });
  } finally {
    await browser.close().catch(() => {});
  }
}

/** 'png' | 'jpeg' | 'webp' | 'gif' from magic bytes, else null (SVG and anything else). */
export function rasterFormat(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf.readUInt32BE(0) === 0x89504e47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  return null;
}

// ---------- pure measurements ----------
export function coverage(img) {
  const n = img.width * img.height;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = img.data[i * 4 + 3] / 255;
  return out;
}

/** Ink against an opaque background: a channel differs from `bg` by more than 20% (51/255). */
export function inkAgainst(img, bg) {
  const n = img.width * img.height;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    out[i] = Math.max(Math.abs(img.data[o] - bg[0]), Math.abs(img.data[o + 1] - bg[1]), Math.abs(img.data[o + 2] - bg[2])) > 51 ? 1 : 0;
  }
  return out;
}

/** Area-weighted resample of a W x H map to w x h (exact box filter for any ratio). */
export function resample(src, W, H, w, h) {
  const taps = (N, n) => {
    const s = N / n;
    return Array.from({ length: n }, (_, i) => {
      const a = i * s, b = a + s, t = [];
      for (let k = Math.floor(a); k < Math.min(N, Math.ceil(b)); k++) t.push([k, (Math.min(b, k + 1) - Math.max(a, k)) / s]);
      return t;
    });
  };
  const tx = taps(W, w), ty = taps(H, h);
  const tmp = new Float32Array(w * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (const [k, wt] of tx[x]) v += src[y * W + k] * wt;
      tmp[y * w + x] = v;
    }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (const [k, wt] of ty[y]) v += tmp[k * w + x] * wt;
      out[y * w + x] = v;
    }
  return out;
}

export function binarize(cov, thr = 0.5) {
  const out = new Uint8Array(cov.length);
  for (let i = 0; i < cov.length; i++) out[i] = cov[i] >= thr ? 1 : 0;
  return out;
}

function label(mask, w, h, eight, onComp) {
  const n = w * h;
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  const nb = eight ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] : [[0, -1], [-1, 0], [1, 0], [0, 1]];
  for (let i = 0; i < n; i++) {
    if (!mask[i] || seen[i]) continue;
    let top = 0, border = false;
    const px = [];
    stack[top++] = i;
    seen[i] = 1;
    while (top) {
      const p = stack[--top];
      px.push(p);
      const x = p % w, y = (p / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
      for (const [dx, dy] of nb) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (mask[q] && !seen[q]) {
          seen[q] = 1;
          stack[top++] = q;
        }
      }
    }
    onComp(px, border);
  }
}

/** Ink parts (8-connected) and holes (4-connected background not touching the border), ignoring areas < minArea. */
export function topology(bin, w, h, minArea = 1) {
  let components = 0, holes = 0;
  label(bin, w, h, true, (px) => {
    if (px.length >= minArea) components++;
  });
  const bg = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bg[i] = bin[i] ? 0 : 1;
  label(bg, w, h, false, (px, border) => {
    if (!border && px.length >= minArea) holes++;
  });
  return { components, holes };
}

const INF = 1e20;
function dt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** Squared Euclidean distance from every pixel to the nearest pixel where `targets` is 1 (exact). */
export function edtSq(targets, w, h) {
  const out = new Float32Array(w * h);
  const m = Math.max(w, h);
  const f = new Float64Array(m), d = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = targets[y * w + x] ? 0 : INF;
    dt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) out[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = out[y * w + x];
    dt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) out[y * w + x] = d[x];
  }
  return out;
}

/**
 * Prepare sub-pixel feature detection on a high-res binary silhouette: pads with background (so the canvas edge is
 * not ink) and computes the size-independent distance maps once. maxD: the largest disk diameter to be tested.
 */
export function prepareThin(bin, w, h, maxD) {
  const P = Math.ceil(maxD / 2) + 2;
  const pw = w + 2 * P, ph = h + 2 * P;
  const ink = new Uint8Array(pw * ph);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ink[(y + P) * pw + x + P] = bin[y * w + x];
  const bg = new Uint8Array(pw * ph);
  for (let i = 0; i < bg.length; i++) bg[i] = ink[i] ? 0 : 1;
  return { pw, ph, ink, bg, toBg: edtSq(bg, pw, ph), toInk: edtSq(ink, pw, ph) };
}

/**
 * Features thinner than D pixels: the set minus its opening by a disk of diameter D. Residue blobs under D*D/2 are
 * corner rounding, not features. Returns areas in high-res px and the thinnest feature as a fraction of D.
 */
export function thinFeatures(prep, D) {
  const r = D / 2;
  const { pw, ph } = prep;
  const run = (set, dist) => {
    if (r <= 0.5) return { area: 0, count: 0, thinnest: null };
    const er = new Uint8Array(set.length);
    const t1 = (r - 0.5) ** 2, t2 = (r + 0.5) ** 2;
    for (let i = 0; i < set.length; i++) er[i] = set[i] && dist[i] > t1 ? 1 : 0;
    const dEr = edtSq(er, pw, ph);
    const resid = new Uint8Array(set.length);
    for (let i = 0; i < set.length; i++) resid[i] = set[i] && !(dEr[i] <= t2) ? 1 : 0;
    let area = 0, count = 0, thinnest = null;
    label(resid, pw, ph, true, (px) => {
      if (px.length < (D * D) / 2) return;
      area += px.length;
      count++;
      let maxd = 0;
      for (const p of px) if (dist[p] > maxd) maxd = dist[p];
      const t = Math.max(1, 2 * Math.sqrt(maxd) - 1) / D;
      if (thinnest == null || t < thinnest) thinnest = t;
    });
    return { area, count, thinnest };
  };
  return { ink: run(prep.ink, prep.toBg), gap: run(prep.bg, prep.toInk) };
}

/** Largest distance of ink (alpha above thr) from (cx, cy), and how many ink pixels lie beyond radius R. */
export function radialInk(cov, w, h, cx, cy, R, thr = 8 / 255) {
  let maxR = 0, outside = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (cov[y * w + x] <= thr) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > maxR) maxR = d;
      if (d > R) outside++;
    }
  return { maxR, outside };
}

/** Ink of an opaque raster: each pixel's largest channel distance from the background color, divided by `scale` (0..1). */
export function inkFromBackground(img, bg, scale = 1) {
  const n = img.width * img.height;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const d = Math.max(Math.abs(img.data[o] - bg[0]), Math.abs(img.data[o + 1] - bg[1]), Math.abs(img.data[o + 2] - bg[2])) / 255;
    out[i] = Math.min(1, d / scale);
  }
  return out;
}

/** RGBA image of black ink at `cov` over an opaque background color. */
export function inkOver(cov, w, h, bg = [255, 255, 255], ink = [0, 0, 0]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = cov[i];
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(ink[c] * a + bg[c] * (1 - a));
    data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}
