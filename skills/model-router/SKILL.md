---
name: model-router
description: "Pick the best current model and provider for a specific generation or edit job from the dated model registry, verify that the entry is fresh against live docs when the job matters, run a 2-4 probe micro-benchmark when the choice is uncertain, and record why plus a fallback chain. Use before a paid batch, when a model is named that may be stale or shut down, or when outputs disappoint and the model may be wrong. Not for writing prompts (use prompt-director) or running the calls (use generate-media)."
license: MIT
metadata:
  cstack-version: "0.1.0"
  cstack-meta: "skill.meta.json"
---

# /model-router

Model rankings go stale in weeks. The router never freezes a 2026 snapshot into prose (section 11). [Shared preamble](../cstack-shared/PREAMBLE.md) applies.

## When to use

- Before any batch, or before the first call of a new job type.
- The owner or a skill names a model (it may be deprecated, shut down or superseded).
- Repeated failures of one kind (typography, product drift, motion) that may be a model limit.

## When not to use

- Prompt writing: `prompt-director`. Running calls: `generate-media`. Bounded overnight optimization: `creative-autoresearch`.

## Inputs

- Job: output family (image, video, vector ...), required capabilities (`image-edit`, `multi-image-reference`, `text-rendering`, `image-to-video` ...), resolution, references count, budget per unit, latency needs, licensing needs.
- `registry/models.json` (cstack seed) and the workspace override `registry/models.json` if present; `cstack providers` (what is reachable here).

## Missing-input behavior

- No registry entries for the job: research current docs before routing; never guess a model id.
- Registry entry stale (older than 45 days) and the job matters: re-verify price, id and status from the provider's docs or changelog; update the workspace registry with `last_verified` and source.

## Source precedence

A micro-benchmark on this exact task > fresh provider docs > the dated registry snapshot > third-party arenas (orientation only) > memory. A model the owner names is honored when it is live; say so if it is not.

## Tools / providers

`cstack route --modality <family> --needs a,b [--task t] [--max-cost n] [--providers fal,...]`, `cstack providers`, web docs for verification, `generate-media` for probes.

## Process

1. **Shortlist** with `cstack route`; read the warnings (stale entries, close scores, missing unit price).
2. **Verify** the top 2-3 when the job matters: model id, status (`active | watch | deprecated | shut_down`), price unit, reference limits, resolution, async/webhook semantics. Update the registry entry with source and date.
3. **Micro-benchmark** when the top candidates are close or the task is new: same product, same references, same target, 2-4 probes per model at draft tier, scored on product fidelity, art direction, material behavior, typography if relevant, editability. Pairwise against each other; owner breaks ties on taste.
4. **Decide**: winner for this task only, fallback chain (2-3), reason. Record `benchmark_results` (task, date, result, experiment id) on the entries.
5. **Hand off** the choice to `prompt-director` (recompile for the target syntax) and `generate-media`.

## Decision rules

- Never route to `shut_down` or `deprecated` models.
- Promote a model on a benchmark for that task only; do not generalize from one job.
- Aggregator and direct access are different rows when price or parameters differ.
- If no model passes probes, say so; do not scale a failing choice.

## Outputs, files written, state updated

- Workspace `registry/models.json` updates (verified entries, benchmark results).
- `work/routing/<date>-<job>.md`: candidates, verification sources, probe grid, decision, fallback chain, cost of the benchmark.
- State: ledger rows for probes; `cstack learn add` for model quirks (scope: model, with expiry).

## Evals required

- Fixture: `model-list-stale.yaml` (router researches current availability), router unit tests in tests/core.test.mjs.

## Handoff

`prompt-director`, `generate-media`, `creative-autoresearch` (if the job will repeat at scale).

## Failure modes

- Picking the arena leader without a fit-for-purpose test.
- Using a price snapshot older than the freshness window for a budget guard.
- Re-benchmarking from scratch when a recent benchmark for the same task exists (prior work is capital).

## Examples

Job: product edit with readable label, 4:5, 6 references. `cstack route --modality image --needs image-edit,multi-image-reference,text-rendering` returns three close candidates and a stale warning. Verify two pages, run 3 probes each at draft tier ($0.6 total), owner picks pairwise; winner recorded for "packshot-label-edit", fallback chain stored.
