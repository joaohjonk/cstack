// Derived from gstack (https://github.com/garrytan/gstack): browse/src/url-validation.ts
// MIT License, Copyright (c) 2026 Garry Tan, modified for cstack. See licenses/gstack-MIT.txt.
// Changes: file: limited to the cstack workspace; new origin lock (top-level navigation stays on the
// named origins, same-site www/https hops allowed with a warning); destructive-link aborts at route level.
import path from 'node:path';
import dns from 'node:dns';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { destructiveMatch, isLocalHost } from './safety.mjs';

export const BLOCKED_METADATA_HOSTS = new Set([
  '169.254.169.254',
  'fe80::1',
  '::ffff:169.254.169.254',
  '::ffff:a9fe:a9fe',
  '::a9fe:a9fe',
  'metadata.google.internal',
  'metadata.azure.internal',
]);
const BLOCKED_IPV6_PREFIXES = ['fc', 'fd', 'fe8', 'fe9', 'fea', 'feb']; // ULA fc00::/7, link-local fe80::/10

export function isBlockedIpv6(addr) {
  const a = String(addr).toLowerCase().replace(/^\[|\]$/g, '');
  return a.includes(':') && BLOCKED_IPV6_PREFIXES.some((p) => a.startsWith(p));
}

/** True for metadata hosts in any numeric spelling (hex, decimal, octal, IPv4-mapped) and ULA/link-local IPv6. */
export function isMetadataHost(hostname) {
  let h = String(hostname).toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (BLOCKED_METADATA_HOSTS.has(h) || isBlockedIpv6(h)) return true;
  try {
    const n = new URL(`http://${h.includes(':') ? `[${h}]` : h}`).hostname.replace(/^\[|\]$/g, '');
    return BLOCKED_METADATA_HOSTS.has(n) || isBlockedIpv6(n) || /^169\.254\./.test(n);
  } catch {
    return false;
  }
}

/** DNS-rebinding check: does the name resolve to a blocked address? Fails open on DNS errors, like gstack. */
export async function resolvesToBlockedIp(hostname) {
  const v4 = dns.promises.resolve4(hostname).then((a) => a.some((x) => BLOCKED_METADATA_HOSTS.has(x) || /^169\.254\./.test(x)), () => false);
  const v6 = dns.promises.resolve6(hostname).then((a) => a.some((x) => BLOCKED_METADATA_HOSTS.has(x.toLowerCase()) || isBlockedIpv6(x)), () => false);
  const [a, b] = await Promise.all([v4, v6]);
  return a || b;
}

const isIpLiteral = (h) => /^[\d.]+$/.test(h) || h.includes(':');
const siteKey = (host) => host.toLowerCase().replace(/^www\./, '');

function within(p, dir) {
  const r = path.relative(path.resolve(dir), path.resolve(p));
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
}

/**
 * Pure navigation check used for the start URL and every top-level navigation.
 * @returns {{ok:boolean, reason?:string, warning?:string}}
 */
export function checkNavigation(target, { allowOrigins = [], ws = null } = {}) {
  let u;
  try {
    u = new URL(target);
  } catch {
    return { ok: false, reason: `invalid URL: ${String(target).slice(0, 120)}` };
  }
  if (u.protocol === 'about:') return u.href.toLowerCase() === 'about:blank' ? { ok: true } : { ok: false, reason: `scheme ${u.href} not allowed` };
  const d = destructiveMatch(u);
  if (d) return { ok: false, reason: `destructive link pattern "${d}" is never followed: ${u.pathname}` };
  if (u.protocol === 'file:') {
    if (u.host && u.host !== 'localhost') return { ok: false, reason: `file URL host ${u.host} not supported` };
    if (!ws) return { ok: false, reason: 'file: URLs need a workspace' };
    const p = fileURLToPath(u);
    if (!within(p, ws)) return { ok: false, reason: `file outside the workspace: ${p}` };
    return allowOrigins.includes('file://') ? { ok: true } : { ok: false, reason: 'file: navigation not allowed from an http origin' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, reason: `scheme "${u.protocol}" not allowed (http, https, file in workspace, about:blank)` };
  if (isMetadataHost(u.hostname)) return { ok: false, reason: `${u.hostname} is a cloud metadata / link-local address` };
  if (!allowOrigins.length || allowOrigins.includes(u.origin)) return { ok: true };
  const same = allowOrigins.some((o) => {
    try {
      const a = new URL(o);
      return siteKey(a.hostname) === siteKey(u.hostname) && a.port === u.port; // www / https hops, never another port
    } catch {
      return false;
    }
  });
  if (same) return { ok: true, warning: `same-site hop to ${u.origin} allowed` };
  return { ok: false, reason: `off-origin navigation to ${u.origin} (allowed: ${allowOrigins.join(', ')}); use --allow-origin to widen` };
}

/** Validate and normalise a start URL (adds DNS-rebinding check). Bare paths become file: URLs inside ws. */
export async function validateUrl(input, { ws, allowOrigins } = {}) {
  let href = String(input);
  if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) {
    href = pathToFileURL(path.resolve(ws ?? process.cwd(), href)).href;
  }
  const u = new URL(href);
  const origins = allowOrigins?.length ? allowOrigins : [u.protocol === 'file:' ? 'file://' : u.origin];
  const r = checkNavigation(href, { allowOrigins: origins, ws });
  if (!r.ok) throw new Error(`BLOCKED: ${r.reason}`);
  if ((u.protocol === 'http:' || u.protocol === 'https:') && !isLocalHost(u.hostname) && !isIpLiteral(u.hostname) && (await resolvesToBlockedIp(u.hostname)))
    throw new Error(`BLOCKED: ${u.hostname} resolves to a metadata / link-local address (possible DNS rebinding)`);
  return { href: u.href, origins, local: u.protocol === 'file:' || isLocalHost(u.hostname) };
}

/**
 * Origin lock: abort top-level navigations that fail checkNavigation and any request to metadata hosts.
 * Subresources (CDN images, fonts) still load. Redirect hops are not routed by Playwright, so
 * callers must also check page.url() after goto (see launch.gotoGuarded).
 */
export async function installGuard(context, page, { allowOrigins, ws, warnings, blocked }) {
  await context.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    let u;
    try {
      u = new URL(url);
    } catch {
      return route.abort('blockedbyclient');
    }
    if ((u.protocol === 'http:' || u.protocol === 'https:') && isMetadataHost(u.hostname)) {
      blocked.push({ url, reason: 'metadata host' });
      return route.abort('blockedbyclient');
    }
    let top = false;
    try {
      top = req.isNavigationRequest() && req.frame() === page.mainFrame();
    } catch {}
    if (req.isNavigationRequest()) {
      const r = top ? checkNavigation(url, { allowOrigins, ws }) : destructiveMatch(u) ? { ok: false, reason: 'destructive link in frame' } : { ok: true };
      if (!r.ok) {
        blocked.push({ url, reason: r.reason });
        return route.abort('blockedbyclient');
      }
      if (r.warning) warnings.push(r.warning);
    }
    return route.continue();
  });
}
