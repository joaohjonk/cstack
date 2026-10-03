// Creative strategy layer: deterministic checks under the judgment skills.
// creative-intelligence reads `report`, creative-strategist writes bets that `checkBet` gates,
// winner-scaler writes families that `checkFamily` gates, asset-factory writes plans that `checkPlan` gates.
//
//   export.csv ─import─▶ state/performance.jsonl ─report─▶ observations (state/insights.jsonl)
//                                                              │ never higher than "observation"
//   creative-bet ◀── strategist ◀───────────────────────────────┘
//        │ experiment (hold / vary / success)        test ─▶ learning ─▶ rule (learning-loop promote only)
//        ▼
//   production-plan ─▶ existing skills ─▶ exports with experiment ids ─▶ next import
import path from 'node:path';
import { ROOT, readJSON, readJSONL, exists, today } from './core.mjs';
import { validateValue } from './schemas.mjs';

export const DEFAULTS = { min_spend: 50, min_impressions: 2000, min_ads: 3, concentration: 0.6, fatigue_drop: 0.3 };
const COPY_ONLY = new Set(['verbal_hook', 'cta']);
const n = (s) => String(s ?? '').toLowerCase().trim();
const and = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const pct = (x) => `${Math.round(x * 100)}%`;
const median = (xs) => {
  const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return undefined;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

export function loadTaxonomy(file = path.join(ROOT, 'registry', 'creative-taxonomy.json')) {
  return readJSON(file);
}
export const families = (tax = loadTaxonomy()) => Object.keys(tax.families);

// A term that the taxonomy lists under another family is munged ("street interview" given as a hook tactic).
export function mungeWarnings(obj = {}, tax = loadTaxonomy(), where = '') {
  const out = [];
  for (const [fam, value] of Object.entries(obj)) {
    if (!tax.families[fam] || typeof value !== 'string') continue;
    const own = (tax.families[fam].terms ?? []).map(n);
    if (own.includes(n(value))) continue;
    const other = Object.entries(tax.families).find(([f, d]) => f !== fam && (d.terms ?? []).map(n).includes(n(value)));
    if (other) out.push(`${where}${fam} "${value}" is a ${other[0]} term; keep families apart (a ${fam} answers: ${tax.families[fam].question})`);
  }
  return out;
}

// ---- report: observations only -------------------------------------------------------------

// One row per ad: periods summed, tags merged (latest wins).
export function aggregateByAd(records) {
  const by = new Map();
  for (const r of records) {
    const a = by.get(r.artifact_ref) ?? { ref: r.artifact_ref, name: r.ad_name, tags: {}, spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0, has: {}, periods: [] };
    const m = r.metrics ?? {};
    for (const k of ['spend', 'impressions', 'clicks', 'purchases', 'revenue']) if (Number.isFinite(m[k])) (a[k] += m[k]), (a.has[k] = true);
    if (!Number.isFinite(m.spend) && Number.isFinite(r.spend?.amount)) (a.spend += r.spend.amount), (a.has.spend = true);
    Object.assign(a.tags, r.tags ?? {});
    a.periods.push({ period: r.period ?? '', ctr: m.ctr ?? (m.clicks && m.impressions ? m.clicks / m.impressions : undefined), frequency: m.frequency });
    by.set(r.artifact_ref, a);
  }
  for (const a of by.values()) {
    a.ctr = a.has.clicks && a.impressions ? a.clicks / a.impressions : undefined;
    a.cpa = a.has.purchases && a.purchases ? a.spend / a.purchases : undefined;
  }
  return [...by.values()];
}

export function report(records, opts = {}) {
  const t = { ...DEFAULTS, ...Object.fromEntries(Object.entries(opts).filter(([k, v]) => k in DEFAULTS && v != null).map(([k, v]) => [k, Number(v)])) };
  const tax = opts.taxonomy ?? loadTaxonomy();
  const fams = opts.family ? [opts.family] : families(tax);
  const date = opts.date ?? today();
  const all = aggregateByAd(records);
  // credibility partners (experts, long-term voices) are judged on trust over time, never on CPA or ROAS
  const isPartner = (a) => n(a.tags.talent_role) === 'credibility partner';
  const partners = all.filter(isPartner);
  const ads = all.filter((a) => !isPartner(a));
  const ok = (a) => a.spend >= t.min_spend && a.impressions >= t.min_impressions;
  const suff = ads.filter(ok);
  const useCpa = suff.filter((a) => a.cpa != null).length >= t.min_ads;
  const metric = useCpa ? 'cpa' : 'ctr';
  const better = (x, base) => (metric === 'cpa' ? base / x : x / base); // > 1 is better
  const total = ads.reduce((s, a) => s + a.spend, 0);
  const account = { ads: ads.length, partners_not_judged: partners.length, sufficient: suff.length, untagged: ads.filter((a) => !Object.keys(a.tags).length).length, spend: round(total), metric, median: round(median(suff.map((a) => a[metric])), metric === 'ctr' ? 4 : 2) };
  const insights = [];
  const groups = [];
  const concentration = [];
  const confounds = [];
  let k = 0;
  const seenSets = new Map(); // the same ads under several families' terms are one finding, not three
  const seenConc = new Map();
  const id = () => `INS-${date}-${String(++k).padStart(3, '0')}`;

  for (const fam of fams) {
    const tagged = ads.filter((a) => a.tags[fam]);
    if (!tagged.length) continue;
    const famSpend = tagged.reduce((s, a) => s + a.spend, 0);
    const terms = [...new Set(tagged.map((a) => a.tags[fam]))];
    for (const term of terms) {
      const g = tagged.filter((a) => a.tags[fam] === term);
      const gs = g.filter(ok);
      const spend = g.reduce((s, a) => s + a.spend, 0);
      const share = famSpend ? spend / famSpend : 0;
      const med = median(gs.map((a) => a[metric]));
      const vs = med != null && account.median ? better(med, account.median) : undefined;
      const sufficient = gs.length >= t.min_ads;
      const row = { family: fam, term, ads: g.length, sufficient_ads: gs.length, spend: round(spend), share: round(share, 3), median: round(med), vs_account: round(vs, 3), read: sufficient ? (vs > 1.1 ? 'better' : vs < 0.9 ? 'worse' : 'level') : 'insufficient' };
      groups.push(row);
      const setKey = gs.map((a) => a.ref).sort().join('|');
      const twin = seenSets.get(setKey);
      if (sufficient && row.read !== 'level' && twin) row.same_ads_as = twin;
      if (sufficient && row.read !== 'level' && !twin) {
        seenSets.set(setKey, `${fam}=${term}`);
        // confounds: another family whose term travels with this one, so the data cannot tell them apart
        const cf = [];
        for (const g2 of families(tax)) {
          if (g2 === fam) continue;
          const vals = gs.map((a) => a.tags[g2]).filter(Boolean);
          if (vals.length < gs.length * 0.9) continue;
          const top = mode(vals);
          if (!top || vals.filter((v) => v === top).length < gs.length * 0.9) continue;
          const withTop = ads.filter((a) => a.tags[g2] === top && ok(a));
          if (withTop.filter((a) => a.tags[fam] === term).length >= withTop.length * 0.9) cf.push(`${g2}=${top}`);
        }
        if (cf.length) confounds.push({ family: fam, term, with: cf });
        const dir = row.read === 'better' ? 'stronger' : 'weaker';
        insights.push({
          id: id(),
          ladder: 'observation',
          created: date,
          family: fam,
          term,
          statement: `${fam} "${term}" correlates with a ${dir} ${metric.toUpperCase()} than the account median (${row.median} vs ${account.median}) across ${gs.length} ads with enough data. Observational: it does not show that ${fam} causes the difference.`,
          data: { ads: gs.length, spend: row.spend, share_of_spend: row.share, sufficient: true },
          ...(cf.length ? { confounds: cf.map((c) => `${fam}=${term} always comes with ${c}; this data cannot separate them`) } : {}),
          next_test: `Hold ${and([...new Set([...cf.map((c) => c.split('=')[0]), 'angle', 'offer'])].filter((f) => f !== fam))} fixed; vary ${fam} only.`,
        });
      }
      const concKey = g.map((a) => a.ref).sort().join('|');
      if (share >= t.concentration && famSpend > 0 && seenConc.has(concKey)) row.same_ads_as = seenConc.get(concKey);
      else if (share >= t.concentration && famSpend > 0) {
        seenConc.set(concKey, `${fam}=${term}`);
        concentration.push({ family: fam, term, share: round(share, 3) });
        insights.push({
          id: id(),
          ladder: 'observation',
          created: date,
          family: fam,
          term,
          statement: `${pct(share)} of tagged spend is in one ${fam}: "${term}".`,
          data: { ads: g.length, spend: round(spend), share_of_spend: round(share, 3), sufficient },
          brand_note: `Concentration is a distinctiveness risk before it is a performance fact. Run brand-verify on the top ads in this ${fam}; if they read as platform default rather than the brand's own codes, keep the message and move it into more ownable ${fam === 'format' ? 'formats' : 'variants'}.`,
        });
      }
    }
  }

  // fatigue: the same ad across ≥3 periods with CTR down by fatigue_drop or more
  const fatigue = [];
  for (const a of ads) {
    const ps = a.periods.filter((p) => Number.isFinite(p.ctr) && p.period).sort((p, q) => p.period.localeCompare(q.period));
    if (ps.length < 3) continue;
    const drop = 1 - ps.at(-1).ctr / ps[0].ctr;
    if (drop >= t.fatigue_drop) {
      const freq = ps[0].frequency != null && ps.at(-1).frequency != null ? ` while frequency went ${ps[0].frequency} → ${ps.at(-1).frequency}` : '';
      fatigue.push({ ref: a.ref, periods: ps.length, ctr_drop: round(drop, 3) });
      insights.push({ id: id(), ladder: 'observation', created: date, statement: `Ad ${a.ref}: CTR fell ${pct(drop)} over ${ps.length} periods${freq}. Possible fatigue; a new hook on the same angle tests it.`, data: { ads: 1, spend: round(a.spend), sufficient: ok(a) } });
    }
  }
  const warnings = [];
  if (partners.length) warnings.push(`${partners.length} credibility-partner ads (${partners.map((a) => a.ref).join(', ')}) are left out of every read: partners are judged on trust over time, not on CPA or ROAS; never cut one for a performance number`);
  if (account.untagged) warnings.push(`${account.untagged} of ${ads.length} ads have no tags; decompose them (hook-format-lab) before reading groups`);
  if (suff.length < t.min_ads) warnings.push(`only ${suff.length} ads meet the minimum data (spend ≥ ${t.min_spend}, impressions ≥ ${t.min_impressions}); no group is read`);
  if (!useCpa && suff.length) warnings.push('too few ads with purchases; groups are read on CTR, which is attention, not sales');
  return { thresholds: t, account, groups, concentration, confounds, fatigue, insights, warnings };
}

function mode(xs) {
  const c = new Map();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}
function round(x, d = 2) {
  if (x == null || !Number.isFinite(x)) return undefined;
  const p = 10 ** d;
  return Math.round(x * p) / p;
}

// ---- gates on what the judgment skills write --------------------------------------------------

export function checkBet(bet, { taxonomy = loadTaxonomy() } = {}) {
  const v = validateValue('creative-bet', bet);
  const errors = v.ok ? [] : [v.errors];
  const warnings = [];
  if (!v.ok) return { ok: false, errors, warnings };
  const { hold = [], vary, design, levels = {}, success } = bet.experiment;
  const both = vary.filter((f) => hold.includes(f));
  if (both.length) errors.push(`experiment both holds and varies ${both.join(', ')}`);
  if (vary.includes('offer') && vary.length > 1) errors.push('the offer varies together with creative families; test the offer on its own');
  if (!vary.includes('offer') && !hold.includes('offer')) warnings.push('hold the offer explicitly (add "offer" to hold) so a price change cannot pass for a creative effect');
  if (vary.length > 2) errors.push(`experiment varies ${vary.length} families (${vary.join(', ')}); more than two cannot be read at a creative budget. Hold all but one or two`);
  if (vary.length === 2 && design !== 'factorial') errors.push(`two families vary (${vary.join(' × ')}); set design: factorial and levels for both so every combination is a cell, or vary one`);
  for (const f of vary) if (design === 'factorial' && !levels[f]) errors.push(`factorial design needs levels.${f}`);
  if (vary.includes('angle')) warnings.push('the angle varies: this is a new bet, not a test inside one; split it unless the bet is "which angle"');
  if (bet.lane === 'iteration' && vary.every((f) => ['verbal_hook', 'visual_hook', 'hook_tactic', 'cta'].includes(f))) warnings.push('an iteration bet that only tweaks hooks; fine in its own slot, but the slate also needs a story bet (a new story for a new audience)');
  if (!(success.min_spend_per_cell > 0)) warnings.push('no minimum spend per cell; any result will be noise');
  const cells = vary.reduce((p, f) => p * (levels[f] ?? 2), 1);
  if (bet.objectives.includes('organic_travel')) {
    if (!bet.travel_reasons?.length) errors.push('organic_travel is an objective but no travel_reasons say why someone would share it');
    for (const r of bet.travel_reasons ?? []) if (!(taxonomy.travel_reasons ?? []).map(n).includes(n(r))) warnings.push(`travel reason "${r}" is not in the taxonomy list; fine if deliberate`);
  }
  if (bet.concept.awareness_stage && bet.concept.awareness_stage !== bet.audience.awareness_stage) warnings.push(`concept awareness "${bet.concept.awareness_stage}" differs from audience awareness "${bet.audience.awareness_stage}"`);
  warnings.push(...mungeWarnings(bet.concept, taxonomy, 'concept.'));
  const formatTerms = (taxonomy.families.format?.terms ?? []).map(n);
  for (const h of bet.hook_family ?? []) if (formatTerms.includes(n(h))) warnings.push(`hook "${h}" is a format, not a hook`);
  for (const f of bet.formats ?? []) if (!formatTerms.includes(n(f)) && mungeWarnings({ format: f }, taxonomy).length) warnings.push(...mungeWarnings({ format: f }, taxonomy, 'formats: '));
  if (!bet.evidence.length) warnings.push('no evidence listed; a bet with none is a guess (allowed, but say so in the tension)');
  if (bet.status === 'learned' && !bet.evidence.some((e) => ['learning', 'rule'].includes(e.ladder))) errors.push('status "learned" needs the evidence that the test reproduced (ladder learning or rule)');
  return { ok: !errors.length, errors, warnings, cells, min_spend_total: success.min_spend_per_cell ? cells * success.min_spend_per_cell : undefined };
}

export function checkFamily(fam, { performance = [], taxonomy = loadTaxonomy() } = {}) {
  const v = validateValue('creative-family', fam);
  const errors = v.ok ? [] : [v.errors];
  const warnings = [];
  if (!v.ok) return { ok: false, errors, warnings };
  if (!performance.some((r) => r.artifact_ref === fam.winner_ref))
    errors.push(`winner "${fam.winner_ref}" is not in this workspace's state/performance.jsonl. winner-scaler scales the brand's own proven ads only; a competitor's ad is a reference, not a winner to copy`);
  const inv = new Set(fam.invariant.families);
  const overlap = fam.not_invariant.filter((f) => inv.has(f));
  if (overlap.length) errors.push(`${overlap.join(', ')} listed as both invariant and free`);
  const seen = new Set();
  const changed = new Set();
  for (const vr of fam.variants) {
    const keys = Object.keys(vr.changes);
    const broken = keys.filter((f) => inv.has(f));
    if (broken.length) errors.push(`variant ${vr.id} changes the invariant (${broken.join(', ')}); then it is a new concept, not a family member`);
    if (keys.every((f) => COPY_ONLY.has(f))) warnings.push(`variant ${vr.id} only changes ${keys.join(' and ')}: a trivial rewrite. Move at least one of format, talent, setting, visual_world, proof, awareness_stage`);
    const sig = JSON.stringify(Object.entries(vr.changes).sort());
    if (seen.has(sig)) warnings.push(`variant ${vr.id} repeats another variant's changes`);
    seen.add(sig);
    keys.forEach((f) => changed.add(f));
    warnings.push(...mungeWarnings(vr.changes, taxonomy, `variant ${vr.id}: `));
  }
  if (fam.variants.length >= 4 && changed.size < 3) warnings.push(`${fam.variants.length} variants move only ${[...changed].join(', ')}; spread them across at least three families`);
  return { ok: !errors.length, errors, warnings, families_moved: [...changed] };
}

const REFERENCE_ONLY = ['work/browse/', 'work/competitors/', 'references/competitors/'];

export function checkPlan(plan, { bets = [], families: fams = [] } = {}) {
  const v = validateValue('production-plan', plan);
  const errors = v.ok ? [] : [v.errors];
  const warnings = [];
  if (!v.ok) return { ok: false, errors, warnings };
  const ids = new Set(plan.assets.map((a) => a.id));
  for (const a of plan.assets) {
    if (!plan.bets.includes(a.bet)) errors.push(`asset ${a.id} serves bet "${a.bet}", which the plan does not list`);
    for (const s of a.sources ?? []) {
      const p = s.replace(/^\.\//, '');
      if (REFERENCE_ONLY.some((r) => p.startsWith(r))) errors.push(`asset ${a.id} starts from ${s}, a third-party capture or competitor reference; it can inform the brief, never the asset`);
    }
    if (a.route === 'reuse' && !a.sources?.length) errors.push(`asset ${a.id} is "reuse" but names no source`);
    if (a.route === 'derive' && !ids.has(a.master)) errors.push(`asset ${a.id} is derived from "${a.master ?? '?'}", which is not in the plan`);
  }
  for (const b of plan.bets) if (!plan.assets.some((a) => a.bet === b)) warnings.push(`bet ${b} has no assets`);
  const known = new Set([...bets, ...fams].map((b) => b.id));
  if (known.size) for (const b of plan.bets) if (!known.has(b)) warnings.push(`${b} has no *.creative-bet or *.creative-family file in the workspace`);
  const lanes = plan.bets.map((b) => (fams.some((f) => f.id === b) ? 'iteration' : bets.find((x) => x.id === b)?.lane)).filter(Boolean);
  if (lanes.length >= 2 && lanes.length === plan.bets.length && !lanes.includes('story')) errors.push(`every bet in this plan iterates on what exists (${plan.bets.join(', ')}); keep a story bet (a new story for a new audience) in its own slot, with its own owner`);
  const byBet = {};
  for (const a of plan.assets) (byBet[a.bet] ??= new Set()).add(a.experiment_id);
  for (const [b, s] of Object.entries(byBet)) if (s.size > 1) warnings.push(`bet ${b} spreads over ${s.size} experiment ids; one bet, one experiment`);
  const regen = plan.assets.filter((a) => a.kind === 'cutdown' && a.route === 'generate');
  for (const a of regen) warnings.push(`cut-down ${a.id} is generated; derive cut-downs from a master (route derive) so every cell shows the same product`);
  return { ok: !errors.length, errors, warnings, assets: plan.assets.length, by_route: count(plan.assets.map((a) => a.route)) };
}

const count = (xs) => xs.reduce((o, x) => ((o[x] = (o[x] ?? 0) + 1), o), {});

export function readPerformance(ws) {
  const p = path.join(ws, 'state', 'performance.jsonl');
  return exists(p) ? readJSONL(p) : [];
}
