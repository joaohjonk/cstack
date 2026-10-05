// Method before making: a library of researched flows (cstack flows/ + the workspace's own flows/),
// searched by outcome, checked for staleness, and copied into a run plan the agent then follows step by step.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { ROOT, exists, readData, writeAtomic, today, walk } from './core.mjs';
import { validateValue } from './schemas.mjs';
import { briefApproved, feedbackMark } from './brief.mjs';
import { onPath } from './tools.mjs';
import { approvedSpecs } from './packspec.mjs';

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
export function planFromFlow(ws, id, { target, deliverable, key_visual } = {}) {
  const f = listFlows(ws).find((x) => x.id === id);
  if (!f) throw new Error(`no flow "${id}" (try: cstack flows search "<outcome>")`);
  const plan = planDoc(f, { id: `${today()}-${f.id}`, target, deliverable, key_visual });
  const out = path.join(ws, 'work', 'flows', `${plan.id}.flow.yaml`);
  if (exists(out)) throw new Error(`${out} already exists; edit it or remove it first`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  writeAtomic(out, YAML.stringify(plan));
  return { file: out, stale: f.stale, age_days: f.age_days, source_scope: f.scope };
}

/** The run plan for one listed flow (status: plan), as planFromFlow writes it; eval props build case plans with it. */
export function planDoc(f, { id, target, deliverable, key_visual } = {}) {
  const { file, scope, age_days, stale, ...flow } = f;
  const plan = {
    ...flow,
    id,
    status: 'plan',
    related: [...new Set([...(flow.related ?? []), `flow:${f.id}`])],
    target: { ...(flow.target ?? {}), ...(target ? { description: target } : {}) },
  };
  // the deliverable comes from the library flow; --deliverable and --key-visual override it for this run
  if (deliverable) plan.deliverable = { kind: deliverable };
  if (key_visual) plan.deliverable = { ...(plan.deliverable ?? {}), key_visual: true };
  if (plan.deliverable && !plan.deliverable.kind) throw new Error('--key-visual needs a deliverable kind: pass --deliverable <kind>');
  return plan;
}

const MAKES = ['generative', 'probe'];
const PACK_FLOWS = new Set(['concept-wrap', 'packaging-system', 'mockup-set', 'shelf-test']);
const PACK_WORDS = /\b(pack|packs|packaging|can|cans|label|labels|wrap|bottle|bottles|box|boxes|pouch|carton)\b/i;

// A flow is followable only if it compared ways of getting there, gates every step, says how each made
// thing is judged against the target, and names where spending stops. Pure: no file or network access.
export function checkFlow(flow, { skills = null } = {}) {
  const errors = [];
  const warnings = [];
  if (!flow || typeof flow !== 'object' || Array.isArray(flow)) return { errors: ['not a flow (expected a YAML or JSON object)'], warnings };
  const v = validateValue('flow', flow);
  if (!v.ok) errors.push(`schema: ${v.errors}`);
  const cands = Array.isArray(flow.candidates_considered) ? flow.candidates_considered : [];
  if (!flow.deliverable?.kind) warnings.push('no deliverable.kind: flows gate cannot run on a plan without it (library flows carry one; a plan takes --deliverable <kind>)');
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
    // a phase budget (F64) caps what the step may spend before it stops and asks; below its own unit cost it can never run
    if (st?.budget && st.est_cost && st.budget.currency === st.est_cost.currency && Number(st.budget.amount) < Number(st.est_cost.amount)) errors.push(`${at}: budget ${st.budget.amount} ${st.budget.currency} is below one unit of its est_cost (${st.est_cost.amount})`);
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
    const src = sourceFlowRef(flow);
    const lib = src && listFlows(ws).find((f) => f.id === String(src).slice(5));
    if (lib && flow.target?.description && lib.target?.description === flow.target.description) res.errors.push(`target.description is still the "${lib.id}" library wording; state this run's target (--target or edit the plan)`);
    if (lib && same(lib.steps, flow.steps) && same(lib.target?.must, flow.target?.must)) res.warnings.push(`steps and target.must are unchanged from "${lib.id}": confirm they fit this run, or edit them (budget, sizes, owner checkpoints)`);
  }
  return { file, ...res };
}

