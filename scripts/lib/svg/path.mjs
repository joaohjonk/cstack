// SVG geometry without a DOM: path data parsing, absolute segments, basic shapes as paths, transforms and exact
// bounding boxes. Arcs and quadratics are converted to cubics, so every bbox comes from curve extrema, not sampling.

const ARGS = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
const NUM = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const isWs = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';

/**
 * Parse path data the way browsers do: render up to the first error. Returns {cmds: [{c, a}], error, numbers}, where
 * numbers are the raw numeric tokens (for precision checks; arc flags excluded).
 */
export function parsePathData(d = '') {
  const cmds = [];
  const numbers = [];
  let error = null;
  let i = 0;
  const n = d.length;
  const ws = () => {
    while (i < n && isWs(d[i])) i++;
  };
  const sep = () => {
    ws();
    if (d[i] === ',') {
      i++;
      ws();
    }
  };
  const readNum = () => {
    NUM.lastIndex = i;
    const m = NUM.exec(d);
    if (!m) return null;
    i += m[0].length;
    numbers.push(m[0]);
    return Number(m[0]);
  };
  const readFlag = () => (d[i] === '0' || d[i] === '1' ? Number(d[i++]) : null);
  let cmd = null;
  ws();
  while (i < n) {
    const ch = d[i];
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(ch)) {
      cmd = ch;
      i++;
      ws();
      if (cmd === 'z' || cmd === 'Z') {
        cmds.push({ c: cmd, a: [] });
        continue;
      }
    } else if (cmd === null || cmd === 'z' || cmd === 'Z') {
      error = { at: i, detail: `unexpected "${ch}" at character ${i}` };
      break;
    }
    const k = ARGS[cmd.toLowerCase()];
    const a = [];
    for (let j = 0; j < k; j++) {
      if (j > 0) sep();
      const v = (cmd === 'a' || cmd === 'A') && (j === 3 || j === 4) ? readFlag() : readNum();
      if (v === null) {
        error = { at: i, detail: `incomplete ${cmd} command at character ${i}` };
        break;
      }
      a.push(v);
    }
    if (error) break;
    cmds.push({ c: cmd, a });
    if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';
    sep();
  }
  if (cmds.length && cmds[0].c !== 'M' && cmds[0].c !== 'm') return { cmds: [], error: { at: 0, detail: 'path data must start with M or m; nothing renders' }, numbers };
  return { cmds, error, numbers };
}

/** Absolute segments: {t:'M',x,y} | {t:'L'|'Z',x0,y0,x,y} | {t:'C',x0,y0,x1,y1,x2,y2,x,y} | {t:'Q',...} | {t:'A',x0,y0,rx,ry,rot,large,sweep,x,y}. */
export function absoluteSegments(cmds) {
  const out = [];
  let x = 0, y = 0, sx = 0, sy = 0;
  let prev = null; // {t:'C'|'Q', cx, cy}: last control point for S/T reflection
  for (const { c, a } of cmds) {
    const rel = c >= 'a';
    const ox = rel ? x : 0, oy = rel ? y : 0;
    const C = c.toUpperCase();
    let seg = null;
    if (C === 'M') {
      x = ox + a[0];
      y = oy + a[1];
      sx = x;
      sy = y;
      out.push({ t: 'M', x, y, cmd: c });
      prev = null;
      continue;
    }
    if (C === 'Z') {
      out.push({ t: 'Z', x0: x, y0: y, x: sx, y: sy, cmd: c });
      x = sx;
      y = sy;
      prev = null;
      continue;
    }
    if (C === 'L') seg = { t: 'L', x0: x, y0: y, x: ox + a[0], y: oy + a[1] };
    else if (C === 'H') seg = { t: 'L', x0: x, y0: y, x: (rel ? x : 0) + a[0], y };
    else if (C === 'V') seg = { t: 'L', x0: x, y0: y, x, y: (rel ? y : 0) + a[0] };
    else if (C === 'C') seg = { t: 'C', x0: x, y0: y, x1: ox + a[0], y1: oy + a[1], x2: ox + a[2], y2: oy + a[3], x: ox + a[4], y: oy + a[5] };
    else if (C === 'S') {
      const [rx, ry] = prev?.t === 'C' ? [2 * x - prev.cx, 2 * y - prev.cy] : [x, y];
      seg = { t: 'C', x0: x, y0: y, x1: rx, y1: ry, x2: ox + a[0], y2: oy + a[1], x: ox + a[2], y: oy + a[3] };
    } else if (C === 'Q') seg = { t: 'Q', x0: x, y0: y, x1: ox + a[0], y1: oy + a[1], x: ox + a[2], y: oy + a[3] };
    else if (C === 'T') {
      const [qx, qy] = prev?.t === 'Q' ? [2 * x - prev.cx, 2 * y - prev.cy] : [x, y];
      seg = { t: 'Q', x0: x, y0: y, x1: qx, y1: qy, x: ox + a[0], y: oy + a[1] };
    } else if (C === 'A') seg = { t: 'A', x0: x, y0: y, rx: a[0], ry: a[1], rot: a[2], large: a[3], sweep: a[4], x: ox + a[5], y: oy + a[6] };
    seg.cmd = c;
    out.push(seg);
    prev = seg.t === 'C' ? { t: 'C', cx: seg.x2, cy: seg.y2 } : seg.t === 'Q' ? { t: 'Q', cx: seg.x1, cy: seg.y1 } : null;
    x = seg.x;
    y = seg.y;
  }
  return out;
}

