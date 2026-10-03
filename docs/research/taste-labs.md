# Taste Labs (Taste Engine): research note

Scope: master prompt §1.3 and the Taste Labs part of §1.4A.
Researched 2026-10-03.

Sources:
- Docs: every page listed in `https://docs.tastelabs.com/llms.txt` that bears on the design (fetched with WebFetch; the docs host refuses curl through the proxy).
- OpenAPI spec: saved to `/home/claude/research-src/tastelabs-openapi.json`.
- Skills repo: `/home/claude/research-src/Taste-AI_skills`. 18 commits, last one 2026-09-29, so it is current, not stale.
- Blog post: "requests for research".

Two caveats about the evidence:
- **The OpenAPI file is not byte-exact.** WebFetch passes content through a model, so the saved file is that model's re-emission. It parses as valid OpenAPI 3.1 (14 paths, 31 schemas) and matches the prose docs. Still, treat it as "very likely faithful", not as the original bytes.
- **All docs page content came through WebFetch.** Exact field names were cross-checked against the OpenAPI file wherever possible.

Every claim below is labelled with one of these:
- **[spec]**: OpenAPI
- **[docs]**: a docs page
- **[skill]**: the repo
- **[claim]**: marketing, not verified

---

## 1. The idea

**Taste Engine has three subsystems** [docs: `concepts/architecture.md`]:

| Subsystem | Operation | REST root | Mode |
|---|---|---|---|
| Extractor | **EXTRACT**: URL → structured design system + captured artifacts | `/design/submissions` | async job |
| Search | **SEARCH**: natural-language aesthetic → ranked real brands from a curated corpus | `/search` | sync |
| Verifier | **VERIFY**: (reference URL, candidate URL) → score + recommendations + fixes | `/judge/brand-adherence` | async job |

**How they depend on each other:**
- The Verifier depends on the Extractor. It extracts both sides itself.
- Search is independent, except for `GET /search/similar`, which reads a completed extraction.
- Search results send you back to the Extractor.

This is the loop the master prompt names: `CONTEXT → CREATION → VERIFICATION → CORRECTION`.

**Version status** [docs: `changelog.md`, 2026-09-14]:
- Extractor: **v1.0.0**.
- Search: **v1.0.0-alpha**.
- Verifier: **v1.0.0-alpha**. The changelog warns that alpha request/response shapes may change.

**Tools vs skills.** The docs say it directly [docs: `ai-tools/skills.md`]: "Where the MCP server gives your agent the tools, a skill gives it the judgment." The overview page adds that the MCP server "is the part that does the work" [docs: `ai-tools/overview.md`]. The repo README shows the same split from the other side: "`npx skills add` installs the **instructions**, not the tools" [skill: `README.md:36`].

---

## 2. Auth

| Surface | Mechanism | Evidence |
|---|---|---|
| REST `https://api.tastelabs.com` | Header **`X-API-Key`**. Security scheme name `ApiKeyAuth`. | [spec] `components.securitySchemes`; [docs] `concepts/authentication.md` |
| MCP `https://mcp.tastelabs.com/mcp` (streamable HTTP) | **OAuth 2.1** (recommended: no key needed), or **`Authorization: Bearer <taste_… key>`** for headless/CI use | [docs] `ai-tools/mcp.md`; [skill] `README.md:37-57` |
| Key format and scope | Prefix `taste_`. The MCP key needs the **`extractor:website`** scope. Keys may expire, which returns 401. | [skill] `README.md:49`; [docs] authentication |
| Unauthenticated reads | `GET /design/submissions/{id}/result`, `GET /design/submissions/{id}/download` and `GET /judge/brand-adherence/{job_id}/result` work without a key, but only for items made public | [spec] `security: [{ApiKeyAuth:[]},{}]` on those operations |

**Environment variable names:**
- The repo README uses **`TASTE_API_KEY`** [skill: `README.md:56`].
- The docs quickstart uses a generic `API_KEY` placeholder.
- cstack should standardise on **`TASTE_API_KEY`**.

**The dashboard domain is inconsistent:**
- The spec and docs use `engine.tastelabs.com/app/api-keys`.
- The repo README uses `engine.thetaste.ai/app/api-keys` [skill: `README.md:50`].
- This looks like a rebrand. Do not hard-code either one.

---

## 3. EXTRACT

### REST endpoints [spec]

