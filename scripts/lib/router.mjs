// Model router: rank CURRENT registry entries for a job, explain why, give a fallback chain.
// The registry is a snapshot. Entries older than STALE_DAYS are flagged so the /model-router skill
// re-verifies them against live docs before an important batch.
// Measured quality leads: a dated leaderboard rank (models[].quality) orders candidates while it is younger than
// RANK_FRESH_DAYS; the hand-set tier only breaks ties after it (field test F54). The best-ranked model is always
// reported, reachable or not, with what it would take to call it.
import { today } from './core.mjs';

export const STALE_DAYS = 45;
export const RANK_FRESH_DAYS = 30;

const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const DEAD = new Set(['deprecated', 'shut_down']);

/** A model's leaderboard ranks as a list (quality may be one object or an array), best rank first. */
export function qualityRanks(m) {
  const q = m.quality == null ? [] : Array.isArray(m.quality) ? m.quality : [m.quality];
  return q.filter((x) => Number.isInteger(x?.rank)).sort((a, b) => a.rank - b.rank);
}

// The best rank that still counts (fresh), and the best one recorded at all (for the warning).
function bestRank(m, now) {
  const ranks = qualityRanks(m).map((q) => ({ ...q, age: q.as_of ? daysBetween(q.as_of, now) : Infinity }));
  const fresh = ranks.find((q) => q.age <= RANK_FRESH_DAYS) ?? null;
  return { fresh, any: ranks[0] ?? null };
}

// What calling one endpoint would take here: a provider asked for, an adapter that is not a stub, its keys, a price.
// adapters: {id: {status, missing_env}} from providers/index.mjs availability(); absent = not checked.
function endpointNeeds(e, req) {
  const needs = [];
  if (req.providers_available && !req.providers_available.includes(e.provider)) needs.push(`${e.provider} is not in --providers`);
  if (req.adapters) {
    const a = req.adapters[e.provider];
    if (!a) needs.push(`a ${e.provider} adapter (none in providers/)`);
    else if (a.status === 'stub') needs.push(`the ${e.provider} adapter (a stub today)`);
    else if (a.missing_env?.length) needs.push(`${a.missing_env.join(', ')} set`);
  }
  const access = needs.length;
  if (e.priced === false) needs.push(`a verified ${e.provider} price (else ask the owner and --confirm-unpriced)`);
  if (e.token_priced) needs.push('a token_estimate in the request (token-priced; else ask the owner and --confirm-unpriced)');
  return { ...e, needs, reachable: access === 0 };
}

/**
 * route(registry, {modality, needs: [capability], avoid: [capability], max_cost, providers_available: [..], adapters, top, tier})
 * Order: hard fit first (capabilities, task benchmark, owner's preference, reachability, budget), then a fresh
 * leaderboard rank (lower is better; unranked after ranked), then tier and small penalties (score), then price.
 * tier: 'draft' ranks cheap probe models first (rank comes after tier then); otherwise flagship models lead the unranked.
 * modality is the output family (image|video|vector|...); needs are capability strings (image-edit, multi-image-reference, ...).
 * max_cost compares against est_unit_cost.amount (per image / per second), never a token price.
 * Returns {candidates:[{model_id, provider, score, rank, matched, missing, stale, cost, endpoints:[{provider, endpoint_id, priced?}], why}],
 *          best_now: {model_id, rank, leaderboard, as_of, source, fresh, reachable, endpoints:[{..., needs, reachable}]} | null,
 *          chain:[model_id], warnings}
 */