/** Endpoint arc -> center parameterization (SVG 1.1 F.6.5), then cubics of at most 90 degrees each. */
export function arcToCubics(s) {
  const { x0, y0, x, y } = s;
  if (x0 === x && y0 === y) return { cubics: [], r: null };
  let rx = Math.abs(s.rx), ry = Math.abs(s.ry);
  if (!rx || !ry) return { cubics: [{ t: 'L', x0, y0, x, y }], r: null };
  const phi = (s.rot * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x0 - x) / 2, dy = (y0 - y) / 2;
  const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) {
    rx *= Math.sqrt(lam);
    ry *= Math.sqrt(lam);
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = (s.large !== s.sweep ? 1 : -1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1p) / ry, cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x0 + x) / 2, cy = sin * cxp + cos * cyp + (y0 + y) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const ux = (x1p - cxp) / rx, uy = (y1p - cyp) / ry, vx = (-x1p - cxp) / rx, vy = (-y1p - cyp) / ry;
  const t1 = ang(1, 0, ux, uy);
  let dt = ang(ux, uy, vx, vy);
  if (!s.sweep && dt > 0) dt -= 2 * Math.PI;
  if (s.sweep && dt < 0) dt += 2 * Math.PI;
  const nSeg = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const d = dt / nSeg, k = (4 / 3) * Math.tan(d / 4);
  const map = (u, v) => [cx + rx * cos * u - ry * sin * v, cy + rx * sin * u + ry * cos * v];
  const cubics = [];
  let px = x0, py = y0;
  for (let i = 0; i < nSeg; i++) {
    const a = t1 + i * d, b = a + d;
    const [c1x, c1y] = map(Math.cos(a) - k * Math.sin(a), Math.sin(a) + k * Math.cos(a));
    const [c2x, c2y] = map(Math.cos(b) + k * Math.sin(b), Math.sin(b) - k * Math.cos(b));
    const [ex, ey] = i === nSeg - 1 ? [x, y] : map(Math.cos(b), Math.sin(b));
    cubics.push({ t: 'C', x0: px, y0: py, x1: c1x, y1: c1y, x2: c2x, y2: c2y, x: ex, y: ey });
    px = ex;
    py = ey;
  }
  return { cubics, r: { rx, ry, sweepDeg: Math.abs((dt * 180) / Math.PI) } };
}

/** Lines and cubics only (M kept as a marker). */
export function toCubics(segs) {
  const out = [];
  for (const s of segs) {
    if (s.t === 'M') out.push({ t: 'M', x: s.x, y: s.y });
    else if (s.t === 'L' || s.t === 'Z') out.push({ t: 'L', x0: s.x0, y0: s.y0, x: s.x, y: s.y });
    else if (s.t === 'C') out.push(s);
    else if (s.t === 'Q')
      out.push({ t: 'C', x0: s.x0, y0: s.y0, x1: s.x0 + (2 / 3) * (s.x1 - s.x0), y1: s.y0 + (2 / 3) * (s.y1 - s.y0), x2: s.x + (2 / 3) * (s.x1 - s.x), y2: s.y + (2 / 3) * (s.y1 - s.y), x: s.x, y: s.y });
    else if (s.t === 'A') out.push(...arcToCubics(s).cubics);
  }
  return out;
}

