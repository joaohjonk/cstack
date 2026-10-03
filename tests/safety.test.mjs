// Regression tests for the spend guard, write containment and trust boundaries (review findings R1-R32, A4-A7).
// Free and offline: the mock provider and stubbed fetch only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { tmpDir } from './tmp.mjs';
import { changedFiles, evalPlan } from '../scripts/lib/evalplan.mjs';
import { guardedCall, planBatch, readLedger, spent, classifyError, dayStart } from '../scripts/lib/ledger.mjs';
import { sizeAudit, parseExpected } from '../scripts/lib/image.mjs';
import { runMedia } from '../providers/runner.mjs';
import { mock } from '../providers/mock.mjs';
import { fal } from '../providers/fal.mjs';
import { tasteLabs } from '../providers/taste-labs.mjs';
import { probeGstack } from '../scripts/lib/browser/launch.mjs';
import { initBrand, applyToBrand } from '../scripts/lib/brand.mjs';
import { healthReport } from '../scripts/lib/health.mjs';

const ws = (budget) => {
  const d = tmpDir('cstack-safe-');
  if (budget) fs.writeFileSync(path.join(d, 'cstack.config.yaml'), YAML.stringify({ brand_id: 'safe', budget }));
  return d;
};
const usd = (amount) => ({ amount, currency: 'USD' });
const spec = (extra = {}) => ({ provider: 'p', model: 'm', operation: 'generate', params: { n: Math.random() }, ...extra });
const ok = async () => ({ output_ids: ['o'] });
const req = (prompt, extra = {}) => ({ provider: 'mock', model: 'mock-1', operation: 'generate', inputs: { prompt, params: { mock_size: [64, 80] } }, out_dir: 'work/out', out_prefix: 'shot', ...extra });
const fast = { poll_interval_ms: 1 };

// ---------- evals plan (R1, R11) ----------
test('evals plan: --since never reaches a shell, and a bad ref fails loudly (R1, R11)', () => {
  const marker = path.join(tmpDir('cstack-inj-'), 'INJECTED');
  assert.throws(() => changedFiles(`HEAD; touch ${marker} #`), /git diff/);
  assert.equal(fs.existsSync(marker), false, 'shell metacharacters were executed');
  assert.throws(() => changedFiles(`HEAD$(touch ${marker})`), /git diff/);
  assert.equal(fs.existsSync(marker), false);
  assert.throws(() => changedFiles('--output=/dev/null'), /not a git ref/);
  assert.throws(() => evalPlan({ since: '4b825dc642cb6eb9a060e54bf8d69288fbee4904x' }), /git diff/);
});

// ---------- spend guard (R2, R3, R21, R27, R28, R29) ----------
test('ledger: an unpriced call never passes a zero budget, even when confirmed (R2)', async () => {
  const w = ws({ currency: 'USD', per_run: 0, per_day: 0, confirm_over: 0 });
  let paid = 0;
  for (let i = 0; i < 3; i++) {
    const r = await guardedCall(w, spec({ estimated_cost: null, confirm_unpriced: true }), async () => (paid++, { output_ids: ['x'] }));
    assert.equal(r.blocked, true);
    assert.match(r.problems.join(';'), /unpriced/);
  }
  assert.equal(paid, 0);
  const allowed = ws({ currency: 'USD', per_run: 0, per_day: 0, allow_unpriced: true });
  assert.equal((await guardedCall(allowed, spec({ estimated_cost: null }), ok)).blocked, true, 'allow_unpriced does not lift a zero budget');
});

test('ledger: confirmed unpriced calls are booked at per_run and count toward per_day (R2)', async () => {
  const w = ws({ currency: 'USD', per_run: 1, per_day: 2, confirm_over: 5 });
  const a = await guardedCall(w, spec({ estimated_cost: null, confirm_unpriced: true }), ok);
  assert.equal(a.row.status, 'ok');
  assert.deepEqual({ amount: a.row.booked_cost.amount, currency: a.row.booked_cost.currency }, usd(1));
  assert.equal(a.row.estimated_cost, null, 'the estimate stays honest: unknown');
  assert.equal((await guardedCall(w, spec({ estimated_cost: null, confirm_unpriced: true }), ok)).row.status, 'ok');
  const third = await guardedCall(w, spec({ estimated_cost: null, confirm_unpriced: true }), ok);
  assert.equal(third.blocked, true, 'two unpriced calls used the whole per_day');
  assert.match(third.problems.join(';'), /per_day/);
  const own = ws({ currency: 'USD', per_run: 5, per_day: 5, confirm_over: 5, unpriced_call_cost: 0.25 });
  assert.equal((await guardedCall(own, spec({ estimated_cost: null, confirm_unpriced: true }), ok)).row.booked_cost.amount, 0.25);
});

