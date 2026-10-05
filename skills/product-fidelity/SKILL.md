---
name: product-fidelity
description: "Lock the real product (geometry, proportions, label, logo, closures, materials, color) as a brand-world entity, choose a production method that preserves it (single pass vs. decomposed plate, product and composite), and verify outputs for silhouette, label and color drift. Use for any packshot, product photo, PDP image or ad where the actual product appears, or when a generated product looks slightly wrong. Not for lifestyle images without the product (use generate-media) or brand-level adherence (use brand-verify)."
license: MIT
---

# /product-fidelity

The product is a fact, not a style. An image model is allowed to invent light; it is not allowed to invent the product. [Shared preamble](../cstack-shared/PREAMBLE.md) applies.

## When to use

- Any frame where the real product, packaging, label or logo is visible.
- "The can looks a bit off", "the label text is garbled", "the lid is wrong".
- Building `PRODUCT_*` / `PACKAGING_*` entities for a brand.

## When not to use

- No product in frame: `generate-media`. Brand look and feel: `brand-verify`. Fixing one region: `image-edit` (this skill decides that a region fix is needed).

## Inputs

- Product masters in `assets/official/` or `assets/product/` (packshots, dielines, vectors, label art, measured dimensions).
- Brand-world entity if present; Shot DNA for the target frame.

## Missing-input behavior

- No measured dimensions: record `UNKNOWN` and derive proportions only from an official orthographic photo or dieline; say which. Never infer size from a lifestyle image.
- No vector label art: label text must be composited from the highest-resolution official photo, or the frame avoids readable label text; never let a model "write" the label.

## Source precedence

Official masters and dielines > owner statements > approved previous outputs > anything generated. Generated outputs never become masters.

## Tools / providers

Deterministic: `cstack audit` (dimensions, unintended reframe), silhouette/outline comparison against the master, color sampling against tokens, OCR on label regions where available. Media: `generate-media` for plates, `image-edit` for integration and repair.

## Process

0. **Product truth first** (F71): the canonical files are the owner's own photo or official assets, recorded as a reference with `library: own_asset` and `approval: locked` or `current`. Images research labels "real product" stay `approval: inferred` until the owner confirms them; a flow with `requires: [product_truth]` will not make until one exists.
1. **Lock the entity** (`brand/brand-world.json`): canonical files with roles (master, vector, mask, spec) and sha256, immutable traits (silhouette, proportions, label layout, logo, closures, seams, material, finish, color), allowed variation (condensation, angle, fill level), forbidden drift.
2. **Decide the method** with the decision tree: can the final be generated faithfully in one pass? yes → generate + verify. no → decompose: lock product → environment plate → talent/hands → interaction → integrate the real product → contact shadows → reflections/refraction → lens and perspective match → grain/sharpness match → grade → type/layout outside the model → verify.
3. **Plan audits** per output: dimensions/aspect, silhouette vs. master, label OCR or overlay diff, logo overlay diff, color delta vs. token, solid background exactness for commerce, crop-safe zones, hands/fingers only where hands are in the brief.
4. **Run and repair**: after each step, audit; local defects go to `image-edit` (crop, paste back with feather, color match) instead of full regeneration.
5. **Verdict** per output: pass / fix / reject with the failing trait named.

## Decision rules

- Packaging sizes come from the approved `*.pack-spec.yaml`, never a guess; every pack-bearing frame passes `cstack pack check` (with `--product-box` when the product shows too, F97) or is labelled illustrative (F86).
- Anatomy errors in hands holding the product fail the frame outright.
- Text, logos and legal copy on product are composited from official art, never generated.
- Two failed full regenerations on the same defect → switch method (decompose or composite); do not reroll a third time.
- A generated output may become a reference for that model's notes (`model_notes`), never a product master.
- 3D: label from official artwork on its UV island, four-angle overlay against the artwork, bounding box against measured dimensions (`three-d`).
- Video: drift grows over a clip, so audit the first frame, the last frame and every cut, not only the first (`cstack video qa`).

## Outputs, files written, state updated

- `brand/brand-world.json` product/packaging entities; `work/<shot>/...` outputs with `.gen.json` sidecars; `work/<shot>/fidelity.md` audit table.
- State: `state/evals.jsonl` (fidelity verdicts), `state/failures.jsonl` (`product_drift`, `anatomy`, `material_failure`), entity `model_notes` for model quirks (with expiry).

## Evals required

- Fixture: `exact-product-photo.yaml` (prioritize fidelity and compositing), `one-region-wrong.yaml`.
- T1: audit commands exit non-zero on drift; T3 bounded live test on change of method.

## Handoff

`image-edit` (repairs), `brand-verify`, `creative-review` (PHOTOGRAPHER, PRODUCTION lenses), `learn-loop` (model quirks).

## Failure modes

- Accepting "close enough" labels; customers notice.
- Regenerating whole frames to fix a cap color.
- Treating a model's own description of the image as verification.

## Examples

Hero for a glass bottle: one-pass attempts warp the label → decompose: plate generated with an empty hand pose; official packshot cut out and placed; refraction and contact shadow repaired in `image-edit`; label overlay diff < 2px; color delta of cap vs. token within tolerance → pass.
