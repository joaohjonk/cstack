---
name: competitor-intel
description: "Build a living, dated competitor and category corpus from public sources (sites, PDPs, ad libraries, social, packaging, retail listings, store stacks, marketplaces) and map conventions, white space, saturated claims, rising patterns and creative fatigue, separating observation from inference. Use when entering a category, before positioning or campaign work, or to refresh what competitors are doing. Not for cultural signals (use cultural-scan) or reference curation for taste (use taste-search)."
license: MIT
---

# /competitor-intel

The goal is not to copy competitors; it is to see the category's conventions clearly enough to choose which to use, invert or ignore. [Shared preamble](../cstack-shared/PREAMBLE.md) applies.

## When to use

- New category or market entry; positioning or packaging work.
- Before a paid-social round: what hooks and formats are saturated.
- Quarterly refresh of the competitor corpus.

## When not to use

- Culture and behaviors: `cultural-scan`.
- Aesthetic references from any field: `taste-search`.
- Interpreting the brand's own ad results: `workflow paid-social`.

## Inputs

- Competitor list (owner-supplied or proposed and confirmed), category, markets.
- `cstack tools`: Particl, BuiltWith/Store Leads, Helium 10/SmartScout/Nexscope (marketplaces), Foreplay (ads), Shortimize (organic social), Ecomm.Design (browser only), Baymard (human-only: its terms bar automated extraction). Facts per tool, plan gating and fallbacks: `registry/research-tools.json`, `docs/research/research-tools.md`.
- Prior `state/competitors.jsonl` observations.

## Missing-input behavior

- No paid intelligence tools: the competitor's own site and PDPs via `site-capture` with screenshots. Ad libraries, social profiles and marketplace listings (Meta, TikTok, Instagram, X, Amazon) by human browsing or the platform's approved API only, because their terms bar automated collection; the owner pastes links and screenshots. Mark sales/performance estimates UNKNOWN rather than guessing.
- Authenticated or private material (paid newsletters, logged-in dashboards, emails) only if the owner provides it or grants permission.

## Source precedence

Primary observation (URL + timestamp + screenshot) > tool data (labelled with the tool and its estimate method) > press > inference. Inference is labelled and never mixed into observation fields.

## Tools / providers

`site-capture` (screenshots, PDP capture, computed styles), marketplace and store-stack tools when present, ad libraries. Respect site terms and rate limits; never bypass logins or paywalls.

## Process

1. **Scope**: 5-12 competitors, markets, channels, date window.
2. **Capture** per competitor and channel: URL, timestamp, screenshot path, and normalized fields (`competitor-observation` schema): positioning, offer, claim, proof, hooks, creative format, visual grammar, casting, product role, CTA, channel, engagement or performance proxy (with source), date.
3. **Separate** observation (what is on the page) from inference (why it might work); inference gets confidence.
4. **Map the category**: conventions (what everyone does), white space, overused patterns, rising patterns, claims saturation, creative fatigue, cultural opportunities.
5. **Implications** for the brand: conventions to keep (category legibility), to invert, to ignore; claims that are crowded; proof that is missing everywhere.

## Decision rules

- No causal claims from engagement counts.
- A pattern is "rising" only with at least two dated observations showing growth.
- Screenshots and copied text are evidence for analysis, never assets for production (reference overcopy).

## Outputs, files written, state updated

- `state/competitors.jsonl` (append observations), `references/competitors/<id>.reference.yaml` for notable pieces (library `competitor`).
- `work/competitors/<date>-category-map.md` with the convention map and implications; screenshots in `work/competitors/<date>/`.

## Evals required

- T0: observations validate (URL + date).
- Fixture: `competitor-observation-vs-inference.yaml`.

## Handoff

`brief` (reframe with the map), `creative-direction` (what to invert), `claims-proof` (crowded or risky claims), `copywriting`.

## Failure modes

- Copying the category leader's look ("well-informed cliché").
- Stale corpus presented as current; always show dates.
- Scraping beyond terms of service.

## Examples

Map row: "Convention: every PDP leads with a lifestyle hero and a 3-icon benefit row (9/10 observed, 2026-09-28..30). White space: nobody shows the product's actual preparation steps. Saturated claim: 'clean energy' (7/10)."
