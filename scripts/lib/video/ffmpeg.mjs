// cstack video: the ffmpeg/ffprobe process layer. Argument arrays only (never a shell string), a fail-closed MISSING
// error when a binary is absent (never installs, never downloads), output guards (never an input, never an existing
// file without force), temp-then-rename writes, and the `.gen.json` sidecar that makes every output reproducible.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { hashValue, nowISO, writeJSON, assertNotOfficial } from '../core.mjs';

export const CSTACK_VERSION = createRequire(import.meta.url)('../../../package.json').version;

export class MissingTool extends Error {
  constructor(msg) {
    super(msg);
    this.code = 'MISSING';
  }
}

/** ffmpeg: $CSTACK_FFMPEG or PATH. ffprobe: $CSTACK_FFPROBE, else the ffprobe beside $CSTACK_FFMPEG, else PATH. */
export function binPath(name, env = process.env) {
  if (name === 'ffmpeg') return env.CSTACK_FFMPEG || 'ffmpeg';
  if (env.CSTACK_FFPROBE) return env.CSTACK_FFPROBE;
  const ff = env.CSTACK_FFMPEG;
  if (ff && /[\\/]/.test(ff)) return path.join(path.dirname(ff), `ffprobe${path.extname(ff)}`);
  return 'ffprobe';
}

function collect(bin, args, { cwd, maxBytes = 64 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    let child;
    try {
      child = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (e) {
      return reject(e);
    }
    const out = [];
    const err = [];
    let outLen = 0;
    let errLen = 0;
    child.stdout.on('data', (d) => {
      if (outLen >= maxBytes) return;
      out.push(d);
      outLen += d.length;
    });
    child.stderr.on('data', (d) => {
      err.push(d);
      errLen += d.length;
      while (errLen > maxBytes && err.length > 1) errLen -= err.shift().length;
    });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8'), elapsed_ms: Date.now() - t0 }));
  });
}

const infoCache = new Map();
/** {bin, version, libs} from `<bin> -version`, or null when the binary is missing or broken. Cached per binary path. */
export function toolInfo(name) {
  const bin = binPath(name);
  if (!infoCache.has(bin))
    infoCache.set(
      bin,
      collect(bin, ['-version'])
        .then((r) => {
          if (r.code !== 0) return null;
          const first = r.stdout.split('\n')[0];
          const libs = {};
          for (const m of r.stdout.matchAll(/^(lib\w+)\s+(\d+)\.\s*(\d+)\.\s*(\d+)/gm)) libs[m[1]] = `${+m[2]}.${+m[3]}.${+m[4]}`;
          return { name, version: first.match(/version\s+(\S+)/)?.[1] ?? first.trim(), libs };
        })
        .catch(() => null)
    );
  return infoCache.get(bin);
}

/** Fail closed before touching anything: names the missing binary and what the command would have done. */
export async function requireTools(names, would) {
  for (const n of names) {
    if (await toolInfo(n)) continue;
    const bin = binPath(n);
    const env = n === 'ffmpeg' ? 'CSTACK_FFMPEG' : 'CSTACK_FFPROBE';
    throw new MissingTool(`MISSING: ${n} (no working "${bin}" found). This command would have ${would}. Nothing was written. Install ffmpeg yourself (it ships ffprobe) or point ${env} at the binary; cstack never installs or downloads it.`);
  }
}

/** A path ffmpeg reads as a plain file relative to cwd: POSIX separators, "./" prefix so names starting with "-" or holding ":" stay files. */
export function ffPath(file, cwd) {
  const r = path.relative(cwd, path.resolve(file));
  if (!r) return '.';
  if (path.isAbsolute(r)) return r;
  const p = r.split(path.sep).join('/');
  return p === '..' || p.startsWith('../') ? p : `./${p}`;
}

