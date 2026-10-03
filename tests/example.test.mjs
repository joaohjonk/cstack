// The fictional example workspace (examples/tessel-kiln) must stay valid: it is the demo, the docs and a fixture.
// Read-only: every command here only reads the example (tokens are rebuilt into a temp file, not in place).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { buildCSS } from '../scripts/lib/tokens.mjs';
import { buildGuide } from '../scripts/lib/guide.mjs';
import { tmpDir } from './tmp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WS = path.join(ROOT, 'examples', 'tessel-kiln');
const cli = (...args) => spawnSync(process.execPath, [path.join(ROOT, 'bin', 'cstack.mjs'), ...args], { cwd: ROOT, encoding: 'utf8' });

test('example: brand check passes with an open conflict surfaced', () => {
  const r = cli('brand', 'check', '--ws', WS);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /PASS \(0 errors/);
  assert.match(r.stdout, /1 open conflicts/);
});

test('example: tokens check passes and the built CSS is up to date', () => {
  const r = cli('tokens', 'check', '--ws', WS);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /tokens; PASS/);
  const out = path.join(tmpDir('cstack-ex-'), 'tokens.css');
  buildCSS(WS, { out });
  assert.equal(fs.readFileSync(out, 'utf8'), fs.readFileSync(path.join(WS, 'brand', 'generated', 'tokens.css'), 'utf8'), 'run: cstack tokens build --ws examples/tessel-kiln');
});

test('example: the brand guide is up to date and carries the same context agents read', () => {
  const out = path.join(tmpDir('cstack-ex-'), 'guide.html');
  buildGuide(WS, { out });
  const html = fs.readFileSync(out, 'utf8');
  assert.equal(html, fs.readFileSync(path.join(WS, 'brand', 'generated', 'guide.html'), 'utf8'), 'run: cstack brand guide --ws examples/tessel-kiln');
  const embedded = JSON.parse(html.match(/<script type="application\/json" id="brand-context">(.*?)<\/script>/s)[1]);
  const r = cli('brand', 'context', '--ws', WS);
  assert.deepEqual(embedded.context, JSON.parse(r.stdout));
  const [asFact, notSettled] = html.replace(/<script[\s\S]*?<\/script>/, '').split('<h2>Not settled</h2>');
  assert.doesNotMatch(asFact, /#B8742A/i, 'a value in open conflict never shows as fact');
  assert.match(notSettled, /color\.accent: conflict/);
});

test('example: brand context --task returns the task sections and its files', () => {
  const r = cli('brand', 'context', '--task', 'packaging', '--ws', WS);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const ctx = JSON.parse(r.stdout);
  assert.equal(ctx.task, 'packaging');
  assert.ok(ctx.files.includes('assets/official/swing-tag-print-spec.md'));
  assert.ok(ctx.facts.product_representation && !ctx.facts.voice, 'only the sections the map names');
  assert.equal(cli('brand', 'context', '--task', 'nope', '--ws', WS).status, 1);
  assert.equal(cli('brand', 'context', '--task', 'copy', '--sections', 'voice', '--ws', WS).status, 1);
});

test('example: every prompt recipe compiles', () => {
  const dir = path.join(WS, 'recipes');
  const recipes = fs.readdirSync(dir).filter((f) => f.endsWith('.prompt-recipe.yaml'));
  assert.ok(recipes.length >= 1);
  for (const f of recipes) {
    const r = cli('prompt', 'compile', path.join(dir, f));
    assert.equal(r.status, 0, `${f}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /OK\s*$/);
  }
});

test('example: conflicted and unknown fields never ship as facts', () => {
  const r = cli('brand', 'context', '--ws', WS, '--sections', 'color,claims');
  assert.equal(r.status, 0, r.stderr);
  const ctx = JSON.parse(r.stdout);
  assert.equal(ctx.facts.color.accent, undefined);
  assert.equal(ctx.facts.claims.microwave_safe, undefined);
  assert.ok(ctx.not_facts.some((x) => x.startsWith('color.accent: conflict')));
  assert.ok(ctx.open_conflicts.length >= 1);
});

test('example: references mix gold, anti and distances, with rights and mechanisms', () => {
  const files = ['gold', 'anti'].flatMap((lib) => fs.readdirSync(path.join(WS, 'references', lib)).filter((f) => f.endsWith('.reference.yaml')).map((f) => path.join(WS, 'references', lib, f)));
  const refs = files.map((f) => YAML.parse(fs.readFileSync(f, 'utf8')));
  assert.ok(refs.length >= 4 && refs.length <= 6);
  assert.ok(refs.some((r) => r.library === 'gold') && refs.some((r) => r.library === 'anti'));
  assert.ok(refs.some((r) => r.distance === 'far'));
  for (const r of refs) for (const k of ['source_domain', 'distance', 'transferable_mechanism', 'transfer', 'do_not_copy', 'rights']) assert.ok(r[k], `${r.id} missing ${k}`);
});

test('example: the shipped spend plan costs nothing and the paid what-if is blocked', () => {
  const ok = cli('spend', 'plan', path.join(WS, 'work', 'plans', 'spend-probe.items.json'), '--stop', '3 mock plates', '--ws', WS);
  assert.equal(ok.status, 0, ok.stdout);
  assert.equal(JSON.parse(ok.stdout).estimated_total, 0);
  const paid = cli('spend', 'plan', path.join(WS, 'work', 'plans', 'spend-paid-what-if.items.json'), '--stop', '2 probes', '--ws', WS);
  assert.equal(paid.status, 1);
  assert.equal(JSON.parse(paid.stdout).ok, false);
});

test('quickstart: the lineage, eval and pick examples are valid records (field test F09)', () => {
  const md = fs.readFileSync(path.join(ROOT, 'docs', 'quickstart.md'), 'utf8');
  const blocks = [...md.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]));
  const lineage = blocks.find((b) => b.artifact_id && b.intent_of_change);
  const ev = blocks.find((b) => b.evaluator);
  assert.ok(lineage && ev, 'quickstart shows a lineage and an eval example');
  const dir = tmpDir('cstack-qs-');
  const w = path.join(dir, 'ws');
  assert.equal(cli('brand', 'init', w, '--name', 'Quickstart').status, 0);
  for (const [cmd, rec] of [['lineage', lineage], ['eval', ev]]) {
    const f = path.join(dir, `${cmd}.json`);
    fs.writeFileSync(f, JSON.stringify(rec));
    const r = cli(cmd, '--file', f, '--ws', w);
    assert.equal(r.status, 0, `${cmd}: ${r.stdout}${r.stderr}`);
  }
});
