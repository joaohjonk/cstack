---
name: learn-loop
description: "Make work compound: capture owner corrections, preference pairs, failures, provider quirks and results as learning events; run the observe, compare, articulate, decide, encode loop; promote repeated evidence into scoped rules, anti-examples, evals, canon entries or provider notes with provenance and expiry; and run a periodic retro over spend, failures and skill health. Use at the end of meaningful runs, after an owner correction, weekly for a retro, or before redoing something that may already be known. Not for recording one brand fact (use cstack brand set)."
license: MIT
metadata:
  cstack-version: "0.1.0"
  cstack-meta: "skill.meta.json"
---

# /learn-loop

Recent work must compound, not disappear into chat history (section 28A). Taste is encoded decisions. [Shared preamble](../cstack-shared/PREAMBLE.md) applies.

## When to use

- The owner corrects something ("never this", "this one, because...").
- A failure repeats, a provider surprises (billing, refusals, quirks), an experiment ends.
- Weekly retro, or before starting work that may repeat a past mistake.

## When not to use

- A single brand fact or decision: `cstack brand set` (with `user_instruction`).
- Reviewing an artifact: `creative-review`.

## Inputs

- `state/feedback.jsonl`, `state/failures.jsonl`, `state/evals.jsonl`, `state/cost-ledger.jsonl`, `experiments/results.tsv`, lineage, the session's owner messages.
- `cstack learn candidates`, `cstack health`, `cstack spend summary`.

## Missing-input behavior

- No events yet: the loop is not built until its first real record. Capture this run's decisions as the first events.
- Owner unavailable to approve a promotion: leave it as a candidate; never self-promote taste rules.

## Source precedence

Strong owner correction > repeated evidence across runs > single observation > model opinion. Local evidence can override a generic framework for this brand; record both and why.

## Tools / providers

`cstack learn add --file event.json`, `cstack learn candidates`, `cstack learn promote <id> --to <target> --by <name>`, `cstack feedback`, `cstack failure`, `cstack health`, `cstack spend summary`.

## Process

**Capture (every run)**: write learning events (`learning-event` schema) with evidence refs, scope (brand / campaign / model / tool / global), confidence, and expiry for model- or tool-specific facts.

**Taste loop (when the owner chooses)**: OBSERVE what was picked and killed → COMPARE the pair → ARTICULATE the reason in design language (hierarchy, proportion, tension, rhythm, restraint, warmth, precision, surprise, legibility, ritual) → DECIDE with the owner → ENCODE at the lowest reliable level (token > rule > reference > rubric > canon > learning).

**Promote**: candidates with repeated evidence or a strong human correction → check scope and expiry → owner (or high-confidence) approval → target: brand rule (`brand/rules`), anti reference, eval fixture, canon entry, provider note (registry/entity `model_notes`), or cstack skill change (for global, brand-agnostic lessons only).

**Retro (weekly or per milestone)**: spend vs estimates (and account balance if known), top failure types and whether repairs worked, owner overrides of the judge, skill health (budgets, stale models, missing evals), what slowed work, which skill boundaries were wrong, rules to add or retire (retired rules must be removed from templates and recipes too).

## Decision rules

- Learned preferences are labelled as this brand's preferences, never universal design laws.
- Model and tool learnings expire (default review in 60 days).
- Brand-specific learnings stay in the brand workspace; only anonymized, generalized mechanisms may become cstack changes.
- Never dump all raw events into prompts; retrieve by task, brand, provider and artifact type.

## Outputs, files written, state updated

- `state/learnings.jsonl` (events, promotions), workspace `docs/learnings.md` (promoted rules with provenance), anti references, eval fixtures, canon entries, registry notes.
- `work/retro/<date>.md` for retros, ending with a "Do Not Relearn" list update.

## Evals required

- T1: promotion rules in tests/core.test.mjs (repeated evidence or strong correction; expiry required for model scope).
- Fixture: `local-learning-contradicts-framework.yaml`, `ai-judge-not-owner.yaml`.

## Handoff

Whichever skill the lesson changes (`prompt-director`, `brand-verify`, `model-router`, `identity-system`), `creative-autoresearch` (when a lesson needs testing).

## Failure modes

- Logs that lapse: if a step relies on a person remembering to log, make a command do it.
- Promoting one lucky result.
- Retired rules surviving in templates (`retired_rule_resurfaced`).

## Examples

Owner rejects 3 frames for "too clean" and picks the one with a fingerprint on the glass. Event: preference pair x3, articulated "evidence of use > showroom finish". Candidate after the third occurrence; owner approves; encoded as photography rule `R-PHOTO-07` (judge) plus two anti references.
