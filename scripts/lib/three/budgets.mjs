// 3D budgets for `cstack 3d inspect` and `cstack 3d frames`. Bytes are decimal (1 MB = 1,000,000 B).
// Sources (docs/research/3d.md §5, read 2026-10-03):
//   web-hero  cstack default web budget, inferred and still to be benchmarked: GLB <= 2.5 MB transferred,
//             <= 100k triangles, textures <= 2k (KTX2), poster as the LCP element.
//   ar        Shopify Partners 3D model standards checklist (documented): about 4 MB total, textures <= 2048x2048,
//             real-world scale, origin at the centre of the product's base.
//             https://help.shopify.com/partners/resources/creating-3d-models/3d-model-standards-checklist
//             No documented AR triangle cap: the web value is applied as a warning (inferred).
//   social    GLB used as the source of a Blender turntable (Flow C). Offline render, so bytes are not gated;
//             the triangle and texture caps are warnings (inferred).
//   frames    image-sequence hero <= 150 frames, <= 8 MB (cstack default, inferred). Worked example in the doc:
//             120 WebP frames at q85 = 6.4 MB, the same frames as JPEG = 14 MB. Canvas about 1080 px wide
//             (§4, one practitioner write-up, documented): a warning, since the doc says "about".

export const BUDGETS = {
  'web-hero': {
    label: 'web hero (rotating/scroll GLB)',
    bytes: { max: 2_500_000, level: 'fail' },
    triangles: { max: 100_000, level: 'fail' },
    texture: { max: 2048, level: 'fail' },
    scale: 'optional',
    origin: 'spin-axis',
    compression: 'web',
    source: 'docs/research/3d.md §5 cstack default web budget (inferred)',
  },
  ar: {
    label: 'AR (Scene Viewer / WebXR GLB; USDZ is a separate file)',
    bytes: { max: 4_000_000, level: 'fail' },
    triangles: { max: 100_000, level: 'warn' },
    texture: { max: 2048, level: 'fail' },
    scale: 'required',
    origin: 'base-centre',
    compression: 'device',
    source: 'Shopify Partners 3D model standards checklist (documented), via docs/research/3d.md §5',
  },
  social: {
    label: 'social turntable (GLB as the Blender render source)',
    bytes: null,
    triangles: { max: 1_000_000, level: 'warn' },
    texture: { max: 4096, level: 'warn' },
    scale: 'optional',
    origin: 'normalized',
    compression: 'render',
    source: 'docs/research/3d.md §8 Flow C (inferred)',
  },
};

export const FRAME_BUDGET = { max_frames: 150, max_bytes: 8_000_000, max_width: 1080 };

export const BUDGET_IDS = Object.keys(BUDGETS);

/** "8MB" | "500KB" | "8MiB" | "1.5MB" | "8000000" -> bytes. MB is decimal, MiB is binary. */
export function parseBytes(v, fallback) {
  if (v === undefined || v === null || v === true || v === '') return fallback;
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.round(v);
  const m = String(v).trim().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|kib|mib|gib)?$/i);
  if (!m) throw new Error(`invalid byte size "${v}" (use 8MB, 500KB, 8MiB or a byte count)`);
  const mult = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3 }[(m[2] ?? 'b').toLowerCase()];
  return Math.round(Number(m[1]) * mult);
}

export const fmtInt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 2483113 -> "2.48 MB"; always decimal units so it matches the budgets. */
export function fmtBytes(n) {
  if (n == null) return 'unknown';
  if (n < 1000) return `${n} B`;
  if (n < 1e6) return `${(n / 1e3).toFixed(1)} KB`;
  return `${(n / 1e6).toFixed(2)} MB`;
}

/** "2.48 MB (2,483,113 B)"; below 1 KB the plain byte count already is exact. */
export const fmtBytesExact = (n) => (n < 1000 ? fmtBytes(n) : `${fmtBytes(n)} (${fmtInt(n)} B)`);

export const worst = (findings) => (findings.some((f) => f.level === 'fail') ? 'fail' : findings.some((f) => f.level === 'warn') ? 'warn' : 'pass');
