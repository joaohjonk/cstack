// Local, deterministic region paste for /image-edit (crop-edit-paste, composites). No paid calls, no new deps.
// Pastes a patch (optionally a region of a source image) onto a base image at x,y with a feathered edge and
// writes a NEW file the same size as the base. Inputs are never overwritten.
//
// Engines, cheapest first:
//   node     - pure Node (zlib) PNG decode/encode: 8/16-bit gray, gray+alpha, RGB, RGBA and 8-bit palette, non-interlaced.
//   chromium - canvas in headless Chromium via the optional playwright-core (JPEG, WebP, interlaced PNG, other variants).
// When neither can handle the inputs the call fails with a one-line MISSING message; nothing is installed.
//
// Mask: alpha = smoothstep(clamp(d / feather)), d = distance (px) from the patch's nearest edge, multiplied by the
// patch's own alpha. feather 0 = hard edge. Pixels outside the patch rectangle are byte-identical to the base.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// ---------- PNG codec (pure Node) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export class UnsupportedImage extends Error {}

/** Decode a PNG buffer to {width, height, data: Uint8ClampedArray RGBA}. Throws UnsupportedImage for variants it skips. */
export function decodePNG(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new UnsupportedImage('not a PNG');
  let off = 8;
  let ihdr = null;
  let palette = null;
  let trns = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') ihdr = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], color: body[9], interlace: body[12] };
    else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') trns = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (!ihdr) throw new UnsupportedImage('PNG without IHDR');
  const { width, height, depth, color, interlace } = ihdr;
  if (interlace) throw new UnsupportedImage('interlaced PNG');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  if (!channels) throw new UnsupportedImage(`PNG color type ${color}`);
  if (color === 3 ? depth !== 8 : depth !== 8 && depth !== 16) throw new UnsupportedImage(`PNG bit depth ${depth} for color type ${color}`);
  const bpc = depth / 8;
  const bpp = channels * bpc;
  const stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = px.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (ft !== 0) throw new UnsupportedImage(`PNG filter ${ft}`);
      cur[i] = v & 0xff;
    }
    prev = cur;
  }
  const data = new Uint8ClampedArray(width * height * 4);
  const s = (i) => px[i * bpc]; // high byte for 16-bit
  for (let p = 0; p < width * height; p++) {
    const o = p * channels;
    let r, g, b, a = 255;
    if (color === 0) r = g = b = s(o);
    else if (color === 4) ((r = g = b = s(o)), (a = s(o + 1)));
    else if (color === 2) ((r = s(o)), (g = s(o + 1)), (b = s(o + 2)));
    else if (color === 6) ((r = s(o)), (g = s(o + 1)), (b = s(o + 2)), (a = s(o + 3)));
    else {
      const idx = px[o];
      if (!palette || idx * 3 + 2 >= palette.length) throw new UnsupportedImage('PNG palette index out of range');
      r = palette[idx * 3];
      g = palette[idx * 3 + 1];
      b = palette[idx * 3 + 2];
      if (trns && idx < trns.length) a = trns[idx];
    }
    data.set([r, g, b, a], p * 4);
  }
  return { width, height, data };
}

function chunk(type, body) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const tb = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tb));
  return Buffer.concat([len, tb, crc]);
}

/** Encode RGBA pixels as an 8-bit RGBA PNG (filter 0 rows, zlib level 9). Deterministic for identical pixels. */
export function encodePNG({ width, height, data }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  return Buffer.concat([PNG_SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- compositing (pure; also serialized into the Chromium page, so keep it self-contained) ----------
export function compositeRGBA(base, bw, bh, patch, pw, ph, x, y, feather) {
  const f = Math.max(0, Number(feather) || 0);
  const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(bw, x + pw), y1 = Math.min(bh, y + ph);
  for (let by = y0; by < y1; by++) {
    for (let bx = x0; bx < x1; bx++) {
      const px = bx - x, py = by - y;
      let m = 1;
      if (f > 0) {
        const d = Math.min(px + 0.5, py + 0.5, pw - px - 0.5, ph - py - 0.5);
        const t = Math.min(1, Math.max(0, d / f));
        m = t * t * (3 - 2 * t);
      }
      const pi = (py * pw + px) * 4, bi = (by * bw + bx) * 4;
      const pa = (patch[pi + 3] / 255) * m;
      if (pa <= 0) continue;
      const ba = base[bi + 3] / 255;
      const oa = pa + ba * (1 - pa);
      for (let c = 0; c < 3; c++) base[bi + c] = Math.round((patch[pi + c] * pa + base[bi + c] * ba * (1 - pa)) / oa);
      base[bi + 3] = Math.round(oa * 255);
    }
  }
  return { x0, y0, x1, y1 };
}

export function cropRGBA(img, { x, y, w, h }) {
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > img.width || y + h > img.height) throw new Error(`region ${x},${y},${w},${h} is outside the ${img.width}x${img.height} source`);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let r = 0; r < h; r++) out.set(img.data.subarray(((y + r) * img.width + x) * 4, ((y + r) * img.width + x + w) * 4), r * w * 4);
  return { width: w, height: h, data: out };
}

export function parseRegion(v) {
  if (!v) return null;
  const n = String(v).split(/[,x ]+/).map(Number);
  if (n.length !== 4 || n.some((k) => !Number.isInteger(k))) throw new Error(`bad --region "${v}" (expected x,y,w,h in px)`);
  return { x: n[0], y: n[1], w: n[2], h: n[3] };
}

// ---------- Chromium engine ----------
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const mimeOf = (p) => MIME[path.extname(p).toLowerCase()] ?? 'application/octet-stream';
const dataUri = (p) => `data:${mimeOf(p)};base64,${fs.readFileSync(p).toString('base64')}`;

async function viaChromium({ base, patch, x, y, feather, region, out }) {
  let loadEngine, launch;
  try {
    ({ loadEngine, launch } = await import('../../scripts/lib/browser/launch.mjs'));
  } catch (e) {
    throw new Error(`MISSING: browser layer unavailable (${e.message})`);
  }
  const eng = await loadEngine(); // throws "MISSING: ..." when playwright-core or Chromium is absent; never downloads
  const browser = await launch(eng);
  try {
    const context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block', javaScriptEnabled: true });
    await context.route('**/*', (r) => r.abort('blockedbyclient')); // no network at all; inputs arrive as data: URIs
    const page = await context.newPage();
    const res = await page.evaluate(
      async ({ baseSrc, patchSrc, x, y, feather, region, outMime, fn }) => {
        const composite = new Function(`return (${fn})`)();
        const load = (src) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('decode failed')); i.src = src; });
        const pixels = (img, r) => {
          const c = document.createElement('canvas');
          const w = r ? r.w : img.naturalWidth, h = r ? r.h : img.naturalHeight;
          c.width = w; c.height = h;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, r ? -r.x : 0, r ? -r.y : 0);
          return { c, ctx, w, h, d: ctx.getImageData(0, 0, w, h) };
        };
        const [bi, pi] = await Promise.all([load(baseSrc), load(patchSrc)]);
        if (region && (region.x + region.w > pi.naturalWidth || region.y + region.h > pi.naturalHeight)) throw new Error(`region outside the ${pi.naturalWidth}x${pi.naturalHeight} source`);
        const b = pixels(bi), p = pixels(pi, region);
        const box = composite(b.d.data, b.w, b.h, p.d.data, p.w, p.h, x, y, feather);
        b.ctx.putImageData(b.d, 0, 0);
        const url = b.c.toDataURL(outMime, 0.95);
        return { width: b.w, height: b.h, box, url };
      },
      { baseSrc: dataUri(base), patchSrc: dataUri(patch), x, y, feather, region, outMime: mimeOf(out) === 'application/octet-stream' ? 'image/png' : mimeOf(out), fn: compositeRGBA.toString() },
    );
    const bytes = Buffer.from(res.url.split(',')[1], 'base64');
    return { width: res.width, height: res.height, box: res.box, bytes, engine: { name: 'chromium', version: browser.version() } };
  } finally {
    await browser.close().catch(() => {});
  }
}

