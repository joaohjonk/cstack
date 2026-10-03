---
name: type-director
description: "Choose, pair and systematize typography and review it with measurements: typefaces chosen for the job (sizes, languages, voice, licence, performance), paired by role and structure, built into a system (roles, scale, fluid sizes, leading and tracking by size, measure, figures, fallbacks) as tokens and checkable rules, then audited on real pages. Use when type must be chosen, paired, rebuilt or reviewed. Not for marks (use symbol-design) or the whole visual system (use identity-system)."
license: MIT
metadata:
  cstack-version: "0.1.0"
  cstack-meta: "skill.meta.json"
---

# /type-director

Typography is the voice of the brand made visible and the structure that makes reading effortless. It is judged by how type works at real sizes, in real copy, in every language the brand speaks, never by the font name alone. [Shared preamble](../cstack-shared/PREAMBLE.md) applies. The [primer](references/primer.md) holds the principles with sources; load the section you need.

## When to use

- A new brand needs typefaces chosen and paired, or an existing pairing feels wrong.
- A type system is missing, inconsistent (fourteen sizes, three greys of body text) or breaks on mobile.
- Before a landing page, deck or packaging system is built; and as the TYPE DIRECTOR lens in reviews.

## When not to use

- Drawing a wordmark or symbol: owner or designer work, never self-approved.
- Colour, grid, spacing and components beyond type: `identity-system` (it consumes this skill's tokens).
- Type inside a generated image: set it in layout or composite it; never let an image model draw brand type.

## Inputs

- Brief and brand context: `cstack brand context --sections voice,brand_beliefs,typography,type_hierarchy,grid,positioning,compliance_constraints`.
- Surfaces and reading situations (long copy, UI, packaging fine print, signage distance, video captions), languages and scripts, licence budget, existing fonts and their equity.
- Font files or foundry links when available; `cstack type font <file> --languages <codes>`.

## Missing-input behavior

- No languages stated: ask; until answered, test the brand's market language plus one long-word language (German) and one accented one (Portuguese or Vietnamese).
- No licence information: candidates stay `provisional`, and the gap "font licence per use (web, app, print/packaging, video, logo)" is recorded. Nothing unlicensed becomes `current`.

## Source precedence

Owner decisions and licensed official fonts > the approved brand system > in-use evidence (live sites, packaging, Fonts In Use) > foundry specimens and documentation > model suggestion. Primer defaults (measure, leading, contrast) are defaults; a stated reason can override them.

## Tools / providers

`cstack type scale` (modular and fluid scales, DTCG fragment), `cstack type qa <url>` (measure, leading, tracking, widows, families, sizes, contrast, fallbacks at breakpoints), `cstack type font` (coverage, features, axes, licence flags), `cstack tokens check|build`, `browse shot` for specimens, Figma MCP styles and variables when present, Fonts In Use and Typewolf for in-use evidence (browser), foundry specimens and trials (trials are for testing only).

## Process

Method first: `cstack flows search "type system"` (preamble 0.5).

1. **Job spec.** For each surface: reading distance, size range, text length, medium and rendering, languages, the voice the brand system asks for, licence and performance limits. Write it before looking at a single font.
2. **Longlist 6–10** from category conventions (use, invert or ignore) plus far references; describe each by structure (x-height, apertures, contrast and stress, width, terminals, spacing, family depth, optical sizes, figures), not adjectives. Check coverage with `cstack type font`.
3. **Roles before pairs.** Decide which roles need a different voice (display, text, UI, data, legal). Pair by role: one superfamily with range, or a voice face plus a workhorse with shared proportions and one or two clear contrasts. Reject near-misses.
4. **Specimens with real copy at real sizes** on each surface (HTML page with `brand/generated/tokens.css`, packaging fine print at print size, a 9:16 caption frame), in every language; `browse shot` them; owner picks pairwise (`cstack feedback`).
5. **System.** Roles table (family, weight, size step, line height, tracking, case, figures, max measure, max lines, spacing); scale from `cstack type scale` adjusted by eye at the extremes; leading falls and tracking tightens as size rises; measure sets column widths; figures and details per role; fallback stack with metric overrides; loading policy.
6. **Encode** at the lowest reliable level: DTCG type tokens; type rules in `brand/rules/brand-rules.yaml` with `check: deterministic` where `cstack type qa` measures them; `typography` and `type_hierarchy` via `cstack brand set` (`provisional` until the owner approves).
7. **Verify** the specimen and a real page: `cstack type qa` at 375/768/1440, then the review rubric in the primer (section 9). Fix, re-run, then the owner.

## Decision rules

- Job before voice, voice before fashion. A face that fails at its real size fails, however right it feels.
- The number of families follows the roles. Each family needs a distinct job; two faces that differ slightly look like a mistake.
- Contrast on one or two axes at a time (size, weight, structure, case, colour, space). Hierarchy needs few, clear steps.
- Defaults (45–75 characters, body leading about 1.4–1.6, WCAG contrast) hold unless a rule records why not.
- Real copy, real sizes, real languages. Lorem ipsum hides rhythm, coverage and line-break problems.
- No synthesized bold, italic or small caps; no letter-spaced lowercase body; no long all-caps passages.
- A licence for each use, checked against the foundry EULA; `fsType` is a technical flag, not a licence. Record the licence state with the choice: model (perpetual, subscription, open), whether the fonts stop working when a subscription ends, what the EULA says about modifying or subsetting, any AI or data-mining clause, and trial status. Trial files never ship.
- Recommend a bespoke typeface only when equity, scale and budget justify it; otherwise a strong retail family and a rigorous system.

## Outputs, files written, state updated

- `work/type/<date>-<slug>/`: job spec, longlist and pair tests, specimens and screenshots, `type qa` reports, decision log.
- `brand/tokens/type.tokens.json`, type rules in `brand/rules/brand-rules.yaml`, brand-system `typography` and `type_hierarchy` (via `cstack brand set`), feedback events for owner picks.

## Evals required

- T0: `cstack tokens check`; T1: `cstack type qa` on the specimen has no fails; `cstack type font --languages` covers every brand language.
- Fixtures: `type-pairing-near-miss.yaml`, `type-system-measurable.yaml`, `type-review-beyond-font-choice.yaml`.

## Handoff

`identity-system` (tokens into components), `brand-verify`, `creative-review` (TYPE DIRECTOR lens with the primer rubric), `copywriting` (lengths per role), `workflow landing-page|deck|packaging`, `learn`.

## Failure modes

- Choosing by mood words ("clean, modern, premium") instead of a job spec; the category average follows.
- A beautiful specimen that breaks on real copy: long words, diacritics, prices, legal lines, narrow screens.
- Size soup: many near-identical sizes and weights, hierarchy by accident.
- Trend monoculture: the season's grotesk because the category uses it.
- Ignoring licence scope (pageviews, apps, packaging, broadcast) until launch.

## Examples

Fictional ceramics studio: job spec covers long product stories, 7 pt care cards, kiln labels and captions; languages en, pt, de. Longlist of eight described by structure. Pair: a text serif with optical sizes as the voice for display and stories, a humanist sans with tabular figures for UI, prices and care cards; rejected: two geometric sans (near-miss). Scale 1.2 at 360 px rising to 1.333 at 1440 px, body 17–19 px, measure 60–68 characters. `cstack type qa` on the specimen flags one all-caps label without tracking; fixed and re-run clean.
