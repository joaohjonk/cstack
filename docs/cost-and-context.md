# Cost and context

Two budgets matter in agentic creative work: money spent at providers, and tokens spent loading context. cstack enforces both in code, not only in prompts.

## The budget envelope

Each workspace sets its spend limits in `cstack.config.yaml`:

```yaml
budget:
  currency: USD
  per_run: 2.00       # max estimated spend for one batch
  per_day: 5.00       # max spend per calendar day, across all runs
  confirm_over: 0.50  # ask the owner before any batch estimated above this
```

- **No `budget:` block, no paid calls.** Every guarded call is `budget_blocked`, and `cstack brand check` warns.
- **New workspaces start at 0.** A priced call (estimate > 0) is blocked until you raise the limits on purpose.
- `confirm_over`: a batch estimated above it sets `needs_confirmation: true`, and the guard blocks the call until the owner confirms it (`cstack generate ... --confirm`).
- `per_day` counts the ledger since local midnight: `ok` rows, failed rows and queued jobs, at the actual cost when known and the estimate otherwise, in the envelope's currency.

## guardedCall

Every paid operation goes through `guardedCall(ws, spec, fn)` in `scripts/lib/ledger.mjs`. `cstack generate` (media) and `cstack taste` (Taste Labs) both use it. Each call follows these steps in order:

1. **Idempotency key** = sha256 of `{provider, model, operation, input_hashes (sorted), prompt_recipe_hash, prompt_hash, params}`. Image inputs are hashed by file content, and `prompt_hash` covers `inputs.prompt`, so two different prompts never dedupe to each other.
2. **Dedupe.** An earlier `ok` row with the same key is returned without calling the provider, and a `deduplicated` row (`cache_status: hit`) is appended. Nothing is paid twice.
3. **Dry run.** With `dry_run`, a `dry_run` row is logged and nothing is called.
4. **Budget gate.** The call is planned against the envelope. On failure, a `budget_blocked` row records the reasons.
5. **Call**, with **transient-only retries**. Timeouts, connection resets, 429 and 5xx errors, and rate limits are retried up to 2 times with exponential backoff. Policy, safety and content failures (`failed_policy`) and everything else (`failed_other`) surface immediately and are never retried.
6. **Pending jobs.** The media runner writes `state/pending-jobs/<key>.json` *before* it starts polling. A poll timeout logs a `queued` row and leaves the job pending. Running the same request again re-attaches to the same provider job and never resubmits. `cstack jobs` lists what is still pending. A failed result fetch is retried against the paid job and never resubmitted.
7. **Evidence.** Every outcome appends one line to `state/cost-ledger.jsonl`, and every downloaded output gets a `<file>.gen.json` sidecar, with a size audit when `expected_size` is given.

## Spend plan and stop conditions

Plan every batch before paying for it:

```bash
cstack spend plan batch.json --stop "stop when 2 of the first 4 probes fail product fidelity"
```

`batch.json` is a list of `{provider, model, operation, est: {amount, currency}}`. The result:

```json
{ "items": 4, "estimated_total": 0.32, "currency": "USD", "spent_today": 0.12,
  "budget": { "...": "..." }, "stop_condition": "...", "needs_confirmation": false,
  "ok": true, "problems": [] }
```

The plan fails (exit 1) if there is no budget envelope, the batch exceeds `per_run`, today's spend plus the batch exceeds `per_day`, or there is **no stop condition**. A batch without a stop condition is a bug, not a plan.

The production ladder in the [shared preamble](../skills/cstack-shared/PREAMBLE.md) applies: probes before finals, never many expensive finals to discover a composition.

## Cost ledger

`state/cost-ledger.jsonl` (schema `cost-ledger-entry`) has one row per attempt that reached the budget gate: a call, a dry run (which runs the same gate and records the refusal a real call would get in `error`), a budget block, a deduplicated repeat or a failure. A command that stops before any attempt, such as `cstack taste search` without `TASTE_API_KEY` (it exits with a MISSING line), writes no row.

```text
run_id, ts, provider, model, operation, input_hashes, prompt_recipe_hash, idempotency_key,
cache_status (hit|miss|n/a), estimated_cost, actual_cost_if_available, latency_ms, output_ids,
retry_count, status, experiment_id, skill, error
status ∈ dry_run | queued | ok | failed_transient | failed_policy | failed_other | deduplicated | budget_blocked
```

