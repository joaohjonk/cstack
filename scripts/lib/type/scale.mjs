// Type scale math: modular (base × ratio^n) and fluid (clamp() between two viewports). Pure functions; the CLI
// prints. `--tokens` emits a DTCG 2025.10 fragment and never writes brand state.

export const RATIOS = {
  'minor-second': 1.067,
  'major-second': 1.125,
  'minor-third': 1.2,
  'major-third': 1.25,
  'perfect-fourth': 1.333,
  'augmented-fourth': 1.414,
  'perfect-fifth': 1.5,
  golden: 1.618,
};
export const BODY_RANGE = [14, 24]; // px sizes that get measure guidance
export const MEASURE = { min: 45, ideal: 66, max: 75, unit: 'characters per line', status: 'default, not a law' };
export const NOTES = [
  'line-height: 1.5 at the base size, -0.2 per doubling of size (4x the base lands at 1.1), clamped to 1.1-1.65',
  'tracking: slightly positive below 14px, 0 from 14 to 20px, slightly negative for display sizes; tune per typeface',
  'all-caps and small caps: add +0.05 to +0.1em letter-spacing (more at small sizes)',
  'measure: 45-75 characters per line, ~66 ideal, for body sizes. A default, not a law; approx width assumes ~0.5em per character',
];

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const r3 = (n) => Math.round((n + Number.EPSILON) * 1000) / 1000 || 0;
const r4 = (n) => Math.round((n + Number.EPSILON) * 10000) / 10000;

function num(v, name, { min = 0, max = Infinity } = {}) {
  if (v === true) throw new Error(`--${name} needs a value`);
  const n = Number(v);
  if (!Number.isFinite(n) || n <= min || n > max) throw new Error(`bad --${name} "${v}" (expected a number above ${min}${max < Infinity ? ` and up to ${max}` : ''})`);
  return n;
}

export function parseRatio(v, name = 'ratio') {
  if (typeof v === 'string' && RATIOS[v.toLowerCase()]) return RATIOS[v.toLowerCase()];
  const n = num(v, name, { min: 1, max: 4 });
  return n;
}
export const ratioName = (r) => Object.entries(RATIOS).find(([, x]) => Math.abs(x - r) < 0.0015)?.[0] ?? null;

/** "-2..6" or "-1,0,1,2" -> sorted unique integers. */
export function parseSteps(v = '-2..6') {
  const s = String(v).trim();
  const m = s.match(/^(-?\d+)\.\.(-?\d+)$/);
  let list;
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])].sort((x, y) => x - y);
    list = Array.from({ length: b - a + 1 }, (_, i) => a + i);
  } else list = s.split(',').map((x) => Number(x.trim()));
  if (!list.length || list.some((n) => !Number.isInteger(n) || Math.abs(n) > 20) || list.length > 31) throw new Error(`bad --steps "${v}" (expected e.g. -2..6 or -1,0,1,2; integers within ±20)`);
  return [...new Set(list)].sort((a, b) => a - b);
}

// Line-height falls linearly in log2(size / base): 1.5 at the base, -0.2 per doubling, so a display size 4x the
// base gets 1.1. Clamped to [1.1, 1.65] so tiny captions stay readable and huge display type never goes under 1.1.
const lineHeightAt = (log2rel) => r2(Math.min(1.65, Math.max(1.1, 1.5 - 0.2 * log2rel)));
export const lineHeightFor = (px, base) => lineHeightAt(Math.log2(px / base));

// Tracking (em): +0.04 per halving below 14px (cap +0.03); 0 from 14 to 20px; -0.025 per doubling above 20px (cap -0.03).
export function trackingFor(px) {
  if (px < 14) return r3(Math.min(0.03, 0.04 * Math.log2(14 / px)));
  if (px > 20) return r3(Math.max(-0.03, -0.025 * Math.log2(px / 20)));
  return 0;
}
// All-caps tracking (em): +0.1 at 12px and below, easing (log2) to +0.05 at 48px and above.
export const capsTrackingFor = (px) => r3(0.1 - 0.05 * Math.min(1, Math.max(0, Math.log2(px / 12) / 2)));

export const roleFor = (px) => (px < BODY_RANGE[0] ? 'small' : px <= BODY_RANGE[1] ? 'body' : px <= 40 ? 'heading' : 'display');
const measureFor = (px) => (roleFor(px) === 'body' ? { ...MEASURE, approx_width_px: Math.round(MEASURE.ideal * 0.5 * px) } : undefined);

