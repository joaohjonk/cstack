// Cost / latency ledger + spend guard.
// Every provider call goes through guardedCall(): dedupe by idempotency key, check the budget envelope,
// write a ledger line for dry runs, successes and failures alike. The gate is code, not a prompt.
import path from 'node:path';
import { appendJSONL, readJSONL, hashValue, nowISO, newId, exists, readData } from './core.mjs';

export function ledgerPath(ws) {
  return path.join(ws, 'state', 'cost-ledger.jsonl');
}

export function idempotencyKey({ provider, model, operation, input_hashes = [], prompt_recipe_hash = '', prompt_hash = '', params = {} }) {
  return hashValue({ provider, model, operation, input_hashes: [...input_hashes].sort(), prompt_recipe_hash, prompt_hash, params });
}

export function readLedger(ws) {
  return readJSONL(ledgerPath(ws));
}

// Money that counts against the budget: ok and failed attempts, plus queued jobs (a provider may charge at submit).
// A queued job counts once, and not again when its ok row lands. Unpriced calls count at their booked_cost.
const COUNTED = ['ok', 'failed_other', 'failed_transient', 'failed_policy'];
const costOf = (r) => r.actual_cost_if_available ?? r.estimated_cost ?? r.booked_cost;
export function spent(rows, { currency = 'USD', since, experiment_id } = {}) {
  const inWindow = rows.filter((r) => !(since && r.ts < since) && !(experiment_id && r.experiment_id !== experiment_id));
  const settled = new Set(inWindow.filter((r) => COUNTED.includes(r.status)).map((r) => r.idempotency_key));
  const queued = new Set();
  let total = 0;
  for (const r of inWindow) {
    if (r.status === 'queued') {
      if (settled.has(r.idempotency_key) || queued.has(r.idempotency_key)) continue;
      queued.add(r.idempotency_key);
    } else if (!COUNTED.includes(r.status)) continue;
    const c = costOf(r);
    if (c && c.currency === currency) total += c.amount;
  }
  return Math.round(total * 10000) / 10000;
}

