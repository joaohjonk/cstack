// svg lint: deterministic checks for marks and icon sets (docs/research/mockups-and-vector.md, sections B2, B4, B5, E).
// Pure Node, no browser. A finding is {id: 'svg.<check>', level: 'fail'|'warn'|'info', file, line?, detail}.
// Checks: svg.parse, svg.structure, svg.security (split out of the doc's svg.structure), svg.viewbox, svg.complexity,
// svg.palette, svg.color (currentColor in icons), svg.stroke (per file and across a set), svg.grid (against a grammar),
// svg.a11y, svg.transform, svg.groups, svg.precision, svg.metadata.
import fs from 'node:fs';
import path from 'node:path';
import { walk } from '../core.mjs';
import { parseXML, tagOf, localName, childElements, walkElements, textOf } from './xml.mjs';
import { buildModel, rootViewBox, hrefOf, SHAPES, SVG_NS } from './model.mjs';
import { parseViewBox, parseLength, parsePathData, shapeSegments, nodeCount, decimals, segLength, subpaths, arcToCubics, applyPt, unionBox } from './path.mjs';
import { parseColor, parseDecls, COLOR_PROPS } from './style.mjs';
import { nearestColor } from './grammar.mjs';
import { rasterFormat } from './raster.mjs';

// Thresholds. "doc" = docs/research/mockups-and-vector.md section E; everything else is an inferred cstack default.
// nodesFail: doc ("icon > 300 nodes; mark > 1,500"). nodesWarn: half of that. shapesWarn: Lucide/Material icons use
// fewer than ten elements. colorsWarn: a mark beyond five flat colors rarely survives one-color and small use.
export const LIMITS = {
  icon: { nodesWarn: 150, nodesFail: 300, shapesWarn: 24, colorsWarn: 1 },
  mark: { nodesWarn: 750, nodesFail: 1500, shapesWarn: 200, colorsWarn: 5 },
};
export const PRECISION_TARGET_PX = 1024; // largest raster expected (a 512 app icon at 2x); coordinates need 1/16 px there
export const TINY_SEGMENT = 1 / 1000; // of the canvas: shorter than 1 px at a 1000 px render
export const GRID_TOL = 0.01; // user units of slack in grammar comparisons
export const ICON_MAX_CANVAS = 48; // square viewBoxes up to this size are linted as icons unless told otherwise

export const EDITOR = new Set(['inkscape', 'sodipodi', 'sketch', 'serif', 'i', 'x', 'graph', 'a', 'dc', 'cc', 'rdf', 'krita', 'figma', 'bx', 'vectornator', 'adobe']);
export const HTML = new Set(['iframe', 'embed', 'object', 'audio', 'video', 'canvas', 'html', 'body', 'link', 'meta', 'img', 'input', 'form']);
const ANIM = new Set(['animate', 'animatetransform', 'animatemotion', 'set', 'discard']);
const GEOM_ATTRS = ['x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points', 'transform', 'viewBox', 'stroke-width'];
const NUMRE = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
const URLRE = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;

