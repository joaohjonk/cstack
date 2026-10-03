// svg legibility: can the words in a figure be read where it will be shown? Pure Node, no browser.
// For each width the figure is displayed at (a README column is about 830 px on desktop and 324 px on a phone):
//   svg.text-size      rendered text height in CSS px against a minimum (default 11 px)
//   svg.text-contrast  WCAG contrast of the text fill against the ground painted under it (4.5:1, or 3:1 at 24 px and up)
// Live <text> is measured from its font-size. Outlined type (filled paths with several subpaths, as type set to
// outlines usually is) is estimated: em ≈ ink height / 0.7. An estimate fails only when clearly too small (under
// 60% of the minimum) and warns otherwise; live text fails outright.
import fs from 'node:fs';
import { parseXML } from './xml.mjs';
import { buildModel, rootViewBox } from './model.mjs';
import { applyPt, scaleOf } from './path.mjs';
import { contrastRatio } from '../browser/qa.mjs';

export const MIN_TEXT_PX = 11; // cstack default: below this a label stops reading on a phone (inferred, not a standard)
export const LARGE_TEXT_PX = 24; // WCAG 2.x "large text" (18 pt): 3:1 suffices from here
export const OUTLINE_EM_PER_INK = 1 / 0.7; // ink height of a line of outlined type is about 0.7 em (cap height to x-height mix)
export const ESTIMATE_FAIL_SHARE = 0.6;

const r1 = (n) => Math.round(n * 10) / 10;
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const over = (top, alpha, under) => rgb(top).map((v, i) => v * alpha + rgb(under)[i] * (1 - alpha));
const contains = (b, x, y) => b && x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
const est = (r) => (r.kind === 'outline' ? '~' : '');
const covers = (a, b) => a.x0 <= b.x0 && a.y0 <= b.y0 && a.x1 >= b.x1 && a.y1 >= b.y1;
const area = (b) => (b ? (b.x1 - b.x0) * (b.y1 - b.y0) : 0);
const alphaOf = (paint, style, opacity) => (paint.alpha ?? 1) * Math.max(0, Math.min(1, parseFloat(style['fill-opacity']) || 0)) * opacity;

// The colour under (x, y) just before paint step `order`: the topmost earlier solid fill whose box holds the point and is
// clearly larger than the ink, blended down through anything translucent, onto the page.
function groundAt(shapes, order, x, y, inkArea, page, inkBox = null) {
  const stack = [];
  for (let i = order - 1; i >= 0; i--) {
    const s = shapes[i];
    if (!s.filled || s.fill.kind !== 'color' || !s.fill.hex || !contains(s.bbox, x, y) || (area(s.bbox) < 4 * inkArea && !(inkBox && covers(s.bbox, inkBox)))) continue;
    const a = alphaOf(s.fill, s.style, s.opacity);
    stack.push([s.fill.hex, a]);
    if (a >= 0.999) break;
  }
  let c = page;
  for (const [hex, a] of stack.reverse()) c = toHex(over(hex, a, c));
  return c;
}

/** Text runs of one file: {line, label, kind: 'text'|'outline', em (user units), x, y, inkArea, order, fill, alpha}. */
// a wordmark that bleeds off the canvas is judged on the part that shows
const clip = (b, vb) => (vb ? { x0: Math.max(b.x0, vb.x), y0: Math.max(b.y0, vb.y), x1: Math.min(b.x1, vb.x + vb.w), y1: Math.min(b.y1, vb.y + vb.h) } : b);
const visibleCentre = (b, vb) => {
  const c = clip(b, vb);
  return { x: (c.x0 + c.x1) / 2, y: (c.y0 + c.y1) / 2 };
};

export function textRuns(model) {
  const runs = [];
  for (const t of model.textRuns) {
    const s = scaleOf(t.ctm);
    const [x, y] = applyPt(t.ctm, t.x, t.y - t.fontSize * 0.35);
    runs.push({ line: t.line, label: t.text.slice(0, 40) || '<text>', kind: 'text', em: t.fontSize * s, x, y, inkArea: (t.fontSize * s) ** 2, order: t.order, fill: t.fill, alpha: t.fill.kind === 'color' ? alphaOf(t.fill, t.style, t.opacity) : 0 });
  }
  model.shapes.forEach((s, i) => {
    if (s.tag !== 'path' || !s.filled || !s.bbox) return;
    const subpaths = s.segs.filter((g) => g.t === 'M').length;
    const h = s.bbox.y1 - s.bbox.y0, w = s.bbox.x1 - s.bbox.x0;
    if (subpaths < 3 || h <= 0 || w < h) return; // a run of glyphs is wider than tall and has several contours
    runs.push({ line: s.line, label: `outlined type at ${Math.round(s.bbox.x0)},${Math.round(s.bbox.y0)}`, kind: 'outline', em: h * OUTLINE_EM_PER_INK, ...visibleCentre(s.bbox, model.viewBox), inkBox: clip(s.bbox, model.viewBox), inkArea: w * h, order: i, fill: s.fill, alpha: s.fill.kind === 'color' ? alphaOf(s.fill, s.style, s.opacity) : 0 });
  });
  return runs;
}

