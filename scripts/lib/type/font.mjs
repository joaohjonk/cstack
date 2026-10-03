// Minimal OpenType reader for type decisions: names, embedding flags, metrics, axes, layout features, coverage and
// per-language support. Reads TTF, OTF (CFF), TTC (first font), WOFF (zlib per table) and WOFF2 (one Brotli stream).
// No outlines are decoded. Pure: takes a Buffer, returns plain data.
import zlib from 'node:zlib';

export const LICENSE_NOTE =
  'fsType and the name-table licence fields are technical flags written into the file, not the licence. The foundry EULA governs web, app, broadcast and other use; read it before shipping.';

const SFNT = new Set(['\0\x01\0\0', 'OTTO', 'true', 'typ1']);
// WOFF2 known-table index (spec table 2), 4 chars each.
const WOFF2_TAGS = 'cmapheadhheahmtxmaxpnameOS/2postcvt fpgmglyflocaprepCFF VORGEBDTEBLCgasphdmxkernLTSHPCLTVDMXvheavmtxBASEGDEFGPOSGSUBEBSCJSTFMATHCBDTCBLCCOLRCPALSVG sbixacntavarbdatblocbslncvarfdscfeatfmtxfvargvarhstyjustlcarmortmorxopbdproptrakZapfSilfGlatGlocFeatSill';
export const woff2Tag = (i) => WOFF2_TAGS.slice(i * 4, i * 4 + 4);

const outlines = (flavor) => (flavor === 'OTTO' ? 'CFF' : 'TrueType');

function readSfnt(buf, base) {
  const flavor = buf.toString('latin1', base, base + 4);
  const n = buf.readUInt16BE(base + 4);
  const tables = {};
  for (let i = 0; i < n; i++) {
    const o = base + 12 + i * 16;
    const tag = buf.toString('latin1', o, o + 4);
    const off = buf.readUInt32BE(o + 8);
    const len = buf.readUInt32BE(o + 12);
    if (off + len > buf.length) throw new Error(`table ${tag} runs past the end of the file`);
    tables[tag] = buf.subarray(off, off + len);
  }
  return { outlines: outlines(flavor), tables, skipped: [] };
}

function readWoff(buf) {
  const n = buf.readUInt16BE(12);
  const tables = {};
  for (let i = 0; i < n; i++) {
    const o = 44 + i * 20;
    const tag = buf.toString('latin1', o, o + 4);
    const off = buf.readUInt32BE(o + 4);
    const comp = buf.readUInt32BE(o + 8);
    const orig = buf.readUInt32BE(o + 12);
    if (off + comp > buf.length || comp > orig) throw new Error(`WOFF table ${tag}: bad offset or length`);
    const raw = buf.subarray(off, off + comp);
    const data = comp < orig ? zlib.inflateSync(raw, { maxOutputLength: orig }) : raw;
    if (data.length !== orig) throw new Error(`WOFF table ${tag}: expected ${orig} bytes, got ${data.length}`);
    tables[tag] = data;
  }
  return { format: 'woff', fonts_in_file: 1, outlines: outlines(buf.toString('latin1', 4, 8)), tables, skipped: [] };
}

function base128(buf, p) {
  let v = 0;
  for (let i = 0; i < 5; i++) {
    const b = buf[p++];
    if (b === undefined) throw new Error('WOFF2: directory runs past the end of the file');
    if (i === 0 && b === 0x80) throw new Error('WOFF2: UIntBase128 with a leading zero');
    v = v * 128 + (b & 0x7f);
    if (v > 0xffffffff) throw new Error('WOFF2: UIntBase128 overflow');
    if (!(b & 0x80)) return [v, p];
  }
  throw new Error('WOFF2: UIntBase128 longer than 5 bytes');
}
function u255(buf, p) {
  const c = buf[p++];
  if (c === 253) return [buf.readUInt16BE(p), p + 2];
  if (c === 255) return [buf[p] + 253, p + 1];
  if (c === 254) return [buf[p] + 506, p + 1];
  return [c, p];
}

