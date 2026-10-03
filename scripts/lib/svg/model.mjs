// The render model the SVG checks share: every painted shape with its computed style, transform (CTM), absolute
// segments and exact bbox, plus hidden and empty elements, transforms, <use> problems, text and images.
// <use> is expanded (cycles and depth > 8 are reported, not followed); nested <svg> and <symbol> viewports assume
// the default preserveAspectRatio (xMidYMid meet). Clip paths and masks are ignored, so boxes can be larger than ink.
import { tagOf, textOf, childElements, walkElements } from './xml.mjs';
import { shapeSegments, toCubics, transformCubics, bboxOf, strokeBox, unionBox, parseTransform, multiply, IDENTITY, scaleOf, parseLength, parseViewBox } from './path.mjs';
import { readCSS, declaredStyle, computeStyle, paintOf } from './style.mjs';

export const SVG_NS = 'http://www.w3.org/2000/svg';
export const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
export const NON_RENDERED = new Set(['defs', 'symbol', 'clippath', 'mask', 'pattern', 'marker', 'lineargradient', 'radialgradient', 'filter', 'metadata', 'title', 'desc', 'style', 'script', 'foreignobject', 'font', 'font-face', 'cursor', 'view']);
export const hrefOf = (el) => el.attrs.href ?? el.attrs['xlink:href'] ?? null;

// Opacity-like values: numbers or percentages, clamped to 0..1; unparsable values are ignored (1), as browsers do.
export function unit01(v) {
  const s = String(v ?? '').trim();
  const n = s.endsWith('%') ? parseFloat(s) / 100 : parseFloat(s);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
}

function viewportMatrix(vb, x, y, w, h) {
  if (!vb || !(w > 0) || !(h > 0)) return [1, 0, 0, 1, x, y];
  const s = Math.min(w / vb.w, h / vb.h);
  return [s, 0, 0, s, x + (w - vb.w * s) / 2 - vb.x * s, y + (h - vb.h * s) / 2 - vb.y * s];
}

/** Root viewBox, or one implied by width/height ({implied: true}), or null. */
export function rootViewBox(root) {
  const vb = parseViewBox(root.attrs.viewBox);
  if (vb) return vb;
  const w = parseLength(root.attrs.width), h = parseLength(root.attrs.height);
  return w > 0 && h > 0 ? { x: 0, y: 0, w, h, implied: true } : null;
}

