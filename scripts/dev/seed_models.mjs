// Convert the dated model seed (registry/models.seed.json) into registry/models.json.
// Re-run after a re-verification pass. It derives est_unit_cost heuristically and says so in `basis`;
// token-priced models get null and must be estimated before a batch.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, writeAtomic, today } from '../lib/core.mjs';

const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'registry/models.seed.json'), 'utf8'));
const PREFER = /^(1k|per_image_1k|per_image_1k_2k|from|t2i_from|default|standard|720p|audio_off|min|h3_max)$/i;

function unitCost(p) {
  if (!p || p.value == null) return null;
  const unit = String(p.unit ?? '');
  if (/1M tokens|1000 tokens|1k tokens/i.test(unit)) return null;
  const per = /second/i.test(unit) ? 'second' : /megapixel/i.test(unit) ? 'megapixel' : /operation/i.test(unit) ? 'operation' : /image/i.test(unit) ? 'image' : null;
  if (!per) return null;
  const currency = p.currency ?? 'USD';
  if (typeof p.value === 'number') return { amount: p.value, currency, per, basis: 'snapshot list price' };
  if (typeof p.value !== 'object') return null;
  const flat = Object.entries(p.value).flatMap(([k, v]) => (v && typeof v === 'object' ? Object.entries(v).map(([k2, v2]) => [`${k}.${k2}`, v2]) : [[k, v]]));
  const nums = flat.filter(([k, v]) => typeof v === 'number' && !/per_1M|batch|cached|addon|add_on|surcharge/i.test(k));
  if (!nums.length) return null;
  const pick = nums.find(([k]) => PREFER.test(k.split('.').pop())) ?? nums.reduce((a, b) => (b[1] < a[1] ? b : a));
  return { amount: pick[1], currency, per, basis: `heuristic: "${pick[0]}" from snapshot; verify before budgeting` };
}

const models = seed.map((m) => {
  const shut = /shut down/i.test(m.access ?? '') || /tombstone/i.test(m.notes ?? '');
  const p = m.pricing_snapshot;
  return {
    model_id: m.model_id,
    provider: m.provider,
    modality: m.modality,
    capabilities: m.capabilities,
    known_strengths: m.known_strengths ?? [],
    known_weaknesses: m.known_weaknesses ?? [],
    input_types: m.input_types ?? [],
    max_refs: m.max_refs ?? null,
    resolution: m.resolution ?? null,
    pricing_snapshot: p ? { value: p.value, unit: p.unit, currency: p.currency, source: p.source_url ?? (Array.isArray(m.source) ? m.source[0] : m.source), last_verified: m.last_verified } : null,
    // an explicit est_unit_cost in the seed (with its basis) beats the heuristic
    est_unit_cost: m.est_unit_cost ?? unitCost(p),
    latency_snapshot: m.latency_snapshot ? { value: m.latency_snapshot, source: Array.isArray(m.source) ? m.source[0] : m.source, last_verified: m.last_verified } : null,
    access: m.access ?? null,
    last_verified: m.last_verified,
    source: m.source,
    benchmark_results: m.benchmark_results ?? [],
    confidence: m.confidence,
    status: shut ? 'shut_down' : m.status ?? (m.confidence === 'low' || m.last_verified == null ? 'watch' : 'active'),
    notes: m.notes ?? null,
  };
});

writeAtomic(path.join(ROOT, 'registry/models.json'), JSON.stringify({ updated: today(), snapshot_note: 'Dated snapshot from docs/research/model-landscape.md. Prices and rankings go stale; /model-router re-verifies before important batches.', models }, null, 2) + '\n');
console.log(`registry/models.json: ${models.length} models (${models.filter((m) => m.est_unit_cost).length} with a unit cost, ${models.filter((m) => m.status === 'shut_down').length} shut down)`);
