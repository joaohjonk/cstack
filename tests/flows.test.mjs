import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { spawnSync } from 'node:child_process';
import { listFlows, searchFlows, planFromFlow, checkFlow, checkFlowFile } from '../scripts/lib/flows.mjs';
import { ROOT } from '../scripts/lib/core.mjs';
import { tmpDir } from './tmp.mjs';
import { validateValue } from '../scripts/lib/schemas.mjs';

const flow = (id, outcome, last_verified, extra = {}) => ({
  id, outcome, status: 'researched', last_verified, stale_after_days: 30,
  steps: [{ id: 's1', does: 'probe', kind: 'probe', gate: { type: 'owner' }, compare_to_target: 'side by side with the reference' }],
  evidence: [{ ref: 'https://example.com/doc', kind: 'documented', date: last_verified }], ...extra,
});
const followable = (id, last_verified) => flow(id, 'short product film', last_verified, {
  target: { description: 'library default target' },
  candidates_considered: [{ name: 'stills then motion', verdict: 'chosen' }, { name: 'text to video one shot', verdict: 'rejected', why: 'label drifts' }],
  cost_ladder: 'probes at draft tier; stop after two failed probe rounds',
});
const workspace = () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'cstack-flows-'));
  fs.mkdirSync(path.join(ws, 'flows'));
  return ws;
};
const write = (ws, f) => fs.writeFileSync(path.join(ws, 'flows', `${f.id}.flow.yaml`), YAML.stringify(f));
const today = new Date().toISOString().slice(0, 10);

test('flows: search, staleness, plan', () => {
  const ws = workspace();
  const f1 = flow('rotating-hero-test', 'rotating 3d product hero on a web page', '2020-01-01', { aliases: ['turntable'] });
  const f2 = followable('film-test', today);
  for (const f of [f1, f2]) {
    assert.ok(validateValue('flow', f).ok, validateValue('flow', f).errors);
    write(ws, f);
  }
  const all = listFlows(ws).filter((f) => f.scope === 'workspace');
  assert.equal(all.find((f) => f.id === 'rotating-hero-test').stale, true);
  assert.equal(all.find((f) => f.id === 'film-test').stale, false);
  // the library flows compete for the same request, so only ask that the workspace flow is found
  const hits = searchFlows(ws, 'make the product rotate in 3d on the homepage', { k: 50 }).map((r) => r.flow.id);
  assert.ok(hits.includes('rotating-hero-test'), hits.join(', '));
  const r = planFromFlow(ws, 'film-test', { target: 'like the reference, 15s, 9:16' });
  const plan = YAML.parse(fs.readFileSync(r.file, 'utf8'));
  assert.equal(plan.status, 'plan');
  assert.equal(plan.target.description, 'like the reference, 15s, 9:16');
  assert.ok(validateValue('flow', plan).ok);
  assert.throws(() => planFromFlow(ws, 'film-test'), /already exists/);
});

test('flows: a workspace flow with a library id overrides the library flow', () => {
  const ws = workspace();
  const lib = listFlows(ws).find((f) => f.id === '3d-web-hero');
  assert.equal(lib?.scope, 'cstack');
  write(ws, flow('3d-web-hero', 'our own rotating hero method', today));
  const same = listFlows(ws).filter((f) => f.id === '3d-web-hero');
  assert.equal(same.length, 1);
  assert.equal(same[0].scope, 'workspace');
  assert.equal(same[0].outcome, 'our own rotating hero method');
});

test('flows check: a plan must compare options, gate steps, compare to target, stop, and state its target', () => {
  const ok = { ...followable('x', today), status: 'plan', target: { description: 'like the reference, 15s, 9:16, label legible' } };
  assert.deepEqual(checkFlow(ok).errors, []);
  const one = { ...ok, candidates_considered: [ok.candidates_considered[0]] };
  assert.match(checkFlow(one).errors.join('\n'), /at least 2/);
  const ungated = { ...ok, steps: [{ id: 's1', does: 'render', kind: 'generative', compare_to_target: 'side by side' }] };
  assert.match(checkFlow(ungated).errors.join('\n'), /no gate/);
  const blind = { ...ok, steps: [{ id: 's1', does: 'render', kind: 'generative', gate: { type: 'owner' } }] };
  assert.match(checkFlow(blind).errors.join('\n'), /compare_to_target/);
  const endless = { ...ok, cost_ladder: undefined };
  assert.match(checkFlow(endless).errors.join('\n'), /cost_ladder/);
  assert.match(checkFlow({ ...ok, target: {} }).errors.join('\n'), /target\.description/);
  assert.match(checkFlow({ ...ok, steps: [{ ...ok.steps[0], skill: 'nope' }] }, { skills: ['copywriting'] }).errors.join('\n'), /unknown skill "nope"/);
  // a comma inside an unquoted YAML flow mapping silently splits a value into stray keys
  const stray = YAML.parse('{type: owner, check: continuity board, hands and faces}');
  assert.match(checkFlow({ ...ok, steps: [{ ...ok.steps[0], gate: stray }] }).errors.join('\n'), /schema/);
});