export function route(registry, req) {
  const now = req.today ?? today();
  const needs = req.needs ?? [];
  const warnings = [];
  const all = (registry.models ?? []).filter((m) => m.modality === req.modality);
  for (const m of all) if (DEAD.has(m.status) && (req.prefer ?? []).includes(m.model_id)) warnings.push(`${m.model_id} is ${m.status}: never route to it`);
  const pool = all.filter((m) => !DEAD.has(m.status ?? 'active'));
  if (!pool.length) warnings.push(`no registry entries for modality "${req.modality}" — research current models before routing`);
  const draft = req.tier === 'draft';
  const candidates = pool.map((m) => {
    const caps = new Set(m.capabilities ?? []);
    const matched = needs.filter((n) => caps.has(n));
    const missing = needs.filter((n) => !caps.has(n));
    const stale = !m.last_verified || daysBetween(m.last_verified, now) > STALE_DAYS;
    // reachable at its maker or through a host route (fal, openai-image, ...)
    const unavailable = req.providers_available && ![m.provider, ...(m.routes ?? []).map((r) => r.provider)].some((p) => req.providers_available.includes(p));
    const cost = m.est_unit_cost?.amount ?? m.pricing_snapshot?.value?.amount ?? null;
    const overBudget = req.max_cost != null && cost != null && cost > req.max_cost;
    const avoidHit = (req.avoid ?? []).filter((a) => caps.has(a));
    const bench = (m.benchmark_results ?? []).filter((b) => b.task === req.task);
    const { fresh, any } = bestRank(m, now);
    // fit: what the job needs and what can be called; nothing about quality outranks a model that cannot do the job
    let fit = matched.length * 10 - missing.length * 6 - avoidHit.length * 4;
    if (bench.length) fit += 25; // a fit-for-purpose benchmark on this exact task beats generic claims
    if ((req.prefer ?? []).includes(m.model_id)) fit += 8; // the owner named it: honour it and keep it for follow-ups
    if (unavailable) fit -= 100;
    if (overBudget) fit -= 50;
    let score = fit;
    if (stale) score -= 3;
    if (m.confidence === 'low') score -= 2;
    if (m.status === 'watch') score -= 1;
    // with no measured rank to tell them apart, a final goes to a flagship, a probe to a draft model
    const tier = m.tier ?? 'standard';
    if (tier !== 'standard') score += tier === (draft ? 'draft' : 'flagship') ? 4 : -4;
    const why = [
      fresh ? `#${fresh.rank} ${fresh.leaderboard} (${fresh.as_of})` : any ? `rank #${any.rank} from ${any.as_of} is older than ${RANK_FRESH_DAYS} days: not counted` : null,
      tier !== 'standard' ? `${tier} tier` : null,
      matched.length ? `has ${matched.join(', ')}` : null,
      missing.length ? `lacks ${missing.join(', ')}` : null,
      bench.length ? `benchmarked on "${req.task}"` : null,
      stale ? `registry entry stale (last_verified ${m.last_verified ?? 'never'})` : null,
      unavailable ? 'provider not available in this environment' : null,
      cost == null ? 'no unit price: estimate before a batch' : null,
      overBudget ? `snapshot price ${cost} over max ${req.max_cost}` : null,
    ].filter(Boolean);
    // the ids a request actually takes: the maker's own id, and each host route
    const every = [
      ...(m.provider_model_id ? [{ provider: m.provider, endpoint_id: m.provider_model_id }] : []),
      // a token-priced route is estimated only from a request's token_estimate, so it is flagged
      ...(m.routes ?? []).map((r) => ({ provider: r.provider, endpoint_id: r.endpoint_id, priced: !!r.price, ...(r.price?.per === 'token' ? { token_priced: true } : {}) })),
    ];
    // only the hosts asked for, when given
    const endpoints = every.filter((e) => !req.providers_available || req.providers_available.includes(e.provider));
    return { model_id: m.model_id, provider: m.provider, score, fit, rank: fresh?.rank ?? null, quality: fresh ?? any, rank_fresh: !!fresh, matched, missing, stale, cost, endpoints, every, why: why.join('; ') };
  });
  const byRank = (a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity);
  candidates.sort((a, b) => b.fit - a.fit || (draft ? b.score - a.score || byRank(a, b) : byRank(a, b) || b.score - a.score) || (a.cost ?? Infinity) - (b.cost ?? Infinity));
  const viable = candidates.filter((c) => c.score > -50);
  if (viable.length && viable[0].stale) warnings.push('top candidate is stale: verify current docs/pricing before a paid batch');
  if (viable.length > 1 && viable[0].score - viable[1].score < 6) warnings.push('top candidates are close: run a 2-4 probe micro-benchmark on the real task before scaling');

  // the best-ranked model for the job, reachable here or not: the owner sees what they are missing
  const able = candidates.filter((c) => !c.missing.length && c.quality);
  const top = able.filter((c) => c.rank_fresh).sort(byRank)[0] ?? able.sort((a, b) => a.quality.rank - b.quality.rank)[0] ?? null;
  let best_now = null;
  if (top) {
    const eps = top.every.map((e) => endpointNeeds(e, req));
    const reachable = eps.some((e) => e.reachable);
    best_now = { model_id: top.model_id, provider: top.provider, rank: top.quality.rank, leaderboard: top.quality.leaderboard, as_of: top.quality.as_of, source: top.quality.source, fresh: top.rank_fresh, reachable, endpoints: eps };
    if (!reachable) warnings.push(`the best-ranked model, ${top.model_id} (#${top.quality.rank}), is not reachable here: needs ${eps.length ? eps.map((e) => `${e.provider}: ${e.needs.join(', ')}`).join(' | ') : 'an endpoint (no route in the registry)'}`);
  }

  // "best model now" data that is old or missing is said out loud before anyone pays for a batch (F55)
  const heads = viable.slice(0, 3);
  const old = [...(best_now ? [candidates.find((c) => c.model_id === best_now.model_id)] : []), ...heads].filter((c) => c?.quality && !c.rank_fresh);
  const unranked = heads.filter((c) => !c.quality).map((c) => c.model_id);
  const board = candidates.find((c) => c.quality?.source)?.quality;
  const recheck = `re-check the live leaderboard${board ? ` (${board.source})` : ''} before a paid batch`;
  if (old.length) warnings.push(`leaderboard rank is stale: ${[...new Set(old.map((c) => `${c.model_id} #${c.quality.rank} as of ${c.quality.as_of}`))].join(', ')} (older than ${RANK_FRESH_DAYS} days); ${recheck}`);
  if (unranked.length) warnings.push(`no leaderboard rank recorded for top candidate(s) ${unranked.join(', ')}${board ? `; newest rank on file is from ${newestAsOf(candidates)}` : ''}; ${recheck}`);

  const strip = ({ fit, every, quality, rank_fresh, ...c }) => c;
  return { candidates: candidates.slice(0, req.top ?? 5).map(strip), best_now, chain: viable.slice(0, 3).map((c) => c.model_id), warnings };
}

function newestAsOf(candidates) {
  return candidates.map((c) => c.quality?.as_of).filter(Boolean).sort().at(-1);
}

/**
 * The staleness line for a paid run on one model (cstack generate): null when the modality's leaderboard data is
 * fresh. Warns when the newest rank on file for the modality is older than RANK_FRESH_DAYS, or none is recorded.
 */
export function leaderboardWarning(registry, modality, now = today()) {
  const ranked = (registry.models ?? []).filter((m) => m.modality === modality && !DEAD.has(m.status ?? 'active')).flatMap(qualityRanks);
  if (!ranked.length) return `no leaderboard rank is recorded for any ${modality} model, so cstack cannot say which is best now; check a live leaderboard before a paid batch`;
  const newest = ranked.map((q) => q.as_of).sort().at(-1);
  if (daysBetween(newest, now) <= RANK_FRESH_DAYS) return null;
  return `the "best ${modality} model now" data is from ${newest} (${daysBetween(newest, now)} days old); re-check the live leaderboard (${ranked[0].source}) before a paid batch`;
}
