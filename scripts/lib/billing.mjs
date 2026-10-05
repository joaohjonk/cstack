// cstack spend reconcile: fetch what a provider actually billed for each paid request, and compare it with the
// estimate the ledger booked (field test F21). Results go to state/billing.jsonl; the ledger is never rewritten.
import path from 'node:path';
import { appendJSONL, readJSONL, nowISO } from './core.mjs';
import { readLedger } from './ledger.mjs';

export const billingPath = (ws) => path.join(ws, 'state', 'billing.jsonl');

// Requests worth asking about: ok rows of this provider that carry request ids and have no billed answer yet.
export function toReconcile(ws, { provider, since } = {}) {
  const done = new Set(readJSONL(billingPath(ws)).filter((b) => b.status === 'billed').map((b) => `${b.provider}:${b.request_id}`));
  const out = [];
  for (const r of readLedger(ws)) {
    if (r.status !== 'ok' || (provider && r.provider !== provider) || (since && r.ts < since)) continue;
    for (const id of r.provider_request_ids ?? []) if (!done.has(`${r.provider}:${id}`)) out.push({ request_id: id, provider: r.provider, run_id: r.run_id, model: r.model, estimated: r.estimated_cost ?? null });
  }
  return out;
}

/**
 * reconcile(ws, {provider, since, lookup: async (request_id) => {status, billed?, basis?, error?}, dry_run, pace_ms, sleep})
 * Asks one request at a time, pace_ms apart (F77: 33 requests back to back drew 429s). A 429 is retried with backoff
 * (the provider's Retry-After, else 1, 2, 4, 8 s); still limited after that, the run stops and says how many are left,
 * without writing rows for them. A lookup error marked fatal (no key, a key without billing scope) stops the run on the
 * first request and writes nothing for it (F78: one refusal, not 33 error rows).
 */
export async function reconcile(ws, { provider, since, lookup, dry_run = false, pace_ms = 300, retries = 4, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const todo = toReconcile(ws, { provider, since });
  const estimate = sumEstimates(todo);
  if (dry_run) return { asked: todo.length, estimate, rows: todo.map((t) => ({ ...t, status: 'dry_run' })) };
  const rows = [];
  for (const [n, t] of todo.entries()) {
    if (n && pace_ms) await sleep(pace_ms);
    let res;
    for (let attempt = 0; ; attempt++) {
      try {
        res = await lookup(t.request_id);
        break;
      } catch (e) {
        if (e?.fatal) throw Object.assign(new Error(String(e.message ?? e)), { fatal: true, done: rows.length, left: todo.length - rows.length });
        if (e?.retryable && attempt < retries) {
          await sleep(e.retry_after_ms ?? 1000 * 2 ** attempt);
          continue;
        }
        if (e?.retryable) return { asked: rows.length, left: todo.length - rows.length, stopped: `still rate limited after ${retries} retries; run it again later to ask about the ${todo.length - rows.length} left`, estimate, rows };
        res = { status: 'error', error: String(e.message ?? e).slice(0, 300) };
        break;
      }
    }
    const row = { ts: nowISO(), provider: t.provider, request_id: t.request_id, ...(t.run_id ? { run_id: t.run_id } : {}), ...(t.model ? { model: t.model } : {}), status: res.status, billed: res.billed ?? null, estimated: t.estimated ? { amount: t.estimated.amount, currency: t.estimated.currency } : null, ...(res.basis ? { basis: res.basis } : {}), source: `${t.provider} billing`, ...(res.error ? { error: res.error } : {}) };
    appendJSONL(billingPath(ws), row);
    rows.push(row);
  }
  return { asked: todo.length, left: 0, estimate, rows };
}

// cstack's own estimate for requests, per currency, so a run that learns nothing still says what is known
export function sumEstimates(todo) {
  const by = {};
  let unpriced = 0;
  for (const t of todo) {
    if (!t.estimated?.currency) {
      unpriced++;
      continue;
    }
    by[t.estimated.currency] = Math.round(((by[t.estimated.currency] ?? 0) + t.estimated.amount) * 1e6) / 1e6;
  }
  return { by_currency: by, unpriced, requests: todo.length };
}

// Billed against estimated, over requests that have both in one currency. drift is (billed - estimated) / estimated.
export function billedVsEstimated(ws, { provider, since, tolerance = 0.25 } = {}) {
  const latest = new Map();
  for (const b of readJSONL(billingPath(ws))) if (b.status === 'billed' && (!provider || b.provider === provider) && !(since && b.ts < since)) latest.set(`${b.provider}:${b.request_id}`, b);
  let billed = 0;
  let estimated = 0;
  let n = 0;
  let currency = null;
  for (const b of latest.values()) {
    if (!b.estimated || b.billed.currency !== b.estimated.currency || (currency && b.billed.currency !== currency)) continue;
    currency = b.billed.currency;
    billed += b.billed.amount;
    estimated += b.estimated.amount;
    n++;
  }
  const r6 = (x) => Math.round(x * 1e6) / 1e6;
  const drift = estimated > 0 ? (billed - estimated) / estimated : null;
  return { requests: n, currency: currency ?? 'USD', billed: r6(billed), estimated: r6(estimated), drift: drift == null ? null : Math.round(drift * 1000) / 1000, within: drift == null ? null : Math.abs(drift) <= tolerance, tolerance };
}
