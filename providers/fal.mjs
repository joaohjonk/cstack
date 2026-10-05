// fal adapter (queue API). Model ids are NOT hard-coded here: callers pass `model` from registry/models.json.
// Auth: FAL_KEY environment variable. Never logged; errors are scrubbed.
// Queue semantics used: POST https://queue.fal.run/<model> → {request_id, status_url, response_url};
// GET status_url → {status: IN_QUEUE|IN_PROGRESS|COMPLETED|...}; GET response_url → result JSON.
// Verify current details in fal docs before relying on new parameters (registry `last_verified`).
import fs from 'node:fs';
import path from 'node:path';

const KEY = () => process.env.FAL_KEY;
const scrub = (s) => (KEY() ? String(s).replaceAll(KEY(), '<key>') : String(s));

// FAL_KEY goes only to fal's queue host. status_url/response_url come from a response and are persisted in an
// editable pending-job file, so they are checked before every authenticated request.
const FAL_ORIGINS = new Set(['https://queue.fal.run']);
function falUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`refusing to call a non-URL with FAL_KEY: ${String(url).slice(0, 80)}`);
  }
  if (!FAL_ORIGINS.has(u.origin)) throw new Error(`refusing to send FAL_KEY to ${u.origin} (only ${[...FAL_ORIGINS].join(', ')})`);
  return u.href;
}

async function http(url, init = {}) {
  url = falUrl(url);
  const res = await fetch(url, { ...init, headers: { Authorization: `Key ${KEY()}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(scrub(`fal HTTP ${res.status}: ${text.slice(0, 400)}`));
  return text ? JSON.parse(text) : {};
}

function toDataUri(p, mime) {
  const ext = path.extname(p).slice(1).toLowerCase();
  const m = mime ?? (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');
  return `data:${m};base64,${fs.readFileSync(p).toString('base64')}`;
}

export const fal = {
  interfaces: ['media'],
  env: ['FAL_KEY'],
  available: (env) => !!env.FAL_KEY,
  async submit(req) {
    if (!KEY()) throw new Error('FAL_KEY is not set (auth): configure it in your shell or secret store');
    const { prompt, images = [], params = {} } = req.inputs ?? {};
    // Reference images: callers pre-resize (cost scales with input pixels on some endpoints).
    const body = { prompt, ...params };
    if (images.length) body[req.image_field ?? 'image_urls'] = images.map((p) => (/^https?:|^data:/.test(p) ? p : toDataUri(p)));
    const r = await http(`https://queue.fal.run/${req.model}`, { method: 'POST', body: JSON.stringify(body) });
    return { job_id: r.request_id, status_url: r.status_url, response_url: r.response_url };
  },
  async status(job) {
    falUrl(job.status_url); // a tampered job fails loudly; it is not "still running"
    try {
      const s = await http(job.status_url);
      if (s.status === 'COMPLETED') return { state: 'done' };
      if (['FAILED', 'ERROR', 'CANCELLED'].includes(s.status)) return { state: 'failed', error: scrub(JSON.stringify(s).slice(0, 400)) };
      return { state: s.status === 'IN_PROGRESS' ? 'running' : 'queued' };
    } catch (e) {
      // transient status errors are not job failures; keep polling
      return { state: 'running', note: scrub(e.message) };
    }
  },
  async result(job) {
    // a result-fetch failure is retried here (the job is paid already); never resubmit
    falUrl(job.response_url);
    let last;
    for (let i = 0; i < 5; i++) {
      try {
        const r = await http(job.response_url);
        const imgs = r.images ?? (r.image ? [r.image] : []);
        const vids = r.video ? [r.video] : [];
        return {
          outputs: [...imgs, ...vids].map((o) => ({ url: o.url, ext: (o.content_type ?? '').split('/')[1]?.replace('jpeg', 'jpg') ?? 'png' })),
          seed: r.seed ?? null,
          cost: null, // fal bills asynchronously; reconcile from billing later, never infer from balance deltas
        };
      } catch (e) {
        last = e;
        await new Promise((res) => setTimeout(res, 3000 * (i + 1)));
      }
    }
    throw last;
  },
  async download(url, file) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download HTTP ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  },
  estimate: () => null, // use registry pricing_snapshot; null means "unpriced", never guessed
  billing: falBilling,
};

// What fal billed for one request, from its Platform API (GET https://api.fal.ai/v1/models/billing-events, filtered
// by request_id; needs an admin key: FAL_ADMIN_KEY, else FAL_KEY). fal bills asynchronously, so a fresh request
// may have no event yet. Field names are read defensively and the one used is reported as `basis`.
const BILLING_URL = 'https://api.fal.ai/v1/models/billing-events';
export async function falBilling(requestId, { fetchImpl = fetch, env = process.env } = {}) {
  const key = env.FAL_ADMIN_KEY ?? env.FAL_KEY;
  if (!key) throw new Error('FAL_ADMIN_KEY (or FAL_KEY) is not set; fal billing events need an admin key');
  const url = `${BILLING_URL}?request_id=${encodeURIComponent(requestId)}`;
  const res = await fetchImpl(url, { headers: { Authorization: `Key ${key}`, Accept: 'application/json' } });
  const text = await res.text();
  const clean = (t) => String(t).replaceAll(key, '<key>');
  if (!res.ok) throw new Error(clean(`fal billing HTTP ${res.status}: ${text.slice(0, 300)}`));
  return parseFalBilling(text ? JSON.parse(text) : {}, requestId);
}

export function parseFalBilling(body, requestId) {
  const list = Array.isArray(body) ? body : body.billing_events ?? body.events ?? body.items ?? body.data ?? [];
  const mine = list.filter((e) => String(e?.request_id ?? e?.requestId ?? '') === String(requestId));
  if (!mine.length) return { status: 'not_found' };
  let amount = 0;
  let basis = null;
  for (const e of mine) {
    if (Number.isFinite(Number(e.cost_total))) {
      amount += Number(e.cost_total);
      basis = 'cost_total';
    } else if (Number.isFinite(Number(e.cost_estimate_nano_usd))) {
      amount += Number(e.cost_estimate_nano_usd) / 1e9;
      basis = 'cost_estimate_nano_usd';
    } else if (Number.isFinite(Number(e.cost_subtotal))) {
      amount += Number(e.cost_subtotal) - (Number(e.cost_discount) || 0);
      basis = 'cost_subtotal - cost_discount';
    } else return { status: 'error', error: `billing event for ${requestId} carries no cost field (keys: ${Object.keys(e).join(', ')})` };
  }
  const currency = String(mine[0].currency ?? 'USD').toUpperCase();
  return { status: 'billed', billed: { amount: Math.round(amount * 1e6) / 1e6, currency }, basis: `fal billing-events ${basis}${mine.length > 1 ? ` (${mine.length} events)` : ''}` };
}
