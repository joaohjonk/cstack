// Model router: rank CURRENT registry entries for a job, explain why, give a fallback chain.
// The registry is a snapshot. Entries older than STALE_DAYS are flagged so the /model-router skill
// re-verifies them against live docs before an important batch.
import { today } from './core.mjs';

export const STALE_DAYS = 45;

const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

/**
 * route(registry, {modality, needs: [capability], avoid: [capability], max_cost, providers_available: [..], top})
 * modality is the output family (image|video|vector|...); needs are capability strings (image-edit, multi-image-reference, ...).
 * max_cost compares against est_unit_cost.amount (per image / per second), never a token price.
 * Returns {candidates:[{model_id, provider, score, matched, missing, stale, cost, why}], chain:[model_id], warnings}
 */
export function route(registry, req) {
  const now = req.today ?? today();
  const needs = req.needs ?? [];
  const warnings = [];
  const DEAD = new Set(['deprecated', 'shut_down']);
  const all = (registry.models ?? []).filter((m) => m.modality === req.modality);
  for (const m of all) if (DEAD.has(m.status) && (req.prefer ?? []).includes(m.model_id)) warnings.push(`${m.model_id} is ${m.status}: never route to it`);
  const pool = all.filter((m) => !DEAD.has(m.status ?? 'active'));
  if (!pool.length) warnings.push(`no registry entries for modality "${req.modality}" — research current models before routing`);
  const candidates = pool.map((m) => {
    const caps = new Set(m.capabilities ?? []);
    const matched = needs.filter((n) => caps.has(n));
    const missing = needs.filter((n) => !caps.has(n));
    const stale = !m.last_verified || daysBetween(m.last_verified, now) > STALE_DAYS;
    const unavailable = req.providers_available && !req.providers_available.includes(m.provider);
    const cost = m.est_unit_cost?.amount ?? m.pricing_snapshot?.value?.amount ?? null;
    const overBudget = req.max_cost != null && cost != null && cost > req.max_cost;
    const avoidHit = (req.avoid ?? []).filter((a) => caps.has(a));
    const bench = (m.benchmark_results ?? []).filter((b) => b.task === req.task);
    let score = matched.length * 10 - missing.length * 6 - avoidHit.length * 4;
    if (bench.length) score += 25; // a fit-for-purpose benchmark on this exact task beats generic claims
    if (stale) score -= 3;
    if (m.confidence === 'low') score -= 2;
    if (m.status === 'watch') score -= 1;
    if ((req.prefer ?? []).includes(m.model_id)) score += 8; // the owner named it: honour it and keep it for follow-ups
    if (unavailable) score -= 100;
    if (overBudget) score -= 50;
    const why = [
      matched.length ? `has ${matched.join(', ')}` : null,
      missing.length ? `lacks ${missing.join(', ')}` : null,
      bench.length ? `benchmarked on "${req.task}"` : null,
      stale ? `registry entry stale (last_verified ${m.last_verified ?? 'never'})` : null,
      unavailable ? 'provider not available in this environment' : null,
      cost == null ? 'no unit price: estimate before a batch' : null,
      overBudget ? `snapshot price ${cost} over max ${req.max_cost}` : null,
    ].filter(Boolean);
    return { model_id: m.model_id, provider: m.provider, score, matched, missing, stale, cost, why: why.join('; ') };
  });
  candidates.sort((a, b) => b.score - a.score || (a.cost ?? Infinity) - (b.cost ?? Infinity));
  const viable = candidates.filter((c) => c.score > -50);
  if (viable.length && viable[0].stale) warnings.push('top candidate is stale: verify current docs/pricing before a paid batch');
  if (viable.length > 1 && viable[0].score - viable[1].score < 6) warnings.push('top candidates are close: run a 2-4 probe micro-benchmark on the real task before scaling');
  return { candidates: candidates.slice(0, req.top ?? 5), chain: viable.slice(0, 3).map((c) => c.model_id), warnings };
}
