// Cost / latency ledger + spend guard (sections 11, 25, 34).
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

export function spent(rows, { currency = 'USD', since, experiment_id } = {}) {
  let total = 0;
  for (const r of rows) {
    if (!['ok', 'failed_other', 'failed_transient', 'failed_policy'].includes(r.status)) continue;
    if (since && r.ts < since) continue;
    if (experiment_id && r.experiment_id !== experiment_id) continue;
    const c = r.actual_cost_if_available ?? r.estimated_cost;
    if (c && c.currency === currency) total += c.amount;
  }
  return Math.round(total * 10000) / 10000;
}

// Budget envelope lives in <ws>/cstack.config.yaml (or json): budget: {currency, per_run, per_day, per_batch_confirm_over}
export function loadBudget(ws) {
  for (const f of ['cstack.config.yaml', 'cstack.config.yml', 'cstack.config.json']) {
    const p = path.join(ws, f);
    if (exists(p)) return readData(p)?.budget ?? null;
  }
  return null;
}

/**
 * Plan a batch before spending (section 34): estimated envelope + stop condition.
 * items: [{provider, model, operation, est: {amount, currency}}]
 */
export function planBatch(ws, items, { stop_condition } = {}) {
  const budget = loadBudget(ws);
  const currency = budget?.currency ?? items[0]?.est?.currency ?? 'USD';
  const total = items.reduce((s, i) => s + (i.est?.amount ?? 0), 0);
  const day = new Date().toISOString().slice(0, 10);
  const today = spent(readLedger(ws), { currency, since: day });
  const problems = [];
  if (!budget) problems.push('no budget envelope configured (cstack.config.yaml budget:) — paid calls are blocked until one exists');
  if (budget?.per_run != null && total > budget.per_run) problems.push(`batch estimate ${total} ${currency} exceeds per_run ${budget.per_run}`);
  if (budget?.per_day != null && today + total > budget.per_day) problems.push(`today ${today} + batch ${total} exceeds per_day ${budget.per_day}`);
  if (!stop_condition) problems.push('no stop condition given');
  const needs_confirmation = budget?.confirm_over != null && total > budget.confirm_over;
  return { items: items.length, estimated_total: Math.round(total * 10000) / 10000, currency, spent_today: today, budget, stop_condition, needs_confirmation, ok: problems.length === 0, problems };
}

const TRANSIENT = /timeout|ETIMEDOUT|ECONNRESET|429|502|503|504|rate.?limit|temporar/i;
const POLICY = /policy|safety|content|moderation|nsfw|forbidden|violat/i;
export function classifyError(err) {
  const m = String(err?.message ?? err);
  if (POLICY.test(m)) return 'failed_policy';
  if (TRANSIENT.test(m)) return 'failed_transient';
  return 'failed_other';
}

/**
 * guardedCall(ws, spec, fn)
 * spec: {provider, model, operation, input_hashes, prompt_recipe_hash, params, estimated_cost, skill, experiment_id, dry_run, max_retries}
 * fn: async () => {output_ids, actual_cost?}
 * - dedupes: a previous ok row with the same idempotency key returns it without calling (no double spend)
 * - dry_run: logs and returns without calling
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
  const plan = planBatch(ws, [{ ...spec, est: spec.estimated_cost }], { stop_condition: spec.stop_condition ?? 'single call' });
  // an unpriced call is not a free call: block it unless the owner confirmed it for this call or allowed unpriced calls in the budget
  if (spec.estimated_cost == null && !spec.confirm_unpriced && !loadBudget(ws)?.allow_unpriced) {
    plan.ok = false;
    plan.problems.push('no cost estimate for this call; add estimated_cost to the request, confirm with --confirm-unpriced after asking the owner, or set budget.allow_unpriced');
  }
  if (!plan.ok) {
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
      await new Promise((r) => setTimeout(r, Math.min(30000, 1000 * 2 ** attempt)));
    }
  }
}
