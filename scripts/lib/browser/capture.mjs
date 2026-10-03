// Derived from gstack (https://github.com/garrytan/gstack): browse/src/meta-commands.ts (screenshot modes,
// `responsive` breakpoint loop, `pdf`), browse/src/screenshot-size-guard.ts (2000 px longest-side cap).
// MIT License, Copyright (c) 2026 Garry Tan, modified for cstack. See licenses/gstack-MIT.txt.
// Changes: breakpoints 375/768/1440 by default; preview downscale via CDP Page.captureScreenshot clip.scale
// instead of sharp (full-res original kept as evidence); capture height cap recorded; lazy-load scroll pass.

export const DEFAULT_BREAKPOINTS = [375, 768, 1440];
export const PREVIEW_MAX = 2000;
export const HEIGHT_CAP = 12000;
const VIEW_HEIGHT = { 375: 812, 768: 1024, 1280: 720, 1440: 900 };
export const viewportFor = (w) => ({ width: w, height: VIEW_HEIGHT[w] ?? Math.round(w * 0.625) });

export function parseBreakpoints(v) {
  if (!v || v === true) return DEFAULT_BREAKPOINTS;
  const list = String(v).split(',').map((x) => parseInt(x, 10)).filter((n) => n >= 200 && n <= 4000);
  if (!list.length) throw new Error(`bad --breakpoints "${v}" (expected e.g. 375,768,1440)`);
  return list;
}

/** Scroll the page once so lazy images load before a full-page capture, then return to the top. */
export async function lazyScroll(page) {
  await page.evaluate(async (cap) => {
    const step = window.innerHeight || 800;
    for (let y = 0, i = 0; y < Math.min(document.documentElement.scrollHeight, cap) && i < 30; y += step, i++) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  }, HEIGHT_CAP);
  await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
}

export const pageSize = (page) =>
  page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0) }));

/** Downscaled PNG whose longest side is PREVIEW_MAX, via CDP clip.scale (no image library). */
export async function previewPng(page, width, height) {
  const scale = Math.min(1, PREVIEW_MAX / Math.max(width, height));
  const cdp = await page.context().newCDPSession(page);
  try {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale } });
    return Buffer.from(data, 'base64');
  } finally {
    await cdp.detach().catch(() => {});
  }
}

/**
 * Screenshot each breakpoint. Writes shot-<w>.png (viewport, or full page with `full`) and, when the longest
 * side exceeds PREVIEW_MAX, shot-<w>.preview.png. `run.add(name, buf, meta)` stores and hashes each file.
 */
export async function shoot(page, run, { breakpoints = DEFAULT_BREAKPOINTS, full = false } = {}) {
  const shots = [];
  let scrolled = false;
  for (const w of breakpoints) {
    const vp = viewportFor(w);
    await page.setViewportSize(vp);
    await page.waitForTimeout(150);
    let size = { width: vp.width, height: vp.height };
    let truncated = false;
    let buf;
    if (full) {
      if (!scrolled) {
        await lazyScroll(page);
        scrolled = true;
      }
      const s = await pageSize(page);
      truncated = s.height > HEIGHT_CAP;
      size = { width: Math.max(vp.width, s.width), height: Math.min(s.height, HEIGHT_CAP) };
      buf = await page.screenshot({ fullPage: true, clip: { x: 0, y: 0, ...size } });
    } else buf = await page.screenshot();
    const file = run.add(`shot-${w}.png`, buf, { breakpoint: w, full, ...size, truncated });
    const entry = { breakpoint: w, file, ...size, truncated };
    if (Math.max(size.width, size.height) > PREVIEW_MAX) entry.preview = run.add(`shot-${w}.preview.png`, await previewPng(page, size.width, size.height), { breakpoint: w, preview_of: file, max_side: PREVIEW_MAX });
    if (truncated) run.warn(`shot-${w}: page taller than ${HEIGHT_CAP}px, capture truncated`);
    shots.push(entry);
  }
  return shots;
}

export function pdfOptions(args = {}) {
  const margin = args.margin && args.margin !== true ? String(args.margin) : '0.5in';
  return {
    format: args.format && args.format !== true ? String(args.format) : 'A4',
    printBackground: args['no-background'] ? false : true,
    preferCSSPageSize: true,
    margin: { top: margin, right: margin, bottom: margin, left: margin },
  };
}

export async function printPdf(page, run, args = {}) {
  await page.emulateMedia({ media: 'print' });
  const buf = await page.pdf(pdfOptions(args));
  return run.add('page.pdf', buf, { format: pdfOptions(args).format });
}
