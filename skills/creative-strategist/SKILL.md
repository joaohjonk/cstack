---
name: creative-strategist
description: "Decide which creative bets to make next and why: read brand, customer, market and performance together and write a few bets, each with a strategic tension, audience, angle, hook family, formats, proof, brand constraint, objectives and one controlled experiment. Use when planning the next round of ads or social content, or when results are in and someone asks what to make next. Not for reading results (creative-intelligence) or making assets (asset-factory)."
license: MIT
---

# /creative-strategist

The head of creative strategy who also knows the brand. Output is a few bets with reasons, never "20 ad ideas". Governing rule: **performance data tells cstack what deserves another question, not what the brand should become.** [Shared preamble](../cstack-shared/PREAMBLE.md) applies.

## When to use

- Planning the next creative round (paid or organic).
- After `creative-intelligence` reports: turn observations into bets.
- A winner exists and the question is where to take it (then hand the expansion to `winner-scaler`).

## When not to use

- Reading or tagging results: `creative-intelligence`.
- Writing the hooks and first frames of a chosen bet: `hook-format-lab`.
- Planning production: `asset-factory`.

## Inputs

Four blocks; name what is missing rather than inventing it.

- **Brand**: `cstack brand context --task creative` (truth, positioning, voice, visual codes, anti-codes, claims and proof, cultural permissions).
- **Customer**: persona or job to be done, pain and desire, awareness stage, objections, their own words (reviews, support, interviews).
- **Market**: `competitor-intel` (ads lens) for conventions, saturation, long-running concepts and white space; `cultural-scan` for what is happening in culture.
- **Performance**: `state/insights.jsonl` and `cstack creative report` (spend, CPA or CAC, CTR, CVR, hook and hold rate, fatigue, tags, landing-page match).

## Missing-input behavior

- No performance data: bets start from brand, customer and market; every bet's evidence is `hypothesis`, and the first experiment is chosen to create the data.
- No customer language: say so, propose where to get it (reviews, support inbox, five calls), and write the tension as a hypothesis.
- No claims source: proof stays empty and `claims-proof` runs before any asset.

## Source precedence

Owner decisions and approved brand fields > reproduced learnings and rules > the brand's own observations > market observations > model opinion. A competitor's success is a market observation, never evidence for this brand.

## Tools / providers

`cstack brand context --task creative`, `cstack creative report`, `cstack creative check <bet>`, `state/insights.jsonl`, `registry/creative-taxonomy.json` (the shared vocabulary; one family per term).

## Process

1. **Read the four blocks** and write, in one paragraph each, what is true, what is assumed and what is unknown.
2. **Find tensions**: the customer's conflict in their own words ("I want X, but not Y"). A bet without a tension is a format in search of a reason.
3. **Choose the objective per bet**: paid performance (stop → understand → click → buy), organic travel (watch → finish → share → remix → remember; name the travel reasons), brand equity (recognise → associate → desire → remember). They are different functions; a bet names the ones it serves.
4. **Write 2-5 bets** (`*.creative-bet.yaml`, `creative-bet` schema): title, tension, audience with awareness stage, concept (angle, hook tactic, mechanic, format at minimum), hook family, formats, proof (claim ids), brand constraint, objectives, evidence with its ladder rung, experiment.
5. **Design the experiment**: hold the angle and the offer; vary one family, or two as a factorial with levels; set the success metric, threshold, minimum spend per cell and a kill rule.
6. **Gate**: `cstack creative check <bet>` must PASS. Read its cell count and minimum spend; if the budget cannot reach it, cut cells, not the minimum.
7. **Rank** by expected learning per unit of spend and by brand fit, and say which bet you would drop first.

## Decision rules

- Every claim in a bet carries its rung: observation, hypothesis, test, learning, rule. Only `learning-loop` writes rules (`cstack learn promote`).
- When the evidence points to a look the brand does not own (platform default, a competitor's grammar), keep the message and move it into the brand's own codes; test that move rather than abandoning the brand.
- Never vary the offer in the same experiment as creative.
- Concepts use the taxonomy families; a format is never a hook, a mechanic is never an angle.
- No practitioner or competitor name in anything that becomes a prompt.

## Outputs, files written, state updated

- `work/ads/<date>-<slug>.creative-bet.yaml` per bet, `work/ads/<date>-strategy.md` (the four-block read, tensions, ranking).
- No state change until the owner approves a bet (status `approved`).

## Evals required

- T0: bets validate and pass `cstack creative check`.
- Fixtures: `creative-bets-not-idea-lists.yaml`, `creative-correlation-as-rule.yaml`, `creative-organic-vs-paid.yaml`.

## Handoff

`hook-format-lab` (attention design for an approved bet), `winner-scaler` (expanding a proven ad), `asset-factory` (production), `claims-proof` (proof), `learn-loop` (after results).

## Failure modes

- A list of ideas with no tension, no experiment and no kill rule.
- Reading one observational win as the strategy ("make everything creator videos").
- Optimising only paid performance while the brand's distinctiveness drains.
- Varying three things at once and learning nothing.

## Examples

Report: creator-to-camera leads on CPA, but always with the same person and in platform-default light, and holds 66% of spend. Bet: "The potter, in our own light". Tension: "I want plates I will use every day, not ones I am afraid to chip." Hold angle, talent, format and offer; vary visual world (brand codes vs platform default); success: brand cell CPA within 1.15x after 400 per cell. Full file: [example bet](../../examples/tessel-kiln/work/ads/2026-10-potter-in-our-light.creative-bet.yaml).
