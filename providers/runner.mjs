// Media runner: the ONE choke point between skills and paid providers (public-repo-patterns #39).
// Skills never call provider HTTP directly. This runner owns:
//   - idempotency: hash(provider, model, operation, inputs, recipe, params) → dedupe completed jobs
//   - pending jobs persisted at submit (state/pending-jobs/<key>.json); a poll timeout never resubmits,
//     the next run re-attaches to the same job instead of paying twice
//   - the spend guard (budget envelope, dry run) via ledger.guardedCall
//   - transient-only retries; policy/content failures surface immediately
//   - a generation sidecar `<output>.gen.json` next to every downloaded file
//   - a size audit when an expected size is given
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, exists, readJSON, writeJSON, nowISO, sha256File, hashValue } from '../scripts/lib/core.mjs';
import { guardedCall, idempotencyKey } from '../scripts/lib/ledger.mjs';
import { imageSize, sizeAudit } from '../scripts/lib/image.mjs';
import { getProvider } from './index.mjs';

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
export function estimateFromRegistry(req, models = loadModels()) {
  const m = models.find((x) => x.model_id === req.model);
  const u = m?.est_unit_cost;
  if (!u?.amount) return null;
  const p = req.inputs?.params ?? {};
  const qty = u.per === 'image' ? p.num_images ?? p.n ?? 1 : u.per === 'second' ? p.duration ?? p.seconds ?? null : u.per === 'operation' ? 1 : null;
  if (qty == null) return null;
  return { amount: Math.round(u.amount * Number(qty) * 10000) / 10000, currency: u.currency ?? 'USD', basis: `registry est_unit_cost per ${u.per}` };
}

function loadModels() {
  const f = path.join(ROOT, 'registry', 'models.json');
  if (!exists(f)) return [];
  const d = readJSON(f);
  return d.models ?? d;
}

export async function runMedia(ws, req, opts = {}) {
  const provider = getProvider(req.provider);
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
    skill: req.skill,
    experiment_id: req.experiment_id,
    dry_run: opts.dry_run ?? req.dry_run,
    confirm_unpriced: opts.confirm_unpriced ?? req.confirm_unpriced,
  };
  const key = idempotencyKey(spec);
  const pendingPath = path.join(pendingDir(ws), `${key.slice(0, 24)}.json`);

  return guardedCall(ws, spec, async () => {
    let job = exists(pendingPath) ? readJSON(pendingPath) : null;
    if (!job) {
      const submitted = await provider.submit(req);
      job = { key, provider: req.provider, model: req.model, submitted_at: nowISO(), ...submitted, req: { ...req, inputs: { ...req.inputs, images: req.inputs?.images ?? [] } } };
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
    const outDir = path.join(ws, req.out_dir ?? 'work/out');
    fs.mkdirSync(outDir, { recursive: true });
    const outputs = [];
    for (const [i, o] of (result.outputs ?? []).entries()) {
      const file = path.join(outDir, `${req.out_prefix ?? key.slice(0, 8)}_${i + 1}.${o.ext ?? 'png'}`);
      if (o.bytes) fs.writeFileSync(file, o.bytes);
      else if (o.url) await provider.download(o.url, file);
      let audit = null;
      if (req.expected_size) {
        try {
          audit = sizeAudit(imageSize(file), req.expected_size);
        } catch (e) {
          audit = { ok: false, findings: [{ level: 'warn', check: 'read', detail: e.message }] };
        }
      }
      writeJSON(`${file}.gen.json`, {
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
      });
      outputs.push(path.relative(ws, file));
    }
    fs.rmSync(pendingPath, { force: true });
    return { output_ids: outputs, actual_cost: result.cost ?? null };
  });
}
