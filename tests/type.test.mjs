// cstack type: scale math, DTCG tokens, font parsing (TTF/WOFF/WOFF2/TTC/OTF), language coverage and the pure QA
// evaluator. No browser and no network; font tests skip with a reason when no system font is installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { typeScale, fluidScale, scaleTokens, scaleCss, parseSteps, parseRatio, lineHeightFor, trackingFor } from '../scripts/lib/type/scale.mjs';
import { readFont, fontInfo, languageCoverage, requiredChars, decodeFsType, hasCode, woff2Tag, LANGUAGES } from '../scripts/lib/type/font.mjs';
import { evaluateTypography, parseScaleCss } from '../scripts/lib/type/qa.mjs';
import { parseTypeArgs } from '../scripts/lib/type/cli.mjs';
import { checkTokens, buildCSS } from '../scripts/lib/tokens.mjs';
import { tmpDir } from './tmp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'bin', 'cstack.mjs');
const tmp = () => tmpDir('cstack-type-');
const SYSTEM_FONT = ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf'].find((f) => fs.existsSync(f));
const noFont = SYSTEM_FONT ? false : 'no DejaVu Sans or Liberation Sans TTF under /usr/share/fonts';

// ---------- scale ----------
test('scale: modular sizes, rem, falling line-height, tracking signs, measure only for body sizes', () => {
  const s = typeScale({ base: 16, ratio: 1.25, steps: '-2..6' });
  assert.deepEqual(s.steps.map((x) => x.step), [-2, -1, 0, 1, 2, 3, 4, 5, 6]);
  const at = (n) => s.steps.find((x) => x.step === n);
  assert.deepEqual([at(-2).px, at(-1).px, at(0).px, at(1).px, at(2).px, at(6).px], [10.24, 12.8, 16, 20, 25, 61.04]);
  assert.equal(at(0).rem, 1);
  assert.equal(at(6).rem, 3.8147);
  assert.equal(at(0).line_height, 1.5);
  for (let i = 1; i < s.steps.length; i++) assert.ok(s.steps[i].line_height <= s.steps[i - 1].line_height, 'line-height falls as size rises');
  assert.ok(at(6).line_height >= 1.1 && at(6).line_height <= 1.12);
  assert.equal(lineHeightFor(64, 16), 1.1);
  assert.ok(at(-2).tracking_em > 0 && at(0).tracking_em === 0 && at(6).tracking_em < 0);
  assert.equal(trackingFor(16), 0);
  assert.ok(at(-2).caps_tracking_em >= at(6).caps_tracking_em && at(6).caps_tracking_em >= 0.05 && at(-2).caps_tracking_em <= 0.1);
  assert.deepEqual(s.steps.filter((x) => x.measure).map((x) => x.step), [0, 1]);
  assert.deepEqual([at(0).measure.min, at(0).measure.ideal, at(0).measure.max, at(0).measure.status], [45, 66, 75, 'default, not a law']);
  assert.equal(typeScale({ ratio: 'perfect-fourth' }).ratio, 1.333);
});

test('scale: fluid clamp() follows the utopia formula and hits both endpoints', () => {
  const f = fluidScale({ minVw: 360, maxVw: 1440, minBase: 16, maxBase: 20, minRatio: 1.2, maxRatio: 1.333, steps: '-2..6' });
  const s0 = f.steps.find((x) => x.step === 0);
  assert.equal(s0.clamp, 'clamp(1rem, 0.9167rem + 0.3704vw, 1.25rem)');
  assert.equal(f.steps.find((x) => x.step === 1).clamp, 'clamp(1.2rem, 1.0446rem + 0.6907vw, 1.6663rem)');
  for (const s of f.steps) {
    const at = (vw) => s.preferred.rem * 16 + (s.preferred.vw * vw) / 100;
    assert.ok(Math.abs(at(360) - s.min.px) < 0.02, `step ${s.step} at 360px: ${at(360)} vs ${s.min.px}`);
    assert.ok(Math.abs(at(1440) - s.max.px) < 0.03, `step ${s.step} at 1440px: ${at(1440)} vs ${s.max.px}`);
    const [lo, hi] = s.clamp.match(/clamp\(([\d.]+)rem, .*, ([\d.]+)rem\)/).slice(1).map(Number);
    assert.ok(lo <= hi, `clamp min <= max for step ${s.step}`);
  }
  const shrink = fluidScale({ minBase: 18, maxBase: 18, minRatio: 1.1, maxRatio: 1.5, steps: '-2..0' }).steps[0];
  assert.ok(shrink.max.px < shrink.min.px);
  assert.match(shrink.clamp, new RegExp(`^clamp\\(${shrink.max.rem}rem, .*, ${shrink.min.rem}rem\\)$`));
  assert.throws(() => fluidScale({ minVw: 1440, maxVw: 360 }), /must be larger/);
});

