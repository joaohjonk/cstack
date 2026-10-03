---
name: brief
description: "Interrogate and reframe a creative or brand request before anything is made, then write a short creative brief downstream skills consume. Use when a request arrives for any artifact (campaign, shoot, page, pack, deck, brand), when the ask is vague (make it cooler, more premium), or when the requested artifact may be the wrong one. Not for executing an already-approved brief (use workflow or the specialist skill) or for reviewing finished work (use creative-review)."
license: MIT
---

# /brief

The most important skill in cstack. It decides what is worth making before money and time go into making it. Rules in [the shared preamble](../cstack-shared/PREAMBLE.md) apply.

## When to use

- Any new creative request, before production.
- The ask is an adjective ("cooler", "more premium", "pop more") or a format ("we need a TikTok") without a job.
- The owner is unsure whether the brief, the channel or the artifact is right.

## When not to use

- A brief already exists in `briefs/` with `status: approved` and the task is execution: go to `workflow` or the specialist skill.
- Pure QA of a finished artifact: `creative-review`.
- A factual or compliance question: `claims-proof`.

## Inputs

- The owner's request in their words (quote it into the brief).
- `cstack brand context --sections strategy,positioning,customer_audience,claims,proof,voice` (only what exists).
- Recent related work: `cstack lineage`, `briefs/`, `campaigns/`, learnings for this artifact type.

## Missing-input behavior

- No brand workspace: run on the request alone, mark every brand fact UNKNOWN, recommend `brand-import` or the `create-brand` workflow, and still produce the brief.
- Ask **at most three** forcing questions, and only those whose answer changes the work. Everything else gets a stated default ("Assuming conversion is secondary; say if not").
- Never block on a question the brand state already answers.

## Source precedence

The preamble ladder (§2). A request that contradicts locked brand state is surfaced as a conflict, not silently obeyed or silently refused.

## Tools / providers

None paid. Read-only CLI: `cstack brand context`, `cstack search`, `cstack lineage --show`. Optional: `taste-search` if direction is underdefined and references would change the answer.

## Process

1. **Restate the job** in one sentence: what should the audience think, feel or do, and why now? Then three lines: identities, emotions, actions.
2. **Classify inputs** (FACT / HARD_CONSTRAINT / SOFT_CONSTRAINT / CAMPAIGN_DIRECTION / REFERENCE_MECHANISM / OPEN_CREATIVE_SPACE / UNKNOWN).
3. **Gold-standard counterfactual.** Write three lines: what would an exceptional human team do with ample time? (research, references, prototypes, shoots, tests). This is the target process; AI compresses parts of it, it does not lower the ambition.
4. **Challenge the ask** with the forcing questions, answering from brand state where possible:
   - Is the requested artifact the right artifact? (recommend another if not, and say why)
   - Where will it live (shelf at a distance, feed, counter, inbox)? Design for that place.
   - What is the job of the piece: brand-building, conversion, culture, or a stated mix?
   - What product truth can carry the idea?
   - What tension is interesting (category, culture, audience)?
   - Which convention do we use, invert or ignore?
   - What is this brand allowed to do that competitors are not?
   - What would make it feel inevitable rather than decorated?
5. **Diverge briefly**: two or three genuinely different framings of the job, never averaged. Recommend one.
6. **Write the brief** (schema `creative-brief`) with success criteria the reviewer can check, explicit constraints, open questions, and the handoff.

## Decision rules

- If the answer to "is this the right artifact" is no, the brief recommends the better artifact and keeps the requested one as an alternative. The owner chooses.
- "Make it cooler" style asks are diagnosed into named defects (hierarchy, light, casting, copy, novelty, cultural register) before any change is proposed.
- Success criteria must be observable (a reviewer can say pass/fail) and include at least one product-truth criterion and one brand-fit criterion.
- Name the ring served: core (practitioners others copy), participants or fans. Brand-building goes to the core; outer rings get conversion work. Collaborations need shared values, then a complementary audience.
- Visual deliverables then go through a flow plan; nothing is made until `cstack flows gate <plan> --stage make` passes.
- Do not produce creative executions here. A headline or image idea may appear only as an illustration of the framing.

## Outputs, files written, state updated

- `briefs/<YYYY-MM-DD>-<slug>.creative-brief.yaml` (validated by `cstack validate`/`brand check`): requested vs recommended artifact, job, mode, audience, product truth, tension, conventions, permission, inevitability test, inputs (classified), constraints, success criteria, open questions, handoff.
- A five-line summary for the owner: the reframe, the recommendation, the questions (max three), the defaults assumed.
- State: none, unless the owner corrects a brand fact during the session (then `cstack brand set` with `user_instruction`).

## Evals required

- T0: brief validates against `creative-brief` schema.
- T2 fixtures: `evals/fixtures/make-it-cooler.yaml` (diagnose, do not expand adjectives), `existing-brand-clear-assets.yaml` (minimal questions), `wrong-artifact.yaml`.

## Handoff

`workflow` (with the chosen workflow), `taste-search` (direction underdefined), `cultural-scan` (culture-led job), `creative-direction` (territories), `copywriting`, `claims-proof` (a claim carries the idea).

## Failure modes

- Asking ten questions: interrogation theatre instead of help. Cap at three.
- Rubber-stamping the requested artifact.
- Writing a brief full of adjectives ("bold, premium, modern") with no product truth or tension.
- Inventing audience facts; write UNKNOWN.

## Examples

Request: "Make our launch post cooler."
Output summary: "The post's job is trial, not awareness. 'Cooler' traces to two defects: the product is a small object in a generic kitchen (product truth invisible) and the copy restates the category. Recommend a single close product ritual shot plus one proof line; keep a lifestyle carousel as the alternative. Questions: (1) Is the offer fixed? Defaults: audience = current followers; conversion primary."
