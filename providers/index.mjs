// Provider registry. Adapters implement one or more interfaces:
//   media:     submit(req) -> {job_id,...}; status(job) -> {state: queued|running|done|failed, error?};
//              result(job) -> {outputs:[{url|bytes, ext}], seed?, cost?}; download(url, file); estimate?(req)
//   verifier:  verify({artifact, reference_brand, context}) -> {score, verdict, recommendations[], evidence, job_id}
//   extractor: extract({url|files}) -> {brand_state_fragment, evidence[], job_id}
//   reference_search: search({intent, k}) -> [{id, title, url, why, evidence}]
// Credentials come from environment variables named in registry/providers.json, never from files in the repo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mock } from './mock.mjs';
import { fal } from './fal.mjs';
import { tasteLabs } from './taste-labs.mjs';
import { stubs } from './stubs.mjs';

const ADAPTERS = { mock, fal, 'taste-labs': tasteLabs, ...stubs };
export const REGISTRY_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'registry', 'providers.json');
const KINDS = ['media', 'research', 'local'];
const STATUSES = ['live', 'stub', 'mock'];

export const adapterIds = () => Object.keys(ADAPTERS);

export function getProvider(id) {
  const p = ADAPTERS[id];
  if (!p) throw new Error(`unknown provider "${id}" (known: ${Object.keys(ADAPTERS).join(', ')})`);
  return p;
}

/** registry/providers.json entries ([] when the file is absent). Throws on invalid JSON. */
export function loadProviderRegistry(file = REGISTRY_PATH) {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8')).providers ?? [];
}

/** Consistency problems between registry/providers.json and the adapters registered above. [] = consistent. */
export function checkProviderRegistry(file = REGISTRY_PATH) {
  const problems = [];
  let reg;
  try {
    reg = loadProviderRegistry(file);
  } catch (e) {
    return [`does not parse: ${e.message}`];
  }
  if (!fs.existsSync(file)) return ['missing'];
  const seen = new Set();
  const root = path.join(path.dirname(file), '..');
  for (const e of reg) {
    const where = `provider "${e.id ?? '?'}"`;
    if (!e.id) problems.push('entry without id');
    if (seen.has(e.id)) problems.push(`${where}: duplicate id`);
    seen.add(e.id);
    if (!KINDS.includes(e.kind)) problems.push(`${where}: kind must be one of ${KINDS.join('|')}`);
    if (!STATUSES.includes(e.status)) problems.push(`${where}: status must be one of ${STATUSES.join('|')}`);
    if (!Array.isArray(e.env) || e.env.some((v) => !/^[A-Z][A-Z0-9_]*$/.test(v))) problems.push(`${where}: env must list environment variable NAMES (UPPER_SNAKE)`);
    if (!Array.isArray(e.operations) || !e.operations.length) problems.push(`${where}: operations must be a non-empty list`);
    if (e.docs != null && !/^https:\/\//.test(e.docs)) problems.push(`${where}: docs must be an https URL or null`);
    if (e.module && !fs.existsSync(path.join(root, e.module))) problems.push(`${where}: module ${e.module} does not exist`);
    const a = ADAPTERS[e.id];
    if (e.adapter !== false) {
      if (!a) {
        problems.push(`${where}: not registered in providers/index.mjs (set adapter: false for non-runner tools)`);
        continue;
      }
      if (JSON.stringify([...(a.env ?? [])].sort()) !== JSON.stringify([...e.env].sort())) problems.push(`${where}: env ${JSON.stringify(e.env)} != adapter env ${JSON.stringify(a.env ?? [])}`);
      if (JSON.stringify([...(a.interfaces ?? [])].sort()) !== JSON.stringify([...(e.interfaces ?? [])].sort())) problems.push(`${where}: interfaces differ from the adapter`);
      if (!!a.stub !== (e.status === 'stub')) problems.push(`${where}: status "${e.status}" but adapter ${a.stub ? 'is' : 'is not'} a stub`);
    }
  }
  for (const id of Object.keys(ADAPTERS)) if (!seen.has(id)) problems.push(`adapter "${id}" missing from registry/providers.json`);
  return problems;
}

export function availability(env = process.env) {
  let reg = [];
  try {
    reg = loadProviderRegistry();
  } catch {}
  const byId = Object.fromEntries(reg.map((e) => [e.id, e]));
  const rows = Object.entries(ADAPTERS).map(([id, p]) => {
    const r = byId[id] ?? {};
    return { id, kind: r.kind ?? null, status: r.status ?? (p.stub ? 'stub' : null), interfaces: p.interfaces, available: p.available ? p.available(env) : true, needs: p.env ?? [], missing_env: (p.env ?? []).filter((k) => !env[k]), operations: r.operations ?? [], docs: r.docs ?? null };
  });
  // registry-only local tools (not media-runner adapters), e.g. region-paste
  for (const r of reg.filter((e) => e.adapter === false))
    rows.push({ id: r.id, kind: r.kind, status: r.status, interfaces: r.interfaces ?? [], available: true, needs: r.env ?? [], missing_env: (r.env ?? []).filter((k) => !env[k]), operations: r.operations ?? [], docs: r.docs ?? null, cli: r.cli });
  return rows;
}
