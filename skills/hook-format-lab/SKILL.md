---
name: hook-format-lab
description: "Design a bet's attention before anything is made: decompose concepts into angle, hook tactic, visual hook, verbal hook, mechanic, format, proof, payoff and CTA, then write hook and first-frame variants on one angle without mixing families. Use when an approved bet needs hooks or hook rate is weak. Not for choosing bets (creative-strategist) or final copy (copywriting)."
license: MIT
---

# /hook-format-lab

A laboratory, not a post-mortem: attention is designed in parts that can be varied one at a time. [Shared preamble](../cstack-shared/PREAMBLE.md) applies.

## When to use

- An approved bet needs concepts, hooks and first frames.
- Hook rate or hold rate is weak on otherwise good ads.
- Dissecting one ad (the brand's own) into parts before scaling it.

## When not to use

- Picking which bets to run: `creative-strategist`.
- Final copy in the brand's voice: `copywriting`.
- Visual direction of the shoot: `creative-direction`, `video-direction`.

## Inputs

- The bet (`*.creative-bet.yaml`), `cstack brand context --task creative`, claims from `claims-proof`.
- The taxonomy (`registry/creative-taxonomy.json`): each family's question and what it is not.
- The audience's own words and their awareness stage.

## Missing-input behavior

- No approved bet: write concepts as drafts and mark the bet `proposed`.
- No proof for a claim: leave proof empty and stop the concept at the claim; `claims-proof` decides.

## Source precedence

The bet's angle and brand constraint > approved claims > customer language > platform conventions > model invention.

## Tools / providers

`registry/creative-taxonomy.json`, `cstack creative check <bet>` (flags a term used in the wrong family), `video-direction` beat plans for video hooks, `prompt-director` for any frame that will be generated.

## Process

1. **Decompose** each concept into the nine parts; write every part as its family's question answered in one line:
   - ANGLE what are we saying · HOOK TACTIC how the first seconds create tension · VISUAL HOOK what happens in frame one · VERBAL HOOK the first line said or written · MECHANIC why someone keeps going · FORMAT the vessel a viewer would name · PROOF why anyone should believe it · PAYOFF what the viewer gets · CTA what happens next.
2. **Separate the layers**: "street interview" is a format, "contrarian" a hook tactic, "social proof" a proof, "plates you will actually use" an angle, "the potter vs the factory plate" a concept. A concept is the combination, never one of its parts.
3. **Write the hook family**: 4-8 hooks on the same angle that differ by hook tactic or visual hook, not by synonyms. Frame one must work with the sound off and before any text is read.
4. **Check the first three seconds** for each video hook: product or tension visible by second two, no logo-only opener, text inside the platform safe zone (`cstack video safezone`).
5. **Update the bet**: concept fields, hook family; run `cstack creative check` and fix every family warning.

## Decision rules

- One angle per family of hooks; a new angle is a new bet.
- Hooks differ by tactic or image, not wording alone.
- No hook may promise what the proof cannot carry.
- Native to the platform in structure, native to the brand in codes: a hook that only works in the platform's default look fails the brand constraint.

## Outputs, files written, state updated

- The bet file updated (concept, hook family); `work/ads/<bet-id>-hooks.md` with each hook's nine parts and first-frame sketch.

## Evals required

- T0: `cstack creative check` passes with no family warnings.
- Fixture: `creative-munged-taxonomy.yaml`.

## Handoff

`copywriting` (verbal hooks and copy in voice), `video-direction` (beats for video hooks), `asset-factory` (production), `claims-proof` (any new claim).

## Failure modes

- "UGC" written as the concept.
- Ten hooks that are the same sentence reworded.
- A first frame that needs the sound or the caption to make sense.

## Examples

Angle: one kiln load, then gone. Hook tactic: confession. Visual hook: hands lifting a warm plate off the kiln shelf. Verbal hook: "I only fire this glaze once." Mechanic: reveal. Format: creator to camera. Proof: demonstration (the batch count on the shelf). Payoff: how many are left. CTA: shop.
