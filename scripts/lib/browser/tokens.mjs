// cstack original work. Idea inspired by gstack (https://github.com/garrytan/gstack) design-review computed-style
// sketch and its `css` command; no code copied. gstack is MIT License, Copyright (c) 2026 Garry Tan.
//
// Computed-style sweep -> raw design-token candidates. Output is an `extracted_pattern`: input for /brand-import,
// never brand truth. Frequency is not intent; a human or /brand-import decides what (if anything) becomes a token.

const COLOR_PROPS = ['color', 'background-color', 'border-top-color', 'fill', 'stroke'];
const TYPE_PROPS = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing'];
const SPACE_PROPS = ['margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'row-gap', 'column-gap'];

/** rgb()/rgba() -> #rrggbb or #rrggbbaa; transparent -> null; anything else passes through lower-cased. */
export function normalizeColor(v) {
  const s = String(v).trim().toLowerCase();
  if (!s || s === 'transparent' || s === 'none' || s === 'currentcolor') return null;
  const m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (!m) return s;
  let a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  if (a === 0) return null;
  const hx = (n) => Math.round(Math.max(0, Math.min(255, Number(n)))).toString(16).padStart(2, '0');
  return `#${hx(m[1])}${hx(m[2])}${hx(m[3])}${a < 1 ? hx(a * 255) : ''}`;
}

export const primaryFamily = (stack) => String(stack).split(',')[0].trim().replace(/^["']|["']$/g, '');

/** Count values; weight by element area; keep up to 3 sample selectors. Sorted by count, then area. */
export function aggregate(records) {
  const map = new Map();
  for (const { value, area = 0, sel } of records) {
    if (value === null || value === undefined || value === '') continue;
    const e = map.get(value) ?? { value, count: 0, area: 0, samples: [] };
    e.count++;
    e.area += Math.round(area);
    if (sel && e.samples.length < 3 && !e.samples.includes(sel)) e.samples.push(sel);
    map.set(value, e);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.area - a.area);
}

/** Runs in the page. Returns flat [prop, value, area, selector] rows plus :root custom properties and font faces. */
function sweep({ limit, COLOR_PROPS, TYPE_PROPS, SPACE_PROPS }) {
  const rows = [];
  const sel = (el) => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const els = [...document.querySelectorAll('body, body *')].slice(0, limit);
  let scanned = 0;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width === 0 || r.height === 0 || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    scanned++;
    const area = r.width * r.height;
    const s = sel(el);
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    for (const p of COLOR_PROPS) {
      if (p === 'color' && !hasText) continue;
      if (p === 'border-top-color' && parseFloat(cs.borderTopWidth) === 0) continue;
      if ((p === 'fill' || p === 'stroke') && !(el instanceof SVGElement)) continue;
      rows.push([p, cs.getPropertyValue(p), area, s]);
    }
    if (hasText) for (const p of TYPE_PROPS) rows.push([p, cs.getPropertyValue(p), area, s]);
    for (const p of SPACE_PROPS) rows.push([p, cs.getPropertyValue(p), area, s]);
    rows.push(['border-radius', cs.borderRadius, area, s]);
    rows.push(['box-shadow', cs.boxShadow, area, s]);
  }
  const custom = {};
  const rootCs = getComputedStyle(document.documentElement);
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin sheet: computed values above still cover it
    }
    for (const rule of rules) {
      if (!rule.style || !/^(:root|html)$/.test(rule.selectorText ?? '')) continue;
      for (const name of rule.style) if (name.startsWith('--')) custom[name] = rootCs.getPropertyValue(name).trim();
    }
  }
  const faces = [...(document.fonts ?? [])].map((f) => ({ family: f.family.replace(/^["']|["']$/g, ''), weight: f.weight, style: f.style, status: f.status }));
  return { rows, custom, faces, scanned };
}

const isZero = (v) => !v || v === 'none' || v === 'normal' || /^0(px)?( 0(px)?)*$/.test(v) || v === 'auto';

export async function extractTokens(page, { limit = 3000 } = {}) {
  const raw = await page.evaluate(sweep, { limit, COLOR_PROPS, TYPE_PROPS, SPACE_PROPS });
  const by = (props, map = (v) => v, skip = () => false) =>
    aggregate(raw.rows.filter(([p, v]) => props.includes(p) && !skip(v)).map(([, v, area, sel]) => ({ value: map(v), area, sel })));
  const colors = (p) => by([p], normalizeColor);
  return {
    kind: 'extracted_pattern',
    status: 'raw',
    brand_truth: false,
    consumer: '/brand-import',
    note: 'Computed styles from one page at one viewport and colour scheme. Frequency is not intent; confirm via /brand-import before anything becomes a brand token.',
    elements_scanned: raw.scanned,
    colors: {
      text: colors('color'),
      background: colors('background-color'),
      border: colors('border-top-color'),
      svg: by(['fill', 'stroke'], normalizeColor),
      all: by(COLOR_PROPS, normalizeColor),
    },
    typography: {
      families: by(['font-family'], primaryFamily),
      stacks: by(['font-family']),
      sizes: by(['font-size']),
      weights: by(['font-weight']),
      line_heights: by(['line-height']),
      letter_spacing: by(['letter-spacing'], (v) => v, isZero),
    },
    spacing: by(SPACE_PROPS, (v) => v, isZero),
    radii: by(['border-radius'], (v) => v, isZero),
    shadows: by(['box-shadow'], (v) => v, isZero),
    custom_properties: raw.custom,
    font_faces: raw.faces,
  };
}

export function summarizeTokens(t, n = 6) {
  const top = (list) => list.slice(0, n).map((e) => `${e.value} (${e.count})`).join(', ') || '-';
  return [
    `palette: ${top(t.colors.all)}`,
    `families: ${top(t.typography.families)}`,
    `sizes: ${top(t.typography.sizes)}`,
    `spacing: ${top(t.spacing)}`,
    `radii: ${top(t.radii)}`,
    `custom properties: ${Object.keys(t.custom_properties).length}`,
  ].join('\n');
}