test('flows check: a plan still carrying the library target has not stated this run\'s target', () => {
  const ws = workspace();
  write(ws, followable('film-test', today));
  const kept = planFromFlow(ws, 'film-test');
  assert.match(checkFlowFile(ws, kept.file).errors.join('\n'), /library wording/);
  fs.rmSync(kept.file);
  const stated = planFromFlow(ws, 'film-test', { target: 'like the reference, 15s, 9:16, label legible' });
  assert.deepEqual(checkFlowFile(ws, stated.file).errors, []);
  assert.match(checkFlowFile(ws, path.join(ws, 'work', 'flows', 'missing.flow.yaml')).errors[0], /no such file/);
});

test('flows check: every library flow passes', () => {
  for (const f of listFlows(null)) {
    const { file, scope, age_days, stale, ...data } = f;
    assert.deepEqual(checkFlow(data).errors, [], file);
  }
});

test('flows search offers the workflows that cover an outcome (field test F10)', async () => {
  const { searchWorkflows } = await import('../scripts/lib/flows.mjs');
  assert.equal(searchWorkflows('identity')[0]?.workflow.id, 'create-brand');
  assert.deepEqual(searchWorkflows('zzzz nothing'), []);
});

test('flows check: a hand copy of a library flow is not a plan, and an untouched plan warns (field test F11)', () => {
  const w = tmpDir('cstack-f11-');
  fs.mkdirSync(path.join(w, 'work', 'flows'), { recursive: true });
  const copy = path.join(w, 'work', 'flows', 'copy.flow.yaml');
  fs.copyFileSync(path.join(ROOT, 'flows', 'logo-system.flow.yaml'), copy);
  const c = checkFlowFile(w, copy);
  assert.ok(c.errors.some((e) => /must have status: plan.*unchanged copy of the "logo-system" library flow/.test(e)), c.errors.join('\n'));
  const { file } = planFromFlow(w, 'logo-system', { target: 'a mark for a ceramics studio that reads at 16 px' });
  const p = checkFlowFile(w, file);
  assert.equal(p.errors.length, 0, p.errors.join('\n'));
  assert.ok(p.warnings.some((x) => /unchanged from "logo-system"/.test(x)));
});

test('flows gate: imagery without a usable media provider stops instead of degrading (make)', async () => {
  const { gateFlow } = await import('../scripts/lib/flows.mjs');
  const w = tmpDir('cstack-gate-');
  const { file } = planFromFlow(w, 'logo-system', { target: 'a hero image for the home page that reads at phone width' });
  const edit = (patch) => fs.writeFileSync(file, YAML.stringify({ ...YAML.parse(fs.readFileSync(file, 'utf8')), ...patch }));
  const none = [{ id: 'mock', kind: 'media', available: true }, { id: 'fal', kind: 'media', available: false, missing_env: ['FAL_KEY'] }];
  const fal = [{ id: 'fal', kind: 'media', available: true, missing_env: [] }];
  edit({ deliverable: undefined }); // a hand-written plan without one
  assert.match(gateFlow(w, file, { providers: fal }).errors.join('\n'), /deliverable\.kind/);
  edit({ deliverable: { kind: 'image', key_visual: true } });
  const blocked = gateFlow(w, file, { providers: none });
  assert.match(blocked.errors.join('\n'), /needs generation, and no media provider is usable here \(fal: FAL_KEY not set\): run this where the keys live/);
  assert.deepEqual(gateFlow(w, file, { providers: fal }).errors, []);
  assert.doesNotMatch(gateFlow(w, file, { stage: 'final', providers: none, budget: null }).errors.join('\n'), /needs generation/, 'decide and final judge files already made: no provider needed (finding 12)');
  // a zero or missing budget stops the same way (field test: a zero budget must not fall back to a free method)
  assert.match(gateFlow(w, file, { providers: fal, budget: { per_run: 0, per_day: 0 } }).errors.join('\n'), /budget here is per_run 0, per_day 0: ask the owner for a budget/);
  assert.match(gateFlow(w, file, { providers: fal, budget: null }).errors.join('\n'), /budget here is not set/);
  assert.deepEqual(gateFlow(w, file, { providers: fal, budget: { per_run: 2, per_day: 5 } }).errors, []);
  edit({ deliverable: { kind: 'image', substitute: { to: 'vector figure', owner_approved: '2026-10-03' } } });
  const sub = gateFlow(w, file, { providers: none });
  assert.deepEqual(sub.errors, []);
  assert.match(sub.warnings.join('\n'), /making it as vector figure instead of generating it/);
  edit({ deliverable: { kind: 'vector' } });
  assert.deepEqual(gateFlow(w, file, { providers: none }).errors, [], 'a vector deliverable with no generative step needs no provider');
});

