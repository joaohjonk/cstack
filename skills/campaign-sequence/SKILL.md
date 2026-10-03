---
name: campaign-sequence
description: "Plan and critique a campaign as a sequence of shot roles (ICON, WORLD, HUMAN, RITUAL, PRODUCT, DETAIL, CULTURE, WEIRD, PROOF, CLOSER), assign each role a job, Shot DNA and channel use, and evaluate the set as a sequence rather than as separate good images. Use when planning a campaign or shoot, when a set of strong images lacks narrative, or before channel adaptation. Not for single-image direction (use shot-dna) or picking the campaign idea (use creative-direction)."
license: MIT
metadata:
  cstack-version: "0.1.0"
  cstack-meta: "skill.meta.json"
---

# /campaign-sequence

Ten unrelated good images are not a campaign (section 14). [Shared preamble](../cstack-shared/PREAMBLE.md) applies.

## When to use

- After a direction is chosen, before shot planning and production.
- Reviewing a finished set that "looks good but says nothing".
- Adapting a campaign across channels (feed, story, PDP, OOH, email).

## When not to use

- Choosing the idea: `creative-direction`. One frame: `shot-dna`. Copy: `copywriting`.

## Inputs

- Direction entity / territory, brief, brand-world entities, channel list, budget envelope.
- For review mode: the image set with lineage records.

## Missing-input behavior

- No channels given: default to feed (4:5), story (9:16) and PDP (1:1) and say so.
- No direction: stop and route to `creative-direction`.

## Source precedence

Brief and direction bind; brand photography rules bind; role ontology is configurable per brand (`brand-system.campaign_history` may define custom roles).

## Tools / providers

No paid calls. `cstack audit` for crop-safe checks per channel; contact sheets assembled deterministically.

## Process

1. **Pick roles** (not every campaign needs every role): ICON (remembered tomorrow), WORLD (where the brand lives), HUMAN (who belongs), RITUAL (how the product fits behavior), PRODUCT (unmistakable object truth), DETAIL (material, tactility), CULTURE (live connection), WEIRD (permission to surprise), PROOF (evidence, ingredient, feature), CLOSER (punctuation, recall).
2. **Per role**: job in one line, Shot DNA ref (or to-do), entities, channel formats and crop-safe zones, copy slot, production method (single pass vs. decomposed per `product-fidelity`), estimated cost tier.
3. **Sequence logic**: order, rhythm (scale changes, light changes, human/no-human alternation), what each frame adds that the previous did not, the line the viewer remembers.
4. **Production plan**: shared plates, entity reuse, probes first; `cstack spend plan` for the batch.
5. **Review mode**: score the sequence (coherence, progression, redundancy, missing roles, product truth present, a reason to remember) and name cuts and missing frames.

## Decision rules

- At least one PRODUCT or PROOF frame where product truth is unmistakable.
- Two frames doing the same job: cut one or give it a different job.
- Sequence beats individual beauty: a weaker image that completes the story can outrank a beautiful redundant one; say so explicitly.

## Outputs, files written, state updated

- `campaigns/<id>.campaign.yaml` (`sequence`, `channels`, `sequence_review`), contact sheet `work/campaigns/<id>/sequence.png`.
- State: lineage for any assembled sheets; feedback for owner picks.

## Evals required

- Fixture: `strong-images-no-narrative.yaml` (role critique, not image praise).
- T0: campaign validates.

## Handoff

`shot-dna` (missing DNA), `prompt-director`, `product-fidelity`, `copywriting`, `creative-review` (sequence lens).

## Failure modes

- Ten ICONs. Every frame competing to be the hero.
- Roles assigned after the fact to justify a set.
- Ignoring channel crops until export.

## Examples

Review: "Frames 2, 5 and 7 are all WORLD at the same scale and light; keep 5, cut 2, turn 7 into DETAIL (macro of the powder texture). Missing PROOF: nothing shows why the product is better. CLOSER is absent: end on the ritual's last step with the logo composited, not generated."
