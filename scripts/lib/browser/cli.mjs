// cstack browse: one-shot, read-first browser commands. Wiring: `cstack browse <sub> ...` -> runBrowse(sub, args, ws).
// Layout and safety rules derive from gstack (https://github.com/garrytan/gstack) browse (see NOTICE.md);
// MIT License, Copyright (c) 2026 Garry Tan, modified for cstack. See licenses/gstack-MIT.txt.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { loadEngine, launch, withPage, gotoGuarded, findGstackBrowse, probeGstack } from './launch.mjs';
import { validateUrl, checkNavigation } from './url-guard.mjs';
import { checkRobots } from './robots.mjs';
import { wrapUntrusted, UNTRUSTED_NOTE, isLocalHost } from './safety.mjs';
import { takeSnapshot } from './snapshot.mjs';
import { shoot, printPdf, parseBreakpoints, viewportFor, DEFAULT_BREAKPOINTS } from './capture.mjs';
import { extractTokens, summarizeTokens } from './tokens.mjs';
import { extractMedia, downloadList, downloadMedia, MAX_DOWNLOADS } from './media.mjs';
import { listen, runQa } from './qa.mjs';
import { parseSteps, runSteps } from './skills.mjs';

const CSTACK_VERSION = createRequire(import.meta.url)('../../../package.json').version;

export const BROWSE_HELP = `cstack browse <sub> (one-shot headless Chromium; artifacts in <ws>/work/browse/<run-id>/)
  shot <url> [--breakpoints 375,768,1440] [--full]   screenshots (+ <=2000px preview when larger)
  snapshot <url> [--interactive] [--compact] [--depth N] [--selector css]   accessibility tree with @eN refs
  tokens <url> [--breakpoint 1440]                   computed-style candidates (extracted_pattern for /brand-import)
  media <url> [--download] [--limit N]               image/video list; download = reference-only + sha256 manifest
  qa <url> [--breakpoints ...]                       console, failed requests, broken images, overflow, a11y basics
  pdf <url|file.html> [--format A4] [--margin 0.5in] print to PDF
  run <steps.yaml> [--allow-mutation]                goto/click/fill/wait/screenshot/snapshot on one origin
  engines                                            playwright-core + Chromium, optional gstack browse
Common: --allow-origin <origin,...> widens the origin lock. --json returns the run record.
  --ignore-robots captures a path robots.txt disallows (only with the site owner's permission, e.g. your own site).
Rules: ${UNTRUSTED_NOTE} No credentials, no cookies import; logout/delete/remove/cancel/unsubscribe links are never followed.`;

function normArgs(args) {
  if (Array.isArray(args)) {
    const out = { _: [] };
    for (let i = 0; i < args.length; i++) {
      const t = args[i];
      if (!t.startsWith('--')) out._.push(t);
      else if (t.includes('=')) out[t.slice(2, t.indexOf('='))] = t.slice(t.indexOf('=') + 1);
      else if (args[i + 1] && !args[i + 1].startsWith('--')) out[t.slice(2)] = args[++i];
      else out[t.slice(2)] = true;
    }
    return out;
  }
  const out = { _: [], ...(args ?? {}) };
  out._ = [...out._];
  // A generic parser reads `--full <url>` as full=<url>; boolean flags give their value back as a positional.
  for (const k of BOOL_FLAGS) if (typeof out[k] === 'string') (out._.push(out[k]), (out[k] = true));
  return out;
}
const BOOL_FLAGS = ['full', 'download', 'interactive', 'compact', 'json', 'allow-mutation', 'no-background', 'ignore-robots'];

/** Run directory with sha256 provenance. */
export function createRun(ws, sub, target) {
  let host = 'local';
  try {
    host = new URL(target).hostname || 'file';
  } catch {}
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const id = `${stamp}-${host.replace(/[^\w.-]+/g, '_').slice(0, 40)}-${sub}-${crypto.randomBytes(2).toString('hex')}`;
  const dir = path.join(ws, 'work', 'browse', id);
  fs.mkdirSync(dir, { recursive: true });
  const run = {
    id,
    dir,
    files: [],
    warnings: [],
    blocked: [],
    record: { run_id: id, sub, url: target, timestamp: new Date().toISOString(), cstack_version: CSTACK_VERSION, untrusted_content: true },
    add(name, buf, meta = {}) {
      const p = path.join(dir, name);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, buf);
      run.files.push({ path: name, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), ...meta });
      return name;
    },
    addJSON: (name, obj) => run.add(name, Buffer.from(JSON.stringify(obj, null, 2) + '\n')),
    warn: (w) => run.warnings.push(w),
    finish(extra = {}) {
      Object.assign(run.record, extra, { started_at: run.record.timestamp, finished_at: new Date().toISOString(), warnings: run.warnings, blocked: run.blocked, files: run.files });
      fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(run.record, null, 2) + '\n');
      return run.record;
    },
  };
  return run;
}

