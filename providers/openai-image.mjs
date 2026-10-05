// OpenAI image adapter (Images API). Model ids are NOT hard-coded here: callers pass `model` from registry/models.json
// (the openai-image routes: gpt-image-2, gpt-image-2.5-sunburst, gpt-image-2.5-flare).
// Auth: OPENAI_API_KEY environment variable, sent only to https://api.openai.com. Never logged; errors are scrubbed.
// API used: POST /v1/images/generations with JSON {model, prompt, size, quality, n, ...}; POST /v1/images/edits as
// multipart when the request carries input images. Both answer synchronously with data[].b64_json, so submit() makes
// the call and keeps the images in memory for result(); status() is then done at once.
// OpenAI bills these models by tokens. Without a verified per-token price the call is unpriced (the registry route
// says why), so the budget's unpriced rules apply. Verify current parameters in OpenAI's docs before relying on new ones.
import fs from 'node:fs';
import path from 'node:path';
import { notSent, neverSent } from './errors.mjs';

const KEY = () => process.env.OPENAI_API_KEY;
const scrub = (s) => (KEY() ? String(s).replaceAll(KEY(), '<key>') : String(s));

// The key goes to OpenAI's API host and nowhere else; a base-URL override is deliberately not read from the env.
const OPENAI_ORIGINS = new Set(['https://api.openai.com']);
const API = 'https://api.openai.com/v1';

function openaiUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw notSent(new Error(`refusing to call a non-URL with OPENAI_API_KEY: ${String(url).slice(0, 80)}`));
  }
  if (!OPENAI_ORIGINS.has(u.origin)) throw notSent(new Error(`refusing to send OPENAI_API_KEY to ${u.origin} (only ${[...OPENAI_ORIGINS].join(', ')})`));
  return u.href;
}

/** One authenticated request. Returns {body, request_id}; throws scrubbed errors, not_submitted when nothing left. */
export async function openaiFetch(url, init = {}) {
  url = openaiUrl(url);
  if (!KEY()) throw notSent(new Error('OPENAI_API_KEY is not set (auth): configure it in your shell or secret store'));
  let res;
  try {
    res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${KEY()}`, ...(init.headers ?? {}) } });
  } catch (err) {
    const e = new Error(scrub(`openai request failed: ${err?.cause?.code ?? err?.code ?? err?.message ?? err}`));
    throw neverSent(err) ? notSent(e) : e;
  }
  const text = await res.text();
  // "HTTP <code>" is what the runner reads: a 4xx at submit never ran and is booked as not charged
  if (!res.ok) throw new Error(scrub(`openai HTTP ${res.status}: ${text.slice(0, 400)}`));
  return { body: text ? JSON.parse(text) : {}, request_id: res.headers?.get?.('x-request-id') ?? null };
}

const MIME = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

// An input image as a multipart file part: a local path or a data URI. Remote URLs are refused before anything is sent.
function filePart(p) {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(p);
  if (m) return { blob: new Blob([Buffer.from(m[2], 'base64')], { type: m[1] }), name: `input.${m[1].split('/')[1] ?? 'png'}` };
  if (/^https?:/i.test(p)) throw notSent(new Error(`openai edits take local files or data URIs, not URLs: ${String(p).slice(0, 80)}`));
  const ext = path.extname(p).slice(1).toLowerCase();
  return { blob: new Blob([fs.readFileSync(p)], { type: MIME[ext] ?? 'image/png' }), name: path.basename(p) };
}

// Results of calls made by this process, kept until result() collects them (the API is synchronous).
const held = new Map();
let seq = 0;

export const openaiImage = {
  interfaces: ['media'],
  env: ['OPENAI_API_KEY'],
  available: (env) => !!env.OPENAI_API_KEY,
  async submit(req) {
    if (!KEY()) throw notSent(new Error('OPENAI_API_KEY is not set (auth): configure it in your shell or secret store'));
    const { prompt, images = [], mask, params = {} } = req.inputs ?? {};
    let r;
    if (images.length) {
      const form = new FormData();
      form.append('model', req.model);
      form.append('prompt', prompt ?? '');
      for (const p of images) {
        const f = filePart(p);
        form.append('image[]', f.blob, f.name);
      }
      if (mask) {
        const f = filePart(mask);
        form.append('mask', f.blob, f.name);
      }
      for (const [k, v] of Object.entries(params)) if (v != null) form.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      r = await openaiFetch(`${API}/images/edits`, { method: 'POST', body: form });
    } else {
      r = await openaiFetch(`${API}/images/generations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: req.model, prompt, ...params }) });
    }
    const ext = String(r.body.output_format ?? params.output_format ?? 'png').replace('jpeg', 'jpg');
    const outputs = (r.body.data ?? []).map((d) => (d.b64_json ? { bytes: Buffer.from(d.b64_json, 'base64'), ext } : d.url ? { url: d.url, ext } : null)).filter(Boolean);
    if (!outputs.length) throw new Error(scrub(`openai returned no images: ${JSON.stringify(r.body).slice(0, 300)}`));
    const job_id = r.request_id ?? `openai-${r.body.created ?? Date.now()}-${++seq}`;
    held.set(job_id, { outputs, usage: r.body.usage ?? null });
    return { job_id };
  },
  async status(job) {
    if (held.has(job.job_id)) return { state: 'done' };
    // a pending file from an earlier, crashed run: the call was made and paid, but its images lived in that process
    return { state: 'failed', error: `openai job ${job.job_id} was answered to an earlier run whose images were not kept; check the OpenAI dashboard before calling again` };
  },
  async result(job) {
    const r = held.get(job.job_id);
    if (!r) throw new Error(`openai job ${job.job_id}: no result held by this process`);
    held.delete(job.job_id);
    // token usage is reported, never priced here: without a verified per-token price the cost stays null
    return { outputs: r.outputs, seed: null, cost: null, usage: r.usage };
  },
  async download(url, file) {
    // only reached when the API returns a URL instead of b64_json; no key is sent with it
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download HTTP ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  },
  estimate: () => null, // use the registry route's price; null means "unpriced", never guessed
};
