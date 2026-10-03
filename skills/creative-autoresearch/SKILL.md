---
name: creative-autoresearch
description: "Run a bounded, Karpathy-style keep/discard experiment on one mutable surface (a prompt recipe component, a model, a reference set, a crop rule) against a frozen fixture and evaluator, with a spend and time budget, regression fixtures and explicit stop conditions, logging every result to results.tsv. Use when a recipe or method will repeat at scale and needs improving, or for overnight exploration the owner approved. Not for one-off generation (use generate-media) or picking a model once (use model-router)."
license: MIT
metadata:
  cstack-version: "0.1.0"
  cstack-meta: "skill.meta.json"
---

# /creative-autoresearch

Bounded optimization, not autonomous aesthetic drift (section 12A). [Shared preamble](../cstack-shared/PREAMBLE.md) applies.

## When to use

- A recipe, method or routing choice will be used many times and a better version is worth paying for.
- The owner approves an overnight run with a budget.

## When not to use

- Single assets: `generate-media`. One-time model choice: `model-router`. Changing the evaluator itself (that is a separate, explicit evaluator-quality run).

## Inputs

- Fixture (locked: product, references, target, brief), baseline version (incumbent recipe), mutable surface (exactly one), primary metric (pairwise vs incumbent preferred), guardrails (product fidelity, label OCR, palette distance, brand-verify gates: veto only), time budget, spend budget, max experiments, stop conditions, regression fixtures (including one from a different fictional brand or product).

## Missing-input behavior

- No spend budget or stop conditions: do not start. Propose them.
- No regression fixtures: create 3 from approved past work before running; without them, a win cannot be promoted.

## Source precedence

The frozen evaluator decides keep/discard during the run; the owner decides promotion after it. No overnight result is promoted automatically.

## Tools / providers

`cstack experiment init <run_id>`, `cstack experiment log <run_id> --file row.json`, `cstack experiment status <run_id>`, `cstack spend plan`, `cstack generate` (idempotency keys derived from run + candidate), `cstack prompt diff`.

## Process

1. **Init** the run spec (`experiment-run.yaml`): fixture and evaluator hashed and frozen; one mutable surface; budgets; stop conditions.
2. **Baseline**: re-measure the incumbent at the start (same seeds/indices).
3. **Loop**: propose ONE meaningful change (state the hypothesis) → smallest representative test at draft tier → evaluate pairwise against the incumbent on the same seeds, both orders, ties go to the incumbent → guardrails veto → KEEP (new incumbent) or DISCARD → append the row to `experiments/results.tsv` (run_id, timestamp, hypothesis, changed_variable, baseline, candidate, provider, model, seed_or_index, cost, latency, primary_score, guardrails, human_pref, decision, notes).
4. **Regression check** on candidates about to be kept.
5. **Stop** when: budget reached, gains flatten, evaluator uncertainty exceeds the apparent gain, max experiments, 4 consecutive discards, 3 crashes, guardrails failing on most recent candidates, or a human interrupt.
6. **Report**: incumbent vs baseline with examples, all discarded experiments, spend, what the owner should approve.
7. **Repair the program**: if the agent repeatedly makes the same bad move, fix the skill or recipe template, not the outputs.

## Decision rules

- Never change prompt, model, references, crop and evaluator together.
- Separate randomness exploration (seeds) from method changes.
- If nothing beats the incumbent within budget, keep the incumbent; that is a valid result.
- Promotion needs repeated evidence across fixtures, not one lucky seed.

## Outputs, files written, state updated

- `experiments/runs/<run_id>/experiment-run.yaml`, `experiments/results.tsv` (append-only), outputs with sidecars, `experiments/runs/<run_id>/report.md`.
- State: ledger rows tagged with `experiment_id`; `cstack learn add` for durable findings (scope recipe/model, with expiry).

## Evals required

- Fixture: `expensive-overnight-batch.yaml`; experiment unit tests (stop conditions, results columns) in tests/core.test.mjs.

## Handoff

`prompt-director` (promoted recipe version), `model-router` (benchmark results), `learn-loop`, owner approval.

## Failure modes

- Evaluator gaming: candidates that please the judge and fail the owner; human pairwise samples every N rounds.
- Overfitting to one fixture or one brand; regression fixtures catch it.
- "Never stop" loops that burn budget.

## Examples

Mutable surface: `lighting` slot of the packshot recipe. 12 experiments, $4.80; 2 keeps; incumbent improved pairwise 7/10 vs baseline; regression fixture of a different product holds; owner approves recipe v5.
