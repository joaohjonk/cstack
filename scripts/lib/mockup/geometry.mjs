// Placement geometry for mockups. A mapper links art surface coordinates (s, t) in [0,1]² (s across, t down) to base
// pixels. Continuous pixel coordinates: pixel (i, j) covers [i, i+1) × [j, j+1) and its centre is (i + 0.5, j + 0.5).
//   quad      homography from the unit square to corners TL, TR, BR, BL (Heckbert, "Fundamentals of Texture Mapping").
//   cylinder  vertical axis seen side-on (orthographic): x = axis_x + R·sin θ, so θ = asin((x − axis_x)/R) and the label
//             arc length is u = R·θ, compressing toward the edges. ellipse_top / ellipse_bottom (px) bend horizontal
//             label lines for camera pitch: y = y_front − e·(1 − cos θ); positive e = seen from above.
//   mesh      rows of control points; each cell is a bilinear patch, inverted in closed form (Quilez, "inverse bilinear").
// inv(x, y, out) writes [s, t, edge] and returns true when the point maps (it extrapolates slightly past the art edges so
// edges can be antialiased); edge = screen-px distance to the mapper's own visibility limit (the cylinder's visible arc),
// Infinity otherwise. fwd(s, t, out) writes [x, y] and returns false where the surface is not visible.

const cross = (ax, ay, bx, by) => ax * by - ay * bx;
const RAD = Math.PI / 180;

/** Signed area (positive when listed TL, TR, BR, BL as seen on screen, y down) and convexity of a 4-point polygon. */
export function quadShape(p) {
  let area = 0, pos = 0, neg = 0;
  for (let i = 0; i < 4; i++) {
    const a = p[i], b = p[(i + 1) % 4], c = p[(i + 2) % 4];
    area += a[0] * b[1] - b[0] * a[1];
    const z = cross(b[0] - a[0], b[1] - a[1], c[0] - b[0], c[1] - b[1]);
    if (z > 1e-9) pos++;
    else if (z < -1e-9) neg++;
  }
  return { area: area / 2, convex: pos === 4 || neg === 4 };
}

/** Homography coefficients [a..h] with x = (a s + b t + c)/(g s + h t + 1), y = (d s + e t + f)/(g s + h t + 1). */
export function squareToQuad(q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  if (Math.abs(sx) < 1e-12 && Math.abs(sy) < 1e-12) return [x1 - x0, x3 - x0, x0, y1 - y0, y3 - y0, y0, 0, 0];
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den, h = (dx1 * sy - sx * dy1) / den;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h];
}

function checkCorners(q, what) {
  const { area, convex } = quadShape(q);
  if (!convex || Math.abs(area) < 1) throw new Error(`${what} must be a convex quadrilateral of at least 1 px² listed TL, TR, BR, BL`);
  if (area < 0) throw new Error(`${what} is mirrored (the art would render flipped): list corners TL, TR, BR, BL as seen in the base`);
}

export function quadMapper(corners) {
  checkCorners(corners, 'quad');
  const [a, b, c, d, e, f, g, h] = squareToQuad(corners);
  // adjugate of [[a b c][d e f][g h 1]]
  const A = e - f * h, B = c * h - b, C = b * f - c * e;
  const D = f * g - d, E = a - c * g, F = c * d - a * f;
  const G = d * h - e * g, H = b * g - a * h, I = a * e - b * d;
  const mx = (corners[0][0] + corners[1][0] + corners[2][0] + corners[3][0]) / 4;
  const my = (corners[0][1] + corners[1][1] + corners[2][1] + corners[3][1]) / 4;
  const side = Math.sign(G * mx + H * my + I); // points past the vanishing line flip sign
  return {
    kind: 'quad',
    inv(x, y, out) {
      const w = G * x + H * y + I;
      if (w * side <= 0) return false;
      out[0] = (A * x + B * y + C) / w;
      out[1] = (D * x + E * y + F) / w;
      out[2] = Infinity;
      return true;
    },
    fwd(s, t, out) {
      const w = g * s + h * t + 1;
      out[0] = (a * s + b * t + c) / w;
      out[1] = (d * s + e * t + f) / w;
      return true;
    },
  };
}

