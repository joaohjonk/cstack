// Derived from gstack (https://github.com/garrytan/gstack): scripts/resolvers/aside.ts (QA cookbook shapes: console
// errors, failed requests, broken images, evidence lines; link checks only on LOCAL targets) and the console/network
// buffers described in BROWSER.md. MIT License, Copyright (c) 2026 Garry Tan, modified for cstack.
// See licenses/gstack-MIT.txt. Changes: one-shot listeners instead of daemon ring buffers; request metadata only
// (no headers, no bodies, redacted URLs); per-breakpoint overflow; basic a11y and computable contrast checks.
import { redactUrl } from './safety.mjs';
import { viewportFor } from './capture.mjs';

/** Attach before navigation. Collects console errors, page errors and failed requests (metadata only). */
export function listen(page) {
  const log = { console_errors: [], page_errors: [], failed_requests: [] };
  page.on('console', (m) => {
    if (m.type() === 'error' && log.console_errors.length < 200) log.console_errors.push(m.text().slice(0, 500));
  });
  page.on('pageerror', (e) => log.page_errors.length < 200 && log.page_errors.push(String(e.message).slice(0, 500)));
  page.on('response', (r) => {
    if (r.status() >= 400) log.failed_requests.push({ method: r.request().method(), status: r.status(), type: r.request().resourceType(), url: redactUrl(r.url()) });
  });
  page.on('requestfailed', (r) => {
    const err = r.failure()?.errorText ?? 'failed';
    if (!/BLOCKED_BY_CLIENT|blockedbyclient/i.test(err)) log.failed_requests.push({ method: r.method(), status: null, type: r.resourceType(), url: redactUrl(r.url()), error: err });
  });
  return log;
}

/** WCAG relative luminance contrast ratio for two [r,g,b] triples. */
export function contrastRatio(a, b) {
  const lum = ([r, g, b]) => {
    const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}

/** Runs in the page: overflow offenders at the current viewport. */
function overflowCheck() {
  const vw = window.innerWidth;
  const sel = (el) => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : '');
  const offenders = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width && r.right > vw + 1 && offenders.length < 5) offenders.push({ selector: sel(el), right: Math.round(r.right) });
  }
  return { viewport: vw, scroll_width: document.documentElement.scrollWidth, overflow: document.documentElement.scrollWidth > vw, offenders };
}

/** Runs in the page: images, labels, names, lang, contrast where the background is a solid colour. */
function a11yCheck() {
  const sel = (el) => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : '');
  const short = (s) => (s || '').slice(0, 160);
  const out = { broken_images: [], missing_alt: [], unlabeled_fields: [], unnamed_controls: [], low_contrast: [], contrast_skipped: 0, lang: document.documentElement.lang || null };
  for (const img of document.querySelectorAll('img')) {
    if (img.complete && img.naturalWidth === 0 && (img.currentSrc || img.src)) out.broken_images.push({ selector: sel(img), src: short(img.currentSrc || img.src) });
    if (!img.hasAttribute('alt') && img.getAttribute('role') !== 'presentation') out.missing_alt.push({ selector: sel(img), src: short(img.currentSrc || img.src) });
  }
  for (const f of document.querySelectorAll('input, select, textarea')) {
    if (['hidden', 'submit', 'button', 'reset', 'image'].includes(f.type)) continue;
    if (!f.labels?.length && !f.getAttribute('aria-label') && !f.getAttribute('aria-labelledby') && !f.title) out.unlabeled_fields.push({ selector: sel(f), type: f.type || f.tagName.toLowerCase() });
  }
  for (const c of document.querySelectorAll('a[href], button, [role=button]')) {
    const named = (c.textContent || '').trim() || c.getAttribute('aria-label') || c.getAttribute('aria-labelledby') || c.title || [...c.querySelectorAll('img[alt]')].some((i) => i.alt.trim());
    if (!named) out.unnamed_controls.push({ selector: sel(c) });
  }
  const rgb = (v) => {
    const m = v.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?/);
    return m ? { c: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] } : null;
  };
  const bgOf = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage !== 'none') return null;
      const b = rgb(cs.backgroundColor);
      if (b && b.a === 1) return b.c;
      if (b && b.a > 0) return null; // translucent layers: not computable without compositing
    }
    return [255, 255, 255];
  };
  let checked = 0;
  for (const el of document.querySelectorAll('body *')) {
    if (checked > 1500) break;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (!r.width || cs.visibility === 'hidden') continue;
    checked++;
    const fg = rgb(cs.color);
    const bg = bgOf(el);
    if (!fg || fg.a < 1 || !bg) {
      out.contrast_skipped++;
      continue;
    }
    out.low_contrast.push({ selector: sel(el), fg: fg.c, bg, large: parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 700), text: short(el.textContent.trim()).slice(0, 60) });
  }
  return out;
}

export async function runQa(page, log, { breakpoints }) {
  const overflow = [];
  for (const w of breakpoints) {
    await page.setViewportSize(viewportFor(w));
    await page.waitForTimeout(150);
    overflow.push({ breakpoint: w, ...(await page.evaluate(overflowCheck)) });
  }
  const a = await page.evaluate(a11yCheck);
  a.low_contrast = a.low_contrast
    .map((x) => ({ ...x, ratio: contrastRatio(x.fg, x.bg) }))
    .filter((x) => x.ratio < (x.large ? 3 : 4.5))
    .slice(0, 30);
  const lines = [
    `CONSOLE_ERRORS=${log.console_errors.length + log.page_errors.length}`,
    `FAILED_REQUESTS=${log.failed_requests.length}`,
    `BROKEN_IMAGES=${a.broken_images.length}`,
    `MISSING_ALT=${a.missing_alt.length}`,
    `UNLABELED_FIELDS=${a.unlabeled_fields.length}`,
    `UNNAMED_CONTROLS=${a.unnamed_controls.length}`,
    `LOW_CONTRAST=${a.low_contrast.length} (skipped ${a.contrast_skipped} not computable)`,
    `OVERFLOW=${overflow.map((o) => `${o.breakpoint}:${o.overflow ? 'yes' : 'no'}`).join(',')}`,
    `HTML_LANG=${a.lang ?? 'missing'}`,
  ];
  // verdict: broken things fail (errors, failed requests, broken images, overflow); a11y counts are reported, not gated
  const fails = [
    log.console_errors.length + log.page_errors.length ? 'console errors' : null,
    log.failed_requests.length ? 'failed requests' : null,
    a.broken_images.length ? 'broken images' : null,
    overflow.some((o) => o.overflow) ? 'horizontal overflow' : null,
  ].filter(Boolean);
  lines.push(`VERDICT=${fails.length ? `FAIL (${fails.join(', ')})` : 'PASS'}`);
  return { ...log, overflow, ...a, ok: !fails.length, fails, evidence: lines };
}