// flows gate: the run's plan read at three moments, so quality is not left to compliance checks alone.
//   make    the plan passes flows check, meets its `requires` (or records the owner's waiver), states its deliverable, and imagery that needs generation has a usable media
//           provider here (or the owner's recorded yes to a substitute): missing capability never degrades silently
//   decide  + at least two territories, each made visible as a probe contact sheet that exists
//   final   + references/gold is not empty, and the work has been put side by side with at least one gold reference
export const GATE_STAGES = ['make', 'decide', 'final'];
const VISUAL = new Set(['image', 'video', '3d', 'vector', 'type', 'diagram', 'page']);
const GENERATED = new Set(['image', 'video']);
// skills that call a media model; a generative step in another skill (an agent drafting SVG icons) needs no provider
const MEDIA_SKILLS = new Set(['generate-media', 'image-edit', 'video-direction']);

export function goldRefs(ws) {
  const dir = path.join(ws, 'references', 'gold');
  if (!exists(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.reference.yaml')).map((f) => {
    try {
      return readData(path.join(dir, f))?.id ?? f.replace(/\.reference\.yaml$/, '');
    } catch {
      return f.replace(/\.reference\.yaml$/, '');
    }
  });
}

const REQUIRE_TEXT = {
  founder_brief: 'no owner-approved founder brief (briefs/*.founder-brief.yaml approved with `cstack brief approve`, unchanged since, and not reopened): interview the founder first with /brief in founding mode (why it exists, the customer, the brand as a person, assets and inspirations)',
  reference_reactions: 'no reference packet or board the owner has reacted to (work/references/*-packet.md or a cstack sheet board, and approve, reject, gold, anti, pairwise or comment feedback on at least two individual references/ or work/references/ items in state/feedback.jsonl, given since the last brief pivot; a reaction to the whole packet does not count): bring the founder references first (taste-search), then let them keep or kill each one on a board (cstack sheet board references/ --out work/sheets/refs.html, then cstack sheet import)',
  pack_spec: 'no approved pack spec (a *.pack-spec.yaml with front_mm and flat_mm from the dieline, the converter\'s print file or a measurement, source named, approval locked or current): cstack never invents packaging sizes (F86); ask the owner for the dieline or print file, read its sizes (cstack pack spec-from-pdf <file>), have them confirm, and check every pack render with cstack pack check',
  product_truth: 'no owner-confirmed product-truth reference (a *.reference.yaml with library own_asset and approval locked or current: the owner\'s own photo or an official asset): a product or food close-up drawn from research images can show someone else\'s product (F71); ask the owner for one photo of the real product, record it, and keep research images labelled "real product" at approval inferred until the owner confirms them',
};

// Which of the plan's `requires` the workspace does not meet yet. A requirement the owner waived in the plan is
// reported as a warning that names the waiver, never dropped silently.
// The library flow a plan was made from: flows plan appends `flow:<id>` last, after the flow's own related flows.
function sourceFlowRef(flow) {
  return (flow.related ?? []).filter((r) => String(r).startsWith('flow:')).at(-1);
}

export function requirementGaps(ws, flow, implied = []) {
  const out = [];
  // a plan made before its library flow gained a requirement still owes it (F26): the library's requires count too
  const src = sourceFlowRef(flow);
  const lib = src ? listFlows(ws).find((f) => f.id === String(src).slice(5)) : null;
  for (const req of new Set([...(flow.requires ?? []), ...(lib?.requires ?? []), ...implied])) {
    if (requirementMet(ws, req)) continue;
    const w = (flow.waivers ?? []).find((x) => x.requires === req && x.owner_approved);
    // F66: a waiver says who waived it and in their words, so the warning carries the owner's voice, not the agent's
    const who = w?.by ? `${w.by} waived it ${w.owner_approved}` : `owner waived it ${w?.owner_approved}`;
    const said = w?.quote ? `, saying "${w.quote}"` : '';
    out.push(w ? { requires: req, waived: true, message: `make: going ahead without ${req.replace('_', ' ')} (${who}${said}: ${w.why})${w.by && w.quote ? '' : '; record by and quote on the waiver: who said yes, and their words'}; say so wherever the work is shown` } : { requires: req, waived: false, message: `make: ${REQUIRE_TEXT[req] ?? req}; or record the owner's waiver in the plan (waivers: [{requires: ${req}, owner_approved: <date>, by: <owner>, quote: "<their words>", why}])` });
  }
  return out;
}

