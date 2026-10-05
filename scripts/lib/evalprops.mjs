// Eval fixture props (docs/evals.md#fixture-props): the files a T2 case's setup names, generated when the case is
// built so no binary is committed. `setup_props` maps a workspace path to a spec; props are built in order after
// `setup_files`, so a prop can start from a file written before it (`from`, `art`, `template`).
// Kinds: glb, png, frame, mp4, pdf, svg, text, copy, flow-plan, mockup. Same spec, same bytes (sidecars aside).
// Building a case plays the owner, so props may land in assets/official/, which cstack's own writes refuse.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { ROOT, exists, sha256 } from './core.mjs';
import { decodePNG, encodePNG, crc32 } from './image/png.mjs';
import { GltfBuilder, cubePositions, CUBE_INDICES, webpStub, jpegStub, ktx2Stub, avifStub } from './three/build.mjs';
import { loadGltf, geometryStats, imageInfo } from './three/gltf.mjs';
import { binPath, MissingTool } from './video/ffmpeg.mjs';
import { listFlows, planDoc } from './flows.mjs';

export const PROP_KINDS = ['glb', 'png', 'frame', 'mp4', 'pdf', 'svg', 'text', 'copy', 'flow-plan', 'mockup'];

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const inside = (dir, p) => p.startsWith(dir + path.sep);

/** "1080x1920" | [1080, 1920] -> [w, h] positive integers, or null. */
export function parseSize(v) {
  const m = Array.isArray(v) ? v.map(Number) : String(v ?? '').match(/^(\d+)x(\d+)$/)?.slice(1).map(Number);
  return m && m.length === 2 && m.every((n) => Number.isInteger(n) && n > 0) ? m : null;
}

