// `cstack 3d frames`: budget check for an image-sequence ("fake 3D") hero: frame count, total and per-frame
// bytes, one size for every frame (about 1080 px wide at most), numbering without gaps, one web format.
// Findings: frames.count, frames.bytes, frames.frame-bytes, frames.dimensions, frames.sequence, frames.format.
import fs from 'node:fs';
import path from 'node:path';
import { sizeOfFile } from './images.mjs';
import { FRAME_BUDGET, fmtBytes, fmtBytesExact, fmtInt, worst } from './budgets.mjs';

const IMAGE_EXT = /\.(webp|png|jpe?g|avif|gif)$/i;
const EXT_FORMAT = { '.webp': 'webp', '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.avif': 'avif', '.gif': 'gif' };

/** Frame numbering: the dominant prefix/####/suffix pattern, gaps, duplicates, stray and unnumbered names. */
export function analyseNames(names) {
  const parsed = names.map((name) => {
    const ext = path.extname(name).toLowerCase();
    const m = name.slice(0, name.length - ext.length).match(/^(.*?)(\d+)(\D*)$/);
    return m ? { name, ext, prefix: m[1], digits: m[2], suffix: m[3], index: Number(m[2]) } : { name, ext, index: null };
  });
  const numbered = parsed.filter((p) => p.index !== null);
  const key = (p) => `${p.prefix}\u0000${p.suffix}${p.ext}`;
  const counts = new Map();
  for (const p of numbered) counts.set(key(p), (counts.get(key(p)) ?? 0) + 1);
  const main = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0];
  const seq = numbered.filter((p) => key(p) === main);
  const idx = seq.map((p) => p.index).sort((a, b) => a - b);
  const uniq = [...new Set(idx)];
  const duplicates = [...new Set(idx.filter((v, i) => i && idx[i - 1] === v))];
  const missing = uniq.length ? uniq.at(-1) - uniq[0] + 1 - uniq.length : 0;
  const gaps = [];
  for (let i = 1; i < uniq.length && gaps.length < 20; i++) for (let k = uniq[i - 1] + 1; k < uniq[i] && gaps.length < 20; k++) gaps.push(k);
  const widths = new Set(seq.map((p) => p.digits.length));
  const first = seq[0];
  return {
    pattern: first ? `${first.prefix}${widths.size === 1 ? '#'.repeat(first.digits.length) : '{n}'}${first.suffix}${first.ext}` : null,
    start: uniq[0] ?? null,
    end: uniq.at(-1) ?? null,
    text_order_safe: widths.size <= 1,
    width: widths.size === 1 ? [...widths][0] : null,
    gaps,
    missing,
    duplicates,
    strays: numbered.filter((p) => key(p) !== main).map((p) => p.name),
    unnumbered: parsed.filter((p) => p.index === null).map((p) => p.name),
  };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};
const some = (xs, n = 5) => xs.slice(0, n).join(', ') + (xs.length > n ? `, +${xs.length - n} more` : '');

/**
 * Check a directory of frames (non-recursive; hidden and non-image files ignored).
 * @param {string} dir
 * @param {{maxFrames?: number, maxBytes?: number, maxWidth?: number, base?: string}} opts
 */