export function cylinderMapper(p) {
  const { axis_x: cx, top, bottom, radius: R } = p;
  const vis = (p.visible_arc ?? 180) * RAD, arc = (p.art_arc ?? p.visible_arc ?? 180) * RAD, rot = (p.rotation ?? 0) * RAD;
  const et = p.ellipse_top ?? 0, eb = p.ellipse_bottom ?? 0;
  if (!(R > 0) || !(bottom > top)) throw new Error('cylinder needs radius > 0 and bottom > top');
  if (!(vis > 0 && vis <= Math.PI + 1e-9) || !(arc > 0 && arc <= 2 * Math.PI + 1e-9)) throw new Error('cylinder visible_arc must be in (0, 180] and art_arc in (0, 360] degrees');
  const kMax = 1 - Math.cos(vis / 2);
  if (bottom - top - kMax * (eb - et) <= 0) throw new Error('cylinder ellipse_top/ellipse_bottom fold the label (the bottom edge rises above the top edge at the sides)');
  if (Math.abs(rot) - arc / 2 >= vis / 2) throw new Error('cylinder rotation turns the art entirely out of the visible arc');
  const lim = Math.sin(vis / 2);
  return {
    kind: 'cylinder',
    inv(x, y, out) {
      const xi = (x - cx) / R;
      const edge = (lim - Math.abs(xi)) * R;
      if (edge < -2) return false;
      const th = Math.asin(Math.max(-1, Math.min(1, xi)));
      const k = 1 - Math.cos(th);
      out[0] = 0.5 + (th - rot) / arc;
      out[1] = (y - (top - k * et)) / (bottom - top - k * (eb - et));
      out[2] = edge;
      return true;
    },
    fwd(s, t, out) {
      const th = rot + (s - 0.5) * arc;
      if (Math.abs(th) > vis / 2 + 1e-9) return false;
      const k = 1 - Math.cos(th);
      out[0] = cx + R * Math.sin(th);
      out[1] = top - k * et + t * (bottom - top - k * (eb - et));
      return true;
    },
  };
}

// Closed-form inverse of the bilinear patch a(TL) b(TR) c(BR) d(BL); q = [ax, ay, bx, by, cx, cy, dx, dy].
// Of the two roots, keeps the one whose (u, v) lies nearest the unit square.
export function invBilinear(x, y, q, out) {
  const [ax, ay, bx, by, cx, cy, dx, dy] = q;
  const ex = bx - ax, ey = by - ay, fx = dx - ax, fy = dy - ay;
  const gx = ax - bx + cx - dx, gy = ay - by + cy - dy, hx = x - ax, hy = y - ay;
  const k2 = cross(gx, gy, fx, fy), k1 = cross(ex, ey, fx, fy) + cross(hx, hy, gx, gy), k0 = cross(hx, hy, ex, ey);
  let disc = k1 * k1 - 4 * k0 * k2;
  if (disc < 0) {
    if (disc < -1e-9 * k1 * k1) return false;
    disc = 0;
  }
  const qq = -0.5 * (k1 + (k1 >= 0 ? Math.sqrt(disc) : -Math.sqrt(disc))); // stable roots: k0/qq and qq/k2
  let best = Infinity;
  for (const v of [qq !== 0 ? k0 / qq : NaN, k2 !== 0 ? qq / k2 : NaN]) {
    if (!Number.isFinite(v)) continue;
    const nx = ex + gx * v, ny = ey + gy * v;
    if (Math.abs(nx) < 1e-12 && Math.abs(ny) < 1e-12) continue;
    const u = Math.abs(nx) > Math.abs(ny) ? (hx - fx * v) / nx : (hy - fy * v) / ny;
    const ex2 = Math.max(-u, u - 1, -v, v - 1, 0);
    if (ex2 < best) ((best = ex2), (out[0] = u), (out[1] = v));
  }
  return best < Infinity;
}