test('ledger: confirm_over blocks until the call is confirmed (R3)', async () => {
  const w = ws({ currency: 'USD', per_run: 5, per_day: 5, confirm_over: 0 });
  let paid = 0;
  const s = spec({ estimated_cost: usd(1) });
  const r = await guardedCall(w, s, async () => (paid++, { output_ids: ['y'] }));
  assert.equal(r.blocked, true);
  assert.match(r.problems.join(';'), /confirm_over/);
  assert.equal(paid, 0);
  assert.equal((await guardedCall(w, { ...s, confirmed: true }, async () => (paid++, { output_ids: ['y'] }))).row.status, 'ok');
  assert.equal(paid, 1);
});

test('ledger: queued jobs count toward per_day once, not again when they finish (R28)', () => {
  const day = new Date().toISOString();
  const rows = [
    { ts: day, status: 'queued', idempotency_key: 'k1', estimated_cost: usd(1) },
    { ts: day, status: 'queued', idempotency_key: 'k1', estimated_cost: usd(1) },
    { ts: day, status: 'queued', idempotency_key: 'k2', estimated_cost: usd(2) },
    { ts: day, status: 'ok', idempotency_key: 'k2', estimated_cost: usd(2), actual_cost_if_available: usd(1.5) },
    { ts: day, status: 'ok', idempotency_key: 'k3', estimated_cost: null, booked_cost: usd(0.5) },
  ];
  assert.equal(spent(rows), 3);
});

test('ledger: per_day starts at local midnight, not UTC midnight (R21)', () => {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  assert.equal(dayStart(), midnight.toISOString());
});

test('ledger: planBatch never adds amounts across currencies (R29, A6)', () => {
  const w = ws({ currency: 'USD', per_run: 5, per_day: 5 });
  const p = planBatch(w, [{ est: usd(1) }, { est: { amount: 100, currency: 'EUR' } }], { stop_condition: 'x' });
  assert.equal(p.estimated_total, 1);
  assert.equal(p.ok, false);
  assert.match(p.problems.join(';'), /EUR/);
});

test('ledger: a re-attach to a paid pending job is not budget-blocked (R27)', async () => {
  const w = ws({ currency: 'USD', per_run: 0, per_day: 0 });
  const r = await guardedCall(w, spec({ estimated_cost: usd(1), reattach: true }), ok);
  assert.equal(r.row.status, 'ok');
});

test('ledger: transient failures retry a bounded number of times; policy never (R20, T6)', async () => {
  const w = ws({ currency: 'USD', per_run: 1, per_day: 5 });
  let calls = 0;
  const r = await guardedCall(w, spec({ estimated_cost: usd(0), max_retries: 2, retry_base_ms: 1 }), async () => {
    calls++;
    throw new Error('fal HTTP 503: upstream busy');
  });
  assert.equal(r.failed, true);
  assert.equal(calls, 3);
  assert.deepEqual(readLedger(w).map((x) => x.status), ['failed_transient', 'failed_transient', 'failed_transient']);
  assert.equal(classifyError(new Error('fal HTTP 502: <html> Content-Type: text/html')), 'failed_transient');
  assert.equal(classifyError(new Error('HTTP 429 content length 0')), 'failed_transient');
  assert.equal(classifyError(new Error('HTTP 403 Forbidden')), 'failed_other');
  assert.equal(classifyError(new Error('content policy violation')), 'failed_policy');
  assert.equal(classifyError(new Error('blocked by the safety checker')), 'failed_policy');
});

