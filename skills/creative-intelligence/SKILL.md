---
name: creative-intelligence
description: "Read why the brand's own ads work or fail: import results from any export, tag ads by taxonomy family, and report correlations above minimum data with confounds, spend concentration, fatigue and a brand-distinctiveness read, as observations and hypotheses only. Use when results come in or someone claims 'this type of ad works'. Not for competitors' ads (competitor-intel) or choosing bets (creative-strategist)."
license: MIT
---

# /creative-intelligence

Reads the brand's own results the way a creative analyst would, with one advantage no ads tool has: brand state. It never says "X drives Y"; it says what correlates, what is confounded, what is concentrated, and what to test. [Shared preamble](../cstack-shared/PREAMBLE.md) applies.

## When to use

- New results (weekly or per test window).
- Before `creative-strategist` plans a round.
- Someone claims a pattern ("UGC works", "statics are dead"): check it against the data and the ladder.

## When not to use

- Other brands' ads: `competitor-intel` (ads lens).
- Choosing bets: `creative-strategist`.
- Judging craft or brand fit of one piece: `creative-review`, `brand-verify`.

## Inputs

- An export per channel (ads manager, a creative-analytics tool, a spreadsheet) or records already in `state/performance.jsonl`.
- `registry/creative-taxonomy.json` for tags; the brand's `visual codes` and anti-codes via `cstack brand context --task creative`.
- Bets and experiment ids (`*.creative-bet.yaml`) so results join to the test that produced them.

## Missing-input behavior

- No export: ask for one (CSV from any ads manager is enough). Never estimate results.
- Ads without tags: decompose them (watch or read each ad, fill the families) before reading groups; the report counts untagged ads.
- Below the minimum data: report "insufficient" and stop. Lowering the thresholds needs the owner's say-so, recorded in the report.

## Source precedence

The brand's own platform data > a creative-analytics tool's export of the same data > the person's notes > model estimates (never used). Attribution windows and currencies stay as exported and are named in the report.

## Tools / providers

`cstack creative import <file.csv> --channel <c> --preset meta-ads-manager|tiktok-ads|generic [--map ...]`, `cstack creative report [--family f] [--write]`, `brand-verify` for distinctiveness of the top ads. Adapters: [providers/evidence](../../providers/evidence/README.md) (CSV ships; platform APIs and analytics tools enter as exports or official APIs).

## Process

1. **Import** each export; check the column mapping it prints; fix with `--map`, never by editing numbers.
2. **Decompose** untagged ads into taxonomy families. Keep families apart: "street interview" is a format, "contrarian claim" a hook tactic, "social proof" a proof.
3. **Report** with `cstack creative report`. Read, in order: data sufficiency, groups against the account median, confounds, concentration, fatigue.
4. **Brand read**: for any term holding most of the spend, run `brand-verify` on its top ads. If they read as platform default or a competitor's grammar, say so: the message may be winning while the brand is losing.
5. **Write the read** as rungs: OBSERVATION (correlates), HYPOTHESIS (may be driving it because...), TEST (hold X, vary Y). Append observations with `--write`; add hypotheses by hand to `state/insights.jsonl`.
6. **Close tests**: when a bet's experiment reaches its minimum spend, compare cells. Reproduced → a `learning` insight citing the bet; not reproduced → say so, keep the observation.

## Decision rules

- No group is read below the minimums (default spend 50, impressions 2000, 3 ads per group).
- A confounded group gets a test, never a conclusion.
- A finding repeated across two or more test windows is a candidate for `learning-loop`; a rule exists only after `cstack learn promote` with the owner.
- Concentration above 60% of spend in one term is reported with a brand note, whatever its CPA.
- CTR is attention, not sales; when purchases are too few the report says it read CTR.

## Outputs, files written, state updated

- `state/performance.jsonl` (imported records), `state/insights.jsonl` (observations, hypotheses, learnings).
- `work/ads/<date>-intelligence.md`: sufficiency, groups, confounds, concentration, fatigue, brand read, proposed tests.

## Evals required

- T1: `tests/creative.test.mjs` (import, thresholds, confounds, concentration, fatigue, ladder rules in the schema).
- Fixtures: `creative-confounded-winner.yaml`, `creative-correlation-as-rule.yaml`, `creative-concentration-brand.yaml`.

## Handoff

`creative-strategist` (bets from the read), `brand-verify` (distinctiveness of concentrated winners), `learn-loop` (repeated, tested findings).

## Failure modes

- "Direct-address UGC has the lowest CPA" as a conclusion: no data minimum, no confound check, no brand read.
- Tags that mix families, so groups mean nothing.
- Importing the same export twice (the import refuses ids it already has).

## Examples

"Creator-to-camera ads correlate with a CPA of 18.6 against an account median of 25 across 6 ads. They always use the same person and the platform's default look, so the data cannot separate format, talent or visual world. 66% of spend sits there and the brand-world ads trail. Hypothesis: the message (a finite batch, shown by its maker) is doing the work. Test: hold the person and the angle, vary visual world."
