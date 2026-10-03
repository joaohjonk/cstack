// Dependency-free glTF 2.0 reader for budget checks: the GLB container (12-byte header, JSON chunk, BIN chunk)
// and .gltf JSON with data-URI or local external buffers. It reads structure, accessor counts and bounds, and image
// headers. It never decodes Draco/Meshopt geometry, never fetches a URL and never reads outside the model's folder.
import fs from 'node:fs';
import path from 'node:path';
import { sizeOfBytes, sizeOfFile, MIME } from './images.mjs';

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
// Producer strings printed outside the untrusted block must look like what they claim to be (an extension name,
// a MIME type, a plain relative path); anything else is withheld here and shown inside the block instead.
const SHAPES = { ext: /^[A-Z0-9]+_[A-Za-z0-9_]{1,64}$/, mime: /^[a-z]+\/[a-z0-9.+-]{1,40}$/i, uri: /^[\w.\/%~+-]{1,160}$/ };
function label(ctx, value, shape, where) {
  const s = String(value);
  if (SHAPES[shape].test(s)) return s;
  ctx.withheld.push({ where, value: s });
  return `[withheld ${where}]`;
}

/** Split a GLB buffer into its JSON document and BIN chunk. Throws on a malformed container. */
export function parseGLB(buf) {
  if (buf.length < 12) throw new Error('not a GLB: shorter than the 12-byte header');
  if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error('not a GLB: bad magic');
  const version = buf.readUInt32LE(4);
  if (version !== 2) throw new Error(`unsupported GLB container version ${version} (glTF 2.0 only)`);
  const declared = buf.readUInt32LE(8);
  const warnings = [];
  if (declared !== buf.length) warnings.push(`GLB header says ${declared} bytes, file has ${buf.length}`);
  const end = Math.min(declared, buf.length);
  let off = 12;
  let json = null;
  let bin = null;
  let n = 0;
  while (off + 8 <= end) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const start = off + 8;
    if (start + len > end) throw new Error(`malformed GLB: chunk ${n} at byte ${off} declares ${len} bytes past the end of the file`);
    if (n === 0 && type !== CHUNK_JSON) throw new Error('malformed GLB: the first chunk is not JSON');
    if (n === 0) json = buf.subarray(start, start + len);
    else if (type === CHUNK_BIN && !bin) bin = buf.subarray(start, start + len);
    if (len % 4) warnings.push(`GLB chunk ${n} is not 4-byte aligned`);
    off = start + len;
    n++;
  }
  if (!json) throw new Error('malformed GLB: no JSON chunk');
  try {
    return { json: JSON.parse(json.toString('utf8').replace(/^\uFEFF/, '')), bin, warnings };
  } catch (e) {
    throw new Error(`malformed GLB: the JSON chunk does not parse (${e.message})`);
  }
}

/** data:[mime][;base64],payload -> {mime, bytes} or null. */
export function decodeDataUri(uri) {
  const m = /^data:([^,]*),(.*)$/s.exec(String(uri));
  if (!m) return null;
  const mime = m[1].split(';')[0] || null;
  if (/;base64$/i.test(m[1])) return { mime, bytes: Buffer.from(m[2], 'base64') };
  const out = [];
  const s = m[2];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '%' && /^[0-9a-f]{2}$/i.test(s.slice(i + 1, i + 3))) {
      out.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else out.push(s.charCodeAt(i) & 0xff);
  }
  return { mime, bytes: Buffer.from(out) };
}

const inside = (dir, p) => {
  const r = path.relative(dir, p);
  return r !== '' && r !== '..' && !r.startsWith(`..${path.sep}`) && !path.isAbsolute(r);
};

/** A relative URI that stays inside the model's folder (symlinks resolved) -> {path}; anything else -> {error}. `shown` names it in messages. */
export function resolveLocalUri(dir, uri, shown = 'uri') {
  if (SCHEME.test(uri)) return { error: `external URL not fetched: ${shown}`, remote: true };
  let rel = uri;
  try {
    rel = decodeURIComponent(uri);
  } catch {}
  const p = path.resolve(dir, rel);
  if (!inside(dir, p)) return { error: `outside the model folder, not read: ${shown}` };
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return { error: `missing file: ${shown}` };
  if (!inside(fs.realpathSync(dir), fs.realpathSync(p))) return { error: `links outside the model folder, not read: ${shown}` };
  return { path: p };
}