// WOFF2 stores every table in one Brotli stream, in directory order, unpadded. glyf/loca are usually "transformed"
// (a different packing that needs a rebuild to read) and hmtx may be too. This reader needs neither outlines nor
// advances, so transformed tables are skipped (listed in skipped_tables); null-transformed glyf/loca read as-is.
function readWoff2(buf) {
  const flavor = buf.toString('latin1', 4, 8);
  const n = buf.readUInt16BE(12);
  const compressed = buf.readUInt32BE(20);
  let p = 48;
  const entries = [];
  for (let i = 0; i < n; i++) {
    const flags = buf[p++];
    let tag;
    if ((flags & 0x3f) === 63) {
      tag = buf.toString('latin1', p, p + 4);
      p += 4;
    } else tag = woff2Tag(flags & 0x3f);
    const version = flags >> 6;
    let orig;
    [orig, p] = base128(buf, p);
    const transformed = tag === 'glyf' || tag === 'loca' ? version !== 3 : version !== 0;
    let length = orig;
    if (transformed) [length, p] = base128(buf, p);
    entries.push({ tag, length, transformed });
  }
  let pick = entries.map((_, i) => i);
  let fonts = 1;
  if (flavor === 'ttcf') {
    p += 4; // collection version
    [fonts, p] = u255(buf, p);
    for (let f = 0; f < fonts; f++) {
      let count;
      [count, p] = u255(buf, p);
      p += 4; // flavor of this font
      const idx = [];
      for (let k = 0; k < count; k++) {
        let t;
        [t, p] = u255(buf, p);
        idx.push(t);
      }
      if (f === 0) pick = idx;
    }
  }
  if (p + compressed > buf.length) throw new Error('WOFF2: compressed stream runs past the end of the file');
  const total = entries.reduce((s, e) => s + e.length, 0);
  const data = zlib.brotliDecompressSync(buf.subarray(p, p + compressed), { maxOutputLength: Math.max(total, 1) });
  if (data.length !== total) throw new Error(`WOFF2: stream holds ${data.length} bytes, directory expects ${total}`);
  let off = 0;
  for (const e of entries) {
    e.data = data.subarray(off, off + e.length);
    off += e.length;
  }
  const tables = {};
  const skipped = [];
  for (const i of pick) {
    const e = entries[i];
    if (!e) throw new Error(`WOFF2: collection references table #${i}, directory has ${entries.length}`);
    if (e.transformed) skipped.push(e.tag);
    else tables[e.tag] = e.data;
  }
  return { format: 'woff2', fonts_in_file: fonts, outlines: flavor === 'ttcf' ? (tables['CFF '] ? 'CFF' : 'TrueType') : outlines(flavor), tables, skipped };
}

/** Container -> {format, fonts_in_file, outlines, tables: {tag: Buffer}, skipped}. TTC and WOFF2 collections: first font. */
export function readFont(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) throw new Error('not a font: file too short');
  const sig = buf.toString('latin1', 0, 4);
  if (sig === 'wOFF') return readWoff(buf);
  if (sig === 'wOF2') return readWoff2(buf);
  if (sig === 'ttcf') return { format: 'ttc', fonts_in_file: buf.readUInt32BE(8), ...readSfnt(buf, buf.readUInt32BE(12)) };
  if (SFNT.has(sig)) return { format: sig === 'OTTO' ? 'otf' : 'ttf', fonts_in_file: 1, ...readSfnt(buf, 0) };
  throw new Error(`not a font: unknown signature ${JSON.stringify(sig)} (expected TrueType, OpenType, TTC, WOFF or WOFF2)`);
}

// ---------- tables ----------
const MAC_ROMAN = 'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ';
const macRoman = (b) => Array.from(b, (c) => (c < 128 ? String.fromCharCode(c) : MAC_ROMAN[c - 128])).join('');
const utf16be = (b) => Buffer.from(b.subarray(0, b.length & ~1)).swap16().toString('utf16le');
const clean = (s) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();

/** name table -> {nameID: string}; prefers Windows English, then any Windows, Unicode, Mac Roman. */
export function readNames(t) {
  const count = t.readUInt16BE(2);
  const strOff = t.readUInt16BE(4);
  const best = {};
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 12;
    const [pid, eid, lid, nid, len, off] = [0, 2, 4, 6, 8, 10].map((k) => t.readUInt16BE(o + k));
    const score = pid === 3 && [0, 1, 10].includes(eid) ? (lid === 0x409 ? 5 : 4) : pid === 0 ? 3 : pid === 1 && eid === 0 ? (lid === 0 ? 2 : 1) : 0;
    if (!score || (best[nid] && best[nid].score >= score) || strOff + off + len > t.length) continue;
    const raw = t.subarray(strOff + off, strOff + off + len);
    best[nid] = { score, s: clean(pid === 1 ? macRoman(raw) : utf16be(raw)) };
  }
  return Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.s]));
}

