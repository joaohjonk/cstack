// cstack brief approve|reopen: the founder's yes to a founder brief, and taking it back (field test F37: the founder
// pivoted after approving, nothing reopened the brief, and the make gate kept passing until it was reset by hand).
// approve records who, when, and a fingerprint of the brief's content; the make gate refuses a brief whose content no
// longer matches its fingerprint. reopen sets it back to `reopened` and logs why in `amendments`, so make re-gates.
import fs from 'node:fs';
import crypto from 'node:crypto';
import YAML from 'yaml';
import { validateValue } from './schemas.mjs';

const today = () => new Date().toISOString().slice(0, 10);

// key order must not change the fingerprint
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);

/** sha256 of everything the founder said yes to: the brief minus its approval and amendment log. */
export function briefFingerprint(brief) {
  const { owner_approval, amendments, ...content } = brief ?? {};
  return 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(canon(content))).digest('hex');
}

/** Approved, valid, and unchanged since approval (an approval without a fingerprint predates this check and counts). */
export function briefApproved(brief) {
  if (brief?.owner_approval?.status !== 'owner_approved' || !validateValue('founder-brief', brief).ok) return false;
  const fp = brief.owner_approval.fingerprint;
  return !fp || fp === briefFingerprint(brief);
}

function edit(file, fn) {
  const text = fs.readFileSync(file, 'utf8');
  const json = file.endsWith('.json');
  const doc = json ? null : YAML.parseDocument(text);
  const data = json ? JSON.parse(text) : doc.toJS();
  const next = fn(structuredClone(data));
  const v = validateValue('founder-brief', next);
  if (!v.ok) throw new Error(`${file} would not validate as founder-brief: ${v.errors}`);
  if (json) fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
  else {
    for (const k of ['owner_approval', 'amendments']) next[k] === undefined ? doc.delete(k) : doc.set(k, doc.createNode(next[k]));
    fs.writeFileSync(file, doc.toString());
  }
  return next;
}

export function approveBrief(file, { by, date = today() } = {}) {
  if (!by || by === true) throw new Error('--by <founder> is required: the yes is the founder\'s, by name');
  return edit(file, (b) => {
    b.owner_approval = { status: 'owner_approved', by: String(by), date, fingerprint: briefFingerprint(b) };
    return b;
  });
}

export function reopenBrief(file, { reason, by, date = today() } = {}) {
  if (!reason || reason === true) throw new Error('--reason "<what changed>" is required');
  return edit(file, (b) => {
    const prev = b.owner_approval ?? { status: 'draft' };
    b.amendments = [...(b.amendments ?? []), { date, reason: String(reason), ...(by && by !== true ? { by: String(by) } : {}), previous: { status: prev.status, ...(prev.by ? { by: prev.by } : {}), ...(prev.date ? { date: prev.date } : {}) } }];
    b.owner_approval = { status: 'reopened' };
    return b;
  });
}
