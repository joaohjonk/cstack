// Media runner: the ONE choke point between skills and paid providers (public-repo-patterns #39).
// Skills never call provider HTTP directly. This runner owns:
//   - idempotency: hash(provider, model, operation, inputs, recipe, params) → dedupe completed jobs
//   - pending jobs claimed (wx) BEFORE submit (state/pending-jobs/<key>.json); a second identical run sees the
//     claim and waits instead of paying twice; a poll timeout never resubmits, the next run re-attaches
//   - outputs stay inside the workspace and never overwrite an earlier file (wx; a taken name gets a key suffix)
//   - the spend guard (budget envelope, dry run) via ledger.guardedCall
//   - transient-only retries; policy/content failures surface immediately
//   - a generation sidecar `<output>.gen.json` next to every downloaded file
//   - a size audit when an expected size is given
//   - two rights gates before anything is paid: no canon name or "style of" phrase in the prompt, and no
//     third-party capture (work/browse/, reference_only) as an input image unless req.capture_rights names the rights
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, exists, readJSON, writeJSON, nowISO, sha256File, hashValue, assertNotOfficial } from '../scripts/lib/core.mjs';
import { guardedCall, idempotencyKey } from '../scripts/lib/ledger.mjs';
import { imageSize, sizeAudit, parseExpected } from '../scripts/lib/image.mjs';
import { getProvider } from './index.mjs';
import { canonNames, styleLeaks } from '../scripts/lib/prompt-names.mjs';

const pendingDir = (ws) => path.join(ws, 'state', 'pending-jobs');

export function listPending(ws) {
  if (!exists(pendingDir(ws))) return [];
  return fs.readdirSync(pendingDir(ws)).filter((f) => f.endsWith('.json')).map((f) => readJSON(path.join(pendingDir(ws), f)));
}

/**
 * runMedia(ws, req, opts)
 * req: {provider, model, operation, inputs: {prompt, images:[paths], params}, recipe_hash, out_dir, out_prefix,
 *       expected_size?: {width,height}|{aspect}, estimated_cost?, skill?, experiment_id?}
 * opts: {dry_run, poll_timeout_ms, poll_interval_ms}
 */
// Estimate from the dated registry's est_unit_cost (per image, second, megapixel or operation); null when unpriced.
// A model's own price is its maker's. A call through a host (fal, Replicate ...) is priced only from that host's route
// (models[].routes: endpoint id + price); without one the call is unpriced, never billed at the maker's list price.
export function registryPrice(req, models = loadModels()) {
  for (const m of models) {
    const r = (m.routes ?? []).find((x) => x.provider === req.provider && x.endpoint_id === req.model);
    if (r) return { model: m, unit: r.price ?? null, route: true, basis: `${r.provider} route ${r.endpoint_id} (verified ${r.last_verified})${r.price ? '' : ` has no price${r.notes ? `: ${r.notes}` : ''}`}` };
  }
  const m = models.find((x) => x.model_id === req.model || x.provider_model_id === req.model);
  if (!m) return { model: null, unit: null, basis: 'not in registry/models.json' };
  if (req.provider && m.provider !== req.provider) {
    const r = (m.routes ?? []).find((x) => x.provider === req.provider);
    return r ? { model: m, unit: r.price ?? null, route: true, basis: `${r.provider} route ${r.endpoint_id}`, endpoint_id: r.endpoint_id } : { model: m, unit: null, basis: `${m.model_id} has a ${m.provider} price but no ${req.provider} route; add one to registry/models.json or pass estimated_cost` };
  }
  return { model: m, unit: m.est_unit_cost ?? null, basis: 'registry est_unit_cost' };
}

// fal's image_size names; a megapixel is 2^20 pixels, as fal counts it (1920x1080 = 1.98, billed as 2)
const NAMED_SIZES = { square_hd: [1024, 1024], square: [512, 512], portrait_4_3: [768, 1024], portrait_16_9: [576, 1024], landscape_4_3: [1024, 768], landscape_16_9: [1024, 576] };
const MP = 2 ** 20;
const CAP_MP = 4; // the FLUX.2 limit; an input whose size cannot be read is counted at it

// Megapixels billed per output image, with what had to be assumed. Every image (each input, each output) is rounded up
// on its own, which is never less than rounding the sum, so a host that does not state its rounding is not underestimated.
function megapixels(req, u) {
  const p = req.inputs?.params ?? {};
  const notes = [];
  const inputs = (u.counts === 'input_and_output' ? req.inputs?.images ?? [] : []).map((f) => {
    try {
      const { width, height } = imageSize(f);
      if (width && height) return Math.ceil((width * height) / MP);
    } catch {}
    notes.push(`input ${f} counted at ${CAP_MP} MP`);
    return CAP_MP;
  });
  let size = typeof p.image_size === 'string' ? NAMED_SIZES[p.image_size] : p.image_size?.width ? [p.image_size.width, p.image_size.height] : p.width && p.height ? [p.width, p.height] : null;
  let out;
  if (size) out = Math.ceil((size[0] * size[1]) / MP);
  else if (p.image_size === 'auto' && inputs.length) out = Math.max(...inputs);
  else {
    out = 1;
    notes.push(p.image_size ? `image_size ${JSON.stringify(p.image_size)} read as 1 MP` : 'no output size given, 1 MP assumed (fal default landscape_4_3)');
  }
  return { mp: out + inputs.reduce((a, b) => a + b, 0), notes };
}

