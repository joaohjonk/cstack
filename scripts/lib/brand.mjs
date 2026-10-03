// Brand workspaces. cstack itself holds no brand data: each brand lives in its own (usually private) repo,
// created from templates/brand-workspace and checked with `cstack brand check`.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, Report, exists, readData, writeAtomic, isOfficial, rel, walk, readText } from './core.mjs';
import { validateTree, validateValue } from './schemas.mjs';

const TEMPLATE = path.join(ROOT, 'templates', 'brand-workspace');

function copyDir(src, dst, vars, tally = { added: 0, kept: 0 }) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name.replace(/^_dot_/, '.'));
    if (e.isDirectory()) copyDir(s, d, vars, tally);
    else {
      if (exists(d)) {
        tally.kept++;
        continue; // never overwrite existing brand files
      }
      let t = fs.readFileSync(s, 'utf8');
      for (const [k, v] of Object.entries(vars)) t = t.replaceAll(`{{${k}}}`, v);
      // the empty .keep that makes git keep assets/official/ is the one file cstack creates there, and only when absent
      if (e.name === '.keep' && isOfficial(d)) fs.writeFileSync(d, t, { flag: 'wx' });
      else writeAtomic(d, t);
      tally.added++;
    }
  }
  return tally;
}

const BRAND_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/; // brand-system.schema metadata.brand_id

export function initBrand(dir, { name, id } = {}) {
  if (!name || name === true) throw new Error('--name is required');
  const brandId = id ?? String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!brandId) throw new Error(`--id needed: "${name}" gives no usable id; pass --id like my-brand`);
  if (!BRAND_ID.test(brandId) || brandId.includes('..')) throw new Error(`--id "${brandId}" must match ${BRAND_ID.source}`);
  if (exists(dir) && !fs.statSync(dir).isDirectory()) throw new Error(`${dir} exists and is not a folder`);
  const date = new Date().toISOString().slice(0, 10);
  const { added, kept } = copyDir(TEMPLATE, dir, { BRAND_NAME: name, BRAND_ID: brandId, DATE: date });
  if (kept) return `already a workspace at ${dir} (${kept} files kept, ${added} added); name and id unchanged`;
  return [
    `brand workspace ready at ${dir}`,
    `next: cd ${dir} && run /brand-import (existing brand) or /workflow create-brand (new brand) in your agent`,
    `check it any time: cstack brand check --ws ${dir}`,
  ].join('\n');
}

export function checkBrand(ws) {
  const r = new Report();
  const cfgPath = ['cstack.config.yaml', 'cstack.config.yml', 'cstack.config.json'].map((f) => path.join(ws, f)).find(exists);
  if (!cfgPath) {
    r.error(rel(ws), 'no cstack.config.yaml; run `cstack brand init` (not walking a folder that is not a workspace)');
    return r;
  }
  const cfg = readData(cfgPath);
  if (!cfg?.budget) r.warn(rel(cfgPath), 'no budget envelope: paid provider calls will be blocked');
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
  if (exists(contextMapPath(ws))) {
    const tasks = readData(contextMapPath(ws))?.tasks ?? {};
    const known = exists(bsPath) ? new Set(Object.keys(readData(bsPath).sections ?? {})) : null;
    for (const [task, t] of Object.entries(tasks)) {
      for (const sec of t?.sections ?? []) if (known && !known.has(sec)) r.warn(`context-map ${task}`, `section "${sec}" is not in brand-system.json`);
      try {
        for (const m of mapFiles(ws, t?.files).missing) r.warn(`context-map ${task}`, `${m} does not exist`);
      } catch (e) {
        r.error(`context-map ${task}`, e.message);
      }
    }
  }
  // secrets must never sit in brand state
  for (const f of walk(ws, (p) => /\.(json|ya?ml|md|jsonl|txt)$/.test(p) && !p.includes('node_modules'))) {
    const t = readText(f);
    if (/(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|fal_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,})/.test(t)) r.error(rel(f), 'looks like a credential; keep keys in env vars or a secret store');
  }
  return r;
}