const r3 = (n) => Math.round(n * 1000) / 1000 || 0;
const fmt = (n) => String(r3(n));
const short = (v, n = 48) => (String(v).length > n ? `${String(v).slice(0, n)}...` : String(v));
const uniq = (a) => [...new Set(a)];
const atLines = (els) => {
  const ls = uniq(els.map((e) => e?.line).filter(Boolean));
  return ls.length ? ` (line${ls.length > 1 ? 's' : ''} ${ls.slice(0, 6).join(', ')}${ls.length > 6 ? ', ...' : ''})` : '';
};
const tally = (vals) => {
  const m = new Map();
  for (const v of vals) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
};
const onShapes = (m) => [...m].map(([v, n]) => `${v} on ${n} shape${n > 1 ? 's' : ''}`).join(', ');
const dominant = (m) => [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
const article = (kind) => (kind === 'icon' ? 'an icon' : 'a mark');

export function refKind(v) {
  const s = String(v).trim();
  if (!s) return 'empty';
  if (s.startsWith('#')) return 'internal';
  if (/^javascript:/i.test(s.replace(/\s+/g, ''))) return 'script';
  if (/^data:image\/(png|jpe?g|gif|webp|avif|bmp)/i.test(s)) return 'raster';
  return 'external';
}

export const urlsIn = (v) => [...String(v).matchAll(URLRE)].map((m) => m[2]);

/** Kind from the drawing alone: a square canvas (viewBox, or width/height) up to ICON_MAX_CANVAS units = icon, else mark. */
export function inferKind(root) {
  const vb = rootViewBox(root);
  return vb && Math.abs(vb.w - vb.h) < 1e-9 && vb.w <= ICON_MAX_CANVAS ? 'icon' : 'mark';
}

function collectRefs(root, css) {
  const refs = new Set();
  walkElements(root, (el) => {
    for (const [k, v] of Object.entries(el.attrs)) {
      if (localName(k) === 'href' && v.startsWith('#')) refs.add(v.slice(1));
      if (k === 'aria-labelledby' || k === 'aria-describedby') for (const id of v.split(/\s+/)) refs.add(id);
      for (const u of urlsIn(v)) if (u.startsWith('#')) refs.add(u.slice(1));
    }
  });
  for (const d of css.decls) for (const u of urlsIn(d.value)) if (u.startsWith('#')) refs.add(u.slice(1));
  return refs;
}

/**
 * Lint one SVG text. opts: {file, kind ('icon'|'mark'; inferred when absent), grammar (loadGrammar), palette (loadPalette)}.
 * Returns {file, kind, findings, metrics} (metrics null when the file does not parse).
 */
export function lintSVG(text, { file = 'input.svg', kind = null, kindSource = null, grammar = null, palette = null } = {}) {
  const findings = [];
  const add = (id, level, detail, line) => findings.push({ id, level, file, ...(line ? { line } : {}), detail });
  let doc;
  try {
    doc = parseXML(text);
  } catch (e) {
    add('svg.parse', 'fail', `not well-formed XML (${e.message}); browsers show an error instead of the image`, e.line);
    return { file, kind: kind ?? 'mark', findings, metrics: null };
  }
  const root = doc.root;
  if (!kind) {
    kind = grammar ? 'icon' : inferKind(root);
    kindSource = grammar ? 'grammar' : 'viewBox';
  }
  const L = LIMITS[kind];

  // ---- structure, namespaces, security ----
  if (tagOf(root) !== 'svg') add('svg.structure', 'fail', `root element is <${root.name}>, not <svg>`, root.line);
  const pfx = root.name.includes(':') ? root.name.split(':')[0] : null;
  if ((pfx ? root.attrs[`xmlns:${pfx}`] : root.attrs.xmlns) !== SVG_NS) add('svg.structure', 'fail', `no xmlns="${SVG_NS}" on the root: as a file, an <img> or a favicon it will not render`, root.line);
  const declared = new Set(['xml', 'xmlns']);
  walkElements(root, (el) => {
    for (const k of Object.keys(el.attrs)) if (k.startsWith('xmlns:')) declared.add(k.slice(6));
  });
  const undeclared = new Map();
  walkElements(root, (el) => {
    for (const n of [el.name, ...Object.keys(el.attrs)]) {
      const i = n.indexOf(':');
      if (i > 0 && !declared.has(n.slice(0, i)) && !undeclared.has(n.slice(0, i))) undeclared.set(n.slice(0, i), el.line);
    }
  });
  for (const [p, line] of undeclared) add('svg.structure', 'fail', `prefix "${p}:" is used but xmlns:${p} is never declared; browsers reject the whole file`, line);
  if (doc.entities) add('svg.security', 'fail', 'DOCTYPE declares entities (entity expansion and external-entity risk): delete the DOCTYPE', doc.doctype.line);
  else if (doc.doctype) add('svg.metadata', 'info', 'DOCTYPE is obsolete for SVG: delete it', doc.doctype.line);
  for (const pi of doc.pis) if (pi.target.toLowerCase() === 'xml-stylesheet') add('svg.security', 'fail', '<?xml-stylesheet?> pulls in an external stylesheet', pi.line);
  for (const is of doc.issues) add('svg.structure', 'warn', is.detail, is.line);

  const sec = (detail, line) => add('svg.security', 'fail', detail, line);
  const editorEls = [];
  const rasters = [];
  const anims = [];
  let editorAttrs = 0;
  walkElements(root, (el) => {
    const tag = tagOf(el);
    if (tag === 'script') sec('<script>: marks and icons never carry code (it runs when the file is opened directly)', el.line);
    else if (tag === 'foreignobject') sec('<foreignObject> embeds HTML: not allowed in a mark or icon', el.line);
    else if (HTML.has(tag)) sec(`<${el.name}> is an HTML element inside the SVG`, el.line);
    if (ANIM.has(tag)) anims.push(el);
    const ep = el.name.includes(':') ? el.name.split(':')[0] : null;
    if (tag === 'metadata' || (ep && EDITOR.has(ep))) editorEls.push(el);
    if (tag === 'image' || tag === 'feimage') {
      const h = hrefOf(el);
      if (h && refKind(h) === 'raster') rasters.push({ el, bytes: Math.round(h.length * 0.75) });
      else if (h && refKind(h) !== 'internal') rasters.push({ el, linked: true });
    }
    for (const [k, v] of Object.entries(el.attrs)) {
      const kl = k.toLowerCase();
      const kp = k.includes(':') ? k.split(':')[0] : null;
      if ((kp && EDITOR.has(kp)) || (kp === 'xmlns' && EDITOR.has(k.slice(6))) || k === 'data-name' || k === 'enable-background') editorAttrs++;
      if (/^on[a-z]/.test(kl)) {
        sec(`event handler ${k}="${short(v, 32)}" on <${el.name}>: scripts are not allowed`, el.line);
        continue;
      }
      const targets = [...(localName(k) === 'href' ? [v] : []), ...urlsIn(v)];
      let reported = false;
      for (const t of targets) {
        const r = refKind(t);
        if (r === 'script') sec(`javascript: URL in ${k} on <${el.name}>`, el.line);
        else if (r === 'external' || (r === 'raster' && !(localName(k) === 'href' && (tag === 'image' || tag === 'feimage'))))
          sec(`external reference ${k}="${short(t)}" on <${el.name}>: blocked in <img> and favicons, and it can track or swap the artwork`, el.line);
        else continue;
        reported = true;
      }
      if (!reported && /^\s*javascript:/i.test(v)) sec(`javascript: in ${k} on <${el.name}>`, el.line);
      if (kl === 'style' && /expression\s*\(|@import/i.test(v)) sec(`style on <${el.name}> uses expression() or @import`, el.line);
    }
  });

  const model = buildModel(doc);
  for (const imp of model.css.imports) sec(`${short(imp)} loads an external stylesheet`);
  for (const d of model.css.decls) {
    for (const u of urlsIn(d.value)) if (refKind(u) !== 'internal') sec(`CSS ${d.prop}: url(${short(u)}) points outside the file`);
    if (/expression\s*\(/i.test(d.value)) sec(`CSS ${d.prop} uses expression()`);
  }
  const size_ = (b) => (b < 1024 ? `${b} B` : `${Math.round(b / 1024)} KB`);
  for (const r of rasters) add('svg.structure', 'fail', r.linked ? `<${r.el.name}> links a raster: a master is vector-only` : `<${r.el.name}> embeds a ${size_(r.bytes)} raster: a master is vector-only (trace or redraw it)`, r.el.line);
  if (model.texts.length) add('svg.structure', 'fail', `${model.texts.length} live <text> element(s): outline the type (fonts differ per machine and favicon renderers)${atLines(model.texts)}`, model.texts[0].line);
  if (anims.length) add('svg.structure', 'info', `${anims.length} animation element(s): keep a static master and animate in code${atLines(anims)}`, anims[0].line);
  for (const u of model.useErrors) add('svg.structure', u.cycle ? 'fail' : 'warn', u.detail, u.el.line);
  for (const s of model.shapes) if (s.error && !s.via) add('svg.structure', 'warn', `path data error: ${s.error.detail}; it renders only up to there`, s.line);
  for (const e of model.empty) if (e.el.attrs.d) add('svg.structure', 'warn', `path data error: ${e.detail}`, e.el.line);
  if (!model.shapes.length && !model.images.length && !model.texts.length) add('svg.structure', 'warn', 'nothing visible renders: no painted shape, image or text', root.line);

  // ---- viewBox and sizing ----
  const vbRaw = root.attrs.viewBox;
  const vb = parseViewBox(vbRaw);
  const W = parseLength(root.attrs.width), H = parseLength(root.attrs.height);
  if (vbRaw == null) add('svg.viewbox', 'fail', W > 0 && H > 0 ? `sized by width/height only (${fmt(W)}x${fmt(H)}): it cannot scale; add viewBox="0 0 ${fmt(W)} ${fmt(H)}"` : 'no viewBox and no size: renderers fall back to 300x150; add a viewBox', root.line);
  else if (!vb) add('svg.viewbox', 'fail', `viewBox="${short(vbRaw)}" is invalid (four numbers, positive width and height)`, root.line);
  else {
    if (kind === 'icon' && Math.abs(vb.w - vb.h) > 1e-9) add('svg.viewbox', 'fail', `icon canvas ${fmt(vb.w)}x${fmt(vb.h)} is not square`, root.line);
    if (W > 0 && H > 0 && Math.abs(W / H - vb.w / vb.h) > 0.01) add('svg.viewbox', 'warn', `width/height ${fmt(W)}x${fmt(H)} do not match the viewBox aspect (${fmt(vb.w)}x${fmt(vb.h)}): the drawing is letterboxed`, root.line);
  }
  const canvas = model.viewBox;
  const size = canvas ? Math.max(canvas.w, canvas.h) : null;

  // ---- complexity (definitions, so a <use>d shape counts once) ----
  let nodes = 0, shapeEls = 0, elements = 0;
  walkElements(root, (el) => {
    elements++;
    const t = tagOf(el);
    if (!SHAPES.has(t)) return;
    shapeEls++;
    const g = shapeSegments(t, el.attrs, canvas ?? { w: 100, h: 100 });
    if (g) nodes += nodeCount(g.segs);
  });
  if (nodes > L.nodesFail) add('svg.complexity', 'fail', `${nodes} path nodes; budget for ${article(kind)} is ${L.nodesFail}: simplify or redraw`);
  else if (nodes > L.nodesWarn) add('svg.complexity', 'warn', `${nodes} path nodes (warn above ${L.nodesWarn}, fail above ${L.nodesFail} for ${article(kind)})`);
  if (shapeEls > L.shapesWarn) add('svg.complexity', 'warn', `${shapeEls} shape elements (warn above ${L.shapesWarn} for ${article(kind)}): merge paths that share a style`);

  // ---- palette ----
  const used = new Map();
  const odd = [];
  const note = (value, prop, line) => {
    const c = parseColor(value);
    if (c?.url != null) return c.fallback && note(c.fallback.hex ?? c.fallback.keyword ?? '', prop, line);
    if (c?.keyword) return;
    if (!c || c.named) return odd.push({ value, prop, line, named: !!c?.named });
    const e = used.get(c.hex) ?? { hex: c.hex, props: new Set(), lines: [] };
    e.props.add(prop);
    if (line) e.lines.push(line);
    used.set(c.hex, e);
  };
  let gradients = 0;
  walkElements(root, (el) => {
    const tag = tagOf(el);
    if (tag === 'mask') return false; // luminance masks are not brand color
    if (tag === 'lineargradient' || tag === 'radialgradient') gradients++;
    for (const p of COLOR_PROPS) if (el.attrs[p] != null) note(el.attrs[p], p, el.line);
    if (el.attrs.style) for (const [p, v] of parseDecls(el.attrs.style)) if (COLOR_PROPS.has(p)) note(v, p, el.line);
  });
  for (const d of model.css.decls) if (COLOR_PROPS.has(d.prop)) note(d.value, `${d.prop} in ${d.conditional ? 'conditional ' : ''}CSS`, null);
  const hexes = [...used.keys()];
  if (palette)
    for (const e of used.values())
      if (!palette.colors.has(e.hex)) {
        const near = nearestColor(e.hex, palette.colors);
        add('svg.palette', 'fail', `${e.hex} (${[...e.props].join(', ')}) is not in the palette${near ? `; nearest ${near.names[0]} ${near.hex} (dE ${near.de})` : ''}`, e.lines[0]);
      }
  for (const o of odd) add('svg.palette', o.named && palette ? 'fail' : 'warn', o.named ? `named color "${o.value}" (${o.prop}): use the token hex` : `color "${short(o.value)}" (${o.prop}) is not parseable here: use sRGB hex from the tokens`, o.line);
  if (palette && kind === 'mark' && !palette.colors.has('#000000')) {
    const black = model.shapes.filter((sh) => sh.filled && sh.fillImplicit);
    if (black.length) add('svg.palette', 'warn', `${black.length} shape(s) have no fill and render black (#000000), which is not in the palette: set the token color${atLines(black)}`, black[0].line);
  }
  const oneColor = /(^|[-_.\s])(mono|monochrome|one-?colou?r|1c|single-?colou?r|knockout|reversed?)([-_.\s]|$)/i.test(path.basename(file).replace(/\.svg$/i, ''));
  if (oneColor) {
    if (gradients) add('svg.palette', 'fail', `${gradients} gradient(s) in a one-color variant`);
    if (hexes.length > 1) add('svg.palette', 'fail', `${hexes.length} colors in a one-color variant (${hexes.join(', ')})`);
  } else if (kind === 'mark') {
    if (hexes.length > L.colorsWarn) add('svg.palette', 'warn', `${hexes.length} distinct colors (warn above ${L.colorsWarn}): check the one-color version still reads`);
    if (gradients) add('svg.palette', 'info', `${gradients} gradient(s): ship a flat one-color variant for favicons, stamps, embroidery and print`);
  }

  // ---- currentColor (icons) ----
  if (kind === 'icon') {
    const explicit = [];
    let current = 0, implicit = 0;
    for (const s of model.shapes) {
      for (const [prop, p, on] of [['fill', s.fill, s.filled], ['stroke', s.stroke, s.stroked]]) {
        if (!on) continue;
        if (p.kind === 'currentcolor') current++;
        else if (prop === 'fill' && s.fillImplicit) implicit++;
        else explicit.push({ s, label: `${prop} ${p.raw}` });
      }
    }
    if (explicit.length) add('svg.color', 'warn', `${uniq(explicit.map((e) => e.label)).join(', ')} on ${explicit.length} shape(s): icons paint with currentColor so they follow the text color${atLines(explicit.map((e) => e.s))}`, explicit[0].s.line);
    if (implicit) add('svg.color', 'warn', current || explicit.length ? `${implicit} shape(s) have no fill and fall back to black: set fill="currentColor" or fill="none"` : 'no currentColor: unpainted shapes fall back to black; set fill="currentColor" (or stroke) on the root', root.line);
    const pinned = [];
    walkElements(root, (el) => {
      const decl = el.attrs.color ?? parseDecls(el.attrs.style).find(([p]) => p === 'color')?.[1];
      if (decl && parseColor(decl)?.hex) pinned.push(el);
    });
    if (pinned.length) add('svg.color', 'warn', `color is set inside the icon${atLines(pinned)}: currentColor no longer follows the page`, pinned[0].line);
  }

  // ---- strokes ----
  const stroked = model.shapes.filter((s) => s.stroked);
  const scaled = stroked.filter((s) => !s.nonScaling);
  const fillOnly = model.shapes.filter((s) => s.filled && !s.stroked);
  const widths = tally(scaled.map((s) => r3(s.strokeWidth * s.scale)));
  const caps = tally(stroked.map((s) => s.style['stroke-linecap']));
  const joins = tally(stroked.map((s) => s.style['stroke-linejoin']));
  const mixLevel = kind === 'icon' ? 'warn' : 'info';
  const firstOff = (list, key, m) => list.find((s) => key(s) !== dominant(m))?.line;
  if (widths.size > 1) add('svg.stroke', mixLevel, `mixed stroke widths in one ${kind}: ${onShapes(widths)}`, firstOff(scaled, (s) => r3(s.strokeWidth * s.scale), widths));
  if (caps.size > 1) add('svg.stroke', mixLevel, `mixed stroke-linecap: ${onShapes(caps)}`, firstOff(stroked, (s) => s.style['stroke-linecap'], caps));
  if (joins.size > 1) add('svg.stroke', mixLevel, `mixed stroke-linejoin: ${onShapes(joins)}`, firstOff(stroked, (s) => s.style['stroke-linejoin'], joins));
  if (kind === 'icon' && stroked.length && fillOnly.length) add('svg.stroke', grammar?.stroke != null ? 'warn' : 'info', `fill vs stroke mixing: ${fillOnly.length} filled shape(s) among ${stroked.length} stroked; outline sets draw dots as zero-length round-cap strokes${atLines(fillOnly)}`, fillOnly[0].line);
  if (scaled.length < stroked.length) add('svg.stroke', grammar ? 'warn' : 'info', `${stroked.length - scaled.length} stroke(s) use vector-effect="non-scaling-stroke": the width is fixed in px, so it cannot be checked against the canvas`);
  const toGrammar = (w) => (grammar?.canvas && canvas ? (w * grammar.canvas) / canvas.w : w);
  if (grammar && kind === 'icon') {
    if (grammar.stroke != null) {
      for (const [w, n] of widths) if (Math.abs(toGrammar(w) - grammar.stroke) > GRID_TOL) add('svg.stroke', 'fail', `stroke-width ${fmt(toGrammar(w))} on ${n} shape(s); grammar says ${fmt(grammar.stroke)}`, scaled.find((s) => r3(s.strokeWidth * s.scale) === w)?.line);
      if (!stroked.length && fillOnly.length) add('svg.stroke', 'warn', `no stroked shapes, but the grammar declares a ${fmt(grammar.stroke)} stroke`);
    }
    if (grammar.linecap) for (const [c, n] of caps) if (c !== grammar.linecap) add('svg.stroke', 'fail', `stroke-linecap ${c} on ${n} shape(s); grammar says ${grammar.linecap}`, stroked.find((s) => s.style['stroke-linecap'] === c)?.line);
    if (grammar.linejoin) for (const [j, n] of joins) if (j !== grammar.linejoin) add('svg.stroke', 'fail', `stroke-linejoin ${j} on ${n} shape(s); grammar says ${grammar.linejoin}`, stroked.find((s) => s.style['stroke-linejoin'] === j)?.line);
  }

  // ---- grid and keylines (grammar) ----
  const ink = model.shapes.reduce((b, s) => unionBox(b, s.inkBox), null);
  if (grammar && kind === 'icon' && canvas) {
    if (grammar.canvas != null && (Math.abs(canvas.w - grammar.canvas) > 1e-9 || Math.abs(canvas.h - grammar.canvas) > 1e-9)) add('svg.grid', 'fail', `canvas ${fmt(canvas.w)}x${fmt(canvas.h)}; grammar says ${fmt(grammar.canvas)}x${fmt(grammar.canvas)}`, root.line);
    if (canvas.x || canvas.y) add('svg.grid', 'fail', `viewBox origin is ${fmt(canvas.x)} ${fmt(canvas.y)}; the grid starts at 0 0`, root.line);
    if (grammar.padding != null && ink) {
      const margins = { left: ink.x0 - canvas.x, top: ink.y0 - canvas.y, right: canvas.x + canvas.w - ink.x1, bottom: canvas.y + canvas.h - ink.y1 };
      const bad = Object.entries(margins).filter(([, v]) => v < grammar.padding - GRID_TOL);
      if (bad.length) add('svg.grid', 'fail', `ink (stroke included) comes within ${bad.map(([k, v]) => `${fmt(v)} of the ${k}`).join(', ')} edge; grammar padding is ${fmt(grammar.padding)} (live area ${fmt(canvas.w - 2 * grammar.padding)})`);
    }
    if (grammar.radii.length) {
      const off = [];
      const ok = (r) => grammar.radii.some((g) => Math.abs(g - r) <= GRID_TOL);
      for (const s of model.shapes) {
        if (s.tag === 'rect' && s.radius && (s.el.attrs.rx != null || s.el.attrs.ry != null)) for (const r of uniq([s.radius.rx, s.radius.ry].map((v) => r3(v * s.scale)))) if (!ok(r)) off.push({ s, r });
        for (const seg of s.segs) {
          if (seg.t !== 'A' || seg.shape) continue;
          const { r } = arcToCubics(seg);
          // a corner: a circular quarter arc smaller than a quarter of the canvas
          if (r && Math.abs(r.rx - r.ry) < GRID_TOL && Math.abs(r.sweepDeg - 90) < 3 && r.rx * s.scale < (grammar.canvas ?? canvas.w) / 4 && !ok(r3(r.rx * s.scale))) off.push({ s, r: r3(r.rx * s.scale) });
        }
      }
      if (off.length) add('svg.grid', 'warn', `corner radius ${uniq(off.map((o) => fmt(o.r))).join(', ')} is not in the grammar (${grammar.radii.join(', ')})${atLines(off.map((o) => o.s))}`, off[0].s.line);
    }
    if (grammar.snap) {
      const offgrid = [];
      for (const s of model.shapes)
        for (const seg of s.segs) {
          if (seg.t === 'Z') continue;
          for (const v of applyPt(s.ctm, seg.x, seg.y)) if (Math.abs(v / grammar.snap - Math.round(v / grammar.snap)) * grammar.snap > GRID_TOL) offgrid.push({ s, v });
        }
      if (offgrid.length) add('svg.grid', 'fail', `${offgrid.length} coordinate(s) off the ${fmt(grammar.snap)} grid (first: ${fmt(offgrid[0].v)})${atLines(offgrid.map((o) => o.s))}`, offgrid[0].s.line);
    }
  }

  // ---- accessibility ----
  const kids = childElements(root);
  const titleEl = kids.find((c) => tagOf(c) === 'title');
  const hasTitle = !!(titleEl && textOf(titleEl).trim());
  const ariaHidden = String(root.attrs['aria-hidden']).toLowerCase() === 'true';
  const labelled = hasTitle || root.attrs['aria-label'] || root.attrs['aria-labelledby'];
  if (kind === 'mark' && !ariaHidden) {
    if (!labelled) add('svg.a11y', 'warn', 'no <title>: a standalone mark needs an accessible name (first child of <svg>)', root.line);
    if (root.attrs.role !== 'img') add('svg.a11y', 'warn', 'role="img" is missing on <svg>: screen readers may skip or misread the graphic', root.line);
    if (hasTitle && !root.attrs['aria-labelledby']) add('svg.a11y', 'info', 'point aria-labelledby at the <title> id for the most reliable announcement', root.line);
  } else if (kind === 'icon' && !ariaHidden && !(labelled && root.attrs.role === 'img')) add('svg.a11y', 'info', 'icon is neither aria-hidden="true" (decorative) nor labelled (role="img" with <title>); decide where it is used', root.line);
  if (titleEl && kids[0] !== titleEl) add('svg.a11y', 'info', '<title> is not the first child of <svg>', titleEl.line);

  // ---- transforms and stray groups ----
  const tShapes = model.transforms.filter((t) => t.shape).map((t) => t.el);
  const tGroups = model.transforms.filter((t) => !t.shape).map((t) => t.el);
  if (tShapes.length) add('svg.transform', 'warn', `transform on ${tShapes.length} shape(s): flatten it into the coordinates${atLines(tShapes)}`, tShapes[0].line);
  if (tGroups.length) add('svg.transform', kind === 'icon' ? 'warn' : 'info', `transform on ${tGroups.length} group/use element(s): flatten it${kind === 'icon' ? ' (grid checks read coordinates)' : ' for a master'}${atLines(tGroups)}`, tGroups[0].line);
  for (const el of model.badTransforms) add('svg.transform', 'warn', `transform="${short(el.attrs.transform)}" is malformed; browsers ignore it`, el.line);
  if (model.css.decls.some((d) => d.prop === 'transform')) add('svg.transform', 'warn', 'CSS transform in a stylesheet: not applied by these checks; use the attribute or flatten it');
  const refs = collectRefs(root, model.css);
  const emptyG = [], wrapper = [], unused = [];
  let depth = 0;
  walkElements(root, (el, parent, d) => {
    depth = Math.max(depth, d);
    const tag = tagOf(el);
    if (tag === 'defs') for (const c of childElements(el)) if (!c.attrs.id || !refs.has(c.attrs.id)) unused.push(c);
    if (tag !== 'g') return;
    const ch = childElements(el);
    if (!ch.length && !(el.attrs.id && refs.has(el.attrs.id))) emptyG.push(el);
    else if (ch.length === 1 && !Object.keys(el.attrs).length) wrapper.push(el);
  });
  if (emptyG.length) add('svg.groups', 'warn', `${emptyG.length} empty <g>: delete${atLines(emptyG)}`, emptyG[0].line);
  if (wrapper.length) add('svg.groups', 'info', `${wrapper.length} <g> without attributes around a single element: unwrap${atLines(wrapper)}`, wrapper[0].line);
  if (model.hidden.length) add('svg.groups', 'warn', `${model.hidden.length} invisible element(s) (${uniq(model.hidden.map((h) => h.why)).join(', ')}): dead weight or a forgotten layer${atLines(model.hidden.map((h) => h.el))}`, model.hidden[0].el.line);
  const emptyShapes = model.empty.filter((e) => !e.el.attrs.d);
  if (emptyShapes.length) add('svg.groups', 'warn', `${emptyShapes.length} empty shape(s) (no geometry or zero size)${atLines(emptyShapes.map((e) => e.el))}`, emptyShapes[0].el.line);
  if (unused.length) add('svg.groups', 'info', `${unused.length} unused definition(s) in <defs>${atLines(unused)}`, unused[0].line);
  if (depth > 6) add('svg.groups', 'info', `elements nest ${depth} levels deep: flatten the structure`);

  // ---- precision and tiny segments ----
  let maxDec = 0;
  const seeDecimals = (toks) => {
    for (const t of toks) maxDec = Math.max(maxDec, decimals(t));
  };
  walkElements(root, (el) => {
    if (tagOf(el) === 'path' && el.attrs.d) seeDecimals(parsePathData(el.attrs.d).numbers);
    for (const k of GEOM_ATTRS) if (el.attrs[k] != null) seeDecimals(String(el.attrs[k]).match(NUMRE) ?? []);
  });
  const need = size ? Math.max(0, Math.ceil(Math.log10((16 * PRECISION_TARGET_PX) / size))) : 3;
  if (maxDec > need + 1) add('svg.precision', 'warn', `coordinates carry up to ${maxDec} decimals; ${need} keep 1/16 px at ${PRECISION_TARGET_PX} px on this ${fmt(size ?? 0)}-unit canvas: round them`);
  else if (maxDec > need) add('svg.precision', 'info', `up to ${maxDec} decimals; ${need} are enough at ${PRECISION_TARGET_PX} px`);
  const tinyLen = (size ?? 100) * TINY_SEGMENT;
  const tinyEls = [];
  let tiny = 0;
  for (const s of model.shapes) {
    if (s.via) continue;
    for (const sp of subpaths(s.segs)) {
      const draw = sp.segs.filter((x) => x.t !== 'M' && x.t !== 'Z');
      if (draw.length <= 1) continue; // a lone short segment with round caps is the dot idiom ("M12 17h.01")
      for (const seg of draw)
        if (segLength(seg) * s.scale < tinyLen) {
          tiny++;
          tinyEls.push(s);
        }
    }
  }
  if (tiny) add('svg.precision', 'warn', `${tiny} segment(s) shorter than ${fmt(tinyLen)} units (under 1 px at 1000 px): node noise from tracing or boolean ops; simplify${atLines(tinyEls)}`, tinyEls[0].line);

  // ---- export noise ----
  const noise = [editorEls.length && `${editorEls.length} editor/metadata element(s)`, editorAttrs && `${editorAttrs} editor attribute(s)`, doc.comments && `${doc.comments} comment(s)`].filter(Boolean);
  if (noise.length) add('svg.metadata', 'info', `${noise.join(', ')}: export noise (svg kit writes a cleaned copy)`);

  const strokeOnly = model.shapes.filter((s) => s.stroked && !s.filled).length;
  const mode = !model.shapes.length ? 'empty' : strokeOnly === model.shapes.length ? 'stroke' : fillOnly.length === model.shapes.length ? 'fill' : 'mixed';
  const metrics = {
    kind,
    kind_source: kindSource ?? 'flag',
    viewBox: canvas ? { x: canvas.x, y: canvas.y, w: canvas.w, h: canvas.h, ...(canvas.implied ? { implied: true } : {}) } : null,
    elements,
    shapes: shapeEls,
    painted: model.shapes.length,
    nodes,
    colors: hexes,
    gradients,
    mode,
    stroke: { widths: [...widths.keys()], linecaps: [...caps.keys()], linejoins: [...joins.keys()], dominant: { width: dominant(widths), linecap: dominant(caps), linejoin: dominant(joins) } },
    max_decimals: maxDec,
    tiny_segments: tiny,
    ink_box: ink ? { x0: r3(ink.x0), y0: r3(ink.y0), x1: r3(ink.x1), y1: r3(ink.y1) } : null,
  };
  return { file, kind, findings, metrics };
}

const LEVEL_ORDER = { fail: 0, warn: 1, info: 2 };

/** Expand files and directories (recursive) into sorted .svg paths. */
export function svgFiles(inputs) {
  const out = [];
  for (const p of inputs) {
    if (!fs.existsSync(p)) throw new Error(`not found: ${p}`);
    if (fs.statSync(p).isDirectory()) out.push(...walk(p, (f) => /\.svg$/i.test(f)).sort());
    else out.push(p);
  }
  return uniq(out);
}

/**
 * Lint files as one run. Three or more icons with the same square canvas are treated as a set; a set is also checked
 * for consistency (stroke width, caps, joins, fill vs stroke, canvas) by majority, unless the grammar fixes the value.
 * opts: {kind, grammar, palette, display: (path) => label}. Returns {ok, kind, grammar, palette, files, findings, counts}.
 */
export function lintFiles(inputs, { kind = null, grammar = null, palette = null, display = (p) => p } = {}) {
  const files = svgFiles(inputs);
  if (!files.length) throw new Error(`no .svg files in ${inputs.join(', ')}`);
  const bufs = files.map((f) => fs.readFileSync(f));
  const texts = bufs.map((b) => b.toString('utf8'));
  let setKind = kind, source = kind ? 'flag' : null;
  if (!setKind && grammar) [setKind, source] = ['icon', 'grammar'];
  if (!setKind && files.length >= 3) {
    const boxes = texts.map((t) => {
      try {
        return parseViewBox(parseXML(t).root.attrs.viewBox);
      } catch {
        return null;
      }
    });
    if (boxes.every((b) => b && Math.abs(b.w - b.h) < 1e-9 && Math.abs(b.w - boxes[0].w) < 1e-9)) [setKind, source] = ['icon', 'set'];
  }
  const results = files.map((f, i) => {
    const raster = rasterFormat(bufs[i]);
    if (!raster) return lintSVG(texts[i], { file: display(f), kind: setKind, kindSource: source, grammar, palette });
    const detail = `${raster.toUpperCase()} raster, not SVG: a master is vector (redraw it; svg reduce can still test the raster at small sizes)`;
    return { file: display(f), kind: setKind ?? 'mark', findings: [{ id: 'svg.parse', level: 'fail', file: display(f), detail }], metrics: null };
  });
  const findings = results.flatMap((r) => r.findings);
  const icons = results.filter((r) => r.kind === 'icon' && r.metrics);
  if (icons.length >= 2) {
    const where = display(inputs.length === 1 ? inputs[0] : path.dirname(files[0]));
    const canvasRef = grammar?.canvas ?? dominant(tally(icons.map((r) => r.metrics.viewBox?.w).filter(Boolean)));
    const sig = (r) => {
      const d = r.metrics.stroke.dominant;
      const w = d.width != null && r.metrics.viewBox && canvasRef ? r3((d.width * canvasRef) / r.metrics.viewBox.w) : d.width;
      return { mode: r.metrics.mode === 'empty' ? null : r.metrics.mode, width: w, linecap: d.linecap, linejoin: d.linejoin, canvas: r.metrics.viewBox?.w ?? null };
    };
    const sigs = icons.map((r) => [r, sig(r)]);
    const fixed = { width: grammar?.stroke != null, linecap: !!grammar?.linecap, linejoin: !!grammar?.linejoin, canvas: grammar?.canvas != null, mode: false };
    const label = { mode: 'drawing mode', width: 'stroke-width', linecap: 'stroke-linecap', linejoin: 'stroke-linejoin', canvas: 'canvas' };
    const id = { mode: 'svg.stroke', width: 'svg.stroke', linecap: 'svg.stroke', linejoin: 'svg.stroke', canvas: 'svg.viewbox' };
    for (const k of ['mode', 'width', 'linecap', 'linejoin', 'canvas']) {
      if (fixed[k]) continue;
      const have = sigs.filter(([, s]) => s[k] != null);
      const t = tally(have.map(([, s]) => s[k]));
      if (t.size < 2) continue;
      const ranked = [...t].sort((a, b) => b[1] - a[1]);
      if (ranked[0][1] === ranked[1][1]) {
        findings.push({ id: id[k], level: 'fail', file: where, detail: `icon set has no majority ${label[k]}: ${ranked.map(([v]) => `${v} (${have.filter(([, s]) => s[k] === v).map(([r]) => path.basename(r.file)).join(', ')})`).join('; ')}` });
        continue;
      }
      const [maj, n] = ranked[0];
      for (const [r, s] of have) if (s[k] !== maj) findings.push({ id: id[k], level: 'fail', file: r.file, detail: `${label[k]} ${s[k]} differs from the set: ${maj} in ${n} of ${have.length} icons${k === 'width' && canvasRef ? ` (widths on a ${fmt(canvasRef)} canvas)` : ''}` });
    }
  }
  findings.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
  const counts = { fail: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.level]++;
  return {
    ok: counts.fail === 0,
    kind: setKind ?? 'per-file',
    kind_source: source ?? 'viewBox',
    grammar: grammar ? { source: display(grammar.source), ...Object.fromEntries(Object.entries(grammar).filter(([k]) => k !== 'source')) } : null,
    palette: palette ? { source: palette.source, colors: [...palette.colors.keys()] } : null,
    files: results.map((r) => ({ file: r.file, kind: r.kind, metrics: r.metrics })),
    findings,
    counts,
  };
}

export function formatLint(rep) {
  const kinds = tally(rep.files.map((f) => f.kind));
  const head = [`svg lint: ${rep.files.length} file${rep.files.length === 1 ? '' : 's'}`, `kind ${[...kinds.keys()].join('+')}${rep.kind_source === 'flag' ? '' : ` (${rep.kind_source === 'set' ? 'icon set by shared canvas' : rep.kind_source === 'grammar' ? 'grammar given' : 'by viewBox; --kind overrides'})`}`];
  if (rep.grammar) head.push(`grammar ${rep.grammar.source}`);
  head.push(rep.palette ? `palette ${rep.palette.source} (${rep.palette.colors.length} colors)` : 'palette: none (pass --palette)');
  const w = Math.max(12, ...rep.findings.map((f) => f.id.length));
  const lines = [head.join(' · ')];
  for (const f of rep.findings) lines.push(`${f.level.toUpperCase().padEnd(4)} ${f.id.padEnd(w)} ${f.file}${f.line ? `:${f.line}` : ''}  ${f.detail}`);
  lines.push(`svg lint: ${rep.ok ? 'PASS' : 'FAIL'} (${rep.counts.fail} fail, ${rep.counts.warn} warn, ${rep.counts.info} info)`);
  return lines.join('\n');
}