export function checkFrames(dir, { maxFrames = FRAME_BUDGET.max_frames, maxBytes = FRAME_BUDGET.max_bytes, maxWidth = FRAME_BUDGET.max_width, base = process.cwd() } = {}) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`not a directory: ${dir}`);
  if (!(Number.isInteger(maxFrames) && maxFrames > 0)) throw new Error('--max-frames must be a positive integer');
  if (!(Number.isInteger(maxWidth) && maxWidth > 0)) throw new Error('--max-width must be a positive integer');
  const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && !e.name.startsWith('.'));
  const names = entries.map((e) => e.name).filter((n) => IMAGE_EXT.test(n)).sort();
  const frames = names.map((name) => {
    const p = path.join(dir, name);
    const row = { name, bytes: fs.statSync(p).size };
    try {
      Object.assign(row, sizeOfFile(p));
    } catch (e) {
      row.error = e.message;
    }
    return row;
  });
  const relDir = path.relative(base, path.resolve(dir));
  const r = {
    dir: relDir && !relDir.startsWith('..') && !path.isAbsolute(relDir) ? relDir : path.resolve(dir),
    frames: frames.length,
    ignored: entries.length - names.length,
    budget: { max_frames: maxFrames, max_bytes: maxBytes, max_width: maxWidth },
  };
  const findings = [];
  const add = (id, level, detail, extra = {}) => findings.push({ id, level, detail, ...extra });
  if (!frames.length) {
    add('frames.count', 'fail', `no image frames (.webp/.png/.jpg/.avif/.gif) in ${r.dir}`, { value: 0, limit: maxFrames });
    return Object.assign(r, { findings, result: 'fail', ok: false });
  }
  const sizes = frames.map((f) => f.bytes);
  const total = sizes.reduce((a, n) => a + n, 0);
  const med = median(sizes);
  const largest = frames.reduce((a, f) => (f.bytes > a.bytes ? f : a));
  r.bytes = { total, mean: Math.round(total / frames.length), median: Math.round(med), min: Math.min(...sizes), max: largest.bytes, largest: largest.name };
  const dims = new Map();
  for (const f of frames.filter((x) => !x.error)) dims.set(`${f.width}x${f.height}`, [...(dims.get(`${f.width}x${f.height}`) ?? []), f.name]);
  r.dimensions = [...dims.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, v]) => ({ size: k, frames: v.length }));
  const formats = {};
  for (const f of frames) formats[f.format ?? 'unreadable'] = (formats[f.format ?? 'unreadable'] ?? 0) + 1;
  r.formats = formats;
  r.sequence = analyseNames(names);

  add('frames.count', frames.length > maxFrames ? 'fail' : 'pass', `${fmtInt(frames.length)} frames ${frames.length > maxFrames ? '>' : '<='} ${fmtInt(maxFrames)}${frames.length > maxFrames ? '; drop frames (every 2nd) or shorten the move' : ''}`, { value: frames.length, limit: maxFrames });
  add('frames.bytes', total > maxBytes ? 'fail' : 'pass', `${fmtBytesExact(total)} ${total > maxBytes ? '>' : '<='} ${fmtBytes(maxBytes)}${total > maxBytes ? '; lower quality, size or frame count' : ''}`, { value: total, limit: maxBytes });

  const heavy = frames.filter((f) => f.bytes > 3 * med && f.bytes > 10_000);
  add('frames.frame-bytes', heavy.length ? 'warn' : 'pass', heavy.length ? `${heavy.length} frame(s) over 3x the median ${fmtBytes(Math.round(med))}: ${some(heavy.map((f) => `${f.name} ${fmtBytes(f.bytes)}`))} (a cut, a flash or an encoder setting?)` : `median ${fmtBytes(Math.round(med))}, largest ${fmtBytes(largest.bytes)} (${largest.name})`, { median: Math.round(med), max: largest.bytes });

  const unreadable = frames.filter((f) => f.error);
  if (unreadable.length) add('frames.dimensions', 'fail', `${unreadable.length} unreadable frame(s): ${some(unreadable.map((f) => f.name))}`);
  else if (dims.size > 1) add('frames.dimensions', 'fail', `mixed sizes: ${[...dims.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, v]) => `${k} (${v.length}${v.length <= 3 ? `: ${v.join(', ')}` : ''})`).join('; ')}; a scrubber canvas needs one size`);
  else if (frames[0].width > maxWidth) add('frames.dimensions', 'warn', `all ${[...dims.keys()][0]}, wider than the canvas cap of about ${maxWidth} px: downscale (decode cost and bytes grow with area)`, { width: frames[0].width, limit: maxWidth });
  else add('frames.dimensions', 'pass', `all ${[...dims.keys()][0]} (<= ${maxWidth} px wide)`);

  const s = r.sequence;
  const problems = [];
  if (!s.pattern) problems.push('no frame numbers in the names, so the order is undefined');
  if (s.unnumbered.length && s.pattern) problems.push(`${s.unnumbered.length} unnumbered: ${some(s.unnumbered)}`);
  if (s.strays.length) problems.push(`${s.strays.length} name(s) outside the pattern ${s.pattern}: ${some(s.strays)} (mixed sequences?)`);
  if (s.duplicates.length) problems.push(`duplicate frame numbers: ${some(s.duplicates)}`);
  if (s.missing) problems.push(`${s.missing} missing frame number(s): ${some(s.gaps)}${s.missing > s.gaps.length ? ', ...' : ''}`);
  if (problems.length) add('frames.sequence', 'fail', problems.join('; '));
  else if (!s.text_order_safe) add('frames.sequence', 'warn', `${s.pattern} ${s.start}..${s.end} contiguous, but numbers are not zero-padded: text sorting puts 10 before 9; pad to ${String(s.end).length} digits`);
  else add('frames.sequence', 'pass', `${s.pattern} ${s.start}..${s.end}, contiguous`);

  const kinds = Object.keys(formats);
  const mismatched = frames.filter((f) => f.format && EXT_FORMAT[path.extname(f.name).toLowerCase()] !== f.format);
  if (kinds.length > 1) add('frames.format', 'fail', `mixed formats: ${Object.entries(formats).map(([k, v]) => `${v} ${k}`).join(', ')}`);
  else if (mismatched.length) add('frames.format', 'warn', `extension does not match the header for ${some(mismatched.map((f) => `${f.name} (${f.format})`))}`);
  else if (['webp', 'avif'].includes(kinds[0])) add('frames.format', 'pass', kinds[0]);
  else add('frames.format', 'warn', `${kinds[0]} frames: use WebP at quality about 85 (documented example: 120 frames 6.4 MB as WebP, 14 MB as JPEG)`);

  r.findings = findings;
  r.result = worst(findings);
  r.ok = r.result !== 'fail';
  return r;
}

