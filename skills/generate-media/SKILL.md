---
name: generate-media
description: "Run guarded image, video and vector generation through the cstack provider runner: dry run and spend estimate first, cheap probes before finals, idempotent calls that never double-pay, pending jobs that re-attach instead of resubmitting, lineage sidecars and size audits on every output. Use whenever a paid model call is about to happen (generate, edit, upscale, image-to-video). Not for deciding what to make (use shot-dna and prompt-director), choosing the model (use model-router) or repairing one region (use image-edit)."
license: MIT
---

# /generate-media

The only door to paid generation. The gate is code, not good intentions (sections 11, 25, 34). [Shared preamble](../cstack-shared/PREAMBLE.md) applies.

## When to use

- Any paid generation or edit call, single or batch.
- Resuming jobs left pending by a timeout or a crash.

## When not to use

- Deciding the shot (`shot-dna`), the words (`prompt-director`), the model (`model-router`), or a local fix (`image-edit`).
- Free deterministic transforms (crop, resize, composite): do them directly.

## Inputs

- Compiled recipe (`recipes/*.prompt-recipe.yaml`) with hash; model choice; input images (hashed); expected size or aspect; budget envelope in `cstack.config.yaml`.

## Missing-input behavior

- No budget envelope (or zero): calls are blocked by `cstack generate`. Ask the owner for a per-run and per-day cap; do not work around the block.
- Provider key absent (`cstack providers`): say which env var is missing; offer the mock provider for a dry rehearsal or another available provider.

## Source precedence

The recipe and Shot DNA decide content; the router decides the model; this skill decides nothing creative.

## Tools / providers

`cstack spend plan items.json --stop "<condition>"`, `cstack generate --file request.json [--dry-run]`, `cstack jobs`, `cstack audit`, `cstack spend summary`. Providers: fal (implemented), mock (rehearsal), Higgsfield / OpenAI / Google / Replicate (documented stubs: route elsewhere until implemented).

## Process

0. **Gate**: `cstack flows gate <plan> --stage make` passes, or stop and say why (no plan, no usable provider: "needs generation; run where the keys live").
1. **Probe ladder**: contact-sheet probes at draft tier (2-4) → owner or reviewer selects → targeted high-quality still → local repair (`image-edit`) → upscale only approved frames → motion only from approved stills.
2. **Plan the batch**: items with estimated unit cost (registry `est_unit_cost`, or provider estimate); `cstack spend plan` with a stop condition (e.g. "stop after 2 consecutive rejects or $X"). Show it; ask when above `confirm_over` or beyond small validation tests.
3. **Request file** per call: provider, model, operation, inputs (prompt, images, params), out_dir, out_prefix, expected_size, recipe hash, skill, experiment id.
4. **Run** `cstack generate --file request.json`. It dedupes identical calls (no double spend), writes a ledger row for every outcome, persists pending jobs and re-attaches on the next run, retries only transient errors, never retries policy refusals.
5. **Audit** each output: sidecar `size_audit` (unintended reframe fails), then `product-fidelity` audits if product is in frame.
6. **Record lineage** for every kept output (`cstack lineage --file entry.json`): parent, intent, changed/unchanged dimensions, inputs, recipe, model, review result.

## Decision rules

- Never render many expensive finals to discover composition.
- Never ask a model for a whole pack, label or can: it invents the type. Make the picture; the pack is flat artwork with real type (`concept-wrap` flow).
- A timeout is not a failure: the job stays pending; rerun the same request to re-attach. Never resubmit by hand.
- A policy refusal is reported once with the prompt component likely responsible; rephrasing to evade provider policy is not allowed.
- Stop when the stop condition triggers, even mid-batch.
- Video requests state duration, resolution tier, audio on or off, start and end image and seed; spend plans carry the selection ratio (generations per usable clip), not one clip per final.

## Outputs, files written, state updated

- `work/<slug>/<prefix>-NN.<ext>` + `.gen.json` sidecars (provider, model, job id, recipe hash, inputs hashes, size audit, cost).
- State: `state/cost-ledger.jsonl` (every call), `state/pending-jobs/`, `state/lineage.jsonl`, `state/failures.jsonl` for failed audits.

## Evals required

- T1: runner tests (dedupe, pending re-attach, policy no-retry, size audit) in tests/providers.test.mjs.
- Fixture: `expensive-overnight-batch.yaml` (baseline + probes + estimate + dedupe + stop condition before scale).
- T3: one bounded live call when a provider adapter changes.

## Handoff

`creative-review` (independent judgment), `product-fidelity`, `image-edit`, `campaign-sequence`, `learn-loop` (billing or quality surprises).

## Failure modes

- Ledger drift: provider bills differ from estimates. Reconcile with the provider's actual-cost signal and the account balance; note gaps.
- Late charges and charges for timed-out or refused calls; never assume a failed call was free.
- Sidecars missing, so lineage breaks.

## Examples

`cstack spend plan probes.json --stop "2 consecutive rejects or $3"` → 8 probes, $1.20 estimate, ok. Run; reviewer picks 2; one 2K still per pick; repair a reflection locally; upscale only the approved frame.
