// cstack image text: does a generated image show lettering or a logo? (field test F20: an unaided eye check caught 3
// of the 6 probes with made-up lettering). Two engines, neither installed by cstack:
//   tesseract  local OCR (brew install tesseract / apt install tesseract-ocr), read as TSV word boxes
//   judge      any agent CLI that can look at an image file (the same --judge command evals use), asked for JSON
// Exit status is the gate: an image with text or a logo fails, so a flow's stop rule can run it after each image.
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

function ocr(file, t) {
  const r = spawnSync('tesseract', [file, 'stdout', '--psm', '11', 'tsv'], { encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  if (r.error || r.status !== 0) return { result: 'error', evidence: `tesseract ${r.error?.message ?? `exit ${r.status}`}: ${(r.stderr ?? '').trim().slice(0, 200)}` };
  const words = parseTSV(r.stdout);
  const j = judgeWords(words, t);
  return { result: j.text ? 'fail' : 'pass', text: j.text, logo: null, evidence: j.text ? `${j.confident.length ? `read "${j.confident.slice(0, 5).join(' ')}"` : `${j.glyphs} glyph-like fragments`}` : `${words.length} OCR fragment(s), none text-like` };
}

export function judgePrompt(file) {
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

function judge(file, argv) {
  const r = spawnSync(argv[0], argv.slice(1), { input: judgePrompt(file), encoding: 'utf8', cwd: path.dirname(file), timeout: 300000, maxBuffer: 16 * 1024 * 1024 });
  if (r.error || r.status !== 0) return { result: 'error', evidence: `judge ${r.error?.message ?? `exit ${r.status}`}: ${(r.stderr ?? '').trim().slice(0, 200)}` };
  const v = parseJudge(r.stdout);
  if (!v) return { result: 'error', evidence: 'the judge reply had no {"text": ...} verdict' };
  const flagged = v.text || v.logo === true;
  return { result: flagged ? 'fail' : 'pass', text: v.text, logo: v.logo ?? null, evidence: `${flagged ? v.where || 'text or logo seen' : 'none seen'} (judge confidence ${v.confidence ?? 'unstated'})` };
}

/**
 * checkText(inputs, {engine: 'auto'|'tesseract'|'judge', judge: argv, thresholds})
 * -> {engine, images: [{file, result: pass|fail|error, text, logo, evidence}], ok}
 * auto: tesseract when it is on PATH, else the judge when given; neither is an error, never a silent pass.
 */
export function checkText(inputs, { engine = 'auto', judge: judgeArgv = null, thresholds = OCR_DEFAULTS } = {}) {
  const files = collectImages(inputs);
  let use = engine;
  if (use === 'auto') use = which('tesseract') ? 'tesseract' : judgeArgv ? 'judge' : null;
  if (!use) throw new Error('MISSING: no text check available here. Install tesseract (brew install tesseract) or pass --judge "<agent command that can read an image>"; an eye check alone caught 3 of 6 in the field test');
  if (use === 'tesseract' && !which('tesseract')) throw new Error('MISSING: tesseract is not on PATH (brew install tesseract, or apt install tesseract-ocr); cstack never installs it');
  if (use === 'judge' && !judgeArgv) throw new Error('--engine judge needs --judge "<command>"');
  if (!['tesseract', 'judge'].includes(use)) throw new Error(`--engine must be auto, tesseract or judge`);
  const images = files.map((file) => ({ file, engine: use, ...(use === 'tesseract' ? ocr(file, thresholds) : judge(file, judgeArgv)) }));
  return { engine: use, thresholds: use === 'tesseract' ? { ...thresholds, calibrated: false } : null, images, ok: images.every((i) => i.result === 'pass') };
}