// ---------- entry point ----------
/**
 * regionPaste({base, patch, x, y, feather=8, out, region?, engine='auto'|'node'|'chromium', force=false})
 * Writes `out` (never an input path; refuses an existing file unless force). Returns a provenance record.
 */
export async function regionPaste({ base, patch, x, y, feather = 8, out, region = null, engine = 'auto', force = false }) {
  if (!base || !patch || !out) throw new Error('usage: regionPaste({base, patch, x, y, out, feather?, region?})');
  const X = Number(x), Y = Number(y), F = Number(feather);
  if (!Number.isInteger(X) || !Number.isInteger(Y)) throw new Error('--x and --y must be integers (px)');
  if (!Number.isFinite(F) || F < 0) throw new Error('--feather must be >= 0 (px)');
  const [B, P, O] = [base, patch, out].map((p) => path.resolve(p));
  for (const p of [B, P]) if (!fs.existsSync(p)) throw new Error(`input not found: ${p}`);
  const real = (p) => (fs.existsSync(p) ? fs.realpathSync(p) : path.join(fs.realpathSync(path.dirname(p)), path.basename(p)));
  fs.mkdirSync(path.dirname(O), { recursive: true });
  if ([real(B), real(P)].includes(real(O))) throw new Error('refusing to overwrite an input; choose a new --out (originals are never edited in place)');
  if (fs.existsSync(O) && !force) throw new Error(`output exists: ${O} (pass --force to replace a previous output; inputs are never replaced)`);
  const reg = typeof region === 'string' ? parseRegion(region) : region;

  let result;
  const pngOut = path.extname(O).toLowerCase() === '.png';
  if (engine !== 'chromium') {
    try {
      if (!pngOut) throw new UnsupportedImage(`node engine writes PNG only (${path.extname(O) || 'no extension'})`);
      const b = decodePNG(fs.readFileSync(B));
      let p = decodePNG(fs.readFileSync(P));
      if (reg) p = cropRGBA(p, reg);
      const box = compositeRGBA(b.data, b.width, b.height, p.data, p.width, p.height, X, Y, F);
      result = { width: b.width, height: b.height, box, bytes: encodePNG(b), engine: { name: 'node', version: process.versions.node } };
    } catch (e) {
      if (!(e instanceof UnsupportedImage)) throw e;
      if (engine === 'node') throw new Error(`MISSING: node engine cannot handle this input (${e.message}); use --engine chromium (needs playwright-core + Chromium)`);
      try {
        result = await viaChromium({ base: B, patch: P, x: X, y: Y, feather: F, region: reg, out: O });
      } catch (ce) {
        throw new Error(ce.message.startsWith('MISSING') ? `${ce.message} (needed because: ${e.message})` : ce.message);
      }
    }
  } else result = await viaChromium({ base: B, patch: P, x: X, y: Y, feather: F, region: reg, out: O });

  const tmp = `${O}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, result.bytes);
  fs.renameSync(tmp, O);
  const { x0, y0, x1, y1 } = result.box;
  return {
    out: O,
    width: result.width,
    height: result.height,
    engine: result.engine,
    base: B,
    patch: P,
    region: reg,
    at: { x: X, y: Y },
    feather: F,
    changed_box: x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null,
    sha256: crypto.createHash('sha256').update(result.bytes).digest('hex'),
  };
}
