// Method before making: a library of researched flows (cstack flows/ + the workspace's own flows/),
// searched by outcome, checked for staleness, and copied into a run plan the agent then follows step by step.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { ROOT, exists, readData, writeAtomic, today } from './core.mjs';

const DAY = 86400000;

export function flowDirs(ws) {
  const dirs = [{ dir: path.join(ROOT, 'flows'), scope: 'cstack' }];
  if (ws && path.resolve(ws) !== ROOT) dirs.push({ dir: path.join(ws, 'flows'), scope: 'workspace' });
  return dirs;
}

export function listFlows(ws, { now = Date.now() } = {}) {
  const out = [];
  for (const { dir, scope } of flowDirs(ws)) {
    if (!exists(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => /\.flow\.ya?ml$/.test(x)).sort()) {
      const file = path.join(dir, f);
      const flow = readData(file);
      const age = flow.last_verified ? Math.floor((now - Date.parse(flow.last_verified)) / DAY) : null;
      const stale = flow.status === 'stale' || (age != null && age > (flow.stale_after_days ?? 90));
      out.push({ ...flow, file, scope, age_days: age, stale });
    }
  }
  // a workspace flow with the same id overrides the cstack one (brand-specific learning wins)
  const byId = new Map();
  for (const f of out) if (!byId.has(f.id) || f.scope === 'workspace') byId.set(f.id, f);
  return [...byId.values()];
}

const STOP = new Set(['the', 'and', 'for', 'with', 'our', 'make', 'like', 'that', 'this', 'from', 'into', 'want', 'need', 'best', 'site', 'sites']);
const stem = (w) => w.replace(/(ing|ed|es|s)$/, '').replace(/e$/, '');
const words = (s) => (String(s ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => (w.length > 2 || /\d/.test(w)) && !STOP.has(w)).map(stem);

export function searchFlows(ws, query, { k = 5 } = {}) {
  const q = new Set(words(query));
  return listFlows(ws)
    .map((f) => {
      const hay = words([f.id, f.outcome, ...(f.aliases ?? []), ...(f.when ?? [])].join(' '));
      const hit = hay.filter((w) => q.has(w)).length;
      const strong = words([f.outcome, ...(f.aliases ?? [])].join(' ')).filter((w) => q.has(w)).length;
      return { flow: f, score: hit + 2 * strong };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.flow.id.localeCompare(b.flow.id))
    .slice(0, k);
}

// Copy a library flow into the workspace as this run's plan; the agent fills target and adjusts steps.
export function planFromFlow(ws, id, { target } = {}) {
  const f = listFlows(ws).find((x) => x.id === id);
  if (!f) throw new Error(`no flow "${id}" (try: cstack flows search "<outcome>")`);
  const { file, scope, age_days, stale, ...flow } = f;
  const plan = {
    ...flow,
    id: `${today()}-${f.id}`,
    status: 'plan',
    related: [...new Set([...(flow.related ?? []), `flow:${f.id}`])],
    target: { ...(flow.target ?? {}), ...(target ? { description: target } : {}) },
  };
  const out = path.join(ws, 'work', 'flows', `${plan.id}.flow.yaml`);
  if (exists(out)) throw new Error(`${out} already exists; edit it or remove it first`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  writeAtomic(out, YAML.stringify(plan));
  return { file: out, stale, age_days, source_scope: scope };
}
