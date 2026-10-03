// Creative strategy layer: import, observations-only report, and the gates on bets, families and plans.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, readJSONL, readData } from '../scripts/lib/core.mjs';
import { validateValue } from '../scripts/lib/schemas.mjs';
import { report, checkBet, checkFamily, checkPlan, mungeWarnings, loadTaxonomy, families } from '../scripts/lib/creative.mjs';
import { parseCSV, rowsToRecords, mapHeaders } from '../providers/evidence/csv.mjs';
import { tmpDir } from './tmp.mjs';

const EX = path.join(ROOT, 'examples', 'tessel-kiln');
const ADS = path.join(EX, 'work', 'ads');
const perf = () => readJSONL(path.join(EX, 'state', 'performance.jsonl'));
const cli = (...a) => execFileSync('node', [path.join(ROOT, 'bin', 'cstack.mjs'), ...a], { encoding: 'utf8' });

test('taxonomy: one family per term, every family says what it is not', () => {
  const tax = loadTaxonomy();
  assert.ok(validateValue('creative-taxonomy', tax).ok);
  const owner = new Map();
  for (const [f, d] of Object.entries(tax.families)) {
    assert.ok(d.is_not.length > 10, f);
    for (const t of d.terms ?? []) {
      assert.ok(!owner.has(t), `"${t}" is in ${owner.get(t)} and ${f}`);
      owner.set(t, f);
    }
  }
});

test('csv: quoted fields, BOM, CRLF and comma decimals parse', () => {
  const rows = parseCSV('﻿Ad name,Amount spent (EUR),Impressions\r\n"Plate, ochre",1.234,56,"10"\r\n');
  assert.deepEqual(rows[1].slice(0, 1), ['Plate, ochre']);
  const r = parseCSV('a,b\n"say ""hi""",2\n');
  assert.equal(r[1][0], 'say "hi"');
});

test('csv: presets map headers, family-named columns become tags, --map wins', () => {
  const fams = families();
  const m = mapHeaders(['Ad name', 'Amount spent (GBP)', 'Impressions', 'format', 'tag:hook tactic', 'Weird'], { preset: 'meta-ads-manager', families: fams });
  assert.deepEqual(Object.values(m), [{ field: 'ad_name' }, { field: 'spend' }, { field: 'impressions' }, { tag: 'format' }, { tag: 'hook_tactic' }]);
  const m2 = mapHeaders(['Creative', 'Cost (USD)', 'Impr'], { map: { ad_name: 'Creative', spend: 'Cost (USD)', impressions: 'Impr' } });
  assert.deepEqual(Object.values(m2).map((x) => x.field), ['ad_name', 'spend', 'impressions']);
  assert.throws(() => rowsToRecords([['Ad name', 'Clicks'], ['a', '1']], { channel: 'meta' }), /no "spend" column/);
  assert.throws(() => rowsToRecords([['Ad name'], ['a']], {}), /channel is required/);
});

test('csv: derived metrics, summary rows skipped, records validate', () => {
  const rows = parseCSV('Ad ID,Ad name,Amount spent (USD),Impressions,Link clicks,Purchases,3-second video plays,ThruPlays,format\nA1,one,100,10000,200,4,3000,900,product demo\nTotal,,100,10000,200,4,,,\n');
  const { records, skipped } = rowsToRecords(rows, { preset: 'meta-ads-manager', channel: 'meta', families: families(), period: '2026-09' });
  assert.equal(records.length, 1);
  assert.equal(skipped[0].reason, 'summary row');
  const m = records[0].metrics;
  assert.equal(m.ctr, 0.02);
  assert.equal(m.cpa, 25);
  assert.equal(m.hook_rate, 0.3);
  assert.equal(m.hold_rate, 0.3);
  assert.equal(records[0].tags.format, 'product demo');
  assert.ok(validateValue('creative-performance', records[0]).ok);
});