// ---------- runner containment (R4, A4, A5, R10) ----------
test('runner: out_dir and out_prefix must stay inside the workspace, checked before any submit (R4)', async () => {
  const w = ws({ currency: 'USD', per_run: 1, per_day: 1 });
  const before = mock.calls.submit;
  for (const bad of [{ out_dir: '../escaped' }, { out_dir: '/tmp/escaped' }, { out_prefix: '../x' }, { out_prefix: 'a/b' }, { out_prefix: '.hidden' }])
    await assert.rejects(() => runMedia(w, req('esc', bad), fast), /out_dir|out_prefix/, JSON.stringify(bad));
  assert.equal(mock.calls.submit, before, 'nothing was submitted');
  assert.equal(fs.existsSync(path.join(w, '..', 'escaped')), false);
});

test('runner: a reused out_prefix never overwrites earlier outputs (A4, T-g)', async () => {
  const w = ws({ currency: 'USD', per_run: 1, per_day: 1 });
  const a = await runMedia(w, req('first'), fast);
  const firstBytes = fs.readFileSync(path.join(w, a.output_ids[0]));
  const firstSide = fs.readFileSync(path.join(w, `${a.output_ids[0]}.gen.json`), 'utf8');
  const b = await runMedia(w, req('second', { inputs: { prompt: 'second', params: { mock_size: [32, 40] } } }), fast);
  assert.notEqual(a.output_ids[0], b.output_ids[0]);
  assert.deepEqual(fs.readFileSync(path.join(w, a.output_ids[0])), firstBytes);
  assert.equal(fs.readFileSync(path.join(w, `${a.output_ids[0]}.gen.json`), 'utf8'), firstSide);
  assert.match(b.output_ids[0], /^work\/out\/shot-[0-9a-f]{8}_1\.png$/);
});

test('runner: concurrent identical generates submit once (A5, R5, T-h)', async () => {
  const w = ws({ currency: 'USD', per_run: 1, per_day: 1 });
  const before = mock.calls.submit;
  const [a, b] = await Promise.all([runMedia(w, req('twin SLOW:2'), fast), runMedia(w, req('twin SLOW:2'), fast)]);
  assert.equal(mock.calls.submit - before, 1, 'provider paid once');
  assert.equal([a, b].filter((r) => r.row.status === 'ok').length, 1);
  assert.equal([a, b].filter((r) => r.pending).length, 1);
  const again = await runMedia(w, req('twin SLOW:2'), fast);
  assert.equal(again.deduplicated, true);
  assert.equal(mock.calls.submit - before, 1);
});

test('runner: a failed submit releases the claim so a retry can submit (A5)', async () => {
  const w = ws({ currency: 'USD', per_run: 1, per_day: 1 });
  const r = await runMedia(w, req('FAIL_POLICY now'), fast);
  assert.equal(r.failed, true);
  assert.deepEqual(fs.readdirSync(path.join(w, 'state', 'pending-jobs')), []);
});

test('image: a malformed expected aspect or size fails instead of passing (R10, T7)', async () => {
  assert.throws(() => sizeAudit({ width: 1600, height: 900 }, { aspect: '4x5' }), /aspect/);
  assert.throws(() => sizeAudit({ width: 1600, height: 900 }, { width: 1080 }), /size/);
  assert.throws(() => parseExpected({ aspect: '0:5' }), /aspect/);
  assert.equal(parseExpected({ aspect: '4:5' }), 0.8);
  assert.equal(parseExpected({ aspect: '2.39:1' }), 2.39);
  const w = ws({ currency: 'USD', per_run: 1, per_day: 1 });
  const before = mock.calls.submit;
  await assert.rejects(() => runMedia(w, req('typo', { expected_size: { aspect: '4x5' } }), fast), /aspect/);
  assert.equal(mock.calls.submit, before, 'rejected before paying');
});

// ---------- provider trust boundaries (R9, R14, R15) ----------
const withFetch = async (stub, fn) => {
  const orig = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    return await fn();
  } finally {
    globalThis.fetch = orig;
  }
};
const withEnv = async (k, v, fn) => {
  const orig = process.env[k];
  process.env[k] = v;
  try {
    return await fn();
  } finally {
    if (orig === undefined) delete process.env[k];
    else process.env[k] = orig;
  }
};

