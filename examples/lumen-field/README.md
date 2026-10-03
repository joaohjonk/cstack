# Lumen Field: a fictional example brand workspace

**Lumen Field is invented.** It is a made-up small-batch ceramics studio that sells stoneware tableware
online. The people, the shop (`lumen-field.example`, a reserved domain), the colours and the "official
assets" are all fiction, written to show how a cstack brand workspace looks after a few days of honest
work. Any resemblance to a real business is unintended. There are no images in this folder.

The workspace was created with `cstack brand init examples/lumen-field --name "Lumen Field" --id lumen-field`
and then filled through the CLI wherever a command exists (`brand set`, `tokens build`, `feedback`,
`learn add`, `failure`, `lineage`, `experiment init|log`). A real brand workspace lives in its own repo;
this one ships inside cstack only as a demo and a test fixture (`tests/example.test.mjs`).

## Try it

Run from the cstack repo root. The first block is read-only.

```bash
W=examples/lumen-field
node bin/cstack.mjs brand check --ws $W                      # PASS; 22 fields by approval state, 1 open conflict
node bin/cstack.mjs brand context --ws $W --sections color,claims,voice   # facts vs not_facts, hashed
node bin/cstack.mjs tokens check --ws $W                     # 24 DTCG tokens, PASS
node bin/cstack.mjs tokens lint $W/work/pages/product-card.css --ws $W   # PASS: only token colours used
node bin/cstack.mjs prompt compile $W/recipes/autumn-hero-plate.prompt-recipe.yaml
node bin/cstack.mjs prompt compile $W/recipes/autumn-hero-plate.prompt-recipe.yaml --set traces="a crumpled napkin"
node bin/cstack.mjs spend plan $W/work/plans/spend-probe.items.json --stop "3 mock plates" --ws $W        # ok, 0 USD
node bin/cstack.mjs spend plan $W/work/plans/spend-paid-what-if.items.json --stop "2 probes" --ws $W     # ok:false, budget is 0
node bin/cstack.mjs spend summary --ws $W
node bin/cstack.mjs experiment status exp-hero-plate-traces --ws $W
node bin/cstack.mjs learn candidates --ws $W                 # the owner's banned-word edit is a promotion candidate
node bin/cstack.mjs lineage --show copy-plate-ochre-run --ws $W
node bin/cstack.mjs brand stale --ws $W                      # nothing stale yet
```

These commands write. Run them on a copy so the example stays as shipped:

```bash
cp -r examples/lumen-field /tmp/lf
# source precedence: a model guess cannot overwrite an owner instruction
node bin/cstack.mjs brand set voice.tone --file /tmp/lf/work/inputs/brand-set/voice.tone.model-guess.field.json --ws /tmp/lf
#   -> voice.tone: keep (lower-precedence source (model_inference) cannot overwrite user_instruction)
# conflict: the swing-tag ochre at equal precedence is surfaced as a conflict, never averaged (re-sending it is a no-op)
node bin/cstack.mjs brand set color.accent --file /tmp/lf/work/inputs/brand-set/color.accent.swing-tag.field.json --ws /tmp/lf
#   -> color.accent: keep (same conflict already open (CF-2026-10-03-color-accent))
# dependency invalidation: an owner rule outranks the live-site observation the approved copy relied on
node bin/cstack.mjs brand set voice.sentence_length --file /tmp/lf/work/inputs/brand-set/voice.sentence_length.demo-owner-rule.field.json --ws /tmp/lf
#   -> set (higher-precedence source ...)   now stale: copy-plate-ochre-run v1
node bin/cstack.mjs brand stale --ws /tmp/lf
```

## What each file demonstrates