/** "#rrggbb" | "#rrggbbaa" -> [r, g, b, a]. */
export function parseColor(c) {
  const m = String(c ?? '').match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (!m) throw new Error(`colour "${c}" must be #rrggbb or #rrggbbaa`);
  const n = parseInt(m[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255, m[2] ? parseInt(m[2], 16) : 255];
}

/** Format errors in one spec (checkFixtures): kind known, required fields present, repo sources exist. */
export function checkPropSpec(spec) {
  if (!isObj(spec)) return ['must be a prop spec object with a kind'];
  const e = [];
  const need = (k, ok = (v) => v != null) => ok(spec[k]) || e.push(`${spec.kind} prop needs "${k}"`);
  switch (spec.kind) {
    case 'glb':
      if (spec.size != null && !(Array.isArray(spec.size) && spec.size.length === 3 && spec.size.every((x) => x > 0))) e.push('glb size must be [x, y, z] in glTF units (metres)');
      if (spec.triangles != null && !(Number.isInteger(spec.triangles) && spec.triangles > 0)) e.push('glb triangles must be a positive integer');
      for (const t of spec.textures ?? []) if (!parseSize([t?.width, t?.height])) e.push('glb textures need width and height');
      break;
    case 'png':
      if (!spec.from) need('size', parseSize);
      break;
    case 'frame':
      need('from');
      break;
    case 'mp4':
      need('size', parseSize);
      need('seconds', (v) => v > 0);
      break;
    case 'pdf':
      need('pages', (v) => Array.isArray(v) && v.length > 0);
      break;
    case 'svg':
    case 'text':
      need('text', (v) => typeof v === 'string');
      if (spec.kind === 'svg' && typeof spec.text === 'string' && !/<svg[\s>]/.test(spec.text)) e.push('svg prop text has no <svg> element');
      break;
    case 'copy':
      if (need('from', (v) => typeof v === 'string')) {
        const src = path.resolve(ROOT, spec.from);
        if (path.isAbsolute(spec.from) || !inside(ROOT, src)) e.push(`copy from "${spec.from}" must be a repo-relative path`);
        else if (!exists(src)) e.push(`copy from "${spec.from}": no such file in this repo`);
      }
      break;
    case 'flow-plan':
      if (need('flow', (v) => typeof v === 'string') && !listFlows(null).some((f) => f.id === spec.flow)) e.push(`flow-plan: no flow "${spec.flow}" in flows/`);
      break;
    case 'mockup':
      need('template');
      need('art');
      break;
    default:
      e.push(`kind "${spec.kind}" is not one of ${PROP_KINDS.join(', ')}`);
  }
  return e;
}

/** Build every prop of a fixture into the case workspace `dir`, in order. Throws (MISSING for ffmpeg) on failure. */
export async function buildProps(fx, dir) {
  const built = [];
  for (const [rel, spec] of Object.entries(fx.setup_props ?? {})) {
    const out = path.resolve(dir, rel);
    if (!inside(dir, out)) throw new Error(`${fx.id}: setup_props path "${rel}" leaves the workspace`);
    const errs = checkPropSpec(spec);
    if (errs.length) throw new Error(`${fx.id}: setup_props "${rel}": ${errs.join('; ')}`);
    const ws = (p) => {
      const abs = path.resolve(dir, String(p));
      if (!inside(dir, abs)) throw new Error(`${fx.id}: setup_props "${rel}": "${p}" leaves the workspace`);
      return abs;
    };
    fs.mkdirSync(path.dirname(out), { recursive: true });
    try {
      await BUILD[spec.kind](spec, out, { ws, seed: rel });
    } catch (e) {
      if (e instanceof MissingTool) throw new MissingTool(`${fx.id}: setup_props "${rel}": ${e.message}`);
      throw new Error(`${fx.id}: setup_props "${rel}": ${e.message}`);
    }
    built.push(rel);
  }
  return built;
}

const BUILD = {
  glb: (spec, out) => fs.writeFileSync(out, glbProp(spec)),
  png: (spec, out, { ws, seed }) => fs.writeFileSync(out, encodePNG(pngProp(spec, { ws, seed }), { level: 1 })), // fast: props are rebuilt every run
  frame: (spec, out, { ws }) => ffmpegSync(['-ss', String(spec.at ?? 0), '-i', ws(spec.from), '-frames:v', '1', '-update', '1', out], `extract a still from ${spec.from}`),
  mp4: (spec, out, { ws }) => mp4Prop(spec, out, { ws }),
  pdf: (spec, out) => fs.writeFileSync(out, pdfProp(spec)),
  svg: (spec, out) => fs.writeFileSync(out, spec.text),
  text: (spec, out) => fs.writeFileSync(out, spec.text),
  copy: (spec, out) => fs.cpSync(path.resolve(ROOT, spec.from), out, { recursive: true }),
  'flow-plan': (spec, out) => {
    const f = listFlows(null).find((x) => x.id === spec.flow);
    const plan = planDoc(f, { id: path.basename(out).replace(/\.flow\.ya?ml$/, ''), target: spec.target, deliverable: spec.deliverable, key_visual: !!spec.key_visual });
    fs.writeFileSync(out, YAML.stringify(plan));
  },
  mockup: async (spec, out, { ws }) => {
    const { renderMockup } = await import('./mockup/render.mjs');
    await renderMockup({ template: ws(spec.template), art: ws(spec.art), out, placement: spec.placement ?? null, force: true, internal: !!spec.internal });
  },
};

// ---------- glb ----------
/**
 * A box mesh with the numbers a setup states. size: [x, y, z] in glTF units, read as metres (a millimetre export is
 * [72, 96, 72]: no unit metadata exists in glTF to say otherwise); origin: base-centre | box-centre | corner;
 * triangles: drawn count (real indices cycling over the 8 corners); textures: [{width, height, format, color}]
 * embedded (png real pixels; webp, jpeg, ktx2, avif header-only); bytes: pad the file to this size (a private PNG
 * chunk when there is a PNG texture, else an unused buffer view); extras: asset.extras; materials: names;
 * generator, copyright, node_name.
 */
export function glbProp(spec = {}) {
  const build = (pad) => {
    const [w, h, d] = spec.size ?? [0.1, 0.1, 0.1];
    const origin = spec.origin ?? 'base-centre';
    const unit = cubePositions(1, { base: true });
    const shift = origin === 'box-centre' ? [0, -0.5, 0] : origin === 'corner' ? [0.5, 0, 0.5] : [0, 0, 0];
    const pos = unit.map((v, i) => (v + shift[i % 3]) * [w, h, d][i % 3]);
    const tris = spec.triangles ?? 12;
    const idx = Array.from({ length: tris * 3 }, (_, i) => CUBE_INDICES[i % CUBE_INDICES.length]);
    const b = new GltfBuilder({ generator: spec.generator ?? 'cstack eval prop', ...(spec.copyright ? { copyright: spec.copyright } : {}), ...(spec.extras != null ? { extras: spec.extras } : {}) });
    const textures = spec.textures ?? [];
    // padding is shared across the PNG textures, so each reads as a heavy uncompressed image
    const pngs = textures.map((t, i) => ((t.format ?? 'png') === 'png' ? i : -1)).filter((i) => i >= 0);
    const share = (i) => (pad ? Math.floor(pad / pngs.length) + (i === pngs.at(-1) ? pad % pngs.length : 0) : 0);
    const images = textures.map((t, i) => {
      const fmt = t.format ?? 'png';
      let bytes;
      if (fmt === 'png') {
        bytes = solidPNG(t.width, t.height, t.color ? parseColor(t.color) : [180, 150, 120, 255]);
        // keep the image 4-byte aligned so no hidden view padding moves the total
        if (share(i) >= 16) bytes = padPNG(bytes, share(i) - ((bytes.length + share(i)) % 4));
      } else bytes = { webp: webpStub, jpeg: jpegStub, ktx2: ktx2Stub, avif: avifStub }[fmt]?.(t.width, t.height) ?? (() => { throw new Error(`glb texture format "${fmt}" (use png, webp, jpeg, ktx2 or avif)`); })();
      return b.image(bytes, { png: 'image/png', webp: 'image/webp', jpeg: 'image/jpeg', ktx2: 'image/ktx2', avif: 'image/avif' }[fmt]);
    });
    const hasPNG = textures.some((t) => (t.format ?? 'png') === 'png');
    if (pad && !hasPNG) b.view(Buffer.alloc(pad), { name: 'padding' });
    const names = spec.materials ?? (images.length ? ['material'] : []);
    if (names.length) {
      b.json.materials = names.map((name) => ({ name, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.6 } }));
      if (images.length) {
        b.json.textures = images.map((source) => ({ source }));
        const m = b.json.materials[0];
        m.pbrMetallicRoughness.baseColorTexture = { index: 0 };
        if (images.length > 1) m.normalTexture = { index: 1 };
        if (images.length > 2) m.pbrMetallicRoughness.metallicRoughnessTexture = { index: 2 };
      }
    }
    const prim = { attributes: { POSITION: b.positions(pos) }, indices: b.indices(idx), ...(names.length ? { material: 0 } : {}) };
    b.node({ mesh: b.mesh([prim]), name: spec.node_name ?? 'model' });
    return b.glb();
  };
  let glb = build(0);
  if (spec.bytes == null) return glb;
  // padding shifts 4-byte alignment, so settle the size in a few passes
  let pad = 0;
  for (let i = 0; i < 4 && glb.length !== spec.bytes; i++) {
    pad = Math.max(0, pad + spec.bytes - glb.length);
    glb = build(pad);
  }
  if (Math.abs(glb.length - spec.bytes) > 16) throw new Error(`glb bytes ${spec.bytes} not reachable (smallest file is ${build(0).length} B)`);
  return glb;
}

