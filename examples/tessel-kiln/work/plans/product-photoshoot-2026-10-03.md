# product-photoshoot · 2026-10-03 · Tessel Kiln (fictional)

> **Illustrative example.** Tessel Kiln is an invented studio. This tracker shows the shape of a
> `workflows/product-photoshoot/workflow.yaml` run (status: `template`, not yet proven on a real run).
> It is not a validated run record and is not linked from the workflow's `runs:`. The only "generation" so
> far went to the mock provider and cost nothing.

- Brief: `briefs/autumn-batch-hero.creative-brief.yaml`
- Workspace check at start: `cstack brand check` PASS, 22 fields, 1 open conflict (`CF-2026-10-03-color-accent`), 3 unknown
- Providers: mock only (no provider keys in the environment; none set on purpose)
- Budget: `cstack.config.yaml` per_run 0 / per_day 0, so **paid calls are blocked** until the owner sets an envelope
- Spend so far: 0 USD (`cstack spend summary`: 1 mock call, 1 dry run)

**Current state: STOPPED at owner gate `routing`.** Resume here.

| # | Step | Skill | Gate | State | Outputs / evidence | Decisions, notes |
|---|---|---|---|---|---|---|
| 1 | brief | brief | owner | done | `briefs/autumn-batch-hero.creative-brief.yaml` | Owner approved with an edit: struck "curated"/"elevate" (`state/feedback.jsonl`, type edit). Reframed 3 photos → 1 hero + 1 batch grid. |
| 2 | product-truth-lock | product-fidelity | auto | done, with gap | `brand/brand-world.json` → `PRODUCT_DINNER_PLATE_OCHRE_RUN` | Immutable traits and forbidden drift written. **Gap:** master photos `assets/product/plate-ochre-run/master-*.jpg` do not exist yet; dimensions UNKNOWN. The product is never generated: it is photographed and composited. |
| 3 | image-roles | campaign-sequence | auto | done | brief `deliverables` | Hero 4:5 (RITUAL role), batch grid 1:1 (PROOF role). R-IMG-01 sizes. |
| 4 | references | taste-search | auto | done (degraded) | `references/gold/*`, `references/anti/*` | Degraded mode: no Taste Labs key, manual curation. 3 gold (middle, far, middle) + 2 anti (near). Described references only, no images stored. |
| 5 | shot-dna | shot-dna | auto | done | `references/dna/shot-autumn-hero-aftermath.shot-dna.yaml` | Camera, light and composition fixed for refinement. Batch grid needs no generation (straight product photography). |
| 6 | method | product-fidelity | auto | done | this tracker | Decomposed: generated background plate (empty lower-left) + real plate photographed under `LIGHT_NORTH_WINDOW_LATE` + composite. Single-pass generation rejected: glaze_truth is locked. |
| 7 | routing | model-router | **owner** | **gate (waiting)** | `cstack route --modality image ...` (registry snapshot) | **Decision needed from the owner**, see below. |
| 8 | recipes | prompt-director | auto | doing | `recipes/autumn-hero-plate.prompt-recipe.yaml` (compiles, hash `039ff68caf0d83ac`) | Drafted early against `mock/plate-v0` only to price the probes. Recompile for the chosen model after step 7. |
| 9 | generate-components | generate-media | owner | todo | `work/plans/spend-probe.items.json` (mock, 0 USD), `work/plans/probe-request.json` | Mock probe run once: see failure `FAIL-20261003-55c6be` in `state/failures.jsonl` (`--dry-run` flag was not honoured; mock cost 0). Experiment `exp-hero-plate-traces` scaffolded, 1 discard. |
| 10 | composite-repair | image-edit | auto | blocked | - | Blocked by step 2 gap: no master photo of the plate to composite. |
| 11 | fidelity-test | product-fidelity | auto | blocked | - | Blocked by step 10. |
| 12 | grade | image-edit | auto | todo | - | |
| 13 | brand-review | creative-review | owner | todo | - | Reviewer checks R-IMG-02, R-IMG-03, R-COLOR-02 and both anti references. Author never certifies its own work. |
| 14 | export | - | auto | todo | `work/exports/` | `cstack audit <file> --aspect 4:5` / `1:1` on every file. |
| 15 | retro | learn | auto | todo | `state/learnings.jsonl` | One learning already logged from step 1 (banned words, strong human correction: promotion candidate). |

## Gate 7: routing (owner decision)

The background plate is a plain interior with no product, so product consistency does not matter for
this component; texture realism and following negative constraints do.

| Option | Consequence |
|---|---|
| A. Set a small budget (e.g. per_run 1 USD, confirm_over 0.5) and run a 3-probe micro-benchmark on two candidate models | Real images to judge; a few cents per probe at current snapshot prices (re-verify before paying). |
| B. Skip generation: photograph the empty table on the same shoot as the master plates | Zero model spend, perfect light match; needs a half-day on site. |
| C. Defer: keep working on copy and the batch grid | Hero slips past the 2026-10-20 launch. |

**Recommendation: B.** Steps 2, 10 and 11 already need a photo session for the master plates; shooting the
empty table in the same light removes the hardest composite problem (light matching) for free. Option A
stays available if the session cannot happen before launch.

Paid what-if, for the record: `cstack spend plan work/plans/spend-paid-what-if.items.json --stop "2 probes"`
returns `ok: false` (estimate 0.08 USD exceeds per_run 0). That is the guard working, not a bug.

## Open items that block shipping regardless of the gate

- `CF-2026-10-03-color-accent` (Kiln Ochre #B8742A vs #C98A3E): owner to decide; ochre stays out of graphics (R-COLOR-02).
- `claims.microwave_safe` UNKNOWN: never stated or implied in captions or alt text.
- `materials.clay_body`, `known_uncertainties.product_dimensions` UNKNOWN: product copy leaves them out.
