// SVG rewrites for rendering and export, always on a clone (inputs are never modified): a sized copy for the
// rasterizer, a one-color copy, a cleaned copy for favicon.svg, and a wrapper that places a mark on a square canvas.
import { cloneNode, tagOf, walkElements, serialize } from './xml.mjs';
import { rootViewBox, hrefOf, unit01, SVG_NS } from './model.mjs';
import { parseDecls } from './style.mjs';
import { EDITOR, HTML, refKind, urlsIn } from './lint.mjs';

const XLINK_NS = 'http://www.w3.org/1999/xlink';
const fmt = (n) => String(Math.round(n * 10000) / 10000);
const vbString = (vb) => `${fmt(vb.x)} ${fmt(vb.y)} ${fmt(vb.w)} ${fmt(vb.h)}`;

function ensureNamespaces(r) {
  if (!r.name.includes(':') && !r.attrs.xmlns) r.attrs.xmlns = SVG_NS;
  let xlink = false;
  walkElements(r, (el) => {
    if (Object.keys(el.attrs).some((k) => k.startsWith('xlink:'))) xlink = true;
  });
  if (xlink && !r.attrs['xmlns:xlink']) r.attrs['xmlns:xlink'] = XLINK_NS;
  return r;
}

/** The root at exactly w x h px (viewBox kept or derived from width/height). `color` sets currentColor when the file does not. */
export function sizedRoot(root, w, h, { color } = {}) {
  const r = ensureNamespaces(cloneNode(root));
  const vb = rootViewBox(root);
  if (vb && !r.attrs.viewBox) r.attrs.viewBox = vbString(vb);
  r.attrs.width = String(w);
  r.attrs.height = String(h);
  if (color && r.attrs.color == null) r.attrs.color = color;
  return r;
}
export const sizedSVG = (root, w, h, opts) => serialize(sizedRoot(root, w, h, opts), { indent: '' });

const isNone = (v) => /^\s*(none|transparent)\s*$/i.test(String(v));

function monoDecls(text, paint) {
  const out = [];
  for (const [p, v] of parseDecls(text)) {
    if (p === 'fill' || p === 'stroke') out.push([p, isNone(v) ? v : paint]);
    else if (p === 'stop-color' || p === 'flood-color') out.push([p, paint]);
    else if (p === 'color') {
      if (paint !== 'currentColor') out.push([p, paint]);
    }
    else if (p === 'opacity' || p === 'fill-opacity' || p === 'stroke-opacity' || p === 'stop-opacity') {
      if (unit01(v) === 0) out.push(p === 'opacity' ? ['display', 'none'] : [p.replace('-opacity', ''), 'none']);
    } else out.push([p, v]);
  }
  return out.map(([p, v]) => `${p}:${v}`).join(';');
}

/**
 * One-color copy: every fill, stroke, stop and flood becomes `paint` (default black; 'currentColor' for an inline
 * monochrome file) and tints are removed, so it shows what a one-color reproduction keeps. Masks keep their luminance.
 */
export function monoRoot(root, paint = '#000000') {
  const r = ensureNamespaces(cloneNode(root));
  walkElements(r, (el) => {
    const tag = tagOf(el);
    if (tag === 'mask' || tag === 'clippath') return false;
    for (const p of ['fill', 'stroke']) if (el.attrs[p] != null && !isNone(el.attrs[p])) el.attrs[p] = paint;
    for (const p of ['stop-color', 'flood-color']) if (el.attrs[p] != null) el.attrs[p] = paint;
    if (el.attrs.color != null) {
      if (paint === 'currentColor') delete el.attrs.color;
      else el.attrs.color = paint;
    }
    for (const p of ['opacity', 'fill-opacity', 'stroke-opacity', 'stop-opacity']) {
      if (el.attrs[p] == null) continue;
      if (unit01(el.attrs[p]) === 0) {
        if (p === 'opacity') el.attrs.display = 'none';
        else el.attrs[p.replace('-opacity', '')] = 'none';
      }
      delete el.attrs[p];
    }
    if (el.attrs.style) el.attrs.style = monoDecls(el.attrs.style, paint);
    if (tag === 'style')
      for (const c of el.children)
        if (c.type === 'text')
          c.value = c.value.replace(/\{([^{}]*)\}/g, (m, body) => `{${monoDecls(body, paint)}}`);
  });
  if (paint === 'currentColor') {
    if (r.attrs.fill == null) r.attrs.fill = 'currentColor';
  } else r.attrs.color = paint;
  return r;
}

/**
 * Cleaned copy for favicon.svg: no scripts, handlers, foreignObject, HTML, external references, editor metadata or
 * empty groups; namespaces fixed; viewBox kept (derived from width/height when missing) and fixed width/height
 * dropped so it scales. Geometry and paint are untouched. Returns {root, removed: [descriptions]}.
 */