/** Read a .glb or .gltf: {file, dir, container, json, buffers[], fileBytes, external[], warnings[]}. */
export function loadGltf(file) {
  const abs = path.resolve(file);
  const buf = fs.readFileSync(abs);
  const warnings = [];
  let json;
  let bin = null;
  let container;
  if (buf.length >= 4 && buf.readUInt32LE(0) === GLB_MAGIC) {
    const g = parseGLB(buf);
    ({ json, bin } = g);
    warnings.push(...g.warnings);
    container = 'glb';
  } else {
    try {
      json = JSON.parse(buf.toString('utf8').replace(/^\uFEFF/, ''));
    } catch {
      throw new Error(`not glTF: ${path.basename(abs)} is neither a GLB nor glTF JSON`);
    }
    container = 'gltf';
  }
  if (!json || typeof json !== 'object' || Array.isArray(json) || !json.asset || typeof json.asset !== 'object') throw new Error('not glTF: no "asset" object');
  const version = String(json.asset.version ?? '');
  if (!/^2\.\d+$/.test(version)) throw new Error(`unsupported glTF version ${/^[\w.]{1,16}$/.test(version) ? `"${version}"` : '(unrecognized)'} (2.x only)`);
  const ctx = { file: abs, dir: path.dirname(abs), container, json, bin, fileBytes: buf.length, external: [], warnings, withheld: [] };
  ctx.buffers = arr(json.buffers).map((b, i) => loadBuffer(ctx, b, i));
  return ctx;
}

const arr = (v) => (Array.isArray(v) ? v : []);
const objs = (v) => arr(v).filter((x) => x && typeof x === 'object');
const count = (a, d = 0) => (Number.isInteger(a?.count) && a.count >= 0 ? a.count : d);
const vec = (v, n, d) => (Array.isArray(v) && v.length === n && v.every(Number.isFinite) ? v : d);

function loadBuffer(ctx, b, i) {
  let data = null;
  const uri = b?.uri;
  if (uri === undefined) {
    if (ctx.container === 'glb' && i === 0) {
      data = ctx.bin;
      if (!data) ctx.warnings.push('buffer 0 points at the GLB BIN chunk, which is missing');
    } else if (!b?.extensions?.EXT_meshopt_compression?.fallback && !b?.extensions?.KHR_meshopt_compression?.fallback) {
      ctx.warnings.push(`buffer ${i} has no uri and no data`);
    }
  } else if (String(uri).startsWith('data:')) {
    data = decodeDataUri(uri)?.bytes ?? null;
    if (!data) ctx.warnings.push(`buffer ${i}: unreadable data URI`);
  } else {
    const shown = label(ctx, uri, 'uri', `/buffers/${i}/uri`);
    const r = resolveLocalUri(ctx.dir, String(uri), shown);
    if (r.error) {
      ctx.warnings.push(`buffer ${i}: ${r.error}`);
      ctx.external.push({ kind: 'buffer', uri: shown, read: false, remote: !!r.remote });
    } else {
      data = fs.readFileSync(r.path);
      ctx.external.push({ kind: 'buffer', uri: shown, path: r.path, bytes: data.length, read: true });
    }
  }
  if (data && Number.isFinite(b?.byteLength) && data.length < b.byteLength) ctx.warnings.push(`buffer ${i} has ${data.length} bytes, less than its byteLength ${b.byteLength}`);
  return data;
}

