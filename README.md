# cstack

An open, git-native operating system for brand and creative work, run by AI agents.

cstack is to brand work what [gstack](https://github.com/garrytan/gstack) is to shipping software: a set of composable skills, a small CLI, and files in git that let an agent (Claude Code, Codex, Cursor, Gemini CLI, OpenCode) work like a disciplined studio instead of a prompt box. You install it once and use it for any number of brands. Each brand keeps its own workspace in its own repo; cstack itself holds no brand's data.

> Status: v0.1, beta. The foundation, 30 skills, 11 workflow templates, 14 researched flows and the eval suite exist and pass their static checks. Workflows are `template` and flows `researched` until proven on a real run. See [docs/retro.md](docs/retro.md) for what is still weak.

## Why it exists

Generative tools made making things cheap. They did not make judgment cheap. Most AI brand work fails the same few ways: it ignores what the brand already decided, invents where it should retrieve, prompts with adjectives, drifts from the real product, grades its own homework, and forgets every lesson by the next session.

cstack's answer is structure, not longer prompts:

- **A brand is infrastructure, not a PDF.** Brand state lives in versioned files with field-level provenance (who said it, how sure, approved or not).
- **Context before generation, retrieval before invention.** References are stored as mechanisms ("what makes this work and how it transfers"), not as looks.
- **Method before making.** Before an outcome is attempted, the agent finds or researches the best current flow for it (tools, models, practitioner methods), compares candidates, and works step by step against a stated target. Nothing big is one-shot.
- **Deterministic before generative, cheap before premium.** Tokens, lints and crops before models; probes before finals; a budget and a stop condition before any batch.
- **Verification is a stage, and the maker never certifies its own work.** Beautiful, on-brand, culturally alive, effective and correct are separate judgments.
- **The owner's taste is sovereign.** Picks, kills and edits become preference data; repeated evidence becomes durable rules.

## Install

Requires Node 20+.

```bash
git clone https://github.com/joaohjonk/cstack ~/cstack
cd ~/cstack && ./setup            # npm install + install skills into your agent hosts
# or: npm install && node bin/cstack.mjs setup --host default
```

`setup` links the skills into `.agents/skills` and `.claude/skills` by default; `--host all` adds Codex, Cursor, Gemini CLI and OpenCode (see `registry/hosts.json`). `playwright-core` is optional and only used by `browse`. Put `bin/` on your PATH or alias `cstack="node ~/cstack/bin/cstack.mjs"`.

Provider credentials are read from environment variables only (for example `FAL_KEY`, `TASTE_API_KEY`). cstack never writes them to disk. Spend is blocked by default: a new workspace has a budget of 0 until you raise it.

## First 10 minutes

```bash
cstack brand init ~/brands/acme --name "Acme"    # a brand workspace (its own git repo)
cd ~/brands/acme
cstack brand check                               # what is known, unknown and in conflict
cstack tools --mcp "Figma,Refero"                # which research tools you actually have
cstack providers                                 # which media providers are usable here
```

Then, in your agent, start here:

```text
1. install                    ./setup
2. /office-hours              reframe the ask, write the brief
3. /brand-import              existing brand  (or: /workflow create-brand for a new one)
4. /creative-direction        three territories, one recommendation, a rejection list
5. /workflow <name>           campaign, product-photoshoot, landing-page, paid-social, packaging, deck
6. /creative-review           independent lenses, disagreement kept visible
7. /brand-verify              deterministic gates, then a verifier, fix, re-verify, human
8. /learn retro               promote only durable learnings
```

A fully worked fictional brand lives in [examples/lumen-field](examples/lumen-field) if you want to look before you start.

## Example commands

```bash
cstack search "product photoshoot"                       # find the right skill
cstack flows search "rotating 3d product on the homepage" # the researched method for an outcome, before making
cstack flows check work/flows/*.flow.yaml                 # the plan compared options, gates every step, has a stop
cstack brand context --sections voice,color               # compact, cache-stable facts for a prompt
cstack taste search "a ritual that feels choreographed"   # Taste Labs, when TASTE_API_KEY is set
cstack route --modality image --needs image-edit,text-rendering
cstack prompt compile recipes/hero.recipe.yaml --seed 7
cstack spend plan batch.json --stop "2 of 4 probes fail fidelity"
cstack generate --file request.json --dry-run
cstack browse qa http://localhost:4173                    # overflow, alt text, contrast at 375/768/1440
cstack tokens check && cstack tokens build
cstack type qa http://localhost:4173                      # measure, leading, caps, contrast, fallbacks per breakpoint
cstack svg lint brand/icons --grammar brand/tokens/icons.tokens.json
cstack mockup render --template t/can --art label.svg --out can.png && cstack mockup verify --template t/can --art label.svg --render can.png
cstack 3d inspect model.glb --budget web-hero              # bytes, triangles, textures, scale, origin
cstack video qa master.mp4 --product-ref still.png --roi 380,600,320,420
cstack evals plan --since main                            # only the evals your diff can break
cstack health                                             # skill validity, budgets, staleness
```

`cstack help` lists everything.

## Mental model

Nine layers, from the world inward and back out (the full picture is in [docs/architecture-one-page.md](docs/architecture-one-page.md)):

```text
reality → culture → canon → references → system → generation → judgment → memory → compounding taste
```

Three kinds of files do the work:

| Layer | Where | What it is |
|---|---|---|
| Skills | `skills/*/SKILL.md` + `skill.meta.json` | How to do one job well, with a fixed contract (inputs, missing-input behavior, precedence, process, outputs, evals, handoff, failure modes) |
| Brand workspace | your brand repo (`cstack brand init`) | Brand state with provenance, tokens, world entities, references, briefs, recipes, ledgers |
| Registries | `registry/`, `canon/`, `schemas/` | Dated model registry, research tools, hosts, canon of mental models, JSON schemas for everything |

The CLI is the deterministic part (validation, routing, budgets, lineage, tokens, browsing). The agent is the judgment part, constrained by the skills.

## Skill map

| Stage | Skills |
|---|---|
| Think | `office-hours`, `creative-direction`, `flow-research` |
| Know the brand | `brand-import`, `identity-system`, `type-director` |
| Look outward | `taste-search`, `cultural-scan`, `competitor-intel`, `browse` |
| Art-direct | `shot-dna`, `campaign-sequence`, `product-fidelity`, `video-direction` |
| Marks | `symbol-design`, `vector-master` |
| Make | `prompt-director`, `model-router`, `generate-media`, `image-edit`, `copywriting`, `mockup`, `three-d`, `video-assembly` |
| Judge | `creative-review`, `brand-verify`, `claims-proof` |
| Improve | `learn`, `creative-autoresearch` |
| Orchestrate | `workflow` |

The spec asked for 15–20 excellent skills; v0.1 shipped 22 (`browse` and `workflow` are infrastructure the others lean on). The owner then asked for 3D, mockups, marks and vector, AI video, deeper typography and a method-first rule, which added eight skills, each with its own job, triggers and deterministic checker. Skills that never fire on real runs get merged ([docs/retro.md](docs/retro.md)). Each fits its context budget (`cstack budget --check`).

## Method before making

Every skill starts by naming the target (a reference, musts, must-nots) and looking up how that outcome is best made today: `cstack flows search "<outcome>"` returns researched flows with candidates considered, steps, gates, a cost ladder, failure modes, evidence and a staleness date. `cstack flows plan <id>` copies one into the workspace as this run's plan, and `cstack flows check` refuses a plan that compared fewer than two ways of getting there, left a step without a gate or a comparison to the target, or has no stop condition. The agent then works step by step, comparing each step's output against the target. No fresh flow means `/flow-research` first. Library flows cover typography, product 3D (web hero, packshot, turntable, AR), mockups, logos, icon sets and video (product hero, brand film, cut-downs, presenter ads, logo stings, explainers).

## Workflows

`/workflow <name>` runs a resumable plan with owner gates and a tracker in `work/plans/`:

`create-brand` · `import-brand` · `campaign` · `product-photoshoot` · `paid-social` · `landing-page` · `packaging` · `deck` · `product-3d` · `product-video` · `logo-system`

Definitions are in [workflows/](workflows). Every step names its skill, inputs, outputs, gate and fallback when a tool or provider is missing.

## Integrations

- **Research tools and MCPs.** cstack knows Taste Labs, Cosmos, Refero, Mobbin, Ecomm.Design, Baymard, Particl, BuiltWith, Store Leads, Helium 10, SmartScout, Nexscope, Foreplay, Shortimize, Really Good Emails, Figma and Shopify's MCPs, plus making tools for 3D (Blender, Spline, Needle, Meshy, Tripo, glTF Transform), mockups and vector (Dynamic Mockups, Recraft, Adobe, Canva, Pacdora, vectorizers), video (fal, Higgsfield, HeyGen, Replicate, Runway, HyperFrames) and type (Google Fonts, Adobe Fonts, foundry trials, Fonts In Use, Typewolf, Wakamai Fondue, fontTools). It detects which ones you have (`cstack tools`). None is required; every one has a fallback. Tools whose terms bar automated agents are used only through your own exports or by you.
- **Deterministic checkers.** `cstack type`, `svg`, `mockup`, `3d` and `video` measure the things models get wrong (type on rendered pages, mark reduction and icon grammar, label pixels after a mockup, web and AR budgets, drift and loudness in video). Video needs `ffmpeg` on your machine; cstack never installs it.
- **Browser.** `cstack browse`, ported from gstack's browse layer (MIT, see [NOTICE.md](NOTICE.md)), as one-shot commands with an origin lock and mutation guard.
- **Media providers.** fal (many image/video models), Taste Labs, a mock provider for tests, and stubs for the rest, all behind one guarded call with dedupe, budgets and pending-job recovery.

Details: [docs/integrations.md](docs/integrations.md).

## How to add a brand

`cstack brand init <dir> --name "Brand"` creates the workspace from [templates/brand-workspace](templates/brand-workspace). Then run `/brand-import` (existing brand) or `/workflow create-brand` (new one). Official assets go in `assets/official/` and are never overwritten. The workspace is the brand's own repo; nothing in it flows back into cstack.

## How to add a provider

Write an adapter in `providers/` that implements the interface in `providers/index.mjs`, read credentials from env vars only, return job IDs for async work, and register it in `registry/providers.json`. Add its models to `registry/models.json` with a dated source and price snapshot. All calls go through `guardedCall`, so dedupe, budgets and the ledger come for free. See [docs/integrations.md](docs/integrations.md).

## How to author a skill

Copy an existing skill, keep the contract headings `cstack validate` requires, fill `skill.meta.json`, add at least one fixture in `evals/fixtures/`, then `cstack index && cstack validate && cstack budget --check`. See [docs/skill-authoring.md](docs/skill-authoring.md).

## How learning works

Corrections, pairwise picks, failures and provider quirks are appended to the workspace's `state/*.jsonl`. `cstack learn candidates` shows learnings with repeated evidence or a strong owner correction; `cstack learn promote` moves one into a durable home (brand state, a rule, a skill, a fixture) with its provenance. Brand-specific learnings stay in the brand's repo; only general mechanisms are proposed upstream to cstack. See [docs/learnings.md](docs/learnings.md).

## Docs

[Architecture on one page](docs/architecture-one-page.md) · [Architecture](docs/architecture.md) · [Philosophy](docs/philosophy.md) · [Quickstart](docs/quickstart.md) · [Provenance](docs/provenance.md) · [Cost and context](docs/cost-and-context.md) · [Evals](docs/evals.md) · [Learnings](docs/learnings.md) · [Research notes and gap analysis](docs/research/) · [Retro](docs/retro.md) · [v0.2 backlog](docs/backlog-v0.2.md)

## License

MIT. Parts of the browser layer derive from gstack (MIT, Copyright (c) 2026 Garry Tan); see [NOTICE.md](NOTICE.md).
