# {{BRAND_NAME}} brand workspace

Created by `cstack brand init` on {{DATE}}. This is the brand's own repository. cstack (the tool) stays generic and never contains this folder.

| Path | What lives here | Who writes it |
|---|---|---|
| `cstack.config.yaml` | budget envelope, provider choice, approval rules | the owner |
| `brand/brand-system.json` | sourced brand truth: every field has value, sources, confidence, approval | `/brand-import`, `/workflow create-brand`, `cstack brand` (never by hand-waving) |
| `brand/brand-world.json` | recurring entities (products, cast, locations, surfaces, light) with immutable traits | `/brand-import`, `/product-fidelity` |
| `assets/official/` | logos, packaging masters, approved product photos. **Never overwritten.** | the owner |
| `references/gold`, `anti`, `culture`, `competitors` | references with rights, transferable mechanism and do-not-copy notes | `/taste-search`, `/shot-dna`, `/cultural-scan` |
| `briefs/`, `campaigns/` | creative briefs and campaign sequences | `/office-hours`, `/campaign-sequence` |
| `recipes/` | versioned prompt recipes with slots | `/prompt-director` |
| `work/` | generated outputs, each with a `.gen.json` lineage sidecar | provider runner |
| `state/*.jsonl` | approvals, feedback, learnings, failures, evals, cost ledger, lineage | cstack CLI and skills |
| `experiments/` | autoresearch runs and `results.tsv` | `/creative-autoresearch` |

Start: `cstack brand check`, then run `/brand-import` or `/workflow create-brand` in your agent.
