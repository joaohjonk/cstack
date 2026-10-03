# v0.2 backlog

Prioritized by dependency (see the build order in [research/gap-analysis.md](research/gap-analysis.md)). P0 blocks most of what follows.

## P0

1. **T2 fixture runner.** `cstack evals run <fixture> [--model]`: build the setup in a temp workspace, run the skill in a fresh agent context, grade `must` / `must_not` with the declared graders (deterministic first, model grader second), write `eval` records, run `runs` times and report variance. Budgeted through `guardedCall`.
2. **First real-brand run, in the brand's own repo.** Import, one product photoshoot and one landing page, end to end, through installed cstack only. Promote the workflows that survive from `template` to `validated` with a linked run record. Brand data never comes back into cstack; general lessons do, anonymized.
3. **Pairwise pick capture.** `cstack browse`-rendered contact sheet (or a small local page) that writes `feedback-event` pairs with won-because / lost-because, so calibration data exists.
4. **Deterministic product-drift check.** Compare outputs against product masters and against the liked raw before a fix replaces it (SSIM/perceptual diff via Chromium canvas or an optional lib); wire into `product-fidelity` and `image-edit`.

## P1

5. **Verifier calibration report.** Agreement between any AI reviewer and owner pairs; reviewers below a threshold are labelled filters only.
6. **Brand-state proposal queue.** `brand propose` vs `brand set`: agent proposals wait in `proposals/` until the owner accepts; readback after write.
7. **Import manifest that rejects stubs.** `brand-import` emits a fixed-section manifest validated in `brand check`.
8. **Copy lint.** Banned and required terms, claim words routed to `claims-proof`, reading level, length per channel.
9. **Lineage written automatically** by `generate` and `edit` (today it is a separate command).
10. **Registry refresh skill/command.** Re-check stale model entries against provider pages, with dated diffs for owner review.
11. **Trigger evals.** For each skill, phrases that must and must not route to it; run against `cstack search` and the host's skill loader.

## P2

12. **Compliance citation cache** per jurisdiction (ANVISA, FDA, FTC, EU) with retrieval dates, consumed by `claims-proof`.
13. **More adapters**: OpenAI images, Google (Imagen/Gemini image), Runway, Recraft, Ideogram, a local ComfyUI bridge; each with dry-run and estimate.
14. **Workspace reference index** for top-k retrieval over large libraries.
15. **Daemon mode for `browse`** (persistent session for multi-step QA), still with the origin lock; or an opt-in bridge to gstack's own browse.
16. **Figma variables sync** for tokens (read via Figma MCP, write back only with approval).

## P3

17. Creative-parameter taxonomy and performance ingestion (needs a real campaign first).
18. Video workflow: motion from approved stills, frame-level fidelity checks.
19. Deck and packaging checkers (safe zones, bleed, dielines, minimum type sizes).
20. Tool-call tracing for observability across a workflow run.

## Skill-count rationale

22 skills today. The target stays "a small number of excellent skills". After the first real-brand run, any skill that never fired or always needed another to be useful is merged; new skills need a fixture and an owner-visible job before they are added.
