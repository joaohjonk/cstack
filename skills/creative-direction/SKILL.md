---
name: creative-direction
description: "Develop distinct creative territories (identity, verbal and art direction) from a brief, references and culture, using diverge, critique and mutate rather than averaging, and land one recommended direction with a written rationale and rejection list. Use when a brand, campaign or major asset needs a direction, or when work feels generic and needs a stronger idea. Not for systemizing an approved direction (use identity-system) or planning a specific shoot (use shot-dna and campaign-sequence)."
license: MIT
---

# /creative-direction

Turns a brief into a few genuinely different ideas, kills the weak ones, and makes the strongest specific. [Shared preamble](../cstack-shared/PREAMBLE.md) applies.

## When to use

- New brand identity, campaign idea, art direction for a shoot, page or pack.
- Existing work reads as generic, decorated or interchangeable with competitors.

## When not to use

- The direction is chosen; build the system (`identity-system`) or the shots (`shot-dna`, `campaign-sequence`).
- Only copy is needed: `copywriting`.

## Inputs

- Approved brief (`brief`), reference packet (`taste-search`), culture scan (`cultural-scan`), category map (`competitor-intel`) when they exist.
- `cstack brand context` for the sections the direction touches; locked fields are hard constraints.

## Missing-input behavior

- No references: run `taste-search` first or state "direction without references" and lower confidence. Never fill ambiguity with adjectives.
- No brief: run `brief` first.

## Source precedence

Locked and current brand state bind. References contribute mechanisms only. Culture contributes behaviors with permission. Model taste is the lowest source and must be argued, not asserted.

## Tools / providers

Thinking work; no paid calls by default. Optional cheap probes (contact sheets via `generate-media` at draft tier, within budget) to make a territory visible, never to choose it.

## Process

Follow the compact pattern: objective → gold standard → evidence → reference graph → divergence → critique → mutation → decision.

1. **Objective and gold standard** from the brief.
2. **Diverge**: 3 territories that differ in idea, not styling. Each: one-line idea, strategic tension it resolves, product truth it carries, the mechanism(s) it borrows (with distance), what the brand does (behavior), verbal direction (voice moves, a sample line), art direction (light, camera, casting, surfaces, color logic, type behavior), what it refuses, and its `composite` elements.
3. **Critique** each against explicit criteria: brand fit, product truth, distinctiveness vs. category map, cultural vitality, feasibility and cost, risk. Name the generic moves in each.
4. **Mutate** the strongest: push it with one mechanism from a far domain; show before/after.
5. **Gate**: `cstack flows gate <plan> --stage decide` before the owner picks.
6. **Recommend** one territory with the tradeoff stated; keep the runner-up as a real alternative.
7. **Rejection list**: what this direction explicitly will not do (feeds anti library and reviewers).
8. Owner selects; record the decision (`cstack feedback`, type approve/reject/pairwise).

## Decision rules

- Never merge territories into a polite middle. If the owner likes parts of two, make the merge a new, explicit territory and critique it again.
- A territory with no product truth or no tension is cut.
- **Not obvious, but true.** Write each territory's first-to-mind version and move past it. Keep ideas that surprise and decode into a real product fact.
- Inevitability test: if the brand's name were removed, would the work still feel like it could only be this brand?

## Outputs, files written, state updated

- `work/direction/<date>-<slug>-territories.md` (3 territories, critique, mutation, recommendation, rejection list).
- After selection: `campaigns/<id>.campaign.yaml` `direction_entity` or brand-world `CAMPAIGN_DIRECTION_*` entity; anti references from the rejection list.
- State: `state/feedback.jsonl` (selection), learnings for owner corrections.

## Evals required

- Fixture: `beautiful-but-off-brand.yaml` (distinguish beauty from brand fit), `make-it-cooler.yaml`, `obvious-first-idea.yaml`.
- `creative-review` lenses STRATEGIST, BRAND DIRECTOR, ART DIRECTOR, CULTURE on the territories doc.

## Handoff

`identity-system`, `campaign-sequence`, `shot-dna`, `copywriting`, `workflow`.

## Failure modes

- Three versions of the same idea in different colors.
- Option addiction: more territories instead of a decision.
- First-to-mind ideas (underdog story, golden ticket, holiday stunt) as a direction.
- Only iterating on what works finds a local maximum; the next tier usually needs a new story for a new audience.
- Names of admired studios as the direction ("make it like X"); transfer mechanisms.

## Examples

Territory B "The Preparation": idea = the product is a ritual, not a snack; tension = category sells speed, brand sells attention; borrowed mechanism (far) = sequenced ceremony; behavior = a 5-step pour shown in order everywhere; refuses = smiling stock lifestyle, floating product splashes.