/** Modular scale: size(n) = base × ratio^n. */
export function typeScale({ base = 16, ratio = 1.25, steps = '-2..6', root = 16 } = {}) {
  base = num(base, 'base', { max: 200 });
  ratio = parseRatio(ratio);
  const rows = parseSteps(steps).map((step) => {
    const px = base * ratio ** step;
    const row = { step, px: r2(px), rem: r4(px / root), line_height: lineHeightFor(px, base), tracking_em: trackingFor(px), caps_tracking_em: capsTrackingFor(px), role: roleFor(px) };
    const m = measureFor(px);
    if (m) row.measure = m;
    return row;
  });
  return { kind: 'modular', base, ratio, ratio_name: ratioName(ratio), root, steps: rows, notes: NOTES };
}

// Fluid scale (the utopia.fyi method). Each step has one size at the small viewport (minBase × minRatio^n) and one
// at the large viewport (maxBase × maxRatio^n); in between the size is a straight line in viewport width:
//   slope     = (maxSize - minSize) / (maxVw - minVw)      px of type per px of viewport
//   intercept = minSize - slope × minVw                    px at a 0px-wide viewport
//   preferred = intercept/root rem + slope × 100 vw         (1vw = 1% of the viewport width)
// clamp(min, preferred, max) pins the line to its two endpoints; min and max swap when a negative step shrinks.
export function fluidScale({ minVw = 360, maxVw = 1440, minBase = 16, maxBase = 20, minRatio = 1.2, maxRatio = 1.333, steps = '-2..6', root = 16 } = {}) {
  minVw = num(minVw, 'min-vw', { max: 10000 });
  maxVw = num(maxVw, 'max-vw', { max: 10000 });
  if (maxVw <= minVw) throw new Error(`--max-vw (${maxVw}) must be larger than --min-vw (${minVw})`);
  minBase = num(minBase, 'min-base', { max: 200 });
  maxBase = num(maxBase, 'max-base', { max: 200 });
  minRatio = parseRatio(minRatio, 'min-ratio');
  maxRatio = parseRatio(maxRatio, 'max-ratio');
  const rows = parseSteps(steps).map((step) => {
    const a = minBase * minRatio ** step;
    const b = maxBase * maxRatio ** step;
    const slope = (b - a) / (maxVw - minVw);
    const intercept = a - slope * minVw;
    const preferred = { rem: r4(intercept / root), vw: r4(slope * 100) };
    const clamp = `clamp(${r4(Math.min(a, b) / root)}rem, ${preferred.rem}rem + ${preferred.vw}vw, ${r4(Math.max(a, b) / root)}rem)`;
    // line-height and tracking for a fluid step use its middle: the mean relative size and the geometric-mean px
    const mid = Math.sqrt(a * b);
    const row = { step, min: { px: r2(a), rem: r4(a / root) }, max: { px: r2(b), rem: r4(b / root) }, preferred, clamp, line_height: lineHeightAt((Math.log2(a / minBase) + Math.log2(b / maxBase)) / 2), tracking_em: trackingFor(mid), caps_tracking_em: capsTrackingFor(mid), role: roleFor(mid) };
    const m = measureFor(mid);
    if (m) row.measure = m;
    return row;
  });
  // Zoom: text sized in vw does not grow with browser zoom. A rem term in the preferred value keeps some growth, and a
  // step whose largest size stays within 2.5x its smallest can still reach 200% (WCAG 1.4.4); past that it may not.
  const warnings = [];
  for (const r of rows) {
    const spread = Math.max(r.min.px, r.max.px) / Math.min(r.min.px, r.max.px);
    if (spread > 2.5) warnings.push(`step ${r.step}: largest size is ${spread.toFixed(2)}x the smallest; above 2.5x, text can fail 200% zoom (WCAG 1.4.4): narrow the viewport range or the ratios`);
    if (r.preferred.rem <= 0) warnings.push(`step ${r.step}: preferred value has no positive rem term (${r.preferred.rem}rem), so zoom does not enlarge it inside the clamp`);
  }
  return { kind: 'fluid', viewport: { min: minVw, max: maxVw }, base: { min: minBase, max: maxBase }, ratio: { min: minRatio, max: maxRatio }, ratio_name: { min: ratioName(minRatio), max: ratioName(maxRatio) }, root, steps: rows, warnings, notes: NOTES };
}