test('scale: fluid steps warn when zoom may fail (largest size over 2.5x the smallest, or no rem term)', () => {
  assert.deepEqual(fluidScale({}).warnings, []);
  const wide = fluidScale({ minBase: 16, maxBase: 24, minRatio: 1.2, maxRatio: 1.5, steps: '0..6' });
  assert.ok(wide.warnings.some((w) => /^step 6: largest size is \d+\.\d+x the smallest/.test(w)), wide.warnings.join('\n'));
  assert.ok(!wide.warnings.some((w) => /^step 0:/.test(w)));
  const vwOnly = fluidScale({ minVw: 400, maxVw: 1200, minBase: 8, maxBase: 24, minRatio: 1.2, maxRatio: 1.2, steps: '0..0' });
  assert.match(vwOnly.warnings.join('\n'), /no positive rem term/);
});

test('scale: steps and ratio parsing reject bad input', () => {
  assert.deepEqual(parseSteps('2..-1'), [-1, 0, 1, 2]);
  assert.deepEqual(parseSteps('0,2,1,2'), [0, 1, 2]);
  assert.throws(() => parseSteps('a..b'), /bad --steps/);
  assert.throws(() => parseRatio('0.9'), /bad --ratio/);
  assert.throws(() => typeScale({ base: -1 }), /bad --base/);
  assert.equal(parseRatio('golden'), 1.618);
});

test('scale: --tokens fragment passes the DTCG token checker and builds to CSS (modular and fluid)', () => {
  for (const scale of [typeScale({}), fluidScale({})]) {
    const ws = tmp();
    fs.mkdirSync(path.join(ws, 'brand', 'tokens'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'brand', 'tokens', 'type.tokens.json'), JSON.stringify(scaleTokens(scale), null, 2));
    const r = checkTokens(ws);
    assert.equal(r.ok, true, r.problems.join('; '));
    assert.equal(r.count, scale.kind === 'fluid' ? 27 : 18);
    const css = fs.readFileSync(buildCSS(ws).file, 'utf8');
    if (scale.kind === 'fluid') assert.match(css, /--font-size-step-0-max: 1\.25rem;/);
    else {
      assert.match(css, /--font-size-step-0: 1rem;/);
      assert.match(css, /--font-size-step--2: 0\.64rem;/);
    }
    assert.match(css, /--font-lineHeight-step-0: 1\.5;/);
  }
  const t = scaleTokens(typeScale({}));
  assert.deepEqual(t.font.size['step-1'].$value, { value: 1.25, unit: 'rem' });
  assert.equal(t.font.size['step-1'].$type, 'dimension');
  assert.deepEqual(t.font.lineHeight['step-0'], { $type: 'number', $value: 1.5 });
  assert.match(scaleCss(fluidScale({})), /--font-size-step-0: clamp\(1rem, 0\.9167rem \+ 0\.3704vw, 1\.25rem\);/);
});

// ---------- font containers ----------
const b128 = (n) => {
  const out = [n & 0x7f];
  for (n = Math.floor(n / 128); n > 0; n = Math.floor(n / 128)) out.unshift((n & 0x7f) | 0x80);
  return Buffer.from(out);
};
const pad4 = (b) => Buffer.concat([b, Buffer.alloc(((b.length + 3) & ~3) - b.length)]);

