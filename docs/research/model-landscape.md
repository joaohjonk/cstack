# Model landscape for `/model-router` (snapshot 2026-10-03)

Scope: master prompt §11. This is a **dated snapshot to seed the registry**, not a ranking to freeze into prose. The machine-readable seed is `models.seed.json`, with 45 entries. 37 of them have `last_verified: "2026-10-03"` because a price or spec was read from a provider page or provider-hosted catalogue today. The other 8 are `null`.

Method:
- WebSearch to find primary URLs, then WebFetch on provider docs and pricing pages.
- Higgsfield's first-party skills repo at `/home/claude/research-src/higgsfield-ai_skills` (release 0.13.0, 2026-09-26) as a cross-check of which models a serious aggregator routes to today.
- Artificial Analysis (AA) arenas for third-party preference rankings. These are a benchmark, not a source of truth. They go in `benchmark_results` only after cstack runs its own micro-benchmarks (§11), so the seed leaves those arrays empty.

Caveat: WebFetch returns a model-written summary of each page, not raw HTML. Numbers that looked inconsistent are flagged below and set to `confidence: medium` or `low` in the seed.

---

## 1. What changed recently (things a 2025-era router would get wrong)

| Fact | Evidence |
|---|---|
| **The OpenAI Sora Videos API is deprecated, with permanent shutdown scheduled for 2026-09-24**, which is already past. Do not route to `sora-2*`. | developers.openai.com/api/reference/resources/videos/methods/create |
| **OpenAI GPT Image 2.5** shipped 2026-09-08 as two models. `gpt-image-2.5-flare` is fast and the everyday default. `gpt-image-2.5-sunburst` is for edit precision and is the default on `/v1/images/edits`. Quality now goes up to `max`, edits take up to 16 input images, and output goes up to 3840x2160. | openai.com/index/introducing-chatgpt-images-2-5/ ; model pages ; images edit reference |
| **Google: Imagen is shut down on the Gemini API.** The image line is Nano Banana: `gemini-3.1-flash-image` (NB2), `gemini-3.1-flash-lite-image` (NB2 Lite), `gemini-3-pro-image` (NB Pro), and legacy `gemini-2.5-flash-image`. Video is **Gemini Omni Flash** (`gemini-omni-1.1-flash`, conversational video editing) plus Veo 3.1. | ai.google.dev/gemini-api/docs/image-generation ; /video ; /omni |
| **BFL FLUX 3**: FLUX 3 Video shipped 2026-08-04, with 2K/4K added 2026-09-10. FLUX 3 Image shipped 2026-10-01, two days ago. It is a unified generate+edit model with bbox layout control and 10 references. | docs.bfl.ai/release-notes |
| **ByteDance Seedance 2.5** shipped 2026-08-07, with 4–30 s clips. **Seedream 5.0 Pro** shipped Jul 2026. | Runway API changelog ; ai.byteplus.com/en/model |
| **Recraft V4.1** shipped 2026-05-14, and V4.1 Flash shipped Sep 2026 ($0.007, ~1.3 s). | recraft.ai docs |
| **Ideogram 4.0 is open-weight**, and Ideogram 4.5 generate and precise-edit exist. The Ideogram API also resells GPT Image 2.5, Kling v3, MiniMax H3 and Seedance. | ideogram.ai/models/4.0 ; developer.ideogram.ai |
| **New strong entrants on AA arenas (Sep 2026):** Microsoft **MAI-Image-2.6**, xAI **Grok Imagine Image 2.0**, Meta **Muse Image**, Alibaba **Qwen-Image-3.0** and **Wan 3.0**, **MiniMax H3 / H3 Max** (open weights per AA), Tencent **HunyuanImage 3.5**, **HiDream-O1-Video**, and **Utopai X** (no API). | artificialanalysis.ai leaderboards |
| **Aggregators now run model routers too.** Runway "Model Routers" pick a model under a price cap, optimising cost, latency or quality. Higgsfield has an "Auto" image model. | docs.dev.runwayml.com/model-routers/ ; Higgsfield model-catalog.md:42 |

## 2. Third-party preference rankings (AA, pages dated Sep 2026)

These are for orientation only. cstack's micro-benchmark on the real task overrides them (§11).

