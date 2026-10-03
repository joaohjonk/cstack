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