/** Bytes of one bufferView, or null when its buffer is missing, remote or compressed-only. */
export function viewBytes(ctx, i) {
  const v = ctx.json.bufferViews?.[i];
  const buf = v && ctx.buffers[v.buffer];
  if (!buf) return null;
  const start = v.byteOffset ?? 0;
  const end = start + (v.byteLength ?? 0);
  return end <= buf.length ? buf.subarray(start, end) : null;
}

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const TYPES = { 5120: [1, 'getInt8'], 5121: [1, 'getUint8'], 5122: [2, 'getInt16'], 5123: [2, 'getUint16'], 5125: [4, 'getUint32'], 5126: [4, 'getFloat32'] };
// accessor.min/max hold raw values (the spec: `normalized` has no effect on them); normalized ints map to [0,1] or [-1,1].
const normalizer = (ct) => ({ 5120: (x) => Math.max(x / 127, -1), 5121: (x) => x / 255, 5122: (x) => Math.max(x / 32767, -1), 5123: (x) => x / 65535 })[ct] ?? ((x) => x);

function readElements(ctx, viewIndex, byteOffset, count, n, ct, out) {
  const view = ctx.json.bufferViews?.[viewIndex];
  const bytes = viewBytes(ctx, viewIndex);
  const [size, get] = TYPES[ct] ?? [];
  if (!bytes || !size) return false;
  const stride = view.byteStride ?? n * size;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < count; i++)
    for (let c = 0; c < n; c++) {
      const o = (byteOffset ?? 0) + i * stride + c * size;
      if (o + size > bytes.length) return false;
      out[i * n + c] = dv[get](o, true);
    }
  return true;
}

/** Accessor values as floats (sparse applied, normalized ints mapped), or null when the data is not readable here. */
export function readAccessor(ctx, index) {
  const a = ctx.json.accessors?.[index];
  const n = COMPONENTS[a?.type];
  if (!n || !TYPES[a.componentType] || !Number.isInteger(a.count)) return null;
  const out = new Float64Array(a.count * n);
  if (a.bufferView !== undefined && !readElements(ctx, a.bufferView, a.byteOffset, a.count, n, a.componentType, out)) return null;
  if (a.sparse) {
    const s = a.sparse;
    const idx = new Float64Array(s.count);
    const val = new Float64Array(s.count * n);
    if (!readElements(ctx, s.indices?.bufferView, s.indices?.byteOffset, s.count, 1, s.indices?.componentType, idx)) return null;
    if (!readElements(ctx, s.values?.bufferView, s.values?.byteOffset, s.count, n, a.componentType, val)) return null;
    for (let k = 0; k < s.count; k++) for (let c = 0; c < n; c++) out[idx[k] * n + c] = val[k * n + c];
  }
  if (a.normalized) out.forEach((x, i) => (out[i] = normalizer(a.componentType)(x)));
  return { data: out, n, count: a.count };
}

// ---------- geometry ----------
const MODES = ['points', 'lines', 'line_loop', 'line_strip', 'triangles', 'triangle_strip', 'triangle_fan'];

/** Triangles drawn by one primitive from its index (or vertex) count. Strips and fans count n-2, degenerate ones included. */
export function primitiveTriangles(n, mode = 4) {
  if (mode === 4) return Math.floor(n / 3);
  if (mode === 5 || mode === 6) return Math.max(0, n - 2);
  return 0;
}

function meshStats(j, mesh) {
  const acc = (i) => (Number.isInteger(i) ? j.accessors?.[i] : undefined);
  let triangles = 0;
  const positions = new Set();
  const modes = {};
  for (const p of objs(mesh?.primitives)) {
    const mode = p.mode ?? 4;
    const pos = p.attributes?.POSITION;
    const n = p.indices !== undefined ? count(acc(p.indices)) : count(acc(pos));
    triangles += primitiveTriangles(n, mode);
    const name = MODES[mode] ?? (Number.isInteger(mode) ? `mode_${mode}` : 'mode_invalid');
    modes[name] = (modes[name] ?? 0) + 1;
    if (Number.isInteger(pos)) positions.add(pos);
  }
  const vertices = [...positions].reduce((s, i) => s + count(acc(i)), 0);
  return { triangles, vertices, positions, modes, primitives: objs(mesh?.primitives).length };
}

// column-major 4x4, as glTF stores node.matrix
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
}
export function localMatrix(node) {
  if (vec(node.matrix, 16, null)) return node.matrix;
  const [tx, ty, tz] = vec(node.translation, 3, [0, 0, 0]);
  const [x, y, z, w] = vec(node.rotation, 4, [0, 0, 0, 1]);
  const [sx, sy, sz] = vec(node.scale, 3, [1, 1, 1]);
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + w * z) * sx, 2 * (x * z - w * y) * sx, 0,
    2 * (x * y - w * z) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + w * x) * sy, 0,
    2 * (x * z + w * y) * sz, 2 * (y * z - w * x) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
