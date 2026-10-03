// Install canonical skills/ into agent hosts. Host paths are data (registry/hosts.json), not code,
// so a host that moves its skills folder is a one-line registry change.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ROOT, exists, readJSON } from './core.mjs';
import { listSkills } from './skills.mjs';

export function loadHosts() {
  return readJSON(path.join(ROOT, 'registry', 'hosts.json')).hosts;
}

export function defaultHosts() {
  return readJSON(path.join(ROOT, 'registry', 'hosts.json')).default ?? ['agents', 'claude-code'];
}

// host: 'default' (agents + claude-code), 'all', or one id. Directories that resolve to the same path are installed once.
const MARK = '.cstack-installed';

export function installHosts({ host = 'default', target, copy = false, dryRun = false } = {}) {
  const hosts = loadHosts();
  const ids = host === 'default' ? defaultHosts() : host === 'all' ? hosts.map((h) => h.id) : [host];
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
    for (const s of skills) {
      const dst = path.join(base, s.slug);
      if (exists(dst)) {
        const ours = fs.lstatSync(dst).isSymbolicLink() || exists(path.join(dst, MARK));
        if (!ours) {
          log.push(`skip ${dst} (exists and was not installed by cstack; never overwritten)`);
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
      if (exists(sharedDst) && !fs.lstatSync(sharedDst).isSymbolicLink() && !exists(path.join(sharedDst, MARK))) {
        log.push(`skip ${sharedDst} (exists and was not installed by cstack)`);
      } else fs.rmSync(sharedDst, { recursive: true, force: true });
      if (!exists(sharedDst)) {
        if (copy) {
          fs.cpSync(shared, sharedDst, { recursive: true });
          fs.writeFileSync(path.join(sharedDst, MARK), 'installed by cstack setup --copy\n');
        } else fs.symlinkSync(shared, sharedDst, 'dir');
      }
    }
    log.push(`${dryRun ? 'would install' : copy ? 'copied' : 'linked'} ${skills.length} skills → ${base} (${h.name})`);
  }
  return log;
}