const NAME_IDS = { family: 1, subfamily: 2, typographic_family: 16, typographic_subfamily: 17, full_name: 4, postscript_name: 6, version: 5, designer: 9, manufacturer: 8, vendor_url: 11, designer_url: 12, license: 13, license_url: 14, copyright: 0, trademark: 7 };

function readOS2(t) {
  const o = { version: t.readUInt16BE(0), weight: t.readUInt16BE(4), width: t.readUInt16BE(6), fsType: t.readUInt16BE(8) };
  if (t.length >= 78) {
    Object.assign(o, {
      vendor: t.toString('latin1', 58, 62).replace(/\0/g, '').trim(),
      fsSelection: t.readUInt16BE(62),
      typo: { ascender: t.readInt16BE(68), descender: t.readInt16BE(70), line_gap: t.readInt16BE(72) },
      win: { ascent: t.readUInt16BE(74), descent: t.readUInt16BE(76) },
    });
  }
  if (o.version >= 2 && t.length >= 90) Object.assign(o, { xHeight: t.readInt16BE(86), capHeight: t.readInt16BE(88) });
  return o;
}

/** fsType bits as words (OpenType OS/2 spec). Bits 1-3 are usage permissions; 8-9 are restrictions. */
export function decodeFsType(fs) {
  const permissions = [];
  if ((fs & 0xe) === 0) permissions.push('installable');
  if (fs & 0x2) permissions.push('restricted-license');
  if (fs & 0x4) permissions.push('preview-and-print');
  if (fs & 0x8) permissions.push('editable');
  const flags = [];
  if (fs & 0x100) flags.push('no-subsetting');
  if (fs & 0x200) flags.push('bitmap-embedding-only');
  return { fsType: `0x${fs.toString(16).padStart(4, '0')}`, permissions, flags };
}

function cmap4(t, off, want) {
  const segX2 = t.readUInt16BE(off + 6);
  const endO = off + 14;
  const startO = endO + segX2 + 2;
  const deltaO = startO + segX2;
  const rangeO = deltaO + segX2;
  const ranges = [];
  let cur = null;
  for (let i = 0; i < segX2 / 2; i++) {
    const end = t.readUInt16BE(endO + 2 * i);
    const start = t.readUInt16BE(startO + 2 * i);
    const delta = t.readUInt16BE(deltaO + 2 * i);
    const ro = t.readUInt16BE(rangeO + 2 * i);
    for (let c = start; c <= end && c < 0xffff; c++) {
      let g;
      if (ro === 0) g = (c + delta) & 0xffff;
      else {
        const at = rangeO + 2 * i + ro + 2 * (c - start);
        g = at + 1 < t.length ? t.readUInt16BE(at) : 0;
        if (g) g = (g + delta) & 0xffff;
      }
      if (!g) continue;
      if (want.has(c)) want.set(c, g);
      if (cur && cur[1] === c - 1) cur[1] = c;
      else ranges.push((cur = [c, c]));
    }
  }
  return ranges;
}

function cmap12(t, off, want) {
  const n = t.readUInt32BE(off + 12);
  const groups = [];
  for (let i = 0; i < n; i++) {
    const o = off + 16 + i * 12;
    const s0 = t.readUInt32BE(o);
    const e = Math.min(t.readUInt32BE(o + 4), 0x10ffff);
    const g0 = t.readUInt32BE(o + 8);
    for (const cp of want.keys()) if (cp >= s0 && cp <= e && g0 + cp - s0) want.set(cp, g0 + cp - s0);
    const s = g0 === 0 ? s0 + 1 : s0; // first code of the group maps to .notdef
    if (s <= e) groups.push([s, e]);
  }
  groups.sort((a, b) => a[0] - b[0]);
  const ranges = [];
  for (const g of groups) {
    const last = ranges.at(-1);
    if (last && g[0] <= last[1] + 1) last[1] = Math.max(last[1], g[1]);
    else ranges.push([...g]);
  }
  return ranges;
}

