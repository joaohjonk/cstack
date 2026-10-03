---
name: vector-master
description: "Turn a refined drawing, a raster logo or an icon set into checked vector masters and a kit: retrieve before tracing, clean SVG, lint structure, palette, strokes and grid, test reduction and one colour, export variants, lockups, favicon and app icons; icon-set mode lints every icon against one grammar. Use when marks or icons must become production files. Not for exploring marks (use symbol-design)."
license: MIT
---

# /vector-master

A master is a file other people build on for years: exact geometry, no hidden rasters, no stray transforms, one file per colour variant, proven at the smallest size it will ever appear. [Shared preamble](../cstack-shared/PREAMBLE.md) applies. Master rules and icon grammar: [references/svg-rules.md](references/svg-rules.md). Evidence: `docs/research/mockups-and-vector.md` sections B2, B4–B6, D4, D5 and E.

## When to use

- **master**: an approved, human-refined drawing becomes the master files and the kit.
- **vectorize**: only a raster of the mark exists.
- **icon-set**: an icon family needs a grammar, new icons, or a consistency check.
- Any SVG needs checking before it ships.

## When not to use

- Exploring new marks: `symbol-design`.
- Logo usage rules, lockup ratios and clear space as brand policy: `identity-system` (this skill produces the files those rules point to).

## Inputs

- master: the refined SVG plus the direction notes. vectorize: the raster and its provenance. icon-set: grammar tokens (grid, padding, stroke, caps, joins, radius, minimum gap, optical sizes) or the open set being extended. Brand palette tokens for colour checks.

## Missing-input behavior

- No provenance for a raster mark: ask whether it is official before tracing.
- A vector may already exist (`assets/official/`, the website's SVG, the guidelines PDF): retrieve it; tracing is the last resort.
- No icon grammar: propose one from the open set the brand extends, marked `provisional`, and ask.
- No Chromium: run the structural lint, report reduction and kit as MISSING, say why.

## Source precedence

Official vector > human-refined drawing > professional trace > automatic trace > generated SVG. A trace or a generated SVG stays `provisional` until a person cleans it and the owner signs off.

## Tools / providers

- `cstack svg lint <file|dir> [--grammar icons.tokens.json] [--palette <tokens>]`: structure, complexity, palette, strokes, grid, accessibility, precision.
- `cstack svg reduce <file>`: 16/24/32/48/64 px on light and dark plus one colour, with a reduction score.
- `cstack svg kit <file> --out <dir>`: favicon.svg, favicon.ico, apple-touch-icon 180, 192 and 512, maskable 512 inside the safe zone, monochrome SVG, manifest snippet.
- Tracing: Potrace or VTracer if the owner has them (external binaries, never bundled), vectorizer.ai or Recraft vectorize (paid, ask first). Figma MCP to hand a master to the owner for editing; git stays the source.

## Process

0. **Gate**: a figure, hero or key visual starts from a flow plan; `cstack flows gate <plan> --stage make` passes. When the deliverable is generated imagery, vector is a substitute only with the owner's recorded yes, never a quiet fallback.
1. **Retrieve before making**: search official assets and the brand's own files for a vector.
2. **master mode**: clean (keep the viewBox, outline text, flatten transforms, remove rasters and editor metadata), then `cstack svg lint`, `cstack svg reduce`; fix and re-run; produce full colour, one colour and reversed files and the lockups the direction defines; `cstack svg kit`.
3. **vectorize mode**: clean the raster, trace (B/W or colour), lint node count and colours against tokens, overlay against the raster at 512 px, hand to a person for curve cleanup; mark `provisional`.
4. **icon-set mode**: write the grammar as `icons.tokens.json`; extend an open set where possible; draft geometric icons as SVG inside the grammar; `cstack svg lint --grammar` every file; contact sheet at 16/20/24 on light and dark; metaphor clarity goes to review.
5. **Owner approval**, then `cstack brand set logo_marks` with provenance (masters) or write `brand/icons/` (icon sets).

## Decision rules

- Fix the drawing, not the export settings; a lint fail is a drawing problem until shown otherwise.
- A mark that fails at 16 px gets a simplified small-size variant, approved like the master.
- `currentColor` for UI icons; brand colours only from tokens; one file per colour variant for marks.
- Never optimise away accessibility (title, viewBox) to save bytes.
- Licences: Potrace is GPL and stays an external binary; open icon sets keep their licence notice.

## Outputs, files written, state updated

- `work/marks/<id>/master/` (variants, lockups), `work/marks/<id>/kit/`, lint and reduction reports; icon sets in `work/icons/<id>/` then `brand/icons/` and `brand/tokens/icons.tokens.json` after approval.
- State: `logo_marks` through `cstack brand set` (owner approval), lineage for masters, ledger rows for paid traces.

## Evals required

- T1: `cstack svg lint` has no fail and `cstack svg reduce` passes at the declared minimum size.
- Fixtures: `mark-fails-16px.yaml`, `icon-set-mixed-strokes.yaml`, `vectorize-when-vector-exists.yaml`.

## Handoff

`identity-system` (usage rules), `mockup` (placements), `creative-review` (consistency and metaphor), `brand-verify`.

## Failure modes

- A traced or generated SVG shipped as the master; counters that close at 16 px.
- Mixed stroke widths across an icon set; hidden rasters or live text in a master.
- An app icon whose mark falls outside the maskable safe zone.

## Examples

icon-set mode for a fictional app: grammar 24 grid, 1 px padding, 2 px stroke, round caps and joins, radius 2. Twelve icons extend an open set; lint flags three with 1.5 px strokes and one with a butt cap; fixed; contact sheet at 16/20/24 on light and dark goes to `creative-review`, which questions one metaphor; the owner approves eleven.
