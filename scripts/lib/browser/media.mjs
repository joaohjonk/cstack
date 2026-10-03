// Derived from gstack (https://github.com/garrytan/gstack): browse/src/media-extract.ts (extractMedia),
// browse/src/write-commands.ts (scrape download loop: caps, per-URL validation, delay, manifest).
// MIT License, Copyright (c) 2026 Garry Tan, modified for cstack. See licenses/gstack-MIT.txt.
// Changes: download through a fresh cookie-less request context; manifest adds page_url, sha256, alt, sizes and
// `reference_only: true` (third-party media is never generation input); size cap; final-URL re-check.
import { checkNavigation, isMetadataHost } from './url-guard.mjs';
import { redactUrl, isLocalHost } from './safety.mjs';

export const MAX_DOWNLOADS = 50;
export const MAX_BYTES = 25 * 1024 * 1024;

function collect() {
  const images = [...document.querySelectorAll('img')].map((img) => {
    const r = img.getBoundingClientRect();
    return {
      src: img.currentSrc || img.src || '',
      srcset: img.srcset || '',
      alt: img.hasAttribute('alt') ? img.alt : null,
      natural: { width: img.naturalWidth, height: img.naturalHeight },
      rendered: { width: Math.round(r.width), height: Math.round(r.height) },
      loading: img.loading || '',
      data_src: img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '',
      visible: r.width > 0 && r.height > 0,
    };
  });
  const videos = [...document.querySelectorAll('video')].map((v) => {
    const sources = [...v.querySelectorAll('source')].map((s) => ({ src: s.src || '', type: s.type || '' }));
    return {
      src: v.currentSrc || v.src || sources[0]?.src || '',
      poster: v.poster || '',
      sources,
      width: v.videoWidth || v.width,
      height: v.videoHeight || v.height,
      streaming: sources.some((s) => /m3u8|mpegurl|\.mpd|dash/i.test(s.src + s.type)),
    };
  });
  const backgrounds = [];
  const all = document.querySelectorAll('body *');
  for (let i = 0; i < all.length && backgrounds.length < 500; i++) {
    const m = getComputedStyle(all[i]).backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
    if (m && !m[1].startsWith('data:')) backgrounds.push({ src: new URL(m[1], document.baseURI).href, element: all[i].tagName.toLowerCase() });
  }
  return { images, videos, backgrounds };
}

export async function extractMedia(page) {
  const m = await page.evaluate(collect);
  return { ...m, total: m.images.length + m.videos.length + m.backgrounds.length };
}

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/avif': '.avif', 'image/svg+xml': '.svg', 'video/mp4': '.mp4', 'video/webm': '.webm' };

/** Candidate download list: dedupe, drop data:/blob:/streams, keep provenance fields. */
export function downloadList(media, limit = MAX_DOWNLOADS) {
  const out = [];
  const seen = new Set();
  const push = (src, kind, extra = {}) => {
    if (!src || seen.has(src) || !/^https?:/.test(src)) return;
    seen.add(src);
    out.push({ src, kind, ...extra });
  };
  for (const i of media.images) push(i.src, 'image', { alt: i.alt, natural: i.natural, rendered: i.rendered });
  for (const v of media.videos) {
    if (!v.streaming) push(v.src, 'video', { width: v.width, height: v.height });
    push(v.poster, 'poster');
  }
  for (const b of media.backgrounds) push(b.src, 'background');
  return out.slice(0, Math.min(limit, 200));
}

/**
 * Download with a fresh request context (no cookies from the page or the user). Every URL is re-validated
 * (scheme, metadata host, destructive path); subresources may come from any origin, as they would render.
 */
export async function downloadMedia(pw, run, pageUrl, items, { ws } = {}) {
  const req = await pw.request.newContext();
  const files = [];
  let failed = 0;
  try {
    for (const [n, it] of items.entries()) {
      const rec = { src: redactUrl(it.src), kind: it.kind, alt: it.alt ?? null, natural: it.natural, rendered: it.rendered };
      const pre = checkNavigation(it.src, { allowOrigins: [], ws });
      if (!pre.ok) {
        files.push({ ...rec, error: pre.reason });
        failed++;
        continue;
      }
      try {
        const res = await req.get(it.src, { timeout: 20000, maxRedirects: 3, headers: { referer: pageUrl } });
        const finalHost = new URL(res.url()).hostname;
        if (isMetadataHost(finalHost)) throw new Error('redirected to a blocked host');
        if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
        const body = await res.body();
        if (body.length > MAX_BYTES) throw new Error(`larger than ${MAX_BYTES} bytes`);
        const type = (res.headers()['content-type'] ?? '').split(';')[0].trim();
        const base = (new URL(it.src).pathname.split('/').pop() || 'file').replace(/\.[a-z0-9]+$/i, '').replace(/[^\w.-]+/g, '_').slice(0, 60);
        const ext = EXT[type] ?? (new URL(it.src).pathname.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? '.bin');
        const file = run.add(`media/${String(n + 1).padStart(3, '0')}-${base}${ext}`, body, { reference_only: true });
        const entry = run.files.find((f) => f.path === file);
        files.push({ ...rec, path: file, sha256: entry.sha256, bytes: entry.bytes, content_type: type });
      } catch (e) {
        files.push({ ...rec, error: e.message.split('\n')[0] });
        failed++;
      }
      await new Promise((r) => setTimeout(r, isLocalHost(new URL(pageUrl).hostname) ? 100 : 1000)); // human pace on sites we do not own
    }
  } finally {
    await req.dispose();
  }
  return {
    page_url: redactUrl(pageUrl),
    captured_at: new Date().toISOString(),
    reference_only: true,
    generation_input_allowed: false,
    license: 'unknown',
    note: 'Third-party media captured for reference only. Never use as generation input or in exports unless rights are recorded in lineage.',
    succeeded: files.length - failed,
    failed,
    files,
  };
}