test('fal: never sends FAL_KEY to a host other than fal (R9)', async () => {
  const seen = [];
  const stub = async (url, init) => (seen.push([String(url), init?.headers?.Authorization]), new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 }));
  await withEnv('FAL_KEY', 'test-key-not-real', () =>
    withFetch(stub, async () => {
      await assert.rejects(() => fal.status({ status_url: 'https://evil.example/requests/1/status' }), /refusing/);
      await assert.rejects(() => fal.result({ response_url: 'http://queue.fal.run/requests/1' }), /refusing/);
      await assert.rejects(() => fal.status({ status_url: 'https://queue.fal.run.evil.example/x' }), /refusing/);
      assert.deepEqual(seen, []);
      assert.deepEqual(await fal.status({ status_url: 'https://queue.fal.run/m/requests/1/status' }), { state: 'done' });
      assert.equal(seen.length, 1);
    }),
  );
});

test('taste-labs: an HTML error page keeps its status; HTTP-date Retry-After respects the deadline (R14, R15)', async () => {
  await withEnv('TASTE_API_KEY', 'test-key-not-real', async () => {
    const html = async () => new Response('<html>bad gateway</html>', { status: 502 });
    const err = await withFetch(html, () => tasteLabs.search({ intent: 'x' }).catch((e) => e));
    assert.match(err.message, /HTTP 502/);
    assert.equal(classifyError(err), 'failed_transient');
    let n = 0;
    const busy = async (_url, init) =>
      init.method === 'POST' ? new Response(JSON.stringify({ submission_id: 's1' }), { status: 200 }) : (n++, new Response('', { status: 503, headers: { 'retry-after': new Date(Date.now() + 3600e3).toUTCString() } }));
    const t0 = Date.now();
    const e = await withFetch(busy, () => tasteLabs.extract({ url: 'https://brand.example', timeout_ms: 50 }).catch((x) => x));
    assert.equal(e.pending, true, e.message);
    assert.ok(Date.now() - t0 < 5000, 'returned at the deadline instead of sleeping on Retry-After');
    assert.ok(n >= 1);
  });
});

// ---------- browse engines (R8) ----------
test('browse engines: a gstack binary inside the current repo is reported, never executed (R8)', () => {
  const home = tmpDir('cstack-home-');
  const repo = tmpDir('cstack-repo-');
  spawnSync('git', ['init', '-q', repo]);
  const marker = path.join(repo, 'RAN');
  const plant = (root) => {
    const bin = path.join(root, '.claude', 'skills', 'gstack', 'browse', 'dist', 'browse');
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    fs.writeFileSync(bin, `#!/bin/sh\ntouch "${marker}"\necho "gstack browse"\n`, { mode: 0o755 });
    return bin;
  };
  const local = probeGstack(plant(repo), { cwd: repo, home });
  assert.equal(local.found, true);
  assert.equal(local.ok, null);
  assert.match(local.note, /not executed/);
  assert.equal(fs.existsSync(marker), false, 'repo-local binary was executed');
  const trusted = probeGstack(plant(home), { cwd: repo, home });
  assert.equal(trusted.ok, true);
  assert.equal(fs.existsSync(marker), true);
});

// ---------- brand set (R19, A7) ----------
const field = (value) => ({ value, sources: [{ kind: 'user_instruction', ref: 'r' }], confidence: 'high', approval: 'current' });

test('brand set: field must be <section>.<field>; prototype keys are refused (R19)', () => {
  const d = path.join(tmpDir('cstack-brand-'), 'b');
  initBrand(d, { name: 'Safe', id: 'safe' });
  for (const bad of ['voice', '__proto__.x', 'voice.__proto__', 'a.b.c', 'constructor.x']) assert.throws(() => applyToBrand(d, bad, field('v')), /section>\.<field/, bad);
  assert.equal({}.x, undefined);
  assert.equal(applyToBrand(d, 'voice.tone', field('dry')).action, 'set');
});

test('brand set: a concurrent writer is refused instead of losing its update (A7)', () => {
  const d = path.join(tmpDir('cstack-brand-'), 'b');
  initBrand(d, { name: 'Safe', id: 'safe' });
  const lock = path.join(d, 'brand', 'brand-system.json.lock');
  fs.writeFileSync(lock, String(process.pid));
  assert.throws(() => applyToBrand(d, 'voice.tone', field('dry')), /being updated/);
  fs.rmSync(lock);
  assert.equal(applyToBrand(d, 'voice.tone', field('dry')).action, 'set');
  assert.equal(fs.existsSync(lock), false, 'lock released');
  const old = new Date(Date.now() - 10 * 60e3);
  fs.writeFileSync(lock, '1');
  fs.utimesSync(lock, old, old);
  assert.equal(applyToBrand(d, 'voice.tone', field('warm')).action, 'set', 'a stale lock from a crashed run is broken');
});