export function meshMapper(rows) {
  const R = rows.length, C = rows[0]?.length ?? 0;
  if (R < 2 || C < 2 || rows.some((r) => r.length !== C)) throw new Error('mesh needs at least 2 rows of at least 2 [x, y] points, every row the same length');
  const cells = [];
  let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
  for (let i = 0; i < R - 1; i++)
    for (let j = 0; j < C - 1; j++) {
      const q = [rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]];
      checkCorners(q, `mesh cell (row ${i}, col ${j})`);
      const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
      const bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      ((X0 = Math.min(X0, bb[0])), (Y0 = Math.min(Y0, bb[1])), (X1 = Math.max(X1, bb[2])), (Y1 = Math.max(Y1, bb[3])));
      cells.push({ i, j, q: q.flat(), bb });
    }
  // bucket grid for point location; cells are padded so points just outside the mesh still find a border cell
  const PAD = 2, NB = Math.min(64, Math.max(4, 2 * Math.ceil(Math.sqrt(cells.length))));
  ((X0 -= PAD), (Y0 -= PAD), (X1 += PAD), (Y1 += PAD));
  const bw = (X1 - X0) / NB, bh = (Y1 - Y0) / NB;
  const buckets = Array.from({ length: NB * NB }, () => []);
  for (const [k, c] of cells.entries()) {
    const bx0 = Math.max(0, Math.floor((c.bb[0] - PAD - X0) / bw)), bx1 = Math.min(NB - 1, Math.floor((c.bb[2] + PAD - X0) / bw));
    const by0 = Math.max(0, Math.floor((c.bb[1] - PAD - Y0) / bh)), by1 = Math.min(NB - 1, Math.floor((c.bb[3] + PAD - Y0) / bh));
    for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) buckets[by * NB + bx].push(k);
  }
  const uv = new Float64Array(2), EPS = 1e-7;
  return {
    kind: 'mesh',
    inv(x, y, out) {
      const bx = Math.floor((x - X0) / bw), by = Math.floor((y - Y0) / bh);
      if (bx < 0 || by < 0 || bx >= NB || by >= NB) return false;
      let best = Infinity, bs = 0, bt = 0;
      for (const k of buckets[by * NB + bx]) {
        const c = cells[k];
        if (!invBilinear(x, y, c.q, uv)) continue;
        const [u, v] = uv;
        let ex = Math.max(-u, u - 1, -v, v - 1, 0);
        if (ex <= EPS) ex = 0;
        // outside its cell: only border cells may extrapolate, and only outward
        else if ((-u > EPS && c.j > 0) || (u - 1 > EPS && c.j < C - 2) || (-v > EPS && c.i > 0) || (v - 1 > EPS && c.i < R - 2)) continue;
        if (ex < best) ((best = ex), (bs = (c.j + u) / (C - 1)), (bt = (c.i + v) / (R - 1)));
        if (ex === 0) break;
      }
      if (best > 0.5) return false;
      out[0] = bs;
      out[1] = bt;
      out[2] = Infinity;
      return true;
    },
    fwd(s, t, out) {
      const fs = s * (C - 1), ft = t * (R - 1);
      const j = Math.min(C - 2, Math.max(0, Math.floor(fs))), i = Math.min(R - 2, Math.max(0, Math.floor(ft)));
      const u = fs - j, v = ft - i, q = cells[i * (C - 1) + j].q;
      const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w11 = u * v, w01 = (1 - u) * v;
      out[0] = w00 * q[0] + w10 * q[2] + w11 * q[4] + w01 * q[6];
      out[1] = w00 * q[1] + w10 * q[3] + w11 * q[5] + w01 * q[7];
      return true;
    },
  };
}