const apply = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
// A box maps to an exact box only when every row of the 3x3 part has one non-zero entry (scales, 90° turns).
function axisAligned(m) {
  const big = Math.max(...[0, 1, 2, 4, 5, 6, 8, 9, 10].map((i) => Math.abs(m[i]))) || 1;
  return [0, 1, 2].every((r) => [m[r], m[4 + r], m[8 + r]].filter((v) => Math.abs(v) > 1e-9 * big).length <= 1);
}

/** Nodes of the default scene (scene ?? 0) in depth-first order with world matrices, or null without scenes. */
export function sceneNodes(ctx) {
  const j = ctx.json;
  const index = Number.isInteger(j.scene) ? j.scene : 0;
  const scene = j.scenes?.[index];
  if (!scene) return null;
  const out = [];
  const seen = new Set();
  const stack = arr(scene.nodes).map((n) => [n, IDENTITY]).reverse();
  while (stack.length) {
    const [i, parent] = stack.pop();
    const node = Number.isInteger(i) ? j.nodes?.[i] : undefined;
    if (!node || typeof node !== 'object') continue;
    if (seen.has(i)) {
      ctx.warnings.push(`node ${i} is reached twice (cycle or shared child); counted once`);
      continue;
    }
    seen.add(i);
    const world = mul(parent, localMatrix(node));
    out.push({ index: i, node, world });
    for (const c of arr(node.children).slice().reverse()) stack.push([c, world]);
  }
  return { index, nodes: out };
}

const instanceCount = (j, node) => {
  const attrs = node.extensions?.EXT_mesh_gpu_instancing?.attributes;
  const first = attrs && Object.values(attrs).find((i) => Number.isInteger(i));
  return first !== undefined ? count(j.accessors?.[first], 1) : 1;
};

/** Triangles/vertices drawn by the default scene (instances counted) and stored (each mesh once). */
export function geometryStats(ctx, scene = sceneNodes(ctx)) {
  const j = ctx.json;
  const stats = arr(j.meshes).map((m) => meshStats(j, m));
  const modes = {};
  for (const s of stats) for (const [k, v] of Object.entries(s.modes)) modes[k] = (modes[k] ?? 0) + v;
  const allPositions = new Set(stats.flatMap((s) => [...s.positions]));
  const stored = {
    triangles: stats.reduce((a, s) => a + s.triangles, 0),
    vertices: [...allPositions].reduce((a, i) => a + count(j.accessors?.[i]), 0),
  };
  let drawn = { triangles: 0, vertices: 0 };
  let note = null;
  const meshNodes = scene ? scene.nodes.filter((x) => Number.isInteger(x.node.mesh) && stats[x.node.mesh]) : [];
  for (const { node } of meshNodes) {
    const k = instanceCount(j, node);
    drawn.triangles += stats[node.mesh].triangles * k;
    drawn.vertices += stats[node.mesh].vertices * k;
  }
  if (!meshNodes.length) {
    drawn = { ...stored };
    if (stats.length) note = scene ? 'no node of the default scene draws a mesh; each mesh counted once' : 'no scene; each mesh counted once';
  }
  return {
    triangles: drawn.triangles,
    triangles_stored: stored.triangles,
    vertices: drawn.vertices,
    vertices_stored: stored.vertices,
    primitives: stats.reduce((a, s) => a + s.primitives, 0),
    modes,
    ...(note ? { note } : {}),
  };
}

// ---------- bounds ----------
const r6 = (x) => {
  const v = Math.round(x * 1e6) / 1e6;
  return v === 0 ? 0 : v;
};
const finite3 = (v) => Array.isArray(v) && v.length >= 3 && v.slice(0, 3).every((x) => Number.isFinite(Number(x)));

