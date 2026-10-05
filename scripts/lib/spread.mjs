// F93: a campaign that comes back as one flavour in one mood is drift, not a direction. Before the pick, count the
// frames by what the brief asked to vary (flavour, SKU, mood, setting, casting) and stop when one value takes more
// than its share or a value the brief names is missing. Reviewers judge range from a count, not from memory.
import fs from 'node:fs';
import path from 'node:path';
import { readData } from './core.mjs';

export const DEFAULT_MAX_SHARE = 0.4;

/** Frames from a manifest: a list, or {frames|shots|applications|items: [...]}, each an object of fields. */
export function readFrames(file) {
  const d = readData(file);
  const list = Array.isArray(d) ? d : d?.frames ?? d?.shots ?? d?.applications ?? d?.items;
  if (!Array.isArray(list)) throw new Error(`${file}: expected a list of frames, or {frames: [...]}`);
  return list;
}

/** spreadCheck(frames, {by: [field], expect: {field: [values]}, max_share}) -> {ok, fields: [{by, counts, over, missing, unlabelled}]} */
export function spreadCheck(frames, { by = [], expect = {}, max_share = DEFAULT_MAX_SHARE } = {}) {
  if (!by.length) throw new Error('--by <field> required: what the brief asked the frames to vary (flavour, mood, setting)');
  if (!(max_share > 0 && max_share <= 1)) throw new Error('--max-share must be between 0 and 1');
  const fields = by.map((field) => {
    const counts = {};
    let unlabelled = 0;
    for (const f of frames) {
      const v = f?.[field];
      if (v == null || v === '') unlabelled++;
      else counts[String(v).toLowerCase()] = (counts[String(v).toLowerCase()] ?? 0) + 1;
    }
    const n = frames.length;
    // with fewer values than 1/max_share the cap cannot hold; the fair share is then 1/values
    const values = Math.max(Object.keys(counts).length, (expect[field] ?? []).length, 1);
    const cap = Math.max(max_share, 1 / values);
    const over = Object.entries(counts).filter(([, c]) => c / n > cap + 1e-9).map(([v, c]) => ({ value: v, count: c, share: Math.round((c / n) * 100) / 100 }));
    const missing = (expect[field] ?? []).filter((v) => !counts[String(v).toLowerCase()]);
    return { by: field, counts, over, missing, unlabelled, cap: Math.round(cap * 100) / 100 };
  });
  return { frames: frames.length, ok: fields.every((x) => !x.over.length && !x.missing.length && !x.unlabelled), fields };
}