// ---------- transforms: [a, b, c, d, e, f] maps (x, y) to (a x + c y + e, b x + d y + f) ----------
export const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);
export const multiply = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
export const applyPt = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
export const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
export const isIdentity = (m) => m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-12);

/** Parse a transform list; returns a matrix, or null when the list is malformed (browsers then ignore it). */
export function parseTransform(s) {
  if (s == null) return IDENTITY;
  const re = /\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)\s*,?/y;
  let m = IDENTITY, i = 0;
  const str = String(s).trim();
  while (i < str.length) {
    re.lastIndex = i;
    const r = re.exec(str);
    if (!r) return null;
    i = re.lastIndex;
    const v = (r[2].match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? []).map(Number);
    const rad = (deg) => (deg * Math.PI) / 180;
    let t;
    if (r[1] === 'matrix' && v.length === 6) t = v;
    else if (r[1] === 'translate' && (v.length === 1 || v.length === 2)) t = [1, 0, 0, 1, v[0], v[1] ?? 0];
    else if (r[1] === 'scale' && (v.length === 1 || v.length === 2)) t = [v[0], 0, 0, v[1] ?? v[0], 0, 0];
    else if (r[1] === 'rotate' && (v.length === 1 || v.length === 3)) {
      const c = Math.cos(rad(v[0])), sn = Math.sin(rad(v[0]));
      t = [c, sn, -sn, c, 0, 0];
      if (v.length === 3) t = multiply(multiply([1, 0, 0, 1, v[1], v[2]], t), [1, 0, 0, 1, -v[1], -v[2]]);
    } else if (r[1] === 'skewX' && v.length === 1) t = [1, 0, Math.tan(rad(v[0])), 1, 0, 0];
    else if (r[1] === 'skewY' && v.length === 1) t = [1, Math.tan(rad(v[0])), 0, 1, 0, 0];
    else return null;
    m = multiply(m, t);
  }
  return m;
}

export function transformCubics(cubics, m) {
  if (isIdentity(m)) return cubics;
  return cubics.map((s) => {
    if (s.t === 'M') {
      const [x, y] = applyPt(m, s.x, s.y);
      return { t: 'M', x, y };
    }
    const [x0, y0] = applyPt(m, s.x0, s.y0), [x, y] = applyPt(m, s.x, s.y);
    if (s.t === 'L') return { t: 'L', x0, y0, x, y };
    const [x1, y1] = applyPt(m, s.x1, s.y1), [x2, y2] = applyPt(m, s.x2, s.y2);
    return { t: 'C', x0, y0, x1, y1, x2, y2, x, y };
  });
}

function extremaT(p0, p1, p2, p3) {
  const a = 3 * (-p0 + 3 * p1 - 3 * p2 + p3), b = 6 * (p0 - 2 * p1 + p2), c = 3 * (p1 - p0);
  const ts = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) ts.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const q = Math.sqrt(disc);
      ts.push((-b + q) / (2 * a), (-b - q) / (2 * a));
    }
  }
  return ts.filter((t) => t > 0 && t < 1);
}
const cubicExtrema = (p0, p1, p2, p3) => extremaT(p0, p1, p2, p3).map((t) => (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * p3);

/** Exact bbox of lines + cubics: {x0, y0, x1, y1} or null when empty. */
export function bboxOf(cubics) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  };
  for (const s of cubics) {
    if (s.t === 'M') continue;
    add(s.x0, s.y0);
    add(s.x, s.y);
    if (s.t === 'C') {
      for (const v of cubicExtrema(s.x0, s.x1, s.x2, s.x)) add(v, s.y0);
      for (const v of cubicExtrema(s.y0, s.y1, s.y2, s.y)) add(s.x0, v);
    }
  }
  return x0 === Infinity ? null : { x0, y0, x1, y1 };
}