function positionBox(ctx, i) {
  const a = Number.isInteger(i) ? ctx.json.accessors?.[i] : undefined;
  if (!a) return null;
  if (finite3(a.min) && finite3(a.max)) {
    const f = a.normalized ? normalizer(a.componentType) : (x) => x;
    return { min: a.min.slice(0, 3).map((x) => f(Number(x))), max: a.max.slice(0, 3).map((x) => f(Number(x))) };
  }
  const d = readAccessor(ctx, i);
  if (!d || d.n < 3 || !d.count) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < d.count; v++)
    for (let k = 0; k < 3; k++) {
      const x = d.data[v * d.n + k];
      if (x < min[k]) min[k] = x;
      if (x > max[k]) max[k] = x;
    }
  ctx.warnings.push(`accessor ${i}: POSITION has no min/max (the spec requires them); bounds computed from the data`);
  return { min, max };
}

const corners = ({ min, max }) => [0, 1, 2, 3, 4, 5, 6, 7].map((c) => [c & 1 ? max[0] : min[0], c & 2 ? max[1] : min[1], c & 4 ? max[2] : min[2]]);

/** World-space box of the default scene's rest pose, in metres (glTF unit), with what makes it approximate. */
export function sceneBounds(ctx, scene = sceneNodes(ctx)) {
  const j = ctx.json;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const notes = new Set();
  let approximate = false;
  let used = 0;
  const flag = (note) => {
    approximate = true;
    notes.add(note);
  };
  const add = (box, m) => {
    for (const c of corners(box)) {
      const p = m ? apply(m, c) : c;
      for (let k = 0; k < 3; k++) {
        if (p[k] < lo[k]) lo[k] = p[k];
        if (p[k] > hi[k]) hi[k] = p[k];
      }
    }
    used++;
  };
  for (const { node, world } of scene?.nodes ?? []) {
    const mesh = Number.isInteger(node.mesh) ? j.meshes?.[node.mesh] : undefined;
    if (!mesh) continue;
    let m = world;
    if (node.skin !== undefined) {
      m = IDENTITY;
      flag('skinned mesh: bind-pose box, node transform ignored as the spec requires');
    }
    if (node.extensions?.EXT_mesh_gpu_instancing) flag('GPU instancing: per-instance transforms not applied');
    if (!axisAligned(m)) flag('rotated node: box of the rotated box (conservative, may be larger than the mesh)');
    for (const p of objs(mesh.primitives)) {
      if (arr(p.targets).length) flag('morph targets: base shape only');
      const b = positionBox(ctx, p.attributes?.POSITION);
      if (b) add(b, m);
      else flag('some primitives have no readable POSITION bounds');
    }
  }
  if (!used) {
    for (const mesh of arr(j.meshes))
      for (const p of objs(mesh?.primitives)) {
        const b = positionBox(ctx, p.attributes?.POSITION);
        if (b) add(b, null);
      }
    if (used) flag(scene ? 'no node of the default scene draws a mesh: mesh-local box' : 'no scene: mesh-local box without node transforms');
  }
  if (!used) return null;
  if (arr(j.animations).length) notes.add('rest pose: animations not applied');
  return { min: lo.map(r6), max: hi.map(r6), size: hi.map((h, k) => r6(h - lo[k])), approximate, notes: [...notes], scene: scene?.index ?? null };
}

/** Where the origin sits relative to the box. AR wants the base centre: x and z centred, y at the bottom (glTF is Y-up). */
export function originInfo(b) {
  if (!b) return null;
  const [w, h, d] = b.size;
  const tol = 0.01 * Math.max(w, h, d) || 1e-9;
  const frac = (lo, s) => (s > 0 ? -lo / s : 0.5);
  const box_fraction = [frac(b.min[0], w), frac(b.min[1], h), frac(b.min[2], d)].map((x) => Math.round(x * 1000) / 1000 || 0);
  const cx = (b.min[0] + b.max[0]) / 2;
  const cy = (b.min[1] + b.max[1]) / 2;
  const cz = (b.min[2] + b.max[2]) / 2;
  const centred_xz = Math.abs(cx) <= tol && Math.abs(cz) <= tol;
  const at_base = Math.abs(b.min[1]) <= tol;
  const outside = box_fraction.some((f) => f < 0 || f > 1);
  const at = centred_xz && at_base ? 'base-centre' : centred_xz && Math.abs(cy) <= tol ? 'box-centre' : outside ? 'outside-box' : 'off-centre';
  return { at, box_fraction, base_centre_m: [r6(cx), r6(b.min[1]), r6(cz)], centred_xz, at_base, tolerance_m: r6(tol) };
}