/**
 * legibilitySVG(text, {file, widths:[px], minPx, pages:['#ffffff']}) -> {file, findings, runs}
 * widths: CSS px the whole figure is displayed at. pages: what shows through where the figure paints nothing.
 */
export function legibilitySVG(text, { file = 'input.svg', widths = [324], minPx = MIN_TEXT_PX, pages = ['#ffffff'] } = {}) {
  const model = buildModel(parseXML(text));
  const vb = model.viewBox ?? rootViewBox(model.root);
  const unitsWide = vb?.w ?? parseFloat(model.root.attrs.width);
  if (!unitsWide) throw new Error(`${file}: no viewBox or width, so the display scale is unknown`);
  const findings = [];
  const add = (id, level, line, detail) => findings.push({ id, level, file, line, detail });
  const runs = textRuns(model);
  for (const width of widths) {
    const k = width / unitsWide;
    for (const r of runs) {
      const px = r.em * k;
      if (px < minPx) {
        const level = r.kind === 'text' || px < minPx * ESTIMATE_FAIL_SHARE ? 'fail' : 'warn';
        add('svg.text-size', level, r.line, `"${r.label}" renders at ${est(r)}${r1(px)} px at ${width} px wide (minimum ${minPx} px): make it at least ${Math.ceil((minPx / k) / (r.kind === 'outline' ? OUTLINE_EM_PER_INK : 1))} units ${r.kind === 'outline' ? 'of ink height' : 'font-size'}, or let it be texture nobody needs to read`);
      }
    }
  }
  const smallest = Math.min(...widths);
  for (const r of runs) {
    if (r.fill.kind !== 'color' || !r.fill.hex) {
      if (r.fill.kind !== 'none') add('svg.text-contrast', 'info', r.line, `"${r.label}": fill ${r.fill.raw || r.fill.kind} is not a flat colour; contrast not computed`);
      continue;
    }
    const px = r.em * (smallest / unitsWide);
    const need = px >= LARGE_TEXT_PX ? 3 : 4.5;
    // one finding per distinct ground: an opaque ground under the text gives the same answer on every page
    const grounds = new Map();
    for (const page of pages) {
      const g = groundAt(model.shapes, r.order, r.x, r.y, r.inkArea, page, r.inkBox);
      grounds.set(g, [...(grounds.get(g) ?? []), page]);
    }
    for (const [ground, on] of grounds) {
      const ratio = contrastRatio(rgb(toHex(over(r.fill.hex, r.alpha, ground))), rgb(ground));
      if (ratio < need) add('svg.text-contrast', 'fail', r.line, `"${r.label}": ${r.fill.hex}${r.alpha < 1 ? ` at ${r1(r.alpha * 100)}%` : ''} on ${ground} is ${ratio}:1, needs ${need}:1 at ${est(r)}${r1(px)} px${grounds.size > 1 ? ` (page ${on.join(', ')})` : ''}`);
    }
  }
  const counts = { fail: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.level]++;
  return { file, ok: counts.fail === 0, widths, min_px: minPx, runs: runs.length, counts, findings };
}
export function legibilityFiles(files, opts = {}, display = (p) => p) {
  const results = files.map((f) => legibilitySVG(fs.readFileSync(f, 'utf8'), { ...opts, file: display(f) }));
  const findings = results.flatMap((r) => r.findings);
  const counts = { fail: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.level]++;
  return { ok: counts.fail === 0, widths: opts.widths, min_px: opts.minPx ?? MIN_TEXT_PX, pages: opts.pages ?? ['#ffffff'], files: results.map(({ file, runs, counts }) => ({ file, runs, counts })), counts, findings };
}

export function formatLegibility(rep) {
  const lines = [`svg legibility: ${rep.files.length} file${rep.files.length === 1 ? '' : 's'} at ${rep.widths.join(', ')} px wide, minimum ${rep.min_px} px text, page ${rep.pages.join(' and ')}`];
  for (const f of rep.findings) lines.push(`${f.level.toUpperCase().padEnd(4)} ${f.id.padEnd(17)} ${f.file}${f.line ? `:${f.line}` : ''}  ${f.detail}`);
  lines.push(`svg legibility: ${rep.ok ? 'PASS' : 'FAIL'} (${rep.counts.fail} fail, ${rep.counts.warn} warn; ${rep.files.reduce((n, f) => n + f.runs, 0)} text runs; ~ marks sizes estimated from outlined type)`);
  return lines.join('\n');
}
