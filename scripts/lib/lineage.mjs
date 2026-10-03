// Creative lineage (section 22): sidecar `<output>.lineage.json` per artifact version, plus an append-only
// index in <ws>/state/lineage.jsonl. Git diffs lines; this records intent, changed and kept dimensions.
import fs from 'node:fs';
import path from 'node:path';
import { appendJSONL, readJSONL, sha256File, exists, nowISO, writeJSON } from './core.mjs';
import { validateValue } from './schemas.mjs';

export const sidecarPath = (output) => `${output}.lineage.json`;

export function history(ws, artifact_id) {
  return readJSONL(path.join(ws, 'state', 'lineage.jsonl')).filter((r) => r.artifact_id === artifact_id).sort((a, b) => a.version - b.version);
}

/** record(ws, {artifact_id, kind, intent_of_change, changed_dimensions, unchanged_dimensions, operation, output_files:[path], ...}) */
export function record(ws, entry) {
  const prev = history(ws, entry.artifact_id);
  const version = (prev.at(-1)?.version ?? 0) + 1;
  const parent_version = prev.at(-1)?.version ?? null;
  if (parent_version != null && !(entry.changed_dimensions ?? []).length)
    throw new Error('a new version must name changed_dimensions (one meaningful variable at a time, section 3.7)');
  if ((entry.changed_dimensions ?? []).length > 2)
    console.warn(`lineage: ${entry.changed_dimensions.length} dimensions changed at once; refinement should change one meaningful variable`);
  const output_files = (entry.output_files ?? []).map((f) => {
    const p = typeof f === 'string' ? f : f.path;
    const abs = path.isAbsolute(p) ? p : path.join(ws, p);
    return exists(abs) ? { path: p, sha256: sha256File(abs) } : { path: p };
  });
  const rec = { result: 'pending', ...entry, version, parent_version, output_files, created_at: nowISO() };
  const v = validateValue('artifact-lineage', rec);
  if (!v.ok) throw new Error(`lineage record invalid: ${v.errors}`);
  appendJSONL(path.join(ws, 'state', 'lineage.jsonl'), rec);
  for (const f of output_files) {
    const abs = path.isAbsolute(f.path) ? f.path : path.join(ws, f.path);
    if (exists(path.dirname(abs))) writeJSON(sidecarPath(abs), rec);
  }
  return rec;
}

// "creative commit" summary, e.g. for a commit message or review card
export function summarize(rec) {
  return [
    `${rec.artifact_id} v${rec.version}`,
    `intent: ${rec.intent_of_change}`,
    `changed: ${(rec.changed_dimensions ?? []).join(', ') || '(first version)'}`,
    `kept: ${(rec.unchanged_dimensions ?? []).join(', ') || '-'}`,
    `result: ${rec.result}`,
  ].join('\n');
}

export const _fs = fs;