// ---------- images, extensions, untrusted text ----------
/** One row per glTF image: where its bytes live, size and header dimensions. */
export function imageInfo(ctx) {
  const j = ctx.json;
  const refs = new Map();
  for (const t of arr(j.textures)) {
    const e = t?.extensions ?? {};
    for (const s of [t?.source, e.KHR_texture_basisu?.source, e.EXT_texture_webp?.source, e.EXT_texture_avif?.source]) if (Number.isInteger(s)) refs.set(s, (refs.get(s) ?? 0) + 1);
  }
  return arr(j.images).map((img, i) => {
    const row = { image: i, mimeType: typeof img?.mimeType === 'string' ? label(ctx, img.mimeType, 'mime', `/images/${i}/mimeType`) : null, source: null, bytes: null, width: null, height: null, format: null, textures: refs.get(i) ?? 0 };
    let bytes = null;
    let file = null;
    if (Number.isInteger(img?.bufferView)) {
      row.source = 'bufferView';
      bytes = viewBytes(ctx, img.bufferView);
    } else if (typeof img?.uri === 'string' && img.uri.startsWith('data:')) {
      row.source = 'data-uri';
      const d = decodeDataUri(img.uri);
      bytes = d?.bytes ?? null;
      row.mimeType ??= d?.mime ? label(ctx, d.mime, 'mime', `/images/${i}/uri`) : null;
    } else if (typeof img?.uri === 'string') {
      row.uri = label(ctx, img.uri, 'uri', `/images/${i}/uri`);
      const r = resolveLocalUri(ctx.dir, img.uri, row.uri);
      row.source = r.remote ? 'url' : 'file';
      if (r.error) {
        row.error = r.error;
        ctx.external.push({ kind: 'image', uri: row.uri, read: false, remote: !!r.remote });
      } else {
        file = r.path;
        row.bytes = fs.statSync(file).size;
        ctx.external.push({ kind: 'image', uri: row.uri, path: file, bytes: row.bytes, read: true });
      }
    }
    if (bytes) row.bytes = bytes.length;
    try {
      if (bytes) Object.assign(row, sizeOfBytes(bytes));
      else if (file) Object.assign(row, sizeOfFile(file));
      else row.error ??= 'image bytes not available';
    } catch (e) {
      row.error = e.message;
    }
    if (row.format && row.mimeType && MIME[row.format] && MIME[row.format] !== row.mimeType) ctx.warnings.push(`image ${i}: mimeType ${row.mimeType} but the header is ${row.format}`);
    return row;
  });
}

const GEOMETRY_EXT = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_meshopt_compression'];
const TEXTURE_EXT = ['KHR_texture_basisu', 'EXT_texture_webp', 'EXT_texture_avif'];

