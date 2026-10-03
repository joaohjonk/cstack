---
name: brand-verify
description: "Check an artifact against brand truth with deterministic gates first (tokens, raw colors, type, logo clear space, aspect, required elements, banned language) and a brand-adherence verifier second (Taste Labs verify for public URLs, or an independent local judge), then fix and re-verify once before escalating to a human. Use on every page, image set, pack or deck before review or delivery, and to validate a brand import on known artifacts. Not for multi-lens creative judgment (use creative-review) or claim legality (use claims-proof)."
license: MIT
---

# /brand-verify

Is this ours, measurably? Cheap deterministic gates catch most drift before any judge runs (sections 18, 19, 3.17). [Shared preamble](../cstack-shared/PREAMBLE.md) applies.

## When to use

- Before `creative-review` and before delivery of any artifact.
- After `brand-import`, on 2-3 known approved artifacts (a correct import passes them).
- After a brand field changes (`cstack brand stale` lists affected artifacts).

## When not to use

- Taste and idea quality: `creative-review`. Legal/factual: `claims-proof`. Product geometry: `product-fidelity`.

## Inputs

- Artifact (built page URL or files, images, PDF), `brand/tokens`, `brand/rules/brand-rules.yaml`, brand-system sections (logo_marks, color, typography, voice, vocabulary, banned_language), gold/anti references.

## Missing-input behavior

- No tokens or rules: verify against brand-system fields only and report "deterministic coverage: low"; recommend `identity-system`.
- Local page (localhost) and Taste verify needs a public URL: use the local judge; ask before opening any tunnel.

## Source precedence

Approved tokens and rules are the reference. A verifier score is evidence about brand adherence only, never a universal taste score. Owner decisions override verifier fixes.

## Tools / providers

`cstack tokens lint <files>`, `cstack audit <img> --aspect`, `browse qa|tokens|shot` for pages, text checks against banned language, `cstack taste verify --reference <brand url> --candidate <public url>` (paid, ledgered), local judge = deterministic gates + an independent reviewer citing rule ids.

## Process

1. **Deterministic gates** (each rule id → pass/warn/fail with evidence): raw colors (`tokens lint`), font families, sizes, measure, leading and fallbacks vs the type system (`cstack type qa`, computed styles via `browse tokens`), aspect ratios, logo presence/clear space (official file overlay), required elements (legal lines), banned words, contrast; per medium: `cstack svg lint` (marks, icons), `cstack mockup verify` (placements), `cstack 3d inspect` (3D budgets), `cstack video qa` (video).
2. **Verifier**: Taste verify (public URL; score 0-1, fixes worst-first, recommendations) or the local judge on rules marked `check: judge`. Record verdict id.
3. **Diagnose → fix the minimum** (map verifier fixes such as snap-to-token onto concrete edits; apply deterministic fixes directly).
4. **Re-verify once.** Still failing → human review with before/after and the remaining findings. Never loop indefinitely; never rationalize a fail.
5. Calibrate thresholds once per brand with one known-good and one known-bad control.

## Decision rules

- Any hard rule failure (logo violation, raw brand color, unlicensed asset, required accessibility state) blocks delivery regardless of verifier score.
- A verifier fix that contradicts locked brand state is rejected and logged as a verifier quirk.
- Verify → fix → re-verify happens at most twice before a human.

## Outputs, files written, state updated

- `state/evals.jsonl` (gates + verifier verdict, before and after), `work/verify/<date>-<artifact>.md`.
- `state/failures.jsonl` for `brand_drift`, `type_failure`, `layout_failure`.

## Evals required

- Fixtures: `agent-output-fails-verify.yaml`, `beautiful-but-off-brand.yaml`, `existing-brand-clear-assets.yaml` (import verification step).
- T1: tokens lint unit test (tests/core.test.mjs).

## Handoff

`creative-review`, `identity-system` (systemic gaps), `image-edit` / `copywriting` (fixes), `learn-loop`.

## Failure modes

- Treating a verifier score as taste.
- Running an expensive verifier before free gates.
- Silent threshold drift; recalibrate with controls.

## Examples

Landing page: tokens lint finds `#FF5A1F` (not a token) in 3 places → replace with `{color.accent}`; Taste verify 0.62 → fixes: snap heading font to brand display; re-verify 0.81; remaining recommendation "imagery warmer than reference" goes to `creative-review` as a judgment, not a gate.
