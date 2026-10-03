// Taste Labs adapter (REST). Capability, not judgment: the /taste-search, /brand-import and /brand-verify
// skills own how results are used. Research + field mapping: docs/research/taste-labs.md.
// Auth: TASTE_API_KEY (header X-API-Key). Search and verifier were alpha on 2026-09-14: shapes may change.
// The MCP server (https://mcp.tastelabs.com/mcp) is preferred when the host exposes it; this REST path is the
// headless fallback. If neither is configured, skills use local fallbacks and say so.
const BASE = process.env.TASTE_API_BASE ?? 'https://api.tastelabs.com';
const KEY = () => process.env.TASTE_API_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, body) {
  if (!KEY()) throw new Error('TASTE_API_KEY is not set (auth)');
  const res = await fetch(`${BASE}${path}`, { method, headers: { 'X-API-Key': KEY(), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (res.status === 409) return { _not_ready: true };
  if (res.status === 503) {
    const e = new Error(`taste-labs 503 at capacity; retry after ${res.headers.get('retry-after') ?? '?'}s`);
    e.retryAfter = Number(res.headers.get('retry-after') ?? 5);
    throw e;
  }
  if (!res.ok) throw new Error(`taste-labs HTTP ${res.status} ${data?.detail?.error ?? ''}: ${(data?.detail?.message ?? text).slice(0, 300)}`);
  return data;
}

async function poll(path, { done, timeoutMs = 10 * 60 * 1000 } = {}) {
  const t0 = Date.now();
  let wait = 3000;
  for (;;) {
    let r;
    try {
      r = await call('GET', path);
    } catch (e) {
      if (e.retryAfter) {
        await sleep(e.retryAfter * 1000);
        continue;
      }
      throw e;
    }
    if (!r._not_ready && done(r)) return r;
    if (Date.now() - t0 > timeoutMs) {
      const e = new Error(`taste-labs poll timeout on ${path}; job left running (resume later, never resubmit)`);
      e.pending = true;
      throw e;
    }
    await sleep(wait);
    wait = Math.min(wait * 1.5, 15000);
  }
}

export const tasteLabs = {
  interfaces: ['reference_search', 'extractor', 'verifier'],
  env: ['TASTE_API_KEY'],
  available: (env) => !!env.TASTE_API_KEY,
  versions: { extractor: '1.0.0', search: '1.0.0-alpha', verifier: '1.0.0-alpha', last_verified: '2026-10-03' },

  // reference_search: rank order is the only signal; never re-rank (Taste returns no scores)
  async search({ intent, k = 6, depth = 'fast', filters }) {
    const r = await call('POST', '/search', { query: intent, depth, top_k: Math.min(k, 30), ...(filters ? { filters } : {}) });
    return {
      search_id: r.search_id,
      provider: 'taste-labs',
      query: intent,
      query_tags_soft: r.query_tags ?? null,
      results: (r.results ?? []).map((c, i) => ({
        rank: i + 1,
        url: c.url,
        name: c.brand_name,
        summary: c.identity_paragraph,
        match_tier: c.match ?? null,
        reason: c.reason,
        is_discovery: c.badge === 'discovery',
        tags: c.tags ?? [],
        palette: c.palette ?? null,
        typography: c.typography ?? null,
        screenshot_url: c.screenshot_url ?? null,
        retrieved_at: new Date().toISOString(),
      })),
    };
  },

  // extractor: raw design_system kept verbatim by the caller; normalisation into brand-system happens in /brand-import
  async extract({ url, sections, force = false, deep = false }) {
    const sub = await call('POST', '/design/submissions', { url, force, enable_deep_analysis: deep, ...(sections ? { sections } : {}) });
    const id = sub.submission_id;
    const res = await poll(`/design/submissions/${id}/result`, { done: (r) => ['completed', 'failed'].includes(r.status) });
    if (res.status === 'failed') throw new Error(`extraction failed: ${JSON.stringify(res.error ?? {}).slice(0, 300)}`);
    return { extraction_id: res.extraction_id ?? id, submission_id: id, source_url: res.source_url ?? url, captured_at: res.completed_at, cache_hit: res.cache_hit, credits: res.credits_consumed ?? null, design_system: res.result?.design_system ?? null, artifacts: res.artifacts ?? {} };
  },

  // verifier: brand adherence of a reachable candidate URL vs a reference URL. NEVER a universal taste score.
  async verify({ reference, candidate }) {
    if (!/^https?:\/\//.test(candidate) || /localhost|127\.0\.0\.1/.test(candidate))
      throw new Error('candidate must be a publicly reachable URL; for local work use the local verifier or ask before opening a tunnel');
    const job = await call('POST', '/judge/brand-adherence', { reference_url: reference, candidate_url: candidate });
    const v = await poll(`/judge/brand-adherence/${job.job_id}/result`, { done: (r) => ['completed', 'failed'].includes(r.status) });
    return {
      verdict_id: job.job_id,
      kind: 'brand_adherence',
      provider: 'taste-labs',
      judge: { type: 'llm+deterministic', version: tasteLabs.versions.verifier },
      reference,
      candidate,
      score: v.score ?? null,
      score_scale: '0-1',
      partial: v.status !== 'completed',
      fixes: (v.fixes ?? []).map((f) => ({ action: f.action, target: { property: f.property, from: f.from, to: f.to_value, token: f.token }, raw: f })),
      recommendations: v.recommendations ?? [],
      created_at: new Date().toISOString(),
    };
  },
};
