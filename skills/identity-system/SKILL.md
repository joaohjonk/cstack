---
name: identity-system
description: "Turn a chosen identity direction into an executable system: DTCG tokens (color, type, spacing, radius, motion), type hierarchy, grid and composition rules, logo usage rules and component contracts, encoding each decision at the lowest reliable level. Use when a brand needs its system built or repaired after a direction is selected, or when tokens, type or grid are missing. Not for exploring directions (use creative-direction) or importing an existing system (use brand-import)."
license: MIT
metadata:
  cstack-version: "0.1.0"
  cstack-meta: "skill.meta.json"
---

# /identity-system

"Don't merely design the artifacts; design the machine capable of making the artifacts." This skill writes the machine. [Shared preamble](../cstack-shared/PREAMBLE.md) applies.

## When to use

- After `creative-direction` and an owner selection, to systemize the chosen identity territory.
- An imported brand has gaps: no type scale, no grid, no motion tokens, a palette without roles.
- Agents keep improvising spacing, color or hierarchy: the system is under-specified.

## When not to use

- Choosing between directions: `creative-direction`.
- Reading an existing system into state: `brand-import`.
- Drawing a logo: `symbol-design` explores and directs marks, `vector-master` makes the master files. This skill encodes usage rules for an approved mark and never self-approves one.

## Inputs

- Selected direction (territory doc) and owner decision.
- `cstack brand context --sections color,typography,type_hierarchy,grid,spacing,layout,motion,logo_marks,components`.
- Licensed font files or foundry info; official mark files in `assets/official/`.

## Missing-input behavior

- No font license info: record the typeface as `approval: provisional` and add a gap "font license"; do not ship tokens that point to an unlicensed font as `current`.
- No approved mark: write usage rules as `provisional` and stop before any generated logo work; route mark work to `symbol-design` (human design and owner approval).

## Source precedence

Owner decisions and official assets win. A selected territory is `campaign_direction`-level until the owner approves the system; values then move to `approved_brand_state`.

## Tools / providers

Deterministic only: `cstack tokens check|build|lint`, contrast math (WCAG), type-scale arithmetic, SVG inspection. Figma MCP (`use_figma`) may project tokens into Variables when the owner asks; Figma is a view, the git files are the source.

## Process

1. **Atomic layer (tokens)**: primitives (raw palette, font families, spacing scale, radii, durations, easings) then semantic aliases (text, surface, accent, danger, focus, motion.enter ...). Every semantic token references a primitive.
2. **Contrast and accessibility**: compute contrast for every text/surface pair the system allows; pairs under 4.5:1 (body) or 3:1 (large) are disallowed in rules.
3. **Type**: choosing, pairing and the type system come from `type-director` (roles, scale, leading and tracking by size, measure, figures); this skill wires its tokens into components.
4. **Grid and composition rules** in `brand/rules/brand-rules.yaml`: columns per breakpoint, gutters, legal spans, alignment, hierarchy conditions (e.g. headline dominates image unless the image is the narrative object), density limits, imagery aspect ratios, clear space. Each rule declares `check: deterministic` (with the command) or `check: judge`.
5. **Logo usage**: clear space, minimum sizes, allowed backgrounds, forbidden treatments; generation rule "never approximate the mark; composite the official file".
6. **Motion as a token**: durations, easings, entrance/exit choreography, reduced-motion behavior.
7. **Component contracts** (brand-system `components`): proportions, image ratios, variants, which tokens each consumes.
8. `cstack tokens build`; render a one-page specimen (HTML using `brand/generated/tokens.css`) and `browse` screenshot it for review.

## Decision rules

- Encode at the lowest reliable level: token > component contract > composition rule > agent rule > exemplar. Never write "use generous whitespace" if a spacing threshold can say it.
- A rule naming a checker nobody wrote is marked `check: judge` until the checker exists.
- Few families, few accents: state the maximum accent families per screen.
- Values extracted from inspiration references never enter tokens; only decided values do.

## Outputs, files written, state updated

- `brand/tokens/*.tokens.json`, `brand/generated/tokens.css`, `brand/rules/brand-rules.yaml`.
- `brand/brand-system.json` sections: color, typography, type_hierarchy, grid, spacing, layout, motion, logo_marks, components (via `cstack brand set`).
- `work/system/specimen.html` + screenshot; lineage record for the specimen.

## Evals required

- T0: `cstack tokens check`, `cstack brand check`.
- T1: contrast table computed; specimen raw-value lint `cstack tokens lint work/system/specimen.html` passes.
- Review: `creative-review` with TYPE DIRECTOR and EDITOR lenses on the specimen.

## Handoff

`brand-verify` (system on real artifacts), `copywriting` (voice applied in the type roles), `workflow landing-page|deck|packaging`.

## Failure modes

- Tokens copied from an inspiration site (reference overcopy).
- Beautiful specimen, unusable system: no semantic layer, no responsive rules.
- Self-approving a mark or approximating it with an image model.

## Examples

"Ink on paper" territory selected → primitives `color.ink #121212`, `color.paper #F4F1EA`, one accent; semantic `text = {color.ink}`; type scale 1.25 with display max 3 lines; rule R-LAYOUT-02 "body never centered" (`check: judge`); rule R-IMG-01 aspect ratios (`check: deterministic`, `cstack audit`).
