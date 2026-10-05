// Keep a cstack checkout current: a cheap, throttled check against its git remote, and an update that only
// fast-forwards. It never stashes, resets or discards anything: dirty files or local commits stop it with the list.
// State lives in $CSTACK_HOME (default ~/.cstack): config.json, installs.json, checkout, and the check cache.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, exists } from './core.mjs';

export const stateDir = (env = process.env) => env.CSTACK_HOME || path.join(env.HOME || os.homedir(), '.cstack');
const file = (env, name) => path.join(stateDir(env), name);

const readJSONOr = (p, dflt) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return dflt;
  }
};
const writeJSONFile = (p, v) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
};

// ---- config: { update_check: true|false, auto_update: true|false }
export const CONFIG_DEFAULTS = { update_check: true, auto_update: false };
export function readConfig(env = process.env) {
  return { ...CONFIG_DEFAULTS, ...readJSONOr(file(env, 'config.json'), {}) };
}
export function setConfig(key, value, env = process.env) {
  if (!(key in CONFIG_DEFAULTS)) throw new Error(`unknown setting "${key}" (known: ${Object.keys(CONFIG_DEFAULTS).join(', ')})`);
  const c = { ...readJSONOr(file(env, 'config.json'), {}), [key]: value };
  writeJSONFile(file(env, 'config.json'), c);
  return c;
}

// ---- install registry: what `cstack setup` installed, so an update can refresh the same places
export function readInstalls(env = process.env) {
  return readJSONOr(file(env, 'installs.json'), { installs: [] }).installs ?? [];
}
export function recordInstall({ host, target = null, copy = false, checkout = ROOT }, env = process.env) {
  const installs = readInstalls(env).filter((i) => !(i.host === host && (i.target ?? null) === (target ?? null)));
  installs.push({ host, target: target ?? null, copy: !!copy, checkout, at: new Date().toISOString() });
  writeJSONFile(file(env, 'installs.json'), { note: 'written by cstack setup; read by cstack update', installs });
  // a plain path file, so a skill can find the checkout from a shell without parsing JSON
  fs.writeFileSync(file(env, 'checkout'), checkout + '\n');
}

// ---- git helpers
function git(root, args, opts = {}) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: opts.timeout ?? 60000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() || (r.error ? r.error.message : '') };
}
const short = (sha) => (sha ? sha.slice(0, 7) : 'unknown');
export function version(root = ROOT) {
  return readJSONOr(path.join(root, 'package.json'), {}).version ?? 'unknown';
}

// The checkout's remote and branch: the upstream if one is set, else origin/<current branch>.
export function gitInfo(root = ROOT) {
  const top = git(root, ['rev-parse', '--show-toplevel']);
  if (!top.ok || fs.realpathSync(top.out) !== fs.realpathSync(root)) return { ok: false, reason: `${root} is not a git checkout (installed from a copy or an archive); reinstall with git clone to get updates` };
  const head = git(root, ['rev-parse', 'HEAD']).out;
  const branch = git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (!branch.ok) return { ok: false, head, reason: 'the checkout is on a detached HEAD; check out its branch (git checkout main) and run cstack update again' };
  let remote = 'origin';
  let remoteBranch = branch.out;
  const up = git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (up.ok && up.out.includes('/')) {
    remote = up.out.slice(0, up.out.indexOf('/'));
    remoteBranch = up.out.slice(up.out.indexOf('/') + 1);
  }
  const url = git(root, ['remote', 'get-url', remote]);
  if (!url.ok) return { ok: false, head, reason: `the checkout has no "${remote}" remote` };
  return { ok: true, head, branch: branch.out, remote, remoteBranch, url: url.out.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/i, '$1') };
}

const isAncestor = (root, a, b) => git(root, ['merge-base', '--is-ancestor', a, b]).ok;

// ---- the check (what skills run at the start of a session)
// Lines: JUST_UPDATED <old> <new> | UPDATE_AVAILABLE <local> <remote> [auto] | UP_TO_DATE <sha> | CHECK_FAILED <reason>
// Without --force only the first two print; everything else is silent, so a check never interrupts work.
const TTL = { up_to_date: 60, update_available: 12 * 60, failed: 10 }; // minutes
const SNOOZE_HOURS = [24, 48, 168];

