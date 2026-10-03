// Brand workspaces. cstack itself holds no brand data: each brand lives in its own (usually private) repo,
// created from templates/brand-workspace and checked with `cstack brand check`.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, Report, exists, readData, writeAtomic, rel, walk, readText } from './core.mjs';
import { validateTree } from './schemas.mjs';

const TEMPLATE = path.join(ROOT, 'templates', 'brand-workspace');

function copyDir(src, dst, vars) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name.replace(/^_dot_/, '.'));
    if (e.isDirectory()) copyDir(s, d, vars);
    else {
      if (exists(d)) continue; // never overwrite existing brand files (section 25)
      let t = fs.readFileSync(s, 'utf8');
      for (const [k, v] of Object.entries(vars)) t = t.replaceAll(`{{${k}}}`, v);
      writeAtomic(d, t);
    }
  }
}

export function initBrand(dir, { name, id } = {}) {
  if (!name) throw new Error('--name is required');
  const brandId = id ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const date = new Date().toISOString().slice(0, 10);
  copyDir(TEMPLATE, dir, { BRAND_NAME: name, BRAND_ID: brandId, DATE: date });
  return [
    `brand workspace ready at ${dir}`,
    `next: cd ${dir} && run /brand-import (existing brand) or /workflow create-brand (new brand) in your agent`,
    `check it any time: cstack brand check --ws ${dir}`,
  ].join('\n');
}

export function checkBrand(ws) {
  const r = new Report();
  const cfgPath = ['cstack.config.yaml', 'cstack.config.yml', 'cstack.config.json'].map((f) => path.join(ws, f)).find(exists);
  if (!cfgPath) r.error(rel(ws), 'no cstack.config.yaml; run `cstack brand init`');
  const cfg = cfgPath ? readData(cfgPath) : {};
  if (cfgPath && !cfg?.budget) r.warn(rel(cfgPath), 'no budget envelope: paid provider calls will be blocked');
  for (const res of validateTree(ws, { base: ws, skip: ['node_modules', '.git'] })) if (!res.ok) r.error(res.file, `[${res.schema}] ${res.errors}`);
  const bsPath = path.join(ws, 'brand', 'brand-system.json');
  if (exists(bsPath)) {
    const bs = readData(bsPath);
    let fields = 0;
    const by = {};
    for (const [sec, obj] of Object.entries(bs.sections ?? {}))
      for (const [k, f] of Object.entries(obj ?? {})) {
        fields++;
        by[f.approval] = (by[f.approval] ?? 0) + 1;
        if (!f.sources?.length) r.error(`brand-system ${sec}.${k}`, 'field has no source (write UNKNOWN instead of inventing)');
        if (['conflict', 'unknown'].includes(f.approval) && f.value !== null && f.value !== 'UNKNOWN' && !f.notes) r.warn(`brand-system ${sec}.${k}`, `${f.approval} field carries a value; it must never ship as fact`);
        if ((f.permanence === 'campaign' || f.permanence === 'experimental') && !f.expires) r.warn(`brand-system ${sec}.${k}`, `${f.permanence} field without expires`);
      }
    const open = (bs.conflicts ?? []).filter((c) => c.status === 'open');
    r.note(`brand-system: ${fields} fields (${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ')}); ${open.length} open conflicts`);
    const inferred = by.inferred ?? 0;
    if (fields && inferred / fields > 0.5) r.warn('brand-system', `${Math.round((100 * inferred) / fields)}% of fields are inferred; confirm the consequential ones with the owner`);
  } else r.warn(rel(ws), 'no brand/brand-system.json yet');
  // secrets must never sit in brand state
  for (const f of walk(ws, (p) => /\.(json|ya?ml|md|jsonl|txt)$/.test(p) && !p.includes('node_modules'))) {
    const t = readText(f);
    if (/(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|fal_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,})/.test(t)) r.error(rel(f), 'looks like a credential; keep keys in env vars or a secret store');
  }
  return r;
}

