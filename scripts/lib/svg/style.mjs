// Paint and style resolution for the SVG checks: color parsing, a small CSS reader for <style> (type, .class and #id
// selectors are applied; other selectors and @media blocks are read for colors only) and computed values with SVG
// inheritance for the properties the checks need.

// CSS basic colors plus the common aliases. Any other named color is reported, not guessed.
const NAMED = { black: '#000000', silver: '#c0c0c0', gray: '#808080', grey: '#808080', white: '#ffffff', maroon: '#800000', red: '#ff0000', purple: '#800080', fuchsia: '#ff00ff', magenta: '#ff00ff', green: '#008000', lime: '#00ff00', olive: '#808000', yellow: '#ffff00', navy: '#000080', blue: '#0000ff', teal: '#008080', aqua: '#00ffff', cyan: '#00ffff', orange: '#ffa500' };
const KEYWORDS = new Set(['none', 'currentcolor', 'transparent', 'inherit', 'initial', 'unset', 'context-fill', 'context-stroke']);
const hex2 = (n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
export const rgbHex = (r, g, b) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

/** Normalize any #rgb/#rgba/#rrggbb/#rrggbbaa string to {hex: '#rrggbb', alpha}; null when it is not a hex color. */
export function normHex(v) {
  const m = String(v).trim().toLowerCase().match(/^#([0-9a-f]{3,8})$/);
  if (!m || ![3, 4, 6, 8].includes(m[1].length)) return null;
  let h = m[1];
  if (h.length <= 4) h = [...h].map((c) => c + c).join('');
  return { hex: `#${h.slice(0, 6)}`, alpha: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/**
 * Parse a paint or color value: {keyword} | {url, fallback} | {hex, alpha} | {named} (unknown name) | null (unparsed).
 */
export function parseColor(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s*!important$/i, '').toLowerCase();
  if (KEYWORDS.has(s)) return { keyword: s };
  const u = s.match(/^url\(\s*(['"]?)(.*?)\1\s*\)\s*(.*)$/);
  if (u) return { url: u[2], fallback: u[3] ? parseColor(u[3]) : null };
  if (s.startsWith('#')) return normHex(s);
  if (NAMED[s]) return { hex: NAMED[s], alpha: 1 };
  const f = s.match(/^(rgba?|hsla?)\(\s*([^)]*)\)$/);
  if (f) {
    const parts = f[2].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4) return null;
    const num = (p, scale) => (p.endsWith('%') ? (parseFloat(p) / 100) * scale : parseFloat(p));
    const alpha = parts[3] != null ? num(parts[3], 1) : 1;
    let rgb;
    if (f[1].startsWith('rgb')) rgb = parts.slice(0, 3).map((p) => num(p, 255));
    else rgb = hslToRgb(parseFloat(parts[0]), num(parts[1], 1), num(parts[2], 1));
    if ([...rgb, alpha].some((x) => !Number.isFinite(x))) return null;
    return { hex: rgbHex(...rgb), alpha: Math.min(1, Math.max(0, alpha)) };
  }
  if (/^[a-z]+$/.test(s)) return { named: s };
  return null;
}

// ---------- CSS ----------
// Properties the checks read. transform is handled as an attribute; a CSS transform is counted, not applied.
export const PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'fill-opacity', 'opacity', 'display', 'visibility', 'color', 'stop-color', 'stop-opacity', 'vector-effect', 'fill-rule', 'flood-color', 'lighting-color', 'font-size'];
export const COLOR_PROPS = new Set(['fill', 'stroke', 'color', 'stop-color', 'flood-color', 'lighting-color']);

function splitTop(text, ch) {
  const out = [];
  let depth = 0, q = null, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ch && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

/** Parse "a: b; c: d" into [[prop, value]] (lowercased props, values kept). */
export function parseDecls(text) {
  const out = [];
  for (const part of splitTop(text ?? '', ';')) {
    const k = part.indexOf(':');
    if (k < 0) continue;
    const prop = part.slice(0, k).trim().toLowerCase();
    const value = part.slice(k + 1).trim();
    if (prop && value) out.push([prop, value]);
  }
  return out;
}

function matchBrace(text, open) {
  let depth = 0, q = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return text.length;
}

const SIMPLE = /^([a-zA-Z][\w-]*|\*)?((?:[.#][\w-]+)*)$/;
function parseSelector(sel) {
  const m = sel.trim().match(SIMPLE);
  if (!m || (!m[1] && !m[2])) return null;
  const parts = m[2].match(/[.#][\w-]+/g) ?? [];
  const id = parts.find((p) => p[0] === '#')?.slice(1) ?? null;
  const classes = parts.filter((p) => p[0] === '.').map((p) => p.slice(1));
  const tag = m[1] && m[1] !== '*' ? m[1].toLowerCase() : null;
  return { tag, id, classes, spec: (id ? 10000 : 0) + classes.length * 100 + (tag ? 1 : 0) };
}

/**
 * Read stylesheet text. rules: applied rules [{selectors, decls, order}]; unsupported: selectors not applied;
 * decls: every declaration seen (for color and url scans), with conditional=true inside at-rule blocks; imports.
 */
export function readCSS(text) {
  const css = { rules: [], unsupported: 0, decls: [], imports: [], atRules: [] };
  const src = String(text ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
  let order = 0;
  const walk = (t, conditional) => {
    let i = 0;
    while (i < t.length) {
      const open = t.indexOf('{', i);
      const semi = t.indexOf(';', i);
      const head = t.slice(i, open === -1 ? t.length : open).trim();
      if (t.slice(i).trim().startsWith('@') && semi !== -1 && (open === -1 || semi < open)) {
        const stmt = t.slice(i, semi).trim();
        if (/^@import\b/i.test(stmt)) css.imports.push(stmt);
        css.atRules.push(stmt.split(/\s/)[0].toLowerCase());
        i = semi + 1;
        continue;
      }
      if (open === -1) break;
      const close = matchBrace(t, open);
      const body = t.slice(open + 1, close);
      if (head.startsWith('@')) {
        const name = head.split(/[\s(]/)[0].toLowerCase();
        css.atRules.push(name);
        if (name === '@media' || name === '@supports' || name === '@layer' || name === '@container') walk(body, true);
        else for (const [prop, value] of parseDecls(body.replace(/[{}]/g, ';'))) css.decls.push({ prop, value, conditional: true, at: name });
      } else {
        const decls = parseDecls(body);
        for (const [prop, value] of decls) css.decls.push({ prop, value, conditional });
        if (!conditional) {
          const sels = head.split(',').map(parseSelector);
          const ok = sels.filter(Boolean);
          css.unsupported += sels.length - ok.length;
          if (ok.length) css.rules.push({ selectors: ok, decls, order: order++ });
        }
      }
      i = close + 1;
    }
  };
  walk(src, false);
  return css;
}

function matches(sel, el, tag) {
  if (sel.tag && sel.tag !== tag) return false;
  if (sel.id && el.attrs.id !== sel.id) return false;
  if (sel.classes.length) {
    const cls = new Set(String(el.attrs.class ?? '').split(/\s+/).filter(Boolean));
    if (!sel.classes.every((c) => cls.has(c))) return false;
  }
  return true;
}

/** Declared values for one element: presentation attributes < stylesheet rules (specificity, order) < style attribute. */
export function declaredStyle(el, tag, css) {
  const out = {};
  const want = new Set(PROPS);
  for (const p of PROPS) if (el.attrs[p] != null) out[p] = el.attrs[p];
  if (css?.rules.length) {
    const hits = [];
    for (const r of css.rules) {
      const spec = Math.max(-1, ...r.selectors.filter((s) => matches(s, el, tag)).map((s) => s.spec));
      if (spec >= 0) hits.push([spec, r.order, r]);
    }
    hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [, , r] of hits) for (const [p, v] of r.decls) if (want.has(p)) out[p] = v.replace(/\s*!important$/i, '');
  }
  if (el.attrs.style) for (const [p, v] of parseDecls(el.attrs.style)) if (want.has(p)) out[p] = v.replace(/\s*!important$/i, '');
  return out;
}

export const INHERITED = new Set(['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'fill-opacity', 'visibility', 'color', 'fill-rule', 'font-size']);
export const INITIAL = { fill: 'black', stroke: 'none', 'stroke-width': '1', 'stroke-linecap': 'butt', 'stroke-linejoin': 'miter', 'stroke-miterlimit': '4', 'stroke-opacity': '1', 'fill-opacity': '1', opacity: '1', display: 'inline', visibility: 'visible', color: 'black', 'stop-color': 'black', 'stop-opacity': '1', 'vector-effect': 'none', 'fill-rule': 'nonzero', 'flood-color': 'black', 'lighting-color': 'white', 'font-size': '16px' };

/** Computed style. `src[prop]` is 'declared' when any element in the chain set it, else 'initial'. */
export function computeStyle(declared, parent) {
  const out = { src: {} };
  for (const p of PROPS) {
    let v = declared[p];
    const kw = v == null ? null : String(v).trim().toLowerCase();
    if (kw === 'initial' || (kw === 'unset' && !INHERITED.has(p))) v = INITIAL[p];
    else if (kw === 'inherit' || kw === 'unset') v = undefined;
    if (v != null && String(v).trim() !== '') {
      out[p] = String(v).trim();
      out.src[p] = 'declared';
    } else if (parent && (INHERITED.has(p) || declared[p] != null)) {
      out[p] = parent[p];
      out.src[p] = parent.src[p];
    } else {
      out[p] = INITIAL[p];
      out.src[p] = 'initial';
    }
  }
  return out;
}

/** Resolve a paint against `color` (for currentColor): {kind: 'none'|'color'|'currentcolor'|'url'|'unknown', hex?, raw}. */
export function paintOf(value, color) {
  const raw = String(value ?? '').trim();
  const c = parseColor(raw);
  if (!c) return { kind: 'unknown', raw };
  if (c.keyword === 'none' || c.keyword === 'transparent') return { kind: 'none', raw };
  if (c.keyword === 'currentcolor') {
    const r = parseColor(color);
    return { kind: 'currentcolor', raw, hex: r?.hex ?? null };
  }
  if (c.keyword) return { kind: 'unknown', raw };
  if (c.url != null) return { kind: 'url', raw, id: c.url.startsWith('#') ? c.url.slice(1) : null, external: !c.url.startsWith('#') };
  if (c.named) return { kind: 'unknown', raw };
  return { kind: 'color', raw, hex: c.hex, alpha: c.alpha };
}