export function buildModel(doc) {
  const root = doc.root;
  const styleText = [];
  const ids = new Map();
  walkElements(root, (el) => {
    if (tagOf(el) === 'style') styleText.push(textOf(el));
    if (el.attrs.id != null && !ids.has(el.attrs.id)) ids.set(el.attrs.id, el);
  });
  const css = readCSS(styleText.join('\n'));
  const viewBox = rootViewBox(root);
  const ref = viewBox ?? { x: 0, y: 0, w: 100, h: 100 };
  const diag = Math.hypot(ref.w, ref.h) / Math.SQRT2;
  const m = { root, css, ids, viewBox, shapes: [], hidden: [], empty: [], transforms: [], badTransforms: [], useErrors: [], texts: [], textRuns: [], images: [] };

  const visit = (el, parentStyle, ctm, opacity, ctx) => {
    const tag = tagOf(el);
    const style = computeStyle(declaredStyle(el, tag, css), parentStyle);
    if (NON_RENDERED.has(tag) && !(tag === 'symbol' && ctx.symbol === el)) return;
    const own = !ctx.via;
    if (style.display === 'none') {
      if (own) m.hidden.push({ el, why: 'display="none"' });
      return;
    }
    let M = ctm;
    if (el.attrs.transform != null) {
      const t = parseTransform(el.attrs.transform);
      if (!t) {
        if (own) m.badTransforms.push(el);
      } else {
        M = multiply(ctm, t);
        if (own) m.transforms.push({ el, tag, shape: SHAPES.has(tag) });
      }
    }
    const op = opacity * unit01(style.opacity);
    if (tag === 'svg' && el !== root) {
      const x = parseLength(el.attrs.x, ref.w) ?? 0, y = parseLength(el.attrs.y, ref.h) ?? 0;
      M = multiply(M, viewportMatrix(parseViewBox(el.attrs.viewBox), x, y, parseLength(el.attrs.width ?? '100%', ref.w), parseLength(el.attrs.height ?? '100%', ref.h)));
    }
    if (tag === 'use') {
      const href = hrefOf(el);
      const target = href?.startsWith('#') ? ids.get(href.slice(1)) : null;
      if (!target) {
        if (own) m.useErrors.push({ el, detail: `<use> points at ${href ? `"${href}", which is not in this file` : 'nothing'}` });
        return;
      }
      if (ctx.stack.includes(target) || ctx.stack.length >= 8) {
        if (own || !m.useErrors.some((u) => u.cycle)) m.useErrors.push({ el, cycle: true, detail: `<use> reference ${ctx.stack.length >= 8 ? 'nests deeper than 8' : 'cycle'} at "${href}"` });
        return;
      }
      let U = multiply(M, [1, 0, 0, 1, parseLength(el.attrs.x, ref.w) ?? 0, parseLength(el.attrs.y, ref.h) ?? 0]);
      const next = { stack: [...ctx.stack, target], via: ctx.via ?? el };
      if (tagOf(target) === 'symbol') {
        const w = parseLength(el.attrs.width ?? target.attrs.width ?? '100%', ref.w), h = parseLength(el.attrs.height ?? target.attrs.height ?? '100%', ref.h);
        U = multiply(U, viewportMatrix(parseViewBox(target.attrs.viewBox), 0, 0, w, h));
        next.symbol = target;
      }
      visit(target, style, U, op, next);
      return;
    }
    if (SHAPES.has(tag)) {
      const g = shapeSegments(tag, el.attrs, ref);
      if (!g?.segs.some((s) => s.t !== 'M')) {
        if (own) m.empty.push({ el, detail: tag === 'path' ? (g?.error?.detail ?? 'no path data') : 'zero size' });
        return;
      }
      const rec = { el, tag, line: el.line, style, ctm: M, segs: g.segs, error: g.error ?? null, numbers: g.numbers ?? null, radius: g.radius ?? null, via: ctx.via ?? null, opacity: op };
      rec.fill = paintOf(style.fill, style.color);
      rec.stroke = paintOf(style.stroke, style.color);
      rec.fillImplicit = style.src.fill === 'initial';
      rec.strokeWidth = parseLength(style['stroke-width'], diag) ?? 1;
      rec.nonScaling = style['vector-effect'] === 'non-scaling-stroke';
      rec.scale = scaleOf(M);
      rec.filled = rec.fill.kind !== 'none' && unit01(style['fill-opacity']) > 0 && tag !== 'line';
      rec.stroked = rec.stroke.kind !== 'none' && rec.strokeWidth > 0 && unit01(style['stroke-opacity']) > 0;
      rec.bbox = bboxOf(transformCubics(toCubics(g.segs), M));
      // Ink box: the fill's bbox and the stroke outline's (caps, joins and miter limit included). A non-scaling stroke
      // is sized in screen px, unknown here, so only its path counts.
      const outline = rec.stroked && !rec.nonScaling ? strokeBox(g.segs, M, { hw: rec.strokeWidth / 2, cap: style['stroke-linecap'], join: style['stroke-linejoin'], miterlimit: parseFloat(style['stroke-miterlimit']) || 4 }) : rec.stroked ? rec.bbox : null;
      rec.inkBox = unionBox(rec.filled ? rec.bbox : null, outline);
      const why = style.visibility === 'hidden' || style.visibility === 'collapse' ? `visibility="${style.visibility}"` : op <= 0 ? 'opacity 0' : !rec.filled && !rec.stroked ? 'no fill and no stroke' : null;
      if (why) {
        if (own) m.hidden.push({ el, why });
      } else m.shapes.push(rec);
      return;
    }
    if (tag === 'text') {
      if (own) m.texts.push(el);
      // live text for legibility checks: painted after m.shapes[order - 1], sized in user units before the root viewBox
      m.textRuns.push({ el, line: el.line, style, ctm: M, opacity: op, order: m.shapes.length, fill: paintOf(style.fill, style.color), fontSize: parseLength(style['font-size'], 16) ?? 16, x: parseLength(String(el.attrs.x ?? '0').split(/[\s,]+/)[0], ref.w) ?? 0, y: parseLength(String(el.attrs.y ?? '0').split(/[\s,]+/)[0], ref.h) ?? 0, text: textOf(el).trim() });
      return;
    }
    if (tag === 'image') {
      if (own) m.images.push(el);
      return;
    }
    for (const c of childElements(el)) visit(c, style, M, op, ctx);
  };
  visit(root, null, IDENTITY, 1, { stack: [] });
  return m;
}