// ---------- source precedence in code (section 23) ----------
import { hashValue, readJSONL, writeJSON, today } from './core.mjs';
export const PRECEDENCE = ['user_instruction', 'approved_brand_state', 'official_asset', 'live_brand_behavior', 'campaign_exception', 'extracted_pattern', 'external_reference', 'model_inference'];
export const rankOf = (field) => Math.min(...(field.sources ?? []).map((s) => PRECEDENCE.indexOf(s.kind)).filter((i) => i >= 0), PRECEDENCE.length);
export const fieldHash = (field) => hashValue(field?.value ?? null).slice(0, 16);

/**
 * mergeField(existing, incoming) -> {action: 'set'|'keep'|'conflict', field?, conflict?, reason}
 * Never averages. A locked field changes only by explicit user instruction. A lower-precedence source
 * never overwrites a higher one; equal precedence with a different value becomes a conflict record.
 */
export function mergeField(path_, existing, incoming) {
  if (!existing) return { action: 'set', field: incoming, reason: 'new field' };
  const same = fieldHash(existing) === fieldHash(incoming);
  const re = rankOf(existing);
  const ri = rankOf(incoming);
  if (same) return { action: 'set', field: { ...existing, sources: [...existing.sources, ...incoming.sources], confidence: incoming.confidence === 'high' ? 'high' : existing.confidence }, reason: 'same value; evidence added' };
  // a newer owner instruction replaces an older one (the owner can change their mind); the old value is kept in history
  if (ri === 0 && re === 0) return { action: 'set', field: { ...incoming, history: [...(existing.history ?? []), { value: existing.value, sources: existing.sources, replaced: today() }] }, reason: 'newer owner instruction replaces the earlier one (kept in history)' };
  if (existing.approval === 'locked' && incoming.sources?.[0]?.kind !== 'user_instruction') return { action: 'keep', reason: 'field is locked; only an explicit owner instruction changes it' };
  if (ri < re) return { action: 'set', field: { ...incoming, notes: [incoming.notes, `supersedes value from ${PRECEDENCE[re]}`].filter(Boolean).join('; ') }, reason: `higher-precedence source (${PRECEDENCE[ri]} over ${PRECEDENCE[re]})` };
  if (ri > re) return { action: 'keep', reason: `lower-precedence source (${PRECEDENCE[ri]}) cannot overwrite ${PRECEDENCE[re]}` };
  return {
    action: 'conflict',
    conflict: { id: `CF-${today()}-${path_.replace(/[^a-z0-9]+/gi, '-')}`, field: path_, positions: [{ value: existing.value, source: existing.sources[0] }, { value: incoming.value, source: incoming.sources[0] }], default_until_resolved: existing.value, status: 'open' },
    reason: `equal precedence (${PRECEDENCE[re]}), different values: surfaced, not averaged`,
  };
}

export function applyToBrand(ws, path_, incoming) {
  const p = path.join(ws, 'brand', 'brand-system.json');
  const bs = readData(p);
  const [sec, key] = path_.split('.');
  bs.sections[sec] ??= {};
  const res = mergeField(path_, bs.sections[sec][key], { last_updated: today(), ...incoming });
  if (res.action === 'set') bs.sections[sec][key] = res.field;
  if (res.action === 'conflict') {
    bs.conflicts ??= [];
    const dup = bs.conflicts.find((c) => c.status === 'open' && c.field === path_ && c.positions?.some((x) => fieldHash(x) === fieldHash(incoming)));
    if (dup) return { action: 'keep', reason: `same conflict already open (${dup.id})` };
    const base = res.conflict.id;
    let n = 1;
    while (bs.conflicts.some((c) => c.id === res.conflict.id)) res.conflict.id = `${base}-${++n}`;
    bs.conflicts.push(res.conflict);
  }
  if (res.action !== 'keep') {
    bs.metadata.updated = today();
    writeJSON(p, bs);
  }
  return res;
}