| Method + path | Purpose | Key inputs | Responses |
|---|---|---|---|
| `POST /design/submissions` | Create an extraction job | Body `SubmissionCreate` (below). Query `map` (bool, default false) and `max_urls` (1–200, clamped to 200). | 202 `SubmissionAccepted`; 401, 402, 403, 422, 500 |
| `GET /design/submissions` | List jobs | `status`, `q` (URL search), `api_key_id`, `batch_id`, `limit` (default 50, max 100), `offset` | 200 |
| `GET /design/submissions/{id}` | Job status | – | `Submission` |
| `GET /design/submissions/{id}/result` | Result envelope. **Streams partial results.** | `sections=colors,typography` (one comma-separated value) | 200 (may be partial); **409 `NOT_READY`** before the first checkpoint; 404; 422 |
| `GET /design/submissions/{id}/download` | Bundle manifest | – | `SubmissionManifest {submission_id, extraction_id, files[{path, url \| content}]}` |
| `PATCH /design/submissions/{id}/visibility` | Share a result | `{"is_public": true}` | 200 |
| `POST /design/prompts/enhance` | Rewrite a prompt using a brand profile (sync) | `{submission_id, prompt}`. Needs a **full** (non-selective) extraction. | `{enhanced_prompt, brand_name, source_url, model_used}` |

**`SubmissionCreate` fields** [spec]:
- `url` (required).
- `force` (default false): bypasses the cache.
- `enable_deep_analysis` (default false): slower.
- `sections` (`SectionName[]` or null):
  - An empty array or an unknown name returns 422.
  - `sections` cannot be combined with `map=true` (returns 422 `SELECTIVE_MAP_UNSUPPORTED`).
  - `sections` cannot be combined with `enable_deep_analysis`.
  - Picking fewer sections does not lower the credit price.
  - Selective results are never reused as cache sources.
  - A recent *full* cached extraction can satisfy a selective request.

**Job model** [spec: `SubmissionStatus`; docs: `concepts/submissions.md`]:
- Status values: `accepted → queued → crawling → extracting → completed | failed`.
- Steps reported in `current_step`: `crawling → design_extract_ai → profiling → finalizing → persisting`.
- Polling: poll `/result` (the quickstart samples sleep 3 s between polls). `200 + partial design_system` means keep going. Stop at `status ∈ {completed, failed}`.
- One extraction or verification takes "three to five minutes" [skill: `brand-adherence/SKILL.md:271`].

**`Submission` and `SubmissionResult` fields** [spec]:
- Identity and status: `submission_id`, `extraction_id`, `status`, `source_url`, `current_step`, `step_started_at`, `updated_at`, `accepted_at`, `error`.
- Cache: `cache_hit`, and `completed_at`. When `cache_hit` is true, `completed_at` is the *original* extraction time, so it tells you how fresh the data is.
- Billing: `credits_consumed` (0 after a refund), `credit_ref_id`, `api_key_name`.
- Other: `batch_id`, `batch_label`, `is_public`, `sections`.
- Result body:
  - `result.design_system`
  - `artifacts.{html, css, screenshot, full_page_screenshot, element_layout}`, each an `Artifact {path, url, content_type}`.

### The structured brand state (`design_system`) [spec `SectionName`; docs `concepts/design-system.md`; skill `brand-template.md`, `brand-adherence/SKILL.md:287,335-345`]

There are 14 top-level sections. The skill also lists a 15th legal pull name, `metadata`.

| Section | Fields (as far as public sources show) |
|---|---|
| `profile` | `brand_name`, `source_url`, `tagline` (verbatim copy or null; never generated), `industry`, `primary_purpose`, `main_cta`, `page_type_category`, `page_type`, `copy_tone[]`, `brand_signature`, `visual_language{keywords, accent_strategy, highlights}`, `strategy{target_audience, executive_synthesis}`, `style_classification{primary_style, secondary_style}` (from a fixed set) |
| `colors` | `baseline[]` and `secondary[]` named palettes. Each has an uppercase 6-digit `hex`, `alpha`, `type`, `shades[]` and `rules.when_to_use[]`. There is also `insights[]`. |
| `typography` | `titles`, `paragraphs`, `labels` and `others` groups of variants. Each variant has `role`, `specs` (`font_weight` as a numeric string, raw `clamp(...)` sizes, `font_variation_settings`) and `technical.font_family_css`. |
| `layout` | `grid`, `breakpoints`, `section_separation`, `insights` |
| `actions` | `button_list[{name, usage, specs{radius, sizes[{name, font, size, padding}]}, visuals{default, hover, focus(outline), active, disabled}, notes}]`, `button_group`, `links.text_decoration` |
| `surfaces` | `gradients[]` with ready-to-use `css_code` |
| `elevation` | `shadows.levels[].css_value`, `borders[]` |
| `interactions` | `global_patterns`, `animations[{name, description, css}]`, easing, durations, `reduced_motion` |
| `navigation`, `structure`, `data_display`, `icons` | Optional and nullable. `icons[]` carries `svg_code`. |
| `assets` | `logos[{svg_code, url, role, format, description}]` and `media[{url, origin_url, …}]` |
| `sections` | The page's own ordered section blueprint |

