# Retro: cstack v0.1 (2026-10-03)

What was built, what is honestly weak, and what was decided along the way. The forward plan is [backlog-v0.2.md](backlog-v0.2.md); the dimension-by-dimension view is [research/gap-analysis.md](research/gap-analysis.md).

## What exists

- A CLI covering every deterministic step the spec asked for: validation, index, search, health, budgets, brand state with precedence, context, staleness, prompt compile and diff, routing, spend planning, guarded generation, pending jobs, tokens, browse, lineage, feedback, failures, evals, experiments, learning promotion, diff-aware eval plans, multi-host setup.
- 21 schemas, 22 skills with full contracts and measured budgets, 8 workflow templates, 20 eval fixtures, a 45-entry dated model registry, a 20-entry research-tool registry with detection, a 12-entry canon, a starter workspace and a fictional example brand.
- CI-ready checks: `npm run check` (validate, budgets, tests) passes.

## What is weak

1. **Nothing above T1 has run.** T2–T4 fixtures are written as specifications with `must` / `must_not` and graders, but there is no runner. Every claim that a skill "behaves" is untested by machine. This is the largest gap.
2. **No real brand has gone through cstack yet.** The spec's phase G (validate on a real brand) was deliberately not done in this public repo: the owner's rule is that no brand material enters cstack. It has to happen in the brand's own private repository, using cstack as installed. Until it does, workflows stay `template`.
3. **Taste judgment is uncalibrated.** The design keeps the owner sovereign and records pairwise picks, but there is no dataset yet, so any AI reviewer is a filter, not a taste judge.
4. **Two live media adapters.** fal and the mock are real; Taste Labs is implemented against its documented API but untested without a key; the rest are stubs. No paid call was made in this build.
5. **Registry decay is already visible.** 8 of 45 model entries are past their staleness window on day one. Refresh is manual.
6. **Specialist outputs are thin.** Video, decks and packaging are workflow templates without their own checkers or renderers. Performance learning is a schema without an ingestion path.
7. **Compliance is a process, not knowledge.** `claims-proof` requires current primary sources and marks uncertainty, but encodes no ANVISA or FDA rules and caches no citations.
8. **Copy is still effectively self-judged.** The QA pass is separate in the skill, but nothing deterministic checks copy.
9. **Skill count is 22, above the 15–20 target.** `browse` and `workflow` are infrastructure other skills call; folding them away would hide real contracts. Kept, with budgets enforced. Revisit after real runs show which skills never fire.

## Decisions made during the build

- **Brand-agnostic by construction.** No owner brand appears anywhere in the repo or its history. Lessons from a prior private brand system entered only as anonymized, general rules ([local-learning-migration.md](research/local-learning-migration.md)). `cstack validate` enforces this with a private, untracked denylist.
- **Research tools are capabilities, not dependencies.** Each has a fallback. Tools whose terms bar automated agents (Cosmos, Baymard) are used only through owner exports or by the owner.
- **Browser ported from gstack as one-shot commands**, not the daemon: simpler, safer for brand work, MIT attribution kept per file.
- **Spend blocked by default.** A new workspace has a budget of 0.
- **Knowledge-status taxonomy adopted as the approval enum**, so provenance and the owner's own vocabulary are the same thing.
- **Encode at the lowest reliable level** (tokens > components > rules > agent rules > exemplars > preferences) is the promotion rule for learnings.

## What surprised us

- The public market is thin exactly where cstack is thick: governed brand state, Shot DNA, gold/anti libraries and verification are mostly marketing claims elsewhere.
- Several research tools forbid agent access in their terms; detection had to distinguish "you have it" from "an agent may use it".
- The prior private system's best lesson was negative: an AI judge passing a set did not predict the owner's verdict. That single fact shaped the judgment architecture more than any framework.

## Unvalidated, on the record

Paid generation end to end; Taste Labs live calls; T2–T4 behavior; multi-host install outside Claude Code and `.agents`; Windows paths; video routing; any real campaign.
