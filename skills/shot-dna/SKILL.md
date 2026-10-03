---
name: shot-dna
description: "Decompose a reference photograph or plan a proposed shot into Shot DNA: what and why, camera (format, focal length, distance, height, angle), composition, a named lighting recipe, exposure, focus, materials, surfaces, color logic, controlled imperfection, post, transferable mechanism, do-not-copy and risks. Use before any high-end image work, when a reference must be transferred without copying, or when generated images feel generic. Not for finding references (use taste-search) or ordering a whole campaign (use campaign-sequence)."
license: MIT
metadata:
  cstack-version: "0.1.0"
  cstack-meta: "skill.meta.json"
---

# /shot-dna

Do not store references only as images. Store why they work (section 7). Shot DNA is the bridge between taste and a prompt recipe. [Shared preamble](../cstack-shared/PREAMBLE.md) applies.

## When to use

- Every serious photograph, packshot or campaign frame, before prompting.
- A picked reference must be transferred to the brand without copying it.
- Generated frames look like "AI photos": the DNA is missing decisions.

## When not to use

- Finding references: `taste-search`. Sequencing shots: `campaign-sequence`. Compiling the prompt: `prompt-director`.

## Inputs

- Reference image(s) with their `reference` records, or a shot role from the campaign plan.
- Brand-world entities (`@PRODUCT_*`, `@CAST_*`, `@LOCATION_*`, `LIGHT_*`, `CAMERA_*`), brand photography, lighting and camera-language sections.

## Missing-input behavior

- Reference rights unknown: decompose for mechanism only; the image is never used as a generation input.
- Unknown product geometry: set `product_role` with "UNKNOWN dimensions" and hand to `product-fidelity` before generation.

## Source precedence

Brand photography rules and locked entities > the reference's mechanism > model preference. A reference never overrides a locked product trait.

## Tools / providers

Vision reading by the agent (state uncertainty), `cstack audit` for real dimensions, optional EXIF read for the reference. No paid calls.

## Process

1. **What / why / message**: one line each. Why does this frame work?
2. **Camera**: format feel, focal length equivalent, distance, height, angle, perspective; depth of field; focus behavior (including deliberate misses); shutter and motion.
3. **Composition**: crop, subject placement, negative space, foreground obstruction, horizon, product position and scale.
4. **Lighting as a recipe**, never adjectives. Name one or a combination: hard direct flash · flash + underexposed ambient · soft north window · large overhead diffusion · strip specular product light · cross-light · reflected daylight · mixed fluorescent/daylight · sodium or tungsten contamination · polarized product light · glossy-metal control · translucent-liquid control. Add direction, falloff, color temperature, shadow hardness.
5. **Materials, surfaces, props, wardrobe, environment, color logic, texture.**
6. **Controlled imperfection** (anti-AI realism) only where it serves the direction: inconvenient crop, small exposure miss, uneven flash falloff, human movement, condensation, fingerprints, wrinkled textile, non-heroic gesture, background intrusion, mixed color temperature, awkward negative space.
7. **Post**: grade, grain, sharpening, retouch limits.
8. **Emotional temperature and cultural signal.**
9. **Transferable mechanism / incidental content / do-not-copy**: the removal test applies.
10. **Brand fit and risks** (product truth, cultural register, overcopy).
11. For a planned shot: bind entities and mark `fixed` decisions (what must not change during refinement).

## Decision rules

- "Cinematic", "moody", "premium", "editorial" are not lighting or camera decisions; replace them with recipe terms.
- Every DNA names one transferable mechanism in one sentence.
- A planned shot declares which dimensions are fixed for refinement so later edits change one variable at a time.

## Outputs, files written, state updated

- `references/dna/<id>.shot-dna.yaml` (validated), linked from the reference (`shot_dna_ref`) or the campaign shot.
- State: none beyond files; lineage begins when the shot is generated.

## Evals required

- T0: schema validation (camera, composition, lighting, transferable_mechanism, do_not_copy required).
- T1: lint for adjective-only lighting fields: `cstack validate` warns when lighting lacks a recipe term; `cstack lint shot-dna <file>` checks one record.
- Fixture: `exact-product-photo.yaml` (DNA hands product truth to product-fidelity).

## Handoff

`prompt-director` (compile), `product-fidelity` (product lock), `campaign-sequence` (role fit), `model-router`.

## Failure modes

- Copying the reference's props and location instead of its light logic.
- Imperfection as decoration ("add film grain") rather than purpose.
- Missing camera height/distance: models default to eye-level hero shots.

## Examples

Reference: a drink on a café counter. DNA: 35mm-equivalent, 0.6 m, counter height, slight down-angle; on-camera direct flash + underexposed tungsten ambient (warm background, crisp foreground, hard shadow left); condensation on glass; crop cuts the lip of the glass (inconvenient crop). Mechanism: "flash isolates the product as evidence inside a lived, warm room". Do not copy: the café, the cup shape, the hand tattoo.
