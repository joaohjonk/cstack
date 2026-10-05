---
name: asset-factory
description: "Turn approved bets and winner families into the cheapest production plan that tests them (reuse, edit, derive, shoot, generate), with a bet, experiment id and cell on every asset and exports per channel, then run the existing skills in order. Use after bets are approved, before anything is made. Not for deciding what to make (creative-strategist) or art direction (creative-direction)."
license: MIT
---

# /asset-factory

A creative producer, not a filmmaker: given the next bets, what is the cheapest high-quality way to make enough to test them, and who makes each piece. [Shared preamble](../cstack-shared/PREAMBLE.md) applies.

## When to use

- Bets or families are approved and need assets.
- A test round must fit a budget or a shoot day.

## When not to use

- Choosing bets or variants: `creative-strategist`, `winner-scaler`.
- Art direction of the pieces: `creative-direction`, `video-direction`.

## Inputs

- Approved `*.creative-bet.yaml` and `*.creative-family.yaml` files.
- What exists: `assets/` (owner originals and approved derivatives), approved masters in `work/`, the asset registry.
- Budget: `cstack.config.yaml` spend envelope and the owner's shoot days.

## Missing-input behavior

- No approved bet: stop; production does not start from a proposed bet.
- No master for a derived cut: plan the master first; never generate cut-downs separately.
- No budget set: plan reuse, edit and derive only, and price the rest with `cstack spend plan`.

## Source precedence

Owner originals and approved masters > derived edits > new shoots > generation. Third-party captures and competitor references never enter an asset (`cstack creative check` refuses them).

## Tools / providers

`cstack creative check <plan>`, `cstack spend plan`, then the existing skills: `copywriting`, `creative-direction`, `image-edit`, `generate-media`, `video-direction`, `video-assembly`, `product-fidelity`, `brand-verify`.

## Process

1. **List cells**: for each bet, the experiment cells (`cstack creative check <bet>` prints the count); for each family, its variants.
2. **Route every asset**: reuse (an existing asset as is), edit (an existing asset changed), derive (cut-downs, crops and hook cuts from one master), shoot (only what needs a person or a real product moment), generate (backgrounds, composites, stills where product fidelity can be verified).
3. **Maximise surface area per master**: many hooks and first frames cut from few masters; derived pieces keep the product identical across cells.
4. **Write the plan** (`*.production-plan.yaml`): assets with bet, experiment id, kind, route, sources, cell, skill; exports per channel with aspects; organic-safe versions where the bet serves organic travel.
5. **Gate**: `cstack creative check <plan>` must PASS; price paid steps with `cstack spend plan` and get the owner's go above the envelope.
6. **Run** in order: `copywriting` → `creative-direction` → `image-edit` / `generate-media` / `video-direction` → `video-assembly` → `product-fidelity` → `brand-verify`. Export names carry the experiment id.

## Decision rules

- No approved pack spec, no pack render: ask for the dieline or print file first (F86).
- One bet, one experiment id; every asset names its cell.
- Cut-downs are derived from a master, never regenerated.
- Nothing ships that `product-fidelity` or `brand-verify` failed.
- A creator brief is the concept plus three product truths, not a script; a rigid brief only for paid amplification of a post that already proved itself. Credibility partners get long-term briefs, acquisition creators get per-test briefs.
- Mailers and packaging inserts are designed to be posted.
- Organic-safe versions drop paid-only overlays (offer stickers, platform CTAs) and keep the brand codes.

## Outputs, files written, state updated

- `work/ads/<period>.production-plan.yaml`; assets under `work/out/` and exports under `work/exports/` named with experiment ids; lineage records for each asset.

## Evals required

- T0: `cstack creative check` passes on the plan.
- Fixtures: `competitor-ad-as-production-input.yaml`, `cutdown-safe-zones.yaml`.

## Handoff

`copywriting`, `creative-direction`, `image-edit`, `generate-media`, `video-direction`, `video-assembly`, `product-fidelity`, `brand-verify`.

## Failure modes

- Planning a video per idea instead of hooks per master.
- Assets with no experiment id, so results cannot be read.
- A competitor's ad used as the starting image.

## Examples

Week 41: two shot masters (the potter in brand light and in platform-default light) for the visual-world test, two 4:5 cut-downs derived from them, a reused packshot set for two stills, one generated still from the same product photos, copy for the family; exports for Meta 9:16 and 4:5 plus an organic 9:16. [Example plan](../../examples/tessel-kiln/work/ads/2026-10-week-41.production-plan.yaml).