// ---------- health (R32, T14) ----------
test('health: prints staleness and does not treat a non-skill as used (R32)', () => {
  const h = healthReport();
  assert.ok(h.rows.length > 0);
  assert.ok(h.rows.every((r) => typeof r.stale === 'boolean'));
  const stale = h.rows.find((r) => r.stale);
  if (stale) assert.match(h.text.split('\n').find((l) => l.startsWith(stale.slug + ' ')), /stale/);
  assert.equal(h.rows.some((r) => r.slug === 'retro'), false);
  const w = ws();
  fs.mkdirSync(path.join(w, 'state'));
  fs.writeFileSync(path.join(w, 'state', 'failures.jsonl'), JSON.stringify({ task: h.rows[0].slug }) + '\n');
  assert.equal(healthReport({ ws: w }).rows[0].failures, 1);
});

// ---------- QA report items in the libraries (ISSUE-002, 006, 007, 008, 009, 011, 013, 014, 015, 017, 018, 027) ----------
import { checkBrand, resolveConflict } from '../scripts/lib/brand.mjs';
import { lintRaw } from '../scripts/lib/tokens.mjs';
import { compile, diffRecipes } from '../scripts/lib/prompt.mjs';
import { experimentInit, experimentStatus } from '../scripts/lib/experiment.mjs';

const brand = () => {
  const d = path.join(tmpDir('cstack-brand-'), 'b');
  initBrand(d, { name: 'Safe', id: 'safe' });
  return d;
};
const official = (value, ref) => ({ value, sources: [{ kind: 'official_asset', ref }], confidence: 'high', approval: 'current' });

test('brand set: refuses sourceless, non-object, bad-enum and unknown-section fields; writes nothing (ISSUE-002)', () => {
  const d = brand();
  const file = path.join(d, 'brand', 'brand-system.json');
  const before = fs.readFileSync(file, 'utf8');
  assert.throws(() => applyToBrand(d, 'voice.x', { value: 'x' }), /not a valid brand field/);
  assert.throws(() => applyToBrand(d, 'voice.w', 'hello'), /JSON object/);
  assert.throws(() => applyToBrand(d, 'voice.y', { value: 'x', sources: [{ kind: 'bogus_kind', ref: 'r' }], confidence: 'high', approval: 'wat' }), /not a valid brand field/);
  assert.throws(() => applyToBrand(d, 'nosuchsection.k', field('x')), /not a valid brand field/);
  assert.throws(() => applyToBrand(d, 'voice.tone.extra', field('x')), /section>\.<field/);
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'file unchanged');
  assert.equal(applyToBrand(d, 'x_custom.k', field('ok')).action, 'set', 'x_ sections are allowed');
});

test('brand set: re-applying the same field does not duplicate sources (ISSUE-017)', () => {
  const d = brand();
  applyToBrand(d, 'color.accent', official('#111111', 'spec'));
  const again = applyToBrand(d, 'color.accent', official('#111111', 'spec'));
  assert.equal(again.action, 'keep');
  const bs = JSON.parse(fs.readFileSync(path.join(d, 'brand', 'brand-system.json'), 'utf8'));
  assert.equal(bs.sections.color.accent.sources.length, 1);
  assert.equal(applyToBrand(d, 'color.accent', official('#111111', 'other-spec')).field.sources.length, 2, 'new evidence is still added');
});

test('brand set: an open conflict marks the field; resolving clears it (ISSUE-018, ISSUE-015)', () => {
  const d = brand();
  applyToBrand(d, 'color.accent', official('#111111', 'a'));
  const c = applyToBrand(d, 'color.accent', official('#222222', 'b'));
  const read = () => JSON.parse(fs.readFileSync(path.join(d, 'brand', 'brand-system.json'), 'utf8')).sections.color.accent;
  assert.equal(read().approval, 'conflict');
  assert.equal(checkBrand(d).warnings.filter((w) => /color\.accent/.test(w)).length, 0, 'a marked conflict carries a note, not a warning');
  assert.throws(() => resolveConflict(d, c.conflict.id, { pick: true }), /--pick/);
  resolveConflict(d, c.conflict.id, { pick: '2' });
  assert.equal(read().approval, 'current');
  assert.equal(read().notes, undefined);
});

