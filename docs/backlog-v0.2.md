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
11. **Trigger evals.** For each skill, phrases that must and must not route to it; run against `cstack search` and the host's skill loader. `tests/search.test.mjs` is the seed.
12. **Calibrate the craft thresholds.** The 3D budgets for web heroes and social, `type qa` limits, `mockup verify` tolerances and the video drift and region checks are researched defaults. Record the owner's verdict next to each checker result on real runs and move a threshold only on that evidence.
13. **Keep flows fresh.** Flows go stale on purpose (`stale_after_days`); `cstack validate` warns. Add a routine that re-runs `/flow-research` on stale flows and proposes dated diffs, and promote a flow from `researched` to `validated` only with a linked run record.
14. **Inspect the owner's reference pages.** Some reference sites could not be fetched from the build environment. Run `cstack browse` on them in a session whose network allows it, and record how each is built (asset type, sizes, scroll choreography) as evidence on the matching flow.

## P2

15. **Compliance citation cache** per jurisdiction (ANVISA, FDA, FTC, EU) with retrieval dates, consumed by `claims-proof`.
16. **More adapters**: OpenAI images, Google (Imagen/Gemini image), Runway, Recraft, Ideogram, a local ComfyUI bridge; each with dry-run and estimate.
17. **Workspace reference index** for top-k retrieval over large libraries.
18. **Daemon mode for `cstack browse`** (persistent session for multi-step QA), still with the origin lock; or an opt-in bridge to gstack's own browse.
19. **Figma variables sync** for tokens (read via Figma MCP, write back only with approval).

## P3

20. Creative-parameter taxonomy and performance ingestion (needs a real campaign first).
21. Video beyond the first pass: the product-video workflow, skills and `cstack video` checks exist; still missing are label checks against the master artwork calibrated on real runs and a first paid run.
22. Deck and packaging checkers (safe zones, bleed, dielines, minimum type sizes).
23. Tool-call tracing for observability across a workflow run.
24. Canon entries for the rest of the README acknowledgements (architecture, fashion, art, film and Brazilian studios). Seven exist (pawson, chipperfield, isay-weinfeld, jonathan-anderson, bureau-borsche, ok-rm, formafantasma); each new one needs sourced mechanisms, not a name.
25. **Composite tokens in CSS.** `tokens build` emits colours, sizes, durations, weights, families and easing; typography, shadow, border, gradient and transition tokens are skipped. Emit them (one custom property per part, plus a class per typography token) so a page can be built from tokens alone.
26. **HTML and SVG as the default brand output.** The guide is the first generated page. Next: a component sheet (buttons, cards, type scale) built only from tokens and linted with `tokens lint`, so pages, social and decks start from brand-owned code instead of a pixel prompt.
27. **Skills read the context map.** Skills still name their sections in SKILL.md; once real workspaces carry `brand/context-map.yaml`, have skills call `brand context --task` and keep the SKILL.md list only as the default.
28. **fal routes for the video models and edit endpoints.** FLUX.2 pro, flex, max and klein 4B/9B have dated fal routes (2026-10-03). Their `/edit` endpoints and every video model still have none, so fal refuses them as unpriced; add each from its fal model page before using it.

## Skill-count rationale

30 skills today, up from 22. The eight added cover jobs the first 22 could not do well: researching the method before making (`flow-research`), typography (`type-director`), marks and icons (`symbol-design`), vector masters (`vector-master`), mockups (`mockup`), 3D (`three-d`), and video direction and assembly (`video-direction`, `video-assembly`). Each one has its own failure modes, its own fixtures and a deterministic checker behind it, which is the bar for a new skill. The target stays "a small number of excellent skills". After the first real-brand run, any skill that never fired or always needed another to be useful is merged.
