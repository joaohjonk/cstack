// T1 fixture tests: free, deterministic, run on every code change (`node --test tests/`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { compile, diffRecipes, placeholders } from '../scripts/lib/prompt.mjs';
import { guardedCall, planBatch, readLedger, idempotencyKey } from '../scripts/lib/ledger.mjs';
import { route } from '../scripts/lib/router.mjs';
import { record, history } from '../scripts/lib/lineage.mjs';
import { experimentInit, experimentLog, experimentStatus } from '../scripts/lib/experiment.mjs';
import { checkBudgets } from '../scripts/lib/budget.mjs';
import { validateValue } from '../scripts/lib/schemas.mjs';
import { evalPlan } from '../scripts/lib/evalplan.mjs';
import { learningCandidates, promoteLearning } from '../scripts/lib/learn.mjs';
import { appendJSONL } from '../scripts/lib/core.mjs';

const tmpWs = (budget) => {
  const d = tmpDir('cstack-ws-');
  if (budget !== undefined) fs.writeFileSync(path.join(d, 'cstack.config.yaml'), YAML.stringify({ brand_id: 'test', budget }));
  return d;
};

// ---------- prompt slots ----------
const recipe = {
  id: 'r1',
  version: 1,
  task: 'text_to_image',
  template: 'A photograph of {subject}, {lighting}. Shot on {camera}.',
  slots: {
    subject: { required: true },
    lighting: { variants: ['hard direct flash', 'soft north window', 'overhead diffusion'] },
    camera: { required: false },
  },
};

test('prompt: compiles with explicit values and drops empty optional slot cleanly', () => {
  const r = compile(recipe, { values: { subject: 'a glass on a steel counter', lighting: 'hard flash' } });
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.equal(r.prompt, 'A photograph of a glass on a steel counter, hard flash. Shot on.');
});

test('prompt: missing required slot fails', () => {
  const r = compile(recipe, { values: { lighting: 'x' } });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(), /required slot "subject"/);
});

test('prompt: unused declared slot and unknown value are wiring bugs', () => {
  const bad = { ...recipe, slots: { ...recipe.slots, mood: {} } };
  const r = compile(bad, { values: { subject: 's', lighting: 'l', colour: 'red' } });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(), /"mood" is declared but never used/);
  assert.match(r.errors.join(), /unknown slot "colour"/);
});

test('prompt: undeclared placeholder fails', () => {
  const r = compile({ ...recipe, template: recipe.template + ' {grain}' }, { values: { subject: 's', lighting: 'l' } });
  assert.match(r.errors.join(), /\{grain\} is not declared/);
});

test('prompt: variant pools are deterministic by index and by seed', () => {
  const a = compile(recipe, { values: { subject: 's' }, variant_index: { lighting: 1 } });
  assert.match(a.prompt, /soft north window/);
  const s1 = compile(recipe, { values: { subject: 's' }, seed: 42 });
  const s2 = compile(recipe, { values: { subject: 's' }, seed: 42 });
  assert.equal(s1.prompt, s2.prompt);
  assert.equal(s1.hash, s2.hash);
  const oob = compile(recipe, { values: { subject: 's' }, variant_index: { lighting: 9 } });
  assert.equal(oob.ok, false);
});

test('prompt: literal braces survive via doubling; placeholders listed', () => {
  assert.deepEqual(placeholders('a {b} {{c}} {d}'), ['b', 'd']);
});

test('prompt: component diff names the changed slot only', () => {
  const a = { ...recipe, values: { subject: 's', lighting: 'flash' } };
  const b = { ...recipe, values: { subject: 's', lighting: 'window' } };
  assert.deepEqual(diffRecipes(a, b), [{ part: 'slot.lighting', from: 'flash', to: 'window' }]);
});

// ---------- ledger / spend guard ----------
const spec = { provider: 'fake', model: 'm1', operation: 'generate', input_hashes: ['abc'], prompt_recipe_hash: 'h', estimated_cost: { amount: 0.1, currency: 'USD' } };