/** extras (anywhere), names and the extension names actually present in the JSON. */
export function scanJSON(json) {
  const extras = [];
  const names = [];
  const extensions = new Map();
  const esc = (k) => String(k).replace(/~/g, '~0').replace(/\//g, '~1');
  const visit = (v, at, depth) => {
    if (!v || typeof v !== 'object' || depth > 64) return;
    if (Array.isArray(v)) return v.forEach((x, i) => visit(x, `${at}/${i}`, depth + 1));
    for (const [k, x] of Object.entries(v)) {
      const here = `${at}/${esc(k)}`;
      if (k === 'extras') {
        extras.push({ where: here, value: x });
        continue;
      }
      if (k === 'extensions' && x && typeof x === 'object' && !Array.isArray(x)) for (const e of Object.keys(x)) if (!extensions.has(e)) extensions.set(e, `${here}/${esc(e)}`);
      if (k === 'name' && typeof x === 'string') names.push({ where: here, value: x });
      visit(x, here, depth + 1);
    }
  };
  visit(json, '', 0);
  return { extras, names, extensions };
}

export function extensionInfo(ctx, seen = scanJSON(ctx.json).extensions) {
  const rawUsed = arr(ctx.json.extensionsUsed).map(String);
  const rawRequired = arr(ctx.json.extensionsRequired).map(String);
  const used = rawUsed.map((e, k) => label(ctx, e, 'ext', `/extensionsUsed/${k}`));
  const required = rawRequired.map((e, k) => label(ctx, e, 'ext', `/extensionsRequired/${k}`));
  const undeclared = [...seen.keys()].filter((e) => !rawUsed.includes(e)).sort();
  if (undeclared.length) ctx.warnings.push(`extensions present but not in extensionsUsed: ${undeclared.map((e) => label(ctx, e, 'ext', seen.get(e))).join(', ')}`);
  rawRequired.forEach((e, k) => rawUsed.includes(e) || ctx.warnings.push(`extensionsRequired lists ${required[k]} but extensionsUsed does not`));
  return {
    used,
    required,
    geometry_compression: rawUsed.filter((e) => GEOMETRY_EXT.includes(e)),
    texture_compression: rawUsed.filter((e) => TEXTURE_EXT.includes(e)),
    quantization: rawUsed.includes('KHR_mesh_quantization'),
    materials: used.filter((e) => e.startsWith('KHR_materials_')),
  };
}

// Phrases that read as instructions to an agent. A heuristic for flagging, never a parser: the text stays data.
const CUES = [
  ['override', /\b(ignore|disregard|forget|override)\b.{0,40}\b(instructions?|prompts?|rules|guidelines|previous|above|system)\b/is],
  ['role', /\b(you are now|act as|pretend to be|system prompt|developer mode|jailbreak)\b|^\s*(system|assistant|user)\s*:/im],
  ['command', /\b(curl|wget|sudo|powershell|rm\s+-rf|bash\s+-c|sh\s+-c|chmod\s+\+x|base64\s+-d)\b|\|\s*(ba)?sh\b/i],
  ['tool', /\b(call|use|invoke|run)\s+(the\s+)?(tool|function|mcp|shell|terminal)\b|\bmcp__\w+/i],
  ['exfiltrate', /\b(send|post|upload|exfiltrate|leak)\b.{0,40}\b(keys?|tokens?|secrets?|passwords?|credentials?|\.env)\b/is],
];
export const instructionCues = (text) => CUES.filter(([, re]) => re.test(text)).map(([k]) => k);
const leaves = (v, out = [], depth = 0) => {
  if (typeof v === 'string') out.push(v);
  else if (v && typeof v === 'object' && depth < 32)
    for (const [k, x] of Object.entries(v)) {
      if (!Array.isArray(v)) out.push(k);
      leaves(x, out, depth + 1);
    }
  return out;
};

/**
 * Producer-written text: every extras block, asset generator/copyright, names that look like instructions, and
 * fields withheld from the report because they did not look like what they claim to be.
 * Returned as JSON-escaped, truncated strings for display inside an untrusted envelope; nothing is interpreted.
 */
export function untrustedText(json, scan = scanJSON(json), withheld = []) {
  const show = (v) => {
    let s;
    try {
      s = JSON.stringify(v) ?? String(v);
    } catch {
      s = String(v);
    }
    return s.length > 300 ? `${s.slice(0, 300)}…` : s;
  };
  const rows = [];
  for (const e of scan.extras) rows.push({ where: e.where, kind: 'extras', text: show(e.value), cues: instructionCues(leaves(e.value).join('\n')) });
  for (const k of ['generator', 'copyright']) if (typeof json.asset?.[k] === 'string') rows.push({ where: `/asset/${k}`, kind: 'asset', text: show(json.asset[k]), cues: instructionCues(json.asset[k]) });
  for (const n of scan.names) {
    const cues = instructionCues(n.value);
    if (cues.length) rows.push({ where: n.where, kind: 'name', text: show(n.value), cues });
  }
  for (const w of withheld) rows.push({ where: w.where, kind: 'field', text: show(w.value), cues: instructionCues(w.value) });
  return rows;
}