export function estimateFromRegistry(req, models = loadModels()) {
  const price = registryPrice(req, models);
  const u = price.unit;
  if (!u?.amount) return null;
  const p = req.inputs?.params ?? {};
  const images = Number(p.num_images ?? p.n ?? 1);
  // megapixel pricing comes only from a dated host route; a maker's per-megapixel est_unit_cost is a heuristic and stays unpriced
  if (u.per === 'megapixel') {
    if (!price.route) return null;
    const { mp, notes } = megapixels(req, u);
    const each = u.first_amount != null ? u.first_amount + u.amount * (mp - 1) : u.amount * mp;
    return { amount: Math.round(each * images * 10000) / 10000, currency: u.currency ?? 'USD', basis: `${price.basis}, ${mp} MP x ${images} image(s), rounded up${notes.length ? `; ${notes.join('; ')}` : ''}` };
  }
  const qty = u.per === 'image' ? images : u.per === 'second' ? p.duration ?? p.seconds ?? null : u.per === 'operation' ? 1 : null;
  if (qty == null) return null;
  return { amount: Math.round(u.amount * Number(qty) * 10000) / 10000, currency: u.currency ?? 'USD', basis: `${price.basis}, per ${u.per}` };
}

function loadModels() {
  const f = path.join(ROOT, 'registry', 'models.json');
  if (!exists(f)) return [];
  const d = readJSON(f);
  return d.models ?? d;
}

// Where outputs go: inside the workspace, under a plain file stem. Checked before anything is paid.
export function outputTarget(ws, req, key) {
  const root = path.resolve(ws);
  const outDir = path.resolve(root, String(req.out_dir ?? 'work/out'));
  const r = path.relative(root, outDir);
  if (r.startsWith('..') || path.isAbsolute(r)) throw new Error(`out_dir must stay inside the workspace: ${req.out_dir}`);
  assertNotOfficial(outDir);
  const prefix = String(req.out_prefix ?? key.slice(0, 8));
  if (!/^[\w-][\w.-]{0,79}$/.test(prefix)) throw new Error(`out_prefix must be a plain file stem (letters, digits, _ . -): ${req.out_prefix}`);
  return { outDir, prefix };
}