**Gap: the docs do not publish the nested schema of most sections** (WebFetch said so explicitly). The nested shapes above come from the skills, which read real responses. Treat them as observed, not contractual.

**A full extraction is about 100 KB.** Pull it 2–3 sections at a time and save each pull to disk [skill: `brand-adherence/SKILL.md:253,277-291`].

### MCP tools for extraction [docs: `ai-tools/mcp.md`]

- `extract_brand(url, force=false, sections?)` returns a `submission_id`.
- `poll_brand_extraction(submission_id)`. The skill passes this as `brand_submission_id` [skill: `brand-adherence/SKILL.md:257`].
- `get_brand_extraction_result(submission_id, sections?)`.
- `list_brand_extractions(status?, search?, limit, offset)`.
- Legacy names from older servers: `submit_brand`, `get_submission`, `get_brand` [skill: `README.md:73-74`].

**Reachability.** The crawler must be able to reach the page. For localhost, the docs and the skill give an SSH reverse tunnel: `ssh -p 2222 -R <crawl-id>:80:localhost:<port> tunnel.tasting.dev deadline=3600s`, which gives a URL of the form `http://crawl-<uuid>`. Tunnel URLs never hit the cache [docs: submissions; skill: `brand-adherence/SKILL.md:259-271`].

---

## 4. SEARCH

| Method + path | Inputs | Output |
|---|---|---|
| `POST /search` | `query` (2–400 chars, required), `depth` (`fast` default: seconds; `deep`: up to ~3 min and more credits), `top_k` (1–30, default 6), `filters` | `{search_id, depth, results[BrandSearchCard], query_tags{industry[], page_type[], hue[], aesthetic[], style}}` |
| `GET /search/similar` | `submission_id` (a completed extraction), `top_k` (default 18, max 30) | `{results[BrandSearchCard]}`, closest first |
| `GET /search/submissions` | `kind` (search \| similar), `status`, `depth`, `q`, `api_key_id`, `limit` (default 20, max 100), `offset` | History only. **Results are not stored.** |

**Filters are hard constraints.** Every returned card satisfies them, and the list is never padded with lookalikes. Values are matched verbatim, so an unknown value returns 0 results, not an error. The vocabularies are closed:
- `page_type`: 15 values.
- `industry`: 37 values in the spec; the docs page says 31.
- `hue`: 9 values.
- `layout`: 8 values, e.g. `grid_based_strict`, `asymmetric_broken_grid`, `generous_whitespace`.

**`query_tags` are display-only.** They are the engine's soft reading of the query and never a constraint [spec].

**`BrandSearchCard` fields** [spec]:
- `url`, `brand_name`, `identity_paragraph`.
- `match` (`strong | good | related | null`).
- `reason` (one sentence).
- `badge` (`discovery | null`). `discovery` marks a rotating exemplar of the detected style, so identical searches do not return identical sets.
- `tags[]`.
- `palette{luminance, temperature, saturation, themes, aesthetic_codes, effects, primary[], secondary[]}`.
- `typography{family_strategy, hierarchy, character}`.
- `screenshot_url`.
- Ranking scores are **internal and not returned**. Rank order is the only signal.

**MCP tools** [docs]:
- `search_brands(query, depth="fast", top_k=6)`.
- `search_similar_brands(submission_id, top_k=18)`.
- Legacy name: `find_similar_brands`.

---

## 5. VERIFY

| Method + path | Inputs | Output |
|---|---|---|
| `POST /judge/brand-adherence` | `reference_url`, `candidate_url` (both required). `source_url` is a **deprecated alias** of `candidate_url`; send one, not both. | 202 `{job_id, status, reference_url, candidate_url, source_url, accepted_at, is_public, cache_hit}` |
| `GET /judge/brand-adherence` | `status`, `q`, `limit` (default 50, max 100), `offset` | Job list |
| `GET /judge/brand-adherence/{job_id}` | – | `AdherenceJob`. Includes `current_step` (e.g. `waiting_for_extractions`, `judging_scene`), `error`, `cache_hit`. |
| `GET /judge/brand-adherence/{job_id}/result` | – | `AdherenceVerdict`. Streams partial results. 409 `NOT_READY`. **424 `BRAND_ADHERENCE_FAILED` = terminal, stop polling.** |
| `PATCH /judge/brand-adherence/{job_id}/visibility` | `{"is_public": true}` | – |