function buildSfnt(tables) {
  const tags = Object.keys(tables).sort();
  const head = Buffer.alloc(12 + 16 * tags.length);
  head.writeUInt32BE(0x00010000, 0);
  head.writeUInt16BE(tags.length, 4);
  let off = head.length;
  const body = tags.map((tag, i) => {
    const o = 12 + i * 16;
    head.write(tag, o, 'latin1');
    head.writeUInt32BE(off, o + 8);
    head.writeUInt32BE(tables[tag].length, o + 12);
    const p = pad4(tables[tag]);
    off += p.length;
    return p;
  });
  return Buffer.concat([head, ...body]);
}

function buildWoff(tables) {
  const tags = Object.keys(tables).sort();
  const head = Buffer.alloc(44 + 20 * tags.length);
  head.write('wOFF', 0, 'latin1');
  head.writeUInt32BE(0x00010000, 4);
  head.writeUInt16BE(tags.length, 12);
  let off = head.length;
  let sfnt = 12 + 16 * tags.length;
  const body = tags.map((tag, i) => {
    const orig = tables[tag];
    const z = zlib.deflateSync(orig);
    const data = z.length < orig.length ? z : orig;
    const o = 44 + i * 20;
    head.write(tag, o, 'latin1');
    head.writeUInt32BE(off, o + 4);
    head.writeUInt32BE(data.length, o + 8);
    head.writeUInt32BE(orig.length, o + 12);
    const p = pad4(data);
    off += p.length;
    sfnt += (orig.length + 3) & ~3;
    return p;
  });
  head.writeUInt32BE(off, 8);
  head.writeUInt32BE(sfnt, 16);
  head.writeUInt16BE(1, 20);
  return Buffer.concat([head, ...body]);
}

// WOFF2 with null transforms (glyf/loca version 3); transformGlyf writes the default glyf/loca transform flag with
// placeholder bytes, which the reader must skip without decoding.
function buildWoff2(tables, { transformGlyf = false } = {}) {
  const known = new Map(Array.from({ length: 63 }, (_, i) => [woff2Tag(i), i]));
  const tags = Object.keys(tables).sort();
  const dir = [];
  const stream = [];
  for (const tag of tags) {
    const gl = tag === 'glyf' || tag === 'loca';
    const idx = known.get(tag) ?? 63;
    const transformed = transformGlyf && gl;
    const data = transformed ? (tag === 'glyf' ? Buffer.from('placeholder for a transformed glyf stream') : Buffer.alloc(0)) : tables[tag];
    dir.push(Buffer.from([((gl ? (transformed ? 0 : 3) : 0) << 6) | idx]));
    if (idx === 63) dir.push(Buffer.from(tag, 'latin1'));
    dir.push(b128(tables[tag].length));
    if (transformed) dir.push(b128(data.length));
    stream.push(data);
  }
  const comp = zlib.brotliCompressSync(Buffer.concat(stream), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } });
  const head = Buffer.alloc(48);
  const directory = Buffer.concat(dir);
  head.write('wOF2', 0, 'latin1');
  head.writeUInt32BE(0x00010000, 4);
  head.writeUInt32BE(pad4(Buffer.concat([head, directory, comp])).length, 8);
  head.writeUInt16BE(tags.length, 12);
  head.writeUInt32BE(12 + 16 * tags.length + tags.reduce((s, t) => s + ((tables[t].length + 3) & ~3), 0), 16);
  head.writeUInt32BE(comp.length, 20);
  head.writeUInt16BE(1, 24);
  return pad4(Buffer.concat([head, directory, comp]));
}