const origins = (a, fallback) => (a['allow-origin'] && a['allow-origin'] !== true ? String(a['allow-origin']).split(',').map((o) => new URL(o).origin) : []).concat(fallback);

/** Shared flow: validate URL, open run dir, launch, navigate under the origin lock, call fn, write run.json. */
async function pageRun(sub, a, ws, fn, { viewport } = {}) {
  const target = a._[0];
  if (!target) throw new Error(`usage: cstack browse ${sub} <url>`);
  const v = await validateUrl(target, { ws });
  const allow = origins(a, v.origins);
  const robots = v.local ? null : await checkRobots(v.href);
  if (robots && !robots.allowed && !a['ignore-robots'])
    throw new Error(`robots.txt disallows ${new URL(v.href).pathname} (${robots.rule}). Capture another page, ask the site, or pass --ignore-robots only with the site owner's permission.`);
  const run = createRun(ws, sub, v.href);
  if (robots) run.record.robots = { ...robots, ignored: !robots.allowed };
  try {
    await withPage({ ws, allowOrigins: allow, viewport, warnings: run.warnings, blocked: run.blocked }, async (ctx) => {
      run.record.engine = ctx.engine;
      run.record.allowed_origins = allow;
      run.record.local_target = v.local;
      const early = sub === 'qa' ? listen(ctx.page) : null;
      const nav = await gotoGuarded(ctx.page, v.href, { allowOrigins: allow, ws, warnings: run.warnings, check: checkNavigation });
      Object.assign(run.record, { final_url: nav.final_url, status: nav.status, title: await ctx.page.title().catch(() => '') });
      run.record.result = await fn({ ...ctx, run, url: nav.final_url, log: early });
    });
  } catch (e) {
    run.finish({ error: e.message.split('\n')[0] });
    throw new Error(`${e.message.split('\n')[0]}\n(run record: ${path.relative(ws, run.dir)}/run.json)`);
  }
  return run;
}

function report(run, ws, a, lines = []) {
  const rec = run.finish();
  if (a.json) return rec;
  const files = rec.files.slice(0, 12).map((f) => `  ${f.path}  ${f.bytes}B  sha256:${f.sha256.slice(0, 12)}`);
  if (rec.files.length > 12) files.push(`  ... ${rec.files.length - 12} more in run.json`);
  return [`run: ${path.relative(ws, run.dir) || run.dir}`, `url: ${rec.final_url ?? rec.url}`, ...lines, 'files:', ...files, ...rec.warnings.map((w) => `warning: ${w}`), ...rec.blocked.slice(0, 5).map((b) => `blocked: ${b.reason}`)].join('\n');
}

async function engines() {
  const out = { playwright_core: null, chromium: null, gstack_browse: probeGstack(findGstackBrowse()) };
  try {
    const eng = await loadEngine();
    out.playwright_core = eng.version;
    const b = await launch(eng);
    out.chromium = { executable: eng.executable, version: b.version(), launches: true };
    await b.close();
  } catch (e) {
    out.error = e.message;
  }
  return out;
}

/**
 * Entry point for `cstack browse <sub>`.
 * @param {string} sub  shot|snapshot|tokens|media|qa|pdf|run|engines|help
 * @param {object|string[]} args parsed args ({_: [...positionals], flag: value}) or a raw argv array
 * @param {string} ws  workspace root; runs go to <ws>/work/browse/<run-id>/
 * @returns {Promise<string|object>} printable summary, or the run record with --json
 */