const solidCache = new Map();
function solidPNG(width, height, rgba) {
  const key = `${width}x${height}:${rgba}`;
  if (!solidCache.has(key)) {
    const data = new Uint8Array(width * height * 4);
    for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
    solidCache.set(key, encodePNG({ width, height, data }));
  }
  return solidCache.get(key);
}

/** Grow a PNG by `n` bytes with a private ancillary chunk before IEND (decoders skip it; the pixels are unchanged). */
export function padPNG(png, n) {
  const len = Math.max(0, n - 12);
  const body = Buffer.concat([Buffer.from('prVt', 'ascii'), Buffer.alloc(len)]);
  const head = Buffer.alloc(4);
  head.writeUInt32BE(len);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([png.subarray(0, png.length - 12), head, body, crc, png.subarray(png.length - 12)]);
}

// ---------- png ----------
// Deterministic PRNG (mulberry32) seeded from the prop path, so "photo" noise is the same on every build.
function rng(seed) {
  let a = parseInt(sha256(String(seed)).slice(0, 8), 16);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pixels for a png prop: size + background (#hex, or [top, bottom] for a vertical gradient), or `from` an earlier
 * workspace PNG; then shapes in order ({rect: [x, y, w, h]} | {circle: [cx, cy, r]} | {ring: [cx, cy, r, width]},
 * each with color #rrggbb[aa]), noise (amplitude 0-255), tint {color, amount 0-1} and blur {radius, rect?}.
 */
export function pngProp(spec, { ws = (p) => p, seed = '' } = {}) {
  let img;
  if (spec.from) img = decodePNG(fs.readFileSync(ws(spec.from)));
  else {
    const [width, height] = parseSize(spec.size);
    img = { width, height, data: new Uint8ClampedArray(width * height * 4) };
    const bg = Array.isArray(spec.background) ? spec.background.map(parseColor) : [parseColor(spec.background ?? '#ffffff')];
    for (let y = 0; y < height; y++) {
      const t = bg.length > 1 ? y / Math.max(1, height - 1) : 0;
      const c = bg[0].map((v, k) => Math.round(v + ((bg[1] ?? bg[0])[k] - v) * t));
      for (let x = 0; x < width; x++) img.data.set(c, (y * width + x) * 4);
    }
  }
  const { width: W, height: H, data } = img;
  const blend = (x, y, c) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    const a = c[3] / 255;
    for (let k = 0; k < 3; k++) data[o + k] = Math.round(data[o + k] * (1 - a) + c[k] * a);
    data[o + 3] = Math.max(data[o + 3], c[3]);
  };
  for (const s of spec.shapes ?? []) {
    const c = parseColor(s.color ?? '#000000');
    if (s.rect) {
      const [x0, y0, w, h] = s.rect;
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) blend(x, y, c);
    } else if (s.circle || s.ring) {
      const [cx, cy, r, width = r] = s.circle ?? s.ring;
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          const dd = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (dd <= r && dd >= r - width) blend(x, y, c);
        }
    } else throw new Error('png shapes are {rect}, {circle} or {ring}');
  }
  if (spec.noise) {
    const rand = rng(seed);
    for (let i = 0; i < data.length; i += 4) {
      const n = (rand() - 0.5) * 2 * spec.noise;
      for (let k = 0; k < 3; k++) data[i + k] = data[i + k] + n;
    }
  }
  if (spec.tint) {
    const c = parseColor(spec.tint.color);
    const a = spec.tint.amount ?? 0.2;
    for (let i = 0; i < data.length; i += 4) for (let k = 0; k < 3; k++) data[i + k] = Math.round(data[i + k] * (1 - a) + ((data[i + k] * c[k]) / 255) * a + c[k] * a * 0.15);
  }
  if (spec.blur) boxBlur(img, spec.blur.radius ?? 2, spec.blur.rect ?? [0, 0, W, H]);
  return img;
}