// Owner resolves an open conflict by picking one position (1-based). The pick becomes a user_instruction.
export function resolveConflict(ws, id, { pick, by = 'owner', note } = {}) {
  const p = path.join(ws, 'brand', 'brand-system.json');
  const bs = readData(p);
  const c = (bs.conflicts ?? []).find((x) => x.id === id);
  if (!c) throw new Error(`no conflict "${id}" (open: ${(bs.conflicts ?? []).filter((x) => x.status === 'open').map((x) => x.id).join(', ') || 'none'})`);
  if (c.status !== 'open') throw new Error(`conflict ${id} is already ${c.status}`);
  const pos = c.positions?.[Number(pick) - 1];
  if (!pos) throw new Error(`--pick must be 1..${c.positions?.length ?? 0}`);
  const [sec, key] = c.field.split('.');
  const prev = bs.sections?.[sec]?.[key] ?? {};
  bs.sections[sec] ??= {};
  bs.sections[sec][key] = { ...prev, value: pos.value, sources: [{ kind: 'user_instruction', ref: `resolved ${id} by ${by}` }, ...(pos.source ? [pos.source] : [])], approval: prev.approval === 'locked' ? 'locked' : 'current', confidence: 'high', last_updated: today() };
  Object.assign(c, { status: 'resolved', resolved: today(), resolved_by: by, picked: Number(pick), ...(note ? { note } : {}) });
  // the owner's decision settles the field: other open disagreements about it are superseded, not left dangling
  for (const o of bs.conflicts) if (o !== c && o.status === 'open' && o.field === c.field) Object.assign(o, { status: 'superseded', superseded_by: id });
  bs.metadata.updated = today();
  writeJSON(p, bs);
  return { field: c.field, value: pos.value, conflict: id };
}

// Artifacts whose brand inputs changed since they were made (higgsfield-style dependency invalidation).
export function staleArtifacts(ws) {
  const bs = readData(path.join(ws, 'brand', 'brand-system.json'));
  const latest = new Map();
  for (const r of readJSONL(path.join(ws, 'state', 'lineage.jsonl'))) latest.set(r.artifact_id, r);
  const out = [];
  for (const r of latest.values()) {
    const changed = Object.entries(r.brand_refs ?? {}).filter(([fp, h]) => {
      const [s, k] = fp.split('.');
      return fieldHash(bs.sections?.[s]?.[k]) !== h;
    });
    if (changed.length) out.push({ artifact_id: r.artifact_id, version: r.version, changed: changed.map(([fp]) => fp) });
  }
  return out;
}

// Compact, deterministic brand context for prompts (section 12 stable prefix; section 31 "20 tasks").
// Only sections asked for; approved values inline; unknown/conflict/inferred values listed separately
// so they never ship as fact. Sorted keys + hash: identical inputs produce an identical, cacheable prefix.
const USABLE = new Set(['locked', 'current', 'testing']);
export function brandContext(ws, { sections, includeInferred = false } = {}) {
  const bs = readData(path.join(ws, 'brand', 'brand-system.json'));
  const want = sections?.length ? sections : Object.keys(bs.sections ?? {});
  const facts = {};
  const caution = [];
  for (const sec of [...want].sort()) {
    const obj = bs.sections?.[sec];
    if (!obj || !Object.keys(obj).length) {
      caution.push(`${sec}: ${obj ? 'empty' : 'section absent'} (UNKNOWN)`);
      continue;
    }
    for (const k of Object.keys(obj).sort()) {
      const f = obj[k];
      const open = (bs.conflicts ?? []).find((c) => c.status === 'open' && c.field === `${sec}.${k}`);
      if (open) {
        caution.push(`${sec}.${k}: conflict ${open.id} open (ask the owner); default until resolved: ${JSON.stringify(f.value)}`);
        continue;
      }
      if (USABLE.has(f.approval) || (includeInferred && f.approval === 'inferred')) {
        facts[sec] ??= {};
        facts[sec][k] = f.approval === 'locked' ? { value: f.value, locked: true } : f.value;
      } else caution.push(`${sec}.${k}: ${f.approval}${f.approval === 'conflict' ? ' (ask the owner)' : ''}`);
    }
  }
  const openConflicts = (bs.conflicts ?? []).filter((c) => c.status === 'open').map((c) => c.id ?? c.field);
  const body = { brand: bs.metadata?.name, brand_id: bs.metadata?.brand_id, updated: bs.metadata?.updated, facts, not_facts: caution, open_conflicts: openConflicts };
  return { ...body, hash: hashValue(body).slice(0, 16) };
}