// per_day is the owner's calendar day: local midnight, as an ISO timestamp comparable with ledger `ts`.
export function dayStart(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// Budget envelope lives in <ws>/cstack.config.yaml (or json):
// budget: {currency, per_run, per_day, confirm_over, allow_unpriced, unpriced_call_cost}
export function loadBudget(ws) {
  for (const f of ['cstack.config.yaml', 'cstack.config.yml', 'cstack.config.json']) {
    const p = path.join(ws, f);
    if (exists(p)) return readData(p)?.budget ?? null;
  }
  return null;
}

// An unpriced call is not free. It is booked at budget.unpriced_call_cost, else at per_run (the most the owner
// allows for one run), and refused outright when the budget is 0 or missing.
export function unpricedBooking(budget) {
  if (!budget || !(budget.per_run > 0) || !(budget.per_day > 0)) return null;
  const amount = budget.unpriced_call_cost > 0 ? Math.min(budget.unpriced_call_cost, budget.per_run) : budget.per_run;
  return { amount, currency: budget.currency ?? 'USD', unit: budget.unpriced_call_cost > 0 ? 'unpriced call (budget.unpriced_call_cost)' : 'unpriced call (booked at per_run)' };
}

/**
 * Plan a batch before spending: estimated envelope + stop condition.
 * items: [{provider, model, operation, est: {amount, currency}}]. Items without est are unpriced: booked as above.
 */
export function planBatch(ws, items, { stop_condition } = {}) {
  if (!Array.isArray(items)) throw new Error('items must be a JSON array of {provider, model, operation, est}');
  const budget = loadBudget(ws);
  const currency = budget?.currency ?? items.find((i) => i?.est)?.est?.currency ?? 'USD';
  const problems = [];
  const unpriced = items.filter((i) => !(i?.est && Number.isFinite(i.est.amount)));
  const foreign = items.filter((i) => i?.est && i.est.currency && i.est.currency !== currency);
  const booking = unpricedBooking(budget);
  const total = items.reduce((s, i) => s + (unpriced.includes(i) ? booking?.amount ?? 0 : foreign.includes(i) ? 0 : i.est.amount), 0);
  const today = spent(readLedger(ws), { currency, since: dayStart() });
  if (!budget) problems.push('no budget envelope configured (cstack.config.yaml budget:) — paid calls are blocked until one exists');
  if (foreign.length) problems.push(`${foreign.length} item(s) priced in ${[...new Set(foreign.map((i) => i.est.currency))].join(', ')}, not ${currency}; convert before planning`);
  if (unpriced.length && budget && !booking) problems.push(`${unpriced.length} unpriced item(s) under a zero budget: an unpriced call is still a paid call; raise per_run/per_day first`);
  if (budget?.per_run != null && total > budget.per_run) problems.push(`batch estimate ${total} ${currency} exceeds per_run ${budget.per_run}`);
  if (budget?.per_day != null && today + total > budget.per_day) problems.push(`today ${today} + batch ${total} exceeds per_day ${budget.per_day}`);
  if (!stop_condition) problems.push('no stop condition given');
  const needs_confirmation = budget?.confirm_over != null && total > budget.confirm_over;
  return { items: items.length, unpriced: unpriced.length, estimated_total: Math.round(total * 10000) / 10000, currency, spent_today: today, budget, stop_condition, needs_confirmation, ok: problems.length === 0, problems };
}

// Transient first is not safe (a policy message may mention a status code); policy is matched narrowly instead,
// so "Content-Type" or a 403 auth error is never mistaken for a content decision.
const TRANSIENT = /timeout|ETIMEDOUT|ECONNRESET|429|502|503|504|rate.?limit|temporar/i;
const POLICY = /content[ _-]?(policy|filter|moderation|violation)|safety|moderation|nsfw|violat/i;
export function classifyError(err) {
  const m = String(err?.message ?? err);
  if (POLICY.test(m)) return 'failed_policy';
  if (TRANSIENT.test(m)) return 'failed_transient';
  return 'failed_other';
}

/**
 * guardedCall(ws, spec, fn)
 * spec: {provider, model, operation, input_hashes, prompt_recipe_hash, params, estimated_cost, skill, experiment_id, dry_run, max_retries,
 *        confirm_unpriced, confirmed (owner said yes above confirm_over), reattach (polling a job already paid), retry_base_ms}
 * fn: async () => {output_ids, actual_cost?}
 * - dedupes: a previous ok row with the same idempotency key returns it without calling (no double spend)
 * - dry_run: logs and returns without calling
 * - unpriced calls need confirm_unpriced or allow_unpriced, never pass a zero budget, and are booked toward per_day
 * - confirm_over blocks until spec.confirmed
 * - retries only transient failures (never policy/content failures), bounded
 */
export async function guardedCall(ws, spec, fn) {
  const key = idempotencyKey(spec);
  const rows = readLedger(ws);
  const prior = rows.find((r) => r.idempotency_key === key && r.status === 'ok');
  const base = {
    run_id: spec.run_id ?? newId('RUN'),
    provider: spec.provider,
    model: spec.model,
    operation: spec.operation,
    input_hashes: spec.input_hashes ?? [],
    prompt_recipe_hash: spec.prompt_recipe_hash ?? '',
    idempotency_key: key,
    estimated_cost: spec.estimated_cost ?? null,
    skill: spec.skill,
    experiment_id: spec.experiment_id,
  };
  if (prior && !spec.force) {
    const row = { ...base, ts: nowISO(), status: 'deduplicated', output_ids: prior.output_ids ?? [], retry_count: 0, cache_status: 'hit', actual_cost_if_available: null, latency_ms: 0 };
    appendJSONL(ledgerPath(ws), row);
    return { deduplicated: true, row, output_ids: prior.output_ids ?? [] };
  }
  if (spec.dry_run) {
    const row = { ...base, ts: nowISO(), status: 'dry_run', output_ids: [], retry_count: 0, cache_status: 'n/a', actual_cost_if_available: null, latency_ms: null };
    appendJSONL(ledgerPath(ws), row);
    return { dry_run: true, row };
  }
  const budget = loadBudget(ws);
  const unpriced = spec.estimated_cost == null;
  const booked = unpriced ? unpricedBooking(budget) : null;
  if (booked) base.booked_cost = booked;
  const plan = planBatch(ws, [{ ...spec, est: spec.estimated_cost }], { stop_condition: spec.stop_condition ?? 'single call' });
  if (unpriced && !spec.confirm_unpriced && !budget?.allow_unpriced) {
    plan.ok = false;
    plan.problems.push('no cost estimate for this call; add estimated_cost to the request, confirm with --confirm-unpriced after asking the owner, or set budget.allow_unpriced');
  }
  // the owner's per-call yes to an unpriced call is also their yes to its booked amount
  if (plan.needs_confirmation && !spec.confirmed && !(unpriced && spec.confirm_unpriced)) {
    plan.ok = false;
    plan.problems.push(`estimate ${plan.estimated_total} ${plan.currency} is over confirm_over ${budget.confirm_over}; ask the owner, then confirm (--confirm)`);
  }
  // re-attaching to a job that was already submitted (and paid) only collects it: never block that
  if (!plan.ok && !spec.reattach) {
    const row = { ...base, ts: nowISO(), status: 'budget_blocked', output_ids: [], retry_count: 0, cache_status: 'n/a', actual_cost_if_available: null, latency_ms: null, error: plan.problems.join('; ') };
    appendJSONL(ledgerPath(ws), row);
    return { blocked: true, row, problems: plan.problems };
  }
  const maxRetries = spec.max_retries ?? 2;
  let attempt = 0;
  for (;;) {
    const t0 = Date.now();
    try {
      const res = await fn();
      const row = { ...base, ts: nowISO(), status: 'ok', output_ids: res.output_ids ?? [], retry_count: attempt, cache_status: res.cache_status ?? 'miss', actual_cost_if_available: res.actual_cost ?? null, latency_ms: Date.now() - t0 };
      appendJSONL(ledgerPath(ws), row);
      return { row, ...res };
    } catch (err) {
      if (err?.pending) {
        const row = { ...base, ts: nowISO(), status: 'queued', output_ids: [], retry_count: attempt, cache_status: 'n/a', actual_cost_if_available: null, latency_ms: Date.now() - t0, error: String(err.message).slice(0, 300) };
        appendJSONL(ledgerPath(ws), row);
        return { pending: true, row };
      }
      const status = classifyError(err);
      const row = { ...base, ts: nowISO(), status, output_ids: [], retry_count: attempt, cache_status: 'n/a', actual_cost_if_available: null, latency_ms: Date.now() - t0, error: String(err?.message ?? err).slice(0, 500) };
      appendJSONL(ledgerPath(ws), row);
      if (status !== 'failed_transient' || attempt >= maxRetries) return { failed: true, row };
      attempt += 1;
      await new Promise((r) => setTimeout(r, Math.min(30000, (spec.retry_base_ms ?? 1000) * 2 ** attempt)));
    }
  }
}
