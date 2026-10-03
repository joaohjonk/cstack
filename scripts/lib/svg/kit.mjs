// svg kit: the favicon and app-icon set from one master SVG (docs/research/mockups-and-vector.md B2: the six-file
// set from Evil Martians' favicon guide, updated 2026-01-21, and the web.dev maskable safe zone).
//   favicon.svg           cleaned copy (no scripts, external references or editor noise; scales by viewBox)
//   favicon.ico           16, 32 and 48 px PNG entries in one ICO container
//   apple-touch-icon.png  180 px on an opaque --bg (iOS shows transparency as black), mark inset 20 px (inferred)
//   icon-192.png, icon-512.png   transparent, mark fit to the canvas
//   maskable-512.png      full-bleed --bg; ink fit to 90% of the safe circle (radius 40% of the width = 204.8 px),
//                         then checked: no ink may fall outside the circle
//   monochrome.svg        every paint as currentColor, tints removed
//   site.webmanifest      icons snippet; kit.json records hashes, checks and the <head> tags
// Renders with Chromium and fails with a MISSING line without it. Never overwrites the input; refuses an existing
// output directory unless --force; writes nothing until every render and check has run.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { parseXML, serialize } from './xml.mjs';
import { rootViewBox } from './model.mjs';
import { normHex } from './style.mjs';
import { cleanRoot, monoRoot, sizedSVG, placedRoot } from './clean.mjs';
import { lintSVG } from './lint.mjs';
import { chromiumStatus, withRenderer, coverage, binarize, topology, radialInk, inkAgainst, rasterFormat } from './raster.mjs';
import { encodeICO, decodeICO } from './ico.mjs';
import { prepareOut, writeFiles } from './reduce.mjs';
import { encodePNG, decodePNG } from '../../../providers/local/region_paste.mjs';

export const KIT = { ico: [16, 32, 48], apple: 180, appleInset: 20, icons: [192, 512], maskable: 512, safeRadius: 0.4, maskableFill: 0.9 };
export const KIT_FILES = ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'maskable-512.png', 'monochrome.svg', 'site.webmanifest', 'kit.json'];
export const HEAD_TAGS = ['<link rel="icon" href="/favicon.ico" sizes="32x32">', '<link rel="icon" href="/favicon.svg" type="image/svg+xml">', '<link rel="apple-touch-icon" href="/apple-touch-icon.png">', '<link rel="manifest" href="/site.webmanifest">'];
const CSTACK_VERSION = createRequire(import.meta.url)('../../../package.json').version;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const r2 = (n) => Math.round(n * 100) / 100;