```bash
cstack spend summary                  # per provider/model: calls, ok, failed, dedup, dry; total spent
cstack spend summary --since 2026-10-01 --currency USD --json
```

`actual_cost_if_available` stays null when a provider bills asynchronously (fal). Reconcile it from billing later and never infer it from balance deltas. Rows tagged with `experiment_id` let `/creative-autoresearch` total an experiment's spend.

## Context budgets

Skill context is budgeted like spend: every SKILL.md and the always-loaded catalog have token ceilings that `cstack budget --check` enforces in CI. The rules and the ratchet: [skill-authoring.md](skill-authoring.md#context-budgets-and-the-ratchet).

## Cache-stable brand context

Never paste the whole brand system into a prompt. Load only the sections the task needs:

```bash
cstack brand context --sections voice,photography,color
cstack brand context --sections voice --inferred        # include unconfirmed inferred values
cstack brand context --task packaging                   # the sections and files brand/context-map.yaml names for packaging
```

- **Only approved values become facts**: `locked` (marked `locked: true`), `current` and `testing`. Every other field is listed under `not_facts` with its status. Missing sections appear as `UNKNOWN`.
- **Open conflicts** are listed by id. Until a conflict is resolved, the field's current value stays as the default (see [provenance.md](provenance.md#conflicts-surfaced-never-averaged)).
- **Deterministic.** Sections and keys are sorted, and the output ends with a `hash`. The same brand state gives the same bytes, so the block works as a stable, cacheable prompt prefix across many small tasks (fixture `repeated-brand-context`).

Put the brand context first and the task-specific material after it, so the cached prefix survives from task to task.

## Model router and registry staleness

```bash
cstack route --modality image --needs image-edit,multi-image-reference --max-cost 0.1
cstack route --modality video --needs image-to-video,native-audio --task "pour shot" --json
cstack route --modality image --needs text-rendering --avoid lora --providers openai,google
```

The router (`scripts/lib/router.mjs`) scores the `registry/models.json` entries for one modality:

| Signal | Effect |
|---|---|
| each `--needs` capability present / missing | +10 / −6 |
| each `--avoid` capability present | −4 |
| a benchmark on this exact `--task` | +25 (fit-for-purpose beats generic claims) |
| `last_verified` older than **45 days**, or missing | −3, flagged `stale` |
| `confidence: low` / `status: watch` | −2 / −1 |
| provider not in `--providers` | −100 |
| unit price over `--max-cost` | −50 |
| `deprecated` / `shut_down` | never routed |

It prints the top candidates with reasons, a 3-model fallback chain and warnings. If the top candidate is stale, verify current docs and pricing before a paid batch. If the top two are within 6 points, run a 2–4 probe micro-benchmark on the real task before scaling. `--max-cost` compares against `est_unit_cost.amount` (per image or per second), never a token price. Entries without a unit price are reported as "no unit price: estimate before a batch".

Vocabulary: modalities are `image | video | vector | 3d | audio | analysis`, and capabilities use the registry's names (`text-to-image`, `image-edit`, `mask-inpainting`, `text-rendering`, `image-to-video`, `native-audio`, ...). `--providers` filters on the registry's `provider` field, which is the model's maker (for example `openai`, `black-forest-labs`), not the cstack adapter (`fal`).

The registry is a dated snapshot. `cstack health` reports how many entries are stale. A workspace may carry its own `registry/models.json`, which takes priority. The `/model-router` skill re-verifies live docs before important batches. To update the shared registry, edit `registry/models.seed.json` and run `node scripts/dev/seed_models.mjs`. Every entry needs a dated source.

## Unpriced calls

A call with no cost estimate (no `estimated_cost` in the request, no adapter `estimate()`, no `est_unit_cost` in the registry) is not free. It is blocked unless the owner agrees per call (`--confirm-unpriced`) or the budget sets `allow_unpriced: true`, and even then it is refused while the budget is 0. An allowed unpriced call is booked against `per_day` at `budget.unpriced_call_cost`, or at `per_run` when that is unset. Taste Labs calls are credit-priced, so `cstack taste` always needs one of the two.