// ---------- source precedence in code ----------
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
  if (same) {
    const k = (x) => `${x.kind}|${x.ref ?? ''}|${x.quote ?? ''}`;
    const known = new Set(existing.sources.map(k));
    const fresh = (incoming.sources ?? []).filter((x) => !known.has(k(x)));
    const confidence = incoming.confidence === 'high' ? 'high' : existing.confidence;
    if (!fresh.length && confidence === existing.confidence) return { action: 'keep', reason: 'same value and evidence' };
    return { action: 'set', field: { ...existing, sources: [...existing.sources, ...fresh], confidence }, reason: 'same value; evidence added' };
  }
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

// One writer at a time for brand-system.json: a wx lock file; a lock older than 5 minutes is from a crashed run.
const LOCK_STALE_MS = 5 * 60 * 1000;
function withBrandLock(p, fn) {
  const lock = `${p}.lock`;
  const take = () => fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
  try {
    take();
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    if (Date.now() - fs.statSync(lock).mtimeMs < LOCK_STALE_MS) throw new Error(`${path.basename(p)} is being updated by another run (${lock}); retry in a moment`);
    fs.rmSync(lock, { force: true });
    take();
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function parseFieldPath(path_) {
  const m = /^([a-z][a-z0-9_]*)\.([a-z0-9_][a-z0-9_-]*)$/i.exec(String(path_ ?? ''));
  if (!m || UNSAFE_KEYS.has(m[1]) || UNSAFE_KEYS.has(m[2])) throw new Error(`field must be <section>.<field>, e.g. voice.tone (got "${path_}")`);
  return [m[1], m[2]];
}

// Validates the incoming field on its own (known section, required keys, enums) before anything is merged or written.
function checkIncoming(bs, sec, key, incoming) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) throw new Error(`${sec}.${key}: the file must hold one JSON object {value, sources[], confidence, approval}`);
  const probe = { schema_version: bs.schema_version, metadata: bs.metadata, sections: { [sec]: { [key]: incoming } } };
  const v = validateValue('brand-system', probe);
  if (!v.ok) throw new Error(`${sec}.${key}: not a valid brand field (schemas/brand-system.schema.json): ${v.errors}`);
}

export function applyToBrand(ws, path_, incoming) {
  const [sec, key] = parseFieldPath(path_);
  const p = path.join(ws, 'brand', 'brand-system.json');
  if (!exists(p)) throw new Error(`no brand/brand-system.json in ${ws}; run cstack brand init or pass --ws`);
  return withBrandLock(p, () => {
    const bs = readData(p);
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) throw new Error(`${sec}.${key}: the file must hold one JSON object {value, sources[], confidence, approval}`);
    const field = { last_updated: today(), ...incoming };
    checkIncoming(bs, sec, key, field);
    bs.sections ??= {};
    bs.sections[sec] ??= {};
    const res = mergeField(path_, bs.sections[sec][key], field);
    if (res.action === 'set') bs.sections[sec][key] = res.field;
    if (res.action === 'conflict') {
      bs.conflicts ??= [];
      const dup = bs.conflicts.find((c) => c.status === 'open' && c.field === path_ && c.positions?.some((x) => fieldHash(x) === fieldHash(incoming)));
      if (dup) return { action: 'keep', reason: `same conflict already open (${dup.id})` };
      const base = res.conflict.id;
      let n = 1;
      while (bs.conflicts.some((c) => c.id === res.conflict.id)) res.conflict.id = `${base}-${++n}`;
      bs.conflicts.push(res.conflict);
      // the field reads as disputed until the owner resolves it; its value is only the default meanwhile
      Object.assign(bs.sections[sec][key], { approval: 'conflict', notes: `conflict ${res.conflict.id} open; value is the default until the owner resolves it` });
    }
    if (res.action !== 'keep') {
      bs.metadata.updated = today();
      writeJSON(p, bs);
    }
    return res;
  });
}