function fvarTable() {
  const b = Buffer.alloc(16 + 2 * 20 + 2 * 12);
  const fx = (v) => Math.round(v * 65536);
  [1, 0, 16, 2, 2, 20, 2, 12].forEach((v, i) => b.writeUInt16BE(v, i * 2));
  const axis = (i, tag, min, def, max) => {
    const o = 16 + i * 20;
    b.write(tag, o, 'latin1');
    [min, def, max].forEach((v, k) => b.writeInt32BE(fx(v), o + 4 + k * 4));
    b.writeUInt16BE(999, o + 18); // no such name record: the reader falls back to the registered axis name
  };
  axis(0, 'wght', 100, 400, 900);
  axis(1, 'opsz', 8, 14, 72.5);
  const inst = (i, nameId, coords) => {
    const o = 56 + i * 12;
    b.writeUInt16BE(nameId, o);
    coords.forEach((c, k) => b.writeInt32BE(fx(c), o + 4 + k * 4));
  };
  inst(0, 2, [400, 14]);
  inst(1, 999, [700, 14]);
  return b;
}

const comparable = (i) => ({ names: i.names, metrics: i.metrics, features: i.features, coverage: i.coverage, languages: i.languages, embedding: i.embedding, weight: i.weight });

test('font: system TTF names, metrics, fsType, features and coverage', { skip: noFont }, () => {
  const info = fontInfo(fs.readFileSync(SYSTEM_FONT), { file: path.basename(SYSTEM_FONT) });
  assert.equal(info.format, 'ttf');
  assert.equal(info.outlines, 'TrueType');
  assert.match(info.names.family, /^(DejaVu Sans|Liberation Sans)$/);
  assert.ok(info.names.version && info.names.manufacturer);
  assert.equal(info.metrics.units_per_em, 2048);
  assert.ok(info.metrics.x_height_ratio > 0.45 && info.metrics.x_height_ratio < 0.6, `x-height ratio ${info.metrics.x_height_ratio}`);
  assert.ok(info.metrics.cap_height_ratio > 0.65 && info.metrics.cap_height_ratio < 0.75);
  assert.equal(info.weight.class, 400);
  assert.deepEqual(info.embedding.permissions, ['installable']);
  assert.ok(info.coverage.glyphs > 2000 && info.coverage.codepoints > 2000);
  assert.ok(info.features.gpos.includes('kern'));
  assert.ok(info.features.missing.figures?.includes('tnum'));
  assert.equal(info.variable, false);
  assert.match(info.license_note, /technical flags.*not the licence.*EULA/);
  assert.equal(info.errors.length, 0);
});

test('font: WOFF (zlib) and WOFF2 (brotli, null transform) built from the TTF read the same as the TTF', { skip: noFont }, () => {
  const ttf = fs.readFileSync(SYSTEM_FONT);
  const { tables } = readFont(ttf);
  const want = comparable(fontInfo(ttf));
  const woff = fontInfo(buildWoff(tables));
  assert.equal(woff.format, 'woff');
  assert.deepEqual(comparable(woff), want);
  const woff2 = fontInfo(buildWoff2(tables));
  assert.equal(woff2.format, 'woff2');
  assert.deepEqual(woff2.skipped_tables, []);
  assert.deepEqual(comparable(woff2), want);
  const tr = fontInfo(buildWoff2(tables, { transformGlyf: true }));
  assert.deepEqual(tr.skipped_tables, ['glyf', 'loca']);
  assert.deepEqual(tr.names, want.names);
  assert.deepEqual(tr.coverage, want.coverage);
  assert.ok(tr.notes.some((n) => /transformed tables not decoded .*: glyf, loca/.test(n)));
  assert.equal(fontInfo(buildSfnt(tables)).names.family, want.names.family);
});

test('font: fvar axes and named instances', { skip: noFont }, () => {
  const { tables } = readFont(fs.readFileSync(SYSTEM_FONT));
  const info = fontInfo(buildSfnt({ ...tables, fvar: fvarTable() }));
  assert.equal(info.variable, true);
  assert.deepEqual(info.axes.map(({ tag, name, min, default: d, max }) => [tag, name, min, d, max]), [['wght', 'Weight', 100, 400, 900], ['opsz', 'Optical size', 8, 14, 72.5]]);
  assert.equal(info.instances[0].name, info.names.subfamily);
  assert.deepEqual(info.instances[1], { name: null, coordinates: { wght: 700, opsz: 14 } });
  assert.ok(info.notes.some((n) => n.startsWith('variable:')));
});

