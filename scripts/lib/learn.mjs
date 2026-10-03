// Learning memory: raw events are append-only; promotion needs repeated evidence or a
// strong human correction, plus scope/expiry and an approver. Promotion appends a `promoted` event;
// the human-readable rule is then written where the event's `target` says (docs/learnings.md, a skill,
// a provider note, an eval) by the /learn skill.
import path from 'node:path';
import { readJSONL, appendJSONL, today, newId } from './core.mjs';

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function learningCandidates(ws) {
  const ev = readJSONL(path.join(ws, 'state', 'learnings.jsonl'));
  const promoted = new Set(ev.filter((e) => e.kind === 'promoted').map((e) => e.replaces));
  const retired = new Set(ev.filter((e) => e.kind === 'retired').map((e) => e.replaces));
  const groups = new Map();
  for (const e of ev) {
    if (['promoted', 'retired'].includes(e.kind)) continue;
    const key = (e.tags ?? []).find((t) => t.startsWith('topic:')) ?? norm(e.statement).slice(0, 80);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const out = [];
  for (const [key, items] of groups) {
    const ids = items.map((i) => i.id);
    if (ids.some((id) => promoted.has(id) || retired.has(id))) continue;
    const strongHuman = items.some((i) => ['human_edit', 'approval'].includes(i.kind) && i.confidence === 'high');
    const repeated = items.length >= 2;
    if (!strongHuman && !repeated) continue;
    const scopes = [...new Set(items.map((i) => i.scope))];
    const needsExpiry = scopes.some((s) => ['model_specific', 'tool_specific', 'campaign_specific'].includes(s)) && !items.some((i) => i.expires);
    out.push({ key, evidence: ids, count: items.length, reason: strongHuman ? 'strong human correction' : 'repeated evidence', scopes, should_become: items.at(-1).should_become ?? null, needs_expiry: needsExpiry, statement: items.at(-1).statement });
  }
  return out;
}

export function promoteLearning(ws, id, { to, by } = {}) {
  if (!id || !to || !by) throw new Error('usage: cstack learn promote <event-id> --to <target file/skill> --by <approver>');
  const ev = readJSONL(path.join(ws, 'state', 'learnings.jsonl'));
  const src = ev.find((e) => e.id === id);
  if (!src) throw new Error(`no learning event ${id}`);
  if (['model_specific', 'tool_specific', 'campaign_specific'].includes(src.scope) && !src.expires) throw new Error(`${src.scope} learnings need an expires/review condition before promotion`);
  const rec = { id: newId('LP'), date: today(), kind: 'promoted', statement: src.statement, scope: src.scope, confidence: src.confidence, evidence: src.evidence ?? [], replaces: src.id, should_become: src.should_become, target: to, approved_by: by, expires: src.expires, tags: src.tags ?? [] };
  appendJSONL(path.join(ws, 'state', 'learnings.jsonl'), rec);
  return `promoted ${src.id} → ${to} as ${rec.id}. Now write the rule into ${to} with provenance (${rec.id}).`;
}
