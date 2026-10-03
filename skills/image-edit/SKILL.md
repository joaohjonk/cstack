---
name: image-edit
description: "Repair or change one region of an image while preserving every good decision: crop the region, edit or regenerate only that crop, paste it back with a feathered edge and color match, or composite official assets (logos, labels, type) instead of generating them. Use when one area is wrong (hands, label, reflection, background intrusion), when a mark or text must be exact, or for retouch and grade. Not for new images (use generate-media) or deciding whether the product is faithful (use product-fidelity)."
license: MIT
metadata:
  cstack-version: "0.1.0"
  cstack-meta: "skill.meta.json"
---

# /image-edit

Fix the minimum necessary (section 19). A good frame with one bad hand is not a reroll. [Shared preamble](../cstack-shared/PREAMBLE.md) applies.

## When to use

- One region fails a review or audit.
- Real marks, labels, legal text or typography must appear exactly.
- Contact shadows, reflections, refraction, grain or grade need matching after a composite.

## When not to use

- The whole composition is wrong: back to `shot-dna` / `generate-media`.
- Judging fidelity: `product-fidelity`. Brand adherence: `brand-verify`.

## Inputs

- Source image (never edited in place; originals preserved), region (x, y, w, h in px or fraction) and the defect in one line, official asset files for composites, the lineage entry of the source.

## Missing-input behavior

- No region given: ask for it or propose one with a marked preview; do not edit the whole image "to be safe".
- No official asset for a mark or label: stop; generated marks are not allowed.

## Source precedence

Official assets > approved previous version > edit model output. The edit may never alter locked traits outside the stated region.

## Tools / providers

Deterministic first: crop, paste with feather, color/levels match, composite, mask (`cstack edit paste --base a.png --patch b.png --x N --y N [--feather 8] [--region x,y,w,h] --out c.png`, from `providers/local/region_paste.mjs`: pure Node for PNG, Chromium canvas for JPEG/WebP; writes a new file, never the inputs; ask before installing anything). Generative: an edit model through `cstack generate` with `operation: edit` on the crop only.

## Process

1. **Duplicate** the source into `work/<shot>/v<N+1>/`; never modify the parent.
2. **Diagnose** the defect type (anatomy, label, reflection, contact shadow, background intrusion, color, grain) and choose the smallest operation: composite > local adjust > crop-edit > masked edit > full regenerate.
3. **Crop-edit-paste**: crop with margin, edit only the crop (describe only the change), paste back with a feathered edge, match color and grain to the surround.
4. **Composite** real marks/labels/type from official files with correct perspective, lighting and grain.
5. **Audit**: dimensions unchanged (`cstack audit`), region diff confined (outside-region pixels unchanged beyond feather), fidelity checks if product touched.
6. **Lineage**: intent, changed = the region and defect, unchanged = everything else.

## Decision rules

- Two failed local attempts on the same defect → escalate method (composite or regenerate from the approved plate), not a third identical try.
- Outpainting/expansion that invents new geometry near the product is rejected for product frames.
- Edits never change the frame size unless the brief asks for a reframe.

## Outputs, files written, state updated

- `work/<shot>/v<N+1>/<file>` + `.gen.json` (if generative), before/after pair for review.
- State: `state/lineage.jsonl`, `state/failures.jsonl` (`repair_worked` true/false), ledger rows for paid edits.

## Evals required

- Fixture: `one-region-wrong.yaml` (targeted edit before full regeneration).
- T1: outside-region diff check on the fixture pair.

## Handoff

`product-fidelity` (re-verify), `creative-review`, `brand-verify`.

## Failure modes

- Seams and halos from unmatched grain or color.
- The edit model "improving" untouched areas: always paste back only the region.
- Generated text pretending to be a label.

## Examples

Shot-04 v3: the left hand has six fingers. Crop 512px around the hand, masked edit "a relaxed left hand holding the glass, five fingers", paste back with 24px feather, match grain; outside-region diff 0; lineage v4 "changed: left hand; kept: everything".