function boxBlur({ width: W, data }, r, [x0, y0, w, h]) {
  const src = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) src[(y * w + x) * 4 + k] = data[((y0 + y) * W + x0 + x) * 4 + k];
  const pass = (a, horizontal) => {
    const b = new Float32Array(a.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        for (let k = 0; k < 4; k++) {
          let s = 0;
          let n = 0;
          for (let d = -r; d <= r; d++) {
            const xx = horizontal ? x + d : x;
            const yy = horizontal ? y : y + d;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            s += a[(yy * w + xx) * 4 + k];
            n++;
          }
          b[(y * w + x) * 4 + k] = s / n;
        }
    return b;
  };
  const out = pass(pass(src, true), false);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) data[((y0 + y) * W + x0 + x) * 4 + k] = Math.round(out[(y * w + x) * 4 + k]);
}

// ---------- mp4 (ffmpeg) ----------
function requireFFmpeg(would) {
  for (const name of ['ffmpeg', 'ffprobe']) {
    const r = spawnSync(binPath(name), ['-version'], { encoding: 'utf8' });
    if (r.error || r.status !== 0) {
      const env = name === 'ffmpeg' ? 'CSTACK_FFMPEG' : 'CSTACK_FFPROBE';
      throw new MissingTool(`MISSING: ${name} (no working "${binPath(name)}" found). This case needs it to ${would}, so it cannot be built. Install ffmpeg yourself (it ships ffprobe) or point ${env} at the binary; cstack never installs or downloads it.`);
    }
  }
}

