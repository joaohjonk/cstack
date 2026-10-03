// Method before making: a library of researched flows (cstack flows/ + the workspace's own flows/),
// searched by outcome, checked for staleness, and copied into a run plan the agent then follows step by step.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { ROOT, exists, readData, writeAtomic, today } from './core.mjs';
import { validateValue } from './schemas.mjs';

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

// Gated workflows (workflows/<id>/workflow.yaml) answer bigger outcomes than one flow ("identity" → create-brand),
// so `flows search` offers them too. Same scoring: trigger phrases and the summary count double.
export function searchWorkflows(query, { k = 3 } = {}) {
  const q = new Set(words(query));
  const dir = path.join(ROOT, 'workflows');
  if (!exists(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((d) => exists(path.join(dir, d, 'workflow.yaml')))
    .map((d) => {
      const w = readData(path.join(dir, d, 'workflow.yaml'));
      const hay = words([w.name ?? d, w.summary, ...(w.triggers ?? []), ...(w.methods ?? [])].join(' '));
      const strong = words([w.summary, ...(w.triggers ?? [])].join(' ')).filter((x) => q.has(x)).length;
      return { workflow: { id: w.name ?? d, summary: w.summary, status: w.status, methods: w.methods ?? [] }, score: hay.filter((x) => q.has(x)).length + 2 * strong };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.workflow.id.localeCompare(b.workflow.id))
    .slice(0, k);
}

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

const MAKES = ['generative', 'probe'];

// A flow is followable only if it compared ways of getting there, gates every step, says how each made
// thing is judged against the target, and names where spending stops. Pure: no file or network access.
export function checkFlow(flow, { skills = null } = {}) {
  const errors = [];
  const warnings = [];
  if (!flow || typeof flow !== 'object' || Array.isArray(flow)) return { errors: ['not a flow (expected a YAML or JSON object)'], warnings };
  const v = validateValue('flow', flow);
  if (!v.ok) errors.push(`schema: ${v.errors}`);
  const cands = Array.isArray(flow.candidates_considered) ? flow.candidates_considered : [];
  if (cands.length < 2) errors.push(`compares ${cands.length} candidate way(s) to the outcome; method before making needs at least 2 (candidates_considered)`);
  else if (!cands.some((c) => c?.verdict === 'chosen')) errors.push('no candidate has verdict "chosen"');
  const steps = Array.isArray(flow.steps) ? flow.steps : [];
  const ids = new Set();
  for (const st of steps) {
    const at = `step "${st?.id}"`;
    if (ids.has(st?.id)) errors.push(`${at}: duplicate step id`);
    ids.add(st?.id);
    if (!st?.gate?.type) errors.push(`${at}: no gate (auto, owner, deterministic_check or independent_review)`);
    else if (st.gate.type === 'deterministic_check' && !st.gate.check) errors.push(`${at}: deterministic_check gate names no check`);
    if (MAKES.includes(st?.kind) && !st.compare_to_target) errors.push(`${at}: ${st.kind} step never says how its output is compared to the target (compare_to_target)`);
    if (skills && st?.skill && !skills.includes(st.skill)) errors.push(`${at}: unknown skill "${st.skill}"`);
    if (st?.kind === 'generative' && st.est_cost == null) warnings.push(`${at}: generative step has no est_cost`);
  }
  if (steps.some((s) => MAKES.includes(s?.kind))) {
    if (!flow.cost_ladder) errors.push('makes things but has no cost_ladder (probe, selection, final, and where it stops)');
    else if (!/\bstop/i.test(flow.cost_ladder)) warnings.push('cost_ladder names no stop condition');
  }
  if (flow.status === 'plan' && String(flow.target?.description ?? '').trim().length < 12) errors.push('plan has no concrete target.description (what "as close as possible" means for this run)');
  const ev = Array.isArray(flow.evidence) ? flow.evidence : [];
  if (ev.length && ev.every((e) => e?.kind === 'marketing')) warnings.push('all evidence is marketing; add documented, observed or practitioner evidence');
  return { errors, warnings };
}

// `cstack flows check <file...>`: checkFlow plus what needs the library. A plan whose target is still
// the library flow's own wording has not stated this run's target yet.
export function checkFlowFile(ws, file, { skills = null } = {}) {
  let flow;
  try {
    flow = readData(file);
  } catch (e) {
    return { file, errors: [exists(file) ? `cannot parse: ${e.message}` : 'no such file (no plan written yet?)'], warnings: [] };
  }
  const res = checkFlow(flow, { skills });
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const inLibrary = path.resolve(file).startsWith(path.join(ROOT, 'flows') + path.sep);
  // a library flow copied by hand into a run keeps its library status, so none of the plan checks would run
  if (!inLibrary && flow?.status !== 'plan' && path.resolve(file).includes(`${path.sep}work${path.sep}flows${path.sep}`)) {
    const twin = listFlows(ws).find((f) => f.scope === 'cstack' && same(f.steps, flow?.steps));
    res.errors.push(`a run plan under work/flows/ must have status: plan (found ${flow?.status ?? 'none'})${twin ? `; it is an unchanged copy of the "${twin.id}" library flow: start it with cstack flows plan ${twin.id} --target "..."` : ''}`);
  }
  if (flow?.status === 'plan') {
    const src = (flow.related ?? []).find((r) => String(r).startsWith('flow:'));
    const lib = src && listFlows(ws).find((f) => f.id === String(src).slice(5));
    if (lib && flow.target?.description && lib.target?.description === flow.target.description) res.errors.push(`target.description is still the "${lib.id}" library wording; state this run's target (--target or edit the plan)`);
    if (lib && same(lib.steps, flow.steps) && same(lib.target?.must, flow.target?.must)) res.warnings.push(`steps and target.must are unchanged from "${lib.id}": confirm they fit this run, or edit them (budget, sizes, owner checkpoints)`);
  }
  return { file, ...res };
}