test('ledger: no budget envelope blocks paid calls', async () => {
  const ws = tmpWs();
  let called = 0;
  const r = await guardedCall(ws, spec, async () => (called++, { output_ids: ['o1'] }));
  assert.equal(r.blocked, true);
  assert.equal(called, 0);
  assert.equal(readLedger(ws)[0].status, 'budget_blocked');
});

test('ledger: dry run never calls the provider', async () => {
  const ws = tmpWs({ currency: 'USD', per_run: 1, per_day: 5 });
  let called = 0;
  const r = await guardedCall(ws, { ...spec, dry_run: true }, async () => (called++, {}));
  assert.equal(r.dry_run, true);
  assert.equal(called, 0);
});

test('ledger: identical call is deduplicated (no double spend)', async () => {
  const ws = tmpWs({ currency: 'USD', per_run: 1, per_day: 5 });
  let called = 0;
  await guardedCall(ws, spec, async () => (called++, { output_ids: ['o1'], actual_cost: { amount: 0.1, currency: 'USD' } }));
  const again = await guardedCall(ws, spec, async () => (called++, { output_ids: ['o2'] }));
  assert.equal(called, 1);
  assert.equal(again.deduplicated, true);
  assert.deepEqual(again.output_ids, ['o1']);
});

// bounded transient retries: tests/safety.test.mjs
test('ledger: policy failures are never retried', async () => {
  const ws = tmpWs({ currency: 'USD', per_run: 1, per_day: 5 });
  let calls = 0;
  const r = await guardedCall(ws, { ...spec, input_hashes: ['p'] }, async () => {
    calls++;
    throw new Error('content policy violation');
  });
  assert.equal(r.failed, true);
  assert.equal(calls, 1);
  assert.equal(readLedger(ws).at(-1).status, 'failed_policy');
});

test('ledger: per_day ceiling blocks a batch plan; stop condition required', () => {
  const ws = tmpWs({ currency: 'USD', per_run: 2, per_day: 1 });
  const p = planBatch(ws, [{ est: { amount: 0.8, currency: 'USD' } }, { est: { amount: 0.8, currency: 'USD' } }]);
  assert.equal(p.ok, false);
  assert.ok(p.problems.some((x) => /per_day/.test(x)));
  assert.ok(p.problems.some((x) => /stop condition/.test(x)));
});

test('ledger: idempotency key ignores input order', () => {
  assert.equal(idempotencyKey({ ...spec, input_hashes: ['a', 'b'] }), idempotencyKey({ ...spec, input_hashes: ['b', 'a'] }));
});

// ---------- router ----------
const reg = {
  models: [
    { model_id: 'gen-a', provider: 'p1', modality: 'image', capabilities: ['image-edit', 'product-consistency', 'text-rendering'], last_verified: '2026-10-01', source: 'x', est_unit_cost: { amount: 0.15, currency: 'USD', per: 'image' } },
    { model_id: 'gen-b', provider: 'p2', modality: 'image', capabilities: ['image-edit'], last_verified: '2025-01-01', source: 'x' },
    { model_id: 'vid', provider: 'p1', modality: 'video', capabilities: ['image-to-video'] },
    { model_id: 'dead', provider: 'p1', modality: 'image', capabilities: ['image-edit', 'product-consistency'], last_verified: '2026-10-01', source: 'x', status: 'shut_down' },
  ],
};

test('router: ranks by required capabilities and flags stale entries', () => {
  const r = route(reg, { modality: 'image', needs: ['image-edit', 'product-consistency'], today: '2026-10-03' });
  assert.equal(r.candidates[0].model_id, 'gen-a');
  assert.ok(r.candidates.find((c) => c.model_id === 'gen-b').stale);
  assert.ok(!r.candidates.some((c) => c.model_id === 'dead'), 'shut-down models are excluded');
});

test('router: a task benchmark outranks generic claims', () => {
  const withBench = structuredClone(reg);
  withBench.models[1].benchmark_results = [{ task: 'packshot', date: '2026-10-02', result: 'won 3/4 pairwise' }];
  withBench.models[1].last_verified = '2026-10-02';
  const r = route(withBench, { modality: 'image', needs: ['image-edit', 'product-consistency'], task: 'packshot', today: '2026-10-03' });
  assert.equal(r.candidates[0].model_id, 'gen-b');
});