test('flows gate: a decision needs visible territories, and final needs gold side by side (decide, final)', async () => {
  const { gateFlow } = await import('../scripts/lib/flows.mjs');
  const w = tmpDir('cstack-gate-');
  const { file } = planFromFlow(w, 'logo-system', { target: 'a mark for a ceramics studio that reads at 16 px' });
  const plan = YAML.parse(fs.readFileSync(file, 'utf8'));
  const save = (patch) => fs.writeFileSync(file, YAML.stringify({ ...plan, deliverable: { kind: 'vector', key_visual: true }, ...patch }));
  const gate = (stage) => gateFlow(w, file, { stage, providers: [] });
  save({});
  assert.match(gate('decide').errors.join('\n'), /0 territories recorded/);
  fs.mkdirSync(path.join(w, 'work', 'probes'), { recursive: true });
  for (const n of ['a', 'b', 'c']) fs.writeFileSync(path.join(w, 'work', 'probes', `${n}.png`), 'x');
  save({ territories: [{ name: 'A', probe_sheet: 'work/probes/a.png' }, { name: 'B', probe_sheet: 'work/probes/missing.png' }] });
  assert.match(gate('decide').errors.join('\n'), /territory "B" has no probe sheet/);
  const terr = ['a', 'b', 'c'].map((n) => ({ name: n, probe_sheet: `work/probes/${n}.png` }));
  save({ territories: terr });
  assert.deepEqual(gate('decide').errors, []);
  assert.match(gate('final').errors.join('\n'), /references\/gold is empty/);
  fs.mkdirSync(path.join(w, 'references', 'gold'), { recursive: true });
  fs.writeFileSync(path.join(w, 'references', 'gold', 'ref-plain-poster.reference.yaml'), 'id: ref-plain-poster\n');
  assert.match(gate('final').errors.join('\n'), /no side-by-side against a gold reference; put the work next to one of ref-plain-poster/);
  save({ territories: terr, gold_comparisons: [{ gold_ref: 'ref-plain-poster', sheet: 'work/probes/a.png' }] });
  assert.deepEqual(gate('final').errors, []);
  save({ territories: terr, gold_comparisons: [{ gold_ref: 'ref-other', sheet: 'work/probes/a.png' }] });
  assert.match(gate('final').errors.join('\n'), /"ref-other" is not in references\/gold/);
});

test('flows gate: cli exits 1 on FAIL and requires a known stage', () => {
  const w = tmpDir('cstack-gate-');
  const { file } = planFromFlow(w, 'logo-system', { target: 'a mark that reads at 16 px' });
  const { deliverable, ...rest } = YAML.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, YAML.stringify(rest));
  const cli = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'bin', 'cstack.mjs'), 'flows', 'gate', file, '--ws', w, ...a], { encoding: 'utf8' });
  const r = cli('--stage', 'make');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FAIL  make/);
  assert.notEqual(cli('--stage', 'ship').status, 0);
  assert.notEqual(cli().status, 0);
});

