// The best model now, not a habit (owner, field test F54 to F58, F60): measured rank leads the router, stale or missing
// ranks are said out loud, the fal GPT Image routes are priced honestly, and the openai-image adapter is real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../scripts/lib/core.mjs';
import { route, leaderboardWarning } from '../scripts/lib/router.mjs';
import { runMedia, estimateFromRegistry, priceRequest } from '../providers/runner.mjs';
import { openaiImage, openaiFetch } from '../providers/openai-image.mjs';
import { readLedger } from '../scripts/lib/ledger.mjs';
import { imageSize } from '../scripts/lib/image.mjs';
import { tmpDir } from './tmp.mjs';

const BOARD = { leaderboard: 'Test arena', source: 'https://example.com/arena' };
const q = (rank, as_of = '2026-10-05') => ({ ...BOARD, rank, as_of });
const reg = {
  models: [
    { model_id: 'top', provider: 'maker-a', modality: 'image', tier: 'flagship', last_verified: '2026-10-05', status: 'active', quality: q(1), routes: [{ provider: 'openai-image', endpoint_id: 'top-1', price: null }] },
    { model_id: 'mid', provider: 'maker-a', modality: 'image', tier: 'flagship', last_verified: '2026-10-05', status: 'active', quality: [q(9), q(3)], routes: [{ provider: 'fal', endpoint_id: 'fal/mid', price: { amount: 0.05, currency: 'USD', per: 'image' } }] },
    { model_id: 'habit', provider: 'maker-b', modality: 'image', tier: 'flagship', est_unit_cost: { amount: 0.03 }, last_verified: '2026-10-05', status: 'active', quality: q(41), routes: [{ provider: 'fal', endpoint_id: 'fal/habit', price: { amount: 0.03, currency: 'USD', per: 'image' } }] },
    { model_id: 'unranked', provider: 'maker-c', modality: 'image', tier: 'flagship', est_unit_cost: { amount: 0.01 }, last_verified: '2026-10-05', status: 'active', routes: [{ provider: 'fal', endpoint_id: 'fal/unranked', price: { amount: 0.01, currency: 'USD', per: 'image' } }] },
    { model_id: 'cheap-draft', provider: 'maker-c', modality: 'image', tier: 'draft', est_unit_cost: { amount: 0.002 }, last_verified: '2026-10-05', status: 'active', routes: [{ provider: 'fal', endpoint_id: 'fal/draft' }] },
  ],
};
const adapters = { fal: { status: 'live', missing_env: [] }, 'openai-image': { status: 'live', missing_env: ['OPENAI_API_KEY'] } };

