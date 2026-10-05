# Verify: cstack self-imagery

/brand-verify on `docs/images/cstack-hero.svg` and `docs/images/the-field.svg` against this workspace, then /creative-review by a reviewer who did not make them. The drift and nine-stop figures did not change (the generator reproduces them byte for byte).

## Deterministic gates

| Rule | Command | Result |
|---|---|---|
| R-COLOR-01 | `cstack tokens lint` on both figures, from `identity/` | pass |
| R-TYPE-01 | `! grep -l '<text' docs/images/*.svg` | pass |
| R-TYPE-02 | `cstack svg legibility docs/images --width 324,830 --page "#ffffff,#0d1117"` | pass, 0 fail, 0 warn, 43 runs (first draft warned on one 36-unit label at ~10.8 px; raised to 38) |
| R-FIELD-01 | `! grep -l '<circle' docs/images/cstack-hero.svg docs/images/the-field.svg` | pass |
| R-NAMES-01 | `! grep -il -E 'vignelli\|pawson\|ando\|aicher\|brockmann\|wegman\|twister' docs/images/*.svg` | pass |

`cstack svg lint` fails both figures on its mark complexity budget (1500 nodes); outlined type puts every README figure over it, nine-layers included, so it does not apply to figures.

## Review (independent, round 1): fix

- The diagram's title said 30 skills over 29 squares (`workflow` runs the stages and has no square). Fixed: "Seven stages, one route."
- The figure read as a dog, and four planted feet repeat how the floor game in the mood photograph is played (R-REF-01), and it stood still. Fixed: tail removed; it stands on three positions and reaches for a fourth, mid-move.
- Route stops were hollow, against R-FIELD-01 (taken is solid). Fixed: solid Klein blue.
- Open squares were opacity tints. Fixed: grey token in the diagram, white at full strength in the hero.
- Kept as praised: the hero still reads as a Swiss poster first; "not this time" under Look outward.

## Round 2

All gates above re-run after the fixes: pass. The R-FIGURE-01 and R-REF-01 judgments are recorded in `state/evals.jsonl`; the owner reads the result in the pull request.
