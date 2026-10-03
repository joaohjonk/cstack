// Shot DNA lighting lint (skills/shot-dna/SKILL.md decision rule: adjectives are not lighting decisions).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lintLighting, lintShotDNA, lintShotDNATree, findShotDNAFiles } from '../scripts/lib/lint.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rec = (lighting, extra = {}) => ({ id: 'DNA-t', source: 'proposed', what: 'x', why: 'y', camera: {}, composition: 'c', lighting, transferable_mechanism: 'm', do_not_copy: [], ...extra });

test('lint: adjective-only lighting warns', () => {
  for (const l of ['cinematic, moody', 'Premium editorial lighting', 'soft and beautiful', 'dramatic', 'warm, natural light', 'hard light', 'golden hour glow']) {
    const r = lintShotDNA(rec(l));
    assert.equal(r.ok, false, l);
    assert.equal(r.findings[0].field, 'lighting');
    assert.equal(r.findings[0].level, 'warn');
  }
  assert.match(lintLighting('cinematic, moody').reason, /adjective-only/);
});

test('lint: recipe terms pass, including adjectives next to a recipe', () => {
  for (const l of [
    'large softbox camera-left as key, white bounce fill right',
    'strip light behind for a rim on the bottle edge',
    'octabox overhead, black flag camera-right',
    'soft north window light, scrim on the window',
    'diffusion frame between sun and subject',
    'hard light from camera left, crisp shadow',
    'golden hour sun from behind, contre-jour',
    'mixed 5600K daylight and 3200K tungsten',
    'key to fill 3:1, cinematic',
    'on-camera direct flash, underexposed ambient',
    'backlight through the liquid, polarized product light',
  ]) {
    const r = lintShotDNA(rec(l));
    assert.equal(r.ok, true, `${l}: ${JSON.stringify(r.findings)}`);
    assert.ok(r.recipe_terms.length, l);
  }
});

test('lint: a LIGHT_* recipe id covers terse text but not adjective prose; empty lighting warns', () => {
  assert.equal(lintShotDNA(rec('see recipe', { lighting_recipe: 'LIGHT_flash_underexposed_ambient' })).ok, true);
  assert.equal(lintShotDNA(rec('moody premium', { lighting_recipe: 'LIGHT_flash_underexposed_ambient' })).ok, false);
  assert.equal(lintShotDNA(rec('')).ok, false);
  assert.equal(lintShotDNA(null).ok, false);
});

test('lint: repo records are found and clean; the deliberate test fixture is skipped by the tree walk', () => {
  const files = findShotDNAFiles(ROOT).map((f) => path.relative(ROOT, f));
  assert.ok(files.includes('fixtures/shot-dna/counter-flash.shot-dna.yaml'));
  assert.ok(!files.some((f) => f.startsWith('tests/')));
  assert.deepEqual(lintShotDNATree(ROOT).filter((x) => x.file.startsWith('fixtures/')), []);
});

test('cli: cstack lint shot-dna warns on the adjective fixture (exit 0, --strict exit 1)', () => {
  const bad = path.join(ROOT, 'tests', 'fixtures', 'shot-dna', 'adjective.shot-dna.yaml');
  const out = execFileSync(process.execPath, [path.join(ROOT, 'bin', 'cstack.mjs'), 'lint', 'shot-dna', bad], { encoding: 'utf8' });
  assert.match(out, /WARN .*adjective-only lighting/);
  assert.throws(() => execFileSync(process.execPath, [path.join(ROOT, 'bin', 'cstack.mjs'), 'lint', 'shot-dna', bad, '--strict'], { stdio: 'pipe' }));
});
