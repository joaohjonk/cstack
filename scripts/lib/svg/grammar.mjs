// Inputs for svg lint: an icon grammar (icons.tokens.json) and a brand palette, both read as DTCG tokens through
// scripts/lib/tokens.mjs. The grammar is the B4 rule from docs/research/mockups-and-vector.md ("an icon set is a token
// set"): canvas, padding (or live area), stroke width, caps, joins, corner radii, optional coordinate snap and gap.
import fs from 'node:fs';
import path from 'node:path';
import { exists, readJSON } from '../core.mjs';
import { flatten, loadTokens, colorHex } from '../tokens.mjs';
import { normHex } from './style.mjs';

const ALIAS = /^\{([^}]+)\}$/;
function resolve(tokens, name, seen = new Set()) {
  const t = tokens[name];
  if (!t) return null;
  const m = typeof t.value === 'string' ? t.value.match(ALIAS) : null;
  if (!m) return t.value;
  if (seen.has(m[1])) return null;
  seen.add(name);
  return resolve(tokens, m[1], seen);
}

const toNumber = (v) => {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && 'value' in v) return v.unit === 'rem' ? Number(v.value) * 16 : Number(v.value);
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

const KEYS = {
  canvas: ['canvas', 'grid', 'size', 'canvas-size', 'grid-size'],
  padding: ['padding', 'margin', 'padding-min', 'safe-padding'],
  live: ['live-area', 'live'],
  stroke: ['stroke', 'stroke-width', 'stroke.width', 'stroke.size'],
  linecap: ['linecap', 'stroke-linecap', 'stroke.linecap', 'stroke.cap', 'caps', 'cap', 'stroke.style'],
  linejoin: ['linejoin', 'stroke-linejoin', 'stroke.linejoin', 'stroke.join', 'joins', 'join'],
  snap: ['snap', 'grid-snap', 'coordinate-step', 'step'],
  gap: ['gap', 'min-gap', 'gap-min'],
};

/**
 * Load an icon grammar. Accepts a DTCG tokens file (values may sit under an `icon`/`icons`/`grammar` group) or a plain
 * JSON object with the same keys. Caps and joins may be strings or a DTCG strokeStyle object ({lineCap}).
 * Returns {source, canvas, padding, stroke, linecap, linejoin, radii[], snap, gap}.
 */
export function loadGrammar(file) {
  const raw = readJSON(file);
  const tokens = flatten(raw, path.basename(file));
  let entries = Object.keys(tokens).map((k) => [k, resolve(tokens, k)]);
  if (!entries.length) {
    const plain = raw.icon ?? raw.icons ?? raw.grammar ?? raw;
    const out = [];
    const rec = (o, pre) => {
      for (const [k, v] of Object.entries(o)) {
        if (k.startsWith('$')) continue;
        if (v && typeof v === 'object' && !Array.isArray(v) && !('value' in v) && !('lineCap' in v)) rec(v, [...pre, k]);
        else out.push([[...pre, k].join('.'), v]);
      }
    };
    rec(plain, []);
    entries = out;
  }
  const g = { source: file, canvas: null, padding: null, stroke: null, linecap: null, linejoin: null, radii: [], snap: null, gap: null };
  for (const [name, value] of entries) {
    const key = name.toLowerCase().replace(/_/g, '-').replace(/^(icons?|grammar|icon-grammar)\./, '');
    if (/^(corner-)?radius|^corners?\b/.test(key)) {
      for (const v of Array.isArray(value) ? value : [value]) {
        const n = toNumber(v);
        if (n != null) g.radii.push(n);
      }
      continue;
    }
    const field = Object.keys(KEYS).find((f) => KEYS[f].includes(key));
    if (!field) continue;
    if (field === 'linecap' || field === 'linejoin') {
      const s = value && typeof value === 'object' ? value.lineCap ?? value.lineJoin : value;
      if (typeof s === 'string') g[field] = s.toLowerCase();
    } else {
      const n = toNumber(value);
      if (n != null) g[field] = n;
    }
  }
  if (g.live != null && g.canvas != null && g.padding == null) g.padding = (g.canvas - g.live) / 2;
  delete g.live;
  g.radii = [...new Set(g.radii)].sort((a, b) => b - a);
  if (![g.canvas, g.padding, g.stroke, g.linecap, g.linejoin, g.snap].some((v) => v != null) && !g.radii.length)
    throw new Error(`grammar ${file} declares none of canvas, padding, stroke width, linecap, linejoin, radius or snap`);
  return g;
}

/** Resolve a path given on the command line: as given (from cwd) when it exists, else relative to the workspace. */
export const resolveIn = (p, ws) => (exists(path.resolve(p)) ? path.resolve(p) : path.resolve(ws ?? '.', p));

/**
 * Load a palette: `#hex,#hex` list, a *.tokens.json file, a tokens directory, or a brand workspace (brand/tokens).
 * With no spec, the workspace's brand/tokens is used when it has color tokens. 'none' disables the check.
 * Returns {source, colors: Map('#rrggbb' -> [token names])} or null.
 */
export function loadPalette(spec, ws) {
  if (spec === 'none' || spec === false) return null;
  const colors = new Map();
  const put = (hex, name) => {
    const n = normHex(hex);
    if (!n) return;
    if (!colors.has(n.hex)) colors.set(n.hex, []);
    colors.get(n.hex).push(name);
  };
  const fromTokens = (tokens) => {
    for (const name of Object.keys(tokens)) if (tokens[name].type === 'color') {
      const hex = colorHex(resolve(tokens, name));
      if (hex) put(hex, name);
    }
  };
  if (spec == null || spec === true) {
    if (!ws || !exists(path.join(ws, 'brand', 'tokens'))) return null;
    fromTokens(loadTokens(ws));
    return colors.size ? { source: 'brand/tokens (workspace, auto)', colors } : null;
  }
  const s = String(spec);
  if (s.includes('#') && !exists(path.resolve(s))) {
    for (const h of s.split(/[\s,]+/).filter(Boolean)) {
      if (!normHex(h)) throw new Error(`bad --palette color "${h}" (expected #rgb or #rrggbb)`);
      put(h, h);
    }
    return { source: 'list', colors };
  }
  const p = resolveIn(s, ws);
  if (!exists(p)) throw new Error(`--palette ${s}: not found (give a workspace, a tokens dir, a *.tokens.json file or #hex,#hex)`);
  if (fs.statSync(p).isFile()) fromTokens(flatten(readJSON(p), path.basename(p)));
  else if (exists(path.join(p, 'brand', 'tokens'))) fromTokens(loadTokens(p));
  else {
    const all = {};
    for (const f of fs.readdirSync(p).filter((x) => x.endsWith('.tokens.json')).sort()) Object.assign(all, flatten(readJSON(path.join(p, f)), f));
    fromTokens(all);
  }
  if (!colors.size) throw new Error(`--palette ${s}: no color tokens found`);
  return { source: path.relative(process.cwd(), p) || p, colors };
}

// sRGB -> CIE Lab (D65) for nearest-token suggestions; dE76 is enough to name the closest token.
function lab(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const X = (0.4124 * c[0] + 0.3576 * c[1] + 0.1805 * c[2]) / 0.95047, Y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], Z = (0.0193 * c[0] + 0.1192 * c[1] + 0.9505 * c[2]) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

export function nearestColor(hex, colors) {
  const a = lab(hex);
  let best = null;
  for (const [h, names] of colors) {
    const b = lab(h);
    const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    if (!best || d < best.de) best = { hex: h, names, de: Math.round(d * 10) / 10 };
  }
  return best;
}
