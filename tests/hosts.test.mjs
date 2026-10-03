// setup must never replace another toolkit's same-named skill, folder or symlink, and must say which it skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installHosts } from '../scripts/lib/hosts.mjs';
import { listSkills } from '../scripts/lib/skills.mjs';

test('installHosts: foreign folder and foreign symlink are untouched and named; our links are replaced', (t) => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'cstack-hosts-'));
  t.after(() => fs.rmSync(target, { recursive: true, force: true }));
  const base = path.join(target, '.claude', 'skills');
  const elsewhere = path.join(target, 'other-toolkit');
  const [a, b] = listSkills().map((s) => s.slug);
  fs.mkdirSync(path.join(elsewhere, b), { recursive: true });
  fs.mkdirSync(path.join(base, a), { recursive: true });
  fs.writeFileSync(path.join(base, a, 'SKILL.md'), 'foreign');
  fs.symlinkSync(path.join(elsewhere, b), path.join(base, b), 'dir');

  const log = installHosts({ host: 'claude-code', target });
  assert.equal(fs.readFileSync(path.join(base, a, 'SKILL.md'), 'utf8'), 'foreign');
  assert.equal(fs.readlinkSync(path.join(base, b)), path.join(elsewhere, b));
  const warn = log.find((l) => l.startsWith('WARN skipped 2'));
  assert.ok(warn && warn.includes(a) && warn.includes(b), log.join('\n'));
  assert.ok(log.some((l) => l.startsWith(`linked ${listSkills().length - 2} skills`)));

  // re-run: our own symlinks are recognised and replaced, still no crash
  const again = installHosts({ host: 'claude-code', target });
  assert.ok(again.some((l) => l.startsWith(`linked ${listSkills().length - 2} skills`)), again.join('\n'));
});

test('installHosts: re-run after the checkout moved replaces our dangling links instead of crashing', (t) => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'cstack-hosts-'));
  t.after(() => fs.rmSync(target, { recursive: true, force: true }));
  const base = path.join(target, '.claude', 'skills');
  fs.mkdirSync(base, { recursive: true });
  for (const s of [...listSkills().map((x) => x.slug), 'cstack-shared']) fs.symlinkSync(path.join(target, 'old-checkout', 'skills', s), path.join(base, s), 'dir');
  const log = installHosts({ host: 'claude-code', target });
  assert.ok(log.some((l) => l.startsWith(`linked ${listSkills().length} skills`)), log.join('\n'));
  assert.ok(fs.existsSync(path.join(base, 'cstack-shared', 'PREAMBLE.md')));
});

test('installHosts: links into an older cstack checkout are replaced, and its skills this checkout lacks are removed', (t) => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'cstack-hosts-'));
  t.after(() => fs.rmSync(target, { recursive: true, force: true }));
  const base = path.join(target, '.claude', 'skills');
  const old = path.join(target, 'old cstack & co');
  const slugs = listSkills().map((s) => s.slug);
  fs.mkdirSync(path.join(old, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(old, 'bin', 'cstack.mjs'), '');
  fs.mkdirSync(base, { recursive: true });
  for (const s of [...slugs.slice(0, 25), 'office-hours', 'cstack-shared']) {
    fs.mkdirSync(path.join(old, 'skills', s), { recursive: true });
    fs.symlinkSync(path.join(old, 'skills', s), path.join(base, s), 'dir');
  }
  // gstack's own office-hours elsewhere must survive; only cstack checkouts are cleaned
  const gstack = path.join(target, 'gstack', 'office-hours');
  fs.mkdirSync(gstack, { recursive: true });
  fs.symlinkSync(gstack, path.join(base, 'gstack-office-hours'), 'dir');

  const dry = installHosts({ host: 'claude-code', target, dryRun: true });
  assert.ok(dry.some((l) => l.startsWith('would replace 25 links')), dry.join('\n'));
  assert.equal(fs.readlinkSync(path.join(base, slugs[0])), path.join(old, 'skills', slugs[0]), 'dry run changes nothing');

  const log = installHosts({ host: 'claude-code', target });
  assert.ok(log.some((l) => l.startsWith(`linked ${slugs.length} skills`)), log.join('\n'));
  assert.ok(log.some((l) => l.startsWith('replaced 25 links') && l.includes("'" + old)), log.join('\n'));
  assert.ok(log.some((l) => l === 'removed 1 skill link this checkout no longer has: office-hours'), log.join('\n'));
  for (const s of slugs) assert.ok(fs.realpathSync(path.join(base, s)).endsWith(path.join('skills', s)) && !fs.realpathSync(path.join(base, s)).startsWith(fs.realpathSync(old)));
  assert.ok(!fs.existsSync(path.join(base, 'office-hours')));
  assert.ok(fs.existsSync(path.join(base, 'gstack-office-hours')));
  assert.ok(fs.existsSync(path.join(base, 'cstack-shared', 'PREAMBLE.md')));
});

test('./setup takes the host as a word or as --host, and refuses unknown options (field test F01)', async () => {
  const { spawnSync } = await import('node:child_process');
  const { ROOT } = await import('../scripts/lib/core.mjs');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cstack-setup-'));
  try {
    const run = (...a) => spawnSync('bash', [path.join(ROOT, 'setup'), ...a], { encoding: 'utf8', env: { ...process.env, HOME: home, CSTACK_SETUP_DRY_RUN: '1' } });
    for (const a of [['claude-code'], ['--host', 'claude-code'], ['--host=claude-code']]) {
      const r = run(...a);
      assert.equal(r.status, 0, `${a.join(' ')}: ${r.stdout}${r.stderr}`);
      assert.match(r.stdout, /would install \d+ skills .*\(Claude Code\)/);
      assert.match(r.stdout, /alias cstack='node ".*\/bin\/cstack\.mjs"'/);
    }
    assert.equal(run('--hots', 'x').status, 1);
    assert.equal(run('--host').status, 1);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
