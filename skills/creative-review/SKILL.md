---
name: creative-review
description: "Review creative work through independent lenses (strategist, brand director, art director, photographer, type director, editor, culture, copy, commerce, production, compliance) run separately from the author, keep their disagreements, gate on hard failures, score distinct axes against a stated baseline, and make an explicit tradeoff. Use after anything is made and before it is shown as final, for A/B choices, or when the owner asks is this good. Not for deterministic brand checks (use brand-verify) or claim legality (use claims-proof)."
license: MIT
---

# /creative-review

Multi-lens, not committee mush. The author never certifies its own work. [Shared preamble](../cstack-shared/PREAMBLE.md) applies.

## When to use

- Every artifact before it is presented as final (images, sequences, pages, packs, decks, copy), including long-form pages such as a repo home (page mode).
- Choosing between options (pairwise).
- The owner asks "is this good?" or "why does this feel off?".

## When not to use

- Token/color/type/logo conformance: `brand-verify` (run it first; it is cheaper).
- Legal or factual claim checks: `claims-proof`.

## Inputs

- The artifact(s) and their lineage; the brief's success criteria; `cstack brand context` for relevant sections; gold and anti references; the baseline (brief, reference, incumbent, or last approved).

## Missing-input behavior

- No brief: review against brand state only and say the review cannot judge strategy.
- No baseline: use the brief as baseline and state it.

## Source precedence

Owner feedback outranks every lens. Hard gates (brand-verify failures, product fidelity failures, anatomy, claim risk) outrank aesthetic praise.

## Tools / providers

Run lenses **in a context that did not author the work**: a subagent or a different model given only brief + brand context + artifact + rubric. Optional provider verifier for brand adherence (`brand-verify`). `site-capture` screenshots for pages.

## Process

1. **Gates first** (cheap → expensive): schema/size audits, `brand-verify`, `product-fidelity`, compliance flags, `cstack svg legibility` on figures at the widths they are shown. Any hard fail → decision `fix` with the failing gate; skip aesthetics.
2. **Pick lenses** relevant to the artifact (not all eleven every time): STRATEGIST (right problem?), BRAND DIRECTOR (is this ours?), ART DIRECTOR (coherent, specific visual idea?), PHOTOGRAPHER (intentional photograph? lens, light, contact, materials), TYPE DIRECTOR (type doing real work? the review axes in the type-director primer, with `cstack type qa` evidence), EDITOR (what to remove?), CULTURE (belongs in the world now?), COPY (sharp, ownable?), COMMERCE (helps someone understand and buy?), PRODUCTION (can it ship?), COMPLIANCE (anything risky or false?).
3. **Each lens independently**: verdict, 1-3 evidence points tied to the artifact, the one change it would make.
4. **Axes** (0-2 or null, each with evidence and the anchor case): beauty, brand fit, cultural vitality, message clarity, craft, product truth, commercial usefulness, novelty, correctness. Never summed.
5. **Disagreements stay visible**. The orchestrator writes an explicit tradeoff ("keeping the harsher light: brand director and photographer outweigh commerce's concern; mitigated by a clearer PDP crop").
6. **Decision**: promote / fix (with the minimum fix and owner of the fix) / reject / human review.
7. **Pairwise mode**: A vs B per lens, then overall with reasons; ask the owner when lenses split. A winner with the wrong audience loses.
8. **Page mode** (a repo home, landing page, guide, long post): add INFORMATION ARCHITECTURE to EDITOR and judge the read with measured evidence (length, where the first action sits, repetition, figure legibility). Steps: [references/page-mode.md](references/page-mode.md).

## Decision rules

- Beautiful but off-brand is named as exactly that (`beautiful_but_wrong`), never "great, small tweaks".
- A fix list changes one meaningful variable at a time; the biggest defect first.
- No average scores, no "8/10". Evidence or it did not happen.
- The judge's view never replaces the owner's taste; contested work goes to the owner with the disagreement intact.

## Outputs, files written, state updated

- `state/evals.jsonl` (`eval` schema: evaluator kind/name, separate_from_author: true, baseline, gates, axes, lenses, decision, tradeoff).
- `work/reviews/<date>-<artifact>.md` human-readable review.
- Failures → `cstack failure` with the taxonomy type; owner verdicts → `cstack feedback`.

## Evals required

- Fixtures: `wrong-audience-winner.yaml`, `beautiful-but-off-brand.yaml`, `agent-output-fails-verify.yaml` (fix → re-verify, no rationalizing), `ai-judge-not-owner.yaml` (owner preference overrides the judge), `long-page-no-map.yaml` (page mode).

## Handoff

`image-edit` / `copywriting` / `identity-system` / `type-director` (fixes), `brand-verify` (re-verify), `learn-loop` (owner corrections, repeated failures).

## Failure modes

- Self-review by the generating context (`self_certified`).
- Committee mush: all lenses agree on bland.
- Praise without evidence; uniform top scores over time (drift; recalibrate against anchors).

## Examples

Hero image: gates pass. BRAND DIRECTOR: "ours: flash + warm ambient matches photography rules". COMMERCE: "product too small for PDP crop". EDITOR: "remove the second prop". Axes: beauty 2, brand fit 2, product truth 1, commercial 1. Tradeoff: keep composition; produce a tighter PDP crop variant. Decision: fix (crop variant), not regenerate.
