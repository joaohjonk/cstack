---
name: claims-proof
description: "Build and check the claims architecture: every claim tied to proof, jurisdiction and current primary regulatory sources (e.g. ANVISA/RDC for Brazil, FDA/CFR for the US), separating legal requirement, retailer requirement, best practice and creative preference, and marking uncertainty instead of inventing certainty. Use for packaging, PDPs, ads, landing pages or any copy that states a benefit, ingredient, health, environmental or comparative claim. Not for writing the copy (use copywriting) or brand tone checks (use brand-verify)."
license: MIT
metadata:
  cstack-version: "0.1.0"
  cstack-meta: "skill.meta.json"
---

# /claims-proof

Never fabricate compliance certainty (section 9, compliance). This skill is research and structure, not legal advice; high-risk items go to qualified counsel. [Shared preamble](../cstack-shared/PREAMBLE.md) applies.

## When to use

- Any claim of benefit, ingredient, nutrition, health, origin, environmental or comparative nature.
- Packaging and label work (mandatory statements), PDPs, paid ads.
- A claim "everyone in the category makes" (saturation is not permission).

## When not to use

- Writing persuasive copy: `copywriting` (it hands claims here).
- Voice and banned words: `brand-verify`.

## Inputs

- Claim list (verbatim), product facts with sources (`brand-system.business_truth`, `claims`, `proof`), product category, markets/jurisdictions, channel (pack, ad platform, retailer).

## Missing-input behavior

- No proof for a claim: mark `unsupported`, propose a supportable rewrite or removal; never soften into an implied claim.
- Jurisdiction unknown: ask; default to "not cleared for any market".
- Regulatory source unreachable: say so; the item stays `uncertain`.

## Source precedence

Current primary regulatory text (official gazette, agency site, CFR) > agency guidance > retailer/platform policy > industry best practice > secondary summaries > model memory (never a source). Every rule cites URL, version or date, and retrieval date.

## Tools / providers

Web research on primary sources **every time rules may have changed** (re-check anything older than the brand's review window), `browse` for official pages and PDFs, `cstack brand set` for approved claims.

## Process

1. **Inventory claims** verbatim with where they appear.
2. **Classify**: factual, comparative, health/nutrition, ingredient, origin, environmental, subjective (puffery).
3. **Proof**: link each claim to evidence (test report, spec, certificate, citation) with source; mark strength.
4. **Rules per jurisdiction**: retrieve current primary sources (e.g. Brazil: ANVISA, applicable RDC/IN, Portuguese labeling, nutrition, allergens, mandatory statements; US: FDA, applicable CFR and guidance, Nutrition or Supplement Facts as relevant, identity, net quantity, ingredients, allergens, manufacturer/distributor statement). Record citation, version/date, retrieval date.
5. **Separate four layers** for each item: legal requirement / retailer or platform requirement / best practice / creative preference.
6. **Risk rating** (low / medium / high) with reason; high → counsel review list.
7. **Claim families**: block risky families, not only single sentences (a rewrite that keeps the implied claim is still the claim).

## Decision rules

- Uncertain stays uncertain. The output says "uncertain: needs counsel" rather than "compliant".
- Category saturation never lowers the proof bar.
- Approved claims enter brand state with `approval: current`, `scope`, and an `expires` or review date.

## Outputs, files written, state updated

- `work/claims/<date>-<artifact>.md` claims matrix (claim, class, proof, jurisdiction rule + citation, four layers, risk, decision).
- Brand-system `claims`, `proof`, `compliance_constraints` via `cstack brand set` (approved items only).
- State: `state/failures.jsonl` (`claim_risk`, `compliance_failure`) when an issue reaches an artifact.

## Evals required

- Fixture: `compliance-claim-uncertain.yaml` (retrieve current primary source and mark uncertainty).
- Review lens COMPLIANCE in `creative-review`.

## Handoff

`copywriting` (rewrites), `workflow packaging` (mandatory statements on dielines), owner/counsel (high-risk list).

## Failure modes

- Citing memory or a blog as regulation.
- Treating "best practice" as law, or law as optional.
- Rewording a blocked claim into an implied claim.

## Examples

"Boosts focus" on a beverage pack for BR and US: classified functional/health; no clinical proof supplied → unsupported in both; current sources retrieved with dates; recommendation: remove, or replace with a factual ingredient statement that has proof; added to counsel list as high risk if kept.
