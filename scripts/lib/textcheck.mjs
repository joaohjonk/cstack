// cstack image text: does a generated image show lettering or a logo? (field test F20: an unaided eye check caught 3
// of the 6 probes with made-up lettering). Two engines, neither installed by cstack:
//   tesseract  local OCR (brew install tesseract / apt install tesseract-ocr), read as TSV word boxes
//   judge      any agent CLI that can look at an image file (the same --judge command evals use), asked for JSON
// Exit status is the gate: an image with text or a logo fails, so a flow's stop rule can run it after each image.
// With expected lines (F76: on-pack type the territory declares, set as real type on a flat wrap), the check turns
// round: each expected line must be read as written, and only lettering nobody declared, or a line that is missing or
// garbled, fails. The brand's own mark is not a stray logo there.
// The OCR thresholds are researched defaults, not calibrated against the owner's verdicts yet.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { collectImages } from './sheet.mjs';

export const OCR_DEFAULTS = { min_conf: 50, min_chars: 2, glyph_words: 3 };

const which = (bin) => (process.env.PATH ?? '').split(path.delimiter).some((d) => d && fs.existsSync(path.join(d, bin)));

/** Words from tesseract TSV (level 5 rows). */
export function parseTSV(tsv) {
  const lines = String(tsv).trim().split('\n');
  const head = lines.shift()?.split('\t') ?? [];
  const col = (n) => head.indexOf(n);
  return lines
    .map((l) => l.split('\t'))
    .filter((c) => c[col('level')] === '5' && (c[col('text')] ?? '').trim())
    .map((c) => ({ text: c[col('text')].trim(), conf: Number(c[col('conf')]) }));
}

// Text if any word is read with confidence (a real word), or several glyph-like words appear at all (made-up lettering
// reads as low-confidence fragments). Single stray marks are noise.
export function judgeWords(words, t = OCR_DEFAULTS) {
  const alnum = (w) => (w.text.match(/[\p{L}\p{N}]/gu) ?? []).length;
  const confident = words.filter((w) => w.conf >= t.min_conf && alnum(w) >= t.min_chars);
  const glyphs = words.filter((w) => alnum(w) >= t.min_chars);
  const text = confident.length > 0 || glyphs.length >= t.glyph_words;
  return { text, confident: confident.map((w) => w.text), glyphs: glyphs.length };
}

const norm = (x) => String(x).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const tokens = (x) => norm(x).split(' ').filter(Boolean);

// One edit (substitution, insertion, deletion) per token of five or more characters is OCR noise, not a misspelling the
// eye would catch; shorter tokens (prices, drop numbers) must match exactly.
function close(a, b) {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i);
}