/** cmap -> {ranges: [[from, to], ...] of mapped code points, format, symbol, glyphs: x/H glyph ids}. Prefers format 12, then 4. */
function readCmap(t) {
  const n = t.readUInt16BE(2);
  const subs = [];
  for (let i = 0; i < n; i++) {
    const o = 4 + i * 8;
    const s = { pid: t.readUInt16BE(o), eid: t.readUInt16BE(o + 2), off: t.readUInt32BE(o + 4) };
    s.format = s.off + 2 <= t.length ? t.readUInt16BE(s.off) : -1;
    subs.push(s);
  }
  const rank = (s) => (s.format === 12 && (s.pid === 0 || (s.pid === 3 && s.eid === 10)) ? 4 : s.format === 4 && (s.pid === 0 || (s.pid === 3 && s.eid === 1)) ? 3 : s.format === 4 && s.pid === 3 && s.eid === 0 ? 1 : 0);
  const best = subs.filter(rank).sort((a, b) => rank(b) - rank(a))[0];
  if (!best) throw new Error(`no Unicode cmap subtable in format 4 or 12 (found ${subs.map((s) => `${s.pid}/${s.eid} f${s.format}`).join(', ') || 'none'})`);
  const glyphs = new Map([[0x78, 0], [0x48, 0]]);
  return { ranges: best.format === 12 ? cmap12(t, best.off, glyphs) : cmap4(t, best.off, glyphs), format: best.format, symbol: rank(best) === 1, glyphs };
}

export function hasCode(ranges, cp) {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < ranges[mid][0]) hi = mid - 1;
    else if (cp > ranges[mid][1]) lo = mid + 1;
    else return true;
  }
  return false;
}
export const countCodes = (ranges, from = 0, to = 0x10ffff) => ranges.reduce((s, [a, b]) => s + Math.max(0, Math.min(b, to) - Math.max(a, from) + 1), 0);

/** yMax of a TrueType glyph's bounding box (glyf header), or null (CFF, transformed WOFF2 glyf, empty glyph). */
function glyphYMax(tables, gid) {
  const { head, loca, glyf } = tables;
  if (!gid || !head || !loca || !glyf) return null;
  const long = head.readInt16BE(50) === 1;
  const at = (i) => (long ? loca.readUInt32BE(i * 4) : loca.readUInt16BE(i * 2) * 2);
  const a = at(gid);
  return at(gid + 1) > a && a + 10 <= glyf.length ? glyf.readInt16BE(a + 8) : null;
}

const AXIS_NAMES = { wght: 'Weight', wdth: 'Width', opsz: 'Optical size', ital: 'Italic', slnt: 'Slant', GRAD: 'Grade' };
function readFvar(t, names) {
  const axesOff = t.readUInt16BE(4);
  const axisCount = t.readUInt16BE(8);
  const axisSize = t.readUInt16BE(10);
  const instCount = t.readUInt16BE(12);
  const instSize = t.readUInt16BE(14);
  const fixed = (o) => Math.round((t.readInt32BE(o) / 65536) * 1000) / 1000;
  const axes = [];
  for (let i = 0; i < axisCount; i++) {
    const o = axesOff + i * axisSize;
    const tag = t.toString('latin1', o, o + 4);
    axes.push({ tag, name: names[t.readUInt16BE(o + 18)] ?? AXIS_NAMES[tag] ?? tag, min: fixed(o + 4), default: fixed(o + 8), max: fixed(o + 12), hidden: !!(t.readUInt16BE(o + 16) & 1) });
  }
  const instances = [];
  const base = axesOff + axisCount * axisSize;
  for (let i = 0; i < instCount; i++) {
    const o = base + i * instSize;
    instances.push({ name: names[t.readUInt16BE(o)] ?? null, coordinates: Object.fromEntries(axes.map((a, k) => [a.tag, fixed(o + 4 + k * 4)])) });
  }
  return { axes, instances };
}

/** GSUB/GPOS -> {features: [tags], scripts: {script: [langsys tags]}}. */
function readLayout(t) {
  const scriptList = t.readUInt16BE(4);
  const featureList = t.readUInt16BE(6);
  const features = new Set();
  const fc = t.readUInt16BE(featureList);
  for (let i = 0; i < fc; i++) features.add(t.toString('latin1', featureList + 2 + i * 6, featureList + 6 + i * 6).trim());
  const scripts = {};
  const sc = t.readUInt16BE(scriptList);
  for (let i = 0; i < sc; i++) {
    const o = scriptList + 2 + i * 6;
    const so = scriptList + t.readUInt16BE(o + 4);
    const langs = [];
    for (let k = 0; k < t.readUInt16BE(so + 2); k++) langs.push(t.toString('latin1', so + 4 + k * 6, so + 8 + k * 6).trim());
    scripts[t.toString('latin1', o, o + 4).trim()] = langs;
  }
  return { features: [...features].sort(), scripts };
}