test('font: language coverage for pt and vi on a system font and on a Latin-1-only cmap', { skip: noFont }, () => {
  const info = fontInfo(fs.readFileSync(SYSTEM_FONT), { languages: ['pt', 'vi'] });
  assert.deepEqual(info.languages.map((l) => l.code), ['pt', 'vi']);
  assert.equal(info.languages[0].supported, true);
  assert.equal(info.languages[1].required, 186);
  assert.ok(Array.isArray(info.languages[1].missing));
  const latin1 = [[0x20, 0x7e], [0xa0, 0xff]];
  const [pt, vi] = languageCoverage(latin1, ['pt', 'vi']);
  assert.equal(pt.supported, true);
  assert.equal(vi.supported, false);
  for (const c of ['ạ', 'ư', 'đ', 'Ỹ', 'ă']) assert.ok(vi.missing.includes(c), `vi should miss ${c}`);
  assert.ok(!vi.missing.includes('à'));
  assert.ok(requiredChars('tr').includes('İ') && requiredChars('tr').includes('ı'));
  assert.ok(requiredChars('es').includes('¿') && requiredChars('de').includes('„'));
  assert.ok(!requiredChars('de').includes('SS'));
  assert.equal(Object.keys(LANGUAGES).length, 27);
  assert.equal(hasCode(latin1, 0xe3), true);
  assert.equal(hasCode(latin1, 0x1ea1), false);
});

test('font: fsType words, TTC and CFF when installed, and non-fonts', () => {
  assert.deepEqual(decodeFsType(0), { fsType: '0x0000', permissions: ['installable'], flags: [] });
  assert.deepEqual(decodeFsType(0x0004).permissions, ['preview-and-print']);
  assert.deepEqual(decodeFsType(0x0308), { fsType: '0x0308', permissions: ['editable'], flags: ['no-subsetting', 'bitmap-embedding-only'] });
  assert.deepEqual(decodeFsType(0x0002).permissions, ['restricted-license']);
  assert.throws(() => readFont(Buffer.from('<!doctype html><html></html>')), /not a font/);
  const ttc = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc';
  if (fs.existsSync(ttc)) {
    const i = fontInfo(fs.readFileSync(ttc));
    assert.equal(i.format, 'ttc');
    assert.ok(i.fonts_in_file >= 2);
    assert.match(i.names.family, /WenQuanYi/);
  }
  const otf = '/usr/share/fonts/opentype/tlwg/Loma.otf';
  if (fs.existsSync(otf)) {
    const i = fontInfo(fs.readFileSync(otf));
    assert.equal(i.outlines, 'CFF');
    assert.equal(i.names.family, 'Loma');
  }
});

// ---------- pure QA evaluation ----------
const run = (o = {}) => ({ family: 'serif', size: 16, weight: 400, style: 'normal', fg: [26, 26, 26, 1], bg: [255, 255, 255], bg_skip: null, caps_run: null, letter_spacing_em: 0, disabled: false, sample: 'text', ...o });
const block = (o = {}) => ({ tag: 'p', path: `p#${o.id ?? 'x'}`, sample: 'text', family: 'serif', size: 16, weight: 400, line_height: 1.5, line_height_source: 'css', letter_spacing_em: 0, transform: 'none', align: 'start', hyphens: 'manual', has_br: false, lines: 4, cpl: 66, cpl_max: 70, last_words: 3, last_word: 'end', runs: [run()], ...o });
const stacks = {
  serif: { resolved: 'serif', kind: 'generic', skipped: [] },
  'sans-serif': { resolved: 'sans-serif', kind: 'generic', skipped: [] },
  monospace: { resolved: 'monospace', kind: 'generic', skipped: [] },
  cursive: { resolved: 'cursive', kind: 'generic', skipped: [] },
  '"Ghost", serif': { resolved: 'serif', kind: 'generic', skipped: [{ family: 'Ghost', kind: 'web', status: 'error' }] },
};
const snap = (breakpoint, blocks, extra = {}) => ({ breakpoint, viewport: { width: breakpoint, height: 900 }, lang: 'en', stacks, faces: [], words: 100, truncated: false, scale_px: null, blocks, ...extra });