| Arena | Top entries (Elo) |
|---|---|
| Text-to-image | GPT Image 2.5 Sunburst max 1197 · Flare max 1191 · GPT Image 2 high 1172 · Grok Imagine Image 2.0 1155 · MAI-Image-2.6 1151 · Nano Banana 2 1125 · Muse Image 1115 · … Seedream 5.0 Pro 1081 (#15) |
| Image editing | Sunburst max 1180 · Flare max 1162 · MAI-Image-2.6 1137 · MAI-Image-2.6-Flash 1124 · GPT Image 2 1120 · Muse Image 1118 · … Nano Banana 2 1108 · Seedream 5.0 Pro 1107 |
| Text-to-video | Wan 3.0 1157 · Utopai X 1150 (no API) · Seedance 2.5 1144 · MiniMax H3 1139 · H3 Max 1134 |
| Image-to-video (v1.0) | MiniMax H3 Max 1195 · H3 1181 · Gemini Omni Flash 1178 · Seedance 2.0 720p 1176 · HiDream-O1-Video 1175 |

Notable gaps: FLUX 3 Image (2 days old), Recraft (vector isn't arena-rankable), Ideogram 4.x, Kling 3.0/O3 and Veo 3.1 did not appear in the fetched top lists. Absence from a top-N summary is not evidence of weakness.

Price per 1k images on AA ranges from ~$10 (Muse) to ~$211 (GPT Image at max quality). That is a 20x spread. Routing by job therefore matters more than routing by "best model".

## 3. Capability map for brand/product jobs (seed defaults; benchmark before trusting)

| Job | Candidates to micro-benchmark | Why (evidence) |
|---|---|---|
| Hero packshot / product edit with label text | gpt-image-2.5-sunburst, gemini-3.1-flash-image, seedream-5.0-pro, flux-3-image | Top of the AA edit arena; multi-ref; custom res up to 3840x2160 (OpenAI) / 4K (NB2, FLUX 3) |
| Cheap composition probes / contact sheets | recraftv4_1_flash ($0.007), z-image-turbo ($0.005/MP), gemini-3.1-flash-lite-image ($0.034, batch $0.017), flux-2-klein ($0.014), gpt-image-2.5-flare at `low` quality | §11 ladder: probe cheaply, then escalate |
| Logo / icon / vector brand marks | recraft-v4.1 vector ($0.08) / pro vector ($0.30); recraft vectorize ($0.01) after a raster model | The only native SVG generator verified. Higgsfield routes logos to Recraft (model-catalog.md:116) |
| Typography-heavy posters | gpt-image-2.5-*, ideogram-4.0/4.5, gemini image | Vendor claims plus AA rank. Ideogram has bbox text placement. **Deterministic layout first (§3.15)** |
| Character / face consistency | seedream-5.0-pro, Higgsfield Soul 2.0 (+Soul ID), NB2 | Higgsfield picking flow (model-catalog.md:111-114) |
| Pixel-exact local edit | ideogram-4.5 precise-edit (copies untouched pixels exactly per vendor), gpt-image-2.5-sunburst mask, flux-1-fill-pro | Vendor docs |
| Image-to-video from approved still | seedance-2.5, minimax-h3-max (cheap, #1 I2V), gemini-omni-1.1-flash, kling-video-v3-pro, veo-3.1 | AA I2V; Higgsfield default is Seedance 2.5 |
| Long single take (>15 s) | seedance-2.5 (4–30 s), wan3 (≤30 s), flux-3-video (≤20 s) | Provider docs/changelogs |
| Native 4K video | seedance-2.0 4K, flux-3-video UHD ($0.80/s), veo-3.1 4K, kling O3 4K | Docs |
| Conversational video revision | gemini-omni-1.1-flash (`previous_interaction_id`), seedance-2.5 `video_edit`, flux-3-video edit | Docs |
| Ad / UGC video with avatars | Higgsfield marketing_studio_video | First-party Higgsfield skill |
| Video creative scoring | Higgsfield brain_activity ("Virality Predictor") | Vendor claim; method undocumented. Treat as one weak signal (§3.12) |

## 4. Pricing snapshot highlights (USD; see the seed for units and sources)

| Model | Price | Source |
|---|---|---|
| gpt-image-2.5-flare / sunburst / gpt-image-2 | $5 text-in, $8 image-in, **$30 image-out** per 1M tokens; Batch output $15; cached input −75% | developers.openai.com pricing + model pages |
| gemini-3.1-flash-image | ~$0.045 (0.5K) / $0.067 (1K) / $0.101 (2K) / $0.151 (4K); batch 1K ~$0.034 | ai.google.dev pricing |
| gemini-3.1-flash-lite-image | ~$0.0336 (1K); batch ~$0.0168 | ai.google.dev pricing |
| gemini-3-pro-image | ~$0.134 (1K/2K), $0.24 (4K) on Vertex | cloud.google.com Vertex pricing |
| gemini-omni-1.1-flash | ~$0.10/s at 720p | ai.google.dev pricing |
| veo-3.1 std / fast / lite (A+V) | $0.40 / $0.10–0.30 / $0.05–0.08 "per 1 count" | Vertex pricing. **Unit printed as "1 count"; almost certainly per second. Re-verify.** |
| flux-3-image | $0.041 (768) / $0.048 (1K) / $0.100 (2K) / $0.607 (4K) | docs.bfl.ai pricing |
| flux-3-video | draft $0.06/s … UHD $0.80/s; continuation about 2x | docs.bfl.ai pricing |
| flux-2 pro / max / flex / klein | from $0.03 (edit $0.045) / $0.07 / $0.05 / $0.014–0.015, MP-scaled | docs.bfl.ai pricing |
| flux kontext pro / max | $0.04 / $0.08 | docs.bfl.ai pricing |
| seedream-5.0-pro (fal) | from $0.0675 | fal.ai/seedream-5.0 |
| seedance-2.5 (fal) | ~$0.22/s 480p, $0.47/s 720p, $1.16/s 1080p | fal model page |
| kling v3 pro (fal) | $0.112/s (no audio), $0.168 (audio), $0.196 (voice) | fal model page. fal pricing summary row says $0.14/s, which conflicts |
| minimax H3 Max / Turbo (fal) | $0.05/s / $0.025/s | fal.ai/pricing |
| recraft v4.1 flash / raster / vector / pro vector | $0.007 / $0.035 / $0.08 / $0.30 | recraft.ai pricing |
| ideogram-4.0 turbo / default / quality | $0.03 / $0.06 / $0.10 | ideogram.ai/models/4.0 |
| grok-imagine-image-2.0 | $0.04 (1K low) – $0.08 (2K medium) | docs.x.ai pricing |
| Runway credit | $0.01; gen4.5 12 cr/s; seedance2_5 20–68 cr/s; muse_image 1 cr; gpt_image_2_5_* 1–76 cr | docs.dev.runwayml.com pricing |

Rules for the registry: prices are snapshots with `source_url` and `last_verified`. The router must refuse to use a price older than its freshness window for budget guards (`karpathy-patterns.md` §4.8).

## 5. Provider async / queue / webhook / caching / idempotency semantics

| Provider | Submit → result | Webhooks | Retries / idempotency | Retention / caching / other |
|---|---|---|---|---|
| **fal** | `POST https://queue.fal.run/{endpoint}` returns `request_id`, `status_url`, `response_url`, `cancel_url`, `queue_position`. States: `IN_QUEUE` → `IN_PROGRESS` → `COMPLETED`. Poll `GET …/requests/{id}/status`, SSE `…/status/stream`, result at `…/response`. Cancel with `PUT …/cancel` (202 `CANCELLATION_REQUESTED` / 400 `ALREADY_COMPLETED`). | `webhook_url` on submit. Payload `{request_id, gateway_request_id, status: OK/ERROR, payload, error}`. ED25519 signature over the body hash + headers `X-Fal-Webhook-Request-Id`, `-User-Id`, `-Timestamp`, `-Signature`, with JWKS at rest.fal.ai/.well-known/jwks.json and ±5 min leeway. Up to 31 retries over ~1 h (6 min for results ≥10 KB). 3xx counts as a permanent failure. | Platform retries up to 10x on runner failure (`X-Fal-No-Retry` disables them). "Requests in the queue are never dropped." **No client idempotency-key header documented.** Dedupe webhooks on `request_id`. | `X-Fal-Queue-Priority: normal|low` (use low overnight). `X-Fal-Request-Timeout` is a *start* deadline. `X-Fal-Store-IO: 0` stops payload storage (default 30 days). `X-Fal-Object-Lifecycle-Preference` sets media expiry/ACL. `fal_max_queue_length` fails fast with 429. Response header `X-Fal-Billable-Units` gives the actual cost for the ledger. Fallback rerouting to equivalent endpoints is on by default (`x-app-fal-disable-fallback`). Docs: fal.ai/docs/documentation/model-apis/inference/queue.md, …/webhooks.md, …/common-parameters |
| **Black Forest Labs** | Submit returns `id` + `polling_url`. **Poll the returned `polling_url`; don't hard-code hosts.** Status `Ready` / `Error` / `Failed` (moderation responses include reasons since 2026-06-15). Endpoints `api.bfl.ai` (global failover), `api.eu.bfl.ai`, `api.us.bfl.ai`. | Webhooks exist. Payload status changed `SUCCESS`→`Ready` on 2026-02-17. Signature scheme not captured. | Concurrency 24 (kontext-max 6). Back off on 429. 402 means out of credits. No idempotency key documented. | **Result URLs expire after 10 minutes and have no CORS.** Download immediately and re-serve. Whitelist `delivery.*.bfl.ai`. 1 credit = $0.01. Auto top-up exists. |
| **OpenAI** | Images API is synchronous (base64 by default). Optional streaming `partial_images` 0–3. The Responses API supports background mode. **Batch API supports gpt-image-2.5 at 50% of output price.** | Platform webhooks (Standard-Webhooks style): headers `webhook-id`, `webhook-timestamp`, `webhook-signature` (`v1,…`). Retries with exponential backoff for up to 72 h. Duplicates possible, so dedupe on `webhook-id`. Events include response.completed and batch.*. | Use `webhook-id` as the idempotency key for events. (An `Idempotency-Key` request header for Images was not verified today.) | Cached image/text input is billed at −75% (prompt caching applies to input tokens). Pin dated snapshots (`…-2026-09-08`) for reproducible experiments. Videos API outputs had `expires_at` (now shut down). |
| **Google Gemini API / Vertex** | Image: synchronous `generateContent`, or Interactions API with `previous_interaction_id` for multi-turn edits. Veo: **long-running operation, poll about every 10 s until `done`**, with 11 s – 6 min latency. Omni: Interactions API; `delivery="uri"` for >4 MB, then poll for `ACTIVE`. | No webhook documented for Veo or Omni in the fetched pages. | No idempotency key documented. | **Batch API is −50%.** Context caching discounts cached tokens. Veo videos are kept on the server for 2 days. All images carry a SynthID watermark. Flex/Priority tiers exist on Vertex (NB Pro output $60 flex vs $120 standard vs $216 priority per 1M). |
| **Runway** | Create task returns `id`. `GET /v1/tasks/{id}`. Statuses `PENDING`, `THROTTLED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`. SDK `waitForTaskOutput()`. Header `X-Runway-Version` (e.g. `2024-11-06`) is required. | The guide mentions webhooks as an alternative to polling. Details not captured. | The guide mentions idempotency support. Details not captured; verify before relying on it. There's no RPM limit: excess tasks get `THROTTLED` and queue automatically. Concurrency runs from 1 (tier 1) to 20 (tier 5). | Output URLs expire. **Too many moderated requests can suspend the account**, so pre-screen prompts in overnight runs. Model Routers offer a price cap and cost/latency/quality optimisation, and the response reveals which model ran and what it cost. |
| **Ideogram** | Image endpoints are sync by default. Async via an `async` param or `webhook_url` returns `generation_id`. Poll `GET /v1/generations/{generation_id}` as a fallback. Video and tool endpoints are always async. | ED25519 signature over generation id + user id + timestamp + SHA-256(raw body), with JWKS at api.ideogram.ai/v1/.well-known/jwks.json. Return 2xx. | Retries happen, so "process the same generation_id as a no-op". Default limit is 10 in-flight requests. | Image URLs expire, so download them. API credits are shared with the app. |
| **Higgsfield** | CLI `higgsfield generate create <model> … --wait` (default timeout 10 m, poll 3 s). `generate get/wait/list`. Media flags accept a path, an upload id, or **a previous job id** (handy for chaining lineage). `generate cost …` estimates credits before submitting. | API param `hf_webhook`. Envelope `{request_id, status, error, payload}`. Statuses include `completed`, `failed`, `nsfw`. 5xx and network errors retried for up to 2 h; 4xx stops retries. Must respond within 10 s. | "Duplicate deliveries are possible. Deduplicate by request_id and terminal status." | The CLI clamps unsupported aspect ratios and durations, reporting them as "adjustments" (non-fatal), and rejects unknown params. Log adjustments in the ledger. The skills repo tells agents not to pre-estimate cost unless asked; cstack should do the opposite for overnight runs. |
| **xAI** | Imagine API (image/video). | n/a | n/a | Batch discount up to 20%. Priority costs 2x. The US regional endpoint costs +10%. |
| **Recraft** | Synchronous generate. V4.1 Flash docs recommend `response_format: multipart` for latency. | n/a | n/a | 1,000 API units = $1. |
| **Kling (direct)** | Task API with callback (from search result titles only). | **Not verified.** The pages are JS-rendered and unreadable via fetch. | — | Use fal / Higgsfield / Ideogram as verified access paths for now. |
| **BytePlus ModelArk (Seed)** | **Not verified.** Pages are JS-rendered and prices showed "Loading". | — | — | Seedance 2.5 is sold in 3-month subscription tiers with per-token usage (product page). |

### Design consequences for cstack's provider layer
1. **Default to queue + webhook, with polling as a fallback.** Every provider here can lose or duplicate a webhook. Verify signatures (fal and Ideogram both use ED25519 + JWKS; OpenAI uses Standard-Webhooks). Dedupe on the provider's id.
2. **Client-side idempotency is our job.** Of the providers checked, only Runway's guide mentions idempotency. cstack derives `call_key = hash(provider, model@snapshot, compiled_prompt_hash, input_hashes, params, seed)` and checks the ledger and asset store before submitting (dedupe, §11). It reuses `call_key` on retry and records the provider request id against it.
3. **Download immediately.** BFL results die in 10 min. Veo keeps them 2 days. fal, Runway and Ideogram URLs expire. Copy outputs into the cstack asset store on completion and hash them.
4. **Batch for overnight work.** OpenAI images −50% output, Gemini −50%, Vertex Flex, xAI up to −20%, fal `low` priority.
5. **Record actual cost where the provider reports it** (fal `X-Fal-Billable-Units`, Runway cost-in-response for routers, Higgsfield `generate cost`). Otherwise estimate from the snapshot and flag the row as estimated.
6. **Treat aggregator and direct access as separate registry rows when price or params differ.** Seedance 2.5 sells at different prices on fal, Runway, BytePlus and Higgsfield, and Higgsfield's wrapper changes the accepted media roles.

## 6. Unreachable or unverified sources

| Source | What was tried | Result |
|---|---|---|
| kling.ai/dev/pricing, kling.ai/document-api/... | WebFetch | JS-rendered; no prices or params extracted. Kling direct pricing and webhook semantics are unverified. |
| docs.byteplus.com ModelArk image API, BytePlus Seedance pricing | WebFetch | Navigation only / "Loading pricing". |
| ideogram.ai/features/api-pricing | WebFetch | "Loading current prices". Used the ideogram.ai/models/4.0 prices instead. Ideogram 4.5 price is unknown. |
| fal.ai/models catalogue index, platform.openai.com pricing/changelog | WebFetch | Permission timeout / 503. Used developers.openai.com and individual fal model pages instead. |
| Higgsfield public API pricing | not found | Credits only via the CLI `generate cost`. |
| MAI-Image-2.6, Qwen-Image-3.0 provider pages | not fetched | Only AA data. Seed rows are `confidence: low`, `last_verified: null`. |
| Luma, Pika, Moonvalley, LTX, Midjourney API | not researched (time) | Not in seed. Add on demand. |

## 7. cstack implications

| Mechanism | Borrow | Don't borrow |
|---|---|---|
| A registry snapshot with `source_url` + `last_verified` | Seed `/model-router` from `models.seed.json`. Run a weekly re-verify job that diffs prices and model ids and flags stale rows in the skill health dashboard (§24A). | Ranking prose in skills. Skills should reference registry capabilities, not model names. |
| Higgsfield picking flow (intent → default, others "only when asked") | A short default per job type plus explicit fallback chains. Honour a model the user names and keep it for follow-ups. | Higgsfield's "don't pre-estimate cost". cstack always estimates for batches and autoresearch. |
| Runway Model Routers (price cap + optimise cost/latency/quality) | The router API shape: `route(job, constraints{max_cost, max_latency, needs[]}, optimise)` → model + reason, logged. | Opaque vendor routing as final authority. Keep our own micro-benchmark evidence. |
| Draft tiers (FLUX 3 draft, Veo Lite, NB2 Lite, Recraft Flash, GPT `low`) | The §11 probe → select → final ladder maps directly onto these. | Rendering finals at premium tier to "discover composition". |
| Dated snapshots (OpenAI `-2026-09-08`) | Pin snapshots in experiment run specs. | Floating aliases inside autoresearch runs. |
| Webhook signatures + dedupe ids | One verified-webhook receiver with per-provider verifiers and a dedupe table. | Trusting unsigned callbacks. |
| AA arenas | A cheap prior for which candidates enter a micro-benchmark. | Promoting a model on AA Elo alone. Brand fidelity isn't what AA measures. |
| Deprecation churn (Sora shut down, Imagen off Gemini, Gen-4 Aleph sunset) | A `status: active|deprecated|shut_down` field and a health check that fails on routes to dead models. | — |