const tokenName = (step) => `step-${step}`;
const dim = (rem) => ({ $type: 'dimension', $value: { value: rem, unit: 'rem' } });

/**
 * DTCG 2025.10 fragment: font.size.step-N (dimension, rem) and font.lineHeight.step-N (number). DTCG has no fluid
 * value type, so a fluid step is a group of min/max dimensions with the clamp() in $description and $extensions.
 */
export function scaleTokens(scale) {
  const size = { $description: describe(scale) };
  const lineHeight = {};
  for (const s of scale.steps) {
    const n = tokenName(s.step);
    size[n] =
      scale.kind === 'fluid'
        ? { $description: s.clamp, $extensions: { cstack: { clamp: s.clamp, viewport_px: [scale.viewport.min, scale.viewport.max] } }, min: dim(s.min.rem), max: dim(s.max.rem) }
        : { ...dim(s.rem), $description: `${s.px}px` };
    lineHeight[n] = { $type: 'number', $value: s.line_height };
  }
  return { font: { size, lineHeight } };
}

/** CSS custom properties with the names `cstack tokens build` would emit (fluid steps carry their clamp()). */
export function scaleCss(scale) {
  const lines = [];
  for (const s of scale.steps) lines.push(`  --font-size-${tokenName(s.step)}: ${scale.kind === 'fluid' ? s.clamp : `${s.rem}rem`};`);
  for (const s of scale.steps) lines.push(`  --font-lineHeight-${tokenName(s.step)}: ${s.line_height};`);
  return `/* ${describe(scale)} */\n:root {\n${lines.join('\n')}\n}\n`;
}

function describe(scale) {
  const steps = `steps ${scale.steps[0].step}..${scale.steps.at(-1).step}`;
  if (scale.kind === 'fluid') {
    const rn = (k) => `${scale.ratio[k]}${scale.ratio_name[k] ? ` (${scale.ratio_name[k]})` : ''}`;
    return `cstack type scale --fluid: ${scale.viewport.min}-${scale.viewport.max}px viewport, base ${scale.base.min}-${scale.base.max}px, ratio ${rn('min')} to ${rn('max')}, ${steps}`;
  }
  return `cstack type scale: base ${scale.base}px, ratio ${scale.ratio}${scale.ratio_name ? ` (${scale.ratio_name})` : ''}, ${steps}`;
}

const em = (v) => `${v > 0 ? '+' : ''}${v.toFixed(3)}em`;

export function formatScale(scale) {
  const out = [describe(scale)];
  if (scale.kind === 'fluid') {
    out.push(`${'step'.padStart(4)} ${'min px'.padStart(7)} ${'max px'.padStart(7)}  ${'lh'.padStart(4)}  ${'tracking'.padStart(9)}  role     clamp()`);
    for (const s of [...scale.steps].reverse())
      out.push(`${String(s.step).padStart(4)} ${s.min.px.toFixed(2).padStart(7)} ${s.max.px.toFixed(2).padStart(7)}  ${s.line_height.toFixed(2)}  ${em(s.tracking_em).padStart(9)}  ${s.role.padEnd(8)} ${s.clamp}`);
    out.push('', scaleCss(scale).trimEnd());
  } else {
    out.push(`${'step'.padStart(4)} ${'px'.padStart(7)} ${'rem'.padStart(7)}  ${'lh'.padStart(4)}  ${'tracking'.padStart(9)}  ${'caps+'.padStart(9)}  role`);
    for (const s of [...scale.steps].reverse())
      out.push(`${String(s.step).padStart(4)} ${s.px.toFixed(2).padStart(7)} ${s.rem.toFixed(4).padStart(7)}  ${s.line_height.toFixed(2)}  ${em(s.tracking_em).padStart(9)}  ${em(s.caps_tracking_em).padStart(9)}  ${s.role}${s.measure ? `  measure ${s.measure.min}-${s.measure.max} ch (~${s.measure.ideal}, ~${s.measure.approx_width_px}px)` : ''}`);
  }
  if (scale.warnings?.length) out.push('', 'warnings:', ...scale.warnings.map((w) => `  ${w}`));
  out.push('', 'notes:', ...scale.notes.map((n) => `  ${n}`));
  return out.join('\n');
}
