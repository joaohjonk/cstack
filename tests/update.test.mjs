// cstack update: the check is cheap and quiet, the update only fast-forwards and never discards the owner's work,
// and every host the checkout was installed into is relinked by the new code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../scripts/lib/core.mjs';
import { checkForUpdate, runUpdate, snooze, setConfig, readInstalls, installsToRefresh } from '../scripts/lib/update.mjs';
import { hostIds, loadHosts } from '../scripts/lib/hosts.mjs';

const g = (cwd, ...a) => {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'init.defaultBranch=main', ...a], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${a.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const write = (p, s) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s);
};

// A tiny cstack-shaped repo: its bin/cstack.mjs only records how it was called, so no npm install is needed.
function fixture(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cstack-update-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const work = path.join(tmp, 'work');
  write(path.join(work, 'package.json'), '{ "name": "cstack", "version": "0.1.0" }\n');
  write(path.join(work, 'package-lock.json'), '{}\n');
  write(path.join(work, 'CHANGELOG.md'), '# Changelog\n\n## Unreleased\n\n- **First thing.** Old news.\n');
  write(path.join(work, 'bin', 'cstack.mjs'), "import fs from 'node:fs';\nfs.appendFileSync(new URL('../calls.log', import.meta.url), process.argv.slice(2).join(' ') + '\\n');\nconsole.log('linked 1 skills → somewhere (Stub)');\n");
  write(path.join(work, '.gitignore'), 'calls.log\n');
  g(tmp, 'init', '-q', 'work');
  g(work, 'add', '.');
  g(work, 'commit', '-qm', 'one');
  g(tmp, 'clone', '-q', '--bare', 'work', 'origin.git');
  g(work, 'remote', 'add', 'origin', path.join(tmp, 'origin.git'));
  g(tmp, 'clone', '-q', 'origin.git', 'install');
  const install = path.join(tmp, 'install');
  const env = { HOME: tmp, CSTACK_HOME: path.join(tmp, 'state') };
  const publish = (msg, edit) => {
    edit();
    g(work, 'add', '.');
    g(work, 'commit', '-qm', msg);
    g(work, 'push', '-q', 'origin', 'HEAD:main');
  };
  return { tmp, work, install, env, publish };
}

test('update check: quiet when current, one line when the remote moved, snooze and off silence it, --force still answers', (t) => {
  const { install, env, publish, work } = fixture(t);
  assert.deepEqual(checkForUpdate({ root: install, env }), []);
  assert.match(checkForUpdate({ root: install, env, force: true })[0], /^UP_TO_DATE 0\.1\.0@[0-9a-f]{7}$/);

  publish('two', () => fs.appendFileSync(path.join(work, 'CHANGELOG.md'), '- **Second thing.** New.\n'));
  // the up-to-date answer is cached for an hour; a forced check sees the new commit at once
  assert.deepEqual(checkForUpdate({ root: install, env }), []);
  const line = checkForUpdate({ root: install, env, force: true })[0];
  assert.match(line, /^UPDATE_AVAILABLE 0\.1\.0@[0-9a-f]{7} [0-9a-f]{7}$/);
  assert.equal(checkForUpdate({ root: install, env })[0], line, 'the cached answer repeats');

  assert.deepEqual(snooze({ env }), { snoozed: true, hours: 24 });
  assert.deepEqual(checkForUpdate({ root: install, env }), []);
  assert.deepEqual(snooze({ env }), { snoozed: true, hours: 48 });
  assert.equal(checkForUpdate({ root: install, env, now: Date.now() + 49 * 3600000 })[0], line, 'reminds again after the snooze');

  setConfig('auto_update', true, env);
  assert.match(checkForUpdate({ root: install, env, force: true })[0], / auto$/);
  setConfig('update_check', false, env);
  assert.deepEqual(checkForUpdate({ root: install, env, now: Date.now() + 49 * 3600000 }), []);
});

test('update check: an unreachable remote is CHECK_FAILED, never up to date', (t) => {
  const { install, env } = fixture(t);
  g(install, 'remote', 'set-url', 'origin', path.join(os.tmpdir(), 'no-such-cstack-remote.git'));
  assert.deepEqual(checkForUpdate({ root: install, env }), []);
  assert.match(checkForUpdate({ root: install, env, force: true })[0], /^CHECK_FAILED could not read /);
});

test('update: refuses dirty files and local commits without changing anything', (t) => {
  const { install, env, publish, work } = fixture(t);
  publish('two', () => fs.appendFileSync(path.join(work, 'CHANGELOG.md'), '- **Second thing.** New.\n'));
  const head = g(install, 'rev-parse', 'HEAD');

  fs.appendFileSync(path.join(install, 'CHANGELOG.md'), 'my note\n');
  let r = runUpdate({ root: install, env, npm: 'false' });
  assert.equal(r.ok, false);
  assert.match(r.lines.at(-1), /never stashes or discards[\s\S]*M CHANGELOG\.md/);
  assert.equal(g(install, 'rev-parse', 'HEAD'), head);
  assert.match(fs.readFileSync(path.join(install, 'CHANGELOG.md'), 'utf8'), /my note/, 'the edit survives');
  g(install, 'checkout', '--', 'CHANGELOG.md');

  write(path.join(install, 'mine.txt'), 'x');
  g(install, 'add', 'mine.txt');
  g(install, 'commit', '-qm', 'my local commit');
  const mine = g(install, 'rev-parse', 'HEAD');
  r = runUpdate({ root: install, env, npm: 'false' });
  assert.equal(r.ok, false);
  assert.match(r.lines.at(-1), /1 commit that origin\/main does not[\s\S]*my local commit/);
  assert.equal(g(install, 'rev-parse', 'HEAD'), mine);
});