export function formatFrames(r) {
  const lines = [`3d frames ${r.dir} (budget: <= ${fmtInt(r.budget.max_frames)} frames, <= ${fmtBytes(r.budget.max_bytes)}, <= about ${r.budget.max_width} px wide)`];
  if (r.bytes) {
    lines.push(`frames      ${fmtInt(r.frames)}${r.ignored ? ` (${r.ignored} non-image file(s) ignored)` : ''}; ${Object.entries(r.formats).map(([k, v]) => `${v} ${k}`).join(', ')}; ${r.dimensions.map((d) => `${d.size} x${d.frames}`).join(', ') || 'no readable size'}`);
    lines.push(`bytes       total ${fmtBytes(r.bytes.total)}, mean ${fmtBytes(r.bytes.mean)}, median ${fmtBytes(r.bytes.median)}, min ${fmtBytes(r.bytes.min)}, max ${fmtBytes(r.bytes.max)} (${r.bytes.largest})`);
    lines.push(`sequence    ${r.sequence.pattern ?? 'unnumbered'}${r.sequence.pattern ? ` ${r.sequence.start}..${r.sequence.end}` : ''}`);
  }
  for (const f of r.findings) lines.push(`  ${f.level.toUpperCase().padEnd(4)} ${f.id.padEnd(18)} ${f.detail}`);
  const n = (lv) => r.findings.filter((f) => f.level === lv).length;
  lines.push(`result: ${r.result.toUpperCase()} (${n('fail')} fail, ${n('warn')} warn, ${n('pass')} pass)`);
  return lines.join('\n');
}