// ffmpeg-filters "Notes on filtergraph escaping": level 1 escapes the option value, level 2 the graph description.
export const escapeFilterValue = (s) =>
  String(s)
    .replace(/[\\':]/g, (c) => `\\${c}`)
    .replace(/[\\'[\],;]/g, (c) => `\\${c}`);

const tail = (s, n = 8) =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-n)
    .join(' | ');

async function run(name, args, { cwd = process.cwd() } = {}) {
  const started_at = nowISO();
  let r;
  try {
    r = await collect(binPath(name), args, { cwd });
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'EACCES') throw new MissingTool(`MISSING: ${name} (${binPath(name)}: ${e.code}). Nothing more was written.`);
    throw e;
  }
  if (r.code !== 0) throw new Error(`${name} failed (exit ${r.code ?? r.signal}): ${tail(r.stderr) || 'no output'}`);
  return { ...r, started_at };
}
export const ffmpeg = (args, opts) => run('ffmpeg', args, opts);
export const ffprobe = (args, opts) => run('ffprobe', args, opts);

// Shared argument heads. -n never overwrites: outputs go to fresh temp names and are renamed by us after success.
export const HEAD = ['-hide_banner', '-nostdin', '-nostats'];
export const encodeHead = (level = 'error') => [...HEAD, '-loglevel', level, '-n'];
export const analyzeHead = () => [...HEAD, '-loglevel', 'info'];
const MOV = new Set(['.mp4', '.mov', '.m4v']);
export const containerFlags = (file) => (MOV.has(path.extname(file).toLowerCase()) ? ['-movflags', '+faststart'] : []);
export const x264 = ({ crf = 18, preset = 'medium' } = {}) => ['-c:v', 'libx264', '-preset', String(preset), '-crf', String(crf), '-pix_fmt', 'yuv420p'];

export function hashFile(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file)
      .on('error', reject)
      .on('data', (d) => h.update(d))
      .on('end', () => resolve(h.digest('hex')));
  });
}

const realish = (p) => {
  const abs = path.resolve(p);
  try {
    return fs.realpathSync(abs);
  } catch {
    try {
      return path.join(fs.realpathSync(path.dirname(abs)), path.basename(abs));
    } catch {
      return abs;
    }
  }
};

/** Refuse to write over an input, two outputs on one path, or an existing file without force. */
export function guardOutputs(outputs, inputs = [], { force = false } = {}) {
  const ins = new Set(inputs.map(realish));
  const seen = new Set();
  for (const o of outputs) {
    assertNotOfficial(o);
    const r = realish(o);
    if (ins.has(r)) throw new Error(`refusing to overwrite an input (${o}); choose a new --out (originals are never edited in place)`);
    if (seen.has(r)) throw new Error(`two outputs would share one path: ${o}`);
    seen.add(r);
    if (fs.existsSync(o) && !force) throw new Error(`output exists: ${o} (pass --force to replace a previous output; inputs are never replaced)`);
  }
}

export function tempFor(final) {
  const ext = path.extname(final);
  return path.join(path.dirname(final), `.${path.basename(final, ext)}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}${ext}`);
}

export const sidecarPath = (output) => `${output}.gen.json`;
const relTo = (dir, p) => path.relative(dir, p).split(path.sep).join('/') || '.';

/**
 * Collects what made one output: hashed inputs, every ffmpeg step (exact args, cwd, timings) and parameters, then
 * writes `<output>.gen.json` (paths relative to the sidecar). Steps run with cwd = the output's folder and
 * relative file arguments, so the recorded args replay as-is from there.
 */