test('qa evaluator: each rule fires on synthetic blocks and stays quiet on a clean one', () => {
  const blocks = [
    block({ id: 'clean' }),
    block({ id: 'long', cpl: 120 }),
    block({ id: 'longish', cpl: 90 }),
    block({ id: 'tight', line_height: 1.1 }),
    block({ id: 'h', tag: 'h1', size: 48, line_height: 1.6, lines: 2, last_words: 1, last_word: 'week', runs: [run({ size: 48 })] }),
    block({ id: 'caps', lines: 1, runs: [run({ caps_run: 'SHOP', letter_spacing_em: 0.01 })] }),
    block({ id: 'capsok', lines: 1, runs: [run({ caps_run: 'SHOP', letter_spacing_em: 0.08 })] }),
    block({ id: 'tiny', lines: 1, runs: [run({ size: 9 })] }),
    block({ id: 'fine', lines: 1, runs: [run({ size: 11 })] }),
    block({ id: 'faint', lines: 1, runs: [run({ fg: [170, 170, 170, 1] })] }),
    block({ id: 'bigfaint', tag: 'h2', size: 30, lines: 1, runs: [run({ size: 30, fg: [140, 140, 140, 1] })] }),
    block({ id: 'img', lines: 1, runs: [run({ bg: null, bg_skip: 'background-image', fg: [250, 250, 250, 1] })] }),
    block({ id: 'runt', lines: 5, last_words: 1, last_word: 'end.' }),
    block({ id: 'poem', lines: 5, has_br: true, cpl: 20, last_words: 1 }),
    block({ id: 'just', align: 'justify' }),
    block({ id: 'ghost', lines: 1, runs: [run({ family: '"Ghost", serif' })] }),
    block({ id: 'mono', lines: 1, runs: [run({ family: 'monospace' })] }),
    block({ id: 'cur', lines: 1, runs: [run({ family: 'cursive' })] }),
    block({ id: 'sans', lines: 1, runs: [run({ family: 'sans-serif', size: 17 })] }),
  ];
  const sizes = [18, 19, 20, 21, 22, 23].map((size, i) => block({ id: `s${i}`, lines: 1, runs: [run({ size })] }));
  const scale_px = [12, 16, 20, 25, 48].map((px) => ({ name: `--s-${px}`, px }));
  const r = evaluateTypography([snap(1440, [...blocks, ...sizes], { scale_px })], { families: ['serif', 'sans-serif'], maxFamilies: 3 });
  const has = (rule, id, level) => r.findings.some((f) => f.rule === rule && (id === null || f.path === `p#${id}`) && (!level || f.level === level));
  assert.ok(has('measure', 'long', 'fail'));
  assert.ok(has('measure', 'longish', 'warn'));
  assert.ok(has('leading', 'tight', 'warn'));
  assert.ok(has('leading', 'h', 'warn'));
  assert.ok(has('widow', 'h', 'warn'));
  assert.ok(has('widow', 'runt', 'warn'));
  assert.ok(!has('widow', 'poem') && !has('measure', 'poem'));
  assert.ok(has('caps-tracking', 'caps', 'warn') && !has('caps-tracking', 'capsok'));
  assert.ok(has('small-text', 'tiny', 'fail') && has('small-text', 'fine', 'warn'));
  assert.ok(has('contrast', 'faint', 'fail'));
  assert.ok(!has('contrast', 'bigfaint'), 'large text needs only 3:1');
  assert.ok(!has('contrast', 'img'), 'background images are skipped, not guessed');
  assert.ok(has('justify-hyphens', 'just', 'warn'));
  assert.ok(has('font-fallback', 'ghost', 'fail'));
  assert.ok(has('family-outside', 'mono', 'fail') && has('family-outside', 'cur', 'fail'));
  assert.ok(has('too-many-families', null, 'warn'));
  assert.ok(has('too-many-sizes', null, 'warn'));
  assert.ok(r.findings.some((f) => f.rule === 'off-scale' && f.value === 17));
  assert.ok(!r.findings.some((f) => f.rule === 'off-scale' && f.value === 16));
  assert.equal(r.findings.filter((f) => f.path === 'p#clean').length, 0);
  assert.equal(r.summary.ok, false);
  assert.equal(r.breakpoints[0].contrast_skipped, 1);
  assert.equal(r.findings[0].level, 'fail');
  const clean = evaluateTypography([snap(375, [block({ id: 'a' }), block({ id: 'b', tag: 'h2', size: 25, lines: 1, line_height: 1.2, runs: [run({ size: 25 })] })])]);
  assert.deepEqual(clean.findings, []);
  assert.equal(clean.summary.ok, true);
});

