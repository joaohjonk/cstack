# Placement methods (mockup reference)

Loaded on demand by `/mockup`. Source: `docs/research/mockups-and-vector.md` sections A2, A4 and D1–D2 (accessed 2026-10-03).

## Route by placement

| Placement | Deterministic default | Generative role | Gate |
|---|---|---|---|
| Device / screen | Figma frame or HTML → screenshot → quad into a device photo | Background only | Screen pixels match the source (verify) |
| Social placement | HTML template of the platform chrome with the real asset, rendered at true size | None | Safe zones, `cstack audit` sizes |
| Print (poster, card, book) | Planar quad + shading + paper texture | Scene plate | Verify; crop-safe |
| Signage / out-of-home | Quad or mesh onto a photo of the site | Plate, weather, light | Legible at simulated viewing distance |
| Apparel | Displacement + shading from the garment photo, print-area mask | Model or garment plate | Print area in bounds; art not stretched more than about 2–3% |
| Box / carton | Dieline → one quad per panel, or 3D (Blender, Pacdora) | Environment plate | Panel art equals dieline art; barcode reads |
| Can / bottle / jar | Cylinder unwrap + highlight screen layer; cones use a fan unwrap | Plate, condensation | Verify after unwarp |
| Product in context | Hybrid: plate, place the official packshot, contact shadow, masked relight, paste back | Plate and relight | `product-fidelity` audit, verify |

## Layer stack that reads as real

base photo → art warped and displaced, clipped by the mask → multiply: shading map (base luminance, mid-grey = no change) → screen: highlight map (specular only) → optional texture at low opacity (paper grain, weave) → edge: 0.5–1 px feather and a slight blur to match lens softness.

## Geometry notes

- Cylinder: screen x across the visible width maps to label arc length u = R·asin(x/R) for visible radius R; edges compress; about a third to a half of the circumference is visible; add a vertical-ellipse correction for camera pitch.
- Cartons: each visible panel is its own quad with its own shading value, fed from one dieline with `art_region`. Panels that share an edge each soften it, so overlap neighbouring quads by half a pixel to hide the seam.
- Limits of `cstack mockup render`: cylinders are orthographic with a vertical axis (tilted bottles and cones need a dense `mesh`); no PSD import; art enlarged more than 1.5× warns with the size of art to supply.
- Displacement: offset = (d − 0.5) × strength from a luminance map, neutral 128 outside the print area; shade = 1 − (1 − shade map) × blend (about 0.6).

## Template package

`template.json` (base, placements with kind quad | cylinder | mesh, region, mask, displacement, shading layers, licence {source, terms, client_use_allowed}) plus the layer PNGs. The format and an example live with `cstack mockup` (`tests/fixtures/mockup/poster-wall/README.md`); `cstack mockup check --template <dir>` validates a package. A licence of `unknown` keeps renders internal; `false` blocks the render.

## Paste-back after a relight

Paste the protected region back from the composite with a feather of 2 px or less, or grow the region by the feather. A wider feather blends relit pixels into the art and `mockup verify` flags it. Relighting outside the region passes.

## What verify catches

Checked on synthetic changes to a perspective label (2026-10-03), not yet on owner verdicts: untouched and ±3 noise pass; 8-level banding and a +6 relight warn; a +12 relight, a single changed glyph (worst-tile SSIM 0.65 while the mean moved only 0.02), a 3×3 px patch, a blur and a hue swap fail. The worst tile decides more often than the mean, which is why a harmonize pass that looks fine can still fail.