test('router: unknown modality warns instead of guessing', () => {
  const r = route(reg, { modality: 'vector' });
  assert.equal(route(reg, { modality: 'image', today: '2026-10-03' }).candidates.some((c) => c.model_id === 'dead'), false, 'shut-down models are never routed');
  assert.equal(r.candidates.length, 0);
  assert.match(r.warnings[0], /research current models/);
});

// ---------- lineage ----------
test('lineage: second version must name changed dimensions', () => {
  const ws = tmpWs();
  const base = { artifact_id: 'shot-04', kind: 'image', intent_of_change: 'first frame', operation: 'generate', output_files: ['out/a.jpg'] };
  record(ws, base);
  assert.throws(() => record(ws, { ...base, intent_of_change: 'harsher light' }), /changed_dimensions/);
  const v2 = record(ws, { ...base, intent_of_change: 'preserve framing, make light harsher', changed_dimensions: ['lighting'], unchanged_dimensions: ['cast', 'pose', 'crop'] });
  assert.equal(v2.version, 2);
  assert.equal(v2.parent_version, 1);
  assert.equal(history(ws, 'shot-04').length, 2);
});

// ---------- experiments ----------
test('experiment: one mutable surface, incumbent moves only on keep, stops on budget', () => {
  const ws = tmpWs();
  experimentInit(ws, 'EXP-1', { surface: 'prompt.slot.lighting', spend: 1, max: 10 });
  experimentLog(ws, 'EXP-1', { decision: 'baseline', candidate: 'r1@1', cost: 0.1 });
  assert.throws(() => experimentLog(ws, 'EXP-1', { decision: 'keep', changed_variable: 'model', candidate: 'x', cost: 0.1 }), /one variable/);
  experimentLog(ws, 'EXP-1', { decision: 'discard', changed_variable: 'prompt.slot.lighting', candidate: 'r1@2', cost: 0.2 });
  experimentLog(ws, 'EXP-1', { decision: 'keep', changed_variable: 'prompt.slot.lighting', candidate: 'r1@3', cost: 0.2, guardrails: 'pass' });
  assert.equal(experimentStatus(ws, 'EXP-1').incumbent, 'r1@3');
  assert.throws(() => experimentLog(ws, 'EXP-1', { decision: 'keep', changed_variable: 'prompt.slot.lighting', candidate: 'r1@4', cost: 0.1, guardrails: 'product_truth FAIL' }), /guardrail/);
  experimentLog(ws, 'EXP-1', { decision: 'discard', changed_variable: 'prompt.slot.lighting', candidate: 'r1@5', cost: 0.6 });
  const st = experimentStatus(ws, 'EXP-1');
  assert.equal(st.stopped, true);
  assert.match(st.stop_reason, /spend/);
  assert.throws(() => experimentLog(ws, 'EXP-1', { decision: 'discard', changed_variable: 'prompt.slot.lighting', candidate: 'r1@6', cost: 0 }), /stopped/);
});

// ---------- budgets ----------
test('budget: growth beyond tolerance fails, shrink passes', () => {
  const skills = [
    { slug: 'a', tokens: 1200, onDemandTokens: 0, frontmatter: { name: 'a', description: 'x' } },
    { slug: 'b', tokens: 800, onDemandTokens: 0, frontmatter: { name: 'b', description: 'y' } },
  ];
  const res = checkBudgets(skills, { tolerance: 0.1, catalog_ceiling: 100, skills: { a: { ceiling: 1000 }, b: { ceiling: 900 } } });
  assert.equal(res.rows.find((r) => r.slug === 'a').status, 'over');
  assert.equal(res.rows.find((r) => r.slug === 'b').status, 'under');
  assert.equal(res.ok, false);
});

// ---------- schemas ----------
test('schemas: anti references require why_it_fails', () => {
  const anti = { id: 'ref-1', kind: 'image', library: 'anti', rights: { status: 'inspiration_only' }, transferable_mechanism: 'n/a' };
  assert.equal(validateValue('reference', anti).ok, false);
  assert.equal(validateValue('reference', { ...anti, why_it_fails: 'beautiful but too luxury' }).ok, true);
});