/** Lines to expect from --expect values and --expect-file files (one line each; blank lines and # comments skipped). */
export function readExpected({ expect = [], files = [] } = {}) {
  const out = [...[].concat(expect)].map(String);
  for (const f of [].concat(files)) {
    if (!fs.existsSync(f)) throw new Error(`--expect-file not found: ${f}`);
    out.push(...fs.readFileSync(f, 'utf8').split('\n'));
  }
  return out.map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

// Expected mode over OCR words: every token of every expected line must be read (in any order: OCR reads a can's
// curved type in pieces); confident words that belong to no expected line are stray lettering.
export function judgeExpected(words, expected, t = OCR_DEFAULTS) {
  const read = words.map((w) => ({ ...w, tok: tokens(w.text) })).filter((w) => w.tok.length);
  const pool = read.flatMap((w) => w.tok.map((tok) => ({ tok, conf: w.conf })));
  const used = new Set();
  const missing = [];
  for (const line of expected) {
    const want = tokens(line);
    const hit = want.map((tok) => pool.findIndex((p, i) => !used.has(i) && close(p.tok, tok)));
    if (hit.some((i) => i < 0)) missing.push(line);
    else hit.forEach((i) => used.add(i));
  }
  const alnum = (x) => (x.match(/[\p{L}\p{N}]/gu) ?? []).length;
  const stray = pool.filter((p, i) => !used.has(i) && p.conf >= t.min_conf && alnum(p.tok) >= t.min_chars).map((p) => p.tok);
  return { ok: !missing.length && !stray.length, missing, stray };
}

function ocr(file, t, expected) {
  const r = spawnSync('tesseract', [file, 'stdout', '--psm', '11', 'tsv'], { encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  if (r.error || r.status !== 0) return { result: 'error', evidence: `tesseract ${r.error?.message ?? `exit ${r.status}`}: ${(r.stderr ?? '').trim().slice(0, 200)}` };
  const words = parseTSV(r.stdout);
  if (expected?.length) {
    const e = judgeExpected(words, expected, t);
    return { result: e.ok ? 'pass' : 'fail', text: true, logo: null, missing: e.missing, stray: e.stray, evidence: e.ok ? `all ${expected.length} expected line(s) read, nothing else` : [e.missing.length ? `missing or garbled: ${e.missing.map((m) => `"${m}"`).join(', ')}` : '', e.stray.length ? `lettering nobody declared: "${e.stray.slice(0, 6).join(' ')}"` : ''].filter(Boolean).join('; ') };
  }
  const j = judgeWords(words, t);
  return { result: j.text ? 'fail' : 'pass', text: j.text, logo: null, evidence: j.text ? `${j.confident.length ? `read "${j.confident.slice(0, 5).join(' ')}"` : `${j.glyphs} glyph-like fragments`}` : `${words.length} OCR fragment(s), none text-like` };
}

export function judgePrompt(file, expected = []) {
  if (expected.length)
    return [
      `Look at the image file ${file}. Answer only about what is visibly in the picture.`,
      'The picture is meant to show exactly this lettering, as designed (one line each):',
      ...expected.map((l) => `- ${l}`),
      'For each line, say whether it appears spelled exactly as written (letters, numbers, symbols). Then say whether any other lettering, numbers, made-up or garbled text, or a logo that is not one of these lines appears.',
      'Reply with one JSON object and nothing else: {"text": true|false, "expected": [{"line": "...", "found": true|false}], "unexpected": "short description, or empty when none", "confidence": "low"|"medium"|"high"}',
    ].join('\n');
  return [
    `Look at the image file ${file}. Answer only about what is visibly in the picture.`,
    'Does it contain any lettering, words, numbers, made-up or garbled text, signage, labels, logos, brand marks or watermarks? Count text even if it is unreadable or decorative.',
    'Reply with one JSON object and nothing else: {"text": true|false, "logo": true|false, "where": "short description or empty", "confidence": "low"|"medium"|"high"}',
  ].join('\n');
}

export function parseJudge(out) {
  const s = String(out ?? '');
  for (let end = s.lastIndexOf('}'); end !== -1; end = s.lastIndexOf('}', end - 1))
    for (let start = s.lastIndexOf('{', end); start !== -1; start = s.lastIndexOf('{', start - 1)) {
      try {
        const v = JSON.parse(s.slice(start, end + 1));
        if (typeof v?.text === 'boolean') return v;
      } catch {
        /* keep looking */
      }
    }
  return null;
}

function judge(file, argv, expected) {
  const r = spawnSync(argv[0], argv.slice(1), { input: judgePrompt(file, expected), encoding: 'utf8', cwd: path.dirname(file), timeout: 300000, maxBuffer: 16 * 1024 * 1024 });
  if (r.error || r.status !== 0) return { result: 'error', evidence: `judge ${r.error?.message ?? `exit ${r.status}`}: ${(r.stderr ?? '').trim().slice(0, 200)}` };
  const v = parseJudge(r.stdout);
  if (!v) return { result: 'error', evidence: 'the judge reply had no {"text": ...} verdict' };
  if (expected?.length) {
    const found = new Map((Array.isArray(v.expected) ? v.expected : []).map((x) => [norm(x?.line), x?.found === true]));
    const missing = expected.filter((l) => !found.get(norm(l)));
    const stray = String(v.unexpected ?? '').trim();
    const ok = !missing.length && !stray;
    return { result: ok ? 'pass' : 'fail', text: v.text, logo: null, missing, stray: stray ? [stray] : [], evidence: `${ok ? `all ${expected.length} expected line(s) seen, nothing else` : [missing.length ? `missing or garbled: ${missing.map((m) => `"${m}"`).join(', ')}` : '', stray ? `lettering nobody declared: ${stray}` : ''].filter(Boolean).join('; ')} (judge confidence ${v.confidence ?? 'unstated'})` };
  }
  const flagged = v.text || v.logo === true;
  return { result: flagged ? 'fail' : 'pass', text: v.text, logo: v.logo ?? null, evidence: `${flagged ? v.where || 'text or logo seen' : 'none seen'} (judge confidence ${v.confidence ?? 'unstated'})` };
}

/**
 * checkText(inputs, {engine: 'auto'|'tesseract'|'judge', judge: argv, thresholds, expected: [lines]})
 * -> {engine, mode: 'none'|'expected', images: [{file, result: pass|fail|error, text, logo, evidence, missing?, stray?}], ok}
 * auto: tesseract when it is on PATH, else the judge when given; neither is an error, never a silent pass.
 */
export function checkText(inputs, { engine = 'auto', judge: judgeArgv = null, thresholds = OCR_DEFAULTS, expected = [] } = {}) {
  const files = collectImages(inputs);
  let use = engine;
  if (use === 'auto') use = which('tesseract') ? 'tesseract' : judgeArgv ? 'judge' : null;
  if (!use) throw new Error('MISSING: no text check available here. Install tesseract (brew install tesseract) or pass --judge "<agent command that can read an image>"; an eye check alone caught 3 of 6 in the field test');
  if (use === 'tesseract' && !which('tesseract')) throw new Error('MISSING: tesseract is not on PATH (brew install tesseract, or apt install tesseract-ocr); cstack never installs it');
  if (use === 'judge' && !judgeArgv) throw new Error('--engine judge needs --judge "<command>"');
  if (!['tesseract', 'judge'].includes(use)) throw new Error(`--engine must be auto, tesseract or judge`);
  const images = files.map((file) => ({ file, engine: use, ...(use === 'tesseract' ? ocr(file, thresholds, expected) : judge(file, judgeArgv, expected)) }));
  return { engine: use, mode: expected.length ? 'expected' : 'none', ...(expected.length ? { expected } : {}), thresholds: use === 'tesseract' ? { ...thresholds, calibrated: false } : null, images, ok: images.every((i) => i.result === 'pass') };
}
