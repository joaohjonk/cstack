// Programmatic glTF 2.0 / GLB writer, so no binary model files are committed: tests/three*.test.mjs build their
// fixtures with it and `cstack evals run` builds GLB props (scripts/lib/evalprops.mjs). Image helpers write real PNGs
// and header-only WebP/JPEG/AVIF/KTX2 stubs.
import { encodePNG } from '../image/png.mjs';

const pad4 = (b, fill) => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4), fill)]) : b);
const minMax = (f, n) => {
  const min = Array(n).fill(Infinity);
  const max = Array(n).fill(-Infinity);
  f.forEach((x, i) => ((min[i % n] = Math.min(min[i % n], x)), (max[i % n] = Math.max(max[i % n], x))));
  return { min, max };
};

/** Pack a glTF JSON document and an optional BIN payload into a GLB container (JSON padded with spaces, BIN with zeros). */
export function packGLB(json, bin = null) {
  const chunk = (type, data) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(data.length, 0);
    h.writeUInt32LE(type, 4);
    return Buffer.concat([h, data]);
  };
  const body = Buffer.concat([chunk(0x4e4f534a, pad4(Buffer.from(JSON.stringify(json)), 0x20)), ...(bin ? [chunk(0x004e4942, pad4(bin, 0))] : [])]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + body.length, 8);
  return Buffer.concat([header, body]);
}

/** Accumulates buffer views and JSON for one buffer; glb() or gltf() emit the file. */
export class GltfBuilder {
  constructor(asset = {}) {
    this.parts = [];
    this.length = 0;
    this.json = { asset: { version: '2.0', generator: 'cstack fixture', ...asset }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], accessors: [], bufferViews: [] };
  }
  view(bytes, extra = {}) {
    const b = Buffer.from(bytes);
    this.json.bufferViews.push({ buffer: 0, byteOffset: this.length, byteLength: b.length, ...extra });
    const padded = pad4(b, 0);
    this.parts.push(padded);
    this.length += padded.length;
    return this.json.bufferViews.length - 1;
  }
  accessor(a) {
    this.json.accessors.push(a);
    return this.json.accessors.length - 1;
  }
  positions(xyz, extra = {}) {
    const f = new Float32Array(xyz);
    return this.accessor({ bufferView: this.view(Buffer.from(f.buffer), { target: 34962 }), componentType: 5126, count: f.length / 3, type: 'VEC3', ...minMax(f, 3), ...extra });
  }
  indices(list) {
    const big = list.reduce((m, x) => Math.max(m, x), 0) > 65534;
    const a = big ? new Uint32Array(list) : new Uint16Array(list);
    return this.accessor({ bufferView: this.view(Buffer.from(a.buffer), { target: 34963 }), componentType: big ? 5125 : 5123, count: list.length, type: 'SCALAR' });
  }
  mesh(primitives) {
    this.json.meshes.push({ primitives });
    return this.json.meshes.length - 1;
  }
  node(node, { root = true } = {}) {
    this.json.nodes.push(node);
    const i = this.json.nodes.length - 1;
    if (root) this.json.scenes[0].nodes.push(i);
    return i;
  }
  image(bytes, mimeType) {
    (this.json.images ??= []).push({ bufferView: this.view(bytes), mimeType });
    return this.json.images.length - 1;
  }
  build() {
    const bin = Buffer.concat(this.parts);
    const json = structuredClone(this.json);
    if (bin.length) json.buffers = [{ byteLength: bin.length }];
    return { json, bin };
  }
  glb() {
    const { json, bin } = this.build();
    return packGLB(json, bin.length ? bin : null);
  }
  /** .gltf JSON text with the buffer as a data URI, or pointing at `uri` (write `bin` there yourself). */
  gltf({ uri } = {}) {
    const { json, bin } = this.build();
    if (json.buffers) json.buffers[0].uri = uri ?? `data:application/octet-stream;base64,${bin.toString('base64')}`;
    return { text: JSON.stringify(json), json, bin };
  }
}

/** Cube corners; base: true puts the bottom face at y = 0 (the AR origin convention). */
export function cubePositions(size = 1, { base = false } = {}) {
  const h = size / 2;
  const [y0, y1] = base ? [0, size] : [-h, h];
  return [-h, y0, -h, h, y0, -h, h, y1, -h, -h, y1, -h, -h, y0, h, h, y0, h, h, y1, h, -h, y1, h];
}
export const CUBE_INDICES = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2];

/** A builder holding one indexed cube mesh (8 vertices, 12 triangles) under one root node. */
export function cube(size = 1, { base = false, node = {} } = {}) {
  const b = new GltfBuilder();
  const mesh = b.mesh([{ attributes: { POSITION: b.positions(cubePositions(size, { base })) }, indices: b.indices(CUBE_INDICES) }]);
  b.node({ mesh, ...node });
  return b;
}

/** A real RGBA PNG of one colour. */
export function png(width, height, rgba = [200, 40, 40, 255]) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return encodePNG({ width, height, data });
}

/** Header-only lossless WebP (VP8L) stub: enough for header readers; `extra` pads the file size. */
export function webpStub(width, height, extra = 0) {
  const b = Buffer.alloc(30 + extra);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WEBPVP8L', 8, 'latin1');
  b.writeUInt32LE(b.length - 20, 16);
  b[20] = 0x2f;
  b.writeUInt32LE((width - 1) | ((height - 1) << 14), 21);
  return b;
}

/** Header-only baseline JPEG stub: SOI + SOF0 carrying the size. */
export function jpegStub(width, height) {
  return Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, ...Array(13).fill(0)]);
}

/** Header-only AVIF stub: an ftyp box with the avif brand and one ispe box. */
export function avifStub(width, height) {
  const b = Buffer.alloc(40);
  b.writeUInt32BE(20, 0);
  b.write('ftypavif', 4, 'latin1');
  b.write('mif1', 16, 'latin1');
  b.writeUInt32BE(20, 20);
  b.write('ispe', 24, 'latin1');
  b.writeUInt32BE(width, 32);
  b.writeUInt32BE(height, 36);
  return b;
}

/** Header-only KTX2 stub with a basic DFD: colour model 163 = ETC1S (BasisLZ), 166 = UASTC. */
export function ktx2Stub(width, height, { model = 163 } = {}) {
  const b = Buffer.alloc(160);
  Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32LE(1, 16); // typeSize
  b.writeUInt32LE(width, 20);
  b.writeUInt32LE(height, 24);
  b.writeUInt32LE(1, 36); // faceCount
  b.writeUInt32LE(1, 40); // levelCount
  b.writeUInt32LE(model === 163 ? 1 : 0, 44); // BasisLZ for ETC1S
  b.writeUInt32LE(104, 48); // dfdByteOffset: header + index (80) + one level entry (24)
  b.writeUInt32LE(44, 52);
  b.writeUInt32LE(44, 104); // dfdTotalSize
  b.writeUInt16LE(2, 112); // versionNumber
  b.writeUInt16LE(40, 114); // descriptorBlockSize
  b[116] = model;
  return b;
}