// Claim a fresh output name with wx: `<prefix>_<n>.<ext>`, else `<prefix>-<key8>_<n>.<ext>`, else a counter. Never overwrites.
function claimOutput(outDir, prefix, key, n, ext) {
  const stems = [prefix, `${prefix}-${key.slice(0, 8)}`, ...Array.from({ length: 50 }, (_, i) => `${prefix}-${key.slice(0, 8)}-${i + 2}`)];
  for (const stem of stems) {
    const file = path.join(outDir, `${stem}_${n}.${ext}`);
    if (exists(`${file}.gen.json`)) continue;
    try {
      fs.closeSync(fs.openSync(file, 'wx'));
      return file;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
  throw new Error(`no free output name for ${prefix}_${n}.${ext} in ${outDir}`);
}

// Rights gates, checked before any spend. Throws with every problem listed.
export function rightsCheck(ws, req, names = canonNames()) {
  const problems = styleLeaks(req.inputs?.prompt, names).map((p) => `prompt ${p}`);
  const browse = path.join(path.resolve(ws), 'work', 'browse') + path.sep;
  const captured = (req.inputs?.images ?? []).filter((p) => typeof p === 'string' && path.resolve(ws, p).startsWith(browse));
  if (captured.length && !(typeof req.capture_rights === 'string' && req.capture_rights.trim()))
    problems.push(`input images are third-party captures (reference_only): ${captured.join(', ')}. Use them to brief, not to generate; set capture_rights only when the rights are recorded in lineage`);
  if (problems.length) {
    const e = new Error(`rights check failed:\n- ${problems.join('\n- ')}`);
    e.policy = true;
    throw e;
  }
}

export async function runMedia(ws, req, opts = {}) {
  rightsCheck(ws, req);
  const provider = getProvider(req.provider);
  if (req.expected_size) parseExpected(req.expected_size); // a typo fails here, not after paying
  const input_hashes = (req.inputs?.images ?? []).map((p) => (exists(p) ? sha256File(p) : p));
  const spec = {
    provider: req.provider,
    model: req.model,
    operation: req.operation,
    input_hashes,
    prompt_recipe_hash: req.recipe_hash ?? '',
    params: req.inputs?.params ?? {},
    prompt_hash: req.inputs?.prompt ? hashValue(req.inputs.prompt) : '',
    estimated_cost: req.estimated_cost ?? provider.estimate?.(req) ?? estimateFromRegistry(req),
    unpriced_reason: req.estimated_cost ?? provider.estimate?.(req) ? undefined : registryPrice(req).basis,
    skill: req.skill,
    experiment_id: req.experiment_id,
    dry_run: opts.dry_run ?? req.dry_run,
    confirm_unpriced: opts.confirm_unpriced ?? req.confirm_unpriced,
    confirmed: opts.confirmed ?? req.confirmed,
  };
  const key = idempotencyKey(spec);
  const { outDir, prefix } = outputTarget(ws, req, key);
  const pendingPath = path.join(pendingDir(ws), `${key.slice(0, 24)}.json`);
  const prior = exists(pendingPath) ? readJSON(pendingPath) : null;
  if (prior?.job_id) spec.reattach = true; // already submitted and paid: collecting it is never budget-blocked

  return guardedCall(ws, spec, async () => {
    let job = exists(pendingPath) ? readJSON(pendingPath) : null;
    if (job?.status === 'submitting') {
      const e = new Error(`the same request is being submitted by another run (since ${job.claimed_at}); re-run later to re-attach. If that run crashed, check the provider dashboard, then delete ${path.relative(ws, pendingPath)}`);
      e.pending = true;
      throw e;
    }
    if (!job) {
      // claim first (wx): of two identical runs only one submits; the other sees "submitting" and waits
      fs.mkdirSync(pendingDir(ws), { recursive: true });
      try {
        fs.writeFileSync(pendingPath, JSON.stringify({ key, status: 'submitting', provider: req.provider, model: req.model, claimed_at: nowISO(), pid: process.pid }) + '\n', { flag: 'wx' });
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
        const e = new Error('the same request was just claimed by another run; re-run later to re-attach');
        e.pending = true;
        throw e;
      }
      let submitted;
      try {
        submitted = await provider.submit(req);
      } catch (err) {
        fs.rmSync(pendingPath, { force: true }); // nothing was accepted: release the claim so a retry can submit
        throw err;
      }
      job = { key, status: 'submitted', provider: req.provider, model: req.model, submitted_at: nowISO(), ...submitted, req: { ...req, inputs: { ...req.inputs, images: req.inputs?.images ?? [] } } };
      writeJSON(pendingPath, job); // persisted BEFORE polling: a crash or timeout re-attaches later
    }
    const deadline = Date.now() + (opts.poll_timeout_ms ?? 10 * 60 * 1000);
    for (;;) {
      const st = await provider.status(job);
      if (st.state === 'done') break;
      if (st.state === 'failed') {
        fs.rmSync(pendingPath, { force: true });
        throw new Error(st.error ?? 'provider reported failure');
      }
      if (Date.now() > deadline) {
        const e = new Error(`poll timeout; job ${job.job_id} left pending at ${path.relative(ws, pendingPath)} (never resubmitted)`);
        e.pending = true;
        throw e;
      }
      await new Promise((r) => setTimeout(r, opts.poll_interval_ms ?? 3000));
    }
    const result = await provider.result(job);
    fs.mkdirSync(outDir, { recursive: true });
    const outputs = [];
    for (const [i, o] of (result.outputs ?? []).entries()) {
      const ext = /^[a-z0-9]{1,5}$/i.test(o.ext ?? '') ? o.ext : 'png';
      const file = claimOutput(outDir, prefix, key, i + 1, ext);
      if (o.bytes) fs.writeFileSync(file, o.bytes);
      else if (o.url) await provider.download(o.url, file);
      let audit = null;
      if (req.expected_size) {
        try {
          audit = sizeAudit(imageSize(file), req.expected_size);
        } catch (e) {
          audit = { ok: false, findings: [{ level: 'fail', check: 'read', detail: e.message }] };
        }
      }
      const sidecar = {
        provider: req.provider,
        model: req.model,
        operation: req.operation,
        job_id: job.job_id,
        idempotency_key: key,
        prompt: req.inputs?.prompt,
        recipe_hash: req.recipe_hash,
        refs: req.inputs?.images ?? [],
        input_hashes,
        params: req.inputs?.params ?? {},
        seed: result.seed ?? null,
        size_audit: audit,
        cost: result.cost ?? null,
        created_at: nowISO(),
        skill: req.skill,
      };
      fs.writeFileSync(`${file}.gen.json`, JSON.stringify(sidecar, null, 2) + '\n', { flag: 'wx' });
      outputs.push(path.relative(ws, file));
    }
    fs.rmSync(pendingPath, { force: true });
    return { output_ids: outputs, actual_cost: result.cost ?? null };
  });
}
