// Derived from gstack (https://github.com/garrytan/gstack): browse/src/browser-skills.ts and the browser-skills
// layout (codified per-domain flows), plus scripts/resolvers/aside.ts consent rules ("look freely, act with consent").
// MIT License, Copyright (c) 2026 Garry Tan, modified for cstack. See licenses/gstack-MIT.txt.
// Changes: declarative YAML steps instead of in-process scripts (no code execution); locked to one named origin;
// mutating steps on non-local origins need --allow-mutation; secret fields are never filled; destructive
// targets are never clicked.
import YAML from 'yaml';
import { mutationGate, isSecretField, DESTRUCTIVE_RE } from './safety.mjs';
import { checkNavigation } from './url-guard.mjs';
import { takeSnapshot, locatorFor } from './snapshot.mjs';
import { gotoGuarded } from './launch.mjs';

export const STEP_OPS = ['goto', 'click', 'fill', 'wait', 'screenshot', 'snapshot'];
export const MAX_STEPS = 50;
export const BUDGET_MS = 60000;

/** Parse and statically check a steps file. Throws on anything outside the small grammar. */
export function parseSteps(text) {
  const doc = YAML.parse(text);
  if (!doc || typeof doc !== 'object') throw new Error('steps file must be a YAML mapping with origin and steps');
  let origin;
  try {
    origin = new URL(doc.origin).origin;
  } catch {
    throw new Error('steps file needs `origin: http(s)://host[:port]`');
  }
  if (!/^https?:/.test(origin)) throw new Error('origin must be http or https');
  const steps = doc.steps;
  if (!Array.isArray(steps) || !steps.length) throw new Error('steps must be a non-empty list');
  if (steps.length > MAX_STEPS) throw new Error(`at most ${MAX_STEPS} steps`);
  steps.forEach((s, i) => {
    const keys = s && typeof s === 'object' ? Object.keys(s) : [];
    if (keys.length !== 1 || !STEP_OPS.includes(keys[0])) throw new Error(`step ${i + 1}: expected one of ${STEP_OPS.join('/')}`);
    if (keys[0] === 'fill' && (typeof s.fill !== 'object' || !s.fill.target || s.fill.value === undefined)) throw new Error(`step ${i + 1}: fill needs {target, value}`);
    if (keys[0] === 'goto') {
      const r = checkNavigation(new URL(String(s.goto), origin).href, { allowOrigins: [origin] });
      if (!r.ok) throw new Error(`step ${i + 1}: ${r.reason}`);
    }
  });
  return { name: doc.name ?? null, origin, steps };
}

async function describe(loc) {
  return loc.first().evaluate((el) => {
    const a = el.closest('a');
    return {
      type: el.getAttribute('type'),
      name: el.getAttribute('name'),
      id: el.id,
      autocomplete: el.getAttribute('autocomplete'),
      label: el.getAttribute('aria-label') || el.labels?.[0]?.textContent || el.getAttribute('placeholder'),
      href: a ? a.href : null,
      text: (el.textContent || el.value || '').trim().slice(0, 120),
    };
  });
}

/** Execute steps on an already-guarded page. Stops at the first failure. */
export async function runSteps(page, run, spec, { allowMutation = false, ws, warnings } = {}) {
  const gate = mutationGate(spec.origin, spec.steps, allowMutation);
  if (!gate.ok) throw new Error(gate.reason);
  const deadline = Date.now() + BUDGET_MS;
  const log = [];
  let refs = [];
  let opened = false;
  for (const [i, step] of spec.steps.entries()) {
    const op = Object.keys(step)[0];
    const arg = step[op];
    const entry = { step: i + 1, op };
    try {
      if (Date.now() > deadline) throw new Error(`budget of ${BUDGET_MS / 1000}s exceeded`);
      if (op !== 'goto' && !opened) {
        await gotoGuarded(page, spec.origin + '/', { allowOrigins: [spec.origin], ws, warnings, check: checkNavigation });
        opened = true;
      }
      if (op === 'goto') {
        const r = await gotoGuarded(page, new URL(String(arg), spec.origin).href, { allowOrigins: [spec.origin], ws, warnings, check: checkNavigation });
        opened = true;
        Object.assign(entry, r);
      } else if (op === 'snapshot') {
        const s = await takeSnapshot(page, typeof arg === 'object' ? arg : {});
        refs = s.refs;
        entry.file = run.add(`snapshot-${i + 1}.txt`, Buffer.from(s.text));
        run.add(`refs-${i + 1}.json`, Buffer.from(JSON.stringify(s.refs, null, 2)));
      } else if (op === 'screenshot') {
        const o = typeof arg === 'object' ? arg : { name: arg };
        const name = String(o.name ?? `step-${i + 1}`).replace(/[^\w.-]+/g, '_');
        entry.file = run.add(`${name}.png`, await page.screenshot({ fullPage: !!o.full }));
      } else if (op === 'wait') {
        if (typeof arg === 'number') await page.waitForTimeout(Math.min(arg, 10000));
        else await locatorFor(page, String(arg), refs).first().waitFor({ timeout: 10000 });
        entry.target = String(arg);
      } else if (op === 'click') {
        const loc = locatorFor(page, String(arg), refs);
        const d = await describe(loc);
        if (DESTRUCTIVE_RE.test(`${d.href ?? ''} ${d.text}`)) throw new Error(`refused: destructive target (${d.text || d.href})`);
        await loc.first().click({ timeout: 10000 });
        await page.waitForLoadState('load').catch(() => {});
        entry.target = String(arg);
      } else if (op === 'fill') {
        const loc = locatorFor(page, String(arg.target), refs);
        if (isSecretField(await describe(loc))) throw new Error('refused: credential/secret field; the user fills it themselves');
        await loc.first().fill(String(arg.value), { timeout: 10000 });
        entry.target = String(arg.target);
        entry.value_length = String(arg.value).length;
      }
      entry.ok = true;
      log.push(entry);
    } catch (e) {
      log.push({ ...entry, ok: false, error: e.message.split('\n')[0] });
      break;
    }
  }
  return { origin: spec.origin, mutating_steps: gate.mutating.length, steps: log, ok: log.length === spec.steps.length && log.every((s) => s.ok) };
}