test('flows plan carries the library deliverable, so a fresh plan can pass the make gate (F17)', async () => {
  const { gateFlow } = await import('../scripts/lib/flows.mjs');
  for (const f of listFlows(null)) assert.ok(f.deliverable?.kind, `${f.id} has no deliverable`);
  const w = tmpDir('cstack-f17-');
  const fal = [{ id: 'fal', kind: 'media', available: true, missing_env: [] }];
  const budget = { per_run: 2, per_day: 5 };
  const hero = planFromFlow(w, 'brand-hero-photo', { target: 'a hero for a ceramics studio home page' });
  assert.deepEqual(YAML.parse(fs.readFileSync(hero.file, 'utf8')).deliverable, { kind: 'image', key_visual: true });
  assert.deepEqual(gateFlow(w, hero.file, { providers: fal, budget }).errors, []);
  // an agent drafting SVG icons is a generative step that needs no media provider
  const icons = planFromFlow(w, 'icon-set', { target: 'twenty UI icons on a 24 px grid' });
  assert.deepEqual(gateFlow(w, icons.file, { providers: [], budget: null }).errors, []);
  const over = planFromFlow(w, 'type-system', { target: 'a type system for a ceramics studio', deliverable: 'page', key_visual: true });
  assert.deepEqual(YAML.parse(fs.readFileSync(over.file, 'utf8')).deliverable, { kind: 'page', key_visual: true });
});

test('flows gate: territory probes for a brand from zero wait for the founder brief and reference reactions (F23)', async () => {
  const { gateFlow } = await import('../scripts/lib/flows.mjs');
  const w = tmpDir('cstack-f23-');
  const fal = [{ id: 'fal', kind: 'media', available: true, missing_env: [] }];
  const budget = { per_run: 1, per_day: 2 };
  const { file } = planFromFlow(w, 'mood-probes', { target: 'territory probes for a canned iced tea with no type or colour yet' });
  const gate = () => gateFlow(w, file, { providers: fal, budget });
  // the R3 run: no brief, no references, and the gate passed
  const cold = gate().errors.join('\n');
  assert.match(cold, /no owner-approved founder brief.*founding mode/);
  assert.match(cold, /no reference packet the owner has reacted to/);
  const brief = { id: 'FB-ostrel', brand_id: 'evalcase', date: '2026-10-05', why_it_exists: { reason: 'tea that tastes of the second steep' }, customer: { who: 'people who drink tea at their desk', evidence: 'told' }, brand_as_person: { name: 'UNKNOWN' }, assets_and_inspirations: { inspirations: [{ ref: 'vintage tea tins', what_draws_them: 'one colour, one mark, the leaf named plainly' }] }, owner_approval: { status: 'draft' } };
  fs.mkdirSync(path.join(w, 'briefs'), { recursive: true });
  const bf = path.join(w, 'briefs', '2026-10-05-founding.founder-brief.yaml');
  fs.writeFileSync(bf, YAML.stringify(brief));
  assert.match(gate().errors.join('\n'), /no owner-approved founder brief/, 'a draft is not the founder’s yes');
  fs.writeFileSync(bf, YAML.stringify({ ...brief, owner_approval: { status: 'owner_approved', by: 'Founder', date: '2026-10-05' } }));
  assert.doesNotMatch(gate().errors.join('\n'), /founder brief/);
  fs.mkdirSync(path.join(w, 'work', 'references'), { recursive: true });
  fs.writeFileSync(path.join(w, 'work', 'references', '2026-10-05-tea-packet.md'), '# packet\n');
  assert.match(gate().errors.join('\n'), /reference packet the owner has reacted to/, 'a packet nobody reacted to is not enough');
  fs.mkdirSync(path.join(w, 'state'), { recursive: true });
  const fbl = path.join(w, 'state', 'feedback.jsonl');
  // F36: one yes to the whole board is not a reaction to references, nor is a single card
  fs.writeFileSync(fbl, JSON.stringify({ id: 'FB-0', date: '2026-10-05', by: 'Founder', type: 'approve', artifact_ref: 'work/references/2026-10-05-tea-packet.md' }) + '\n');
  fs.appendFileSync(fbl, JSON.stringify({ id: 'FB-1', date: '2026-10-05', by: 'Founder', type: 'gold', artifact_ref: 'references/inspiration/ref-tea-tin.reference.yaml' }) + '\n');
  assert.match(gate().errors.join('\n'), /reference packet the owner has reacted to/);
  fs.appendFileSync(fbl, JSON.stringify({ id: 'FB-2', date: '2026-10-05', by: 'Founder', type: 'anti', artifact_ref: 'references/anti/ref-protein-tub.reference.yaml' }) + '\n');
  assert.deepEqual(gate().errors, []);
  // an owner who chooses to skip a step records it, and the warning travels with the work
  fs.rmSync(bf);
  const plan = YAML.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, YAML.stringify({ ...plan, waivers: [{ requires: 'founder_brief', owner_approved: '2026-10-05', why: 'owner said just go' }] }));
  const waived = gate();
  assert.deepEqual(waived.errors, []);
  assert.match(waived.warnings.join('\n'), /going ahead without founder brief \(owner waived it 2026-10-05: owner said just go\)/);
});

