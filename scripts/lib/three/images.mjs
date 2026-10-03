// Image dimensions for 3D assets: PNG/JPEG/WebP/GIF through scripts/lib/image.mjs, plus the KTX2 header
// (KHR_texture_basisu) and the AVIF 'ispe' box, which image.mjs does not read. Headers only, never pixels.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { imageSize } from '../image.mjs';

const KTX2_ID = Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
const HEAD_BYTES = 64 * 1024;

/** KTX2 header: base-level size, Basis codec from the DFD colour model (163 ETC1S, 166 UASTC), supercompression. */
export function ktx2Info(b) {
  if (!b || b.length < 80 || !b.subarray(0, 12).equals(KTX2_ID)) return null;
  const vk = b.readUInt32LE(12);
  const scheme = b.readUInt32LE(44);
  const dfd = b.readUInt32LE(48);
  const model = dfd + 12 < b.length ? b[dfd + 12] : null;
  return {
    width: b.readUInt32LE(20),
    height: b.readUInt32LE(24),
    format: 'ktx2',
    codec: model === 163 ? 'etc1s' : model === 166 ? 'uastc' : vk ? `vkFormat ${vk}` : 'unknown',
    levels: b.readUInt32LE(40),
    supercompression: ['none', 'basislz', 'zstd', 'zlib'][scheme] ?? `scheme ${scheme}`,
  };
}

/** AVIF: size from the first 'ispe' box (the primary item in ordinary files; approximate for grid images). */
export function avifInfo(b) {
  if (!b || b.length < 32 || b.toString('latin1', 4, 8) !== 'ftyp') return null;
  const brands = b.toString('latin1', 8, Math.min(b.length, Math.max(16, b.readUInt32BE(0))));
  if (!/avi[fs]/.test(brands)) return null;
  const i = b.indexOf('ispe', 8, 'latin1');
  if (i < 4 || i + 16 > b.length) return null;
  return { width: b.readUInt32BE(i + 8), height: b.readUInt32BE(i + 12), format: 'avif' };
}

const plain = (s) => ({ width: s.width, height: s.height, format: s.format });
const headerError = (e) => new Error(/unsupported or corrupt/.test(e.message) ? 'unsupported or corrupt image header' : e.message.split('\n')[0]);

/** Dimensions of an image held in memory (embedded glTF image). Throws on unknown formats. */
export function sizeOfBytes(bytes) {
  const special = ktx2Info(bytes) ?? avifInfo(bytes);
  if (special) return special;
  // image.mjs reads files, so hand it the header through a private temp file; JPEG needs the whole marker walk
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cstack-3d-'));
  try {
    const p = path.join(dir, 'image');
    fs.writeFileSync(p, bytes[0] === 0xff && bytes[1] === 0xd8 ? bytes : bytes.subarray(0, 64));
    return plain(imageSize(p));
  } catch (e) {
    throw headerError(e);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Dimensions of an image file. Throws on unknown formats. */
export function sizeOfFile(file) {
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(HEAD_BYTES);
  let n;
  try {
    n = fs.readSync(fd, head, 0, HEAD_BYTES, 0);
  } finally {
    fs.closeSync(fd);
  }
  const special = ktx2Info(head.subarray(0, n)) ?? avifInfo(head.subarray(0, n));
  if (special) return special;
  try {
    return plain(imageSize(file));
  } catch (e) {
    throw headerError(e);
  }
}

export const MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', ktx2: 'image/ktx2', avif: 'image/avif' };