test('brand init: rejects an unusable id; re-init says nothing changed (ISSUE-014, ISSUE-027)', () => {
  const root = tmpDir('cstack-init-');
  assert.throws(() => initBrand(path.join(root, 'x2'), { name: '!!!' }), /--id needed/);
  assert.throws(() => initBrand(path.join(root, 'x3'), { name: 'Ok', id: 'bad id/../x' }), /must match/);
  assert.equal(fs.existsSync(path.join(root, 'x2')), false);
  const d = path.join(root, 'ok');
  initBrand(d, { name: 'Ok' });
  assert.match(initBrand(d, { name: 'Other' }), /already a workspace .*unchanged/);
});

test('brand check: outside a workspace it stops instead of walking the tree (ISSUE-006)', () => {
  const d = tmpDir('cstack-notws-');
  fs.mkdirSync(path.join(d, 'other', 'brand'), { recursive: true });
  fs.writeFileSync(path.join(d, 'other', 'brand', 'brand-system.json'), '{"nope":1}');
  const r = checkBrand(d);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /no cstack\.config/);
});

test('tokens lint: catches alpha hex and colour functions; --allow matches in any hex form (ISSUE-007, R18)', () => {
  const d = tmpDir('cstack-tok-');
  const css = path.join(d, 'p.css');
  fs.writeFileSync(css, '.a{color:#ff000080}\n.b{color:#f008}\n.c{color: rgb(255,0,0)}\n.d{color:hsl(0 100% 50%)}\n.e{color:#fff}\n.f{color:rgb(var(--x))}\n');
  const r = lintRaw(d, [css]);
  assert.deepEqual(r.findings.map((f) => f.line), [1, 2, 3, 4, 5]);
  const allowed = lintRaw(d, [css], { allow: ['#f00', '#FFFFFF', 'hsl(0 100% 50%)'] });
  assert.deepEqual(allowed.findings.map((f) => f.line), [], JSON.stringify(allowed.findings));
});

test('prompt: compile rejects a non-recipe; diff sees variant pools, variant_index and seed (ISSUE-008, ISSUE-009)', () => {
  assert.throws(() => compile('.a{color:red}'), /not a prompt recipe/);
  assert.throws(() => compile({ slots: {} }), /not a prompt recipe/);
  const r = { template: 'A {food} on {surface}.', slots: { food: { variants: ['a torn heel of bread', 'a pear'] }, surface: { variants: ['slate'] } }, variant_index: { food: 0, surface: 0 } };
  const pool = structuredClone(r);
  pool.slots.food.variants[0] = 'a heel of rye';
  assert.ok(diffRecipes(r, pool).some((x) => x.part === 'slot.food.variants'));
  assert.ok(diffRecipes(r, { ...r, variant_index: { food: 1, surface: 0 } }).some((x) => x.part === 'slot.food.variant_index'));
  assert.ok(diffRecipes(r, { ...r, seed: 7 }).some((x) => x.part === 'seed'));
  assert.deepEqual(diffRecipes(r, structuredClone(r)), []);
});

test('spend plan: unpriced items are not free and a non-list fails clearly (ISSUE-011)', () => {
  const zero = ws({ currency: 'USD', per_run: 0, per_day: 0 });
  const p = planBatch(zero, [{ provider: 'fal', model: 'x', operation: 'text_to_image' }], { stop_condition: 'x' });
  assert.equal(p.ok, false);
  assert.equal(p.unpriced, 1);
  const some = ws({ currency: 'USD', per_run: 1, per_day: 1 });
  const q = planBatch(some, [{ provider: 'fal' }, { provider: 'fal' }], { stop_condition: 'x' });
  assert.equal(q.estimated_total, 2, 'each unpriced item is booked at per_run');
  assert.equal(q.ok, false);
  assert.throws(() => planBatch(some, { a: 1 }, { stop_condition: 'x' }), /JSON array/);
});

test('experiment: a run id is a name, never a path (ISSUE-013)', () => {
  const w = ws();
  for (const bad of ['../../escape', '../x', 'a/b', '.hidden', '']) assert.throws(() => experimentInit(w, bad), /run_id must match/, bad);
  assert.equal(fs.existsSync(path.join(w, 'escape')), false);
  assert.throws(() => experimentStatus(w, 'nosuch'), /no experiment run/);
});