// ---------- features, coverage, languages ----------
export const FEATURE_GROUPS = [
  ['ligatures', /^(liga|clig|dlig|hlig|rlig)$/],
  ['contextual', /^(calt|rclt)$/],
  ['figures', /^(lnum|onum|tnum|pnum)$/],
  ['case', /^(case|cpsp)$/],
  ['small_caps', /^(smcp|c2sc|pcap|c2pc|unic)$/],
  ['fractions', /^(frac|afrc|numr|dnom)$/],
  ['zero', /^zero$/],
  ['super_sub', /^(sups|subs|sinf|ordn)$/],
  ['stylistic', /^(ss\d\d|cv\d\d|salt|swsh|cswh|titl|hist)$/],
  ['positioning', /^(kern|mark|mkmk|dist|curs)$/],
  ['localized', /^locl$/],
];
const EXPECTED = { ligatures: ['liga'], figures: ['lnum', 'onum', 'tnum', 'pnum'], case: ['case'], small_caps: ['smcp', 'c2sc'], fractions: ['frac'], zero: ['zero'], positioning: ['kern'] };

export function groupFeatures(tags) {
  const groups = Object.fromEntries(FEATURE_GROUPS.map(([g]) => [g, []]));
  groups.other = [];
  for (const t of [...new Set(tags)].sort()) groups[FEATURE_GROUPS.find(([, re]) => re.test(t))?.[0] ?? 'other'].push(t);
  const missing = Object.fromEntries(Object.entries(EXPECTED).map(([g, want]) => [g, want.filter((w) => !groups[g].includes(w))]).filter(([, m]) => m.length));
  return { groups, missing };
}

const BLOCKS = [
  ['Basic Latin', 0x20, 0x7e],
  ['Latin-1 Supplement', 0xa0, 0xff],
  ['Latin Extended-A', 0x100, 0x17f],
  ['Latin Extended-B', 0x180, 0x24f],
  ['Latin Extended Additional', 0x1e00, 0x1eff],
  ['Greek', 0x370, 0x3ff],
  ['Cyrillic', 0x400, 0x4ff],
  ['General Punctuation', 0x2000, 0x206f],
  ['Currency Symbols', 0x20a0, 0x20cf],
  ['Arrows', 0x2190, 0x21ff],
  ['CJK Unified Ideographs', 0x4e00, 0x9fff],
];