export async function runBrowse(sub, args, ws = process.cwd()) {
  const a = normArgs(args);
  if (a._[0] === sub) a._.shift();
  ws = path.resolve(ws);
  switch (sub) {
    case 'shot': {
      const bps = parseBreakpoints(a.breakpoints);
      const run = await pageRun(sub, a, ws, async ({ page, run }) => ({ shots: await shoot(page, run, { breakpoints: bps, full: !!a.full }) }), { viewport: viewportFor(bps[0]) });
      return report(run, ws, a, [`shots: ${run.record.result.shots.map((s) => `${s.breakpoint}px ${s.width}x${s.height}${s.preview ? ' +preview' : ''}`).join(', ')}`]);
    }
    case 'snapshot': {
      const opts = { interactive: !!a.interactive, compact: !!a.compact, depth: a.depth ? parseInt(a.depth, 10) : undefined, selector: typeof a.selector === 'string' ? a.selector : undefined };
      let text = '';
      const run = await pageRun(sub, a, ws, async ({ page, run, url }) => {
        const s = await takeSnapshot(page, opts);
        run.add('snapshot.txt', Buffer.from(s.text + '\n'));
        run.addJSON('refs.json', { url, note: 'refs are valid for this run only; rebuild with getByRole(role,{name,exact:true}).nth(nth)', refs: s.refs });
        text = wrapUntrusted(s.text, url);
        return { refs: s.refs.length };
      });
      return a.json ? report(run, ws, a) : `${report(run, ws, a, [`refs: ${run.record.result.refs}`])}\n\n${text}`;
    }
    case 'tokens': {
      const bp = a.breakpoint ? parseInt(a.breakpoint, 10) : 1440;
      let summary = '';
      const run = await pageRun(sub, a, ws, async ({ page, run, url }) => {
        const t = await extractTokens(page);
        t.source = { url, viewport: viewportFor(bp), captured_at: new Date().toISOString() };
        run.addJSON('tokens.raw.json', t);
        summary = summarizeTokens(t);
        return { kind: t.kind, elements_scanned: t.elements_scanned };
      }, { viewport: viewportFor(bp) });
      return a.json ? report(run, ws, a) : `${report(run, ws, a, ['kind: extracted_pattern (raw input for /brand-import, not brand truth)'])}\n\n${wrapUntrusted(summary, run.record.final_url)}`;
    }
    case 'media': {
      const run = await pageRun(sub, a, ws, async ({ page, run, url, pw }) => {
        const m = await extractMedia(page);
        run.addJSON('media.json', { page_url: url, reference_only: true, ...m });
        const res = { images: m.images.length, videos: m.videos.length, backgrounds: m.backgrounds.length };
        if (a.download) {
          const limit = a.limit ? parseInt(a.limit, 10) : MAX_DOWNLOADS;
          const manifest = await downloadMedia(pw, run, url, downloadList(m, limit), { ws });
          run.addJSON('media/manifest.json', manifest);
          Object.assign(res, { downloaded: manifest.succeeded, failed: manifest.failed });
        }
        return res;
      });
      const r = run.record.result;
      return report(run, ws, a, [`media: ${r.images} images, ${r.videos} videos, ${r.backgrounds} backgrounds${a.download ? `; downloaded ${r.downloaded}, failed ${r.failed} (reference_only)` : ''}`]);
    }
    case 'qa': {
      const bps = parseBreakpoints(a.breakpoints ?? DEFAULT_BREAKPOINTS.join(','));
      const run = await pageRun(sub, a, ws, async ({ page, run, log }) => {
        const q = await runQa(page, log, { breakpoints: bps });
        run.addJSON('qa.json', q);
        return { ok: q.ok, fails: q.fails, evidence: q.evidence };
      });
      return report(run, ws, a, [`URL=${run.record.final_url}`, ...run.record.result.evidence]);
    }
    case 'pdf': {
      const run = await pageRun(sub, a, ws, async ({ page, run }) => ({ pdf: await printPdf(page, run, a) }));
      return report(run, ws, a);
    }
    case 'run': {
      const file = a._[0];
      if (!file) throw new Error('usage: cstack browse run <steps.yaml> [--allow-mutation]');
      const p = path.resolve(fs.existsSync(path.resolve(file)) ? path.resolve(file) : path.join(ws, file));
      const spec = parseSteps(fs.readFileSync(p, 'utf8'));
      const allow = origins(a, [spec.origin]);
      if (!isLocalHost(new URL(spec.origin).hostname) && !a['ignore-robots'])
        for (const s of spec.steps.filter((x) => x.goto)) {
          const href = new URL(String(s.goto), spec.origin).href;
          const r = await checkRobots(href);
          if (!r.allowed) throw new Error(`robots.txt disallows ${new URL(href).pathname} (${r.rule}). Pass --ignore-robots only with the site owner's permission.`);
        }
      const run = createRun(ws, 'run', spec.origin);
      run.record.steps_file = path.basename(p);
      try {
        await withPage({ ws, allowOrigins: allow, warnings: run.warnings, blocked: run.blocked }, async ({ page, engine }) => {
          Object.assign(run.record, { engine, allowed_origins: allow });
          run.record.result = await runSteps(page, run, spec, { allowMutation: !!a['allow-mutation'], ws, warnings: run.warnings });
          run.record.final_url = page.url();
        });
      } catch (e) {
        run.finish({ error: e.message });
        throw e;
      }
      const r = run.record.result;
      return report(run, ws, a, [`steps: ${r.steps.filter((s) => s.ok).length}/${spec.steps.length} ok${r.ok ? '' : ` (stopped: ${r.steps.at(-1)?.error})`}`]);
    }
    case 'engines': {
      const e = await engines();
      if (a.json) return e;
      const g = e.gstack_browse;
      return [
        `playwright-core: ${e.playwright_core ?? 'missing'}`,
        `chromium: ${e.chromium ? `${e.chromium.version} at ${e.chromium.executable}` : 'unavailable'}`,
        e.error ? `error: ${e.error}` : null,
        `gstack browse: ${g.found ? `${g.path} (${g.ok ? 'help ok' : 'probe failed'}${g.version ? `, v${g.version}` : ''}; ${g.note})` : 'not found (optional)'}`,
      ].filter(Boolean).join('\n');
    }
    case undefined:
    case 'help':
      return BROWSE_HELP;
    default:
      throw new Error(`unknown browse subcommand "${sub}"\n${BROWSE_HELP}`);
  }
}
