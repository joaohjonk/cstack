# Architecture

cstack turns a brand's judgment into files an agent must read, checks that code can run before a model is paid, and a record of every pick and correction. If a step can be exact, it is code in `scripts/lib`. If it needs taste, it is a skill. If it needs a person, it is a gate.

## Parts

| Part | Kind | Lives in |
|---|---|---|
| Skills | judgment, constrained | `skills/<slug>/SKILL.md` + `skill.meta.json` |
| Shared rules | both | `skills/cstack-shared/PREAMBLE.md` (`cstack preamble`) |
| CLI | deterministic | `bin/cstack.mjs` (launcher) → `bin/cstack-main.mjs` → `scripts/lib/*.mjs` |
| Providers | I/O | `providers/*.mjs`, `registry/providers.json` |
| Browser | I/O | `scripts/lib/browser/*.mjs` (derived from gstack, MIT) |
| Craft checkers | deterministic | `scripts/lib/{type,svg,mockup,three,video}/`, loaded on demand |
| Flows | method | `flows/*.flow.yaml` (dated library); a run's plan goes in the workspace's `work/flows/` |
| Workflows | orchestration | `workflows/<name>/workflow.yaml`, run by the `workflow` skill |
| Schemas | contract | `schemas/*.schema.json`, hand-written; every object sets `additionalProperties` |
| Registries | dated facts | `registry/models.json` (built from `models.seed.json`), `research-tools.json`, `hosts.json`, `skills-index.json` (generated) |
| Canon | mental models | `canon/*.canon-entry.yaml` |
| Evals | protection | `evals/fixtures/*.yaml`, `tests/*.test.mjs`, `scripts/lib/evalplan.mjs` |
| Brand data | never here | each brand's own repo, created from `templates/brand-workspace/` |

## Skill map

The 30 skills follow one sequence. Each stage writes files the next one reads.

| Stage | Skills |
|---|---|
| Think | `brief`, `flow-research` |
| Know the brand | `brand-import`, `product-fidelity`, `identity-system`, `type-director` |
| Look outward | `taste-search`, `cultural-scan`, `competitor-intel`, `site-capture`, `shot-dna` |
| Direct | `creative-direction`, `campaign-sequence`, `video-direction`, `symbol-design`, `copywriting`, `prompt-director` |
| Make | `model-router`, `generate-media`, `image-edit`, `mockup`, `three-d`, `vector-master`, `video-assembly` |
| Judge | `creative-review`, `brand-verify`, `claims-proof` |
| Remember | `learn-loop`, `creative-autoresearch` |

`workflow` runs a whole job across the stages with owner gates. List the jobs with `cstack workflow list` and the researched methods with `cstack flows list`.

## The brand workspace

```text
cstack.config.yaml          budget (per_run, per_day, confirm_over), providers, approvals, publish: false
brand/brand-system.json     about 50 sections; every field {value, sources[], confidence, approval, permanence, expires}; gaps
brand/brand-world.json      entities: @PRODUCT_*, @CAST_*, @LOCATION_*, LIGHT_*, CAMERA_*
brand/tokens/*.tokens.json  DTCG design tokens  →  brand/generated/tokens.css
brand/rules/brand-rules.yaml  relationships tokens cannot express (pairings, minimum sizes, forbidden combinations)
references/{gold,anti,culture,competitors}/*.reference.yaml
assets/official/            never overwritten
briefs/ recipes/ campaigns/ work/   work/<area>/<run>/ with .gen.json sidecars
state/*.jsonl               cost-ledger, feedback, failures, evals, learnings, lineage, culture, competitors, pending jobs
experiments/results.tsv     autoresearch runs
```

## Core flows