test('schemas: brand field without sources is rejected', () => {
  const bs = { schema_version: '0.1', metadata: { brand_id: 'b', name: 'B', updated: '2026-10-03' }, sections: { voice: { tone: { value: 'dry', confidence: 'low', approval: 'inferred' } } } };
  assert.equal(validateValue('brand-system', bs).ok, false);
  bs.sections.voice.tone.sources = [{ kind: 'model_inference', ref: 'brand-import run' }];
  assert.equal(validateValue('brand-system', bs).ok, true);
  bs.sections.vibes = {};
  assert.equal(validateValue('brand-system', bs).ok, false, 'unknown sections must use the x_ prefix');
});

// ---------- eval plan ----------
test('evals plan: skill edit selects only its fixtures; undeclared file triggers full T2', () => {
  const p = evalPlan({ files: ['skills/shot-dna/SKILL.md'] });
  assert.ok(p.tiers.T2.every((id) => typeof id === 'string'));
  assert.equal(p.full, false);
  const q = evalPlan({ files: ['weird/new-thing.txt'] });
  assert.equal(q.full, true);
});

// ---------- learning promotion ----------
test('learn: single weak observation is not a candidate; repeated evidence is; model-specific needs expiry', () => {
  const ws = tmpWs();
  const f = path.join(ws, 'state', 'learnings.jsonl');
  appendJSONL(f, { id: 'L1', date: '2026-10-01', kind: 'observation', statement: 'Model X resists scale edits', scope: 'model_specific', confidence: 'medium', tags: ['topic:x-scale'] });
  assert.equal(learningCandidates(ws).length, 0);
  appendJSONL(f, { id: 'L2', date: '2026-10-02', kind: 'failure', statement: 'Model X barely moved scale again', scope: 'model_specific', confidence: 'medium', tags: ['topic:x-scale'] });
  const c = learningCandidates(ws);
  assert.equal(c.length, 1);
  assert.equal(c[0].needs_expiry, true);
  assert.throws(() => promoteLearning(ws, 'L2', { to: 'registry/models.json', by: 'owner' }), /expires/);
});

// ---------- design tokens ----------
import { checkTokens, buildCSS, lintRaw } from '../scripts/lib/tokens.mjs';
test('tokens: aliases resolve, cycles fail, raw colors are flagged', () => {
  const w = tmpWs();
  fs.mkdirSync(path.join(w, 'brand', 'tokens'), { recursive: true });
  fs.writeFileSync(path.join(w, 'brand', 'tokens', 'color.tokens.json'), JSON.stringify({ color: { $type: 'color', ink: { $value: '#121212' }, text: { $value: '{color.ink}' } }, space: { $type: 'dimension', s: { $value: { value: 8, unit: 'px' } } } }));
  assert.equal(checkTokens(w).ok, true);
  const css = fs.readFileSync(buildCSS(w).file, 'utf8');
  assert.match(css, /--color-text: #121212;/);
  assert.match(css, /--space-s: 8px;/);
  const page = path.join(w, 'page.css');
  fs.writeFileSync(page, 'a{color:#121212} b{color:#ff0000}');
  const r = lintRaw(w, [page]);
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].value, '#ff0000');
  fs.writeFileSync(path.join(w, 'brand', 'tokens', 'loop.tokens.json'), JSON.stringify({ x: { $type: 'color', a: { $value: '{x.b}' }, b: { $value: '{x.a}' } } }));
  assert.equal(checkTokens(w).ok, false);
});

// ---------- research tool detection ----------
import { detectTools } from '../scripts/lib/tools.mjs';
import { tmpDir } from './tmp.mjs';
test('tools: detects by agent-visible MCP server name and env presence, never by guess', () => {
  const w = tmpWs();
  const res = detectTools(w, { mcpServers: ['Figma'], env: { FOREPLAY_API_KEY: 'x' } });
  const by = Object.fromEntries(res.map((t) => [t.id, t]));
  assert.equal(by.figma.available, true);
  assert.equal(by.foreplay.available, true);
  assert.equal(by.cosmos.available, false);
  assert.match(by.cosmos.agent_access, /none/);
  assert.ok(!JSON.stringify(res).includes('"x"'), 'env values are never echoed');
});