export const unionBox = (a, b) => (!a ? b : !b ? a : { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });

const unit = (x, y) => {
  const l = Math.hypot(x, y);
  return l > 1e-12 ? [x / l, y / l] : null;
};
const perp = (t) => [-t[1], t[0]];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
function endTangents(c) {
  if (c.t === 'L') {
    const d = unit(c.x - c.x0, c.y - c.y0);
    return [d, d];
  }
  return [unit(c.x1 - c.x0, c.y1 - c.y0) ?? unit(c.x2 - c.x0, c.y2 - c.y0) ?? unit(c.x - c.x0, c.y - c.y0), unit(c.x - c.x2, c.y - c.y2) ?? unit(c.x - c.x1, c.y - c.y1) ?? unit(c.x - c.x0, c.y - c.y0)];
}

/**
 * Exact bbox of a stroke of half-width hw drawn in user space and mapped by `m`: the curve offset along the root axes
 * at its extremes, segment ends offset along their normals, miter tips within the limit, round joins, and round or
 * square caps on open subpaths (zero-length subpaths become dots). Assumes curves bend less sharply than hw.
 */
export function strokeBox(segs, m, { hw, cap = 'butt', join = 'miter', miterlimit = 4 }) {
  const axes = [unit(m[0], m[2]), unit(m[1], m[3])].filter(Boolean); // user-space directions of root x and y
  const dirs = axes.flatMap(([x, y]) => [[x, y], [-x, -y]]);
  const pts = [];
  const put = (p, u, k = hw) => pts.push([p[0] + k * u[0], p[1] + k * u[1]]);
  const fan = (p, keep) => {
    for (const u of dirs) if (keep(u)) put(p, u);
  };
  const groups = [];
  let cur = null;
  for (const s of segs) {
    if (s.t === 'M') {
      cur = { start: [s.x, s.y], segs: [], closed: false };
      groups.push(cur);
      continue;
    }
    if (!cur || cur.closed) groups.push((cur = { start: [s.x0, s.y0], segs: [], closed: false }));
    cur.segs.push(s);
    if (s.t === 'Z') cur.closed = true;
  }
  for (const g of groups) {
    if (!g.segs.length) continue; // a lone moveto is not stroked
    const pieces = toCubics(g.segs).filter((c) => c.t !== 'M').map((c) => ({ c, tan: endTangents(c) })).filter((p) => p.tan[0]);
    if (!pieces.length) {
      if (cap === 'round') fan(g.start, () => true);
      else if (cap === 'square') for (const sx of [-1, 1]) for (const sy of [-1, 1]) pts.push([g.start[0] + sx * hw, g.start[1] + sy * hw]);
      continue;
    }
    for (const { c, tan } of pieces) {
      for (const [p, t] of [[[c.x0, c.y0], tan[0]], [[c.x, c.y], tan[1]]]) {
        put(p, perp(t));
        put(p, perp(t), -hw);
      }
      if (c.t === 'C')
        for (const a of axes)
          for (const t of extremaT(dot(a, [c.x0, c.y0]), dot(a, [c.x1, c.y1]), dot(a, [c.x2, c.y2]), dot(a, [c.x, c.y]))) {
            const u = 1 - t;
            const q = [u * u * u * c.x0 + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x, u * u * u * c.y0 + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y];
            put(q, a);
            put(q, a, -hw);
          }
    }
    const joinAt = (p, ta, tb) => {
      const cr = cross(ta, tb);
      if (Math.abs(cr) < 1e-9) {
        if (dot(ta, tb) < 0 && join === 'round') fan(p, (u) => dot(u, ta) >= -1e-12); // a U-turn: half a disk ahead
        return;
      }
      const s = cr > 0 ? -1 : 1; // the outer side of the turn
      const n1 = perp(ta).map((v) => s * v), n2 = perp(tb).map((v) => s * v);
      if (join === 'round') {
        const det = cross(n1, n2);
        fan(p, (u) => cross(u, n2) / det >= -1e-12 && cross(n1, u) / det >= -1e-12);
      } else if (join !== 'bevel') {
        const cb = dot(n1, n2);
        if (Math.sqrt(2 / (1 + cb)) <= miterlimit + 1e-9) put(p, [(n1[0] + n2[0]) / (1 + cb), (n1[1] + n2[1]) / (1 + cb)]);
      }
    };
    for (let i = 0; i + 1 < pieces.length; i++) joinAt([pieces[i].c.x, pieces[i].c.y], pieces[i].tan[1], pieces[i + 1].tan[0]);
    const first = pieces[0], last = pieces[pieces.length - 1];
    if (g.closed) joinAt([last.c.x, last.c.y], last.tan[1], first.tan[0]);
    else
      for (const [p, T] of [[[first.c.x0, first.c.y0], first.tan[0].map((v) => -v)], [[last.c.x, last.c.y], last.tan[1]]]) {
        if (cap === 'round') fan(p, (u) => dot(u, T) >= -1e-12);
        else if (cap === 'square') {
          const e = [p[0] + hw * T[0], p[1] + hw * T[1]];
          put(e, perp(T));
          put(e, perp(T), -hw);
        }
      }
  }
  if (!pts.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [px, py] of pts) {
    const [x, y] = applyPt(m, px, py);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

/** Approximate segment length in user units (lines exact; curves: mean of chord and control polygon; arcs: radius x angle). */
export function segLength(s) {
  const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  if (s.t === 'L' || s.t === 'Z') return dist(s.x0, s.y0, s.x, s.y);
  if (s.t === 'C') return (dist(s.x0, s.y0, s.x, s.y) + dist(s.x0, s.y0, s.x1, s.y1) + dist(s.x1, s.y1, s.x2, s.y2) + dist(s.x2, s.y2, s.x, s.y)) / 2;
  if (s.t === 'Q') return (dist(s.x0, s.y0, s.x, s.y) + dist(s.x0, s.y0, s.x1, s.y1) + dist(s.x1, s.y1, s.x, s.y)) / 2;
  if (s.t === 'A') {
    const { r } = arcToCubics(s);
    return r ? (Math.max(r.rx, r.ry) * r.sweepDeg * Math.PI) / 180 : dist(s.x0, s.y0, s.x, s.y);
  }
  return 0;
}

/** Group absolute segments into subpaths (each starts at an M). */
export function subpaths(segs) {
  const out = [];
  let cur = null;
  for (const s of segs) {
    if (s.t === 'M' || !cur) {
      cur = { start: s, segs: [] };
      out.push(cur);
      if (s.t === 'M') continue;
    }
    cur.segs.push(s);
  }
  return out;
}

// ---------- basic shapes ----------
const NUMRE = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
export const numbersIn = (s) => (String(s ?? '').match(NUMRE) ?? []).map(Number);

/** Length attribute -> user units; % resolves against `ref`. Returns null when absent or unparsable. */
export function parseLength(v, ref = 0) {
  if (v == null || v === '' || v === 'auto') return null;
  const m = String(v).trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(px|%|pt|pc|mm|cm|in|em|ex)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const k = { px: 1, pt: 4 / 3, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, em: 16, ex: 8 }[m[2]];
  return m[2] === '%' ? (n / 100) * ref : n * (k ?? 1);
}

export function parseViewBox(v) {
  if (v == null) return null;
  const n = numbersIn(v);
  if (n.length !== 4 || !(n[2] > 0) || !(n[3] > 0) || String(v).replace(NUMRE, '').replace(/[\s,]/g, '')) return null;
  return { x: n[0], y: n[1], w: n[2], h: n[3] };
}

/**
 * Absolute segments for a basic shape or path element (same format as absoluteSegments), or null when the element
 * has no geometry. `vb` resolves percentages. Errors (bad path data) are returned alongside.
 */
export function shapeSegments(tag, attrs, vb = { w: 100, h: 100 }) {
  const diag = Math.hypot(vb.w, vb.h) / Math.SQRT2;
  const L = (k, ref, def = 0) => parseLength(attrs[k], ref) ?? def;
  const arc = (x0, y0, rx, ry, x, y) => ({ t: 'A', x0, y0, rx, ry, rot: 0, large: 0, sweep: 1, x, y, shape: true });
  const line = (x0, y0, x, y) => ({ t: 'L', x0, y0, x, y });
  if (tag === 'path') {
    const p = parsePathData(attrs.d ?? '');
    return { segs: absoluteSegments(p.cmds), error: p.error, numbers: p.numbers };
  }
  if (tag === 'rect') {
    const x = L('x', vb.w), y = L('y', vb.h), w = L('width', vb.w), h = L('height', vb.h);
    if (!(w > 0) || !(h > 0)) return { segs: [] };
    let rx = parseLength(attrs.rx, vb.w), ry = parseLength(attrs.ry, vb.h);
    if (rx == null) rx = ry ?? 0;
    if (ry == null) ry = rx;
    rx = Math.min(Math.max(rx, 0), w / 2);
    ry = Math.min(Math.max(ry, 0), h / 2);
    if (!rx || !ry) return { segs: [{ t: 'M', x, y }, line(x, y, x + w, y), line(x + w, y, x + w, y + h), line(x + w, y + h, x, y + h), { t: 'Z', x0: x, y0: y + h, x, y }] };
    return {
      segs: [
        { t: 'M', x: x + rx, y },
        line(x + rx, y, x + w - rx, y),
        arc(x + w - rx, y, rx, ry, x + w, y + ry),
        line(x + w, y + ry, x + w, y + h - ry),
        arc(x + w, y + h - ry, rx, ry, x + w - rx, y + h),
        line(x + w - rx, y + h, x + rx, y + h),
        arc(x + rx, y + h, rx, ry, x, y + h - ry),
        line(x, y + h - ry, x, y + ry),
        arc(x, y + ry, rx, ry, x + rx, y),
        { t: 'Z', x0: x + rx, y0: y, x: x + rx, y },
      ],
      radius: { rx, ry },
    };
  }
  if (tag === 'circle' || tag === 'ellipse') {
    const cx = L('cx', vb.w), cy = L('cy', vb.h);
    let rx, ry;
    if (tag === 'circle') rx = ry = L('r', diag);
    else {
      rx = parseLength(attrs.rx, vb.w);
      ry = parseLength(attrs.ry, vb.h);
      if (rx == null) rx = ry ?? 0;
      if (ry == null) ry = rx;
    }
    if (!(rx > 0) || !(ry > 0)) return { segs: [] };
    return {
      segs: [
        { t: 'M', x: cx + rx, y: cy },
        arc(cx + rx, cy, rx, ry, cx, cy + ry),
        arc(cx, cy + ry, rx, ry, cx - rx, cy),
        arc(cx - rx, cy, rx, ry, cx, cy - ry),
        arc(cx, cy - ry, rx, ry, cx + rx, cy),
        { t: 'Z', x0: cx + rx, y0: cy, x: cx + rx, y: cy },
      ],
    };
  }
  if (tag === 'line') {
    const x1 = L('x1', vb.w), y1 = L('y1', vb.h), x2 = L('x2', vb.w), y2 = L('y2', vb.h);
    return { segs: [{ t: 'M', x: x1, y: y1 }, line(x1, y1, x2, y2)] };
  }
  if (tag === 'polyline' || tag === 'polygon') {
    const n = numbersIn(attrs.points);
    if (n.length < 2) return { segs: [] };
    const segs = [{ t: 'M', x: n[0], y: n[1] }];
    let px = n[0], py = n[1];
    for (let i = 2; i + 1 < n.length; i += 2) {
      segs.push(line(px, py, n[i], n[i + 1]));
      px = n[i];
      py = n[i + 1];
    }
    if (tag === 'polygon') segs.push({ t: 'Z', x0: px, y0: py, x: n[0], y: n[1] });
    return { segs, error: n.length % 2 ? { detail: 'odd number of coordinates in points; the last one is ignored' } : null };
  }
  return null;
}

/** Anchor points: every segment end except closepath (what design tools show as nodes). */
export const nodeCount = (segs) => segs.filter((s) => s.t !== 'Z').length;

/** Decimal places of a numeric token, exponent included (1.5e-3 has 4). */
export function decimals(tok) {
  const m = String(tok).match(/^[+-]?(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
  if (!m) return 0;
  return Math.max(0, (m[2]?.length ?? 0) - Number(m[3] ?? 0));
}
