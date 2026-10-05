// cstack mockup template can: a beverage-can template package drawn by code, so a concept wrap can be seen on a can
// without a licensed photo (field test F75: `mockup render` needs a template and cstack shipped none). The scene is a
// plain aluminium can on a warm white ground, front-lit, seen slightly from above. Nothing is photographed, so the
// package is CC0 and cleared for client use; it is a comp, not a product photograph.
import fs from 'node:fs';
import path from 'node:path';
import { encodePNG } from '../image/png.mjs';
import { writeJSON } from '../core.mjs';

// Wrap sizes in mm: diameter and printable label height. Standard and sleek 12 oz (355 ml), tall 16 oz (473 ml).
// Typical industry dimensions, rounded; a converter's dieline wins over these for print.
export const CAN_SIZES = {
  'standard-12oz': { diameter: 66, height: 122, label: 98, note: '12 oz / 355 ml standard' },
  'sleek-12oz': { diameter: 58, height: 146, label: 122, note: '12 oz / 355 ml sleek' },
  'tall-16oz': { diameter: 66, height: 157, label: 134, note: '16 oz / 473 ml tall' },
};

const W = 1200;
const H = 1600;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

/** The wrap's flat art size: circumference x label height, in mm and at 12 px/mm. */
export function wrapSize(size) {
  const s = CAN_SIZES[size];
  if (!s) throw new Error(`unknown can size "${size}" (${Object.keys(CAN_SIZES).join(', ')})`);
  const w = Math.round(Math.PI * s.diameter * 10) / 10;
  return { mm: { w, h: s.label }, px: { w: Math.round(w * 12), h: Math.round(s.label * 12) }, aspect: Math.round((w / s.label) * 1000) / 1000 };
}

/** Geometry of the drawn can in base pixels. */
export function canGeometry(size) {
  const s = CAN_SIZES[size];
  if (!s) throw new Error(`unknown can size "${size}" (${Object.keys(CAN_SIZES).join(', ')})`);
  const scale = 1100 / s.height; // px per mm: the can stands 1100 px tall
  const r = Math.round((s.diameter / 2) * scale);
  const sag = Math.round(r * 0.14); // seen slightly from above
  const ax = W / 2;
  const bodyTop = Math.round((H - 1100) / 2 + 40); // where the body meets the shoulder, at the front
  const bodyBottom = bodyTop + 1100 - 80;
  const labelPad = Math.round(((s.height - s.label) / 2) * scale);
  return { r, sag, ax, bodyTop, bodyBottom, labelTop: bodyTop + labelPad - 40, labelBottom: bodyBottom - labelPad + 40, scale };
}