export class Recorder {
  constructor(operation, params = {}, inputs = []) {
    this.operation = operation;
    this.params = params;
    this.inputs = [...inputs];
    this.steps = [];
    this.warnings = [];
    this.t0 = Date.now();
    this.started_at = nowISO();
  }
  async addInput(file, role) {
    const abs = path.resolve(file);
    const rec = { file: abs, sha256: await hashFile(abs), bytes: fs.statSync(abs).size, ...(role ? { role } : {}) };
    this.inputs.push(rec);
    return rec;
  }
  /** Run ffmpeg writing `outputs` ({final: path}) through temp names; renames on success, removes temps on failure. */
  async ffmpeg(build, { cwd, outputs = [] } = {}) {
    const temps = outputs.map((o) => [tempFor(o), o]);
    const args = build(...temps.map(([t]) => ffPath(t, cwd)));
    try {
      const r = await ffmpeg(args, { cwd });
      for (const [t, o] of temps) fs.renameSync(t, o);
      const swap = new Map(temps.map(([t, o]) => [ffPath(t, cwd), ffPath(o, cwd)]));
      this.steps.push({ bin: 'ffmpeg', cwd, args: args.map((a) => swap.get(a) ?? a), started_at: r.started_at, elapsed_ms: r.elapsed_ms });
      return r;
    } catch (e) {
      for (const [t] of temps) fs.rmSync(t, { force: true });
      throw e;
    }
  }
  /** Record an analysis pass (no output file) that this output depends on. */
  note(cwd, args, r) {
    this.steps.push({ bin: 'ffmpeg', cwd, args, started_at: r.started_at, elapsed_ms: r.elapsed_ms, analysis: true });
  }
  /** Writes `<output>.gen.json`, and one beside each extra output (OTIO, ASS) with the same run seen from there. */
  async write(output, result = {}, extraOutputs = []) {
    const info = await toolInfo('ffmpeg');
    const finished = Date.now();
    const files = [output, ...extraOutputs].map((p) => path.resolve(p));
    const hashes = new Map();
    for (const p of files) hashes.set(p, { sha256: await hashFile(p), bytes: fs.statSync(p).size });
    const recordFor = (file) => {
      const dir = path.dirname(file);
      const desc = (p) => ({ path: relTo(dir, p), ...hashes.get(p) });
      const others = files.filter((p) => p !== file);
      return {
        tool: `cstack video ${this.operation.replace(/^video\./, '')}`,
        provider: 'local',
        model: 'ffmpeg',
        operation: this.operation,
        cstack_version: CSTACK_VERSION,
        output: desc(file),
        ...(others.length ? { extra_outputs: others.map(desc) } : {}),
        inputs: this.inputs.map((i) => ({ path: relTo(dir, i.file), sha256: i.sha256, bytes: i.bytes, ...(i.role ? { role: i.role } : {}) })),
        input_hashes: this.inputs.map((i) => i.sha256),
        params: this.params,
        ffmpeg: info ? { version: info.version, ...info.libs } : null,
        recipe_hash: hashValue({ operation: this.operation, inputs: this.inputs.map((i) => i.sha256), params: this.params, ffmpeg: info?.version ?? null }),
        steps: this.steps.map((s) => ({ ...s, cwd: relTo(dir, s.cwd) })),
        warnings: this.warnings,
        result,
        cost: null,
        started_at: this.started_at,
        finished_at: new Date(finished).toISOString(),
        elapsed_ms: finished - this.t0,
        created_at: nowISO(),
      };
    };
    for (const p of files) writeJSON(sidecarPath(p), recordFor(p));
    return recordFor(files[0]);
  }
}

/** Map with at most n tasks in flight; results keep input order. */
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

export function int(v, flag, min, max) {
  const n = Number(v);
  if (v === true || !Number.isInteger(n) || n < min || n > max) throw new Error(`${flag} must be an integer from ${min} to ${max} (got ${v})`);
  return n;
}

export function numIn(v, flag, min, max) {
  const n = Number(v);
  if (v === true || !Number.isFinite(n) || n < min || n > max) throw new Error(`${flag} must be a number from ${min} to ${max} (got ${v})`);
  return n;
}

/** Seconds as ffmpeg takes them (fixed 6 decimals, never exponent notation). */
export const sec = (t) => (Math.round(t * 1e6) / 1e6).toFixed(6).replace(/\.?0+$/, '') || '0';
export const round = (v, d = 3) => (v == null || !Number.isFinite(v) ? v : Math.round(v * 10 ** d) / 10 ** d);

/** "1080x1920" -> {width, height}; even integers only (H.264 4:2:0). */
export function parseSize(s, flag = '--size') {
  const m = String(s ?? '').match(/^(\d+)x(\d+)$/);
  if (!m) throw new Error(`${flag} must be WxH, e.g. 1080x1920 (got ${s})`);
  const [width, height] = [Number(m[1]), Number(m[2])];
  if (width < 2 || height < 2 || width % 2 || height % 2) throw new Error(`${flag} ${s}: width and height must be even and >= 2 (H.264 yuv420p)`);
  return { width, height };
}

/** 30 | "30" | "30000/1001" -> {num, den, value, str}. */
export function parseFps(v, flag = '--fps') {
  const m = String(v ?? '').match(/^(\d+(?:\.\d+)?)(?:\/(\d+))?$/);
  if (!m) throw new Error(`${flag} must be a number or a fraction like 30000/1001 (got ${v})`);
  let num = Number(m[1]);
  let den = m[2] ? Number(m[2]) : 1;
  if (!Number.isInteger(num)) {
    const k = 10 ** (m[1].split('.')[1].length);
    [num, den] = [Math.round(num * k), den * k];
  }
  const value = num / den;
  if (!(value > 0 && value <= 240)) throw new Error(`${flag} ${v} is out of range (0, 240]`);
  return { num, den, value, str: den === 1 ? String(num) : `${num}/${den}` };
}

/** Seconds from a number, "1.5", "1.5s" or "[hh:]mm:ss(.xxx)". */
export function parseTime(v, what = 'time') {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d+(?:\.\d+)?)s?$/);
  if (m) return Number(m[1]);
  m = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  if (m) return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  throw new Error(`${what}: "${v}" is not seconds or [hh:]mm:ss.xxx`);
}