export async function buildKit(file, { out, bg = '#ffffff', name = null, force = false, display = (p) => p } = {}) {
  if (!file || !out) throw new Error('usage: cstack svg kit <file.svg> --out <dir> [--bg #hex] [--name "Brand"] [--force]');
  const bgc = normHex(bg);
  if (!bgc || bgc.alpha !== 1) throw new Error(`bad --bg "${bg}" (an opaque #rgb or #rrggbb)`);
  const input = path.resolve(file), outDir = path.resolve(out);
  const real = (p) => (fs.existsSync(p) ? fs.realpathSync(p) : path.join(fs.existsSync(path.dirname(p)) ? fs.realpathSync(path.dirname(p)) : path.dirname(p), path.basename(p)));
  if (KIT_FILES.some((n) => real(path.join(outDir, n)) === real(input))) throw new Error('refusing to overwrite the input: choose another --out (inputs are never edited in place)');
  const src = fs.readFileSync(input);
  const fmt = rasterFormat(src);
  if (fmt) throw new Error(`svg kit needs an SVG master; ${path.basename(input)} is a ${fmt.toUpperCase()} raster (redraw it as vector, then lint and reduce it)`);
  const text = src.toString('utf8');
  const doc = parseXML(text);
  const vb = rootViewBox(doc.root);
  if (!vb) throw new Error('svg kit needs a viewBox (or width and height) on the master');
  prepareOut(outDir, force);
  const status = await chromiumStatus();
  if (!status.ok) throw new Error(`${status.reason} (svg kit renders the PNG and ICO files with Chromium)`);

  const lint = lintSVG(text, { file: path.basename(input) });
  const { root: clean, removed } = cleanRoot(doc.root);
  const files = new Map();
  files.set('favicon.svg', Buffer.from(serialize(clean) + '\n'));
  files.set('monochrome.svg', Buffer.from(serialize(monoRoot(clean, 'currentColor')) + '\n'));
  const notes = [];
  if (Math.abs(vb.w - vb.h) > 1e-9) notes.push(`non-square master (${r2(vb.w)}x${r2(vb.h)}): icons letterbox it; a symbol-only lockup usually reads better`);
  if (removed.length) notes.push(`cleaned out of favicon.svg: ${removed.join('; ')}`);
  const lintCounts = { fail: 0, warn: 0, info: 0 };
  for (const f of lint.findings) lintCounts[f.level]++;
  if (lintCounts.fail) {
    const ids = new Map();
    for (const f of lint.findings) if (f.level === 'fail') ids.set(f.id, (ids.get(f.id) ?? 0) + 1);
    notes.push(`the master fails svg lint (${[...ids].map(([id, n]) => (n > 1 ? `${id} x${n}` : id)).join(', ')}): run cstack svg lint and fix it before shipping`);
  }

  let engine, maskable, onecolor;
  await withRenderer(async ({ render, engine: eng }) => {
    engine = eng;
    const png = async (svgText, size, background = null) => encodePNG(await render(svgText, { width: size, height: size, background }));
    const entries = [];
    for (const s of KIT.ico) entries.push({ width: s, height: s, png: await png(sizedSVG(clean, s, s), s) });
    files.set('favicon.ico', encodeICO(entries));
    const A = KIT.apple;
    files.set('apple-touch-icon.png', await png(serialize(placedRoot(clean, A, { box: A - 2 * KIT.appleInset, background: bgc.hex }), { indent: '' }), A));
    for (const s of KIT.icons) files.set(`icon-${s}.png`, await png(sizedSVG(clean, s, s), s));

    const M = KIT.maskable, safe = KIT.safeRadius * M;
    const silhouette = monoRoot(clean);
    const ref = radialInk(coverage(await render(serialize(placedRoot(silhouette, M), { indent: '' }), { width: M, height: M })), M, M, M / 2, M / 2, Infinity);
    if (!ref.maxR) throw new Error('the master renders no visible ink');
    let box = (M * safe * KIT.maskableFill) / ref.maxR;
    let check;
    for (let i = 0; ; i++) {
      check = radialInk(coverage(await render(serialize(placedRoot(silhouette, M, { box }), { indent: '' }), { width: M, height: M })), M, M, M / 2, M / 2, safe);
      if (!check.outside || i === 5) break;
      box *= 0.98; // anti-aliasing fringe: shrink 2% and measure again
    }
    files.set('maskable-512.png', await png(serialize(placedRoot(clean, M, { box, background: bgc.hex }), { indent: '' }), M));
    maskable = { id: 'icon.maskable', safe_radius_px: r2(safe), ink_max_radius_px: r2(check.maxR), ink_outside_px: check.outside, mark_box_px: r2(box), ok: check.outside === 0 };

    const C = 512;
    const colorInk = inkAgainst(await render(sizedSVG(clean, C, C, { color: '#000000' }), { width: C, height: C, background: '#ffffff' }), [255, 255, 255]);
    const monoBin = binarize(coverage(await render(sizedSVG(silhouette, C, C), { width: C, height: C })));
    const tc = topology(colorInk, C, C, 16), tm = topology(monoBin, C, C, 16);
    onecolor = { id: 'svg.onecolor', color: tc, monochrome: tm, ok: tc.holes <= tm.holes && tc.components <= tm.components };
    if (!onecolor.ok) notes.push(`monochrome.svg loses ${tc.holes - tm.holes > 0 ? `${tc.holes - tm.holes} counter(s)` : `${tc.components - tm.components} separate part(s)`} that the color master shows (light shapes act as knockouts): draw a one-color variant`);
  });

  const manifest = {
    ...(name ? { name, short_name: name } : {}),
    icons: [
      { src: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { src: '/icon-512.png', type: 'image/png', sizes: '512x512' },
      { src: '/maskable-512.png', type: 'image/png', sizes: '512x512', purpose: 'maskable' },
    ],
    background_color: bgc.hex,
  };
  files.set('site.webmanifest', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));

  // self-check what was produced before anything is written
  const ico = decodeICO(files.get('favicon.ico'));
  const icoOk = ico.length === KIT.ico.length && ico.every((e, i) => e.png && e.width === KIT.ico[i] && decodePNG(e.data).width === KIT.ico[i]);
  const dims = {};
  for (const [n, b] of files) if (n.endsWith('.png')) {
    const im = decodePNG(b);
    dims[n] = { width: im.width, height: im.height };
  }
  const expect = { 'apple-touch-icon.png': KIT.apple, 'icon-192.png': 192, 'icon-512.png': 512, 'maskable-512.png': KIT.maskable };
  const sizesOk = Object.entries(expect).every(([n, s]) => dims[n]?.width === s && dims[n]?.height === s);
  const checks = { ico: { ok: icoOk, entries: ico.map((e) => `${e.width}x${e.height}`) }, sizes: { id: 'favicon.set', ok: sizesOk, expected: expect }, maskable, onecolor };
  const ok = icoOk && sizesOk && maskable.ok;

  const list = writeFiles(outDir, files);
  for (const f of list) if (dims[f.path]) Object.assign(f, dims[f.path]);
  const report = {
    kind: 'svg-kit',
    source: { file: display(input), sha256: sha(src) },
    cstack_version: CSTACK_VERSION,
    engine,
    created_at: new Date().toISOString(),
    ok,
    bg: bgc.hex,
    name,
    lint: lintCounts,
    checks,
    notes,
    head: HEAD_TAGS,
    files: list,
  };
  const body = Buffer.from(JSON.stringify(report, null, 2) + '\n');
  writeFiles(outDir, new Map([['kit.json', body]]));
  report.files.push({ path: 'kit.json', bytes: body.length });
  return report;
}

export function formatKit(rep, outLabel) {
  const m = rep.checks.maskable;
  const lines = [
    `svg kit: ${rep.source.file} → ${outLabel} (bg ${rep.bg}${rep.name ? `, name "${rep.name}"` : ''})`,
    ...rep.files.map((f) => `  ${f.path.padEnd(22)} ${String(f.bytes).padStart(7)} B${f.width ? `  ${f.width}x${f.height}` : ''}`),
    `maskable: ink reaches ${m.ink_max_radius_px} px of the ${m.safe_radius_px} px safe radius; ${m.ink_outside_px} px outside → ${m.ok ? 'PASS' : 'FAIL'}`,
    `favicon.ico: ${rep.checks.ico.entries.join(', ')} → ${rep.checks.ico.ok ? 'PASS' : 'FAIL'}`,
    ...rep.notes.map((n) => `note: ${n}`),
    'head:',
    ...rep.head.map((h) => `  ${h}`),
    `svg kit: ${rep.ok ? 'PASS' : 'FAIL'}`,
  ];
  return lines.join('\n');
}