export function checkForUpdate({ root = ROOT, force = false, env = process.env, now = Date.now() } = {}) {
  const lines = [];
  const marker = readJSONOr(file(env, 'just-updated.json'), null);
  if (marker) {
    lines.push(`JUST_UPDATED ${marker.from} ${marker.to}`);
    fs.rmSync(file(env, 'just-updated.json'), { force: true });
  }
  const cfg = readConfig(env);
  if (!cfg.update_check && !force) return lines;
  const info = gitInfo(root);
  if (!info.ok) {
    if (force) lines.push(`CHECK_FAILED ${info.reason}`);
    return lines;
  }
  const cachePath = file(env, 'last-update-check.json');
  let res = force ? null : readJSONOr(cachePath, null);
  if (res && (res.head !== info.head || now - res.at > TTL[res.status] * 60000)) res = null;
  if (!res) {
    const ls = git(root, ['ls-remote', info.remote, `refs/heads/${info.remoteBranch}`], { timeout: 8000 });
    const remoteSha = ls.ok ? ls.out.split(/\s+/)[0] : '';
    if (!remoteSha) res = { status: 'failed', reason: `could not read ${info.url} (${info.remoteBranch}): ${ls.err.split('\n')[0] || 'no such branch'}` };
    // remote equal to HEAD, or already in our history (local is ahead): nothing to fetch
    else if (remoteSha === info.head || isAncestor(root, remoteSha, info.head)) res = { status: 'up_to_date', remote: remoteSha };
    else res = { status: 'update_available', remote: remoteSha };
    res = { ...res, head: info.head, at: now };
    try {
      writeJSONFile(cachePath, res);
    } catch {
      // a read-only home must not break the check
    }
  }
  if (res.status === 'failed') {
    if (force) lines.push(`CHECK_FAILED ${res.reason}`);
    return lines;
  }
  if (res.status === 'up_to_date') {
    if (force) lines.push(`UP_TO_DATE ${version(root)}@${short(info.head)}`);
    return lines;
  }
  if (!force) {
    const sn = readJSONOr(file(env, 'update-snoozed.json'), null);
    if (sn && sn.remote === res.remote && now - sn.at < SNOOZE_HOURS[Math.min(sn.level, 3) - 1] * 3600000) return lines;
  }
  lines.push(`UPDATE_AVAILABLE ${version(root)}@${short(info.head)} ${short(res.remote)}${cfg.auto_update ? ' auto' : ''}`);
  return lines;
}

// "Not now": the same remote stays quiet for 24h, then 48h, then a week.
export function snooze({ env = process.env, now = Date.now() } = {}) {
  const cached = readJSONOr(file(env, 'last-update-check.json'), null);
  if (!cached?.remote || cached.status !== 'update_available') return { snoozed: false };
  const prev = readJSONOr(file(env, 'update-snoozed.json'), null);
  const level = prev && prev.remote === cached.remote ? Math.min(prev.level + 1, 3) : 1;
  writeJSONFile(file(env, 'update-snoozed.json'), { remote: cached.remote, level, at: now });
  return { snoozed: true, hours: SNOOZE_HOURS[level - 1] };
}

// ---- the update
// What's new: bullets this update added to CHANGELOG.md, shortened to their bold title when they have one.
export function whatsNew(root, from, to, max = 12) {
  const d = git(root, ['diff', '--unified=0', from, to, '--', 'CHANGELOG.md']);
  if (!d.ok) return [];
  return d.out
    .split('\n')
    .filter((l) => /^\+- /.test(l))
    .map((l) => {
      const t = l.slice(3).trim();
      const bold = t.match(/^\*\*(.+?)\*\*/);
      return bold ? bold[1].replace(/\.$/, '') : t.length > 140 ? t.slice(0, 137) + '...' : t;
    })
    .slice(0, max);
}