// Letters each language needs beyond a-z (CLDR main exemplars, lowercase; capitals are derived) plus the quotation
// or punctuation marks its text cannot do without. Coverage means precomposed characters in the cmap.
export const LANGUAGES = {
  pt: { name: 'Portuguese', letters: 'áàâãçéêíóôõú' },
  es: { name: 'Spanish', letters: 'áéíñóúü', marks: '¡¿' },
  fr: { name: 'French', letters: 'àâæçéèêëîïôœùûüÿ', marks: '«»' },
  de: { name: 'German', letters: 'äöüß', marks: '„“' },
  it: { name: 'Italian', letters: 'àèéìòóù', marks: '«»' },
  nl: { name: 'Dutch', letters: 'áäéëíïóöúü' },
  pl: { name: 'Polish', letters: 'ąćęłńóśźż', marks: '„”' },
  cs: { name: 'Czech', letters: 'áčďéěíňóřšťúůýž', marks: '„“' },
  tr: { name: 'Turkish', letters: 'çğıöşü', extra: 'İ' },
  ro: { name: 'Romanian', letters: 'ăâîșț', marks: '„”' },
  hu: { name: 'Hungarian', letters: 'áéíóöőúüű', marks: '„”' },
  sv: { name: 'Swedish', letters: 'åäöàé', marks: '”' },
  da: { name: 'Danish', letters: 'æøå' },
  no: { name: 'Norwegian', letters: 'æøåàéóòô', marks: '«»' },
  fi: { name: 'Finnish', letters: 'åäöšž', marks: '”' },
  is: { name: 'Icelandic', letters: 'áðéíóúýþæö', marks: '„“' },
  vi: { name: 'Vietnamese', letters: 'àảãáạăằẳẵắặâầẩẫấậđèẻẽéẹêềểễếệìỉĩíịòỏõóọôồổỗốộơờởỡớợùủũúụưừửữứựỳỷỹýỵ' },
  ca: { name: 'Catalan', letters: 'àçéèíïòóúü·', marks: '«»' },
  hr: { name: 'Croatian', letters: 'čćđšž', marks: '„“' },
  sk: { name: 'Slovak', letters: 'áäčďéíĺľňóôŕšťúýž', marks: '„“' },
  sl: { name: 'Slovenian', letters: 'čšž', marks: '„“' },
  lt: { name: 'Lithuanian', letters: 'ąčęėįšųūž', marks: '„“' },
  lv: { name: 'Latvian', letters: 'āčēģīķļņšūž' },
  et: { name: 'Estonian', letters: 'äõöüšž', marks: '„“' },
  el: { name: 'Greek', latin: false, letters: 'αβγδεζηθικλμνξοπρσςτυφχψωάέήίόύώϊϋΐΰ', marks: '«»' },
  ru: { name: 'Russian', latin: false, letters: 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя', marks: '«»' },
  uk: { name: 'Ukrainian', latin: false, letters: 'абвгґдеєжзиіїйклмнопрстуфхцчшщьюя', marks: '«»' },
};

export function requiredChars(code) {
  const L = LANGUAGES[code];
  if (!L) throw new Error(`unknown language "${code}" (known: ${Object.keys(LANGUAGES).join(', ')})`);
  const lower = [...((L.latin === false ? '' : 'abcdefghijklmnopqrstuvwxyz') + L.letters)];
  const out = new Set(lower);
  for (const c of lower) {
    const u = c.toUpperCase();
    if ([...u].length === 1) out.add(u); // ß, ΐ, ΰ have no single-code-point capital
  }
  for (const c of (L.marks ?? '') + (L.extra ?? '')) out.add(c);
  return [...out];
}

/** ranges from readCmap -> per-language {code, name, required, missing: [chars], supported}. */
export function languageCoverage(ranges, codes = Object.keys(LANGUAGES)) {
  return codes.map((code) => {
    const req = requiredChars(code);
    const missing = req.filter((c) => !hasCode(ranges, c.codePointAt(0)));
    return { code, name: LANGUAGES[code].name, required: req.length, missing, supported: missing.length === 0 };
  });
}

const WEIGHTS = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
const WIDTHS = [null, 'UltraCondensed', 'ExtraCondensed', 'Condensed', 'SemiCondensed', 'Medium', 'SemiExpanded', 'Expanded', 'ExtraExpanded', 'UltraExpanded'];
const r3 = (n) => Math.round(n * 1000) / 1000;

/** Everything `cstack type font` reports for one file. Table-level parse errors are collected, not thrown. */
export function fontInfo(buf, { file = null, languages = null } = {}) {
  const f = readFont(buf);
  const errors = [];
  const safe = (tag, fn) => {
    if (!f.tables[tag]) return null;
    try {
      return fn(f.tables[tag]);
    } catch (e) {
      errors.push(`${tag.trim()}: ${e.message}`);
      return null;
    }
  };
  const nameMap = safe('name', readNames) ?? {};
  const names = Object.fromEntries(Object.entries(NAME_IDS).map(([k, id]) => [k, nameMap[id] ?? null]));
  const head = safe('head', (t) => ({ upm: t.readUInt16BE(18), revision: r3(t.readInt32BE(4) / 65536) }));
  const os2 = safe('OS/2', readOS2);
  const hhea = safe('hhea', (t) => ({ ascender: t.readInt16BE(4), descender: t.readInt16BE(6), line_gap: t.readInt16BE(8) }));
  const glyphs = safe('maxp', (t) => t.readUInt16BE(4));
  const cmap = safe('cmap', readCmap);
  const fvar = safe('fvar', (t) => readFvar(t, nameMap));
  const gsub = safe('GSUB', readLayout);
  const gpos = safe('GPOS', readLayout);
  const upm = head?.upm ?? null;
  let xHeight = os2?.xHeight || null;
  let capHeight = os2?.capHeight || null;
  let heightSource = xHeight ? 'OS/2' : null;
  if ((!xHeight || !capHeight) && cmap) {
    const gx = safe('glyf', () => glyphYMax(f.tables, cmap.glyphs.get(0x78)));
    const gh = safe('glyf', () => glyphYMax(f.tables, cmap.glyphs.get(0x48)));
    if (!xHeight && gx) (xHeight = gx), (heightSource = 'glyf bounds of x and H');
    if (!capHeight && gh) (capHeight = gh), (heightSource ??= 'glyf bounds of x and H');
  }
  const ratio = (v) => (v != null && upm ? r3(v / upm) : null);
  const useTypo = !!(os2?.fsSelection & 0x80);
  const lineBasis = useTypo && os2?.typo ? { ...os2.typo, basis: 'typo (USE_TYPO_METRICS)' } : hhea ? { ...hhea, basis: 'hhea' } : null;
  const metrics = {
    units_per_em: upm,
    x_height: xHeight,
    cap_height: capHeight,
    x_height_ratio: ratio(xHeight),
    cap_height_ratio: ratio(capHeight),
    height_source: heightSource,
    hhea,
    typo: os2?.typo ?? null,
    win: os2?.win ?? null,
    use_typo_metrics: useTypo,
    normal_line_height: lineBasis && upm ? { value: r3((lineBasis.ascender - lineBasis.descender + lineBasis.line_gap) / upm), basis: lineBasis.basis } : null,
  };
  const tags = [...(gsub?.features ?? []), ...(gpos?.features ?? [])];
  const { groups, missing } = groupFeatures(tags);
  const legacyKern = !!f.tables.kern;
  if (legacyKern && missing.positioning) delete missing.positioning;
  const ranges = cmap?.ranges ?? [];
  const langCodes = languages ?? Object.keys(LANGUAGES);
  const notes = [];
  if (os2 && !os2.xHeight) {
    const why = os2.version < 2 ? `OS/2 version ${os2.version} has no x-height field` : 'OS/2 x-height is 0, unset';
    notes.push(xHeight ? `x-height and cap height measured from the x and H glyph bounds (${why})` : `${why}; x-height unknown`);
  }
  if (missing.figures?.includes('tnum')) notes.push('no tabular figures (tnum): numbers in tables, prices and counters will not line up');
  if (missing.small_caps?.includes('smcp')) notes.push('no true small caps (smcp): browsers synthesize or scale capitals; avoid font-variant: small-caps for brand text');
  if (missing.positioning) notes.push('no kerning (GPOS kern or kern table): pairs like "To" and "AV" will not be adjusted');
  if (fvar?.axes.length) notes.push('variable: drive registered axes with CSS properties (wght: font-weight, wdth: font-stretch, opsz: font-optical-sizing, slnt/ital: font-style); font-variation-settings only for custom axes');
  if (f.skipped.length) notes.push(`WOFF2 transformed tables not decoded (not needed here): ${f.skipped.map((t) => t.trim()).join(', ')}`);
  return {
    file,
    format: f.format,
    outlines: f.outlines,
    fonts_in_file: f.fonts_in_file,
    tables: Object.keys(f.tables).map((t) => t.trim()).sort(),
    skipped_tables: f.skipped.map((t) => t.trim()),
    names,
    revision: head?.revision ?? null,
    vendor_id: os2?.vendor || null,
    weight: os2 ? { class: os2.weight, name: WEIGHTS[Math.min(900, Math.max(100, Math.round(os2.weight / 100) * 100))] } : null,
    width: os2 ? { class: os2.width, name: WIDTHS[os2.width] ?? null } : null,
    embedding: os2 ? decodeFsType(os2.fsType) : null,
    metrics,
    variable: !!fvar?.axes.length,
    axes: fvar?.axes ?? [],
    instances: fvar?.instances ?? [],
    features: { gsub: gsub?.features ?? [], gpos: gpos?.features ?? [], legacy_kern_table: legacyKern, groups, missing, scripts: { ...(gsub?.scripts ?? {}), ...(gpos?.scripts ?? {}) } },
    coverage: { glyphs, codepoints: countCodes(ranges), cmap_format: cmap?.format ?? null, symbol: !!cmap?.symbol, blocks: BLOCKS.map(([name, a, b]) => ({ name, covered: countCodes(ranges, a, b), size: b - a + 1 })).filter((x) => x.covered || x.name.includes('Latin')) },
    languages: cmap ? languageCoverage(ranges, langCodes) : [],
    notes,
    license_note: LICENSE_NOTE,
    errors,
  };
}

// ---------- text report ----------
const q = (s, max = 160) => (s == null ? '-' : JSON.stringify(s.length > max ? `${s.slice(0, max - 1)}…` : s));

export function formatFont(info, { detail = false } = {}) {
  const n = info.names;
  const m = info.metrics;
  const ax = info.axes.length ? info.axes.map((a) => `${a.tag} ${a.min}..${a.default}..${a.max}${a.hidden ? ' (hidden)' : ''}`).join(', ') + (info.instances.length ? `; ${info.instances.length} named instances: ${info.instances.slice(0, 12).map((i) => i.name ?? '?').join(', ')}${info.instances.length > 12 ? ', …' : ''}` : '') : 'none (static)';
  const g = info.features.groups;
  const feat = Object.entries(g)
    .filter(([k, v]) => v.length || info.features.missing[k])
    .map(([k, v]) => `${k}: ${v.length ? v.join(' ') : '-'}${info.features.missing[k] ? ` (missing ${info.features.missing[k].join(' ')})` : ''}`)
    .join(' | ');
  const scripts = Object.entries(info.features.scripts).map(([s, l]) => (l.length ? `${s} (${l.join(' ')})` : s)).join(', ');
  const langs = info.languages;
  const ok = langs.filter((l) => l.supported);
  const partial = langs.filter((l) => !l.supported);
  const lines = [
    `${n.full_name ?? n.family ?? '(unnamed font)'}${info.file ? `  ${info.file}` : ''}  [${info.format}, ${info.outlines} outlines${info.fonts_in_file > 1 ? `, font 1 of ${info.fonts_in_file}` : ''}]`,
    `  names      family ${q(n.family)}, subfamily ${q(n.subfamily)}; typographic ${q(n.typographic_family)} / ${q(n.typographic_subfamily)}; PostScript ${q(n.postscript_name)}`,
    `  version    ${q(n.version)}${info.revision != null ? ` (head ${info.revision})` : ''}`,
    `  makers     designer ${q(n.designer)}; manufacturer ${q(n.manufacturer)}; vendor ID ${q(info.vendor_id)}; vendor URL ${q(n.vendor_url)}`,
    `  licence    ${q(n.license)}; URL ${q(n.license_url)}${n.license?.length > 160 ? ' (full text in --json)' : ''}`,
    `  embedding  ${info.embedding ? `fsType ${info.embedding.fsType}: ${[...info.embedding.permissions, ...info.embedding.flags].join(', ')}` : 'no OS/2 table'}`,
    `  class      ${info.weight ? `weight ${info.weight.class} (${info.weight.name}), width ${info.width.class}${info.width.name ? ` (${info.width.name})` : ''}` : '-'}`,
    `  metrics    UPM ${m.units_per_em ?? '-'}; x-height ${m.x_height ?? '-'}${m.x_height_ratio != null ? ` (${m.x_height_ratio} em)` : ''}; cap height ${m.cap_height ?? '-'}${m.cap_height_ratio != null ? ` (${m.cap_height_ratio} em)` : ''}${m.normal_line_height ? `; line-height normal ~${m.normal_line_height.value} (${m.normal_line_height.basis}, varies by platform)` : ''}`,
    `  axes       ${ax}`,
    `  features   ${feat || 'none'}`,
    `  scripts    ${scripts || '-'}`,
    `  coverage   ${info.coverage.glyphs ?? '?'} glyphs, ${info.coverage.codepoints} code points${info.coverage.symbol ? ' (symbol cmap)' : ''}; ${info.coverage.blocks.map((b) => `${b.name} ${b.covered}/${b.size}`).join(', ')}`,
  ];
  if (detail) for (const l of langs) lines.push(`  ${l.code.padEnd(3)} ${l.name.padEnd(11)} ${l.supported ? 'supported' : `missing ${l.missing.length}/${l.required}: ${l.missing.join(' ')}`}`);
  else lines.push(`  languages  ${ok.length}/${langs.length} supported${ok.length ? `: ${ok.map((l) => l.code).join(' ')}` : ''}${partial.length ? `; missing: ${partial.map((l) => `${l.code} (${l.missing.length}: ${l.missing.slice(0, 8).join('')}${l.missing.length > 8 ? '…' : ''})`).join(', ')}` : ''}`);
  for (const x of info.notes) lines.push(`  note       ${x}`);
  for (const e of info.errors) lines.push(`  error      ${e}`);
  lines.push(`  licence!   ${info.license_note}`);
  return lines.join('\n');
}
