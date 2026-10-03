// Derived from gstack (https://github.com/garrytan/gstack): browse/src/browser-manager.ts (launch path, concept only),
// browse/src/find-browse.ts (gstack binary lookup), scripts/resolvers/aside.ts ("detect, never install").
// MIT License, Copyright (c) 2026 Garry Tan, modified for cstack. See licenses/gstack-MIT.txt.
// Changes: one-shot Node launcher (no daemon, ports, tokens, headed mode, proxy or stealth); empty profile;
// executable resolution CSTACK_CHROMIUM -> Playwright default -> /opt/pw-browsers/chromium; gstack probe never boots its daemon.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { installGuard } from './url-guard.mjs';

export const FALLBACK_CHROMIUM = '/opt/pw-browsers/chromium';
const require = createRequire(import.meta.url);

/** Load playwright-core and pick a Chromium. Never downloads anything. Throws a one-line, actionable error. */
export async function loadEngine() {
  process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1';
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
  let pw, version;
  try {
    pw = await import('playwright-core');
    version = require('playwright-core/package.json').version;
  } catch {
    throw new Error('MISSING: playwright-core is not installed (optional dependency, ~1.56.1). Run `npm install` in the cstack checkout.');
  }
  const tried = [];
  const env = process.env.CSTACK_CHROMIUM;
  if (env) {
    if (!fs.existsSync(env)) throw new Error(`MISSING: Chromium at CSTACK_CHROMIUM=${env} does not exist.`);
    return { pw, chromium: pw.chromium, version, launchOpts: { executablePath: env }, executable: env };
  }
  let def = null;
  try {
    def = pw.chromium.executablePath();
  } catch {}
  if (def && fs.existsSync(def)) return { pw, chromium: pw.chromium, version, launchOpts: {}, executable: def, fallback: fs.existsSync(FALLBACK_CHROMIUM) ? FALLBACK_CHROMIUM : null };
  tried.push(def ?? '(playwright default)');
  if (fs.existsSync(FALLBACK_CHROMIUM)) return { pw, chromium: pw.chromium, version, launchOpts: { executablePath: FALLBACK_CHROMIUM }, executable: FALLBACK_CHROMIUM };
  tried.push(FALLBACK_CHROMIUM);
  throw new Error(`MISSING: Chromium for playwright-core ${version} not found (looked at: ${tried.join(', ')}). cstack never downloads browsers; set CSTACK_CHROMIUM or PLAYWRIGHT_BROWSERS_PATH.`);
}

export async function launch(eng) {
  try {
    return await eng.chromium.launch({ headless: true, ...eng.launchOpts });
  } catch (e) {
    if (!eng.fallback) throw new Error(`Chromium failed to launch (${eng.executable}): ${e.message.split('\n')[0]}`);
    eng.launchOpts = { executablePath: eng.fallback };
    eng.executable = eng.fallback;
    return eng.chromium.launch({ headless: true, ...eng.launchOpts });
  }
}

/**
 * One flow, one browser. Empty profile, no storage state, downloads off, service workers blocked,
 * dialogs dismissed, origin lock installed. Always closes the browser.
 */
export async function withPage(opts, fn) {
  const eng = await loadEngine();
  const browser = await launch(eng);
  const warnings = opts.warnings ?? [];
  const blocked = opts.blocked ?? [];
  try {
    const context = await browser.newContext({
      viewport: opts.viewport ?? { width: 1440, height: 900 },
      deviceScaleFactor: opts.scale ?? 1,
      acceptDownloads: false,
      serviceWorkers: 'block',
      reducedMotion: 'reduce',
      javaScriptEnabled: true,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(opts.timeout ?? 30000);
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    await installGuard(context, page, { allowOrigins: opts.allowOrigins ?? [], ws: opts.ws, warnings, blocked });
    const engine = { name: 'playwright-core', version: eng.version, executable: eng.executable, browser_version: browser.version() };
    return await fn({ page, context, browser, engine, pw: eng.pw, warnings, blocked });
  } finally {
    await browser.close().catch(() => {});
  }
}

/** Navigate, then settle: load, fonts, short network-idle cap. Re-checks the final URL (redirects bypass routes). */
export async function gotoGuarded(page, url, { allowOrigins, ws, warnings, check }) {
  const res = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  const final = page.url();
  if (final !== url && check) {
    const r = check(final, { allowOrigins, ws });
    if (!r.ok) throw new Error(`BLOCKED: redirected to ${final}: ${r.reason}`);
    if (r.warning) warnings.push(r.warning);
  }
  const signIn = await page.locator('input[type=password]').count().catch(() => 0);
  if (signIn) warnings.push(`sign-in form at ${new URL(final).origin === 'null' ? final : new URL(final).origin}: cstack never types credentials; the user signs in themselves`);
  return { status: res?.status() ?? null, final_url: final };
}

// ---------- optional gstack `browse` binary (detect only, never start its daemon) ----------
function isExec(p) {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

export function findGstackBrowse({ cwd = process.cwd(), home = os.homedir() } = {}) {
  const exts = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : [''];
  const hit = (base) => exts.map((e) => base + e).find(isExec) ?? null;
  if (process.env.CSTACK_GSTACK_BROWSE) return hit(process.env.CSTACK_GSTACK_BROWSE);
  const g = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', timeout: 3000 });
  const root = g.status === 0 ? g.stdout.trim() : null;
  const markers = ['.claude', '.agents', '.codex'];
  for (const base of [root, home].filter(Boolean)) {
    for (const m of markers) {
      const f = hit(path.join(base, m, 'skills', 'gstack', 'browse', 'dist', 'browse'));
      if (f) return f;
    }
    if (base === root) {
      const f = hit(path.join(root, 'browse', 'dist', 'browse'));
      if (f) return f;
    }
  }
  return null;
}

// Only a binary the user installed is ever executed: CSTACK_GSTACK_BROWSE, or one under $HOME that is not inside
// the current repository (a cloned repo must not get code run by `cstack browse engines`).
function trustedBin(bin, { cwd, home }) {
  const real = (p) => {
    try {
      return fs.realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };
  const b = real(bin);
  if (process.env.CSTACK_GSTACK_BROWSE) return b === real(process.env.CSTACK_GSTACK_BROWSE);
  const inside = (dir) => !!dir && (b + path.sep).startsWith(real(dir) + path.sep);
  const g = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', timeout: 3000 });
  const repo = g.status === 0 ? g.stdout.trim() : null;
  return inside(home) && !inside(cwd) && !inside(repo);
}

/** Probe with `--help` only (exits without contacting a daemon); read VERSION from the install root. */
export function probeGstack(bin, { cwd = process.cwd(), home = os.homedir() } = {}) {
  if (!bin) return { found: false };
  if (!trustedBin(bin, { cwd, home })) return { found: true, path: bin, ok: null, version: null, note: 'found inside this repository; not executed (set CSTACK_GSTACK_BROWSE to its path to trust it)' };
  const r = spawnSync(bin, ['--help'], { encoding: 'utf8', timeout: 5000 });
  const first = (r.stdout || '').split('\n')[0];
  const verFile = path.resolve(path.dirname(bin), '..', '..', 'VERSION');
  const version = fs.existsSync(verFile) ? fs.readFileSync(verFile, 'utf8').trim() : null;
  return { found: true, path: bin, ok: r.status === 0 && /gstack browse/i.test(first), version, note: 'opt-in only; cstack never runs its setup or starts its daemon' };
}
