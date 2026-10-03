---
name: winner-scaler
description: "Turn one of the brand's own winning ads into a diverse family: name what is invariant (usually a mechanism), list the surface traits free to change, and plan variants across format, audience, proof, visual world, talent and awareness stage instead of headline rewrites. Use when an ad wins or fatigues. Not for competitors' ads, which are references, never winners to copy."
license: MIT
---

# /winner-scaler

A bad agent writes 20 headline rewrites. A strategist asks what is actually invariant about the winner, then moves everything else on purpose. [Shared preamble](../cstack-shared/PREAMBLE.md) applies.

## When to use

- One of the brand's ads beats the account median with enough data (`cstack creative report`).
- A winner is fatiguing and needs a family behind it.
- Before raising spend on one concept.

## When not to use

- Any ad that is not the brand's own: a competitor's ad is a reference for `competitor-intel`, never a winner to clone.
- A new angle: `creative-strategist`.

## Inputs

- The winner's record in `state/performance.jsonl` (tags and metrics) and the ad itself.
- `state/insights.jsonl` for confounds on its tags.
- `cstack brand context --task creative` (codes, anti-codes, claims).

## Missing-input behavior

- Winner not in `state/performance.jsonl`: import its results first (`cstack creative import`); the check refuses a winner it cannot find.
- Winner below the minimum data: it is not a winner yet; return to `creative-intelligence`.

## Source precedence

The winner's own data and confound notes > repeated learnings > the owner's read of why it works > model opinion.

## Tools / providers

`cstack creative report`, `cstack creative check <family>`, `registry/creative-taxonomy.json`.

## Process

1. **State the invariant** as a mechanism in one sentence ("skeptic → surprise → product revelation"), and the families that carry it (usually angle and mechanic, sometimes proof).
2. **List what is not invariant**: talent, setting, duration, wording, background, format. Confounded tags go here until a test says otherwise.
3. **Expand along orthogonal axes**, one or two families per variant: same angle × new format · same format × new audience · same mechanic × new proof · same hook × new visual world · same insight × new talent · same promise × new awareness stage.
4. **Prefer the brand's own codes**: when the winner is in platform-default grammar, at least one variant moves it into the brand's visual world.
5. **Write the family** (`*.creative-family.yaml`) and run `cstack creative check`: no variant may touch the invariant; copy-only variants and low diversity are flagged.
6. **Hand the family to `asset-factory`** with one experiment id for the family.

## Decision rules

- A variant that changes the invariant is a new concept: send it to `creative-strategist`.
- A variant that changes only the verbal hook or CTA is a rewrite, not a family member.
- Four or more variants spread over at least three families.
- Fatigue is answered with a new hook or visual hook on the same angle before a new angle.

## Outputs, files written, state updated

- `work/ads/<date>-<slug>.creative-family.yaml`; no state change until results return.

## Evals required

- T0: `cstack creative check` passes.
- Fixtures: `creative-winner-invariant.yaml`, `competitor-ad-as-production-input.yaml`.

## Handoff

`asset-factory` (production of the family), `hook-format-lab` (new hooks on the same angle), `creative-intelligence` (reading the family's results).

## Failure modes

- Twenty headline rewrites.
- Treating the winner's surface (the person, the kitchen, the green background) as the reason it won.
- Scaling a confounded winner without testing the confound.

## Examples

Winner: "one kiln load, then gone" (creator to camera, the potter, platform-default look). Invariant: a finite batch shown by its maker, so the scarcity can be checked (angle, mechanic). Variants: the batch as a number on a still in the brand's light; unloading the kiln as a behind-the-scenes moment; one batch against a factory run as a comparison static; the batch arriving on a first-home shelf. [Example family](../../examples/tessel-kiln/work/ads/2026-10-one-kiln-load.creative-family.yaml).
