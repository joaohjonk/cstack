---
name: copywriting
description: "Write and QA brand copy in an explicit mode (clarity and conversion, direct response, brand campaign, editorial, conceptual, product truth and proof) using the brand's voice system, vocabulary and banned language, producing a few distinct options with rationale and a separate QA pass. Use for headlines, ads, PDP and landing page copy, emails, social, manifestos and packaging text. Not for checking claim legality (use claims-proof) or deciding the campaign idea (use creative-direction)."
license: MIT
---

# /copywriting

A voice is a system of decisions (sentence length, specificity, rhythm, evidence, taboo words, density, humor, temperature), not "sound smart". [Shared preamble](../cstack-shared/PREAMBLE.md) applies.

## When to use

- Any brand language: headlines, ad copy, PDP/LP sections, email, social, scripts, manifesto, pack copy.
- Copy QA of existing text against voice and brief.

## When not to use

- Claim legality: `claims-proof`. The campaign idea: `creative-direction`.

## Inputs

- Brief (job, audience, mode), `cstack brand context --sections voice,vocabulary,banned_language,naming,claims,proof,positioning`, channel constraints (lengths, platform rules), gold/anti copy examples.

## Missing-input behavior

- No voice section: derive a provisional voice from gold examples, mark it `inferred`, and show it to the owner with the copy.
- A claim without proof in brand state: write the line without it and flag for `claims-proof`.

## Source precedence

Locked naming and approved claims are verbatim. Voice rules next. Gold examples next. Generic copy formulas last.

## Tools / providers

Text work, no paid media. Deterministic checks: length limits, banned words, required legal lines, reading level. QA pass runs in a separate context from the writer.

## Process

1. **Mode**: pick one (clarity/conversion, direct response, brand campaign, editorial, conceptual/award-level, product truth/proof); state it. Mixed modes need a stated primary.
2. **Message hierarchy**: the one thing, the proof, the action.
3. **Write 3 distinct options** (different ideas, not synonyms), each with rationale: the mechanism, the product truth carried, the risk.
4. **Headline room** (when asked): 10-20 lines across angles, then cut to the best 3 with reasons.
5. **QA (separate pass)**: voice rules hit/miss with line citations, banned language, vocabulary, specificity (no generic category phrases), clarity, length, legal lines, claim flags; "clever" never substitutes for strategic relevance.
6. Owner picks; record pairwise feedback; approved lines can become gold copy examples.

## Decision rules

- Specific beats clever; clever only when it is also specific.
- No unsupported superlatives or implied claims; hand them to `claims-proof`.
- Brand names, product names and locked phrases are never paraphrased.

## Outputs, files written, state updated

- `work/copy/<date>-<artifact>.md` (mode, hierarchy, options with rationale, QA table).
- State: `state/feedback.jsonl` (picks, kills, edits as preference pairs), brand-system `vocabulary` / `banned_language` updates only via owner approval.

## Evals required

- Planned (backlog: copy lint): banned-language and length checks. Until then the reviewer checks them by hand.
- Lens COPY and EDITOR in `creative-review`; fixture `make-it-cooler.yaml` for copy variants.

## Handoff

`claims-proof`, `creative-review`, `workflow landing-page|paid-social|packaging|deck`.

## Failure modes

- Category clichés ("elevate your routine").
- Three options that are one idea.
- Voice drift across a long page; QA every section.

## Examples

Mode: product truth. Hierarchy: "stone-ground, not powdered" → proof (milling method, sourced) → "Try the first tin". Options: A literal process line; B ritual line; C comparative-without-naming line (flag for claims-proof). QA flags B for a banned word.
