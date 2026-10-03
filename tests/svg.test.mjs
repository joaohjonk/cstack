// cstack svg (scripts/lib/svg). Pure tests always run: XML and path parsing, lint on hand-written fixtures, palette and
// grammar inputs, cleaning, ICO, raster measurements and the CLI contract. reduce and kit render with Chromium and skip
// with a reason when it is unavailable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseXML, serialize, XMLError, tagOf } from '../scripts/lib/svg/xml.mjs';
import { parsePathData, absoluteSegments, toCubics, bboxOf, shapeSegments, decimals, parseTransform, strokeBox, IDENTITY } from '../scripts/lib/svg/path.mjs';
import { lintSVG, lintFiles, formatLint } from '../scripts/lib/svg/lint.mjs';
import { loadGrammar, loadPalette } from '../scripts/lib/svg/grammar.mjs';
import { cleanRoot, monoRoot, sizedSVG, placedRoot } from '../scripts/lib/svg/clean.mjs';
import { encodeICO, decodeICO } from '../scripts/lib/svg/ico.mjs';
import { topology, resample, prepareThin, thinFeatures, radialInk, rasterFormat } from '../scripts/lib/svg/raster.mjs';
import { parseSizes, prepareOut } from '../scripts/lib/svg/reduce.mjs';
import { buildKit, KIT_FILES } from '../scripts/lib/svg/kit.mjs';
import { runSvg, SVG_HELP } from '../scripts/lib/svg/cli.mjs';
import { encodePNG, decodePNG } from '../providers/local/region_paste.mjs';
import { tmpDir } from './tmp.mjs';

