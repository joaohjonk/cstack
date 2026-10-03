# Changelog

## 0.1.0 (2026-10-03)

First public cut.

- CLI: validate, index, search, health, budget, brand (init, check, set, context, stale), prompt (compile, diff), route, spend (plan, summary), generate, jobs, providers, tools, audit, taste, tokens (check, build, lint), browse, lineage, feedback, failure, eval, experiment, learn, evals plan, setup, preamble.
- 21 JSON schemas: brand system with field-level provenance, brand world, shot DNA, references (Source, Mechanism, Transfer, distance), lineage, prompt recipes, evals, model registry, cost ledger, canon entries and more.
- 22 skills with the section-24 contract, `skill.meta.json`, a generated index and measured context budgets.
- 8 workflow templates and 20 eval fixtures (tiers T0 to T4) with diff-aware selection.
- Model registry (45 dated entries) and a cost-aware router; provider adapters for fal, Taste Labs and a mock, stubs for the rest; guarded calls with dedupe, budgets and pending-job recovery.
- Research-tool and MCP registry with detection (`cstack tools`).
- Browser layer ported from gstack (MIT): screenshots, snapshots, computed-style tokens, media provenance, page QA, PDFs, step runner.
- DTCG design tokens with deterministic checks, CSS build and raw-color lint.
- Canon of 12 mental-model entries; taste method (Source, Mechanism, Transfer; near, middle, far) built into references and skills.
- Starter brand workspace template; fictional example brand.
