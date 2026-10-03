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
};