test('F54: a fresh leaderboard rank leads, then tier; the unreachable #1 is shown with what it needs', () => {
  const all = route(reg, { modality: 'image', today: '2026-10-05' });
  assert.deepEqual(all.chain, ['top', 'mid', 'habit'], 'a ranked #41 flagship still comes after #1 and #3, and before unranked ones');
  assert.equal(all.candidates[1].rank, 3, 'the best of several boards counts');
  const fal = route(reg, { modality: 'image', providers_available: ['fal'], adapters, today: '2026-10-05' });
  assert.deepEqual(fal.chain, ['mid', 'habit', 'unranked']);
  assert.equal(fal.best_now.model_id, 'top');
  assert.equal(fal.best_now.reachable, false);
  const needs = fal.best_now.endpoints[0].needs.join('; ');
  assert.match(needs, /openai-image is not in --providers/);
  assert.match(needs, /OPENAI_API_KEY set/);
  assert.match(needs, /verified openai-image price/);
  assert.ok(fal.warnings.some((w) => /best-ranked model, top \(#1\), is not reachable here/.test(w)), fal.warnings.join('\n'));
  // a probe still goes to the draft model first
  assert.equal(route(reg, { modality: 'image', tier: 'draft', today: '2026-10-05' }).chain[0], 'cheap-draft');
});

test('F55: a rank older than 30 days does not count and is named with its date; a missing rank is named too', () => {
  const old = route(reg, { modality: 'image', today: '2026-11-10' });
  assert.equal(old.candidates.find((c) => c.model_id === 'top').rank, null);
  assert.ok(old.warnings.some((w) => /leaderboard rank is stale: .*top #1 as of 2026-10-05.*re-check the live leaderboard \(https:\/\/example.com\/arena\) before a paid batch/.test(w)), old.warnings.join('\n'));
  assert.equal(old.best_now.fresh, false);
  const fal = route(reg, { modality: 'image', providers_available: ['fal'], today: '2026-10-05' });
  assert.ok(fal.warnings.some((w) => /no leaderboard rank recorded for top candidate\(s\) unranked/.test(w)), fal.warnings.join('\n'));
  assert.equal(leaderboardWarning(reg, 'image', '2026-10-20'), null);
  assert.match(leaderboardWarning(reg, 'image', '2026-11-10'), /from 2026-10-05 \(36 days old\); re-check the live leaderboard/);
  assert.match(leaderboardWarning(reg, 'video', '2026-10-05'), /no leaderboard rank is recorded for any video model/);
});

const live = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'registry', 'models.json'), 'utf8'));

test('F60: fal serves GPT Image 2.5 Sunburst, so it is the reachable #1 with FAL_KEY; FLUX.2 pro no longer leads', () => {
  const r = route(live(), { modality: 'image', providers_available: ['fal'], adapters: { fal: { status: 'live', missing_env: [] } }, today: '2026-10-05' });
  assert.equal(r.chain[0], 'gpt-image-2.5-sunburst');
  assert.equal(r.chain[1], 'gpt-image-2');
  assert.deepEqual(r.candidates[0].endpoints, [{ provider: 'fal', endpoint_id: 'openai/gpt-image-2.5/sunburst/text-to-image', priced: true, token_priced: true }]);
  assert.equal(r.best_now.model_id, 'gpt-image-2.5-sunburst');
  assert.equal(r.best_now.reachable, true);
  assert.notEqual(route(live(), { modality: 'image', today: '2026-10-05' }).chain[0], 'flux-2-pro');
  const text = fs.readFileSync(path.join(ROOT, 'registry', 'models.json'), 'utf8');
  assert.doesNotMatch(text, /not (served by|on) fal|call it at OpenAI/i, 'no registry note may say gpt-image-2.5 is OpenAI-only');
  // only the three ranks the field test read are recorded
  const ranked = live().models.filter((m) => m.quality).map((m) => [m.model_id, m.quality.rank]);
  assert.deepEqual(ranked.sort(), [['flux-2-pro', 41], ['gpt-image-2', 3], ['gpt-image-2.5-sunburst', 1]]);
});

test('F58, F60: a per-token route is estimated only from a token_estimate, and says why otherwise', () => {
  const req = { provider: 'fal', model: 'openai/gpt-image-2.5/sunburst/text-to-image', inputs: { prompt: 'a cup', params: { quality: 'high' } } };
  assert.equal(estimateFromRegistry(req), null);
  assert.match(priceRequest(req).reason, /token-priced route: no token_estimate for input_text, output_image/);
  const est = estimateFromRegistry({ ...req, token_estimate: { input_text: 100, output_image: 1500 } });
  assert.equal(est.amount, 0.0455, '100 x 5/1M + 1500 x 30/1M');
  assert.match(est.basis, /uncached/);
  // an edit also needs its input image tokens
  assert.match(priceRequest({ ...req, inputs: { ...req.inputs, images: ['a.png'] }, token_estimate: { input_text: 100, output_image: 1500 } }).reason, /input_image/);
});

test('F57: fal GPT Image 2 is priced per quality at 1024x1024 only', () => {
  const est = (params) => estimateFromRegistry({ provider: 'fal', model: 'openai/gpt-image-2', inputs: { params } });
  assert.equal(est({ quality: 'low', image_size: 'square_hd' }).amount, 0.006);
  assert.equal(est({ quality: 'medium', image_size: { width: 1024, height: 1024 } }).amount, 0.053);
  assert.equal(est({ quality: 'high', size: '1024x1024' }).amount, 0.211);
  assert.equal(est({ quality: 'medium', image_size: 'square_hd', num_images: 2 }).amount, 0.106);
  const why = (params) => priceRequest({ provider: 'fal', model: 'openai/gpt-image-2', inputs: { params } });
  assert.equal(why({ quality: 'high', size: '1536x1024' }).estimate, null);
  assert.match(why({ quality: 'high', size: '1536x1024' }).reason, /1536x1024 has no verified price/);
  assert.match(why({ quality: 'high', image_size: 'landscape_16_9' }).reason, /no verified price/);
  assert.match(why({ image_size: 'square_hd' }).reason, /priced by quality \(low\|medium\|high\) and the request names none/);
  assert.match(why({ quality: 'low' }).reason, /no output size given/);
  // the OpenAI route itself is unpriced, with the reason
  assert.match(priceRequest({ provider: 'openai-image', model: 'gpt-image-2.5-sunburst', inputs: {} }).reason, /bills this model by tokens/);
});

// ---------- openai-image adapter, against a stubbed fetch (no network) ----------
const KEY = 'sk-test-not-a-real-key-0000';
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const wsp = () => {
  const d = tmpDir('cstack-oai-');
  fs.writeFileSync(path.join(d, 'cstack.config.yaml'), 'budget:\n  currency: USD\n  per_run: 1\n  per_day: 3\n');
  return d;
};
const oreq = (n, extra = {}) => ({ provider: 'openai-image', model: 'gpt-image-2.5-sunburst', operation: 'text_to_image', inputs: { prompt: `a cup ${n}`, params: { size: '1024x1024', quality: 'high', n: 1 } }, out_dir: 'work/gen', out_prefix: `oai-${n}`, confirm_unpriced: true, ...extra });

async function withFetch(fake, fn) {
  const real = globalThis.fetch;
  const had = 'OPENAI_API_KEY' in process.env;
  const old = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = KEY;
  globalThis.fetch = fake;
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
    if (had) process.env.OPENAI_API_KEY = old;
    else delete process.env.OPENAI_API_KEY;
  }
}

test('F56: openai-image generates through the runner and writes the b64 PNG; the key goes only to api.openai.com', async () => {
  const ws = wsp();
  const calls = [];
  const res = await withFetch(async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ created: 1, data: [{ b64_json: PNG_1PX }], usage: { output_tokens: 1 } }), { status: 200, headers: { 'x-request-id': 'req_test_1' } });
  }, () => runMedia(ws, oreq(1), { provider: openaiImage, poll_interval_ms: 1 }));
  assert.equal(res.row.status, 'ok', JSON.stringify(res.row));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/images/generations');
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${KEY}`);
  assert.deepEqual(JSON.parse(calls[0].init.body), { model: 'gpt-image-2.5-sunburst', prompt: 'a cup 1', size: '1024x1024', quality: 'high', n: 1 });
  const out = path.join(ws, res.output_ids[0]);
  assert.match(out, /\.png$/);
  const { width, height } = imageSize(out);
  assert.deepEqual([width, height], [1, 1]);
  assert.equal(fs.readFileSync(out).subarray(1, 4).toString(), 'PNG');
  assert.deepEqual(res.row.provider_request_ids, ['req_test_1']);
  assert.ok(!fs.readFileSync(path.join(ws, 'state', 'cost-ledger.jsonl'), 'utf8').includes(KEY));
  assert.ok(!fs.readFileSync(`${out}.gen.json`, 'utf8').includes(KEY));
});

test('F56: an edit goes multipart to /v1/images/edits', async () => {
  const ws = wsp();
  const img = path.join(ws, 'ref.png');
  fs.writeFileSync(img, Buffer.from(PNG_1PX, 'base64'));
  let seen;
  const res = await withFetch(async (url, init) => {
    seen = { url, body: init.body };
    return new Response(JSON.stringify({ data: [{ b64_json: PNG_1PX }] }), { status: 200 });
  }, () => runMedia(ws, oreq(2, { operation: 'edit', inputs: { prompt: 'make it blue', images: [img], params: { quality: 'low' } } }), { provider: openaiImage, poll_interval_ms: 1 }));
  assert.equal(res.row.status, 'ok', JSON.stringify(res.row));
  assert.equal(seen.url, 'https://api.openai.com/v1/images/edits');
  assert.ok(seen.body instanceof FormData);
  assert.equal(seen.body.get('model'), 'gpt-image-2.5-sunburst');
  assert.equal(seen.body.getAll('image[]').length, 1);
});

test('F56: a 400 and a DNS failure are not charged, and the key never reaches an error or a ledger row', async () => {
  const ws = wsp();
  const bad = await withFetch(async () => new Response(`{"error":{"message":"Invalid size; your key ${KEY} is fine"}}`, { status: 400 }), () => runMedia(ws, oreq(3), { provider: openaiImage, poll_interval_ms: 1 }));
  assert.equal(bad.failed, true);
  assert.equal(bad.row.charged, false);
  assert.match(bad.row.error, /openai HTTP 400/);
  assert.match(bad.row.error, /<key>/);
  const dns = await withFetch(async () => {
    throw Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }) });
  }, () => runMedia(ws, oreq(4), { provider: openaiImage, poll_interval_ms: 1 }));
  assert.equal(dns.row.charged, false);
  const ledger = fs.readFileSync(path.join(ws, 'state', 'cost-ledger.jsonl'), 'utf8');
  assert.ok(!ledger.includes(KEY), 'no ledger row carries the key');
  assert.ok(readLedger(ws).every((r) => r.charged === false || r.status === 'dry_run'));
});

test('F56: the key is refused for any origin but https://api.openai.com, before anything is sent', async () => {
  let called = 0;
  await withFetch(async () => {
    called++;
    return new Response('{}');
  }, async () => {
    for (const url of ['https://api.openai.com.evil.example/v1/images/generations', 'http://api.openai.com/v1/images/generations', 'https://queue.fal.run/x', 'not a url']) {
      const err = await openaiFetch(url, { method: 'POST' }).then(() => null, (e) => e);
      assert.ok(err, url);
      assert.equal(err.not_submitted, true, url);
      assert.ok(!err.message.includes(KEY));
    }
  });
  assert.equal(called, 0);
  // and without a key nothing is sent either
  const saved = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const err = await openaiImage.submit(oreq(5)).then(() => null, (e) => e);
    assert.equal(err.not_submitted, true);
  } finally {
    if (saved != null) process.env.OPENAI_API_KEY = saved;
  }
  assert.equal(openaiImage.available({}), false);
  assert.equal(openaiImage.available({ OPENAI_API_KEY: 'x' }), true);
});