**How it runs:**
- Status values: `accepted → extracting → judging → completed | failed`.
- Both URLs are extracted by the engine itself, and recent extractions are reused.
- `cache_hit` reports reuse per layer: `{design_extraction{reference, source}, verifier_extraction{reference, source}, final_report}`. Here `source` means the candidate side; the key keeps its historical name [spec].

**Verdict format** [spec: `AdherenceVerdict`]:

```json
{ "job_id": "...", "status": "completed",
  "reference_url": "https://stripe.com", "candidate_url": "https://staging.example.com",
  "score": 0.85,
  "recommendations": ["Snap the hero heading from 44px to 48px to match the reference type scale."],
  "fixes": [{"action": "snap_to_token", "property": "font_size", "from": "44px", "to_value": "48px"}] }
```

(The example is from the spec, shortened.)

- **`score`**: a number in [0,1], or `null` until at least one component has been scored. The skill says it is "a blend of the LLM judge and the deterministic checks" [skill: `brand-adherence/SKILL.md:383`].
- **`fixes`**:
  - Worst first, at most 20.
  - Open objects with an `action` discriminator plus fields specific to that action.
  - Actions seen: `snap_to_token`, `add_color_token` [spec], and `self_host_licensed_font` [skill: `:384`].
  - The full action list is not published.
- **`recommendations`**: strings, worst first, at most 20, "with exact target values".

**MCP tools** [docs]:
- `verify_brand_adherence(reference_url, candidate_url)`.
- `poll_brand_adherence(adherence_job_id)`.
- `get_brand_adherence_result(adherence_job_id)`.
- `list_brand_adherence_jobs(status?, limit, offset)`.

**Naming drift to watch:** the agent-loop docs page still says `source_url` for the candidate.

### The documented agent loop [docs: `use-cases/agent-loop.md`]

1. Build from the extracted brand.
2. Deploy somewhere the engine can reach.
3. Verify.
4. Hand the verdict back to the agent.
5. Redeploy and re-verify. Each pass is a new job.

**How to apply a verdict:** apply `fixes` mechanically first, then the `recommendations` top-down. When a recommendation has no concrete value, re-read the design system instead of guessing.

**Stop conditions:**
- A score threshold. Calibrate it with **two control runs**: one compliant page and one clearly non-compliant page.
- No clear improvement over the previous pass.
- A pass cap of 2–3, then escalate to a human.

**The skill is stricter than the docs.** It verifies, applies the verdict, and verifies *once more*. It does **not** act on the second verdict: the user decides whether a third round is worth the credits [skill: `brand-adherence/SKILL.md:389`].

---

## 6. Limits, errors, cost

**Error envelope:** `{"detail": {"error": CODE, "message": str}}`. The exceptions are 422 (a list of field issues) and search 502/503 (a plain string `detail`) [spec `Error`; docs `concepts/errors.md`].

| Code | Error | Handling |
|---|---|---|
| 401 | `UNAUTHORIZED` | Key missing, invalid or expired |
| 402 | `INSUFFICIENT_CREDITS` | Body includes `balance` and `required` |
| 403 | `FORBIDDEN` | Key lacks permission or scope |
| 404 | `NOT_FOUND` | Missing or not visible to you |
| 409 | `NOT_READY` | Keep polling |
| 422 | validation / `SELECTIVE_MAP_UNSUPPORTED` | Fix the request |
| 424 | `BRAND_ADHERENCE_FAILED` | Terminal; stop |
| 502 | search failed | Credit refunded |
| 503 | search at capacity | Honour `Retry-After` (seconds); credit refunded |

**Numeric limits:**

| Limit | Value | Source |
|---|---|---|
| Search `top_k` | ≤ 30 | [spec] |
| Search query length | 2–400 chars | [spec] |
| Map mode `max_urls` | ≤ 200 | [spec] |
| List `limit` | ≤ 100 | [spec] |
| fixes / recommendations per verdict | 20 each | [spec] |
| Deep search time | ~3 min | [spec] |
| SSH tunnel deadline | 3600 s | [skill] |

**Credits:**
- Charged per extraction, search and verification. A deep search costs more.
- Failed jobs are refunded, as are search failures and a failed explicit assets/icons extraction.
- **No credit prices and no request-rate limits are published** in the docs pages read. Treat cost as unknown and log `credits_consumed` from each response.

---

## 7. The skills (judgment layer) [skill]