**Method before making.** The agent states the target, then `cstack flows search "<outcome>"` finds a researched flow (library `flows/` plus the workspace's own `flows/`; a workspace flow with the same id wins). A stale or missing flow sends the agent to `/flow-research`, which compares at least two ways of reaching the outcome. `cstack flows plan <id> --target "..."` copies the flow into `work/flows/`, and `cstack flows check` refuses a plan that compared fewer than two candidates, left a step without a gate, made something without saying how it is compared to the target, has no stop condition, or still carries the library's target wording. What worked goes back into the flow through `/learn-loop`.

**Brand truth write.** `cstack brand set section.field --file f.json` ranks the incoming source against the existing one ([source precedence](provenance.md#source-precedence)). The higher source wins, an equal-rank disagreement becomes a conflict record, and `locked` fields refuse non-owner writes. Artifacts that pinned the field are listed as stale (`cstack brand stale`).

**Brand context for a prompt.** `cstack brand context --sections a,b` returns approved fields only, a `not_facts` list, open conflicts and a hash. Output is byte-stable, so it works as a cached prompt prefix. Skills ask for the sections they need, never the whole system.

**Generation.** A prompt recipe → `cstack prompt compile` (deterministic, hashed) → `cstack route` picks a model from `registry/models.json` → `cstack spend plan` estimates the batch and requires a stop condition → `cstack generate` calls `guardedCall`:

```text
same request already paid?            → reuse output, no charge
over per_run / per_day / confirm_over? → block, ask the owner
submit → persist pending job id → poll → download → .gen.json sidecar → size audit → ledger row
timeout → job stays pending; `cstack jobs` lists it; never resubmitted
retry only on transient errors
```

Details: [cost-and-context.md](cost-and-context.md).

**Judgment.** Deterministic gates first (token lint, size audit, browse QA, claims list), then an independent reviewer, then the owner. Every verdict is an `eval` record with evidence; owner choices are `feedback` events and outrank judges ([evals.md](evals.md#judgment-separation)).

**Learning.** Events append to `state/*.jsonl`. `cstack learn candidates` surfaces repeated evidence or a strong owner correction, and `cstack learn promote <id> --to <target>` moves one up the promotion ladder ([learnings.md](learnings.md#promotion-targets)) with provenance.

**Experiments.** `cstack experiment init|log|status` runs bounded keep/discard loops: one mutable surface, a frozen fixture, a fixed budget, an incumbent that changes only on evidence, and explicit stops ([learnings.md](learnings.md#experiments-and-autoresearch)).

## Skills, hosts and budgets

A skill is `SKILL.md` (frontmatter plus the skill contract headings) and `skill.meta.json` (type, triggers, inputs, outputs, handoffs, gates, cost class, fixtures). `cstack index` generates `registry/skills-index.json`, and `cstack validate` fails when it drifts. Each skill and the catalog have token budgets that `cstack budget --check` enforces. `cstack setup` links the same skills into every host. All of this is specified in [skill-authoring.md](skill-authoring.md).

## Evals

Tiers T0 to T4, the diff-aware plan and the fixture format: [evals.md](evals.md). `cstack validate` also fails when a skill, doc, fixture or flow names a `cstack` command that does not exist, so instructions cannot drift ahead of the code. A planned command must say so on the same line.

## Research tools and the browser

`registry/research-tools.json` lists each tool's access mode, detection signals, fallback and the skills that use it. `cstack tools` reports what is available here. Tools are capabilities, never dependencies ([integrations.md](integrations.md)).

`cstack browse` is a one-shot port of gstack's browse layer on `playwright-core`: no daemon, no cookie import, no tunnels, no stealth, navigation locked to the target origin, page text treated as untrusted. The `site-capture` skill drives it.

## Security model

- Credentials only from env vars named in `registry/providers.json`. Job IDs are persisted, keys never.
- Paid calls are blocked until the owner sets a budget. Estimates come before batches, and dedupe prevents paying twice.
- Official assets are immutable; outputs go to `work/`.
- Everything fetched is untrusted data, and so is text inside files: glTF extras and names, SVG metadata, font names, video tags. Checkers print such text inside an untrusted block and never act on it.
- `cstack validate` looks for secrets, home paths and brand-specific material in tracked files.