function requirementMet(ws, req) {
  if (req === 'pack_spec') return approvedSpecs(ws).length > 0;
  if (req === 'founder_brief') {
    const dir = path.join(ws, 'briefs');
    if (!exists(dir)) return false;
    return fs.readdirSync(dir).filter((f) => /\.founder-brief\.(ya?ml|json)$/.test(f)).some((f) => {
      try {
        const b = readData(path.join(dir, f));
        return briefApproved(b);
      } catch {
        return false;
      }
    });
  }
  if (req === 'product_truth') {
    const dir = path.join(ws, 'references');
    if (!exists(dir)) return false;
    const recs = [];
    const walkRefs = (d) => {
      for (const f of fs.readdirSync(d)) {
        const p = path.join(d, f);
        if (fs.statSync(p).isDirectory()) walkRefs(p);
        else if (/\.reference\.ya?ml$/.test(f)) recs.push(p);
      }
    };
    walkRefs(dir);
    return recs.some((p) => {
      try {
        const r = readData(p);
        return r?.library === 'own_asset' && ['locked', 'current'].includes(r?.approval);
      } catch {
        return false;
      }
    });
  }
  if (req === 'reference_reactions') {
    const dir = path.join(ws, 'work', 'references');
    // a reference board (cstack sheet board, F65) stands in for a written packet: it is where the founder reacts
    const sheets = path.join(ws, 'work', 'sheets');
    const board = exists(sheets) && fs.readdirSync(sheets).some((f) => {
      if (!f.endsWith('.json')) return false;
      try {
        return JSON.parse(fs.readFileSync(path.join(sheets, f), 'utf8'))?.board === true;
      } catch {
        return false;
      }
    });
    const packet = board || (exists(dir) && fs.readdirSync(dir).some((f) => f.endsWith('-packet.md')));
    const fb = path.join(ws, 'state', 'feedback.jsonl');
    if (!packet || !exists(fb)) return false;
    const kinds = new Set(['approve', 'reject', 'gold', 'anti', 'pairwise', 'comment']);
    // reactions given before the last pivot were to work made for an older brief (F42, F52)
    const mark = feedbackMark(ws);
    // one "yes" to the whole board is not a reaction to references (F36): it takes reactions to at least two
    // individual references (a pairwise pick names two)
    const refs = new Set();
    const isRef = (r) => /^(work\/)?references\//.test(r) && !/-packet\.md$/.test(r) && !r.endsWith('/');
    for (const l of fs.readFileSync(fb, 'utf8').split('\n').filter((x) => x.trim()).slice(mark)) {
      try {
        const e = JSON.parse(l);
        if (!kinds.has(e.type)) continue;
        for (const r of [e.artifact_ref, e.pair?.a, e.pair?.b].map((x) => String(x ?? ''))) if (isRef(r)) refs.add(r);
      } catch {}
    }
    return refs.size >= 2;
  }
  return false;
}

