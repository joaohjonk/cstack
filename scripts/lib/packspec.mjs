// Pack specs (F86, owner's rule 2026-10-05): cstack never invents packaging sizes. A brand workspace carries the real
// pack as a file, `*.pack-spec.yaml` (schema pack-spec): front and flat sizes in mm from the dieline, the converter's
// print file or a measurement, with the source named and the owner's approval. The make gate refuses a pack render
// without one, and `cstack pack check` measures every pack-bearing output against it before anyone reviews it.
//   flat artwork (SVG): the document's aspect against the flat (print) size, or the front when no flat size is given
//   a picture: the pack's box in the frame, from --box or a judge command, against the front aspect
// A pack seen at an angle cannot be measured from a box; it is reported unverifiable and stays labelled illustrative.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { exists, readData, walk } from './core.mjs';
import { imageSize } from './image.mjs';

export const DEFAULT_TOLERANCE = 0.04; // 4% on the height:width ratio; a 70 x 85 face drawn 70 x 96 is 13% off
const SPEC = /\.pack-spec\.(ya?ml|json)$/;
const SKIP = ['work', 'state', 'node_modules', '.git'];

export function findPackSpecs(ws) {
  const out = [];
  if (!exists(ws)) return out;
  for (const d of fs.readdirSync(ws)) {
    if (SKIP.includes(d)) continue;
    const p = path.join(ws, d);
    if (fs.statSync(p).isDirectory()) out.push(...walk(p, (f) => SPEC.test(f)));
    else if (SPEC.test(d)) out.push(p);
  }
  return out.sort();
}

// approved = the owner said yes (locked or current) and the sizes name where they came from
export function approvedSpec(spec) {
  return ['locked', 'current'].includes(spec?.approval?.status) && !!spec?.source?.kind && spec.source.kind !== 'guess';
}

export function approvedSpecs(ws) {
  return findPackSpecs(ws)
    .map((file) => {
      try {
        return { file, spec: readData(file) };
      } catch {
        return null;
      }
    })
    .filter((x) => x && approvedSpec(x.spec));
}

const ratio = (s) => (s?.width > 0 && s?.height > 0 ? s.height / s.width : null);

/** {front, flat}: height:width of the pack's front face and of its flat print size, from the spec. */
export function specAspects(spec) {
  return { front: ratio(spec.front_mm), flat: ratio(spec.flat_mm) };
}

/**
 * specWarnings(spec, {ws}) -> [string]: what the owner still has to decide or confirm before renders rely on the spec.
 *   artwork laid out at a different front proportion than the print file (a 70 x 96 face for a 70 x 85 front)
 *   a machine repeat that matches neither side of the flat print size
 *   a source file whose hash no longer matches the one recorded
 *   estimated sizes, on the pack or on a carton
 */
export function specWarnings(spec, { ws = null } = {}) {
  const out = [];
  const tol = Number(spec.tolerance ?? DEFAULT_TOLERANCE);
  const front = ratio(spec.front_mm);
  const art = ratio(spec.artwork_mm);
  if (art && front && pctOff(art, front) > tol * 100 && !spec.artwork_mismatch)
    out.push(`artwork is laid out at ${spec.artwork_mm.width} x ${spec.artwork_mm.height} mm, ${pctOff(art, front)}% off the ${spec.front_mm.width} x ${spec.front_mm.height} mm front: an owner decision (re-lay the face, or change the machine repeat); record it in artwork_mismatch`);
  const f = spec.flat_mm;
  if (spec.repeat_mm && f && ![f.width, f.height].some((side) => Math.abs(side - spec.repeat_mm) / spec.repeat_mm <= tol) && !spec.artwork_mismatch)
    out.push(`machine repeat ${spec.repeat_mm} mm matches neither side of the ${f.width} x ${f.height} mm flat print size: an owner decision; record it in artwork_mismatch`);
  if (spec.source?.sha256 && spec.source.file) {
    const file = path.isAbsolute(spec.source.file) || !ws ? spec.source.file : path.join(ws, spec.source.file);
    if (exists(file) && crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== spec.source.sha256)
      out.push(`${spec.source.file} changed since the sizes were read (sha256 differs): re-read it and ask the owner to confirm`);
  }
  if (spec.estimated) out.push(`sizes are estimated${spec.estimated_note ? ` (${spec.estimated_note})` : ''}: renders say so`);
  for (const c of spec.cartons ?? []) if (c.estimated || c.status === 'testing') out.push(`carton ${c.id} is ${c.estimated ? 'estimated' : 'in testing'}${c.source ? ` (${c.source})` : ''}: renders of it say so`);
  return out;
}

