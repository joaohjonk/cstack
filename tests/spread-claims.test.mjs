// F93: range is counted before the pick. F94: a fixed-price promise is never shown with two prices.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { ROOT } from '../scripts/lib/core.mjs';
import { spreadCheck } from '../scripts/lib/spread.mjs';
import { fixedPrices, claimConflicts } from '../scripts/lib/claims.mjs';
import { tmpDir } from './tmp.mjs';

const CLI = path.join(ROOT, 'bin', 'cstack.mjs');

test('spread: one flavour in 8 of 10 frames fails, a named flavour missing fails, an even spread passes', () => {
  const frame = (flavour, mood) => ({ file: `f-${flavour}.png`, flavour, mood });
  const drift = [...Array(8)].map(() => frame('citrus', 'calm')).concat([frame('cherry', 'calm'), frame('chili', 'loud')]);
  const r = spreadCheck(drift, { by: ['flavour', 'mood'], expect: { flavour: ['citrus', 'cherry', 'chili', 'rose'] } });
  assert.equal(r.ok, false);
  assert.deepEqual(r.fields[0].over.map((o) => [o.value, o.count]), [['citrus', 8]]);
  assert.deepEqual(r.fields[0].missing, ['rose']);
  assert.deepEqual(r.fields[1].over.map((o) => o.value), ['calm'], '9 of 10 calm');
  const even = ['citrus', 'cherry', 'chili', 'rose'].flatMap((f, i) => [frame(f, i % 2 ? 'loud' : 'calm'), frame(f, i % 2 ? 'calm' : 'loud')]);
  assert.equal(spreadCheck(even, { by: ['flavour', 'mood'], expect: { mood: ['calm', 'loud'] } }).ok, true, 'two named moods at 50% each is their fair share');
  assert.equal(spreadCheck(even, { by: ['mood'] }).ok, false, 'without --expect the cap stays at max_share');
  assert.equal(spreadCheck([...Array(10)].map(() => frame('citrus', 'calm')), { by: ['flavour'] }).ok, false, 'one flavour in every frame is drift, never its fair share');
  assert.equal(spreadCheck([], { by: ['flavour'] }).ok, false, 'an empty manifest is not a spread');
  assert.throws(() => spreadCheck(drift, { by: ['flavour'], expect: { mood: ['calm'] } }), /--expect names "mood", which is not in --by/);
  assert.equal(spreadCheck([{ file: 'x' }], { by: ['flavour'] }).ok, false, 'an unlabelled frame cannot be counted');
  assert.throws(() => spreadCheck(drift, {}), /--by <field> required/);
  const d = tmpDir('cstack-spread-');
  fs.writeFileSync(path.join(d, 'frames.yaml'), YAML.stringify({ frames: drift }));
  const cli = spawnSync(process.execPath, [CLI, 'spread', path.join(d, 'frames.yaml'), '--by', 'flavour', '--expect', 'flavour=citrus,cherry,chili,rose'], { encoding: 'utf8' });
  assert.equal(cli.status, 1, cli.stdout + cli.stderr);
  assert.match(cli.stdout, /FAIL flavour: citrus 8, .*citrus takes 80% \(cap 40%\); rose missing/);
});

test('claims conflicts: two "always" prices in one currency fail; one price, or one per currency, passes', async () => {
  assert.deepEqual(fixedPrices('ONE PRICE. $2.99 ALWAYS. Sale $1 today.').map((p) => p.price), ['USD 2.99'], 'a sale price in another sentence is not a promise');
  assert.deepEqual(fixedPrices('Never more than 3 USD').map((p) => p.price), ['USD 3.00']);
  assert.deepEqual(fixedPrices('$2,999 always').map((p) => p.price), ['USD 2999.00'], 'a thousands comma is not a decimal');
  assert.deepEqual(fixedPrices('R$ 1.299,00 sempre').map((p) => p.price), ['BRL 1299.00']);
  assert.deepEqual(fixedPrices('Always $3. Sale: $2 for members').map((p) => p.price), ['USD 3.00'], 'a sentence ends after a price');
  const { copyText } = await import('../scripts/lib/claims.mjs');
  const d0 = tmpDir('cstack-claims-');
  fs.writeFileSync(path.join(d0, 'one.html'), '<p>&#36;2.99 always</p><p>Sale $1 this week</p>');
  assert.deepEqual(fixedPrices(copyText(path.join(d0, 'one.html'))).map((p) => p.price), ['USD 2.99'], 'block tags end a sentence, and entities decode');
  const d = tmpDir('cstack-claims-');
  fs.writeFileSync(path.join(d, 'ad-a.html'), '<h1>$2.99 <b>always</b></h1>');
  fs.writeFileSync(path.join(d, 'ad-b.svg'), '<svg><text>ALWAYS $3.49</text></svg>');
  fs.writeFileSync(path.join(d, 'ad-c.md'), '€ 2,50 sempre.');
  const r = claimConflicts([path.join(d, 'ad-a.html'), path.join(d, 'ad-b.svg'), path.join(d, 'ad-c.md')]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.conflicts, [['USD 2.99', 'USD 3.49']]);
  assert.equal(claimConflicts([path.join(d, 'ad-a.html'), path.join(d, 'ad-c.md')]).ok, true, 'one fixed price per currency');
  const cli = spawnSync(process.execPath, [CLI, 'claims', 'conflicts', path.join(d, 'ad-a.html'), path.join(d, 'ad-b.svg')], { encoding: 'utf8' });
  assert.equal(cli.status, 1, cli.stdout + cli.stderr);
  assert.match(cli.stdout, /FAIL; USD 2\.99 and USD 3\.49 are each promised as the fixed price/);
});

test('flows gate: pack frames without a composite step warn, and the preamble stops on a blocked tool (F92, F95)', async () => {
  const { gateFlow } = await import('../scripts/lib/flows.mjs');
  const { planFromFlow } = await import('../scripts/lib/flows.mjs');
  const w = tmpDir('cstack-f92-');
  const plan = planFromFlow(w, 'brand-hero-photo', { target: 'a campaign frame with the can in a hand at a festival' });
  const fal = [{ id: 'fal', kind: 'media', available: true, missing_env: [] }];
  assert.match(gateFlow(w, plan.file, { stage: 'make', providers: fal }).warnings.join('\n'), /no step composites the verified pack/);
  const w2 = tmpDir('cstack-f92-');
  const share = planFromFlow(w2, 'brand-hero-photo', { target: 'a hero image anyone can share' });
  assert.doesNotMatch(gateFlow(w2, share.file, { stage: 'make', providers: fal }).warnings.join('\n'), /composites the verified pack/, '"can" the verb is not a can');
  const w3 = tmpDir('cstack-f92-');
  const wrap = planFromFlow(w3, 'concept-wrap', { target: 'a flat wrap for the tall can' });
  assert.doesNotMatch(gateFlow(w3, wrap.file, { stage: 'make', providers: fal }).warnings.join('\n'), /composites the verified pack/, 'a flow with a mockup step is exempt');
  assert.match(fs.readFileSync(path.join(ROOT, 'skills', 'cstack-shared', 'PREAMBLE.md'), 'utf8'), /A refused tool stops the step/);
});