export function cleanRoot(root) {
  const r = cloneNode(root);
  const removed = [];
  const cleanAttrs = (el) => {
    for (const [k, v] of Object.entries(el.attrs)) {
      const pfx = k.includes(':') ? k.split(':')[0] : null;
      const targets = [...(k === 'href' || k === 'xlink:href' ? [v] : []), ...urlsIn(v)];
      const bad = targets.some((t) => !['internal', 'raster'].includes(refKind(t))) || /^\s*javascript:/i.test(v);
      let why;
      if (/^on[a-z]/i.test(k)) why = `${k} handler on <${el.name}>`;
      else if (bad) why = `${k}="${String(v).slice(0, 40)}" on <${el.name}> (external or script reference)`;
      else if ((pfx && EDITOR.has(pfx)) || (pfx === 'xmlns' && EDITOR.has(k.slice(6))) || k === 'data-name' || k === 'enable-background') why = '';
      else continue;
      if (why) removed.push(why);
      delete el.attrs[k];
    }
    if (el.attrs.style) {
      const kept = parseDecls(el.attrs.style).filter(([p, v]) => p !== 'enable-background' && !/expression\s*\(|@import/i.test(v) && urlsIn(v).every((u) => refKind(u) === 'internal'));
      if (kept.length) el.attrs.style = kept.map(([p, v]) => `${p}:${v}`).join(';');
      else delete el.attrs.style;
    }
  };
  const prune = (el) => {
    const keepWs = ['text', 'tspan', 'textpath', 'style'].includes(tagOf(el));
    for (const c of el.children) if (c.type === 'el') cleanAttrs(c);
    el.children = el.children.filter((c) => {
      if (c.type === 'text') return keepWs || c.value.trim();
      const tag = tagOf(c);
      const pfx = c.name.includes(':') ? c.name.split(':')[0] : null;
      if (tag === 'script' || tag === 'foreignobject' || HTML.has(tag)) {
        removed.push(`<${c.name}>`);
        return false;
      }
      if (tag === 'metadata' || (pfx && EDITOR.has(pfx))) return false;
      if ((tag === 'image' || tag === 'feimage') && refKind(hrefOf(c) ?? '') !== 'raster') {
        removed.push(`<${c.name}> with an external source`);
        return false;
      }
      if (tag === 'use' && !hrefOf(c)) {
        removed.push('<use> left without a reference');
        return false;
      }
      return true;
    });
    for (const c of el.children) if (c.type === 'el') prune(c);
    if (tagOf(el) === 'style') for (const c of el.children) if (c.type === 'text' && /@import|url\(\s*['"]?(?!#)/i.test(c.value)) {
      c.value = c.value.replace(/@import[^;]*;?/gi, '').replace(/url\(\s*(['"]?)(?!#)[^)]*\1\s*\)/gi, 'none');
      removed.push('external url()/@import in <style>');
    }
  };
  cleanAttrs(r);
  prune(r);
  let changed = true;
  while (changed) {
    changed = false;
    walkElements(r, (el) => {
      const before = el.children.length;
      el.children = el.children.filter((c) => !(c.type === 'el' && tagOf(c) === 'g' && !c.children.some((k) => k.type === 'el') && c.attrs.id == null));
      if (el.children.length !== before) changed = true;
    });
  }
  const vb = rootViewBox(root);
  if (vb && !r.attrs.viewBox) r.attrs.viewBox = vbString(vb);
  if (r.attrs.viewBox) {
    delete r.attrs.width;
    delete r.attrs.height;
  }
  let hasText = false;
  walkElements(r, (el) => {
    if (tagOf(el) === 'text') hasText = true;
  });
  for (const k of ['version', 'x', 'y', ...(hasText ? [] : ['xml:space']), 'xmlns:xlink']) delete r.attrs[k];
  ensureNamespaces(r);
  return { root: r, removed };
}

/**
 * Place a mark on a square canvas: optional background, the mark's viewBox fit (meet) into a box of `box` px centered
 * at the canvas center. Returns the wrapper root (serialize it to render).
 */
export function placedRoot(root, size, { box = size, background = null } = {}) {
  const inner = ensureNamespaces(cloneNode(root));
  const vb = rootViewBox(root);
  if (vb && !inner.attrs.viewBox) inner.attrs.viewBox = vbString(vb);
  const off = (size - box) / 2;
  Object.assign(inner.attrs, { x: fmt(off), y: fmt(off), width: fmt(box), height: fmt(box) });
  delete inner.attrs.xmlns;
  const children = [];
  if (background) children.push({ type: 'el', name: 'rect', attrs: Object.assign(Object.create(null), { width: String(size), height: String(size), fill: background }), children: [] });
  children.push(inner);
  const wrapAttrs = Object.assign(Object.create(null), { xmlns: SVG_NS, width: String(size), height: String(size), viewBox: `0 0 ${size} ${size}` });
  if (inner.attrs['xmlns:xlink']) wrapAttrs['xmlns:xlink'] = inner.attrs['xmlns:xlink'];
  return { type: 'el', name: 'svg', attrs: wrapAttrs, children };
}
