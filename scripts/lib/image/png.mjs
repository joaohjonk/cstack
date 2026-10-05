// Pure-Node PNG codec (zlib only). Decodes 8/16-bit gray, gray+alpha, RGB, RGBA and 8-bit palette, non-interlaced;
// encodes 8-bit RGBA. Other variants throw UnsupportedImage so callers can fall back to Chromium.
// Shared by providers/local/region_paste.mjs and scripts/lib/mockup/.
import zlib from 'node:zlib';

export const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(buf) {
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

/** Encode RGBA pixels as an 8-bit RGBA PNG (filter 0 rows, zlib level 9 unless `level` says otherwise). Deterministic for identical pixels. */
export function encodePNG({ width, height, data }, { level = 9 } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  return Buffer.concat([PNG_SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level })), chunk('IEND', Buffer.alloc(0))]);
}