test('qa evaluator: findings merge across breakpoints and keep the worst level', () => {
  const r = evaluateTypography([snap(375, [block({ id: 'm', cpl: 50 })]), snap(768, [block({ id: 'm', cpl: 92 })]), snap(1440, [block({ id: 'm', cpl: 160 })])]);
  const m = r.findings.filter((f) => f.rule === 'measure');
  assert.equal(m.length, 1);
  assert.equal(m[0].level, 'fail');
  assert.deepEqual(m[0].breakpoints, [768, 1440]);
  assert.deepEqual(m[0].values, { 768: 92, 1440: 160 });
  assert.equal(r.breakpoints.length, 3);
});

test('qa: --scale-css picks font-size custom properties', () => {
  const css = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'type', 'scale.css'), 'utf8');
  const s = parseScaleCss(css);
  assert.ok(s.use.includes('--font-size-step-0') && s.use.includes('--font-size-step--2'));
  assert.ok(!s.use.some((n) => /lineHeight/.test(n)));
  assert.deepEqual(parseScaleCss(':root { --space-m: 24px; --step-0: clamp(1rem, 0.9rem + 0.4vw, 1.25rem); --brand: #fff; }').use, ['--step-0']);
});

// ---------- CLI ----------
test('cli: type args keep boolean flags from swallowing positionals', () => {
  assert.deepEqual(parseTypeArgs(['--json', 'a.ttf', '--languages', 'pt,vi', 'b.ttf', '--steps', '-2..6']), { _: ['a.ttf', 'b.ttf'], json: true, languages: 'pt,vi', steps: '-2..6' });
});

test('cli: type scale --tokens prints JSON; type font reports, and fails on a missing file', { skip: noFont }, () => {
  const tokens = JSON.parse(execFileSync(process.execPath, [CLI, 'type', 'scale', '--tokens', '--steps', '0..2'], { encoding: 'utf8' }));
  assert.deepEqual(Object.keys(tokens.font.size).filter((k) => !k.startsWith('$')), ['step-0', 'step-1', 'step-2']);
  const text = execFileSync(process.execPath, [CLI, 'type', 'font', SYSTEM_FONT, '--languages', 'pt,vi'], { encoding: 'utf8' });
  assert.match(text, /pt\s+Portuguese\s+supported/);
  assert.match(text, /not the licence/);
  const json = JSON.parse(execFileSync(process.execPath, [CLI, 'type', 'font', '--json', SYSTEM_FONT], { encoding: 'utf8' }));
  assert.equal(json.length, 1);
  assert.ok(json[0].names.family);
  assert.throws(() => execFileSync(process.execPath, [CLI, 'type', 'font', path.join(tmp(), 'missing.ttf')], { encoding: 'utf8', stdio: 'pipe' }), (e) => e.status === 1 && /file not found/.test(e.stdout));
  assert.throws(() => execFileSync(process.execPath, [CLI, 'type', 'font', SYSTEM_FONT, '--languages', 'xx'], { stdio: 'pipe' }), (e) => e.status === 1 && /unknown language "xx"/.test(String(e.stderr)));
});