/** gateFlow(ws, file, {stage, providers: availability() rows, skills, budget: the workspace budget (undefined = not checked)}) -> {file, stage, errors, warnings} */
export function gateFlow(ws, file, { stage = 'make', providers = [], skills = null, budget = undefined } = {}) {
  if (!GATE_STAGES.includes(stage)) throw new Error(`--stage must be one of ${GATE_STAGES.join(', ')}`);
  const at = GATE_STAGES.indexOf(stage);
  const res = checkFlowFile(ws, file, { skills });
  const errors = [...res.errors];
  const warnings = [...res.warnings];
  const flow = (() => {
    try {
      return readData(file);
    } catch {
      return null;
    }
  })();
  if (!flow) return { file, stage, errors, warnings };
  if (flow.status !== 'plan') errors.push(`flows gate reads a run plan (status: plan); start one with cstack flows plan <id> --target "..."`);
  const d = flow.deliverable;
  if (!d?.kind) {
    errors.push('state deliverable.kind in the plan (image, video, 3d, vector, type, diagram, page, copy or other) so the gate knows what is being made: cstack flows plan <id> --deliverable <kind>, or add it to the plan');
    return { file, stage, errors, warnings };
  }
  const inWs = (p) => exists(path.resolve(ws, p));
  // make: generation is needed and missing here
  // only making needs a provider and a budget; decide and final judge files that already exist
  const generative = (d.generated ?? GENERATED.has(d.kind)) || (flow.steps ?? []).some((s) => s.kind === 'generative' && MEDIA_SKILLS.has(s.skill));
  if (generative && at === 0) {
    const media = providers.filter((p) => p.kind === 'media' && p.id !== 'mock' && p.status !== 'stub');
    const usable = media.filter((p) => p.available);
    if (!usable.length && !d.substitute?.owner_approved) {
      const why = media.map((p) => `${p.id}: ${p.missing_env?.length ? `${p.missing_env.join(', ')} not set` : 'unavailable'}`).join('; ') || 'none registered';
      errors.push(`needs generation, and no media provider is usable here (${why}): run this where the keys live. Do not make it another way (hand-drawn vector, a placeholder) unless the owner says yes; then record deliverable.substitute {to, owner_approved, why}`);
    }
    // a zero budget is the same gap as a missing key: ask for money, never fall back to a free method that cannot meet the brief
    if (usable.length && budget !== undefined && !(budget?.per_run > 0 && budget?.per_day > 0) && !d.substitute?.owner_approved)
      errors.push(`needs generation, and the budget here is ${budget ? `per_run ${budget.per_run ?? 0}, per_day ${budget.per_day ?? 0}` : 'not set'}: ask the owner for a budget (cstack.config.yaml budget:) before making it; a free substitute needs their yes, recorded as deliverable.substitute`);
    // F64: the phases' budgets together must fit the run budget, or the last phase is the one that gets cut
    const phases = (flow.steps ?? []).filter((s) => s.budget?.amount > 0);
    const total = Math.round(phases.reduce((a, s) => a + Number(s.budget.amount), 0) * 100) / 100;
    if (phases.length && budget?.per_run > 0 && total > budget.per_run) warnings.push(`make: the phase budgets add up to ${total} (${phases.map((s) => `${s.id} ${s.budget.amount}`).join(', ')}), over this workspace's per_run ${budget.per_run}; lower a phase or ask the owner to raise per_run before starting, so the polish phase is not the one cut`);
    if (!usable.length && d.substitute?.owner_approved) warnings.push(`making it as ${d.substitute.to} instead of generating it (owner approved ${d.substitute.owner_approved}); say so wherever the work is shown`);
  }
  // F67: a stop rule that runs `cstack image text` needs tesseract or a judge command; say so before making, not mid-batch
  if (at === 0 && (flow.steps ?? []).some((s) => /cstack image text/.test(String(s.gate?.check ?? ''))) && !onPath('tesseract'))
    warnings.push('make: a stop rule runs cstack image text, and tesseract is not on PATH here; install it (brew install tesseract; cstack never installs it) or pass --engine judge --judge "<agent cmd>" each time, or the check refuses');
  // F68: compiled prompts are cheap to review and expensive to discover wrong after a paid batch
  if (at === 0 && generative) {
    const steps = flow.steps ?? [];
    const firstGen = steps.findIndex((s) => s.kind === 'generative' && MEDIA_SKILLS.has(s.skill));
    const reviewed = steps.slice(0, firstGen < 0 ? steps.length : firstGen).some((s) => /prompt/i.test(`${s.id} ${s.does}`) && (s.skill === 'creative-review' || s.gate?.type === 'independent_review'));
    if (firstGen >= 0 && !reviewed) warnings.push('make: no prompt review before the first paid generation; have creative-review read the compiled prompts against the territory and the references the founder reacted to before spending (a prompt-review step)');
  }
  // F73: a pack made by an image model comes back with invented type and a label, not a poster; the pack is flat
  // artwork with real type (concept-wrap), the model makes only the picture inside it
  if (at === 0 && generative && !PACK_FLOWS.has(String(sourceFlowRef(flow) ?? '').slice(5) || flow.id) && PACK_WORDS.test(`${flow.target?.description ?? ''} ${(flow.target?.must ?? []).join(' ')}`))
    warnings.push('make: the target is a pack, and this flow has an image model make it; design the pack as flat artwork with real type (cstack flows plan concept-wrap), let the model make only the picture inside it, and see it on the object with cstack mockup template can and mockup render');
  // requires: a brand from zero starts with the founder, then references the founder reacted to, then territories
  // F86: a plan that makes a pack, or pictures of one, owes the real pack's sizes whichever flow it came from
  const packTarget = PACK_WORDS.test(`${flow.target?.description ?? ''} ${(flow.target?.must ?? []).join(' ')}`);
  if (at === 0) for (const e of requirementGaps(ws, flow, generative && packTarget ? ['pack_spec'] : [])) (e.waived ? warnings : errors).push(e.message);
  if (at >= 1 && VISUAL.has(d.kind)) {
    const t = flow.territories ?? [];
    if (t.length < 2) errors.push(`decide: ${t.length} territor${t.length === 1 ? 'y' : 'ies'} recorded; a visual decision needs at least two, each made visible as a probe contact sheet (territories: [{name, probe_sheet}])`);
    for (const x of t) if (!inWs(x.probe_sheet)) errors.push(`decide: territory "${x.name}" has no probe sheet at ${x.probe_sheet}; a direction described only in words is not a visible option`);
    if (t.length === 2) warnings.push('decide: two territories; creative-direction asks for three that differ in idea, not styling');
    // F87: founder first, not founder only; a decision taken without cstack arguing for something better is taken alone
    const memos = walk(path.join(ws, 'work'), (f) => /challenge[^/\\]*\.md$/i.test(path.basename(f)));
    if (!memos.length) warnings.push('decide: no challenge memo in work/ (work/direction/<date>-challenge.md): before the owner decides, creative-review argues for a braver version and asks about price, claim and positioning (creative-review references/challenge.md)');
    // F69: a territory that depends on a price, a number or the wordmark needs them set after generation, not dropped
    const needs = [...new Set(t.flatMap((x) => x.composite ?? []))];
    const composites = (flow.steps ?? []).some((s) => s.skill === 'vector-master' || /\bcomposit(e|ed|es|ing)\b/i.test(`${s.id} ${s.does}`));
    if (needs.length && !composites) errors.push(`decide: territories depend on ${needs.join(', ')}, set after generation, and the plan has no composite step (vector-master) to set them; add one, so the no-lettering rule does not strip what the idea needs`);
  }
  if (at >= 2 && VISUAL.has(d.kind)) {
    const gold = goldRefs(ws);
    if (!gold.length) errors.push('final: references/gold is empty, so nothing says what good looks like; add at least one gold reference (taste-search) before judging the work');
    const cmp = flow.gold_comparisons ?? [];
    if (gold.length && !cmp.length) errors.push(`final: no side-by-side against a gold reference; put the work next to one of ${gold.slice(0, 3).join(', ')}${gold.length > 3 ? ', ...' : ''} and record it (gold_comparisons: [{gold_ref, sheet}])`);
    for (const c of cmp) {
      if (gold.length && !gold.includes(c.gold_ref)) errors.push(`final: gold_ref "${c.gold_ref}" is not in references/gold`);
      if (!inWs(c.sheet)) errors.push(`final: comparison sheet ${c.sheet} does not exist`);
    }
  }
  return { file, stage, errors, warnings };
}