function ffmpegSync(args, would) {
  requireFFmpeg(would);
  const r = spawnSync(binPath('ffmpeg'), ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg failed (exit ${r.status ?? r.error?.message}): ${(r.stderr ?? '').trim().split('\n').slice(-3).join(' | ')}`);
  return r;
}

const hex = (c) => `0x${parseColor(c).slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** Integrated loudness (LUFS) of a file, from ffmpeg's ebur128 summary. */
export function measureLUFS(file) {
  requireFFmpeg('measure loudness');
  const r = spawnSync(binPath('ffmpeg'), ['-hide_banner', '-nostdin', '-i', file, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = [...String(r.stderr).matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1);
  if (!m) throw new Error(`no loudness reading for ${file}`);
  return Number(m[1]);
}

/**
 * A clip: size, seconds, fps (30), source (testsrc2, which moves, or a #hex colour), boxes [{rect, color, from?, to?}]
 * drawn on top, overlay {image (workspace PNG), at: [x, y]}, soften {rect, from, radius} (blur a region from a time:
 * a planted drift), freeze_after (seconds: the last frame holds to the end, encoded lossless so the hold is exact),
 * audio {tone: Hz | noise: pink|white, lufs (measured, then gained to it) | volume_db}.
 */
function mp4Prop(spec, out, { ws }) {
  requireFFmpeg(`render ${path.basename(out)}`);
  const [W, H] = parseSize(spec.size);
  const fps = spec.fps ?? 30;
  const S = Number(spec.seconds);
  const moving = spec.freeze_after != null ? Number(spec.freeze_after) : S;
  const src = !spec.source || spec.source === 'testsrc2' ? `testsrc2=size=${W}x${H}:rate=${fps}:duration=${moving}` : `color=c=${hex(spec.source)}:size=${W}x${H}:rate=${fps}:duration=${moving}`;
  const args = ['-f', 'lavfi', '-i', src];
  const graph = [];
  let v = '[0:v]';
  let n = 0;
  const next = () => `[v${++n}]`;
  if (spec.overlay) {
    args.push('-i', ws(spec.overlay.image));
    const [x, y] = spec.overlay.at ?? [0, 0];
    const o = next();
    graph.push(`${v}[1:v]overlay=${x}:${y}${o}`);
    v = o;
  }
  for (const bx of spec.boxes ?? []) {
    const [x, y, w, h] = bx.rect;
    const when = bx.from != null || bx.to != null ? `:enable='between(t,${bx.from ?? 0},${bx.to ?? S})'` : '';
    const o = next();
    graph.push(`${v}drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${hex(bx.color ?? '#ffffff')}@1:t=fill${when}${o}`);
    v = o;
  }
  if (spec.soften) {
    const [x, y, w, h] = spec.soften.rect;
    const a = next(), b = next(), c = next(), o = next();
    graph.push(`${v}split${a}${b}`, `${b}crop=${w}:${h}:${x}:${y},boxblur=${spec.soften.radius ?? 4}${c}`, `${a}${c}overlay=${x}:${y}:enable='gte(t,${spec.soften.from ?? 0})'${o}`);
    v = o;
  }
  if (spec.freeze_after != null) {
    const o = next();
    graph.push(`${v}tpad=stop_mode=clone:stop_duration=${S - moving}${o}`);
    v = o;
  }
  if (!graph.length) graph.push(`${v}null[v0]`), (v = '[v0]');
  let audio = [];
  if (spec.audio) {
    const a = spec.audio;
    const asrc = a.noise ? `anoisesrc=color=${a.noise}:seed=7:sample_rate=48000:amplitude=0.5:duration=${S}` : `sine=frequency=${a.tone ?? 440}:sample_rate=48000:duration=${S}`;
    let gain = a.volume_db ?? 0;
    if (a.lufs != null) {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cstack-prop-'));
      try {
        const wav = path.join(tmp, 'a.wav');
        ffmpegSync(['-f', 'lavfi', '-i', asrc, wav], 'measure the audio');
        gain = Number(a.lufs) - measureLUFS(wav);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }
    args.push('-f', 'lavfi', '-i', asrc);
    audio = ['-map', `${spec.overlay ? 2 : 1}:a`, '-af', `volume=${gain.toFixed(2)}dB`, '-c:a', 'aac', '-b:a', '192k'];
  }
  const lossless = spec.freeze_after != null ? ['-qp', '0'] : ['-crf', '20'];
  const tmpOut = `${out}.tmp-${process.pid}.mp4`;
  try {
    ffmpegSync([...args, '-filter_complex', graph.join(';'), '-map', v, ...audio, '-t', String(S), '-c:v', 'libx264', '-preset', 'ultrafast', ...lossless, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', tmpOut], `render ${path.basename(out)}`);
    fs.renameSync(tmpOut, out);
  } finally {
    fs.rmSync(tmpOut, { force: true });
  }
}

// ---------- pdf ----------
const pdfText = (s) => String(s).replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '?');

/**
 * A minimal valid PDF: size [w, h] in points (default A4), title, pages [{text: [lines], at: [x, y], font_size,
 * title_size (first line), color (text ink), draw: raw content-stream operators}], e.g. a vector logo drawn with
 * `re`/`m`/`l`/`c` and `f`.
 */
export function pdfProp(spec) {
  const [pw, ph] = spec.size ?? [595, 842];
  const objs = [];
  const add = (s) => objs.push(s) && objs.length;
  const catalog = add('');
  const pages = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids = [];
  for (const p of spec.pages) {
    const size = p.font_size ?? 11;
    const [x, y] = p.at ?? [56, ph - 72];
    const lines = (p.text ?? []).map((l, i) => `BT /F1 ${i === 0 && p.title_size ? p.title_size : size} Tf ${x} ${y - i * size * 1.6} Td (${pdfText(l)}) Tj ET`);
    // drawing runs in its own graphics state, so its fill colour never leaks into the text (ink is `color`, default black)
    const ink = p.color ? parseColor(p.color).slice(0, 3).map((v) => (v / 255).toFixed(3)).join(' ') : '0 0 0';
    const stream = [p.draw ? `q\n${p.draw}\nQ` : '', lines.length ? `${ink} rg` : '', ...lines].filter(Boolean).join('\n');
    const content = add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pages} 0 R >>`;
  objs[pages - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const info = add(`<< /Title (${pdfText(spec.title ?? 'document')}) /Producer (cstack eval prop) >>`);
  let body = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => {
    const at = Buffer.byteLength(body);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

// ---------- verification (tests and `cstack evals run --dry-run` callers) ----------
function ffprobeJSON(file) {
  requireFFmpeg('probe the clip');
  const r = spawnSync(binPath('ffprobe'), ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffprobe failed: ${r.stderr.trim()}`);
  return JSON.parse(r.stdout);
}

/** Problems with one built prop against its spec ([] = it exists and is what the spec says). */
export function verifyProp(file, spec) {
  if (!exists(file)) return [`missing: ${file}`];
  const p = [];
  const want = (ok, msg) => ok || p.push(msg);
  try {
    switch (spec.kind) {
      case 'glb': {
        const ctx = loadGltf(file);
        const g = geometryStats(ctx);
        if (spec.triangles != null) want(g.triangles === spec.triangles, `triangles ${g.triangles}, spec ${spec.triangles}`);
        const imgs = imageInfo(ctx);
        (spec.textures ?? []).forEach((t, i) => want(imgs[i]?.width === t.width && imgs[i]?.height === t.height, `texture ${i} is ${imgs[i]?.width}x${imgs[i]?.height}, spec ${t.width}x${t.height}`));
        if (spec.bytes != null) want(Math.abs(ctx.fileBytes - spec.bytes) <= 16, `${ctx.fileBytes} bytes, spec ${spec.bytes}`);
        if (spec.extras != null) want(JSON.stringify(ctx.json.asset.extras) === JSON.stringify(spec.extras), 'asset.extras differs from the spec');
        for (const m of spec.materials ?? []) want((ctx.json.materials ?? []).some((x) => x.name === m), `no material named ${m}`);
        want(!ctx.warnings.length, `loader warnings: ${ctx.warnings.join('; ')}`);
        break;
      }
      case 'png':
      case 'frame': {
        const img = decodePNG(fs.readFileSync(file));
        const size = spec.kind === 'png' && !spec.from ? parseSize(spec.size) : null;
        if (size) want(img.width === size[0] && img.height === size[1], `${img.width}x${img.height}, spec ${size.join('x')}`);
        break;
      }
      case 'mockup':
        decodePNG(fs.readFileSync(file));
        break;
      case 'mp4': {
        const j = ffprobeJSON(file);
        const v = j.streams.find((s) => s.codec_type === 'video');
        const [w, h] = parseSize(spec.size);
        want(v && v.width === w && v.height === h, `video ${v?.width}x${v?.height}, spec ${w}x${h}`);
        want(Math.abs(Number(j.format.duration) - spec.seconds) < 0.15, `duration ${j.format.duration}, spec ${spec.seconds}`);
        if (spec.audio) want(j.streams.some((s) => s.codec_type === 'audio'), 'no audio stream');
        if (spec.audio?.lufs != null) {
          const l = measureLUFS(file);
          want(Math.abs(l - spec.audio.lufs) <= 1, `integrated loudness ${l} LUFS, spec ${spec.audio.lufs}`);
        }
        break;
      }
      case 'pdf': {
        const s = fs.readFileSync(file, 'latin1');
        want(s.startsWith('%PDF-') && s.trimEnd().endsWith('%%EOF'), 'not a PDF');
        want((s.match(/\/Type \/Page\b/g) ?? []).length === spec.pages.length, 'page count differs from the spec');
        break;
      }
      case 'svg':
      case 'text':
        want(fs.readFileSync(file, 'utf8') === spec.text, 'content differs from the spec');
        break;
      case 'copy': {
        const src = path.resolve(ROOT, spec.from);
        if (fs.statSync(src).isFile()) want(fs.readFileSync(src).equals(fs.readFileSync(file)), 'copy differs from its source');
        else want(fs.readdirSync(src).every((n) => exists(path.join(file, n))), 'copied folder is missing files');
        break;
      }
      case 'flow-plan': {
        const plan = YAML.parse(fs.readFileSync(file, 'utf8'));
        want(plan?.status === 'plan', 'flow plan without status: plan');
        if (spec.deliverable) want(plan.deliverable?.kind === spec.deliverable, 'deliverable differs from the spec');
        break;
      }
    }
  } catch (e) {
    p.push(e.message);
  }
  return p;
}
