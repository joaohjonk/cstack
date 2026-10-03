---
name: symbol-design
description: "Explore and direct a logo, symbol or monogram like an identity studio: brief as mechanisms, category silhouettes, canon, cheap wide exploration judged in one colour at 32 px, construction grids and optical corrections, two or three directions for the owner. Never makes or approves the master. Use for a new or refreshed mark. Not for usage rules (use identity-system) or master files (use vector-master)."
license: MIT
---

# /symbol-design

A mark is a vessel: it earns meaning from what it stands for, so it has to be simple enough to survive every medium and distinct enough to own. Judge forms in one colour at small size first; colour and detail come later. [Shared preamble](../cstack-shared/PREAMBLE.md) applies; method first (`cstack flows show logo-system`). Evidence: `docs/research/mockups-and-vector.md` sections B1–B3, B6 and D3.

## When to use

- A new brand mark, symbol or monogram; a refresh; a secondary mark for favicons, badges or embroidery; a mark for a sub-brand or an event.

## When not to use

- Usage rules, lockups and clear space for an approved mark: `identity-system`.
- Cleaning, linting and exporting an approved drawing, vectorizing a raster, icon sets: `vector-master`.

## Inputs

- Brief: the name, what the mark must do (attributes as mechanisms, not adjectives), the applications list from favicon to signage, competitors, existing equity, constraints the owner knows (trademark classes, cultural notes). `cstack brand context --sections logo_marks,color,typography`.

## Missing-input behavior

- No applications list: write a default (favicon 16–48 px, app icon, avatar, packaging, signage) marked `provisional` and ask.
- No competitor set: run `competitor-intel` for category silhouettes or say the distinctiveness check is incomplete.
- "Just generate a logo": explain the route (explore, human refinement, master) and offer one cheap exploration round.

## Source precedence

Owner direction and existing equity > approved brand state > category research > canon mechanisms > generated explorations. A generated form is a reference, never a master.

## Tools / providers

- Exploration: Recraft vector models (MCP or API, budgeted), raster image models for form studies, LLM-written SVG for geometric constructions only (quality degrades with complexity and organic form).
- `cstack svg reduce` (16/24/32/48 px, one colour, reversed) and `cstack svg lint` on SVG drafts; `site-capture` for comparison boards.
- Canon entries in `canon/` (mark-making and systems: `paul-rand`, `otl-aicher`, `isotype`, `vignelli`), `competitor-intel`, `taste-search`.

## Process

1. **Brief** with an owner gate (`brief` when missing).
2. **Research**: category silhouettes, metaphors everyone uses, three to five canon mechanisms, near, middle and far references (models, not looks).
3. **Mark type**: wordmark, lettermark or monogram, pictorial, abstract, emblem, combination; choose with the fit table in the research note and say why.
4. **Explore wide and cheap**: 20–40 thumbnails across three to five ideas; judge them in one colour at 32 px before anything else.
5. **Shortlist** two or three directions: the idea, the mechanism, the construction, the risks (similarity, reduction, licence of any font used).
6. **Construction**: grid overlays and measurement sheets; propose optical corrections (overshoot of rounds, thinner horizontals, opened joins, centring by mass) as SVG overlays for the designer.
7. **Owner picks**; a human refines on the grid; hand the drawing to `vector-master`.

## Decision rules

- One colour at 32 px before colour; a mark that only works in colour fails.
- Kill category clichés unless the brief asks for convention, and say which were killed.
- Show two or three directions with ideas, never 40 options.
- Never assert trademark clearance; flag visual similarity and leave clearance to the owner and counsel.
- Never self-approve; the owner picks and a person refines.

## Outputs, files written, state updated

- `work/marks/<id>/`: `explore/` thumbnails with `.gen.json` sidecars, `directions.md`, grid overlays, reduction sheets, a similarity board.
- Ledger rows for generations; owner picks to `state/feedback.jsonl`.

## Evals required

- Fixtures: `logo-generated-raster-as-master.yaml`, `llm-svg-organic-mark.yaml`.

## Handoff

`vector-master` (master and kit), `identity-system` (usage rules and lockups), `creative-review` (distinctiveness and reduction), `competitor-intel`.

## Failure modes

- A generated raster approved as the logo; a mark that dies at 16 px; resemblance to a known mark.
- A paragraph needed to explain the idea; a font licence that does not allow logo use.

## Examples

A fictional tea brand wants a symbol for tins and a favicon. Research shows the category leans on leaves and steam, so both are killed. Three ideas (a seal built from the initial, a pouring arc, a modular pattern tile) explored as 30 vector thumbnails; at 32 px in one colour the pattern tile collapses and is dropped. Two directions go to the owner with grid overlays and a 16 px test.