// Owner resolves an open conflict by picking one position (1-based). The pick becomes a user_instruction.
export function resolveConflict(ws, id, { pick, by = 'owner', note } = {}) {
  const p = path.join(ws, 'brand', 'brand-system.json');
  if (!/^\d+$/.test(String(pick))) throw new Error(`--pick needs a position number (the owner chooses), got "${pick}"`);
  return withBrandLock(p, () => resolveLocked(p, id, { pick, by, note }));
}

function resolveLocked(p, id, { pick, by, note }) {
  const bs = readData(p);
  const c = (bs.conflicts ?? []).find((x) => x.id === id);
  if (!c) throw new Error(`no conflict "${id}" (open: ${(bs.conflicts ?? []).filter((x) => x.status === 'open').map((x) => x.id).join(', ') || 'none'})`);
  if (c.status !== 'open') throw new Error(`conflict ${id} is already ${c.status}`);
  const pos = c.positions?.[Number(pick) - 1];
  if (!pos) throw new Error(`--pick must be 1..${c.positions?.length ?? 0}`);
  const [sec, key] = c.field.split('.');
  const prev = bs.sections?.[sec]?.[key] ?? {};
  bs.sections[sec] ??= {};
  bs.sections[sec][key] = { ...prev, value: pos.value, sources: [{ kind: 'user_instruction', ref: `resolved ${id} by ${by}` }, ...(pos.source ? [pos.source] : [])], approval: prev.approval === 'locked' ? 'locked' : 'current', confidence: 'high', last_updated: today(), notes: /^conflict \S+ open;/.test(prev.notes ?? '') ? undefined : prev.notes };
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

// Compact, deterministic brand context for prompts (a stable prompt prefix).
// Only sections asked for; approved values inline; unknown/conflict/inferred values listed separately
// so they never ship as fact. Sorted keys + hash: identical inputs produce an identical, cacheable prefix.
const USABLE = new Set(['locked', 'current', 'testing']);
// brand/context-map.yaml names the sections and files each task needs, so an agent loads those and nothing else.
export const contextMapPath = (ws) => path.join(ws, 'brand', 'context-map.yaml');

function mapFiles(ws, entries) {
  const files = [], missing = [];
  for (const e of entries ?? []) {
    const abs = path.resolve(ws, String(e));
    const r = path.relative(ws, abs);
    if (r.startsWith('..') || path.isAbsolute(r)) throw new Error(`context-map path leaves the workspace: ${e}`);
    if (!exists(abs)) missing.push(String(e));
    else if (fs.statSync(abs).isDirectory()) files.push(...walk(abs, (p) => path.basename(p) !== '.keep').map((p) => path.relative(ws, p).split(path.sep).join('/')).sort());
    else files.push(r.split(path.sep).join('/'));
  }
  return { files: [...new Set(files)], missing };
}

/** brandContext for one task of brand/context-map.yaml: its sections' facts plus the workspace files it needs. */
export function taskContext(ws, task, { includeInferred = false } = {}) {
  if (!exists(contextMapPath(ws))) throw new Error('no brand/context-map.yaml in this workspace; `cstack brand init <ws>` adds it without touching existing files');
  const tasks = readData(contextMapPath(ws))?.tasks ?? {};
  const t = tasks[task];
  if (!t) throw new Error(`task "${task}" is not in brand/context-map.yaml (tasks: ${Object.keys(tasks).join(', ') || 'none'})`);
  const { hash, ...ctx } = brandContext(ws, { sections: t.sections, includeInferred });
  const { files, missing } = mapFiles(ws, t.files);
  const body = { ...ctx, task, files, not_facts: [...ctx.not_facts, ...missing.map((m) => `file ${m}: listed for ${task} but missing`)] };
  return { ...body, hash: hashValue(body).slice(0, 16) };
}

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
