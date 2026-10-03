// ICO container with PNG-compressed entries (read by every current browser, and by Windows since Vista).
// Layout: ICONDIR (6 bytes) + one 16-byte ICONDIRENTRY per image + the PNG files, smallest first.

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** images: [{width, height, png: Buffer}] (each at most 256 x 256). */
export function encodeICO(images) {
  if (!images.length) throw new Error('an ICO needs at least one image');
  const list = [...images].sort((a, b) => a.width - b.width);
  const head = Buffer.alloc(6 + 16 * list.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(list.length, 4);
  let off = head.length;
  list.forEach((im, i) => {
    if (im.width > 256 || im.height > 256 || im.width < 1 || im.height < 1) throw new Error(`ICO entries are 1..256 px (got ${im.width}x${im.height})`);
    if (!im.png.subarray(0, 8).equals(PNG_SIG)) throw new Error('ICO entries must be PNG data');
    const o = 6 + 16 * i;
    head[o] = im.width === 256 ? 0 : im.width;
    head[o + 1] = im.height === 256 ? 0 : im.height;
    head.writeUInt16LE(1, o + 4); // color planes
    head.writeUInt16LE(32, o + 6); // bits per pixel
    head.writeUInt32LE(im.png.length, o + 8);
    head.writeUInt32LE(off, o + 12);
    off += im.png.length;
  });
  return Buffer.concat([head, ...list.map((im) => im.png)]);
}

/** Read the directory: [{width, height, bpp, bytes, png: boolean, data}]. Throws on a malformed container. */
export function decodeICO(buf) {
  if (buf.length < 6 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) throw new Error('not an ICO file');
  const n = buf.readUInt16LE(4);
  if (buf.length < 6 + 16 * n) throw new Error('ICO directory is truncated');
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = 6 + 16 * i;
    const bytes = buf.readUInt32LE(o + 8), at = buf.readUInt32LE(o + 12);
    if (at + bytes > buf.length) throw new Error(`ICO entry ${i} runs past the end of the file`);
    const data = buf.subarray(at, at + bytes);
    out.push({ width: buf[o] || 256, height: buf[o + 1] || 256, bpp: buf.readUInt16LE(o + 6), bytes, png: data.subarray(0, 8).equals(PNG_SIG), data });
  }
  return out;
}
