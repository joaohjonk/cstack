// F90: a story or carousel version of a verified frame is made from that frame, never regenerated. Outpainting to 9:16
// redrew the pack every time; padding or cropping the checked pixels keeps the pack exactly as it passed `pack check`.
//   pad: the frame is kept whole and centred on a taller or wider canvas, filled with a colour or its own edge pixels
//   crop: the frame is cut to the new aspect around a centre; check that the pack is still whole (pack check --box)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { decodeImages } from './decode.mjs';
import { encodePNG } from './png.mjs';

export function parseAspect(s) {
  const m = String(s ?? '').match(/^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/);
  if (!m || !(Number(m[1]) > 0 && Number(m[2]) > 0)) throw new Error(`--aspect takes W:H (9:16, 4:5, 1:1), not "${s}"`);
  return { w: Number(m[1]), h: Number(m[2]) };
}

function parseFill(fill) {
  if (fill === 'edge') return 'edge';
  const m = String(fill).match(/^#?([0-9a-f]{6})$/i);
  if (!m) throw new Error(`--fill takes edge or a #rrggbb colour, not "${fill}"`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

/** extendFrame({width, height, data}, {aspect, fit: pad|crop, fill: edge|#rrggbb, center: [0..1, 0..1]}) -> {width, height, data, box} */
export function extendFrame(img, { aspect, fit = 'pad', fill = 'edge', center = [0.5, 0.5] } = {}) {
  const a = typeof aspect === 'string' ? parseAspect(aspect) : aspect;
  const want = a.h / a.w;
  const { width: W, height: H, data } = img;
  if (fit === 'crop') {
    let w = W;
    let h = Math.round(W * want);
    if (h > H) ((h = H), (w = Math.round(H / want)));
    const x0 = Math.min(W - w, Math.max(0, Math.round(center[0] * W - w / 2)));
    const y0 = Math.min(H - h, Math.max(0, Math.round(center[1] * H - h / 2)));
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) out.set(data.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + w) * 4), y * w * 4);
    return { width: w, height: h, data: out, box: [-x0, -y0, W, H] };
  }
  if (fit !== 'pad') throw new Error(`--fit takes pad or crop, not "${fit}"`);
  let w = W;
  let h = Math.round(W * want);
  if (h < H) ((h = H), (w = Math.round(H / want)));
  const x0 = Math.round((w - W) / 2);
  const y0 = Math.round((h - H) / 2);
  const f = parseFill(fill);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = x - x0;
      const sy = y - y0;
      const o = (y * w + x) * 4;
      if (sx >= 0 && sx < W && sy >= 0 && sy < H) {
        const i = (sy * W + sx) * 4;
        out[o] = data[i], out[o + 1] = data[i + 1], out[o + 2] = data[i + 2], out[o + 3] = data[i + 3];
      } else if (f === 'edge') {
        const i = (Math.min(H - 1, Math.max(0, sy)) * W + Math.min(W - 1, Math.max(0, sx))) * 4;
        out[o] = data[i], out[o + 1] = data[i + 1], out[o + 2] = data[i + 2], out[o + 3] = data[i + 3];
      } else out.set(f, o);
    }
  return { width: w, height: h, data: out, box: [x0, y0, W, H] };
}

/** extendFile(file, {aspect, fit, fill, out, force}) -> {out, width, height, box, sidecar}; the sidecar names the frame it came from. */
export async function extendFile(file, { aspect, fit = 'pad', fill = 'edge', out, force = false } = {}) {
  if (!out) throw new Error('--out <file.png> required');
  if (fs.existsSync(out) && !force) throw new Error(`${out} exists; pass --force to replace it`);
  const [img] = await decodeImages([{ file }]);
  const r = extendFrame(img, { aspect, fit, fill });
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, encodePNG(r));
  const sha = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const sidecar = `${out}.json`;
  const meta = { derived_from: { file: path.resolve(file), sha256: sha }, method: fit, aspect: String(aspect), fill: fit === 'pad' ? fill : undefined, frame_box: r.box, note: fit === 'pad' ? 'the verified frame, unchanged, on a larger canvas; nothing was regenerated' : 'the verified frame, cropped; nothing was regenerated; check that the pack is still whole' };
  fs.writeFileSync(sidecar, JSON.stringify(meta, null, 2) + '\n');
  return { out, width: r.width, height: r.height, box: r.box, sidecar };
}