export function makeMapper(p) {
  if (p.kind === 'quad') return quadMapper(p.quad);
  if (p.kind === 'cylinder') return cylinderMapper(p.cylinder);
  if (p.kind === 'mesh') return meshMapper(p.mesh);
  throw new Error(`unknown placement kind "${p.kind}"`);
}

/**
 * Where the art region lands in the surface unit square, as {s0, t0, sw, sh}. Without a declared surface aspect, or with
 * fit 'stretch', the art fills the surface. 'contain' letterboxes, 'cover' crops; both keep the art's proportions.
 */
export function fitRect(fit, artAspect, surfaceAspect) {
  if (!surfaceAspect || fit === 'stretch') return { s0: 0, t0: 0, sw: 1, sh: 1 };
  const r = artAspect / surfaceAspect; // > 1: art relatively wider than the surface
  if ((fit !== 'cover') === r > 1) return { s0: 0, t0: (1 - 1 / r) / 2, sw: 1, sh: 1 / r };
  return { s0: (1 - r) / 2, t0: 0, sw: r, sh: 1 };
}

/**
 * Screen footprint of the surface rect E = {s0, s1, t0, t1}, sampled n×n: bounding box (px), the largest screen length
 * per unit s and per unit t (js, jt: drives the raster size the art needs) and the mean screen length of E's horizontal
 * and vertical edges (len_s, len_t: drives the verify grid). null when nothing is visible.
 */
export function footprint(mapper, E, n = 48) {
  const p = new Float64Array(2), q = new Float64Array(2);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, js = 0, jt = 0;
  const ds = (E.s1 - E.s0) / (n * 4), dt = (E.t1 - E.t0) / (n * 4);
  for (let iy = 0; iy <= n; iy++)
    for (let ix = 0; ix <= n; ix++) {
      const s = E.s0 + ((E.s1 - E.s0) * ix) / n, t = E.t0 + ((E.t1 - E.t0) * iy) / n;
      if (!mapper.fwd(s, t, p)) continue;
      ((x0 = Math.min(x0, p[0])), (y0 = Math.min(y0, p[1])), (x1 = Math.max(x1, p[0])), (y1 = Math.max(y1, p[1])));
      if (ds > 0 && mapper.fwd(s + (ix < n ? ds : -ds), t, q)) js = Math.max(js, Math.hypot(q[0] - p[0], q[1] - p[1]) / ds);
      if (dt > 0 && mapper.fwd(s, t + (iy < n ? dt : -dt), q)) jt = Math.max(jt, Math.hypot(q[0] - p[0], q[1] - p[1]) / dt);
    }
  if (x0 === Infinity) return null;
  // screen length of a line across E, scaled up by the share of it that is visible (a cylinder hides part of a wrap)
  const lineLen = (pt) => {
    let len = 0, seen = 0, prev = null;
    for (let k = 0; k <= n; k++) {
      if (!pt(k / n, p)) {
        prev = null;
        continue;
      }
      seen++;
      if (prev) len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      prev = [p[0], p[1]];
    }
    return seen > 1 ? (len * n) / (seen - 1) : 0;
  };
  const mean = (xs) => (xs.some((x) => x > 0) ? xs.reduce((a, x) => a + x, 0) / xs.filter((x) => x > 0).length : 0);
  const thirds = (a, b) => [a, (a + b) / 2, b];
  const len_s = mean(thirds(E.t0, E.t1).map((t) => lineLen((k, o) => mapper.fwd(E.s0 + (E.s1 - E.s0) * k, t, o))));
  const len_t = mean(thirds(E.s0, E.s1).map((s) => lineLen((k, o) => mapper.fwd(s, E.t0 + (E.t1 - E.t0) * k, o))));
  return { bbox: { x0, y0, x1, y1 }, js, jt, len_s, len_t };
}