| Path | Demonstrates |
|---|---|
| `cstack.config.yaml` | Budget left at 0 on purpose, so every paid call is blocked; `preferred_media: mock`. |
| `assets/official/*.md` | Text stand-ins for owner-supplied sources (interview, glaze spec, swing-tag spec, care card). Every brand field cites one of these by path and line, or a live-site observation, or says it is a model inference. |
| `brand/brand-system.json` | 22 sourced fields across 14 sections, written with `cstack brand set`. Approval states in use: locked 6, current 7, provisional 3, testing 1, inferred 1, unknown 3, conflict 1. |
| ... `conflicts[]` | `CF-2026-10-03-color-accent`: the palette spec says Kiln Ochre is `#B8742A`, the swing-tag print spec says `#C98A3E`. Both are `official_asset`, so `brand set` recorded a conflict instead of picking one or averaging. The field is marked `conflict`, the owner is named, and the ochre is kept out of the tokens. |
| ... `provenance.gaps` | Sections left empty on purpose (logo marks, packaging, casting, motion/sound, performance data, product dimensions), each with where we looked and whether it needs the owner. |
| ... UNKNOWN fields | `claims.microwave_safe`, `materials.clay_body` and `known_uncertainties.product_dimensions` say UNKNOWN and what would resolve them, instead of a plausible guess. |
| `brand/tokens/*.tokens.json` | DTCG colour, type, space, radius and motion tokens with semantic aliases (`color.text` → `{color.kiln-ink}`). Only official values; generic font stacks stand in until the owner names the licensed face. |
| `brand/generated/tokens.css` | Output of `cstack tokens build` (deterministic, hashed header). |
| `brand/rules/brand-rules.yaml` | Relationship rules, each marked `deterministic` (with the command that checks it) or `judge` (when no checker exists yet). |
| `brand/brand-world.json` | A product entity (`PRODUCT_DINNER_PLATE_OCHRE_RUN`) with immutable traits, allowed variation and forbidden drift; a location (`LOCATION_STUDIO_TABLE`, status testing, sourced as an inference); a lighting recipe (`LIGHT_NORTH_WINDOW_LATE`). |
| `assets/product/plate-ochre-run/README.md` | The product's master photos are named but missing, and the photoshoot tracker treats that as a blocking gap. |
| `references/gold/*.reference.yaml` | Three gold references described in words, never copied: a middle-distance painting genre (aftermath tables), a far-distance one (natural-history specimen plates → batch grid), and a middle-distance copy format (plain trade catalogues → product copy order). Each has source domain, distance, mechanism, transfer, do-not-copy and rights. |
| `references/anti/*.reference.yaml` | Two near-distance anti references (staged showroom DTC, black-velvet luxury) with `why_it_fails` tied to brand fields. |
| `references/dna/*.shot-dna.yaml` | Shot DNA for the proposed hero: camera, composition, light recipe, purposeful imperfections, risks, entity refs, fixed dimensions. |
| `briefs/autumn-batch-hero.creative-brief.yaml` | A `/brief` brief with a reframe, classified inputs (FACT, HARD_CONSTRAINT, SOFT_CONSTRAINT, REFERENCE_MECHANISM, UNKNOWN, OPEN_CREATIVE_SPACE), conventions to use or invert, success criteria on separate axes, and open questions with defaults. |
| `recipes/autumn-hero-plate.prompt-recipe.yaml` | A slot recipe that compiles. It generates only the background plate; the real product is composited (glaze truth is locked). No person or studio names in the prompt. |
| `work/plans/product-photoshoot-2026-10-03.md` | An **illustrative** workflow tracker that stops at the owner gate `routing`, with options, a recommendation and what is blocked. The workflow stays `template`; this is not a validated run. |
| `work/plans/*.items.json`, `probe-request.json` | Inputs for `spend plan` (a 0-cost mock plan and a paid what-if that the budget guard rejects) and for `generate`. |
| `state/cost-ledger.jsonl` | Two mock rows: one `ok` at 0 USD and one `dry_run`. |
| `state/feedback.jsonl` | An owner edit on the brief (banned words) and a decisive pairwise choice between two copy drafts. |
| `state/learnings.jsonl` | A strong human correction (promotion candidate) and a durable observation about print vs screen colour specs. |
| `state/failures.jsonl` | One `failure-event` recorded while building this example (a CLI bug, since fixed), kept as a sample of the format. |
| `state/lineage.jsonl`, `work/copy/*` | The approved copy draft's creative commit, with `brand_refs` hashes so `brand stale` can flag it when those fields change. |
| `experiments/` | A bounded keep/discard run on one variable (`prompt.slot.traces`) with two rows in `results.tsv`. The rows are marked ILLUSTRATIVE: the provider is the mock, so the scores are placeholders. |
| `work/inputs/` | The JSON files fed to `brand set`, `feedback`, `learn add`, `failure`, `lineage` and `experiment log`, kept so every state row can be traced to its input. |
| `work/out/autumn-hero/*.gen.json` | The generation sidecar from the mock call. The mock's placeholder PNG is gitignored and not shipped. |

## What it does not show

No real images, no paid provider run, no reviewer verdicts (`state/evals.jsonl` is empty), no competitor
or culture observations, and no promoted learnings. The photoshoot tracker stops before any of that on purpose.
