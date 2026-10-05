# Corpus first, and prompt review

## Corpus first (field test F33)

Before any lens, read the brand's own record: `cstack brand context` for the sections in play, the founder brief, the gold and anti references, and `state/feedback.jsonl` (what the owner kept, killed and picked, and why). A review that has not read them judges taste in general, not this brand, and it will disagree with the owner for reasons the owner already gave.

## Prompt review (field test F68)

Before any paid generation, read every compiled prompt (`cstack prompt compile`) against:

- the territory: does the prompt carry its decisions (idea, light, materials, palette logic, refusals), or only styling words?
- the references the founder kept or killed: does it lean toward the keeps and away from the kills, by mechanism?
- the slots: any `WARN` from `cstack prompt compile` (slots that contradict) is resolved or explained.
- on-pack elements: anything the territory lists under `composite` (a price, a drop number, the wordmark) is left out of the prompt and given room in the frame; it is set after generation, never dropped because of the no-lettering rule.

Rewrite a failing prompt before spending. A prompt review costs one read; a wrong batch costs the batch and the owner's trust.