// Returns { ok, lines }. dryRun fetches and reports without changing the checkout.
export function runUpdate({ root = ROOT, env = process.env, dryRun = false, npm = 'npm', node = process.execPath } = {}) {
  const lines = [];
  const stop = (msg) => ({ ok: false, lines: [...lines, msg] });
  const info = gitInfo(root);
  if (!info.ok) return stop(`update stopped: ${info.reason}. Nothing was changed.`);
  lines.push(`cstack checkout: ${root} (${info.branch}, tracking ${info.remote}/${info.remoteBranch})`);

  const dirty = git(root, ['status', '--porcelain', '--untracked-files=no']).out.split('\n').filter(Boolean);
  if (dirty.length) return stop(`update stopped: the checkout has changes to tracked files, and cstack update never stashes or discards them. Nothing was changed. Commit or move them, then run cstack update again:\n${dirty.slice(0, 15).map((l) => '  ' + l).join('\n')}${dirty.length > 15 ? `\n  ... and ${dirty.length - 15} more` : ''}`);

  const f = git(root, ['fetch', '--quiet', info.remote, info.remoteBranch], { timeout: 120000 });
  if (!f.ok) return stop(`update stopped: could not fetch ${info.url} (${f.err.split('\n')[0]}). Check your network or git access. Nothing was changed.`);
  const from = info.head;
  const to = git(root, ['rev-parse', 'FETCH_HEAD']).out;
  if (from === to || isAncestor(root, to, from)) {
    clearCheckState(env);
    return { ok: true, lines: [...lines, `already up to date: cstack ${version(root)}@${short(from)}`], upToDate: true };
  }
  const ahead = git(root, ['log', '--format=%h %s', `${to}..${from}`]).out.split('\n').filter(Boolean);
  if (ahead.length) return stop(`update stopped: the checkout has ${ahead.length} commit${ahead.length === 1 ? '' : 's'} that ${info.remote}/${info.remoteBranch} does not, so it cannot fast-forward, and cstack update never resets your work. Nothing was changed. Push or move them first:\n${ahead.slice(0, 15).map((l) => '  ' + l).join('\n')}`);

  const count = Number(git(root, ['rev-list', '--count', `${from}..${to}`]).out) || 0;
  const news = whatsNew(root, from, to);
  const lockChanged = !git(root, ['diff', '--quiet', from, to, '--', 'package-lock.json', 'package.json']).ok;
  if (dryRun) {
    lines.push(`would update cstack ${version(root)}@${short(from)} → ${short(to)} (${count} commit${count === 1 ? '' : 's'})${lockChanged ? ', then reinstall npm dependencies' : ''}, then refresh the skill links`);
    if (news.length) lines.push('What is new:', ...news.map((n) => `  - ${n}`));
    return { ok: true, lines };
  }

  const oldVersion = version(root);
  const m = git(root, ['merge', '--ff-only', '--quiet', to]);
  if (!m.ok) return stop(`update stopped: git could not fast-forward (${m.err.split('\n')[0]}). Nothing was changed.`);
  lines.push(`updated cstack ${oldVersion}@${short(from)} → ${version(root)}@${short(to)} (${count} commit${count === 1 ? '' : 's'})`);
  const recover = `The code is updated; the previous commit was ${short(from)} (git -C ${JSON.stringify(root)} checkout ${short(from)} goes back to it).`;

  if (lockChanged) {
    const r = spawnSync(npm, ['ci', '--no-audit', '--no-fund'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' } });
    if (r.status !== 0) return stop(`npm dependencies failed to install (${(r.stderr || r.error?.message || '').trim().split('\n').slice(-1)[0]}). Run ./setup in ${root} to finish. ${recover}`);
    lines.push('npm dependencies reinstalled (package-lock.json changed)');
  }

  // relink with the NEW code: this process still runs the old one
  const s = spawnSync(node, [path.join(root, 'bin', 'cstack.mjs'), 'setup', '--refresh'], { cwd: root, encoding: 'utf8', env: process.env });
  if (s.status !== 0) return stop(`refreshing the skill links failed: ${(s.stderr || s.stdout).trim()}. Run ./setup in ${root} to finish. ${recover}`);
  lines.push(...s.stdout.trim().split('\n').filter(Boolean));

  clearCheckState(env);
  try {
    writeJSONFile(file(env, 'just-updated.json'), { from: `${oldVersion}@${short(from)}`, to: `${version(root)}@${short(to)}` });
  } catch {
    // marker is a courtesy
  }
  if (news.length) lines.push('What is new:', ...news.map((n) => `  - ${n}`));
  else lines.push(`No CHANGELOG entries; the commits: git -C ${JSON.stringify(root)} log --oneline ${short(from)}..${short(to)}`);
  return { ok: true, lines, from, to };
}

function clearCheckState(env) {
  for (const n of ['last-update-check.json', 'update-snoozed.json']) fs.rmSync(file(env, n), { force: true });
}

// Installs to refresh after an update: the ones `cstack setup` recorded for this checkout, plus any host folder at
// user scope that already holds cstack's links (installs made before setup kept a record).
export function installsToRefresh({ root = ROOT, env = process.env, hosts = [] } = {}) {
  const real = (p) => {
    try {
      return fs.realpathSync(p);
    } catch {
      return p;
    }
  };
  const mine = readInstalls(env).filter((i) => real(i.checkout) === real(root));
  const out = mine.map((i) => ({ host: i.host, target: i.target ?? undefined, copy: !!i.copy }));
  const home = env.HOME || os.homedir();
  for (const h of hosts) {
    const shared = path.join(home, h.user_dir, 'cstack-shared');
    let ours = false;
    try {
      ours = fs.lstatSync(shared).isSymbolicLink() ? real(shared).startsWith(real(path.join(root, 'skills')) + path.sep) : exists(path.join(shared, '.cstack-installed'));
    } catch {
      ours = false;
    }
    const sameDir = out.some((o) => !o.target && hosts.find((x) => x.id === o.host)?.user_dir === h.user_dir);
    if (ours && !sameDir) out.push({ host: h.id, copy: !fs.lstatSync(shared).isSymbolicLink() });
  }
  return out;
}