| Skill | Tools | Core mechanism |
|---|---|---|
| `brand-search` (`skills/brand-search/SKILL.md`) | `search_brands`, `search_similar_brands`, `extract_brand`, `poll_brand_extraction`, `get_brand_extraction_result` | See below |
| `taste-director` (`skills/taste-director/SKILL.md`, `brand-template.md`) | The above, plus `list_brand_extractions` and `lookup_slop`, plus a driveable browser | See below |
| `brand-adherence` (`skills/brand-adherence/SKILL.md`) | Extract + verify tools | See below |

**`brand-search`** follows a "write the query without deciding the style" discipline:
- Carry the user's style words verbatim; never swap in synonyms (`:114-119`).
- Never add adjectives the prompt did not use (`:146`).
- Drop empty adjectives like "custom" or "unique" (`:148`).
- Choose colour references by *role* (ground, ink, accent), not by hue (`:121`).
- For "sites like X", use two lenses: `similar` for the look, and a deep `search_brands` for the cultural neighbourhood (`:134`).
- **Inspect every result, including discovery cards, without re-ranking** (`:152-158`).
- Extract only when you need the real values (`:164`).

**`taste-director`** works like this:
- Search the prompt, then one targeted query per thin facet, plus one cross-industry query. Every query is `deep`, `top_k=6`.
- **Rank decides authority.** Results 1–2 are locked as evidence; results 3–6 form an "inspiration shelf". Discovery cards can contribute one bounded, cited borrow (`:46-63`).
- Pick one master reference for the skeleton.
- Record every value with its source in `BRAND.json` (an extraction-shaped `design_system`, with provenance inside the existing `notes`/`description` fields) (`:128-130`; `brand-template.md`).
- **Close the references and build only from `BRAND.json`** (`:20,155`).
- Run `lookup_slop` *after* composing each section, never before (`:155`).
- Verify "as a stranger":
  - at 1440 and 390 px;
  - a value gate: every hex, font-size and radius must exist in `BRAND.json`;
  - side-by-side evidence pairs saved to `study/pairs/` (`:163-181`).
- **Not every tool is in the MCP docs.** `lookup_slop` appears only in this skill and the README. The repo ships this skill, but the docs skills page lists only `brand-search` and `brand-adherence`.

**`brand-adherence`** works like this:
- Pull the extraction section by section and save each pull to disk.
- Download the `css`, `html` and screenshot artifacts.
- Paste the real `@font-face` rules ("Naming a font without loading it is a failure").
- Take the logo's `svg_code`; never redraw it.
- Hard rules: zero invented hex values (tints only as `rgba()`/`color-mix()` of tokens), and component CSS copied verbatim. Layout and copy are free.
- Then run the verifier loop twice, as in §5.

**The workflow the skills share:**

```
search (prompt words verbatim) → inspect every card in rank order
→ lock evidence (rank 1–2 authority; shelf; discovery = bounded borrow)
→ extract locked refs (values + captured HTML/CSS/screenshots)
→ structured brand state (BRAND.json, every value cited)
→ close refs, build ONLY from state
→ verify (own render audit + external verifier; fixes then recommendations)
→ re-verify once → hand to human
```

**Mechanisms worth noting:**
- **Recency bias is handled by procedure.** The skills observe that the most recently viewed source sways the model. The countermeasure is to study widely, write the evidence to a file, then close the sources (`taste-director/SKILL.md:20`).
- **The generator must not certify itself.** "Your own eyes carry your own blind spots: you graded work you also made" (`brand-adherence/SKILL.md:370`).
- **No fake verdicts.** If the page cannot be put on a reachable URL, skip the verifier and say so; never present your own impression as a verdict (`:372`).

---

## 8. Blog evidence

**"Requests for research"** (2026-08-16, Hamidah Oderinwale) is a list of open problems, not architecture:
- designing models to design;
- the geometry of the visual web;
- evaluating spatial awareness, including telling verifiable layout targets apart from contested aesthetic ones;
- human interaction as a preference signal (intent inferred from edit sequences, detecting reward hacking);
- making design history legible.

Short quotes: "AI makes creation cheap, but judgment rare." "Designers think in states of their work, not line diffs." [claim / position statements]

**For cstack, this supports three choices:**
- learning from edits (§3.11);
- versioning by intent state (§22);
- keeping verifiable checks separate from aesthetic judgment (§3.8).

## Unreachable sources