test('flows gate: after a pivot and a new approval, reactions from before the pivot no longer count (F42, F52)', async () => {
  const { gateFlow } = await import('../scripts/lib/flows.mjs');
  const { approveBrief, reopenBrief } = await import('../scripts/lib/brief.mjs');
  const w = tmpDir('cstack-f42-');
  const { file } = planFromFlow(w, 'mood-probes', { target: 'territory probes for a canned iced tea' });
  const gate = () => gateFlow(w, file, { providers: [{ id: 'fal', kind: 'media', available: true, missing_env: [] }], budget: { per_run: 1, per_day: 2 } }).errors.join('\n');
  fs.mkdirSync(path.join(w, 'briefs'), { recursive: true });
  fs.mkdirSync(path.join(w, 'work', 'references'), { recursive: true });
  fs.mkdirSync(path.join(w, 'state'), { recursive: true });
  fs.writeFileSync(path.join(w, 'work', 'references', 'tea-packet.md'), '# packet\n');
  const bf = path.join(w, 'briefs', 'founding.founder-brief.yaml');
  fs.writeFileSync(bf, YAML.stringify({ id: 'FB-1', brand_id: 'x', date: '2026-10-05', why_it_exists: { reason: 'tea you can carry' }, customer: { who: 'w', evidence: 'told' }, brand_as_person: {}, assets_and_inspirations: {}, owner_approval: { status: 'draft' } }));
  approveBrief(bf, { by: 'Founder' });
  const fb = path.join(w, 'state', 'feedback.jsonl');
  const react = (id) => fs.appendFileSync(fb, JSON.stringify({ id, date: '2026-10-05', by: 'Founder', type: 'pairwise', artifact_ref: `references/inspiration/${id}-a.reference.yaml`, pair: { a: `references/inspiration/${id}-a.reference.yaml`, b: `references/inspiration/${id}-b.reference.yaml`, winner: 'a' } }) + '\n');
  react('FB-a');
  assert.equal(gate(), '');
  // the founder pivots: reopen, rewrite, approve again; the old yes was to a board for the old brief
  reopenBrief(bf, { reason: 'a healthier mass-market soda' });
  fs.writeFileSync(bf, fs.readFileSync(bf, 'utf8').replace('tea you can carry', 'a healthier soda'));
  approveBrief(bf, { by: 'Founder' });
  assert.match(gate(), /reference packet the owner has reacted to/);
  react('FB-b');
  assert.equal(gate(), '');
  // F52: the natural order is react, then say yes; reactions given after the pivot and before the new yes count
  reopenBrief(bf, { reason: 'a second pivot' });
  react('FB-c');
  fs.writeFileSync(bf, fs.readFileSync(bf, 'utf8').replace('a healthier soda', 'a sparkling tea'));
  approveBrief(bf, { by: 'Founder' });
  assert.equal(gate(), '');
  // an approved brief edited and approved again without a reopen: reactions before the previous yes stop counting
  fs.writeFileSync(bf, fs.readFileSync(bf, 'utf8').replace('a sparkling tea', 'a still tea'));
  approveBrief(bf, { by: 'Founder' });
  assert.match(gate(), /reference packet the owner has reacted to/);
});

test('flows gate: a plan made before its library flow gained requires still owes them (F26)', async () => {
  const { gateFlow } = await import('../scripts/lib/flows.mjs');
  const w = tmpDir('cstack-f26-');
  const { file } = planFromFlow(w, 'mood-probes', { target: 'territory probes for a brand with no type or colour yet' });
  const { requires, ...old } = YAML.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(requires, ['founder_brief', 'reference_reactions']);
  fs.writeFileSync(file, YAML.stringify(old));
  const errs = gateFlow(w, file, { providers: [{ id: 'fal', kind: 'media', available: true, missing_env: [] }], budget: { per_run: 1, per_day: 2 } }).errors.join('\n');
  assert.match(errs, /founder brief/);
  assert.match(errs, /reference packet/);
});
