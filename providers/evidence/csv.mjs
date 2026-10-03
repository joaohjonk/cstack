// Evidence adapter: any ads-manager or creative-analytics export as CSV → creative-performance records.
// Providers supply evidence, cstack supplies judgment: every adapter ends in the same normalized record,
// so no skill ever reads a provider's own shape. Presets are header alias lists, matched after
// normalizing case and punctuation; a header cstack does not know is ignored unless --map names it.
// Columns named after a taxonomy family (format, hook_tactic, ...) or `tag:<family>` become tags.

export const CANONICAL = ['ad_id', 'ad_name', 'spend', 'currency', 'impressions', 'clicks', 'purchases', 'revenue', 'views_3s', 'thruplays', 'frequency', 'date_start', 'date_stop', 'audience'];

// Header names are those commonly seen in each tool's export; exports change, so check yours and pass --map when a column is missed.
export const PRESETS = {
  generic: {},
  'meta-ads-manager': {
    ad_id: ['ad id'],
    ad_name: ['ad name'],
    spend: ['amount spent', 'amount spent usd', 'amount spent eur', 'amount spent brl', 'amount spent gbp'],
    impressions: ['impressions'],
    clicks: ['link clicks', 'clicks all'],
    purchases: ['purchases', 'website purchases'],
    revenue: ['purchases conversion value', 'website purchases conversion value'],
    views_3s: ['3 second video plays', '3second video plays', 'video plays at 3 seconds'],
    thruplays: ['thruplays'],
    frequency: ['frequency'],
    date_start: ['reporting starts'],
    date_stop: ['reporting ends'],
    audience: ['ad set name'],
  },
  'tiktok-ads': {
    ad_id: ['ad id'],
    ad_name: ['ad name'],
    spend: ['cost', 'total cost'],
    impressions: ['impressions'],
    clicks: ['clicks destination', 'clicks'],
    purchases: ['conversions', 'complete payment', 'purchases'],
    revenue: ['total complete payment value', 'purchase value'],
    views_3s: ['2 second video views', '2second video views'],
    thruplays: ['6 second video views', '6second video views'],
    frequency: ['frequency'],
    date_start: ['date', 'by day', 'stat time day'],
    audience: ['ad group name'],
  },
};

const norm = (h) => String(h).toLowerCase().replace(/[^a-z0-9:]+/g, ' ').trim();

// RFC 4180: quoted fields, doubled quotes, commas and newlines inside quotes.
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let f = '';
  let q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') (f += '"'), i++;
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') row.push(f), (f = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(f), rows.push(row), (row = []), (f = '');
    } else f += c;
  }
  if (f !== '' || row.length) row.push(f), rows.push(row);
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

// Map each header to a canonical field or a taxonomy family. `map` = {canonical: "Their Header"} wins over the preset.
export function mapHeaders(headers, { preset = 'generic', map = {}, families = [] } = {}) {
  const p = PRESETS[preset] ?? (() => { throw new Error(`unknown preset "${preset}" (${Object.keys(PRESETS).join(', ')})`); })();
  const out = {};
  headers.forEach((h, i) => {
    const n = norm(h);
    const explicit = Object.entries(map).find(([, theirs]) => norm(theirs) === n);
    if (explicit) return (out[i] = { field: explicit[0] });
    const tag = n.startsWith('tag:') ? n.slice(4).trim().replace(/ /g, '_') : n.replace(/ /g, '_');
    if (families.includes(tag)) return (out[i] = { tag });
    const canon = CANONICAL.find((c) => c === n.replace(/ /g, '_')) ?? Object.keys(p).find((c) => p[c].some((a) => n === a || (c === 'spend' && n.startsWith('amount spent'))));
    if (canon) out[i] = { field: canon };
  });
  return out;
}

const num = (v) => {
  if (v == null) return undefined;
  const t = String(v).replace(/[^0-9.,-]/g, '');
  if (!t) return undefined;
  // "1.234,56" (comma decimal) vs "1,234.56"
  const n = /,\d{1,2}$/.test(t) && !/\.\d{1,2}$/.test(t) ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
};
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'ad';
const ratio = (a, b) => (a != null && b ? Math.round((a / b) * 1e6) / 1e6 : undefined);

export function rowsToRecords(rows, { preset = 'generic', map = {}, families = [], channel, period, currency = 'USD', file, imported_at } = {}) {
  if (!channel) throw new Error('channel is required (meta, tiktok, ...)');
  const [headers, ...body] = rows;
  const cols = mapHeaders(headers, { preset, map, families });
  const found = new Set(Object.values(cols).map((c) => c.field).filter(Boolean));
  for (const need of ['spend', 'impressions']) if (!found.has(need)) throw new Error(`no "${need}" column found with preset "${preset}"; pass --map '{"${need}":"Their Header"}'`);
  if (!found.has('ad_id') && !found.has('ad_name')) throw new Error('no ad id or ad name column; every record needs one');
  const records = [];
  const skipped = [];
  body.forEach((r, i) => {
    const v = {};
    const tags = {};
    for (const [idx, c] of Object.entries(cols)) {
      const cell = (r[idx] ?? '').trim();
      if (!cell) continue;
      if (c.tag) tags[c.tag] = cell;
      else v[c.field] = cell;
    }
    const ref = v.ad_id ?? v.ad_name;
    if (!ref) return skipped.push({ row: i + 2, reason: 'no ad id or name' });
    if (/^(totals?|grand total)$|^results from\b/i.test(ref.trim())) return skipped.push({ row: i + 2, reason: 'summary row' });
    const spend = num(v.spend);
    const impressions = num(v.impressions);
    if (spend == null || impressions == null) return skipped.push({ row: i + 2, reason: 'spend or impressions missing' });
    const m = { spend, impressions, clicks: num(v.clicks), purchases: num(v.purchases), revenue: num(v.revenue), views_3s: num(v.views_3s), thruplays: num(v.thruplays), frequency: num(v.frequency) };
    Object.assign(m, {
      ctr: ratio(m.clicks, m.impressions),
      cvr: ratio(m.purchases, m.clicks),
      cpa: m.purchases ? ratio(m.spend, m.purchases) : undefined,
      roas: ratio(m.revenue, m.spend),
      hook_rate: ratio(m.views_3s, m.impressions),
      hold_rate: ratio(m.thruplays, m.views_3s),
    });
    const metrics = Object.fromEntries(Object.entries(m).filter(([, x]) => x !== undefined));
    const per = v.date_start ? `${v.date_start}${v.date_stop && v.date_stop !== v.date_start ? `..${v.date_stop}` : ''}` : period;
    const rec = {
      id: `perf-${slug(ref)}-${slug(per ?? 'all')}`,
      artifact_ref: ref,
      channel,
      metrics,
      spend: { amount: spend, currency: v.currency ?? currency },
      source: { provider: 'csv', preset, ...(file ? { file } : {}), ...(imported_at ? { imported_at } : {}) },
    };
    if (v.ad_name) rec.ad_name = v.ad_name;
    if (per) rec.period = per;
    if (v.audience) rec.audience = v.audience;
    if (Object.keys(tags).length) rec.tags = tags;
    records.push(rec);
  });
  return { records, skipped, columns: Object.fromEntries(Object.entries(cols).map(([i, c]) => [headers[i], c.field ?? `tag:${c.tag}`])) };
}
