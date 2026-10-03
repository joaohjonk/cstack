# Startup landscape: creative-AI companies, checked against their public repos

Researched 2026-10-03. This note covers the YC companies in the creative-AI space and the non-YC creative tooling that matters most for cstack. I searched each company's public GitHub presence **before** relying on product copy. GitHub searches went through the GitHub MCP search API. Repos were shallow-cloned into `research-src/<owner>_<repo>`.

**Evidence labels** (used in every table):
- **architecture-seen**: I read code, schemas, tests or CI in a public repo.
- **interface-seen**: I saw a public API/OpenAPI spec, MCP tool list or tool schemas, but not the internals.
- **UI-observed**: a third party documented the live product UI. This is not code.
- **marketing-claim**: only the company's site, YC page or launch post. Not verified.

Gooseworks, Superside and Higgsfield repos get a deep-dive in `public-repo-patterns.md` (another worker). Here I only summarize them and point to that note. The exceptions are two Gooseworks repos not covered elsewhere (`gooseworks-ai/gooseworks`, `gooseworks-ai/gooseworks-ads`), which I cover briefly because they show the brand-memory contract.

---

## Summary matrix

| Company | Public repo? | Evidence quality | Single most borrowable mechanism |
|---|---|---|---|
| Bloom (S26) | No official repo. A third-party API profile exists | interface-seen | Brand as a callable resource with lifecycle states (`analyzing / ready / logo_required / failed`) plus a separate image library you search for references |
| Ad Army (S22) | No official repo. A third-party UI recon skill exists | UI-observed + marketing | Pipeline validation that blocks publishing (unreferenced input, more than one start node); manual-review vs auto-advance per action step |
| Gooseworks (W23) | Yes, substantive | architecture-seen | `agent_proposal` vs `user_correction` writes to brand memory, with readback required |
| GetCrux (W24) | No | marketing-claim | Tagging ads by creative parameters → weekly brief |
| Lapis (F25) | YC links `github.com/trylapis`, but it is not resolvable/visible | marketing-claim | Extracted brand kit is a "reviewable starting point", not truth |
| Uplane (F25) | No (`Uplane/uplane-ui` is an unrelated 2023 design system) | marketing-claim | Ad and matching landing page generated as one unit |
| tday.com (S26) | No | marketing-claim | PR → sandbox → captured demo; re-records itself when the product changes |
| Memoir (S26) | No | marketing-claim | Shipped change → "record with evidence" → Slack approval → per-audience outputs |
| Superside (W16) | Yes (ComfyUI nodes) | architecture-seen (nodes) / marketing (Brand Brain) | Deterministic transforms plus a cost ledger around generative nodes |
| Palette (S26) | No | marketing/docs-claim | Model routing with "spec and capability gates" and "cost gating" |
| FLORA | No | marketing-claim | "Techniques" = reusable published workflows |
| Krea | Yes (skills + evals) | architecture-seen | Paid live evals triggered only when the relevant thing changes; vision-compare preservation check |
| Recraft | Yes (MCP server, now deprecated = stale) | architecture-seen (stale) | Style object created from 1–5 reference images → `styleID` |
| Runway | Yes (skills, SDKs, OpenAPI) | architecture-seen | Model Router: immutable `configId`, `dryRun`, routing explanation per task |
| Figma Weave / Make | Guide repo plus live MCP tool schemas | interface-seen | Cost quote → explicit approval → `acknowledgedCost` on every run |
| fal | Yes (SDKs, `arbiter`) | architecture-seen | Named, pluggable image/video quality metrics |
| Freepik→Magnific Spaces | No relevant repo | marketing-claim | Node canvas plus templates |
| Higgsfield | Yes (skills, CLI) | architecture-seen, see `public-repo-patterns.md` | Route by mode/task; chain specialist skills through output contracts |

---

## YC companies

### Bloom (YC S26): ycombinator.com/companies/trybloom