test('report: the example export shows its planted confound, concentration and fatigue, as observations only', () => {
  const r = report(perf(), { date: '2026-10-03' });
  assert.equal(r.account.metric, 'cpa');
  const cf = r.confounds.find((c) => c.family === 'format' && c.term === 'creator to camera');
  assert.ok(cf.with.includes('talent=the potter'));
  assert.ok(r.concentration.some((c) => c.family === 'format' && c.share > 0.6));
  assert.deepEqual(r.fatigue.map((f) => f.ref), ['TK-A01']);
  for (const i of r.insights) {
    assert.equal(i.ladder, 'observation');
    assert.ok(validateValue('creative-insight', i).ok, i.id);
    assert.doesNotMatch(i.statement, /\b(drives|causes|caused)\b(?! the difference)/i);
  }
  // the same six ads under format, talent and visual world are one finding, not three
  assert.equal(r.insights.filter((i) => /stronger CPA/.test(i.statement) && i.data.ads === 6).length, 1);
  assert.equal(r.groups.find((g) => g.family === 'format' && g.term === 'behind the scenes').read, 'insufficient');
});

test('report: below the minimums nothing is read', () => {
  const r = report(perf(), { min_ads: 50 });
  assert.equal(r.insights.filter((i) => /correlates/.test(i.statement)).length, 0);
  assert.ok(r.warnings.some((w) => /minimum data/.test(w)));
  assert.ok(r.groups.every((g) => g.read === 'insufficient'));
});

test('insight schema: a learning needs a test, a rule needs a learning-loop promotion', () => {
  const base = { id: 'INS-1', statement: 'x', created: '2026-10-03' };
  assert.ok(validateValue('creative-insight', { ...base, ladder: 'observation' }).ok);
  assert.equal(validateValue('creative-insight', { ...base, ladder: 'learning' }).ok, false);
  assert.ok(validateValue('creative-insight', { ...base, ladder: 'learning', tests: ['B-1'] }).ok);
  assert.equal(validateValue('creative-insight', { ...base, ladder: 'rule', tests: ['B-1'] }).ok, false);
  assert.ok(validateValue('creative-insight', { ...base, ladder: 'rule', tests: ['B-1'], learning_ref: 'LE-1' }).ok);
});

test('bet check: example passes; offer, three families, unlabelled factorial and missing travel reasons fail', () => {
  const bet = readData(path.join(ADS, '2026-10-potter-in-our-light.creative-bet.yaml'));
  const ok = checkBet(bet);
  assert.ok(ok.ok, ok.errors.join('\n'));
  assert.equal(ok.cells, 2);
  assert.equal(ok.min_spend_total, 800);
  const mut = (f) => {
    const b = structuredClone(bet);
    f(b);
    return checkBet(b);
  };
  assert.match(mut((b) => ((b.experiment.hold = ['angle']), (b.experiment.vary = ['format', 'offer']))).errors.join(), /offer varies together/);
  assert.match(mut((b) => ((b.experiment.hold = ['offer']), (b.experiment.vary = ['format', 'hook_tactic', 'talent']))).errors.join(), /varies 3 families/);
  assert.match(mut((b) => ((b.experiment.hold = ['offer']), (b.experiment.vary = ['format', 'hook_tactic']), delete b.experiment.design)).errors.join(), /set design: factorial/);
  const fac = mut((b) => ((b.experiment.hold = ['angle', 'offer']), (b.experiment.vary = ['format', 'hook_tactic']), (b.experiment.design = 'factorial'), (b.experiment.levels = { format: 3, hook_tactic: 2 })));
  assert.ok(fac.ok, fac.errors.join());
  assert.equal(fac.cells, 6);
  assert.match(mut((b) => b.objectives.push('organic_travel')).errors.join(), /travel_reasons/);
  assert.match(mut((b) => (b.experiment.hold = ['angle'])).warnings.join(), /hold the offer/);
  assert.match(mut((b) => (b.status = 'learned')).errors.join(), /status "learned"/);
});

test('taxonomy: a term from another family is flagged', () => {
  const w = mungeWarnings({ hook_tactic: 'street interview', format: 'street interview', mechanic: 'a brand-new word' });
  assert.equal(w.length, 1);
  assert.match(w[0], /hook_tactic "street interview" is a format term/);
  const bet = readData(path.join(ADS, '2026-10-potter-in-our-light.creative-bet.yaml'));
  bet.hook_family.push('product demo');
  assert.match(checkBet(bet).warnings.join(), /"product demo" is a format, not a hook/);
});

