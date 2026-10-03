// Image loading for local pipelines. PNG decodes in pure Node; JPEG, WebP, GIF, PNG variants the Node codec skips, and SVG
// go through ONE headless Chromium session (optional playwright-core) with the network blocked and inputs passed as
// data: URIs. SVG is drawn through <img>, so its scripts never run and external references never load. Never installs.
import fs from 'node:fs';
import path from 'node:path';
import { decodePNG, UnsupportedImage } from './png.mjs';

const MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };

/** Format from magic bytes (SVG: text with an <svg root). null when unknown. */
export function formatOf(file) {
  const fd = fs.openSync(file, 'r');
  const b = Buffer.alloc(65536);
  try {
    b.fill(0, fs.readSync(fd, b, 0, b.length, 0));
  } finally {
    fs.closeSync(fd);
  }
  if (b.readUInt32BE(0) === 0x89504e47) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpeg';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (b.toString('ascii', 0, 3) === 'GIF') return 'gif';
  if (/<svg[\s>]/i.test(b.toString('utf8'))) return 'svg';
  return null;
}

const UNIT = /^\s*([0-9.]+)\s*(px|pt|pc|mm|cm|in)?\s*$/i;
/** Intrinsic aspect of an SVG from its root width/height (same unit) or viewBox, plus content flags that matter for masters. */
export function svgInfo(text) {
  const root = text.match(/<svg\b[^>]*>/i)?.[0];
  if (!root) throw new Error('not an SVG (no <svg> root)');
  const attr = (n) => root.match(new RegExp(`\\s${n}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];
  const w = attr('width')?.match(UNIT), h = attr('height')?.match(UNIT);
  const vb = attr('viewBox')?.trim().split(/[\s,]+/).map(Number);
  let width, height;
  if (w && h && (w[2] ?? 'px').toLowerCase() === (h[2] ?? 'px').toLowerCase()) [width, height] = [Number(w[1]), Number(h[1])];
  else if (vb?.length === 4 && vb[2] > 0 && vb[3] > 0) [width, height] = [vb[2], vb[3]];
  if (!(width > 0 && height > 0)) throw new Error('SVG has no usable width/height or viewBox, so its proportions are unknown; add a viewBox');
  return { width, height, aspect: width / height, has_text: /<text[\s>]/i.test(text), has_raster: /<image[\s>]/i.test(text) };
}

async function chromiumSession(why) {
  let loadEngine, launch;
  try {
    ({ loadEngine, launch } = await import('../browser/launch.mjs'));
    const eng = await loadEngine(); // throws "MISSING: ..." without playwright-core or Chromium; never downloads
    const browser = await launch(eng);
    const context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block', javaScriptEnabled: true });
    await context.route('**/*', (r) => r.abort('blockedbyclient'));
    return { browser, page: await context.newPage(), version: browser.version() };
  } catch (e) {
    throw new Error(`MISSING: ${why} needs headless Chromium (${String(e.message).split('\n')[0].replace(/^MISSING:\s*/, '')})`);
  }
}

/**
 * Decode images to {width, height, data: Uint8ClampedArray RGBA, format, engine}.
 * items: [{file, width?, height?}]; width/height are required for SVG (the raster size) and ignored otherwise.
 * Chromium launches once, only when some item needs it.
 */
export async function decodeImages(items) {
  const out = new Array(items.length);
  const pending = [];
  for (const [i, it] of items.entries()) {
    const format = formatOf(it.file);
    if (!format) throw new Error(`unsupported image (not PNG, JPEG, WebP, GIF or SVG): ${it.file}`);
    if (format === 'svg' && !(it.width > 0 && it.height > 0)) throw new Error(`SVG needs a raster size: ${it.file}`);
    if (format === 'png') {
      try {
        out[i] = { ...decodePNG(fs.readFileSync(it.file)), format, engine: { name: 'node', version: process.versions.node } };
        continue;
      } catch (e) {
        if (!(e instanceof UnsupportedImage)) throw e;
        pending.push({ i, format, reason: e.message });
        continue;
      }
    }
    pending.push({ i, format, reason: format });
  }
  if (!pending.length) return out;
  const names = pending.map((p) => `${path.basename(items[p.i].file)} (${p.reason})`).join(', ');
  const s = await chromiumSession(names);
  try {
    for (const p of pending) {
      const it = items[p.i];
      const src = `data:${MIME[p.format]};base64,${fs.readFileSync(it.file).toString('base64')}`;
      const size = p.format === 'svg' ? { w: Math.round(it.width), h: Math.round(it.height) } : { w: 0, h: 0 };
      const res = await s.page.evaluate(async ({ src, w, h }) => {
        const img = new Image();
        if (w) ((img.width = w), (img.height = h));
        await new Promise((ok, bad) => ((img.onload = ok), (img.onerror = () => bad(new Error('decode failed'))), (img.src = src)));
        const W = w || img.naturalWidth, H = h || img.naturalHeight;
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        c.getContext('2d').drawImage(img, 0, 0, W, H);
        return { url: c.toDataURL('image/png') };
      }, { src, ...size });
      out[p.i] = { ...decodePNG(Buffer.from(res.url.split(',')[1], 'base64')), format: p.format, engine: { name: 'chromium', version: s.version } };
    }
  } catch (e) {
    throw new Error(`Chromium could not decode ${names}: ${String(e.message).split('\n')[0]}`);
  } finally {
    await s.browser.close().catch(() => {});
  }
  return out;
}
