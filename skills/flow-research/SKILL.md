---
name: flow-research
description: "Research and design the best step-by-step method to reach a creative outcome before making anything: define the target, search the flow library, benchmark current tools, models, MCP-first and YC companies and what practitioners actually post and use, compare at least two candidate flows, and write a flow with steps, tools and fallbacks, gates, a cost ladder and a stop condition. Use when an outcome has no fresh researched flow, when the existing flow is stale or a poor fit, or when the owner asks for something new (a 3D hero, an AI film, a mockup system). Not for writing the brief (use office-hours) or running a known workflow (use workflow)."
license: MIT
metadata:
  cstack-version: "0.1.0"
  cstack-meta: "skill.meta.json"
---

# /flow-research

Method before making. The quality of the output is mostly decided by the method chosen before the first call; one-shotting an outcome is a failure mode. [Shared preamble](../cstack-shared/PREAMBLE.md) applies (section 0.5).

## When to use

- `cstack flows search "<outcome>"` finds nothing, finds a `STALE` flow, or the match does not fit the target.
- A new kind of outcome: a rotating 3D product on a homepage, a product film, a packaging mockup set, a symbol system.
- Scheduled refresh of the cstack flow library (flows age as models and tools change).

## When not to use

- The ask itself is unclear: `office-hours` first.
- A fresh, validated flow fits: plan from it (`cstack flows plan <id>`) and go.
- Choosing one model inside a known step: `model-router`.

## Inputs

- The outcome in the owner's words, the brief if any, references for the target.
- `cstack flows search`, `cstack tools` (research tools and MCPs actually available), `cstack providers`, `registry/models.json`, workspace learnings (`cstack learn candidates`), prior `work/flows/`.

## Missing-input behavior

- No reference for the target: ask for one, or propose 2-3 from `taste-search` and let the owner pick. A target without a reference is a guess.
- No web access: design from the library, the registry and learnings only, mark the flow `researched` with `evidence.kind: inferred` and a short `stale_after_days`.

## Source precedence

Run records and owner verdicts on this brand > documented tool/model behavior (docs, changelogs, APIs) > practitioner evidence (posted workflows with visible results, public repos) > company marketing > model memory. Marketing claims never decide a step alone.

## Tools / providers

Web search and fetch, `browse` (inspect a reference page: how it is built, asset types, sizes), research-tool MCPs when present, `cstack flows`, `cstack route`, `cstack spend plan`.

## Process

1. **Target.** Write `target`: description, reference refs, musts, must-nots, quality bar. Decompose the outcome into its parts (asset, motion, surface, delivery).
2. **Reverse-engineer the reference** when there is one: what it is made of and how (for a web page, `browse snapshot` + `media`; for an image or film, `shot-dna`). Name the mechanism, not the look.
3. **Benchmark.** For each part: current models and tools (with dated docs and prices), MCP-first and YC companies doing it, and practitioner flows actually posted with results (X, Instagram, YouTube breakdowns, public repos). Record each as `evidence` with kind and date.
4. **Candidates.** At least two complete flows, including one that is mostly deterministic (real assets, compositing, code) and one that leans generative. For each: steps, cost, latency, where product truth could break, what the owner must supply.
5. **Choose.** Pick by closeness to the target first, then reliability, then cost. Record rejected candidates and why (`candidates_considered`).
6. **Write the flow** (`flow` schema): every step has `kind`, `tools` in preference order with fallbacks, a `gate`, `compare_to_target`, and an estimate; plus `cost_ladder` (probe → selection → final) and `failure_modes`. Generic flows go to cstack `flows/` (no brand material); brand-specific ones to the workspace `flows/`.
7. **Plan the run**: `cstack flows plan <id> --target "..."`, show it to the owner with the spend estimate, then hand off.

## Decision rules

- Deterministic beats generative whenever it can be exact (real product renders, composited labels, code-driven motion).
- Probe the riskiest step first, cheaply, before building the rest.
- A step without a gate is not a step; a gate without a checker that exists is not a gate.
- When evidence conflicts, keep both and say which the flow follows and why.
- Never name a brand, person or studio inside a generation prompt; carry the mechanism.

## Outputs, files written, state updated

- `flows/<id>.flow.yaml` (cstack, generic) or `<workspace>/flows/<id>.flow.yaml` (brand-specific), `work/flows/<date>-<id>.flow.yaml` (the run's plan).
- `state/learnings.jsonl` entries for surprising findings (`cstack learn add`).

## Evals required

- T0: flows validate against the schema; steps name real skills (`cstack validate`).
- Fixture: `one-shot-temptation.yaml` (a big outcome asked in one line must produce a target, two candidates and a stepped plan before any paid call).

## Handoff

`workflow` (run it), `model-router` (per-step model choice), `generate-media`, `three-d`, `video-direction`, `mockup`, `vector-mark`, `learn` (close the loop).

## Failure modes

- One-shotting: jumping to a final render without a method.
- Copying the first tutorial found; one practitioner is not a benchmark.
- A flow that ignores what the owner can actually supply (no product scan, no 3D file).
- Research that never ends: research to decision, then make.

## Examples

Outcome: "the product slowly rotating as you scroll, like a premium homepage". Target: reference page, musts (label legible, under 3 MB, 60 fps on mid phones), must-not (warped label). Candidates: (A) real-product photogrammetry or CAD → cleaned GLB → web runtime with scroll-linked rotation; (B) generated 3D model with composited label texture; (C) image-sequence turntable from a 36-frame photo or render set. Chosen: C for launch (exact label, cheapest, no 3D skills needed), A as v2. Plan: probe 12-frame sequence first, check label at every angle, then 36 frames.
