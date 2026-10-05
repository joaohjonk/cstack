---
name: taste-search
description: "Find and curate references as a graph, not a moodboard: search the user's available research tools (Taste Labs, Cosmos, Refero, Mobbin, Ecomm.Design, Foreplay, Really Good Emails and others) plus local gold/canon libraries, mix near, middle and far references, and store each with Source, Mechanism, Transfer, rights and do-not-copy notes. Use when visual or verbal direction is underdefined, before generating anything new, or to extend gold and anti libraries. Not for decomposing one photograph in depth (use shot-dna) or tracking competitors over time (use competitor-intel)."
license: MIT
---

# /taste-search

Retrieval before invention. Taste is the objective function, associative distance the search radius. This skill widens the radius and keeps only what carries a mechanism. [Shared preamble](../cstack-shared/PREAMBLE.md) applies.

## When to use

- A brief exists but the look, behavior or voice is not decided.
- Before any generation where references would change the answer.
- Building or refreshing `references/gold` and `references/anti`.

## When not to use

- One reference needs full photographic decomposition: `shot-dna`.
- Ongoing competitor corpus: `competitor-intel`.
- Cultural signals (scenes, memes, behaviors): `cultural-scan`.

## Inputs

- Brief (`briefs/*.creative-brief.yaml`) or a one-line intent in the owner's words.
- `cstack brand context --sections positioning,photography,typography,anti_references,reference_mechanisms`.
- Existing libraries: `references/`, the cstack `canon/` and the brand's own canon.
- `cstack tools` output: which research tools/MCPs are available.

## Missing-input behavior

- No research tools available: search local gold/canon, then `site-capture` public pages within their terms, and say which mode ran ("local + public web; no Taste/Cosmos access").
- No brief: write a one-line intent with the owner and proceed; do not invent a brand direction.

## Source precedence

Own approved work (gold) > owner-supplied references > tool results > model suggestions. Search rank order is the only signal from Taste Labs (no scores); never re-rank it as if it were a score.

## Tools / providers

Route by job (detect first with `cstack tools`; never assume access):

| Need | First choice | Fallback |
|---|---|---|
| brand/site design systems, similar brands | `cstack taste search "<intent in the owner's words>"` | `site-capture` + manual curation |
| photography, campaigns, fashion, objects, visual worlds | Cosmos **via owner exports only** (no API; its terms bar automated agents, and a connected Cosmos MCP is unofficial, so `cstack tools` shows it as NO) | Are.na API, Taste Labs, public archives via `site-capture` |
| UX screens, flows, interaction patterns | Refero MCP, Mobbin MCP | `site-capture` public sites |
| DTC stores, PDPs, PLPs | Ecomm.Design (browser only); Baymard is human-only (terms bar automation; Premium notes stay private) | `site-capture` the stores themselves |
| paid social creative | Foreplay MCP | Meta Ad Library API (EU-reach commercial ads only), public Ad Library pages |
| email | Really Good Emails (browser only) | owner inbox exports |
| own design truth | Figma MCP | `assets/official/` |

## Process

1. **State the search intent** in the owner's words plus the mechanism wanted ("ritual pacing", "hierarchy under density"), not adjectives.
2. **Plan the distance mix** before searching: near (the category, 20-30%), middle (adjacent: fashion, sport, hospitality, publishing, furniture, beauty), far (architecture, art, industrial systems, transport, institutional graphics, ritual, interfaces, vernacular culture). Aim for at least 2 far references.
3. **Search** each available tool; save raw results (`references/_taste/`, tool exports) with retrieval date.
4. **Lock the evidence**: for Taste search, ranks 1-2 are the strongest evidence; keep discovery-badged results labelled as discovery.
5. **Curate 6-12**: for each kept reference write a `reference` record: `source_domain`, `distance`, `transferable_mechanism`, `mechanism_tags`, `transfer` (how it lands in this brand), `incidental_content`, `do_not_copy`, rights, credit. Apply the removal test: delete the image; if the mechanism still explains itself, keep it.
6. **Anti set**: 3-6 seductive-but-wrong references with `anti_category` and `why_it_fails`.
7. **Packet**: a one-page reference packet (contact sheet + mechanism table) for the owner; ask for picks and kills (taste is selection).
8. Record picks/kills as feedback (`cstack feedback`, type gold/anti/pairwise).

## Decision rules

- Reject references with no articulable mechanism (moodboard mimicry).
- An image found in research that seems to show the brand's own product is recorded with `approval: inferred`, never as product truth, until the owner confirms it (F71).
- Ten references from one category = reference monoculture: widen before presenting.
- Rights `unknown` references are inspiration only and never used as image inputs.

## Outputs, files written, state updated

- `references/{gold,anti,inspiration}/<id>.reference.yaml` (+ local copies with sha256 when rights allow; otherwise `storage: link_only` with the `uri` and no copy).
- `work/references/<date>-<slug>-packet.md` (+ contact sheet image).
- State: `state/feedback.jsonl` (picks/kills), `state/cost-ledger.jsonl` (each CLI call that reaches the budget gate, failures and blocks included; a MISSING key writes no row, and calls made through the MCP server are not in the ledger).

## Evals required

- T0: every reference validates; anti references have `why_it_fails`.
- Reviewer check (no automated test yet): the packet mixes at least one near and one far reference; no names in downstream recipes.
- Fixture: `no-brand-vague-aesthetic.yaml` (search before visual invention).

## Handoff

`shot-dna` (decompose the picks), `creative-direction` (territories), `prompt-director` (reference roles), `brand-import` (library seeding).

## Failure modes

- Adjective queries ("premium minimal") that return the category average.
- Copying a reference's literal elements; fill `do_not_copy`.
- Treating a tool's ranking as taste; the owner's picks are taste.

## Examples

Intent: "a morning product ritual that feels choreographed, not a feature list". Mix: 3 near (category rituals), 3 middle (hospitality service sequences, a fashion show running order), 2 far (tea ceremony preparation: sequenced ritual + meaningful preparation; a newspaper front page: hierarchy under density). Transfer: "the pour is step 3 of 5, shot as a sequence; the label appears only in the last frame."