| Field | Finding |
|---|---|
| problem solved | Turn a brand into infrastructure that agents and apps can call; generate on-brand images/ads. |
| source of truth | A hosted "Brand" object onboarded from a website or Instagram URL (API). Marketing also says decks, Figma and codebases. |
| context representation | **Public API shape is flat**: `colors[]`, `fonts[]`, `aesthetic` (string), `summary` (string), `logoUrl`, plus a brand-scoped image library. "Visual DNA" extraction re-runs when the logo changes. Marketing calls this "a canonical ontology" and a "Brand Skill". The ontology is not visible publicly. |
| generation unit | One image job (`POST /images/generations`: `prompt`, `brandSessionId`, `aspectRatio`, `imageSize`, `model`, `variantCount` 1–5, `referenceImageIds`). |
| consistency mechanism | Every generation is scoped to a brand session. Reference images come from semantic search over the brand library (`bloom_search_user_images`). Edit locks the aspect ratio. Derived images (edit/resize/remove-bg/vectorize) produce new Image ids linked to the source. Marketing claims "versioned brand updates". |
| feedback signal | None visible in the API (no rating/learning endpoint). |
| verification mechanism | Lifecycle gating only: generate only when brand `status == ready`. Typed failure codes (`SCRAPE_FAILED`, `VISUAL_DNA_FAILED`, …). No visible on-brand check. |
| human role | Onboards the brand, fixes the logo when `logo_required`, prompts. |
| borrow | (1) A brand has an explicit lifecycle with typed failure codes, and generation refuses a brand that is not ready. (2) Keep the brand library separate from brand rules, and retrieve references by semantic search instead of dumping assets into context. (3) Derived assets keep a parent id (lineage). (4) Offer the same brand through a CLI/MCP/API surface. |
| NOT borrow | Squashing a brand into `colors/fonts/aesthetic/summary`: too thin for cstack's brand state model. A hosted, proprietary brand store as the source of truth (cstack is git-native). Credits as the only cost signal. |
| public repo | **No official repo.** `api-evangelist/trybloom` is an independent third-party profile. Its `provenance.yml` says it was derived from public docs and the official OpenAPI. Evidence: `api-evangelist_trybloom/openapi/_original/trybloom-api-openapi.json` (brand schema ~L1190–1300; onboarding description L654; logo re-analysis L1935); MCP tool list `api-evangelist_trybloom/mcp/trybloom-mcp.yml` (17 tools, `bloom_*`, OAuth or `bloom_sk_` key). Docs: https://docs.trybloom.ai/api, https://docs.trybloom.ai/mcp/getting-started |
| evidence quality | **interface-seen** (public API/MCP surface). "Ontology", "Brand Skill" and "versioned updates" are **marketing-claim**. |

### Ad Army (YC S22): ycombinator.com/companies/ad-army