function drawCan(size) {
  const g = canGeometry(size);
  const data = Buffer.alloc(W * H * 4);
  const ground = [246, 244, 239];
  // edge curve of the body: y at offset dx from the axis, for an edge whose front sits at yFront
  const edge = (yFront, dx) => yFront - g.sag * (1 - Math.sqrt(clamp(1 - (dx / g.r) ** 2)));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let [R, G, B] = ground;
      // a soft floor shadow, offset right, under the can
      const sx = (x - g.ax - g.r * 0.25) / (g.r * 1.5);
      const sy = (y - g.bodyBottom - g.sag * 0.4) / (g.sag * 1.6);
      const sh = clamp(1 - Math.sqrt(sx * sx + sy * sy));
      const shade = 1 - 0.22 * sh * sh;
      R *= shade;
      G *= shade;
      B *= shade;
      const dx = x - g.ax;
      const ax = Math.abs(dx);
      if (ax <= g.r + 1) {
        const n = clamp(dx / g.r, -1, 1);
        const cover = clamp(g.r + 0.5 - ax); // 1 px antialiased silhouette
        const top = edge(g.bodyTop, dx);
        const bottom = edge(g.bodyBottom, dx);
        const inBody = clamp(y - top + 0.5) * clamp(bottom - y + 0.5);
        // brushed aluminium: diffuse from the front-left, a specular band, darker towards the silhouette
        const diffuse = 0.55 + 0.35 * Math.cos(((n + 0.25) * Math.PI) / 2.2);
        const spec = Math.exp(-(((n + 0.42) / 0.09) ** 2)) * 0.35 + Math.exp(-(((n - 0.62) / 0.05) ** 2)) * 0.12;
        const L = clamp(diffuse + spec) * 236;
        const body = [L, L, L * 1.01];
        // the lid: an ellipse above the body, a darker well inside a bright rim
        const ey = (y - (g.bodyTop - g.sag - 26)) / g.sag;
        const ex = dx / (g.r * 0.9);
        const lidD = ex * ex + ey * ey;
        const lid = lidD <= 1 ? (lidD > 0.78 ? [222, 222, 224] : [176, 177, 180]) : null;
        // the shoulder between lid and body
        const shoulder = y < top && y >= g.bodyTop - g.sag - 26 && ax <= g.r * (0.9 + 0.1 * clamp((y - (g.bodyTop - g.sag - 26)) / (top - (g.bodyTop - g.sag - 26) || 1))) ? [L * 0.9, L * 0.9, L * 0.92] : null;
        let px = null;
        let a = 0;
        if (inBody > 0) {
          px = body;
          a = inBody * cover;
        } else if (lid) {
          px = lid;
          a = 1;
        } else if (shoulder) {
          px = shoulder;
          a = cover;
        }
        // the base: a darker chime just below the body
        if (!px && y > bottom && y < bottom + 18 && ax < g.r * 0.92) {
          px = [L * 0.62, L * 0.62, L * 0.64];
          a = 1;
        }
        if (px) {
          R = R * (1 - a) + px[0] * a;
          G = G * (1 - a) + px[1] * a;
          B = B * (1 - a) + px[2] * a;
        }
      }
      data.set([Math.round(R), Math.round(G), Math.round(B), 255], (y * W + x) * 4);
    }
  }
  return { width: W, height: H, data, geometry: g };
}

/** makeCanTemplate({size, out, force}) writes <out>/base.png and <out>/template.json; returns the paths and the wrap size. */
export function makeCanTemplate({ size = 'standard-12oz', out, force = false } = {}) {
  if (!out || out === true) throw new Error('--out <dir> required');
  const dir = path.resolve(String(out));
  const files = { base: path.join(dir, 'base.png'), template: path.join(dir, 'template.json') };
  for (const f of Object.values(files)) if (fs.existsSync(f) && !force) throw new Error(`${f} exists; pass --force to replace it`);
  const img = drawCan(size);
  const g = img.geometry;
  const wrap = wrapSize(size);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(files.base, encodePNG(img));
  const cyl = (rotation) => ({ axis_x: g.ax, top: g.labelTop, bottom: g.labelBottom, radius: g.r, visible_arc: 180, art_arc: 360, rotation, ellipse_top: g.sag, ellipse_bottom: g.sag });
  const shading = [
    { mode: 'multiply', from: 'base', opacity: 0.75 },
    { mode: 'screen', from: 'base', opacity: 0.55, threshold: 0.86 },
  ];
  const placements = [
    { id: 'front', rotation: 0, notes: 'the wrap centre faces the camera' },
    { id: 'left', rotation: -90, notes: 'the wrap turned so its left quarter faces the camera' },
    { id: 'back', rotation: 180, notes: 'the wrap seam side faces the camera' },
  ].map((p) => ({ id: p.id, kind: 'cylinder', cylinder: cyl(p.rotation), shading, notes: `${p.notes}; art is the full flat wrap, ${wrap.mm.w} x ${wrap.mm.h} mm (aspect ${wrap.aspect})` }));
  const spec = {
    id: `can-${size}`,
    base: 'base.png',
    placements,
    licence: { source: 'drawn by cstack (scripts/lib/mockup/can.mjs); no photograph', terms: 'CC0-1.0', client_use_allowed: true },
    notes: `${CAN_SIZES[size].note} can, seen slightly from above. Render one placement at a time (--placement front|left|back): each shows the half of the wrap that faces the camera. A comp for concept work, not a product photograph.`,
    meta: { size, wrap_mm: wrap.mm, wrap_px_at_12_per_mm: wrap.px, made_by: 'cstack mockup template can' },
  };
  writeJSON(files.template, spec);
  return { dir, ...files, size, wrap };
}
