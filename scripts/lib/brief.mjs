// cstack brief approve|reopen: the founder's yes to a founder brief, and taking it back (field test F37: the founder
// pivoted after approving, nothing reopened the brief, and the make gate kept passing until it was reset by hand).
// approve records who, when, and a fingerprint of the brief's content; the make gate refuses a brief whose content no
// longer matches its fingerprint. reopen sets it back to `reopened` and logs why in `amendments`, so make re-gates.
import fs from 'node:fs';
import path from 'node:path';
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

// <ws>/briefs/x.founder-brief.yaml -> <ws>
const wsOf = (file) => path.dirname(path.dirname(path.resolve(file)));
const feedbackLines = (ws) => {
  const f = path.join(ws, 'state', 'feedback.jsonl');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).length : 0;
};
const snapshotPath = (file, fp) => {
  const base = path.basename(file).replace(/\.founder-brief\.(ya?ml|json)$/, '');
  return path.join(wsOf(file), 'state', 'approved-briefs', `${base}.${fp.slice(7, 19)}.founder-brief${path.extname(file)}`);
};

/**
 * Records the yes: who, when, a fingerprint of the content, and how far state/feedback.jsonl had got, so reactions
 * from before this approval (to work made for an older brief) no longer count at the make gate (F42). Keeps a copy of
 * the approved version under state/approved-briefs/ (F45), so a reopen can say what changed since the yes.
 */
export function approveBrief(file, { by, date = today() } = {}) {
  if (!by || by === true) throw new Error('--by <founder> is required: the yes is the founder\'s, by name');
  const ws = wsOf(file);
  const next = edit(file, (b) => {
    b.owner_approval = { status: 'owner_approved', by: String(by), date, fingerprint: briefFingerprint(b), feedback_mark: feedbackLines(ws) };
    return b;
  });
  const snap = snapshotPath(file, next.owner_approval.fingerprint);
  fs.mkdirSync(path.dirname(snap), { recursive: true });
  fs.copyFileSync(file, snap);
  return { ...next, snapshot: snap };
}

/** Top-level sections that differ between the brief now and the version the founder approved (null: no copy kept). */
export function changedSinceApproval(file, brief) {
  const fp = brief?.owner_approval?.fingerprint;
  const snap = fp ? snapshotPath(file, fp) : null;
  if (!snap || !fs.existsSync(snap)) return null;
  const was = snap.endsWith('.json') ? JSON.parse(fs.readFileSync(snap, 'utf8')) : YAML.parse(fs.readFileSync(snap, 'utf8'));
  const keys = new Set([...Object.keys(was), ...Object.keys(brief)].filter((k) => !['owner_approval', 'amendments'].includes(k)));
  return [...keys].filter((k) => JSON.stringify(canon(was[k])) !== JSON.stringify(canon(brief[k])));
}

export function reopenBrief(file, { reason, by, date = today() } = {}) {
  if (!reason || reason === true) throw new Error('--reason "<what changed>" is required');
  const current = file.endsWith('.json') ? JSON.parse(fs.readFileSync(file, 'utf8')) : YAML.parse(fs.readFileSync(file, 'utf8'));
  const status = current?.owner_approval?.status ?? 'draft';
  // F43: there is nothing to reopen until the founder has said yes
  if (status !== 'owner_approved') throw new Error(`nothing to reopen: ${path.basename(file)} is ${status}, not approved; keep interviewing and approve it with cstack brief approve`);
  const changed = changedSinceApproval(file, current);
  const next = edit(file, (b) => {
    const prev = b.owner_approval ?? { status: 'draft' };
    b.amendments = [...(b.amendments ?? []), { date, reason: String(reason), ...(by && by !== true ? { by: String(by) } : {}), previous: { status: prev.status, ...(prev.by ? { by: prev.by } : {}), ...(prev.date ? { date: prev.date } : {}) } }];
    b.owner_approval = { status: 'reopened' };
    return b;
  });
  return { ...next, changed };
}

/** For the make gate: state/feedback.jsonl lines before this index were written before the latest approval. */
export function feedbackMark(ws) {
  const dir = path.join(ws, 'briefs');
  if (!fs.existsSync(dir)) return 0;
  let mark = 0;
  for (const f of fs.readdirSync(dir).filter((n) => /\.founder-brief\.(ya?ml|json)$/.test(n))) {
    try {
      const p = path.join(dir, f);
      const b = f.endsWith('.json') ? JSON.parse(fs.readFileSync(p, 'utf8')) : YAML.parse(fs.readFileSync(p, 'utf8'));
      if (briefApproved(b)) mark = Math.max(mark, b.owner_approval.feedback_mark ?? 0);
    } catch {}
  }
  return mark;
}