| Field | Finding |
|---|---|
| problem solved | Consistent multi-format ad variants (image/video/text/audio) from one brand "world". |
| source of truth | Workspace-level reference entities (YC copy: characters, products, locations with locked descriptors and reference images). Recon shows "Context sources" (text, image, file, feed, app) shared with every pipeline step. |
| context representation | A pipeline canvas of typed nodes: Start, Source, Generate, Action, Merge ("Concatenate"). `@step` / `@step.field` references. A prompt library using a `{{prompt}}` placeholder. Intel Feeds (Google Merchant Center XML/JSON). |
| generation unit | A Generate step: output type, model, quantity 1–10 "versions per input", run mode Independent/Split, batch lanes "one lane per uploaded image". |
| consistency mechanism | @-mentioned locked entities pull reference images into model calls (YC copy). Reusable product references (site). Saved "recipes" replay workflows (YC copy). |
| feedback signal | None documented beyond the user confirming each generation. |
| verification mechanism | **Validation that blocks publishing** (UI-observed): an empty prompt, more than one lineage start step, "This step has inputs available but doesn't reference them", a connected source not referenced in the prompt, Merge with fewer than 2 inputs. Publish locks a version ("lock in v1"). Automation requires every Action step on "Auto advance" instead of "Manual review". |
| human role | Confirms each generation, chooses manual review vs auto-advance per action, reviews before publishing. |
| borrow | (1) Static lint of a workflow graph before it can run: unreferenced inputs, dangling sources, ambiguous entry. This is cheap and deterministic. (2) A human gate as a per-step setting (`manual_review` / `auto_advance`), with automation allowed only when every gate is explicitly opened. (3) Publishing a pipeline freezes a version. (4) Secrets are write-only and scoped workspace → pipeline override. (5) Batch lanes: one lane per input asset. |
| NOT borrow | 1000s of Pipedream app actions (huge surface, credential sprawl). Long lists of model versions in the UI instead of task-routed defaults. Generic prompt-library templates like "Create 5 headlines for: {{prompt}}" (slop risk). |
| public repo | **No official repo** (GitHub search for ad-army/adarmy found nothing official). A third-party recon skill, `waligorskim/ad-army-pipeline-skill` (2026-03-25, "Workspace: Displate"), documents the UI. Evidence: `waligorskim_ad-army-pipeline-skill/ad-army-pipeline-skill.md` L199–264 (Generate fields + validation), L266–312 (Action, Run behavior), L438–450 (automation prerequisites), L34 (write-only env vars). The recon does **not** show the characters/locations "world" entity screens (its own "Remaining gaps" lists unexplored areas), so that part stays marketing. |
| evidence quality | **UI-observed** (third party, ~6 months old) for the pipeline. **marketing-claim** for locked entities and recipes (https://ad.army/, YC page). Site lists models Veo/Kling/Seedance/Gemini/Flux/Ideogram/Recraft/ElevenLabs and mentions an MCP connection. |

### Gooseworks (YC W23): ycombinator.com/companies/gooseworks

| Field | Finding |
|---|---|
| problem solved | On-brand short-form ads and growth work. "Marketing Brain" plus specialist agent skills. |
| source of truth | Hosted "Company Brain / Marketing Brain" (Company, Customer, Product, Learnings, Plan, Library, per the site), accessed via app-MCP. |
| context representation | Brand kit + facts + learnings + taste media behind MCP tools (`brand_update`, `get_ad_brand`, `finalize_brand_research`, …). On the local side, Markdown research packs with a fixed output contract (`brand-summary`, `visual-identity`, `audience`, `competitors`). |
| generation unit | Recipe skill runs (static remix, video). Media brokered through fal / Higgsfield / ElevenLabs proxies. |
| consistency mechanism | Brand research pack + kit. Templates with `remix_engine` hints. Entry skills generated from one TypeScript source. |
| feedback signal | Ad account performance matched back to the creative (marketing). User corrections captured as typed knowledge (code). |
| verification mechanism | `finalize_brand_research` **rejects stub packs**: missing or short sections flip the brand to `failed` (`gooseworks-ai_gooseworks-ads/skills/master.md:39`). Readback after every save. Forward-test fixtures with `acceptance` / `reject` lists (`gooseworks-ai_gooseworks/tests/fixtures/marketing-brain-capture.json`). Route-drift tests. |
| human role | Answers gap-only interviews, accepts or rejects agent proposals in the app, approves video in chat. |
| borrow | (1) **Knowledge provenance on write**: `user_correction` (requires the user's verbatim `user_statement`) vs `agent_proposal` (pending until accepted). "A pending proposal is not a saved fact" (`gooseworks-ai_gooseworks/src/skills/master-skill.ts:85-92`). (2) Never report "saved" before readback. (3) Research packs have a contract, and a validator rejects stubs. (4) Durable output URLs instead of expiring CDN links (`master.md:77`). (5) "A hint, not a directive": template metadata is advisory and the agent's own analysis decides (`master.md:59`). (6) Entry skills generated from one source and committed (`gooseworks-ai_gooseworks/AGENTS.md:3-16`). |
| NOT borrow | Hosted brain as the only store. No credit preflight ("nothing blocks at 0 ad credits", `master.md:20`): cstack should preflight cost. Recipes written for a cloud sandbox and translated by a prose map at runtime (a fragile adapter). |
| public repo | **Yes.** `goose-skills`, `goose-video` (deep-dive in `public-repo-patterns.md`), plus `gooseworks` (installer + generated entry skills + tests, active 2026-10-02), `gooseworks-ads` (local-worker runtime contract), `goose-aeo`, `gooseworks-skills`, `dashboard-template`. |
| evidence quality | **architecture-seen** for skills, contracts and tests. Performance attribution ("matches the money back") is **marketing-claim**. |

### GetCrux (YC W24): ycombinator.com/companies/getcrux

| Field | Finding |
|---|---|
| problem solved | AI creative strategist: decompose ads, find winning patterns, recommend or produce next creatives. |
| source of truth | Ad-platform performance (Meta, Google, TikTok, …), MMPs (AppsFlyer, Adjust), warehouses (Snowflake, Looker), a brand kit. |
| context representation | Creative tagged across parameters: hooks, messaging, format (UGC monologue, street interview, demo), music, CTA, storyline, influencer demographics, length, setting (site + Jan 2025 launch). Taxonomy schema not public. |
| generation unit | A weekly creative brief (Jan 2025 launch). Newer site: on-brand creatives and variations. |
| consistency mechanism | "Brand kit" (messaging, logos, palettes, photography style). Claim only. |
| feedback signal | Ad performance linked to tags. Competitor ads and comments. Creative fatigue detection. |
| verification mechanism | Not documented. |
| human role | Creative teams execute briefs. "Only pay for the creatives you like". |
| borrow | Tag creatives with an explicit, versioned **creative-parameter taxonomy** so performance can be attributed per parameter. Use a **brief as the output of analysis** (insight → brief → production). Minimum-data honesty: the launch required ≥$500k/yr spend, 20–25 tests/month, 6 months of history before claiming patterns. |
| NOT borrow | Letting performance tags define taste. "100+ parameters" without a public schema. Auto-publishing. |
| public repo | **No.** GitHub search found only unrelated portfolio projects (`AryAgarwal/adcreative-agent`, "GetCrux portfolio project"), which are not company code. |
| evidence quality | **marketing-claim** (https://www.getcrux.ai/, https://www.ycombinator.com/launches/MaN-getcrux-ai-creative-strategist-to-launch-winning-ads, …/O5K-…). |

### Lapis (YC F25): ycombinator.com/companies/lapis

| Field | Finding |
|---|---|
| problem solved | End-to-end paid ads: strategy, copy, statics, landing pages, deployment, optimization. |
| source of truth | Website URL → extracted logo, colors, visual style, products, voice, refined with guidelines. Plus live campaign and conversion data. |
| context representation | Not disclosed. Named sub-engines: OmniSense (multi-format ads), ChatSense (ChatGPT ads), RapidDomain (landing pages). |
| generation unit | A campaign = ads + audience variations + matched landing pages. |
| consistency mechanism | Extracted brand kit. Landing page "matched to each ad's message". |
| feedback signal | Click and conversion data. "Starts each new campaign smarter". |
| verification mechanism | Not documented. Managed plans have a human strategist on budget. |
| human role | Self-serve launches, or a managed strategist. |
| borrow | The extracted brand is a **"reviewable starting point"** (their words), not truth. This maps to cstack's proposal → approval. Treat the ad↔landing-page message match as one unit with a consistency check. |
| NOT borrow | Autonomous bid and budget control. "Up to 20x" style claims. |
| public repo | **Unresolved.** The YC page links `https://github.com/trylapis`, but GitHub search returns "user does not exist or not visible" and github.com HTML fetch was blocked. Treat as no usable public repo. |
| evidence quality | **marketing-claim** (https://www.trylapis.com/). |

### Uplane (YC F25): ycombinator.com/companies/uplane

| Field | Finding |
|---|---|
| problem solved | "Replace marketing agencies with AI": ads + landing pages + budget optimization across Meta/Google/LinkedIn/TikTok. |
| source of truth | Audience, brand style, competitor ads, trends. CRM/ERP data for ROAS (YC copy). |
| context representation | Not disclosed. |
| generation unit | "Hundreds/thousands" of ad variations with matching landing pages. |
| consistency mechanism | "On-brand" (claim). |
| feedback signal | Performance and CRM/ERP revenue data. Budget moves to winners. |
| verification mechanism | Not documented. Dashboards for transparency. |
| human role | Managed growth service, or a licensed platform for in-house teams. |
| borrow | Tie the feedback signal to **downstream revenue (CRM)**, not just CTR, when it is available. Offer both a done-for-you and a self-serve mode on one engine. |
| NOT borrow | Volume-first generation ("thousands of ads"). Autonomous budget control. |
| public repo | **No.** `Uplane/uplane-ui` (created 2022, last push 2023, package name `sever-design-system`) has no link to the F25 company. I did not attribute it. |
| evidence quality | **marketing-claim** (https://uplane.com/, YC page). |

### tday.com (YC S26): ycombinator.com/companies/tdaycom

| Field | Finding |
|---|---|
| problem solved | Turn shipped software changes into on-brand launch creative and publish it. |
| source of truth | The **GitHub repo/PR** (captured pre-merge in an isolated sandbox) or a demo account the agent drives. |
| context representation | Learned colors, fonts, voice. Captured product flows. |
| generation unit | Per-release "launch package": demo video, feature showcase, social graphics. |
| consistency mechanism | Learned brand. "Ship a new version and the demo re-records itself". |
| feedback signal | Post performance (claims "up to 8.3% CTR"). |
| verification mechanism | Not documented. Users can edit "any line, scene, or image… without re-recording the source". |
| human role | Edit outputs. Publishing is automatic. |
| borrow | **Capture real product footage from the actual artifact** (sandboxed PR build) instead of generating it: deterministic before generative. Make the source of truth a code change, so assets can **regenerate when the source changes**. Edit layer kept separate from capture. |
| NOT borrow | Automatic publishing without a gate. CTR as the headline quality metric. |
| public repo | **No** (searches for tday/tdaycom found nothing). |
| evidence quality | **marketing-claim** (YC page; https://www.ycombinator.com/launches/Qd3-tday-com-your-code-ships-we-make-it-famous). tday.com itself was unreachable. |

### Memoir (YC Spring 2026; brief says "P26"): ycombinator.com/companies/memoir

| Field | Finding |
|---|---|
| problem solved | "Everything your team ships, explained to everyone it affects": per-audience explanations of product changes. |
| source of truth | GitHub PRs, pushes, releases. The live product captured by a signed-in agent. Founder posts (voice). Logo and palette. |
| context representation | "Each shipped feature is written into the record with its evidence, real screens, and your brand." This is an evidence-backed change record (site). |
| generation unit | Per-change outputs fanned out per audience: customer walkthrough, launch content, engineering brief, demo video with captions, social posts in the founder's voice. |
| consistency mechanism | Voice seeded from historical posts. Brand elements. |
| feedback signal | Approval and edits in Slack (claimed). Performance learning is claimed in the brief, but I found no detail. |
| verification mechanism | Slack approval before public distribution. A public share page per cut. |
| human role | Approve in Slack. |
| borrow | An **evidence-backed record** as the intermediate artifact (change + evidence + screens) before any copy. **Audience fan-out** from one record. Approval where the team already works (Slack/PR). |
| NOT borrow | Implicit voice cloning from founder posts without consent or provenance controls. |
| public repo | **No.** GitHub search for trymemoir found nothing. The pages found (glama `camgitt/memoir`) are unrelated. |
| evidence quality | **marketing-claim** (https://www.trymemoir.ai/, YC page). The YC page says the company pivoted from "AI CMO for software companies". |

### Superside (YC W16): ycombinator.com/companies/superside

| Field | Finding |
|---|---|
| problem solved | Enterprise creative production at scale: 800+ human creatives plus AI workflows (Superspace platform). |
| source of truth | "Brand Brain": brand context, preferences, past feedback (marketing). Briefs in Superspace. |
| context representation | Public nodes show prompt slots/variants, SKU reference sheets, detail sheets, region masks (see `public-repo-patterns.md`). |
| generation unit | A ComfyUI node graph run per deliverable. |
| consistency mechanism | Deterministic compositing/normalization (`normalize_product_node.py`, `color_match_node.py`, `white_balance_node.py`), region-scoped edits (`sam_3_region_selector_node.py`, `stitch_region_node.py`), LoRA training/inpaint nodes. |
| feedback signal | Human review rounds (marketing: "fewer review rounds"). |
| verification mechanism | `image_compare_node.py`; size/resolution handling; **cost ledger** (`fal_cost_ledger.py`, `fal_cost_report_node.py`, `fal_pricing.py`). |
| human role | Primary. Creative directors and designers own judgment; AI is inside the workflow. |
| borrow | Deterministic transforms around generative steps, per-run cost ledger, region-scoped edits (details in `public-repo-patterns.md`). The human-led service model as proof that taste stays with humans. |
| NOT borrow | Dependence on a ComfyUI GUI runtime as the cstack core. Opaque "Brand Brain" claims. |
| public repo | **Yes:** `Superside/comfyui-superside-nodes` (~80 node modules, active 2026-10-02). Deep-dive is in `public-repo-patterns.md`. |
| evidence quality | **architecture-seen** for media nodes. **marketing-claim** for Brand Brain, Superspace, AI agents (https://www.superside.com/). |

### Palette (YC S26): ycombinator.com/companies/palette-2

| Field | Finding |
|---|---|
| problem solved | One conversational multimodal studio (image/video/music) for brands and creators; generate → distribute → optimize. |
| source of truth | Prompts, references, documents, "product context". Brand kits (colors, logos, typography, product imagery). |
| context representation | Brand kits, **Characters** (consistent identity across shots), storyboards, prompt templates. |
| generation unit | Image/video/music job via API (`POST /images`, `/videos`, `/music`, `/tools`). |
| consistency mechanism | Brand kits + characters + storyboards (claim). |
| feedback signal | "Self-improving" (claim). No mechanism disclosed. |
| verification mechanism | Model routing "spec and capability gates", "cost gating selects the cheapest trusted option". Automatic refunds for failed jobs and fallback cost differences (site). |
| human role | Natural-language direction and edits. |
| borrow | **Routing as gates**: filter models by spec/capability first, then pick the cheapest *trusted* option. Refund or record cost when a fallback model ran. Characters as a first-class entity separate from the brand kit. |
| NOT borrow | "Fully autonomous production engine" as the goal. Single-conversation state as the system of record. |
| public repo | **No** (search for palettelabs found nothing). |
| evidence quality | **marketing/docs-claim** (https://palettelabs.com/). The API reference page `studio.palettelabs.com/api/v1` was blocked by robots.txt, so the endpoint list comes from the marketing page only. |

---

## Non-YC tooling

### FLORA (flora.ai, formerly florafauna.ai)

| Field | Finding |
|---|---|
| problem solved | Infinite node canvas joining 50+ text/image/video models for creative teams. |
| source of truth | The canvas/project. |
| context representation | Blocks on a canvas. **"Techniques"**: reusable workflows built by FLORA and creators (e.g. "Character Lock", "Logo to Brand Identity", "Mood Board Maker"). |
| generation unit | A block run. A Technique run. |
| consistency mechanism | Techniques like Character Lock (claim). No public brand/style governance. |
| feedback signal | None documented. |
| verification mechanism | None documented. |
| human role | Hands-on canvas operator, real-time team collaboration. |
| borrow | Publish proven workflows as named, reusable "techniques" that anyone can run with new inputs (≈ cstack recipes/playbooks). |
| NOT borrow | Canvas-only state. Third-party analysis notes "limited public API and developer tooling" (https://www.airframe.ai/product/florafauna-ai/analysis). |
| public repo | **No** (search found only unrelated "FloraFauna" projects). |
| evidence quality | **marketing-claim** (https://flora.ai/). |

### Krea (krea.ai; Nodes; krea-ai/skills)

| Field | Finding |
|---|---|
| problem solved | Generation, enhancement, realtime, LoRA training. Node pipelines and shareable "apps". Agent skills for marketing and motion. |
| source of truth | Krea-hosted assets (upload-first discipline) via a remote MCP server. |
| context representation | Three skills (`krea-generate` router, `krea-marketing`, `krea-motion`) with `workflows/` and `references/` (e.g. `marketing-creative-anatomy.md`, `artifact-taxonomy.md`). |
| generation unit | MCP tool calls routed through the live model catalog. |
| consistency mechanism | Prompt names what to preserve, not a full re-description. Upload-first: never pass a raw external URL as a generation input (`krea-ai_skills/evals/hero/cases/HC-05-image-edit-i2i.json`). |
| feedback signal | Optional Meta Ads performance context (`krea-marketing/workflows/meta-ads-performance.md`). |
| verification mechanism | **Two-layer evals**: an offline spec lint + grader self-test on every PR (free), and a live "hero" suite through a real agent with an LLM judge, run only when skills or MCP config change, or on `repository_dispatch: mcp-changed` (`krea-ai_skills/.github/workflows/evals.yml:3-36`). Each case has `required_facts`, `expected_tool_path` and `grading_criteria`. Vision-compare output vs source. Video QA scorecard with thresholds (`krea-marketing/references/video-ad-qa.md:33-36`) and platform text safe zones. |
| human role | Prompting. Approves deliveries. |
| borrow | Eval case schema (`required_facts`, `expected_tool_path`, PASS/FAIL criteria, fixtures). Free offline gate vs paid live gate, triggered by diffs plus a dispatch event when an upstream API changes. Platform safe-zone specs as deterministic checks. |
| NOT borrow | A self-scored "virality" 0–100 by the same model as a delivery gate (this is model self-grading; use it only as a weak signal). |
| public repo | **Yes:** `krea-ai/skills` (v0.7.6, active 2026-09). Also open models `krea-2`, `flux-krea`, `realtime-video`. |
| evidence quality | **architecture-seen** (skills, evals, CI). Nodes/apps product is **marketing-claim** (https://www.krea.ai/nodes). |

### Recraft (recraft.ai)

| Field | Finding |
|---|---|
| problem solved | Raster and **vector** generation/editing, brand styles. |
| source of truth | Recraft-hosted custom styles. |
| context representation | **Style object** created from 1–5 reference images plus a base style → `styleID` (`recraft-ai_mcp-recraft-server/src/tools/CreateStyle.ts:10-37`). |
| generation unit | Image generation call with `style`/`substyle` **or** `styleID` (mutually exclusive, `src/tools/GenerateImage.ts:45-47`). |
| consistency mechanism | A reusable style id, so the same look carries across prompts. |
| feedback signal | None. |
| verification mechanism | None in the repo. |
| human role | Picks references, prompts. |
| borrow | A brand "look" as a **first-class, referenceable object built from a small curated reference set** (≈ cstack gold library → style handle per provider). Vector output (SVG) as a route for logos/icons. |
| NOT borrow | A provider-locked style id as the canonical definition. cstack should keep the refs + spec and *compile* to provider style ids. |
| public repo | **Yes, but stale**: `recraft-ai/mcp-recraft-server` is archived/deprecated in favour of the remote MCP at `https://mcp.recraft.ai/mcp`. Also `ComfyUI-RecraftAI`. |
| evidence quality | **architecture-seen (stale)**. |

### Runway (runwayml)

| Field | Finding |
|---|---|
| problem solved | Video/image/audio generation API, Characters (realtime avatars), app workflows exposed as APIs, Model Routers. |
| source of truth | Runway account resources (routers, workflows, avatars) through Dev MCP. |
| context representation | Skills split into direct-action skills (`rw-generate-*`) and integration skills (`runway-dev-*`) (`runwayml_skills/CHANGELOG.md` 3.0.0). |
| generation unit | A task (`generate.{video,image,audio}.create`). Routed by `configId`. |
| consistency mechanism | Characters (avatar ids). Published workflows as stable endpoints. |
| feedback signal | None. |
| verification mechanism | Router changes need user approval. Validate with `dryRun: true` before a billable call. Make **one** verification call, then `get_task_routing` to explain which model ran (`skills/runway-dev-model-routers/SKILL.md:21-30`). Probe the API secret without printing it. |
| human role | Approves router config and spend. |
| borrow | **Model router as config**: immutable slug, routing preference, capacity fallback, credit caps, and an explanation of which model handled each task. Dry-run first. One billable verification. Lead output with "model + cost" (CHANGELOG 2.1.0). |
| NOT borrow | Repeated breaking renames of skills (1.1.0, 3.0.0 in the CHANGELOG). cstack should version skill ids carefully. |
| public repo | **Yes:** `runwayml/skills`, `sdk-node`, `sdk-python`, `openapi`, `runway-mcp-plugin` (the old local `runway-api-mcp-server` is archived). |
| evidence quality | **architecture-seen** (skill contracts). Router internals are not visible. |

### Figma AI: Figma Make, Figma Weave (formerly Weavy)

| Field | Finding |
|---|---|
| problem solved | Weave: node-based image/video generation and editing (Weavy, acquired by Figma in Nov 2025). Make: prompt-to-prototype. Figma MCP: design ↔ code. |
| source of truth | Figma files, design-system libraries (components/variables/styles), Code Connect mappings. Published Weave workflows ("tools"). |
| context representation | `search_design_system` over components, variables, styles. Code Connect maps design components to code. Make projects are exposed as MCP **resources** (`figma_mcp-server-guide/README.md:351-372`). |
| generation unit | `weave_run_tool` (published workflow, versioned, inputs addressed by `nodeId`, `numberOfRuns` 1–10, iterator inputs, seed inputs) or `weave_run_model` (a single model by id with a typed `contract`). |
| consistency mechanism | Reuse real design-system components and tokens. The guide says "without [Code Connect] the model is guessing" (README L218). Workflow `version` pinning. |
| feedback signal | None exposed. |
| verification mechanism | **Cost gate on every run**: the first call only quotes (`cost_confirmation_required`). The agent must get explicit Approve/Cancel and then echo `acknowledgedCost`, including on reruns. Never invent inputs; confirm auto-filled inputs. (Tool schemas `mcp__Figma__weave_run_tool` / `weave_run_model` as exposed in this session.) |
| human role | Approves spend, owns design files. |
| borrow | (1) **Quote → approve → run with acknowledged cost** as a protocol for paid generation. (2) Published workflows as versioned "tools" with typed, node-addressed inputs and iterator fan-out. (3) Search the design system before generating; map to real components. |
| NOT borrow | Figma files as the brand's canonical source (proprietary, not diffable in git). |
| public repo | `figma/mcp-server-guide` (guide + 14 skills, active) and `figma/community-resources`. No Weave/Make product source. |
| evidence quality | **interface-seen** (live tool schemas + guide). Weave capabilities beyond the schemas are **marketing-claim** (https://alternativeto.net/news/2025/11/figma-acquires-ai-content-platform-weavy-launching-node-based-image-and-video-editing-tool/). |

### fal (model router / inference)

| Field | Finding |
|---|---|
| problem solved | One API to 1,000+ image/video/audio models. Queue, streaming, serverless custom models. |
| source of truth | None for brand; this is infrastructure. |
| context representation | Per-model input schemas; request ids. |
| generation unit | A queued request per model endpoint. |
| consistency mechanism | n/a. |
| feedback signal | n/a. |
| verification mechanism | `fal-ai/arbiter`: named metrics behind one interface: no-reference (MUSIQ, NIMA, ARNIQA, CLIP-IQA, variance of Laplacian), reference-based (LPIPS, SSIM, DISTS, MSE), text-image (CLIP score), set-level (FID, KID), video variants, WER. Last commit 2025-12, so somewhat stale. |
| human role | Developer. |
| borrow | A **cheap deterministic/learned metric layer** before LLM judges: sharpness, reference preservation (LPIPS/SSIM vs source), prompt adherence (CLIP). Evals cheaper than generation. Per-call pricing feeds the cost ledger (Superside's `fal_pricing.py` does this). |
| NOT borrow | Treating aesthetic predictors (NIMA/MUSIQ) as "on brand". They are not brand judgments. |
| public repo | **Yes:** `fal-ai/fal`, `fal-js`, `arbiter`. No official skills/MCP repo found. |
| evidence quality | **architecture-seen** (SDK/arbiter). Router scale claims are **marketing-claim** (https://fal.ai/docs). |

### Freepik → Magnific Spaces; Higgsfield

- **Spaces (Magnific, formerly Freepik):** a node canvas with upload, text, assistant, generate and upscale nodes, real-time multi-cursor collaboration, and templates (product variations, 360°, video localization). **marketing-claim** (https://www.magnific.com/spaces). The `freepik-company` org has infrastructure repos only (plus a `homebrew-magnific` CLI tap), so it shows nothing about creative architecture. Borrow: templates for recurring production jobs. Not borrow: canvas as source of truth.
- **Higgsfield:** `higgsfield-ai/skills` (brandkit, soul-id, product-photoshoot, generate, …, with `evals/`), `cli`, SDKs. **architecture-seen**. Deep-dive in `public-repo-patterns.md`. In this landscape it stands for "route by mode/task + chain specialist skills through output contracts".
- **Weavy community tooling:** `SamurAIGPT/Vibe-Workflow` (an open-source canvas "alternative to Weavy/Krea Nodes/Spaces/FLORA") and `iamredmh/weave-mcp` (Playwright automation) show demand for scriptable, self-hosted canvases. I did not inspect them deeply.

---

## Cross-company patterns

1. **Everyone converged on "brand context + many models + MCP".** Bloom, Gooseworks, Krea, Recraft, Runway, Figma/Weave and Ad Army all ship a remote MCP server (usually OAuth). The difference between them is **how brand truth is stored and governed**, not the generation call.
2. **Brand representation is thinner in code than in marketing.** Bloom's public brand object is `colors/fonts/aesthetic/summary/logo`, while its marketing says "canonical ontology". Gooseworks is the only one with visible *governed* brand memory (typed facts, proposals vs corrections, readback, stub-rejecting research packs). No company exposes fixed-truth vs creative-latitude separation, Shot DNA, or gold/anti libraries. This is the gap cstack fills.
3. **Reusable workflows are a universal unit**, under different names: recipes (Ad Army), Techniques (FLORA), published Weave tools (Figma), apps (Krea Nodes), templates (Spaces, Gooseworks remix), prompt templates (Palette), Runway workflows. The best versions are **versioned, have typed inputs, and fan out with iterators/batch lanes**.
4. **Consistency comes from entities plus references, not prompts.** Locked characters/products/locations (Ad Army), Characters (Palette, Runway), style-from-refs ids (Recraft), brand-library semantic retrieval (Bloom), Character Lock (FLORA). They all reduce to *a named entity → a curated reference set → injected per call*.
5. **Verification is the weakest layer across the market.** Public evidence of verification exists only at Krea (eval suites + vision compare + QA thresholds), Gooseworks (contract validators, forward-test fixtures), Ad Army (graph lint), Superside (image compare + cost ledger) and fal (metric library). Every "self-improving loop" claim (Lapis, Uplane, Palette, GetCrux, Gooseworks performance) is **marketing-claim with no visible mechanism**.
6. **Cost is becoming an explicit protocol.** Figma Weave (quote → acknowledged cost), Runway (dryRun, credit caps, one billable verification), Palette (cost gating, refunds on fallback), Superside (cost ledger). The counterexample is Gooseworks' "no preflight".
7. **Product-truth-from-code is a new cluster** (tday, Memoir). Source of truth is the repo/PR plus a captured live product, deterministic capture beats generation, and assets re-generate when the source changes. This is the most git-native pattern in the landscape.
8. **Ads-loop companies (Lapis, Uplane, GetCrux) optimize toward platform metrics** and take autonomy over budgets. None show how they keep taste from collapsing into CTR.
9. **Human gates appear as per-step settings, not global modes**: Ad Army manual-review/auto-advance, Memoir Slack approval, Gooseworks chat approval, Runway/Figma spend approval.

---

## cstack implications

| Mechanism (seen in) | cstack should | Priority |
|---|---|---|
| Brand lifecycle + typed failure codes (Bloom) | Brand state has `status` (`draft / analyzing / needs_input / ready / failed`) with typed reasons. Generation skills refuse brands that are not `ready` unless `--draft` is passed. | P0 |
| Proposal vs correction + readback (Gooseworks) | Every write to brand state records `provenance: user_statement \| agent_proposal \| research` with the verbatim user quote. Proposals go to `proposals/` until a human accepts them (git commit = acceptance). Skills must read back after writing. | P0 |
| Contracted research packs that reject stubs (Gooseworks) | `/import-brand` emits fixed-section Markdown + a manifest. A free validator fails stubs or missing sections in CI. | P0 |
| Graph/recipe lint (Ad Army) | Recipes are YAML. Static lint fails on unreferenced inputs, unresolved slots, multiple entry points, and steps with no gate setting. | P0 |
| Per-step gate setting (Ad Army, Memoir) | Each recipe step declares `gate: manual \| auto`. Unattended runs are allowed only when every gate is `auto` *and* the brand is `ready`. | P1 |
| Quote → approve → acknowledged cost (Figma Weave, Runway dryRun) | Every paid media call goes through a cost preflight. The run needs an explicit `acknowledged_cost`. The cost ledger is written to a sidecar (with Superside's ledger). Never skip preflight (Gooseworks counterexample). | P0 |
| Router as config with routing explanation (Runway, Palette) | `providers/routes.yaml`: task → capability gate → trusted list → cheapest. Each sidecar records *which model ran and why*, including fallbacks. | P1 |
| Entities + reference sets (Ad Army, Recraft, Palette, Bloom) | `world/` entities (character/product/location) each own a curated ref set + locked descriptors. Provider style ids (Recraft `styleID`, LoRAs) are **compiled artifacts** cached from refs, never canonical. | P0 |
| Semantic library retrieval (Bloom) | Index `library/` and retrieve the top-k refs per task instead of loading the whole library into context. | P1 |
| Versioned reusable workflows with typed inputs + iterators (Weave, FLORA, Krea apps) | Playbooks/recipes are versioned, have typed inputs and iterate over input lists. Publishing a recipe freezes its version. | P1 |
| Two-layer evals with diff/dispatch triggers (Krea) | Adopt the eval case schema (`required_facts`, `expected_tool_path`, fixtures, PASS/FAIL). Free lint/self-test on every PR; paid live evals only when the touched skill or provider adapter changes. | P0 |
| Cheap metric layer (fal arbiter, Krea vision-compare) | Before any LLM judge, run deterministic checks: resolution, safe zones, LPIPS/SSIM preservation vs source for edits, CLIP adherence. Label them "technical quality", never "on brand". | P1 |
| Product truth from code (tday, Memoir) | A `/launch-from-pr` workflow: PR diff → evidence record (screens captured from the real build) → audience fan-out → gate. Regenerate when the source changes. This fits cstack being git-native better than any competitor does. | P2 |
| Creative-parameter taxonomy (GetCrux) | A versioned taxonomy for tagging creative (hook, format, CTA, …) so performance data attaches to parameters. Keep it separate from taste judgments. Enforce minimum-data thresholds before claiming patterns. | P2 |
| Durable outputs, hints not directives (Gooseworks) | Store outputs in the repo or durable storage, never expiring CDN URLs. Template metadata is advisory and the brand spec wins. | P1 |

**Do NOT borrow, market-wide:** a hosted proprietary brand store as truth; volume-first "thousands of variants"; autonomous budget control; self-scored virality as a delivery gate; model-version lists as UI; Pipedream-scale action catalogs; claims of "self-improving" without a visible eval/learning mechanism; voice cloning from posts without consent/provenance.

---

## Unreachable / unverifiable sources

- `github.com/<org>` HTML pages (trylapis, gooseworks-ai) via WebFetch: the permission request timed out. I used the GitHub MCP search API instead, which worked for every org except `trylapis` ("does not exist or not visible").
- First WebFetch attempts on getcrux.ai, uplane.com, tday.com, trymemoir.ai and palettelabs.com timed out on permission. Retries succeeded for all except **tday.com**, which I covered through its YC launch post instead.
- `studio.palettelabs.com/api/v1`: blocked by robots.txt. Palette API details come from the marketing page only.
- `superside.com/ai`: 404. I used superside.com instead.
- Lapis YC launch post: not found in the YC launches search.
- GetCrux, Uplane, tday, Memoir, Palette, FLORA, Spaces: no public repo, so no architecture claims are made for them.
- Ad Army "world" entities (characters/locations/locked descriptors): not in the third-party recon. YC copy only.
