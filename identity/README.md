# cstack's own brand workspace

cstack keeps its own identity the way it asks every brand to: as a workspace. Changes to the repo home, the README figures and any future cstack visual run through it.

- `brand/brand-system.json`: the settled facts, each with its source and approval. Klein blue #002FA7 as the one colour, the warm white ground, GNU FreeSans outlines, the lowercase wordmark with its square full stop, the Swiss poster as the default, no practitioner named inside a visual.
- `brand/tokens/`: the colour tokens. `brand/rules/brand-rules.yaml`: what a reviewer checks.
- `work/figures/make-figures.py`: regenerates the three README figures from the tokens' values (needs Python with fontTools and the FreeSans fonts).

Before a home change merges: `cstack brand check --ws identity`, then `/brand-verify` with this workspace on the changed figures and copy.

This workspace holds cstack's identity only. No other brand's material belongs here.