// Probed before any test is registered: a test that points CSTACK_CHROMIUM at a missing path must not run first.
// ---------- Chromium ----------
let chromium = null;
try {
  const { loadEngine, launch } = await import('../scripts/lib/browser/launch.mjs');
  const b = await launch(await loadEngine());
  await b.close();
  chromium = true;
} catch (e) {
  chromium = e.message.split('\n')[0];
}
const withChromium = { timeout: 120000, skip: chromium === true ? false : `Chromium unavailable: ${chromium}` };

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'svg');
const fx = (...p) => path.join(FIX, ...p);
const read = (...p) => fs.readFileSync(fx(...p), 'utf8');
const tmp = () => tmpDir('cstack-svg-');
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const has = (findings, id, level, re) => findings.some((f) => f.id === id && (!level || f.level === level) && (!re || re.test(f.detail)));
const ICON = (body, attrs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${attrs}>\n${body}\n</svg>\n`;

// ---------- xml ----------
test('xml: elements, attributes, text, lines and entities', () => {
  const doc = parseXML('<?xml version="1.0"?>\n<!-- c -->\n<svg xmlns="http://www.w3.org/2000/svg" a="1 &amp; 2">\n  <title>A &lt;b&gt; &#65;&#x42;</title>\n  <g\n    id="x"/>\n</svg>');
  assert.equal(doc.root.name, 'svg');
  assert.equal(doc.root.line, 3);
  assert.equal(Object.getPrototypeOf(doc.root.attrs), null);
  assert.equal(doc.root.attrs.a, '1 & 2');
  const [title, g] = doc.root.children.filter((c) => c.type === 'el');
  assert.equal(title.children[0].value, 'A <b> AB');
  assert.equal(g.line, 5);
  assert.equal(doc.comments, 1);
  assert.equal(doc.pis[0].target, 'xml');
  assert.equal(serialize(doc.root, { indent: '' }), '<svg xmlns="http://www.w3.org/2000/svg" a="1 &amp; 2"><title>A &lt;b&gt; AB</title><g id="x"/></svg>');
  assert.equal(parseXML(serialize(doc.root)).root.attrs.a, '1 & 2');
});

test('xml: malformed input throws XMLError with a line', () => {
  const cases = [
    ['<svg>\n<g>\n</svg>', /does not match/, 3],
    ['<svg a="1" a="2"/>', /duplicate attribute/, 1],
    ['<svg a=1/>', /not quoted/, 1],
    ['<svg>\n<g>', /never closed/, 2],
    ['<svg/><svg/>', /more than one root/, 1],
    ['<svg><path d="M0 0" < /></svg>', /bad attribute|"<"/, 1],
  ];
  for (const [text, re, line] of cases) {
    assert.throws(() => parseXML(text), (e) => e instanceof XMLError && re.test(e.message) && e.line === line, text);
  }
});

test('xml: a DOCTYPE internal subset is flagged and its entities are never expanded', () => {
  const doc = parseXML('<!DOCTYPE svg [<!ENTITY boom "BOOM">]>\n<svg><title>&boom;</title></svg>');
  assert.equal(doc.entities, true);
  const title = doc.root.children[0];
  assert.equal(title.children[0].value, '&boom;');
  assert.match(doc.issues[0].detail, /undefined entity &boom;/);
});

// ---------- path ----------
test('path: compact arc flags, implicit lineto, relative commands, error position', () => {
  const arc = parsePathData('M0 0a5 5 0 1010 0');
  assert.equal(arc.error, null);
  assert.deepEqual(arc.cmds[1], { c: 'a', a: [5, 5, 0, 1, 0, 10, 0] });
  const imp = parsePathData('M1 1 2 2 3 3');
  assert.deepEqual(imp.cmds.map((c) => c.c), ['M', 'L', 'L']);
  const rel = absoluteSegments(parsePathData('m10 10h5v5H10z').cmds);
  assert.deepEqual(rel.map((s) => [s.t, s.x, s.y]), [['M', 10, 10], ['L', 15, 10], ['L', 15, 15], ['L', 10, 15], ['Z', 10, 10]]);
  const bad = parsePathData('M0 0L10 10L5');
  assert.equal(bad.cmds.length, 2);
  assert.match(bad.error.detail, /incomplete L command at character 12/);
  assert.match(parsePathData('L0 0').error.detail, /must start with M/);
});

test('path: exact bounding boxes from arcs and cubics; transforms; decimals', () => {
  const circle = shapeSegments('circle', { cx: '12', cy: '12', r: '7' });
  const box = bboxOf(toCubics(circle.segs));
  for (const [k, v] of Object.entries({ x0: 5, y0: 5, x1: 19, y1: 19 })) assert.ok(Math.abs(box[k] - v) < 1e-6, `${k} ${box[k]}`);
  const curve = bboxOf(toCubics(absoluteSegments(parsePathData('M0 0C0 10 10 10 10 0').cmds)));
  assert.ok(Math.abs(curve.y1 - 7.5) < 1e-9, `cubic extremum ${curve.y1}`);
  const rect = shapeSegments('rect', { x: '3', y: '5', width: '18', height: '14', rx: '20' });
  assert.deepEqual(rect.radius, { rx: 9, ry: 7 });
  assert.deepEqual(parseTransform('translate(2 3) scale(2)'), [2, 0, 0, 2, 2, 3]);
  assert.equal(parseTransform('rotate(45'), null);
  assert.deepEqual(['1', '1.25', '1.5e-3', '-.125', '2e3'].map(decimals), [0, 2, 4, 3, 0]);
});

test('path: stroke outline boxes follow caps, joins and the miter limit (checked against Chromium renders)', () => {
  const box = (d, opts, m = IDENTITY) => {
    const b = strokeBox(absoluteSegments(parsePathData(d).cmds), m, { hw: 1, ...opts });
    return b && Object.values(b).map((v) => Math.round(v * 1000) / 1000);
  };
  const circle = strokeBox(shapeSegments('circle', { cx: '12', cy: '12', r: '8' }).segs, IDENTITY, { hw: 1, join: 'miter' });
  assert.deepEqual(Object.values(circle).map((v) => Math.round(v * 1000) / 1000), [3, 3, 21, 21]); // a smooth curve has no miter
  assert.deepEqual(box('M4 4h16v16H4z', { join: 'miter' }), [3, 3, 21, 21]);
  assert.deepEqual(box('M6 20L12 4L18 20', { join: 'miter' }), [5.064, 1.152, 18.936, 20.351]); // tip within limit 4
  assert.deepEqual(box('M6 20L12 4L18 20', { join: 'miter', miterlimit: 1.5 }), [5.064, 3.649, 18.936, 20.351]); // bevelled
  assert.deepEqual(box('M6 20L12 4L18 20', { join: 'round', cap: 'round' }), [5, 3, 19, 21]);
  assert.deepEqual(box('M6 6L18 18', { cap: 'square' }), [4.586, 4.586, 19.414, 19.414]);
  assert.deepEqual(box('M4 12h16', { cap: 'butt' }), [4, 11, 20, 13]);
  assert.deepEqual(box('M12 12h0', { cap: 'round', hw: 2 }), [10, 10, 14, 14]);
  assert.equal(box('M12 12h0', { cap: 'butt' }), null);
  assert.deepEqual(box('M4 20C4 2 20 2 20 20', {}), [3, 5.5, 21, 20]);
  assert.deepEqual(box('M0 0h12v12H0z', { join: 'miter' }, parseTransform('rotate(30 12 12) translate(6 6)')), [2.438, 2.438, 21.562, 21.562]);
});

// ---------- lint: fixtures ----------
test('lint: the clean icon passes with the grammar, and without it', () => {
  const grammar = loadGrammar(fx('icons.tokens.json'));
  const withG = lintSVG(read('clean-icon.svg'), { file: 'clean-icon.svg', grammar });
  assert.deepEqual(withG.findings, []);
  assert.equal(withG.kind, 'icon');
  assert.equal(withG.metrics.mode, 'stroke');
  assert.deepEqual(withG.metrics.stroke.dominant, { width: 2, linecap: 'round', linejoin: 'round' });
  assert.deepEqual(lintSVG(read('clean-icon.svg'), { file: 'clean-icon.svg' }).findings, []);
});

test('lint: the messy icon fails on script, handler, external use, foreignObject, raster and viewBox', () => {
  const { findings, kind, metrics } = lintSVG(read('messy-icon.svg'), { file: 'messy-icon.svg' });
  assert.equal(kind, 'icon'); // square canvas from width/height
  assert.equal(metrics.viewBox.implied, true);
  const fail = findings.filter((f) => f.level === 'fail');
  assert.deepEqual(fail.map((f) => [f.id, f.line]).sort(), [
    ['svg.security', 12],
    ['svg.security', 13],
    ['svg.security', 3],
    ['svg.security', 4],
    ['svg.structure', 11],
    ['svg.viewbox', 3],
  ].sort());
  assert.ok(has(findings, 'svg.security', 'fail', /onload/));
  assert.ok(has(findings, 'svg.security', 'fail', /<script>/));
  assert.ok(has(findings, 'svg.security', 'fail', /external reference xlink:href="https:\/\/example\.invalid/));
  assert.ok(has(findings, 'svg.structure', 'fail', /embeds a 86 B raster/));
  assert.ok(has(findings, 'svg.viewbox', 'fail', /width\/height only \(24x24\)/));
  assert.ok(has(findings, 'svg.stroke', 'warn', /mixed stroke widths in one icon: 2 on 1 shape, 1\.5 on 1 shape/));
  assert.ok(has(findings, 'svg.stroke', 'warn', /mixed stroke-linecap/));
  assert.ok(has(findings, 'svg.color', 'warn', /stroke #333333, stroke #ff0000, fill #00ff00/));
  assert.ok(has(findings, 'svg.precision', 'warn', /6 decimals; 3 keep 1\/16 px/));
  assert.ok(has(findings, 'svg.precision', 'warn', /1 segment\(s\) shorter than 0\.024/));
  assert.ok(has(findings, 'svg.transform', 'warn', /1 shape/));
  assert.ok(has(findings, 'svg.transform', 'warn', /group\/use/));
  assert.ok(has(findings, 'svg.groups', 'warn', /empty <g>/));
  assert.ok(has(findings, 'svg.metadata', 'info'));
  assert.ok(has(findings, 'svg.a11y', 'info'));
  for (const f of findings) assert.match(f.id, /^svg\.[a-z0-9]+$/);
});

test('lint: the thin mark is a clean, labelled mark (its problem only shows when rendered small)', () => {
  const r = lintSVG(read('thin-mark.svg'), { file: 'thin-mark.svg' });
  assert.equal(r.kind, 'mark');
  assert.deepEqual(r.findings, []);
  assert.deepEqual(r.metrics.colors, ['#1d3557']);
  assert.equal(r.metrics.mode, 'mixed');
});

test('lint: an icon set flags its one inconsistent member, by majority and against the grammar', () => {
  const set = lintFiles([fx('set')]);
  assert.equal(set.ok, false);
  assert.equal(set.kind, 'icon');
  assert.equal(set.kind_source, 'set');
  assert.equal(set.files.length, 4);
  assert.deepEqual(set.findings.map((f) => [path.basename(f.file), f.id, f.level]), [
    ['user.svg', 'svg.stroke', 'fail'],
    ['user.svg', 'svg.stroke', 'fail'],
    ['user.svg', 'svg.stroke', 'fail'],
  ]);
  assert.match(set.findings.map((f) => f.detail).join('\n'), /stroke-width 1\.5 differs from the set: 2 in 3 of 4 icons/);
  assert.match(set.findings.map((f) => f.detail).join('\n'), /stroke-linecap butt differs from the set: round/);
  assert.match(set.findings.map((f) => f.detail).join('\n'), /stroke-linejoin miter differs from the set: round/);

  const g = lintFiles([fx('set')], { grammar: loadGrammar(fx('icons.tokens.json')) });
  assert.equal(g.kind_source, 'grammar');
  assert.deepEqual(g.findings.map((f) => [path.basename(f.file), f.line, f.detail]), [
    ['user.svg', 2, 'stroke-width 1.5 on 2 shape(s); grammar says 2'],
    ['user.svg', 2, 'stroke-linecap butt on 2 shape(s); grammar says round'],
    ['user.svg', 2, 'stroke-linejoin miter on 2 shape(s); grammar says round'],
  ]);
  const text = formatLint(g);
  assert.match(text, /^svg lint: 4 files · kind icon \(grammar given\)/);
  assert.match(text, /FAIL svg\.stroke +\S*user\.svg:2 +stroke-width 1\.5/);
  assert.match(text, /svg lint: FAIL \(3 fail, 0 warn, 0 info\)$/);
});

test('lint: a set with no majority fails at the set level', () => {
  const d = tmp();
  for (const f of ['bell', 'home']) fs.copyFileSync(fx('set', `${f}.svg`), path.join(d, `${f}.svg`));
  fs.copyFileSync(fx('set', 'user.svg'), path.join(d, 'user.svg'));
  fs.copyFileSync(fx('set', 'user.svg'), path.join(d, 'person.svg'));
  const r = lintFiles([d]);
  assert.ok(has(r.findings, 'svg.stroke', 'fail', /icon set has no majority stroke-width: 2 \(bell\.svg, home\.svg\); 1\.5 \(person\.svg, user\.svg\)/));
});

test('lint: grammar keylines (padding, canvas, radius, snap) and kind override', () => {
  const grammar = loadGrammar(fx('icons.tokens.json'));
  assert.deepEqual({ ...grammar, source: null }, { source: null, canvas: 24, padding: 1, stroke: 2, linecap: 'round', linejoin: 'round', radii: [2, 1], snap: null, gap: 2 });
  const tight = lintSVG(ICON('<rect x="0.5" y="4" width="20" height="14" rx="3"/>'), { grammar });
  assert.ok(has(tight.findings, 'svg.grid', 'fail', /within -0\.5 of the left edge; grammar padding is 1 \(live area 22\)/));
  assert.ok(has(tight.findings, 'svg.grid', 'warn', /corner radius 3 is not in the grammar \(2, 1\)/));
  const big = lintSVG(ICON('<path d="M4 4h16"/>').replace('0 0 24 24', '0 0 32 32'), { grammar });
  assert.ok(has(big.findings, 'svg.grid', 'fail', /canvas 32x32; grammar says 24x24/));
  assert.ok(has(big.findings, 'svg.stroke', 'fail', /stroke-width 1\.5 on 1 shape\(s\); grammar says 2/), 'widths are compared on the grammar canvas');

  const d = tmp();
  fs.writeFileSync(path.join(d, 'g.json'), JSON.stringify({ icon: { canvas: 24, padding: 2, stroke: 2, snap: 1 } }));
  const plain = loadGrammar(path.join(d, 'g.json'));
  assert.equal(plain.snap, 1);
  const off = lintSVG(ICON('<path d="M6 10h12.3"/>'), { grammar: plain });
  assert.ok(has(off.findings, 'svg.grid', 'fail', /1 coordinate\(s\) off the 1 grid \(first: 18\.3\)/));
  fs.writeFileSync(path.join(d, 'empty.json'), JSON.stringify({ colour: 'red' }));
  assert.throws(() => loadGrammar(path.join(d, 'empty.json')), /declares none of/);

  const round = lintSVG(ICON('<circle cx="12" cy="12" r="10"/>', ' stroke-linejoin="miter"').replace(' stroke-linejoin="round"', ''), { grammar: { ...grammar, linejoin: null } });
  assert.ok(!has(round.findings, 'svg.grid'), 'a circle touching the live area with default miter joins is inside it');

  const asMark = lintSVG(read('clean-icon.svg'), { kind: 'mark' });
  assert.equal(asMark.kind, 'mark');
});

test('lint: security in other forms (DOCTYPE entities, javascript:, external CSS, xml-stylesheet, prefixes)', () => {
  const text = `<?xml-stylesheet href="https://x.invalid/a.css"?>
<!DOCTYPE svg [<!ENTITY e "x">]>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Test">
  <style>@import url(https://x.invalid/b.css); .a { fill: url(https://x.invalid/p.svg#g) }</style>
  <a href="javascript:alert(1)"><path class="a" d="M8 8h48v48H8z" style="stroke:url(https://x.invalid/q.svg#s)"/></a>
  <path sketch:type="MSShapeGroup" d="M0 0h1"/>
</svg>`;
  const { findings } = lintSVG(text, { file: 'hostile.svg' });
  const sec = findings.filter((f) => f.id === 'svg.security').map((f) => f.detail);
  for (const re of [/DOCTYPE declares entities/, /xml-stylesheet/, /loads an external stylesheet/, /url\(https:\/\/x\.invalid\/p\.svg#g\) points outside/, /javascript: URL in href/, /external reference style/])
    assert.ok(sec.some((d) => re.test(d)), `${re} in\n${sec.join('\n')}`);
  assert.ok(has(findings, 'svg.structure', 'fail', /prefix "sketch:" is used but xmlns:sketch is never declared/));
  assert.ok(has(lintSVG('<svg><g></svg>', { file: 'broken.svg' }).findings, 'svg.parse', 'fail', /does not match/));
  assert.ok(has(lintSVG('<svg viewBox="0 0 10 10"><path d="M1 1h8"/></svg>').findings, 'svg.structure', 'fail', /no xmlns=/));
});

test('lint: complexity budgets, live text, stray groups and a11y for marks', () => {
  const many = Array.from({ length: 80 }, (_, i) => `<path d="M${i % 20} 1h1v1h-1z"/>`).join('\n');
  const r = lintSVG(ICON(many), { file: 'busy.svg' });
  assert.ok(has(r.findings, 'svg.complexity', 'fail', /320 path nodes; budget for an icon is 300/));
  assert.ok(has(r.findings, 'svg.complexity', 'warn', /80 shape elements \(warn above 24/));
  const mark = lintSVG('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><g><g><text x="4" y="30">Brand</text></g></g><g opacity="0"><path d="M0 0h4v4z"/></g></svg>', { file: 'm.svg' });
  assert.equal(mark.kind, 'mark');
  assert.ok(has(mark.findings, 'svg.structure', 'fail', /1 live <text> element/));
  assert.ok(has(mark.findings, 'svg.a11y', 'warn', /no <title>/));
  assert.ok(has(mark.findings, 'svg.a11y', 'warn', /role="img"/));
  assert.ok(has(mark.findings, 'svg.groups', 'info', /without attributes around a single element/));
  assert.ok(has(mark.findings, 'svg.groups', 'warn', /invisible element/));
  assert.ok(has(lintSVG('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g/></svg>').findings, 'svg.structure', 'warn', /nothing visible renders/));
});

// ---------- palette ----------
function brandWs() {
  const ws = tmp();
  fs.mkdirSync(path.join(ws, 'brand', 'tokens'), { recursive: true });
  fs.writeFileSync(
    path.join(ws, 'brand', 'tokens', 'color.tokens.json'),
    JSON.stringify({
      color: {
        $type: 'color',
        ink: { $value: '#1d3557' },
        paper: { $value: { colorSpace: 'srgb', components: [0.945, 0.98, 0.933], hex: '#f1faee' } },
        accent: { $value: '#e63946' },
        text: { $value: '{color.ink}' },
      },
    }),
  );
  fs.writeFileSync(path.join(ws, 'two-tone.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Fictional two-tone mark">\n  <path fill="#1d3557" d="M8 8h48v48H8z"/>\n  <path fill="#e53945" d="M20 20h24v24H20z"/>\n</svg>\n');
  return ws;
}

test('palette: DTCG tokens (with an alias) from the workspace; off-palette colors name the nearest token', async () => {
  const ws = brandWs();
  const pal = loadPalette(undefined, ws);
  assert.equal(pal.source, 'brand/tokens (workspace, auto)');
  assert.deepEqual(pal.colors.get('#1d3557'), ['color.ink', 'color.text']);
  assert.ok(pal.colors.has('#f1faee'));

  const out = await runSvg('lint', { _: ['two-tone.svg'] }, ws);
  assert.equal(out.ok, false);
  const pf = out.report.findings.filter((f) => f.id === 'svg.palette');
  assert.equal(pf.length, 1);
  assert.equal(pf[0].level, 'fail');
  assert.equal(pf[0].line, 3);
  assert.match(pf[0].detail, /^#e53945 \(fill\) is not in the palette; nearest color\.accent #e63946 \(dE [\d.]+\)$/);
  assert.match(out.text, /palette brand\/tokens \(workspace, auto\) \(3 colors\)/);
  const unpainted = lintSVG('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="x"><path d="M8 8h48v48H8z"/></svg>', { palette: pal });
  assert.ok(has(unpainted.findings, 'svg.palette', 'warn', /1 shape\(s\) have no fill and render black/));

  assert.equal((await runSvg('lint', { _: ['two-tone.svg'], palette: 'none' }, ws)).ok, true);
  assert.equal((await runSvg('lint', { _: ['two-tone.svg'], palette: '#1d3557,#e53945' }, ws)).ok, true);
  assert.equal(loadPalette(path.join(ws, 'brand', 'tokens', 'color.tokens.json'), ws).colors.size, 3);
  assert.equal(loadPalette(path.join(ws, 'brand', 'tokens'), ws).colors.size, 3);
  assert.equal(loadPalette('none', ws), null);
  assert.equal(loadPalette(undefined, tmp()), null);
  assert.deepEqual([...loadPalette('#abc, #FFFFFF', ws).colors.keys()], ['#aabbcc', '#ffffff']);
  assert.throws(() => loadPalette('#12', ws), /bad --palette color/);
  assert.throws(() => loadPalette('missing-dir', ws), /not found/);
});

// ---------- clean, mono, sizing ----------
test('clean: favicon copy drops scripts, handlers, external refs and editor noise; the input tree is untouched', () => {
  const doc = parseXML(read('messy-icon.svg'));
  const before = serialize(doc.root);
  const { root, removed } = cleanRoot(doc.root);
  const out = serialize(root);
  assert.equal(serialize(doc.root), before);
  for (const bad of ['<script', 'foreignObject', 'onload', 'inkscape', '<use', 'example.invalid', 'width="24"', 'xmlns:xlink']) assert.ok(!out.includes(bad), `${bad} in\n${out}`);
  assert.match(out, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 24 24">/);
  assert.match(out, /<image [^>]*href="data:image\/png/); // embedded raster kept (lint fails it; the kit does not redraw)
  assert.equal((out.match(/<path /g) ?? []).length, 2);
  for (const r of ['onload handler on <svg>', '<script>', '<foreignObject>', '<use> left without a reference']) assert.ok(removed.includes(r), `${r} in ${removed}`);
  assert.equal(lintSVG(out, { file: 'favicon.svg' }).findings.filter((f) => f.id === 'svg.security').length, 0);
});

test('mono: one paint everywhere, tints removed, zero opacity hidden; currentColor variant', () => {
  const root = parseXML('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>.a{fill:#ff0000;opacity:.5}</style><path class="a" d="M0 0h5v5z"/><path fill="#00ff00" fill-opacity="0.4" style="stroke:#0000ff" d="M5 5h5v5z"/><path opacity="0" fill="#123456" d="M0 5h5v5z"/><path fill="none" stroke="#abcdef" d="M1 1h8"/></svg>').root;
  const black = serialize(monoRoot(root));
  for (const c of ['#ff0000', '#00ff00', '#0000ff', '#123456', '#abcdef', 'fill-opacity', 'opacity:.5']) assert.ok(!black.includes(c), `${c} in ${black}`);
  assert.match(black, /display="none"/);
  assert.match(black, /fill="none" stroke="#000000"/);
  assert.match(black, /\.a\{fill:#000000\}/);
  const cur = monoRoot(parseXML(read('thin-mark.svg')).root, 'currentColor');
  assert.equal(cur.attrs.fill, 'currentColor');
  assert.ok(!serialize(cur).includes('#1d3557'));
  assert.match(serialize(cur), /stroke="currentColor"/);
});

test('sizing and placement: exact pixel size, viewBox derived, mark centred in a box', () => {
  const messy = parseXML(read('messy-icon.svg')).root;
  const sized = parseXML(sizedSVG(messy, 16, 16, { color: '#000000' })).root;
  assert.deepEqual([sized.attrs.width, sized.attrs.height, sized.attrs.viewBox, sized.attrs.color], ['16', '16', '0 0 24 24', '#000000']);
  const placed = placedRoot(parseXML(read('clean-icon.svg')).root, 180, { box: 140, background: '#f1faee' });
  assert.equal(placed.attrs.viewBox, '0 0 180 180');
  const [bg, inner] = placed.children;
  assert.deepEqual([tagOf(bg), bg.attrs.fill, bg.attrs.width], ['rect', '#f1faee', '180']);
  assert.deepEqual([inner.attrs.x, inner.attrs.y, inner.attrs.width, inner.attrs.viewBox], ['20', '20', '140', '0 0 24 24']);
});

// ---------- ico ----------
const solid = (s, rgba = [0, 0, 0, 255]) => {
  const data = new Uint8ClampedArray(s * s * 4);
  for (let i = 0; i < s * s; i++) data.set(rgba, i * 4);
  return encodePNG({ width: s, height: s, data });
};

test('ico: PNG entries round-trip, sorted by size; 256 is stored as 0', () => {
  const pngs = { 48: solid(48), 16: solid(16, [255, 0, 0, 255]), 32: solid(32), 256: solid(256) };
  const ico = encodeICO([48, 16, 256, 32].map((s) => ({ width: s, height: s, png: pngs[s] })));
  assert.deepEqual([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)], [0, 1, 4]);
  assert.equal(ico[6 + 16 * 3], 0); // 256 px entry
  const back = decodeICO(ico);
  assert.deepEqual(back.map((e) => [e.width, e.height, e.bpp, e.png]), [[16, 16, 32, true], [32, 32, 32, true], [48, 48, 32, true], [256, 256, 32, true]]);
  for (const e of back) assert.ok(e.data.equals(pngs[e.width]));
  assert.deepEqual(Array.from(decodePNG(back[0].data).data.subarray(0, 4)), [255, 0, 0, 255]);
  assert.throws(() => encodeICO([{ width: 300, height: 300, png: solid(8) }]), /1\.\.256/);
  assert.throws(() => encodeICO([{ width: 16, height: 16, png: Buffer.from('GIF89a........') }]), /must be PNG/);
  assert.throws(() => decodeICO(Buffer.from('nope!!')), /not an ICO/);
  assert.throws(() => decodeICO(ico.subarray(0, 40)), /truncated|past the end/);
});

// ---------- raster measurements ----------
function canvas(w, h, rects) {
  const bin = new Uint8Array(w * h);
  for (const [x0, y0, x1, y1, v = 1] of rects) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) bin[y * w + x] = v;
  return bin;
}

test('raster: topology counts parts and counters; resample keeps the mean', () => {
  const ring = canvas(64, 64, [[10, 10, 50, 50], [25, 25, 35, 35, 0], [56, 56, 58, 58]]);
  assert.deepEqual(topology(ring, 64, 64, 4), { components: 2, holes: 1 });
  assert.deepEqual(topology(ring, 64, 64, 5), { components: 1, holes: 1 }); // the 2x2 speck is below minArea
  const cov = Float32Array.from(ring);
  const down = resample(cov, 64, 64, 16, 16);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  assert.ok(Math.abs(mean(down) - mean(cov)) < 1e-6);
  const odd = resample(cov, 64, 64, 24, 24);
  assert.ok(Math.abs(mean(odd) - mean(cov)) < 1e-6);
});

test('raster: features thinner than the disk are isolated; corners and thick shapes are not', () => {
  const w = 128, h = 128;
  const bin = canvas(w, h, [[10, 10, 50, 50], [10, 100, 110, 102], [70, 10, 90, 50], [92, 10, 112, 50]]);
  const prep = prepareThin(bin, w, h, 8);
  const t = thinFeatures(prep, 8);
  assert.equal(t.ink.count, 1); // the 2 px line; the blocks' rounded corners are ignored
  assert.ok(t.ink.area >= 190 && t.ink.area <= 210, `area ${t.ink.area}`);
  assert.equal(t.gap.count, 1); // the 2 px slot between the two right-hand blocks
  assert.deepEqual(thinFeatures(prep, 1), { ink: { area: 0, count: 0, thinnest: null }, gap: { area: 0, count: 0, thinnest: null } });
  const cov = Float32Array.from(canvas(100, 100, [[40, 40, 60, 60]]));
  const r = radialInk(cov, 100, 100, 50, 50, 12);
  assert.ok(Math.abs(r.maxR - Math.hypot(9.5, 9.5)) < 1e-9 && r.outside > 0);
});

// ---------- CLI contract ----------
test('cli: help, argument errors, object and raw argv forms, --json', async () => {
  assert.equal(await runSvg('help'), SVG_HELP);
  assert.equal(await runSvg(undefined), SVG_HELP);
  await assert.rejects(runSvg('vectorize', {}), /unknown svg subcommand "vectorize"/);
  await assert.rejects(runSvg('lint', { _: [] }), /usage: cstack svg lint/);
  await assert.rejects(runSvg('lint', { _: [fx('clean-icon.svg')], kind: 'logo' }), /--kind must be icon or mark/);
  await assert.rejects(runSvg('reduce', { _: ['nope.svg'] }, tmp()), /not found: nope\.svg/);
  await assert.rejects(runSvg('kit', { _: [fx('clean-icon.svg')] }), /usage: cstack svg kit/);
  await assert.rejects(runSvg('reduce', { _: [fx('thin-mark.svg')], sizes: '4,16' }), /bad --sizes/);

  const obj = await runSvg('lint', { _: [fx('set')], grammar: fx('icons.tokens.json') });
  assert.equal(obj.ok, false);
  assert.equal(obj.report.counts.fail, 3);
  assert.match(obj.text, /svg lint: FAIL/);
  const raw = await runSvg('lint', ['lint', fx('clean-icon.svg'), '--grammar', fx('icons.tokens.json'), '--json']);
  assert.equal(raw.ok, true);
  const parsed = JSON.parse(raw.text);
  assert.deepEqual([parsed.ok, parsed.kind, parsed.findings.length, parsed.grammar.stroke], [true, 'icon', 0, 2]);
  const swallowed = await runSvg('lint', { _: [], json: fx('clean-icon.svg') }); // a generic parser's `--json file`
  assert.equal(JSON.parse(swallowed.text).files.length, 1);
  assert.equal(process.exitCode ?? 0, 0);
});

test('parseSizes and prepareOut', () => {
  assert.deepEqual(parseSizes(undefined), [16, 24, 32, 48, 64]);
  assert.deepEqual(parseSizes('32,16, 16'), [16, 32]);
  for (const bad of ['4', '16,x', '2000', '16.5']) assert.throws(() => parseSizes(bad), /bad --sizes/);
  const d = tmp();
  assert.throws(() => prepareOut(d, false), /output dir exists/);
  assert.doesNotThrow(() => prepareOut(d, true));
  assert.doesNotThrow(() => prepareOut(path.join(d, 'new'), false));
  fs.writeFileSync(path.join(d, 'f'), 'x');
  assert.throws(() => prepareOut(path.join(d, 'f'), true), /is a file/);
});

// A ring with a pin-hole counter, drawn as a PNG (4x4 supersampled): a generated logo before it is redrawn.
function ringPNG(size, { bg = null, ink = [29, 53, 87] } = {}) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let a = 0;
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const d = Math.hypot(x + (sx + 0.5) / 4 - size / 2, y + (sy + 0.5) / 4 - size / 2) / size;
          if (d < 0.4 && d > 0.03) a++;
        }
      a /= 16;
      const o = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) data[o + c] = bg ? Math.round(ink[c] * a + bg[c] * (1 - a)) : ink[c];
      data[o + 3] = bg ? 255 : Math.round(a * 255);
    }
  return encodePNG({ width: size, height: size, data });
}

test('rasters: detected by magic bytes; lint and kit refuse them as masters with a clear reason', async () => {
  assert.equal(rasterFormat(solid(4)), 'png');
  assert.equal(rasterFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1])), 'jpeg');
  assert.equal(rasterFormat(Buffer.from('RIFF\x10\x00\x00\x00WEBPVP8 ', 'latin1')), 'webp');
  assert.equal(rasterFormat(Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00', 'latin1')), 'gif');
  assert.equal(rasterFormat(Buffer.from(read('clean-icon.svg'))), null);
  const d = tmp();
  const png = path.join(d, 'generated-logo.png');
  fs.writeFileSync(png, ringPNG(64));
  const r = lintFiles([png]);
  assert.equal(r.ok, false);
  assert.match(r.findings[0].detail, /^PNG raster, not SVG: a master is vector/);
  await assert.rejects(buildKit(png, { out: path.join(d, 'kit') }), /svg kit needs an SVG master; generated-logo\.png is a PNG raster/);
  assert.equal(fs.existsSync(path.join(d, 'kit')), false);
});

test('kit: refuses to overwrite its input or an existing --out, before rendering anything', async () => {
  const d = tmp();
  const master = path.join(d, 'favicon.svg');
  fs.copyFileSync(fx('clean-icon.svg'), master);
  const before = sha(master);
  await assert.rejects(buildKit(master, { out: d, force: true }), /refusing to overwrite the input/);
  const out = tmp();
  await assert.rejects(buildKit(fx('clean-icon.svg'), { out }), /output dir exists/);
  await assert.rejects(buildKit(fx('clean-icon.svg'), { out: path.join(d, 'k'), bg: 'rgba(0,0,0,.5)' }), /bad --bg/);
  assert.equal(sha(master), before);
  assert.deepEqual(fs.readdirSync(out), []);
});

test('reduce and kit without Chromium: reduce skips with a MISSING line (exit 0), kit fails clearly and writes nothing', async () => {
  const prev = process.env.CSTACK_CHROMIUM;
  process.env.CSTACK_CHROMIUM = path.join(tmp(), 'no-chromium-here');
  try {
    const out = path.join(tmp(), 'reduce');
    const r = await runSvg('reduce', { _: [fx('thin-mark.svg')], out });
    assert.equal(r.ok, true);
    assert.equal(r.report.skipped, true);
    assert.match(r.text, /^MISSING: /);
    assert.match(r.text, /svg reduce: SKIPPED/);
    assert.equal(fs.existsSync(out), false);
    const kitOut = path.join(tmp(), 'kit');
    await assert.rejects(runSvg('kit', { _: [fx('thin-mark.svg')], out: kitOut }), /^Error: MISSING: .*svg kit renders the PNG and ICO files with Chromium/);
    assert.equal(fs.existsSync(kitOut), false);
  } finally {
    if (prev === undefined) delete process.env.CSTACK_CHROMIUM;
    else process.env.CSTACK_CHROMIUM = prev;
  }
});



test('reduce (chromium): the thin mark collapses at 16 px and holds at 48 and 64 px', withChromium, async () => {
  const input = fx('thin-mark.svg');
  const before = sha(input);
  const out = path.join(tmp(), 'reduce');
  const r = await runSvg('reduce', { _: [input], out });
  assert.equal(r.ok, false);
  const rows = Object.fromEntries(r.report.rows.map((row) => [row.size, row]));
  assert.deepEqual(Object.keys(rows).map(Number), [16, 24, 32, 48, 64]);
  assert.equal(rows[16].verdict, 'collapse');
  assert.deepEqual([rows[16].holes.hi_res, rows[16].holes.native], [1, 0]); // the pin-hole counter closes
  assert.equal(rows[48].verdict, 'ok');
  assert.equal(rows[64].verdict, 'ok');
  assert.ok(rows[16].score < 0.5 && rows[64].score > 0.9, `scores ${rows[16].score} ${rows[64].score}`);
  assert.equal(rows[16].min_stroke_px, 0.375);
  assert.ok(has(r.report.findings, 'svg.reduction', 'fail', /detail collapses at 16(, 24)? px .*counters 1→0/));
  assert.ok([24, 32].includes(r.report.holds_from_px), `holds from ${r.report.holds_from_px}`);
  assert.ok(has(r.report.findings, 'svg.centering', 'info', /ink box \(\+0%, \+2\.9%\)/)); // the hairline sits low
  assert.match(r.text, /svg reduce: FAIL/);
  for (const s of [16, 48]) for (const v of ['onwhite', 'onblack', 'mono']) {
    const img = decodePNG(fs.readFileSync(path.join(out, `thin-mark-${s}-${v}.png`)));
    assert.deepEqual([img.width, img.height], [s, s]);
  }
  const sheet = decodePNG(fs.readFileSync(path.join(out, 'contact-sheet.png')));
  assert.ok(sheet.width > 600 && sheet.height > 300, `${sheet.width}x${sheet.height}`);
  const json = JSON.parse(fs.readFileSync(path.join(out, 'reduce.json'), 'utf8'));
  assert.equal(json.kind, 'svg-reduction');
  assert.equal(json.sha256, before);
  assert.equal(json.files.length, 5 * 3 + 1);
  assert.equal(sha(input), before);
  await assert.rejects(runSvg('reduce', { _: [input], out }), /output dir exists/);
  const clean = await runSvg('reduce', { _: [fx('clean-icon.svg')], out: path.join(tmp(), 'r2'), sizes: '24,48' });
  assert.equal(clean.ok, true);
  assert.ok(clean.report.rows.every((row) => row.verdict !== 'collapse'));
});

test('reduce (chromium): a generated raster logo gets the same one-color small-size test', withChromium, async () => {
  const d = tmp();
  for (const [name, opts] of [['transparent.png', {}], ['opaque.png', { bg: [241, 250, 238], ink: [230, 57, 70] }]]) {
    fs.writeFileSync(path.join(d, name), ringPNG(512, opts));
    const r = await runSvg('reduce', { _: [path.join(d, name)], out: path.join(d, `${name}-out`), sizes: '16,48' });
    assert.deepEqual(r.report.raster, { format: 'png', width: 512, height: 512 });
    const [r16, r48] = r.report.rows;
    assert.deepEqual([r16.verdict, r16.holes.hi_res, r16.holes.native], ['collapse', 1, 0], name);
    assert.equal(r48.verdict, 'ok', name);
    assert.equal(r.ok, false);
    assert.equal(r16.min_stroke_px, null);
    assert.ok(fs.existsSync(path.join(d, `${name}-out`, `${name.replace('.png', '')}-16-mono.png`)));
    if (opts.bg) {
      assert.match(r.report.notes[0], /distance from its background #f[0-9a-f]{5}/);
      assert.ok(r.report.contrast.on_background > 0.5);
      assert.equal(r.report.onecolor, null);
    } else assert.match(r.report.notes[0], /alpha channel/);
  }
});

test('kit (chromium): every file, ICO entries, maskable safe zone, input untouched, --force', withChromium, async () => {
  const input = fx('thin-mark.svg');
  const before = sha(input);
  const out = path.join(tmp(), 'kit');
  const r = await runSvg('kit', { _: [input], out, bg: '#f1faee', name: 'Ringfield' });
  assert.equal(r.ok, true, r.text);
  assert.deepEqual(fs.readdirSync(out).sort(), [...KIT_FILES].sort());
  const ico = decodeICO(fs.readFileSync(path.join(out, 'favicon.ico')));
  assert.deepEqual(ico.map((e) => [e.width, e.png, decodePNG(e.data).width]), [[16, true, 16], [32, true, 32], [48, true, 48]]);
  for (const [f, s] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['maskable-512.png', 512]]) {
    const img = decodePNG(fs.readFileSync(path.join(out, f)));
    assert.deepEqual([img.width, img.height], [s, s], f);
  }
  const corner = (f) => Array.from(decodePNG(fs.readFileSync(path.join(out, f))).data.subarray(0, 4));
  assert.deepEqual(corner('apple-touch-icon.png'), [241, 250, 238, 255]); // opaque --bg
  assert.deepEqual(corner('maskable-512.png'), [241, 250, 238, 255]);
  assert.equal(corner('icon-512.png')[3], 0); // transparent
  const m = r.report.checks.maskable;
  assert.equal(m.ok, true);
  assert.equal(m.safe_radius_px, 204.8);
  assert.equal(m.ink_outside_px, 0);
  assert.ok(m.ink_max_radius_px <= 204.8 && m.ink_max_radius_px > 150, `ink radius ${m.ink_max_radius_px}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'site.webmanifest'), 'utf8'));
  assert.equal(manifest.name, 'Ringfield');
  assert.equal(manifest.background_color, '#f1faee');
  assert.deepEqual(manifest.icons.map((i) => i.purpose ?? 'any'), ['any', 'any', 'maskable']);
  const fav = fs.readFileSync(path.join(out, 'favicon.svg'), 'utf8');
  assert.match(fav, /viewBox="0 0 64 64"/);
  assert.deepEqual(lintSVG(fav, { file: 'favicon.svg' }).findings.filter((f) => f.level === 'fail'), []);
  assert.match(fs.readFileSync(path.join(out, 'monochrome.svg'), 'utf8'), /currentColor/);
  const kit = JSON.parse(fs.readFileSync(path.join(out, 'kit.json'), 'utf8'));
  assert.equal(kit.source.sha256, before);
  assert.equal(sha(input), before);

  await assert.rejects(runSvg('kit', { _: [input], out }), /output dir exists/);
  const again = await runSvg('kit', ['kit', fx('messy-icon.svg'), '--out', out, '--force']);
  assert.equal(again.ok, true, again.text);
  assert.match(again.text, /note: the master fails svg lint \(svg\.security x4, svg\.structure, svg\.viewbox\)/);
  assert.ok(!fs.readFileSync(path.join(out, 'favicon.svg'), 'utf8').includes('<script'));
});
