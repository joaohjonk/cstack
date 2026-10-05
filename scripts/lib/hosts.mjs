// Install canonical skills/ into agent hosts. Host paths are data (registry/hosts.json), not code,
// so a host that moves its skills folder is a one-line registry change.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ROOT, exists, readJSON, shown } from './core.mjs';
import { listSkills } from './skills.mjs';

export function loadHosts() {
  return readJSON(path.join(ROOT, 'registry', 'hosts.json')).hosts;
}

export function defaultHosts() {
  return readJSON(path.join(ROOT, 'registry', 'hosts.json')).default ?? ['agents', 'claude-code'];
}

// host: 'default' (agents + claude-code), 'auto', 'all', or one id. Directories that resolve to the same path are installed once.
const MARK = '.cstack-installed';

// Ours = a copy carrying the marker, or a symlink into this checkout's skills/. Another toolkit's
// same-named skill (directory or symlink) is never touched.
function isOurs(dst) {
  if (exists(path.join(dst, MARK))) return true;
  if (!fs.lstatSync(dst).isSymbolicLink()) return false;
  try {
    return fs.realpathSync(dst).startsWith(fs.realpathSync(path.join(ROOT, 'skills')) + path.sep);
  } catch {
    // dangling link, e.g. the checkout moved: ours if it pointed at a cstack-shaped skills/<name>
    return fs.readlinkSync(dst).endsWith(path.join('skills', path.basename(dst)));
  }
}

// A symlink into another cstack checkout's skills/ (an older clone, a moved folder): cstack's own link, but it runs that
// checkout's skills next to this CLI. Returns that checkout's root, or null.
function otherCheckout(dst) {
  if (!isLink(dst)) return null;
  let real;
  try {
    real = fs.realpathSync(dst);
  } catch {
    return null; // dangling: isOurs() handles it
  }
  const root = path.dirname(path.dirname(real));
  if (path.basename(path.dirname(real)) !== 'skills' || !exists(path.join(root, 'bin', 'cstack.mjs'))) return null;
  return fs.realpathSync(root) === fs.realpathSync(ROOT) ? null : root;
}

function isLink(p) {
  try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; }
}

// 'auto': the default hosts plus every host whose detect folder (~/.copilot, ~/.kiro, ...) exists in this home.
export function hostIds(host = 'default', home = os.homedir()) {
  const hosts = loadHosts();
  if (host === 'default') return defaultHosts();
  if (host === 'all') return hosts.map((h) => h.id);
  if (host === 'auto') return [...defaultHosts(), ...hosts.filter((h) => h.detect && exists(path.join(home, h.detect))).map((h) => h.id)];
  return [host];
}

export function installHosts({ host = 'default', target, copy = false, dryRun = false } = {}) {
  const hosts = loadHosts();
  const ids = hostIds(host);
  const seen = new Set();
  const chosen = hosts.filter((h) => ids.includes(h.id)).filter((h) => {
    const k = target ? h.project_dir : h.user_dir;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!chosen.length) throw new Error(`unknown host "${host}" (known: ${hosts.map((h) => h.id).join(', ')})`);
  const skills = listSkills();
  const log = [];
  for (const h of chosen) {
    const base = target ? path.join(target, h.project_dir) : path.join(os.homedir(), h.user_dir);
    const skipped = [];
    const others = new Map(); // other checkout root -> slugs relinked here
    const note = (root, slug) => others.set(root, [...(others.get(root) ?? []), slug]);
    for (const s of skills) {
      const dst = path.join(base, s.slug);
      if (exists(dst) || isLink(dst)) {
        const other = otherCheckout(dst);
        if (other) note(other, s.slug);
        else if (!isOurs(dst)) {
          skipped.push(s.slug);
          continue;
        }
        if (!dryRun) fs.rmSync(dst, { recursive: true, force: true });
      }
      if (!dryRun) {
        fs.mkdirSync(base, { recursive: true });
        if (copy) {
          fs.cpSync(s.dir, dst, { recursive: true });
          fs.writeFileSync(path.join(dst, MARK), 'installed by cstack setup --copy; safe for cstack to replace\n');
        } else fs.symlinkSync(s.dir, dst, 'dir');
      }
    }
    // shared preamble travels with the skills
    const shared = path.join(ROOT, 'skills', 'cstack-shared');
    const sharedDst = path.join(base, 'cstack-shared');
    // cstack-shared has no SKILL.md, so skill scanners ignore it; skills reference it as ../cstack-shared/
    if (exists(shared) && !dryRun) {
      if ((exists(sharedDst) || isLink(sharedDst)) && !isOurs(sharedDst) && !otherCheckout(sharedDst)) {
        log.push(`skip ${sharedDst} (exists and was not installed by cstack)`);
      } else fs.rmSync(sharedDst, { recursive: true, force: true });
      if (!exists(sharedDst) && !isLink(sharedDst)) {
        if (copy) {
          fs.cpSync(shared, sharedDst, { recursive: true });
          fs.writeFileSync(path.join(sharedDst, MARK), 'installed by cstack setup --copy\n');
        } else fs.symlinkSync(shared, sharedDst, 'dir');
      }
    }
    // skills an older checkout linked that this one no longer has (renamed or removed): they would still answer
    const current = new Set([...skills.map((s) => s.slug), 'cstack-shared']);
    const gone = [];
    for (const name of exists(base) ? fs.readdirSync(base) : []) {
      const dst = path.join(base, name);
      if (current.has(name) || !isLink(dst)) continue;
      const other = otherCheckout(dst);
      let mine = false;
      try {
        mine = !other && fs.realpathSync(dst).startsWith(fs.realpathSync(path.join(ROOT, 'skills')) + path.sep);
      } catch {
        mine = path.resolve(base, fs.readlinkSync(dst)).startsWith(path.join(ROOT, 'skills') + path.sep); // dangling into this checkout
      }
      if (!other && !mine) continue;
      gone.push(name);
      if (!dryRun) fs.rmSync(dst, { force: true });
    }
    log.push(`${dryRun ? 'would install' : copy ? 'copied' : 'linked'} ${skills.length - skipped.length} skills → ${shown(base)} (${h.name})`);
    for (const [root, slugs] of others) log.push(`${dryRun ? 'would replace' : 'replaced'} ${slugs.length} link${slugs.length === 1 ? '' : 's'} that ran skills from another cstack checkout (${shown(root)}); they now run this one`);
    if (gone.length) log.push(`${dryRun ? 'would remove' : 'removed'} ${gone.length} skill link${gone.length === 1 ? '' : 's'} this checkout no longer has: ${gone.join(', ')}`);
    if (skipped.length) log.push(`WARN skipped ${skipped.length} (a skill with that name exists and was not installed by cstack; it will answer instead): ${skipped.join(', ')}`);
  }
  return log;
}