test('update: fast-forwards, relinks with the new code, reinstalls only when the lockfile changed, shows what is new', (t) => {
  const { install, env, publish, work } = fixture(t);
  publish('two', () => fs.appendFileSync(path.join(work, 'CHANGELOG.md'), '- **Second thing.** New.\n- plain bullet\n'));
  const before = g(install, 'rev-parse', 'HEAD');

  const dry = runUpdate({ root: install, env, npm: 'false', dryRun: true });
  assert.ok(dry.ok, dry.lines.join('\n'));
  assert.ok(dry.lines.some((l) => /^would update cstack 0\.1\.0@\w{7} → \w{7} \(1 commit\), then refresh/.test(l)), dry.lines.join('\n'));
  assert.equal(g(install, 'rev-parse', 'HEAD'), before, 'dry run changes nothing');

  const r = runUpdate({ root: install, env, npm: 'false' }); // npm must not run: the lockfile did not change
  assert.ok(r.ok, r.lines.join('\n'));
  assert.equal(g(install, 'rev-parse', 'HEAD'), g(work, 'rev-parse', 'HEAD'));
  assert.deepEqual(r.lines.slice(r.lines.indexOf('What is new:')), ['What is new:', '  - Second thing', '  - plain bullet']);
  assert.equal(fs.readFileSync(path.join(install, 'calls.log'), 'utf8'), 'setup --refresh\n');
  assert.ok(r.lines.includes('linked 1 skills → somewhere (Stub)'));
  assert.match(checkForUpdate({ root: install, env })[0], /^JUST_UPDATED 0\.1\.0@\w{7} 0\.1\.0@\w{7}$/);
  assert.deepEqual(checkForUpdate({ root: install, env }), [], 'the news is told once');
  assert.match(runUpdate({ root: install, env, npm: 'false' }).lines.at(-1), /^already up to date/);

  publish('three', () => write(path.join(work, 'package-lock.json'), '{ "lockfileVersion": 3 }\n'));
  const r2 = runUpdate({ root: install, env, npm: 'true' });
  assert.ok(r2.lines.includes('npm dependencies reinstalled (package-lock.json changed)'), r2.lines.join('\n'));
  const r3fail = (() => {
    publish('four', () => write(path.join(work, 'package-lock.json'), '{ "lockfileVersion": 4 }\n'));
    return runUpdate({ root: install, env, npm: 'false' });
  })();
  assert.equal(r3fail.ok, false);
  assert.match(r3fail.lines.at(-1), /Run \.\/setup .* the previous commit was \w{7}/);
});

test('setup records what it installed, and --refresh relinks exactly those hosts', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cstack-home-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const env = { ...process.env, HOME: home, CSTACK_HOME: '' };
  const cli = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'bin', 'cstack.mjs'), ...a], { encoding: 'utf8', env });
  const r = cli('setup', '--host', 'claude-code');
  assert.equal(r.status, 0, r.stderr);
  const installs = readInstalls({ HOME: home });
  assert.deepEqual(installs.map((i) => [i.host, i.target, i.checkout]), [['claude-code', null, ROOT]]);
  assert.equal(fs.readFileSync(path.join(home, '.cstack', 'checkout'), 'utf8').trim(), ROOT);

  fs.rmSync(path.join(home, '.claude', 'skills', 'brief'));
  const again = cli('setup', '--refresh');
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /linked \d+ skills .*\(Claude Code\)/);
  assert.doesNotMatch(again.stdout, /\.agents/, 'only the recorded host');
  assert.ok(fs.existsSync(path.join(home, '.claude', 'skills', 'brief', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(home, '.claude', 'skills', 'cstack-update', 'SKILL.md')));
});

test('an install made before setup kept a record is still found and refreshed', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cstack-home-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(path.join(home, '.agents', 'skills'), { recursive: true });
  fs.symlinkSync(path.join(ROOT, 'skills', 'cstack-shared'), path.join(home, '.agents', 'skills', 'cstack-shared'), 'dir');
  const jobs = installsToRefresh({ env: { HOME: home, CSTACK_HOME: path.join(home, 'state') }, hosts: loadHosts() });
  assert.deepEqual(jobs, [{ host: 'agents', copy: false }], 'codex shares the folder, so it is refreshed once');
});

test('setup auto adds the hosts whose folders exist in the home', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cstack-home-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  assert.deepEqual(hostIds('auto', home), ['agents', 'claude-code']);
  fs.mkdirSync(path.join(home, '.kiro'));
  fs.mkdirSync(path.join(home, '.copilot'));
  assert.deepEqual(hostIds('auto', home), ['agents', 'claude-code', 'copilot', 'kiro']);
});