- `https://tastelabs.com/blog/helping-agents-create-things-worth-making`: two WebFetch attempts both returned `PROVENANCE_REQUIRED`, because the permission request was withdrawn without an answer. curl to Taste Labs hosts is refused by the egress proxy (403 on CONNECT). **The post was not read, and nothing here is drawn from it.**
- Original `openapi.json` bytes: curl was refused (403 CONNECT on `docs.tastelabs.com`, `api.tastelabs.com` and `tastelabs.mintlify.app`). Only the WebFetch re-emission was saved (see the top of this note).
- API endpoint subpages (`api-reference/endpoint/*.md`): superseded by the OpenAPI file, which carries the same operations with full schemas. Not fetched one by one.

---

## 9. cstack provider interface (Taste Labs plugs in; nothing depends on it)

### Location and discovery

- Adapters live in `providers/taste-labs/`.
- They are registered in `registry/providers.json` with these fields: `id: "taste-labs"`, `capabilities: ["reference_search", "extractor", "verifier", "prompt_grounder", "slop_audit?"]`, `auth_env: "TASTE_API_KEY"`, `mcp_server: "taste-engine"`, `last_verified: 2026-10-03`, `status: {extractor: "1.0.0", search: "1.0.0-alpha", verifier: "1.0.0-alpha"}`.

**Resolution order per capability** (each step runs at preflight and is never assumed):
1. **MCP**: the host exposes the `taste-engine` tools. Probe with `list_brand_extractions(limit=1)`.
2. **REST**: `TASTE_API_KEY` is set. Probe with `GET /design/me`.
3. **Local fallback** (see the end of this section).

The resolved provider id is written into every output's `provider` field. Keys are never written to state; only provider job IDs are persisted (§25).

### Shared job model

All three capabilities return the same job shape:

```
Job { job_id, capability, provider, provider_job_id, status, step, partial: bool,
      created_at, completed_at, cache_hit, cost{credits, ref}, error }
status ∈ queued | running | completed | failed   (+ partial results allowed while running)
```

| Taste status | cstack status |
|---|---|
| `accepted`, `queued` | `queued` |
| `crawling`, `extracting`, `judging` | `running` |
| HTTP 409 `NOT_READY` | `running` with no result yet |
| HTTP 200 while running | `running`, `partial: true` |
| `completed` | `completed` |
| `failed`, or 424 | `failed` (terminal) |

**Polling:** back off from 3 s, with a 10 min ceiling per job. Honour `Retry-After` on 503.

**Idempotency:** before submitting, look up `state/cache/` (and `list_brand_extractions` / `GET /design/submissions?q=`) for a completed **full** extraction of the same URL. Reuse it unless `force`.

### `reference_search`

```
search(query: str, k=6, depth="fast"|"deep", filters?: {page_type, industry, hue, layout})
  -> { search_id, provider, query, query_tags_soft, results: ReferenceCard[] }
similar(extraction_id, k) -> { results: ReferenceCard[] }
ReferenceCard { rank, url, name, summary, match_tier, reason, is_discovery,
                tags[], palette{primary[], secondary[], luminance, temperature, saturation, themes[]},
                typography{family_strategy, hierarchy, character}, screenshot_url, retrieved_at }
```

| cstack field | Taste field |
|---|---|
| `rank` | array index + 1. Taste exposes no score, so **never re-rank**. |
| `url` | `url` |
| `name` | `brand_name` |
| `summary` | `identity_paragraph` |
| `match_tier` | `match` |
| `reason` | `reason` |
| `is_discovery` | `badge == "discovery"` |
| `tags` | `tags` |
| `palette.*` | `palette.*` |
| `typography.*` | `typography.*` |
| `screenshot_url` | `screenshot_url` |
| `search_id` | `search_id` |
| `query_tags_soft` | `query_tags`. Stored as display-only, never used as a filter. |
| `filters` | `filters`, passed through. An unknown value means 0 results, so validate against the vocabularies snapshotted in the adapter. |

The cstack judgment rules (in the `/taste-search` skill, not the adapter):
- query words stay verbatim;
- inspect all cards in rank order;
- rank 1–2 are evidence;
- discovery cards may supply one bounded, cited borrow.

### `extractor`

```
extract(url, sections?: SectionName[], force=false, deep=false) -> Job
result(job, sections?) -> Extraction
Extraction { extraction_id, source_url, captured_at, cache_hit,
             design_system: {<Taste section shape, kept verbatim>},
             artifacts: {html, css, screenshot, full_page_screenshot, element_layout} (local paths + remote urls) }
```

