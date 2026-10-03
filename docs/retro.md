# Retro: cstack v0.1 (2026-10-03)

Snapshot as of v0.1-pre: counts below are historical and have changed since (`cstack health` has the current ones). What was built, what is honestly weak, and what was decided along the way. The forward plan is [backlog-v0.2.md](backlog-v0.2.md); the dimension-by-dimension view is [research/gap-analysis.md](research/gap-analysis.md).

## What exists

- A CLI covering every deterministic step: validation, index, search, health, budgets, brand state with precedence, context, staleness, prompt compile and diff, routing, spend planning, guarded generation, pending jobs, tokens, browse, lineage, feedback, failures, evals, experiments, learning promotion, diff-aware eval plans, multi-host setup.
- 21 schemas, 22 skills with full contracts and measured budgets, 8 workflow templates, 20 eval fixtures, a 45-entry dated model registry, a 20-entry research-tool registry with detection, a 12-entry canon, a starter workspace and a fictional example brand.
- CI-ready checks: `npm run check` (validate, budgets, tests) passes.

## What is weak

1. **Nothing above T1 has run.** T2–T4 fixtures are written as specifications with `must` / `must_not` and graders, but there is no runner. Every claim that a skill "behaves" is untested by machine. This is the largest gap.
2. **No real brand has gone through cstack yet.** Validation on a real brand was deliberately not done in this public repo: the owner's rule is that no brand material enters cstack. It has to happen in the brand's own private repository, using cstack as installed. Until it does, workflows stay `template`.
3. **Taste judgment is uncalibrated.** The design keeps the owner sovereign and records pairwise picks, but there is no dataset yet, so any AI reviewer is a filter, not a taste judge.
4. **Two live media adapters.** fal and the mock are real; Taste Labs is implemented against its documented API but untested without a key; the rest are stubs. No paid call was made in this build.
5. **Registry decay is already visible.** 8 of 45 model entries are past their staleness window on day one. Refresh is manual.
6. **Specialist outputs are thin.** Video, decks and packaging are workflow templates without their own checkers or renderers. Performance learning is a schema without an ingestion path.
7. **Compliance is a process, not knowledge.** `claims-proof` requires current primary sources and marks uncertainty, but encodes no ANVISA or FDA rules and caches no citations.
8. **Copy is still effectively self-judged.** The QA pass is separate in the skill, but nothing deterministic checks copy.

## Decisions made during the build

- **Brand-agnostic by construction.** No owner brand appears anywhere in the repo or its history. Lessons from a prior private brand system entered only as anonymized, general rules ([local-learning-migration.md](research/local-learning-migration.md)). `cstack validate` enforces this with a private, untracked denylist.
- **Research tools are capabilities, not dependencies.** Each has a fallback. Tools whose terms bar automated agents (Cosmos, Baymard) are used only through owner exports or by the owner.
- **Browser ported from gstack as one-shot commands**, not the daemon: simpler, safer for brand work, MIT attribution kept per file.
- **Spend blocked by default.** A new workspace has a budget of 0.
- **Knowledge-status taxonomy adopted as the approval enum**, so provenance and the owner's own vocabulary are the same thing.
- **Encode at the lowest reliable level** is the promotion rule for learnings (ladder in [learnings.md](learnings.md#promotion-targets)).

## What surprised us

- The public market is thin exactly where cstack is thick: governed brand state, Shot DNA, gold/anti libraries and verification are mostly marketing claims elsewhere.
- Several research tools forbid agent access in their terms; detection had to distinguish "you have it" from "an agent may use it".
- The prior private system's best lesson was negative: an AI judge passing a set did not predict the owner's verdict. That single fact shaped the judgment architecture more than any framework.

## Addendum: method first, and the media expansion (later on 2026-10-03)

The owner asked for 3D, mockups, vector and symbol knowledge, AI video and typography, and for one rule across all of it: research the best way to reach an outcome before making anything, then work step by step. Never one-shot.

### What was added

- **Method before making.** A flow schema, `cstack flows list|search|show|plan|check`, a method-first preamble rule, the `flow-research` skill and 14 researched flows (type system, logo system, icon set, mockup set, four 3D outcomes, six video outcomes). `flows check` refuses a plan that compared fewer than two ways of getting there, left a step without a gate, made something without saying how it is compared to the target, has no stop condition, or never stated this run's target.
- **Seven media skills:** type-director, symbol-design, vector-master, mockup, three-d, video-direction, video-assembly. Three workflows: logo-system, product-3d, product-video. landing-page, packaging and paid-social gained 3D, mockup and video steps.
- **Deterministic checkers** for what models get wrong: `cstack type` (scales, rendered-type QA, font files), `svg`, `mockup`, `3d` (GLB budgets, real-world scale, frame sequences, a Blender script writer) and `video`.
- 26 more fixtures (46 in all), 13 canon entries on marks, systems and typography (25 in all), a 68-entry model registry and a 48-entry research-tool registry.
- A typography pass: the primer traces 20 common rules to their reasons, studio lessons were checked against sources ([research/typography.md](research/typography.md)), and fluid type scales warn when zoom can fail.
- `cstack validate` now runs `flows check` on the library, checks fixture format, and fails when a skill, doc, fixture or flow names a `cstack` command that does not exist.

### What is weak

1. **No paid generation and no Blender run.** The Blender scripts parse and their control flow is tested against a stub, but they have never run in real Blender. No video or 3D model was called.
2. **Thresholds are researched defaults.** 3D budgets for web heroes and social, type QA limits, mockup tolerances and video checks come from documentation and practitioner reports, not from the owner's verdicts. They need calibration on real runs (backlog P1).
3. **The owner's reference pages were not inspected.** The build environment's network blocked some reference sites, so the flows rest on documentation and practitioner evidence. The fix is a `cstack browse` pass where the network allows it.
4. **30 skills.** The rationale and the merge rule are in [backlog-v0.2.md](backlog-v0.2.md#skill-count-rationale).
5. **Known blind spots in the checkers.** The video label-drift check (SSIM in a region) is weak on flat colours; freeze detection on lossy video starts a few frames late; the OpenTimelineIO export has not been opened in an editor or the OTIO library; safe zones are operator conventions, not platform specs. `mockup verify` was checked against synthetic changes (a single changed glyph fails, light noise passes), not against owner verdicts. `svg reduce` scores are a heuristic.

### What surprised us

- **A YAML trap hid inside the flows.** An unquoted comma in a one-line mapping (`{check: board, hands and faces}`) silently splits the value into stray keys, so a gate lost half its check without any error. It affected 12 lines across the flows. The flow schema now rejects unknown keys, and a test covers the case.
- **The method rule needed a checker to be real.** Before `flows check`, "compare at least two candidates" was advice. Now a plan that skips it fails.
- **Instructions drift ahead of code.** Skills referred to commands that did not exist yet. The new validate check caught every one.

## Unvalidated, on the record

Paid generation end to end; Taste Labs live calls; T2–T4 behavior; multi-host install outside Claude Code and `.agents`; Windows paths; video and 3D routing; the Blender scripts in real Blender; any real campaign.
