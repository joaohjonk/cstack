# Gap analysis (master prompt section 2)

Three columns per dimension: what the **prior local system** had (the private client brand system described, anonymized, in [local-learning-migration.md](local-learning-migration.md)), what the **state of the art** shows in public evidence ([startup-landscape.md](startup-landscape.md), [public-repo-patterns.md](public-repo-patterns.md), [gstack.md](gstack.md), [taste-labs.md](taste-labs.md), [model-landscape.md](model-landscape.md), [agent-skills.md](agent-skills.md)), and what **cstack v0.1** now has. The last two columns are the gap that remains and its class.

Classes: **critical** (wrong or unsafe output without it), **high leverage** (large quality or cost effect per unit of work), **useful**, **later**.

Written after the v0.1 build, so "cstack v0.1" is measured, not planned. Original pre-build gaps are visible in the prior-system column.

| # | Dimension | Prior local system | State of the art | cstack v0.1 | Remaining gap | Class |
|---|---|---|---|---|---|---|
| 1 | Brand ingestion | manual canon files, no importer | Gooseworks contracted research packs; Lapis/Bloom extracted kits as "reviewable starting point"; Taste Labs extract | `brand-import` skill, `browse tokens` computed styles as `extracted_pattern`, Taste extract adapter, `brand set` with precedence | no stub-rejecting import manifest; extraction not yet run on a real brand through cstack | critical |
| 2 | Structured brand representation | rich markdown canon + YAML rules, one brand only | Bloom brand object (thin); Gooseworks typed facts with proposal vs correction | 50-section `brand-system.json` with field-level provenance, approval status, gaps, conflicts; brand world entities; DTCG tokens; brand rules | no `proposals/` queue separating agent proposals from owner corrections (proposal is approval `provisional` only) | high leverage |
| 3 | Taste / reference retrieval | reference images as inputs, no index | Taste Labs search/extract/verify; Bloom library retrieval; Refero/Mobbin MCPs | `taste-search` with near/middle/far, Source→Mechanism→Transfer records, removal test, research-tool detection, Taste adapter | no semantic index over a workspace's own references; top-k retrieval is manual | high leverage |
| 4 | Cultural intelligence | none recorded | mostly marketing claims; Shortimize/Foreplay data | `cultural-scan` with dated signals, stages, permission rule, five culture mechanisms scoring | no signal expiry automation; never field-tested | useful |
| 5 | Strategic positioning | strong written positioning, hand-made | office-hours style reframing (gstack) | `office-hours` brief schema, `creative-direction` three territories + rejection list | no positioning-specific fixture beyond office-hours cases | useful |
| 6 | Verbal identity | voice rules + lint for banned words | brand-voice plugins; rule-based lints | `copywriting` modes + separate QA pass; voice sections in brand state | no deterministic copy lint (banned terms, reading level) in the CLI; copy judging still self-judged in practice (migration unresolved #3) | high leverage |
| 7 | Identity systems | tokens in code, lint | DTCG 2025.10; Figma variables | `identity-system`, DTCG check/build/raw-color lint, brand-rules | no logo-usage geometry checks; no Figma variables sync | useful |
| 8 | Typography | rules in prose, a lint for sizes | type judged by hierarchy and rhythm, not font choice | type tokens, hierarchy section, `browse tokens` reads computed type | no deterministic type-scale or measure checks on rendered pages | useful |
| 9 | Grid / layout | page templates | grid systems canon; layout QA in browsers | grid section, `browse qa` overflow at breakpoints, canon (Swiss grid, Vignelli) | no grid-conformance check on rendered output | later |
| 10 | Art direction | shot briefs, iterations with owner | entities + reference sets (Ad Army, Recraft, Palette) | `shot-dna`, `campaign-sequence`, brand-world entities, lighting lint | entity reference sets not yet compiled to provider style ids | high leverage |
| 11 | Photography | eight image-system iterations, hard-won rules | real-photo craft vocabulary; vision-compare checks (Krea) | Shot DNA with named lighting recipe, controlled imperfection, lint for adjective-only lighting | no photographic craft fixture with real images and owner grades | high leverage |
| 12 | Product photography / pack shots | composite official print, alpha checks, scale decisions | deterministic compositing (Superside nodes) | `product-fidelity`, `image-edit` with composite-first rule, `region_paste`, size audit | no automated pack-drift metric (SSIM/LPIPS vs master) | critical |
| 13 | Generative image workflows | logged runner, spend log, sidecars | Runway router with dryRun; Figma Weave acknowledged cost; fal queue | `prompt-director`, `model-router`, `generate-media`, `guardedCall` (dedupe, pending, budget), sidecars, ledger | only fal and mock are live adapters | high leverage |
| 14 | Image editing | crop-and-paste fixes, keep the before file | region edit models; masks | `image-edit` crop → edit → paste-back → match; local paste tool | no automated diff-against-liked-raw check before replacement | high leverage |
| 15 | Video / motion | none logged | Runway, Kling, Veo via fal; motion from approved stills | registry entries + routing; "motion only from approved stills" rule | no video workflow, no motion fixture | later |
| 16 | Model routing | hand-picked models | Runway Model Router, Palette capability gates | dated registry (45 models, unit costs, status), cost-aware router with staleness, micro-benchmark convention | registry refresh is manual; 8 entries already stale | high leverage |
| 17 | Campaign ideation | hand-made, owner-led | territories + mutation (various) | `creative-direction`, `campaign` workflow | no campaign fixture graded by an owner | useful |
| 18 | Campaign sequencing | implicit | rarely explicit in market | `campaign-sequence` shot roles and channel crops | untested on a full campaign | useful |
| 19 | Ad creative | none | Ad Army recipes; Foreplay | `paid-social` workflow, competitor-intel ad capture | no ad-specific skill (hooks, formats) beyond copywriting + sequence | useful |
| 20 | Performance feedback | designed, never fed | GetCrux parameter tagging; ads loops (marketing claims) | `creative-performance` schema; paid-social workflow step | no creative-parameter taxonomy, no ingestion; minimum-data thresholds unwritten | later |
| 21 | Competitor intelligence | ad hoc | Particl, BuiltWith, Store Leads, marketplace tools | `competitor-intel` with observation vs inference, dated corpus, tool detection | no refresh scheduling | useful |
| 22 | Landing pages / PDPs | built pages with lint | Uplane ad + page as one unit | `landing-page` workflow, `browse qa` gates, tokens build/lint | no page-generation skill of its own; relies on the host agent's coding | useful |
| 23 | Decks | none | Figma Slides, docs tools | `deck` workflow template | no deck skill or renderer | later |
| 24 | Packaging | rules for print, owner decisions | dieline-aware tools are rare | `packaging` workflow, claims-proof, composite-first rule | no dieline/bleed/safe-zone checker | useful |
| 25 | Brazil ANVISA compliance | handled by people | primary sources only (ANVISA RDCs) | `claims-proof` requires current primary sources per jurisdiction and marks uncertainty | no encoded rule set or citation cache; every run re-researches | high leverage (for brands selling in Brazil) |
| 26 | US FDA compliance | handled by people | primary sources (21 CFR, FTC guidance) | same as above | same as above | high leverage (for US food/supplement/cosmetic brands) |
| 27 | Brand verification | validator, hard gates, judge queue | Taste Labs verify; Krea eval suites | `brand-verify`: deterministic gates → verifier → fix → re-verify → human; eval records with evidence | verifier not calibrated against owner pairwise picks | critical |
| 28 | Aesthetic verification | AI judge disagreed with owner | LLM verifiers with scores | `creative-review` separate axes, baseline, disagreement visible; AI judge never the owner (fixture) | calibration dataset does not exist yet | high leverage |
| 29 | Factual / product fidelity | measured vs inferred sizes lesson | vision compare (Krea) | `product-fidelity` audit, UNKNOWN discipline | no measured-dimension field enforcement in schemas | critical |
| 30 | Provenance / versioning | git + sidecars | rare in market | field-level provenance, lineage creative commits, recipe hashes, stale-artifact detection | lineage not yet auto-written by `generate` | useful |
| 31 | Human feedback | pick lists in markdown, zero pairwise records | Gooseworks corrections | `feedback-event` schema with pairwise reasons, `cstack feedback` | no UI for quick picks; capture depends on the agent | high leverage |
| 32 | Retros / institutional learning | strong change log, red team, build reports | gstack learnings resolver | `learn` skill, learning events, candidates, promote with targets, failure taxonomy | promotion is manual; no weekly retro automation | useful |
| 33 | Portability to other brands | three portability tests inside one repo | gstack-style install per project | brand-agnostic repo, workspace template, `setup` for six hosts, denylist check | no second real brand has run through it yet | critical |
| 34 | Skill discoverability / metadata | none (one brand) | goose-skills index + validator; Agent Skills spec | `skill.meta.json`, generated index, `cstack search`, validate fails on drift | trigger evals (does the right skill fire) not automated | useful |
| 35 | Context efficiency | full canon loaded per session | gstack preamble resolvers; prompt caching | context budgets + ratchet, cache-stable `brand context` with sections | no measurement of real session token use | useful |
| 36 | Generation cost efficiency | about $70 logged, one duplicate-billing lesson | Figma Weave quote, Runway dryRun | budget 0 by default, spend plan with stop condition, dedupe, pending re-attach, cost ladder | unit costs heuristic for token-priced models | high leverage |
| 37 | Experiment reproducibility | iterations in folders | Karpathy autoresearch (fixed budget, keep/discard) | `experiment init/log/status`, results.tsv, frozen fixture rule | no T2 runner that executes fixtures automatically | high leverage |
| 38 | Static vs paid eval coverage | strong static checks | Krea two-layer evals | T0/T1 in CI (validate, budgets, 50+ tests), T2–T4 fixtures with diff-aware selection | T2–T4 fixtures are specifications; no runner yet | critical |
| 39 | Durable recent-learning migration | lessons in change log only | rarely done | migration note: 77 promoted, 12 provider notes, about 75 kept private, 5 unresolved; Do Not Relearn list | owner has not reviewed the promotions | useful |
| 40 | Secrets / provider safety / observability | key-handling notes outside the repo | env-only credentials; MCP OAuth | env-only keys, credential lint, job IDs not keys, browser origin lock and mutation guard, untrusted-content rule, ledger | no tracing of agent tool calls; no per-provider rate-limit handling | useful |

## Counts

critical 6 · high leverage 14 · useful 16 · later 4 (the two compliance rows are high leverage only for brands in those markets).

## Build order by dependency

Ordered by what unblocks what, not by excitement. What v0.1 already built is listed first for the record.

**Done in v0.1 (foundation):** schemas and provenance (2, 30) → brand workspace and setup (33) → skill metadata, index and budgets (34, 35) → cost ledger and guarded calls (36, 40) → model registry and router (16) → reference model with distance and mechanisms (3) → skills and workflows → static evals and diff-aware plan (38 T0/T1) → browser layer (1, 22).

**Next, in order:**

1. **T2 fixture runner (38, 37).** Everything below needs a way to run a fixture with a model in the loop and record the eval. Without it the fixtures are specifications.
2. **Owner pairwise capture made cheap (31).** A contact-sheet page or CLI that turns picks into `feedback-event` records. Calibration (28, 27) is impossible without this data.
3. **Real-brand portability run (33, 1).** One real brand imported end to end in its own repo, through cstack only. Exposes ingestion and template gaps before more skills are built.
4. **Deterministic product-drift and edit-diff checks (12, 14, 29).** SSIM/LPIPS-style comparison against masters and liked raws; measured-dimension fields required before pack work.
5. **Verifier calibration (27, 28).** Needs 2 and 1. Measure judge agreement with owner picks; only then let a verifier gate anything taste-related.
6. **Proposal queue for brand state (2).** Agent proposals separated from owner corrections with readback.
7. **Copy lint (6).** Deterministic voice checks before the copy reviewer.
8. **Compliance citation cache (25, 26).** Per-jurisdiction primary-source snapshots with dates, consumed by `claims-proof`; still marks uncertainty and routes to a human.
9. **More live adapters and registry refresh (13, 16).** Driven by what the router actually needs on real runs.
10. **Workspace reference index (3).** Top-k retrieval once libraries are large enough to need it.
11. **Performance taxonomy and ingestion (20, 19).** After a real campaign exists to feed it.
12. **Video, decks, packaging checkers (15, 23, 24).** Specialist modules last.