test('family check: winner must be the brand\'s own; invariant untouched; rewrites and low diversity flagged', () => {
  const fam = readData(path.join(ADS, '2026-10-one-kiln-load.creative-family.yaml'));
  assert.ok(checkFamily(fam, { performance: perf() }).ok);
  assert.match(checkFamily({ ...fam, winner_ref: 'COMPETITOR-AD-9' }, { performance: perf() }).errors.join(), /brand's own proven ads/);
  const bad = structuredClone(fam);
  bad.variants.push({ id: 'V5', changes: { angle: 'a new angle' } }, { id: 'V6', changes: { verbal_hook: 'reworded', cta: 'learn more' } });
  const r = checkFamily(bad, { performance: perf() });
  assert.match(r.errors.join(), /V5 changes the invariant/);
  assert.match(r.warnings.join(), /V6 only changes verbal_hook and cta/);
  const narrow = structuredClone(fam);
  narrow.variants = ['a', 'b', 'c', 'd'].map((x) => ({ id: x, changes: { format: `f-${x}` } }));
  assert.match(checkFamily(narrow, { performance: perf() }).warnings.join(), /spread them across at least three families/);
});

test('plan check: captures and competitor references never become sources; derive needs a master in the plan', () => {
  const plan = readData(path.join(ADS, '2026-10-week-41.production-plan.yaml'));
  assert.ok(checkPlan(plan).ok);
  const bad = structuredClone(plan);
  bad.assets.push({ id: 'X1', bet: 'B-2026-10-01', experiment_id: 'E', kind: 'static', route: 'edit', sources: ['references/competitors/rival-ad-07.mp4'] });
  bad.assets.push({ id: 'X2', bet: 'B-2026-10-01', experiment_id: 'E', kind: 'static', route: 'generate', sources: ['./work/browse/run1/media/001.jpg'] });
  bad.assets.push({ id: 'X3', bet: 'B-2026-10-01', experiment_id: 'E', kind: 'cutdown', route: 'derive', master: 'NOPE' });
  bad.assets.push({ id: 'X4', bet: 'B-OTHER', experiment_id: 'E', kind: 'cutdown', route: 'generate' });
  const r = checkPlan(bad);
  const e = r.errors.join('\n');
  assert.match(e, /X1 starts from references\/competitors/);
  assert.match(e, /X2 starts from \.\/work\/browse/);
  assert.match(e, /X3 is derived from "NOPE"/);
  assert.match(e, /X4 serves bet "B-OTHER"/);
  assert.match(r.warnings.join(), /cut-down X4 is generated/);
});

test('cli: import is idempotent, report runs, check exits 1 on a bad bet', () => {
  const ws = tmpDir('cstack-creative-');
  cli('brand', 'init', ws, '--name', 'Test Kiln');
  const csv = path.join(ADS, '2026-09-meta-export.csv');
  assert.match(cli('creative', 'import', csv, '--channel', 'meta', '--preset', 'meta-ads-manager', '--currency', 'GBP', '--ws', ws), /imported 16 records/);
  assert.match(cli('creative', 'import', csv, '--channel', 'meta', '--preset', 'meta-ads-manager', '--currency', 'GBP', '--ws', ws), /imported 0 records[\s\S]*already imported/);
  const out = cli('creative', 'report', '--ws', ws, '--write');
  assert.match(out, /OBSERVATION/);
  assert.ok(readJSONL(path.join(ws, 'state', 'insights.jsonl')).length > 3);
  const bad = path.join(ws, 'x.creative-bet.yaml');
  const bet = readData(path.join(ADS, '2026-10-potter-in-our-light.creative-bet.yaml'));
  bet.experiment.vary = ['format', 'offer'];
  fs.writeFileSync(bad, JSON.stringify(bet));
  assert.throws(() => cli('creative', 'check', bad, '--ws', ws), (e) => e.status === 1 && /FAIL/.test(e.stdout));
});

test('example: imported records match the CSV and every growth-creative step names a real skill', () => {
  assert.equal(perf().length, 16);
  const wf = readData(path.join(ROOT, 'workflows', 'growth-creative', 'workflow.yaml'));
  assert.deepEqual(wf.aliases, ['paid-social']);
  for (const s of ['creative-intelligence', 'creative-strategist', 'hook-format-lab', 'winner-scaler', 'asset-factory', 'learn-loop']) assert.ok(wf.steps.some((st) => st.skill === s), s);
});
