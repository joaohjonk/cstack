---
name: mockup
description: "Put approved art into realistic placements (packs, cans, apparel, print, signage, screens, ad placements) without regenerating the mark or label: composite it mathematically onto a template or generated plate, harmonize light only outside the protected region, paste the truth back and verify by inverse warp. Use for mockups of a pack, label, logo, merch or screen. Not for product photos (use product-fidelity) or 3D renders (use three-d)."
license: MIT
metadata:
  cstack-version: "0.1.0"
  cstack-meta: "skill.meta.json"
---

# /mockup

A model may invent light, folds and context. It may not invent the mark, the label, the type or the legal copy. Generate the world, composite the truth, harmonize the light without touching the truth, then prove it. [Shared preamble](../cstack-shared/PREAMBLE.md) applies; method first (`cstack flows search "mockup"`). Placement methods: [references/placements.md](references/placements.md). Evidence: `docs/research/mockups-and-vector.md`.

## When to use

- "Show the label on a can", "mock up the box", "the logo on a tote, a storefront, a billboard", "the app in a phone", "the ad in the feed".
- A set of placements for a deck, a pitch, a launch or a retailer.

## When not to use

- Photographing or generating the product itself: `product-fidelity` + `generate-media`.
- A rotating object, a 3D render or a turntable: `three-d`.
- Designing the artwork: `identity-system`, `symbol-design`, `copywriting`.

## Inputs

- Approved art (SVG or PNG from `assets/official/` or an approved `work/` version), the placement list, a template package (`template.json` plus layers, with a licence) or a plate request, the PRODUCT entity when a real product appears, the official dieline for packaging, budget.

## Missing-input behavior

- No approved art: stop. Never generate a stand-in mark, label or legal copy.
- No template: build one from an owned photo (quad corners, cylinder parameters, mask) or request a plate through `generate-media`; say which.
- Template licence unknown: internal previews only, labelled; client-facing renders stay blocked until the licence is recorded.
- Packaging without the official dieline: stop and ask (`product-fidelity` rule).

## Source precedence

Official art and dieline > approved previous mockups > template layers > generated plate. The plate never overrides the art; generated pixels inside the protected region are always replaced.

## Tools / providers

- `cstack mockup render --template <dir> --art <file> [--placement id] --out <png>`: quad homography, cylinder unwrap (u = R·asin(x/R)), mesh, displacement, multiply and screen layers; sidecar with hashes and licence status.
- `cstack mockup verify --template <dir> --art <file> --render <png>`: inverse-warp diff (mean difference, edges, SSIM) with a heatmap.
- `cstack edit paste` (paste-back), `cstack audit` (sizes), `site-capture` (HTML social chrome and device frames at true size).
- Optional, detected with `cstack tools`: Dynamic Mockups MCP (template renders), Canva MCP, Adobe connector, Figma MCP (device and social frames), Blender (3D templates), Pacdora (human). Plates through `cstack generate`, budgeted.

## Process

1. **Target**: placements, the reference look, sizes, where each will be shown.
2. **Route** each placement with the table in the reference file (device, social, print, signage, apparel, box, can or bottle, product in context).
3. **Template or plate**: an owned template first; otherwise a plate with an empty surface (2–4 probes on a cheap model after `cstack spend plan`). Record the geometry and the licence in `template.json`.
4. **Composite** with `cstack mockup render`: one quad per carton panel from the dieline; cylinder for cans and bottles; displacement plus shading for fabric and pouches.
5. **Harmonize** (optional): a masked edit of light and shadow outside the protected region, then paste the protected region back from the composite.
6. **Verify** every render with `cstack mockup verify`; barcode readable; signage legible at viewing distance (downsample test).
7. **Review**: `creative-review` (PRODUCTION lens), `brand-verify`, owner.

## Decision rules

- Composite before generate; generate the world, never the truth.
- A harmonize pass that changed protected pixels is reverted by paste-back, never accepted because it looks better.
- Two failed verifies on one placement: change method (template, `three-d`, or a photo shoot), not a third attempt.
- Motion mockups for social: deterministic frames, then `video-direction` for the cut and encode.
- A template licence is a gate, like a model licence.

## Outputs, files written, state updated

- `work/mockups/<id>/`: `template.json` or a link to the package, renders, render sidecars, verify reports and heatmaps, `.gen.json` for plates, `report.md`.
- Ledger rows for plates and harmonize passes; lineage for finals; failures for verify misses.

## Evals required

- T1: `cstack mockup verify` passes on every delivered render.
- Fixtures: `mockup-logo-must-composite.yaml`, `mockup-harmonize-leaks-label.yaml`, `mockup-template-licence-unknown.yaml`.

## Handoff

`product-fidelity` (product present), `image-edit` (local repair), `three-d` (angles a 2D template cannot do), `video-direction` (motion mockups), `creative-review`, `brand-verify`.

## Failure modes

- A generated label or logo that is "close enough"; art placed on a stale dieline; visible bleed.
- Perspective mismatch between carton panels; flat art on a curved surface; no contact shadow.
- A template used client-facing without a licence.

## Examples

"Our label on a can on a café table": two plate probes of an empty table with a blank can (cheap model) → cylinder placement from the can's measured diameter → render → masked relight of reflections outside the label → paste-back → verify passes (SSIM and edge diff) → `creative-review` → owner picks. Rejected: asking an image model for the whole scene with the label (lettering drifts).
