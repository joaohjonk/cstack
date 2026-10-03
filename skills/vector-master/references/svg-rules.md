# SVG master rules and icon grammar (vector-master reference)

Loaded on demand by `/vector-master`. Sources: `docs/research/mockups-and-vector.md` B2, B4, B5 (accessed 2026-10-03).

## Master file rules

- Keep the `viewBox`; size by viewBox, not width/height alone.
- Outline all text; no `<text>`, `<image>`, `<script>`, `foreignObject` or external hrefs in a master.
- Flatten transforms on paths; remove editor metadata and hidden layers.
- Icons: integer or 0.5 px coordinates; `fill="currentColor"` or `stroke="currentColor"`.
- Accessibility: `role="img"` plus `<title>` for standalone marks; `aria-hidden="true"` for decorative inline icons.
- One file per colour variant for marks: full colour, one colour, reversed.
- SVGO v4 keeps `removeViewBox` and `removeTitle` out of the default preset; keep it that way. `cleanupIds` can break references.

## Craft checks every master passes

- Construction: a stated grid or geometry; optical corrections recorded (overshoot of rounds past baseline and cap height, thinner horizontals, opened joins, centring by mass or by geometry, noted).
- Reduction: 16, 24, 32, 48 px and the print minimum (for example 10–15 mm); counters stay open, details do not merge.
- One colour on light and dark, and reversed.
- Clear space and minimum size in units of the mark, not pixels.
- Distinctiveness against category marks and common icon sets; clearance is for the owner and counsel.

## Favicon and app icon set

favicon.ico 32 (multi-size), icon.svg (may carry a dark-mode media query), apple-touch-icon 180, manifest 192 and 512, maskable 512 with important ink inside a circle of radius 40% of the width.

## Icon grammar (declare once, lint every file)

| Field | Example (an open-set convention) |
|---|---|
| grid | 24 × 24 |
| padding | ≥ 1 px |
| stroke | 2 px, centred |
| caps / joins | round / round |
| radius | 2 px on shapes ≥ 8 px, else 1 px |
| min_gap | 2 px between elements |
| optical_sizes | 16, 20, 24 |

Open sets to extend rather than reinvent: Lucide (ISC), Material Symbols (Apache-2.0, variable axes FILL, wght, GRAD, opsz), Phosphor (MIT, six weights). Keep their licence notices.

## Complexity budgets (defaults; tune per brand)

Icon above about 300 path nodes or a mark above about 1,500 is a warning; a 5× jump against the previous version is a fail to explain.
