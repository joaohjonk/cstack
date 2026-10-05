---
name: brand-import
description: "Ingest an existing brand (official assets, website, docs, repos, design files, a design-system extraction) into structured, sourced brand state: brand-system.json, brand-world entities, DTCG tokens, and seed gold/anti libraries. Use when a brand already exists and cstack needs its truth, when assets conflict, or when brand state is stale. Not for inventing a new brand (use workflow create-brand) or for judging a single artifact (use brand-verify)."
license: MIT
---

# /brand-import

Turns a brand that lives in PDFs, folders, sites and heads into machine-readable, sourced state. Every field gets value, sources, confidence and approval. [Shared preamble](../cstack-shared/PREAMBLE.md) applies.

## When to use

- First contact with an existing brand.
- Assets disagree (two logos, three greens) and someone must surface the conflicts.
- Brand state is older than the live brand (a new site, packaging or guideline shipped).

## When not to use

- No brand exists yet: `workflow create-brand`.
- Checking one artifact against the brand: `brand-verify`.
- Recording one owner decision: `cstack brand set` directly.

## Inputs

- Owner-supplied sources: `assets/official/` (logos, packaging masters, guidelines), docs, repo paths, Figma files, URLs.
- Optional providers: Taste Labs extract (`cstack taste extract <url>`), Figma MCP (variables, styles, components), Shopify MCP (catalog truth), the `site-capture` skill for live pages.

## Missing-input behavior

- No official assets: import from live behavior and mark everything `live_brand_behavior` or `extracted_pattern` with `approval: inferred`; list the missing official sources in `provenance.gaps` with `status: needs_owner`.
- An unreachable source (login wall, dead link) is recorded as `status: unreachable`, never guessed.
- Ask the owner only about **consequential** conflicts (logo, primary color, name, claims, product facts). Everything else becomes a conflict entry with a default.

## Source precedence

The preamble ladder (§2); extracted patterns are Taste, CSS and screenshots. An extraction never overrides an official asset; a vision model's reading of a hex value is never accepted as proof (measure it from the file or CSS).

## Tools / providers

- Deterministic first: read files, parse CSS/SVG/JSON, `cstack audit` image sizes, measure colors from vector/CSS sources, hash assets.
- `cstack taste extract <url>` (paid credits, ledgered): raw design system saved to `references/_taste/`; normalized here, never written straight into brand state.
- Figma MCP if present: `get_variable_defs`, `search_design_system` for tokens and components.
- `site-capture` for computed styles and screenshots of live pages.

## Process

1. **Inventory** every source with path/URL, kind and hash into `provenance.ingested`. Note dates; prefer the newest official source.
2. **Extract candidates per section** (F34: positioning, audience and product claims found by research, not in the owner's own sources, enter as `approval: inferred` and stay candidates until the owner confirms them) (business truth, audience, positioning, voice, vocabulary, banned language, logo marks, color, typography, grid, spacing, photography, product representation, packaging rules, claims, proof, compliance ...). Each candidate is a Field with `sources[{kind, ref, quote?}]`.
3. **Normalize tokens**: colors, type, spacing, radii, motion into `brand/tokens/*.tokens.json` (DTCG) only for values from official or approved sources; inferred tokens stay in brand-system with `approval: inferred`.
4. **Merge through precedence**: `cstack brand set <section.field> --file f.json` for each field. Equal-rank disagreements become conflicts with both sources.
5. **Entities**: products, packaging, recurring cast, locations, surfaces, light setups into `brand/brand-world.json` with immutable traits, allowed variation, forbidden drift and canonical files.
6. **Seed libraries**: 6-12 gold references (own best work) and 6-12 anti references (seductive but wrong), each with Source → Mechanism → Transfer or why it fails.
7. **Confirm the consequential few** with the owner in one message: a table of conflicts and inferred high-impact fields, each with a recommended default.
8. **Verify on known artifacts**: run `brand-verify` on 2-3 existing approved artifacts; a correct import should pass them. Failures reveal wrong rules.
9. **Map tasks to files**: add this brand's own files to `brand/context-map.yaml` (the dieline under packaging, the photo brief under photography). Originals stay in `assets/official/`; summaries and extractions go under `work/`, never beside them.
10. `cstack tokens check`, `cstack brand check`, `cstack brand guide` (the generated page the owner reviews).

## Decision rules

- Never average two conflicting values. Never choose silently. Default = higher-precedence or newer official source, marked `conflict` until the owner resolves it.
- A rule is promoted to `current` only with an official source or owner confirmation; patterns seen on the live site stay `inferred`.
- Claims and proof are imported verbatim with their source; their legal status is `claims-proof`'s job.
- Brand-specific canon (photographers, foundries the brand admires) goes into the workspace, never into cstack.

## Outputs, files written, state updated

- `brand/brand-system.json` (validated), `brand/brand-world.json`, `brand/tokens/*.tokens.json`, `brand/generated/tokens.css`.
- `references/gold/*.reference.yaml`, `references/anti/*.reference.yaml`.
- `briefs/import-report-<date>.md`: sources, coverage per section, conflicts, unknowns, % inferred, verification results.
- State: brand-system conflicts; `state/learnings.jsonl` for surprises (e.g. "site uses a different green than guidelines").

## Evals required

- T0: `cstack brand check` passes; `cstack tokens check` passes.
- T2 fixtures: `existing-brand-clear-assets.yaml` (reuse truth, few questions), `existing-brand-conflicting-assets.yaml` (surface, do not choose), `repeated-brand-context.yaml` (no re-ingestion for later tasks).

## Handoff

`brand-verify` (step 8), `taste-search` (extend libraries), `identity-system` (gaps in tokens/type/grid), `brief` (first task on the brand).

## Failure modes

- Treating a Taste or CSS extraction as truth.
- Asking the owner 40 questions; ask about consequential conflicts only.
- Importing campaign-specific looks as core rules (set `permanence: campaign` and `expires`).
- Leaving brand-world empty, so later image work cannot lock products.

## Examples

Two logo files differ (wordmark spacing). Output: conflict `logo_marks.primary` with both file hashes, default = the file in the newest guideline, question to owner: "Which wordmark is current? Default: guideline v3 (2026-05)."
