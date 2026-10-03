---
name: workflow
description: "Run a cstack workflow end to end as a resumable plan: create-brand, import-brand, campaign, product-photoshoot, paid-social, landing-page, packaging, deck, product-3d, product-video or logo-system. It loads workflows/<name>/workflow.yaml, writes a plan tracker in the brand workspace, calls the right skills in order, stops at owner gates, uses each step's fallback when a skill or provider is missing, and resumes where it left off. Use when the owner asks for one of those outcomes without naming individual skills. Not for a single bounded task (call the specialist skill) or for reframing the ask (use office-hours first)."
license: MIT
metadata:
  cstack-version: "0.1.0"
  cstack-meta: "skill.meta.json"
---

# /workflow

The operating-system layer: the owner asks for an outcome, cstack runs the skills (section 10). [Shared preamble](../cstack-shared/PREAMBLE.md) applies.

## When to use

- "Create a brand", "import our brand", "plan a campaign", "product shoot", "paid social round", "landing page", "packaging", "deck".
- Resuming a workflow that stopped at a gate or a failure.

## When not to use

- One bounded job: call the specialist skill directly (`cstack search "<ask>"` finds it).
- The ask itself is unclear: `office-hours` first (every workflow starts there unless an approved brief exists).

## Inputs

- Workflow name; the brand workspace; an approved brief if one exists; budget envelope.
- `workflows/<name>/workflow.yaml`: steps with `id`, `skill` (or `does` for deterministic steps), `inputs`, `outputs`, `gate` (`owner` | `auto`), `fallback`.

## Missing-input behavior

- No workspace: `cstack brand init` (create-brand) or stop and offer `brand-import`.
- A step's skill or provider is missing: run the step's `fallback` and announce the mode ("degraded: no Taste access, local library search"). If no fallback exists, the step is `blocked` and the plan says why; later steps that depend on it are blocked too.

## Source precedence

The approved brief and brand state govern every step. Owner decisions at gates are recorded and outrank any skill's recommendation.

## Tools / providers

`cstack search`, `cstack brand check`, `cstack providers`, `cstack tools`, `cstack spend plan`, plus whatever each step's skill uses.

## Process

0. **Method first** (preamble 0.5): `cstack flows search` for the outcome; an outcome no workflow covers, or a stale flow, goes to `flow-research` before step 1.
1. **Load** the workflow file and check `status` (`template` = not yet proven on a real run; say so; `validated` = has a linked run record).
2. **Plan tracker**: create or resume `work/plans/<workflow>-<YYYY-MM-DD>.md` in the workspace: one line per step with state (`todo | doing | done | gate | blocked | skipped-with-reason`), outputs, decisions, spend. The tracker is the resume point across sessions.
3. **Prerequisites** of the next step only (not all at once): inputs exist, providers available, budget.
4. **Run the step** by following its skill; write its outputs to the declared paths; update the tracker.
5. **Gates**: `owner` gates stop and present the decision (options, recommendation, consequences). Gates can be deferred ("continue with the recommended option, revisit later") but not skipped; a deferred gate stays visible in the tracker.
6. **Verify loops** inside the workflow follow verify → fix → re-verify → human.
7. **Close**: lineage for final artifacts, retro notes via `learn`, the run record linked from the workflow (`runs:`) so the workflow can be promoted from `template` to `validated`.

## Decision rules

- Never skip `office-hours` unless an approved brief exists.
- Paid steps always pass through `generate-media` rules (estimate, stop condition, approval above threshold).
- When a step fails twice, stop and report; do not improvise around the workflow silently.
- The owner may reorder or drop steps; record it in the tracker.

## Outputs, files written, state updated

- `work/plans/<workflow>-<date>.md` (tracker), each step's declared outputs, lineage and eval records, a closing summary.

## Evals required

- T0: every step's skill exists (`cstack validate`).
- T4 (release): one end-to-end run per workflow on the fictional example brand in `examples/`.

## Handoff

The workflow's last step names it (usually `learn` for the retro, and channel delivery by the owner).

## Failure modes

- Running every step at full depth for a small ask; scale steps to the job and say which were shortened.
- Losing state between sessions; the tracker prevents it.
- Treating a `template` workflow as proven.

## Examples

"Product shoot for the new tin, 6 finals." → `workflow product-photoshoot`: tracker created; office-hours brief approved (gate); product entity locked; references and Shot DNA; router benchmark (gate: owner picks probes); generation probes → stills → local repairs; fidelity and brand verify; review; owner picks finals (gate); exports; retro.