// SVG document size: width/height attributes in a length unit, else the viewBox
function svgSize(file) {
  const head = fs.readFileSync(file, 'utf8').slice(0, 4000);
  const tag = head.match(/<svg\b[^>]*>/i)?.[0] ?? '';
  const attr = (n) => tag.match(new RegExp(`\\b${n}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1];
  const num = (v) => (v && !/%$/.test(v) ? parseFloat(v) : NaN);
  const w = num(attr('width'));
  const h = num(attr('height'));
  if (w > 0 && h > 0) return { width: w, height: h };
  const vb = attr('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (vb?.length === 4 && vb[2] > 0 && vb[3] > 0) return { width: vb[2], height: vb[3] };
  return null;
}

export function boxPrompt(file, spec) {
  return [
    `Look at the image file ${file}. Find the ${spec.format ?? 'pack'} (${spec.product ?? 'the product'}) in it.`,
    'Give its bounding box in pixels, and say whether its front face is seen straight on (front) or at an angle (angled), or whether no pack is visible (none).',
    'Reply with one JSON object and nothing else: {"view": "front"|"angled"|"none", "box": [x, y, width, height]}',
  ].join('\n');
}

function parseBox(out) {
  const s = String(out ?? '');
  for (let end = s.lastIndexOf('}'); end !== -1; end = s.lastIndexOf('}', end - 1))
    for (let start = s.lastIndexOf('{', end); start !== -1; start = s.lastIndexOf('{', start - 1)) {
      try {
        const v = JSON.parse(s.slice(start, end + 1));
        if (typeof v?.view === 'string') return v;
      } catch {
        /* keep looking */
      }
    }
  return null;
}

const pctOff = (got, want) => Math.round((Math.abs(got - want) / want) * 1000) / 10;

function verdict(got, want, tol, what) {
  const off = pctOff(got, want);
  return { result: off <= tol * 100 ? 'pass' : 'fail', measured: Math.round(got * 1000) / 1000, expected: Math.round(want * 1000) / 1000, off_pct: off, evidence: `${what} height:width ${Math.round(got * 1000) / 1000} against the spec's ${Math.round(want * 1000) / 1000} (${off}% off, tolerance ${tol * 100}%)` };
}

/**
 * checkPack(files, {spec, specFile, box: [x,y,w,h], judge: argv, tolerance}) -> {images: [...], ok}
 * Raster images need --box or --judge: cstack does not guess where the pack is. A front view measured against the
 * front face; angled or missing is `unverifiable`, which fails the check (the render stays illustrative).
 */
export function checkPack(files, { spec, box = null, judge = null, tolerance } = {}) {
  if (!spec) throw new Error('--spec <file.pack-spec.yaml> required: cstack never invents packaging sizes');
  const tol = Number(tolerance ?? spec.tolerance ?? DEFAULT_TOLERANCE);
  const { front, flat } = specAspects(spec);
  if (!front) throw new Error('the spec has no front_mm {width, height}');
  const images = files.map((f) => {
    const file = path.resolve(f);
    if (!exists(file)) return { file, result: 'error', evidence: 'not found' };
    if (/\.svg$/i.test(file)) {
      const s = svgSize(file);
      if (!s) return { file, result: 'error', evidence: 'no width/height or viewBox on the <svg>' };
      return { file, kind: 'flat', ...verdict(s.height / s.width, flat ?? front, tol, flat ? 'flat artwork against the flat print size:' : 'flat artwork against the front face:') };
    }
    let b = box;
    let how = '--box';
    if (!b && judge) {
      const r = spawnSync(judge[0], judge.slice(1), { input: boxPrompt(file, spec), encoding: 'utf8', cwd: path.dirname(file), timeout: 300000, maxBuffer: 16 * 1024 * 1024 });
      if (r.error || r.status !== 0) return { file, result: 'error', evidence: `judge ${r.error?.message ?? `exit ${r.status}`}` };
      const v = parseBox(r.stdout);
      if (!v) return { file, result: 'error', evidence: 'the judge reply had no {"view": ...} answer' };
      if (v.view !== 'front') return { file, result: 'unverifiable', evidence: v.view === 'none' ? 'no pack found in the frame' : 'the pack is seen at an angle, so its proportions cannot be measured from a box; label the render illustrative or render the true pack (cstack mockup, three-d)' };
      b = v.box;
      how = 'judge box';
    }
    if (!b) throw new Error('MISSING: a picture needs the pack\'s box: --box x,y,w,h (pixels) or --judge "<agent command that can read an image>"; cstack does not guess where the pack is');
    if (!(Array.isArray(b) && b.length === 4 && b[2] > 0 && b[3] > 0)) return { file, result: 'error', evidence: `bad box ${JSON.stringify(b)}` };
    let size = null;
    try {
      size = imageSize(file);
    } catch {
      /* size only bounds the box */
    }
    if (size && (b[0] + b[2] > size.width + 1 || b[1] + b[3] > size.height + 1)) return { file, result: 'error', evidence: `box ${b.join(',')} runs outside the ${size.width}x${size.height} image` };
    return { file, kind: 'picture', box: b, ...verdict(b[3] / b[2], front, tol, `pack (${how})`) };
  });
  return { tolerance: tol, images, ok: images.every((i) => i.result === 'pass') };
}

/**
 * pdfBoxes(file): the page boxes a print or dieline PDF declares (TrimBox is the finished size), in mm.
 * Reads uncompressed page dictionaries only; crop marks drawn as paths are not parsed, so a PDF without a TrimBox
 * says so instead of guessing from the media size.
 */
export function pdfBoxes(file) {
  const raw = fs.readFileSync(file, 'latin1');
  if (!raw.startsWith('%PDF')) throw new Error(`${file} is not a PDF`);
  const pt = 25.4 / 72;
  const out = {};
  for (const name of ['MediaBox', 'CropBox', 'BleedBox', 'TrimBox', 'ArtBox']) {
    const m = raw.match(new RegExp(`/${name}\\s*\\[\\s*([-\\d.]+)\\s+([-\\d.]+)\\s+([-\\d.]+)\\s+([-\\d.]+)\\s*\\]`));
    if (!m) continue;
    const [x0, y0, x1, y1] = m.slice(1).map(Number);
    out[name] = { width: Math.round(Math.abs(x1 - x0) * pt * 10) / 10, height: Math.round(Math.abs(y1 - y0) * pt * 10) / 10 };
  }
  return out;
}