**Keep the raw Taste `design_system` verbatim** as `references/extractions/<host>/<extraction_id>/design_system.<section>.json`, one file per section (the skill's "save each pull" rule). Download the artifacts beside it. Then **normalise into `brand-system.schema.json`** (§5 of the master prompt). Every mapped field gets this provenance block:

`{source: "taste-labs:<extraction_id>#/<section>/<path>", source_url, captured_at: completed_at, method: "extracted", confidence: "observed", permanence: "core"|"campaign" (human decides; default "unconfirmed"), approval: "unconfirmed"}`

| Taste `design_system` path | cstack brand-system field |
|---|---|
| `profile.brand_name`, `source_url`, `tagline` | `metadata.name`, `metadata.source_url`, `naming.tagline` (null stays null: never invent) |
| `profile.industry`, `page_type`, `primary_purpose`, `main_cta` | `category`, `business_truth.purpose`, `claims.primary_cta` (all `inferred`) |
| `profile.copy_tone[]`, `brand_signature` | `voice.tone[]`, `voice.signature` (`inferred`, needs approval) |
| `profile.strategy.target_audience`, `executive_synthesis` | `customer_audience.summary`, `strategy.summary` (`inferred`) |
| `profile.visual_language.*`, `style_classification.*` | `graphic_devices.keywords`, `reference_mechanisms.style` (`inferred`) |
| `colors.baseline[]`, `secondary[]` (hex, alpha, shades, `rules.when_to_use`) | `color.core[]`, `color.secondary[]` with `{hex, alpha, shades, usage_rules}` (`observed`) |
| `colors.insights[]` | `color.notes` |
| `typography.{titles,paragraphs,labels,others}[]` (role, specs, `technical.font_family_css`) | `typography.families`, `type_hierarchy[]` (`observed`). `@font-face` URLs from `artifacts.css` go to `asset_registry.fonts[]` with a `license: "brand-owned – do not self-host without licence"` flag. |
| `layout.grid`, `breakpoints`, `section_separation` | `grid`, `layout.breakpoints`, `spacing.section` |
| `actions.button_list[]`, `links` | `components.buttons[]`, `components.links` |
| `surfaces.gradients[].css_code`, `elevation.shadows.levels[]`, `borders[]` | `materials.surfaces[]`, `components.elevation[]` |
| `interactions.*` | `motion.easing`, `motion.durations`, `motion.animations[]`, `motion.reduced_motion` |
| `navigation`, `structure`, `data_display` | `components.navigation`, `components.structure`, `components.data_display` (only if present) |
| `icons[].svg_code`, `assets.logos[]`, `assets.media[]` | `iconography[]`, `logo_marks[]` (svg_code + url + role), `asset_registry.media[]` |
| `sections[]` | `layout.page_blueprints[<page_type>]` (vocabulary only; not a mandate) |
| *(no Taste source)* | Beliefs, tensions, JTBD, proof, banned language, photography, casting, packaging, cultural territories, anti-references and compliance stay `unknown` and are listed under `known_uncertainties` |

`BRAND.json` (the Taste skill's shape) is kept as a **build-time export view** of cstack brand state for web work, not as the canonical schema.

### `verifier`

```
verify(reference: url | brand_state_ref, candidate: url | artifact_path, kind="brand_adherence") -> Job
verdict(job) -> Verdict
Verdict { verdict_id, kind, provider, judge{type: "llm+deterministic"|"deterministic"|"llm"|"human", version},
          reference, candidate, score: number|null, score_scale: "0-1", partial,
          fixes: Fix[], recommendations: string[], declined: [{item, reason}],
          cost, created_at }
Fix { action, target: {property?, from?, to?, token?}, raw: {...provider object...} }
```

| cstack field | Taste field |
|---|---|
| `verdict_id` | `job_id` |
| `reference` | `reference_url` |
| `candidate` | `candidate_url` (fall back to the deprecated `source_url`) |
| `score` | `score` (keep `null` while partial) |
| `fixes[].action` | `fixes[].action` |
| `fixes[].target.from` / `.to` / `.property` | `from` / `to_value` / `property`. Keep unknown action fields in `raw`. |
| `recommendations` | `recommendations` (keep the order: worst first) |
| `partial` | `status != completed` |
| `cost` | from the job `credits_consumed` where present |
| `kind` | always `"brand_adherence"`. **This is never a universal taste score** (§3.8, §29 anti-pattern "one universal taste score"). |

**Loop policy** (in the `/verify` workflow, not the adapter):
- Apply `fixes` mechanically, then recommendations top-down.
- A recommendation that would invent a token loses to brand state.
- Log what you decline.
- **Re-verify once, then stop and hand both scores to the human.**
- Thresholds are per brand, calibrated with a compliant control and a non-compliant control. Results are stored as eval fixtures and appended to `experiments/results.tsv`.
- **Candidate URLs must be reachable by the crawler.** If the candidate is only on loopback, ask before opening the Taste SSH tunnel (it exposes the local page to Taste Labs); otherwise fall back to local verification.

### Optional extra capabilities

| Capability | Taste mapping | Treat as |
|---|---|---|
| `prompt_grounder` | `POST /design/prompts/enhance` (full extraction only) | Optional |
| `slop_audit` | `lookup_slop` (seen only in a skill) | Unverified until probed |

### Fallback when no key and no MCP is present

The rule: **same output shapes, honest provenance, never pretend.**

| Capability | Fallback | Output marking |
|---|---|---|
| `reference_search` | 1. Search the local `references/gold` and `references/canon` tagged library (`reference.schema.json`). 2. Use URLs the user supplies. 3. Optionally use host web search; record the URL and screenshot. Same `ReferenceCard` shape. Cards come back in library order, not semantic rank. | `provider: "local"`, `match_tier: null`, `retrieval: "keyword"` |
| `extractor` | 1. If a headless browser is available: a deterministic local extractor (CSS custom properties, computed styles of key elements, `@font-face` rules, inline SVG logos, full-page screenshot) into the same `design_system` section files. 2. Otherwise: user-supplied CSS, tokens or brand docs. Fields it cannot see become `unknown`, never guessed. | `provider: "local-extractor"`, `confidence: "observed"` only for values read from CSS; profile fields `inferred` |
| `verifier` | 1. Deterministic gates: every hex, font-size and radius traces to brand state; fonts actually load; WCAG contrast; DOM skeleton vs spec; render at 1440 and 390. These emit `Fix` objects with the same `action` vocabulary (`snap_to_token`, `add_color_token`, …). 2. Structured comparative review by a judge that did not generate the work (a different model or a human), with side-by-side pairs. | `provider: "local"`, `judge.type: "deterministic"` or `"llm"`. **`score` is null unless the rubric defines one.** It is never labelled a Taste verdict. |

At preflight, a missing key yields one clear notice: "Taste Labs not configured; using local fallbacks (lower-fidelity search/extract, no external verifier)". It never blocks the workflow.

---

## 10. cstack implications

| Taste Labs mechanism | cstack decision |
|---|---|
| Three operations (extract / search / verify) as separate, composable services | **Borrow.** Three provider capabilities, with one job model and one provenance format |
| "Tools give capability, skills give judgment" | **Borrow as a rule.** Adapters hold no taste logic; skills hold the rules (verbatim queries, rank-as-authority, the verdict loop). Every skill's `TOOLS / PROVIDERS` section names capabilities, not vendors. |
| Search before you design; carry the prompt words verbatim; inspect every card; rank decides authority | **Borrow** into `/taste-search`, including the "no invented adjectives" rule |
| Lock evidence, write state with citations, close sources, build only from state | **Borrow.** Brand state is a build dependency; a value gate fails the build on untraced hex, size or radius |
| Extraction kept as verbatim JSON + captured HTML/CSS/screenshot artifacts | **Borrow.** Store the raw provider output beside the normalised brand state for lineage (§3.6) |
| Pull large state in small sections and save each one | **Borrow** as a context-budget rule (§24A) |
| Verdict = score + worst-first fixes (mechanical) + recommendations (prose), each capped at 20 | **Borrow** the `Verdict` shape for all verifiers, local ones included |
| Loop: verify → fix → re-verify once → human decides | **Borrow.** Cap at 2 passes; spend goes to the cost ledger |
| Calibrate thresholds with control runs | **Borrow** into evals (§18): one positive and one negative control per brand |
| Verifier crawls public URLs only, plus an SSH tunnel | **Treat carefully.** The tunnel exposes local work; require explicit consent. Keep the local verifier path first-class |
| A single 0–1 adherence score | **Do not generalise.** Keep it as `kind: brand_adherence`. Beauty, culture, effectiveness and correctness stay separate judgments (§3.8) |
| Web-only scope (sites, CSS) | **Do not overreach.** Taste covers web identity; photography, packaging, voice and campaigns need other evaluators behind the same interface |
| `BRAND.json` = extraction-shaped `design_system` | **Use as an export view** for web builds, not as the canonical brand schema (which is far broader: §5) |
| Alpha APIs, naming drift (`source_url` vs `candidate_url`, legacy tool names, two dashboard domains), undocumented `lookup_slop` | **Pin.** Snapshot the vocabularies and versions in the adapter with `last_verified`; probe tools at runtime; give T3 live tests a tiny budget |
| Unpublished credit prices and rate limits | **Log** `credits_consumed` per call; dry-run estimates before batch extraction (map mode up to 200 URLs) |
