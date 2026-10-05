// F21: what the provider billed, next to what cstack estimated. No network: fal's API is mocked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { guardedCall, readLedger } from '../scripts/lib/ledger.mjs';
import { reconcile, billedVsEstimated, toReconcile } from '../scripts/lib/billing.mjs';
import { falBilling, parseFalBilling } from '../providers/fal.mjs';
import { readJSONL } from '../scripts/lib/core.mjs';
import { validateValue } from '../scripts/lib/schemas.mjs';
import { tmpDir } from './tmp.mjs';

const ws = () => {
  const d = tmpDir('cstack-bill-');
  fs.writeFileSync(path.join(d, 'cstack.config.yaml'), YAML.stringify({ brand_id: 't', budget: { currency: 'USD', per_run: 1, per_day: 2, confirm_over: 1 } }));
  return d;
};
const call = (w, n, id) => guardedCall(w, { provider: 'fal', model: 'fal-ai/flux-2/klein/4b', operation: 'text_to_image', input_hashes: [String(n)], estimated_cost: { amount: 0.011, currency: 'USD' }, stop_condition: 'one', max_retries: 0 }, async () => ({ output_ids: [`o${n}.png`], request_ids: [id] }));

test('billing: an ok call records the provider request id', async () => {
  const w = ws();
  await call(w, 1, 'req-1');
  const row = readLedger(w).at(-1);
  assert.deepEqual(row.provider_request_ids, ['req-1']);
  assert.ok(validateValue('cost-ledger-entry', row).ok);
});

test('billing: fal billing events parse defensively and name the field used', () => {
  assert.deepEqual(parseFalBilling({ billing_events: [{ request_id: 'a', cost_total: 0.012, currency: 'USD' }] }, 'a'), { status: 'billed', billed: { amount: 0.012, currency: 'USD' }, basis: 'fal billing-events cost_total' });
  assert.equal(parseFalBilling({ items: [{ request_id: 'a', cost_estimate_nano_usd: 5000000 }] }, 'a').billed.amount, 0.005);
  assert.equal(parseFalBilling({ billing_events: [{ request_id: 'b', cost_total: 1 }] }, 'a').status, 'not_found');
  assert.match(parseFalBilling([{ request_id: 'a', units: 1 }], 'a').error, /no cost field/);
});

test('billing: the lookup goes to api.fal.ai with the admin key, and never prints it', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, auth: init.headers.Authorization };
    return { ok: false, status: 403, text: async () => 'forbidden for key-secret-123' };
  };
  await assert.rejects(falBilling('r 1', { fetchImpl, env: { FAL_ADMIN_KEY: 'key-secret-123' } }), (e) => !e.message.includes('key-secret-123') && /HTTP 403/.test(e.message));
  assert.equal(seen.url, 'https://api.fal.ai/v1/models/billing-events?request_id=r%201');
  assert.equal(seen.auth, 'Key key-secret-123');
  await assert.rejects(falBilling('x', { env: {} }), /FAL_ADMIN_KEY/);
});

test('billing: reconcile appends billed rows, retries what is not billed yet, and checks the 25% band', async () => {
  const w = ws();
  await call(w, 1, 'req-1');
  await call(w, 2, 'req-2');
  await call(w, 3, 'req-3');
  const billed = { 'req-1': 0.012, 'req-2': 0.013 };
  const lookup = async (id) => (id === 'req-3' ? { status: 'not_found' } : { status: 'billed', billed: { amount: billed[id], currency: 'USD' }, basis: 'test' });
  assert.equal((await reconcile(w, { provider: 'fal', dry_run: true })).asked, 3);
  assert.equal(readJSONL(path.join(w, 'state', 'billing.jsonl')).length, 0, 'a dry run fetches and writes nothing');
  const r = await reconcile(w, { provider: 'fal', lookup });
  assert.deepEqual(r.rows.map((x) => x.status), ['billed', 'billed', 'not_found']);
  for (const row of readJSONL(path.join(w, 'state', 'billing.jsonl'))) assert.ok(validateValue('billing-record', row).ok, JSON.stringify(row));
  assert.deepEqual(toReconcile(w, { provider: 'fal' }).map((x) => x.request_id), ['req-3'], 'only the unbilled request is asked again');
  const c = billedVsEstimated(w, { provider: 'fal' });
  assert.equal(c.requests, 2);
  assert.equal(c.billed, 0.025);
  assert.equal(c.estimated, 0.022);
  assert.equal(c.drift, 0.136);
  assert.equal(c.within, true);
  await reconcile(w, { provider: 'fal', lookup: async () => ({ status: 'billed', billed: { amount: 0.03, currency: 'USD' } }) });
  assert.equal(billedVsEstimated(w, { provider: 'fal' }).within, false, '0.055 billed against 0.033 estimated is outside 25%');
  const failing = await reconcile(ws(), { provider: 'fal', lookup: async () => { throw new Error('down'); } });
  assert.equal(failing.asked, 0);
});
