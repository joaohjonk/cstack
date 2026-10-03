# AI video making for cstack (snapshot 2026-10-03)

Scope: what cstack needs to make video well — models, the flows practitioners actually use, who ships real agent tooling, the best flow per outcome, and what can be deterministic. It extends `model-landscape.md` (video rows), `public-repo-patterns.md` (Higgsfield, goose) and `startup-landscape.md` (Runway, fal, Krea). Brand-agnostic; no workspace data.

**Evidence labels.** `[O]` observed: code read in a local clone under `research-src/`, or a command run in this sandbox today. `[D]` documented: a vendor's own docs or pricing page. `[3P]` a third-party article or press report (dated). `[M]` marketing claim. `[I]` inferred by this note. Every URL was accessed 2026-10-03 unless a date is given. WebFetch returns a model summary of each page, so prices are snapshots to re-verify before budgeting. ycombinator.com blocks fetching (robots.txt), so YC facts come from search-indexed titles and launch pages.

---

## 0. Ten things a 2025-era video agent gets wrong

| # | Fact | Label / source |
|---|---|---|
| 1 | **Sora is gone.** OpenAI announced on 2026-03-24 that it would discontinue the Sora app and API. The Videos API shutdown was set for 2026-09-24. Some aggregator MCPs still list "Sora 2" in their catalogues. | [3P] engadget.com/ai/openai-is-shutting-down-its-sora-video-generation-app-211023358.html ; [D] developers.openai.com (see model-landscape.md) ; [3P] mcp.directory/blog/higgsfield-mcp-guide (Apr 2026, still lists Sora 2) |
| 2 | **Native audio is the default** on the top models: Veo 3.1, Kling 3.0, Seedance 2.x, LTX-2.x and Wan. Leaving audio off costs less, for example $0.20/s instead of $0.40/s on Veo 3.1 at 1080p (fal). | [D] fal.ai/models/fal-ai/veo3.1/image-to-video |
| 3 | **Multi-shot in one generation** is real. Kling 3.0 `multi_prompt` gives up to 6 shots. Seedance timeline prompts with explicit time ranges render as hard cuts, while unstaged prompts render as morphs. | [D] fal Kling v3 page ; [3P] apiframe.ai/guides/kling-3-0-guide ; [O] krea-ai_skills `krea-generate/references/models/seedance-2.md:161-176` |
| 4 | **The start image is the quality ceiling.** A cropped frame with a half-visible logo garbled the logo in every downstream generation. A clean retailer-grade packshot held dense label text through six beats. | [O] krea-ai_skills `krea-marketing/workflows/cinematic-product-ad.md` step 2 |
| 5 | **Never ask a video model for text.** Captions, CTAs and supers are burned in deterministically (ffmpeg drawtext/libass, or an HTML composition layer). | [O] krea `references/video-ad-post.md:3` ; goose `caption-burn/SKILL.md` |
| 6 | **Agents now get first-party remote MCPs** from fal, Higgsfield, HeyGen and Replicate, plus Runway's skills and MCP plugin. All of them use OAuth except Replicate (API key). | [D] fal.ai/docs/model-apis/mcp ; docs.heygen.com/docs/heygen-remote-mcp-server ; replicate.com/docs/reference/mcp.md ; [3P] mcp.directory (Higgsfield, launched 2026-04-28) |
| 7 | **HTML-to-video is the new deterministic motion layer.** HeyGen open-sourced HyperFrames (Apache-2.0): HTML + GSAP/Lottie/Three, rendered by headless Chrome and encoded with ffmpeg, "same input, same frames". Remotion is source-available and needs a company license above 3 employees. | [D] github.com/heygen-com/hyperframes ; github.com/remotion-dev/remotion/blob/main/LICENSE.md |
| 8 | **Disclosure is now enforced in machine-readable form.** TikTok and Meta auto-label from C2PA. EU AI Act Art. 50 applies from 2026-08-02. The FTC rule (effective 2024-10-21) bans testimonials that misrepresent the reviewer's existence or experience. | [3P] cinerads.com/blog/ai-ad-disclosure-requirements (2026-07-21) ; [3P] datamatters.sidley.com/2024/08/30/... |
| 9 | **Music licensing moved from lawsuits to deals.** UMG–Udio settled 2025-10-29 and WMG–Suno in Nov 2025, with licensed models in 2026. Sony was still litigating as of June 2026. ElevenLabs says Music is trained only on licensed data. | [3P] blog.dubspot.com/ai-music-licensing-explained-2026 ; [M] mindstudio.ai/blog/elevenlabs-music-v2-... |
| 10 | **Launch promos expire.** fal's MiniMax H3 Max was 50% off until 2026-09-30, so 1080p is now $0.16/s, not $0.08. The registry's flat $0.05/s is the 480p price. | [D] fal.ai/models/minimax/h3-max/image-to-video |

---

## 1. Model landscape for video

### 1.1 Generation models

Prices are USD per output second unless noted. The modes column uses these abbreviations: t2v = text-to-video, i2v = image-to-video, S/E = start/end frame, refs = subject/element references, MS = multi-shot, ext = extend, v2v = video edit, A = native audio.

| Model (access) | Modes | Duration / res | Price snapshot | Strengths / weaknesses / product-fidelity behaviour | Label |
|---|---|---|---|---|---|
| **Seedance 2.5** (BytePlus, fal, Runway, Higgsfield) | t2v, i2v, S/E, omni-refs (img/video/audio), v2v, ext, MS, A | 4–30 s; 480p/720p/1080p | fal ~$0.22 (480p) / $0.47 (720p) / $1.16 (1080p); Runway 20–68 cr/s | Default motion engine for Higgsfield and Krea. With a staged timeline prompt and a "keep every printed line exactly as shown" lock in both the refs block and the tail, labels hold. Without the tail, "great first 2 s, then drifts". Untamed defaults are glossy, centered, blue-graded and floaty. | [D] registry row; [O] higgsfield `model-catalog.md:50,128`; krea `krea-motion/SKILL.md` rules 3–8 |
| **Seedance 2.0** (+fast, mini) | t2v, i2v, S/E, refs, A | 4–15 s; up to 4K | fal $0.014/1k tokens; Runway 36–150 cr/s | The native-4K route. Krea uses mini/fast for blocking and 2.5 for delivery. | [D] fal.ai/pricing; [O] krea rule 9 |
| **Kling 3.0 Pro** (fal) | i2v, t2v, end frame, `@Element` refs, `multi_prompt` MS, A, voice control | 3–15 s; aspect taken from the start image | $0.112 silent / $0.168 audio / $0.196 voice (model page); the fal pricing table says $0.14 | Strong start→end transitions (the most-copied hook-transition technique). Native audio speaks Chinese and English; other languages are auto-translated to English. | [D] fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video |
| **Kling 3.0** (direct, via apiframe credits) | as above + 4K mode, up to 60 fps | 3–15 s, native 3840x2160 | Std 24 / Std+A 37 / Pro 32 / Pro+A 49 / 4K 61 credits/s at $0.01 | Released 2026-02-05. "Visual chain-of-thought" is [M]. Direct pricing runs about 3x fal's: a separate registry row. | [3P] apiframe.ai/guides/kling-3-0-guide |
| **Kling 2.5 Turbo Pro** (fal) | i2v | ~5–10 s | $0.07 | A cheap draft tier for Kling-style motion. | [D] fal.ai/pricing |
| **Veo 3.1** (Gemini API, Vertex, fal, Runway, Higgsfield) | t2v, i2v, first/last frame, ref images, ext, A | 4/6/8 s; 720p/1080p/4K; 16:9, 9:16 | fal Std: $0.20 silent / $0.40 A (720p–1080p), $0.40 / $0.60 (4K). Fast first-last: $0.10 / $0.15, 4K $0.30 / $0.35. Runway 20–40 cr/s | The best-known lip-sync and dialogue scenes. A 2-day ad for the 2025 NBA Finals took about 300–400 generations for 15 usable clips. Only 8 s per call, so long pieces need many cuts. SynthID watermark. | [D] fal Veo pages; [3P] eweek.com/news/ai-ad-kalshi-nba-finals/ (2025-06-16) |
| **Gemini Omni Flash 1.1** | refs-to-video, conversational edit, A | 5–10 s; 360p–4K | ~$0.10/s at 720p (Gemini); Runway 3.4–30 cr/s | Edits by `previous_interaction_id`. Higgsfield's explainer pipeline uses it for every 10 s block. | [D] registry; [O] higgsfield `higgsfield-video-explainer/SKILL.md` |
| **MiniMax H3 / H3 Max (Hailuo 3)** (fal, Runway, Higgsfield) | t2v, i2v, S/E, refs | 480p/768p/1080p | H3 Max: $0.05 / $0.08 / $0.16 by resolution after the promo ended 2026-09-30. Turbo $0.025 at 480p | Led the AA I2V arena in Sep 2026. A cheap, high-ceiling i2v probe tier. | [D] fal.ai/models/minimax/h3-max/image-to-video |
| **Wan 3.0 / 3 Prime** (Alibaba, Runway, Higgsfield) | t2v, i2v, A | up to 30 s, 1080p | Runway 5–20 / 6.8–28 cr/s | GA on 2026-08-24, **closed weights**. Wan 2.2 is the last widely used open checkpoint (not re-verified today). | [3P] aiunderstanding.org/news/alibaba-makes-wan3-0-...; [D] Runway pricing |
| **LTX-2 / LTX-2.3** (Lightricks; fal; open weights) | t2v, i2v, A, retake, extend, audio-to-video | ~10 s; up to 4K; up to 50 fps | fal LTX-2 Pro: $0.06 (1080p) / $0.12 (1440p) / $0.24 (2160p). LTX-2.3 Pro $0.08 / $0.32 per a 3P summary | **The open-weight option with audio** (LTX-2 Community License; commercial use with conditions). Ships Clean-Plate and SDR→HDR LoRAs. Useful for local or self-hosted runs and LoRA-locked product looks. | [D] fal.ai/models/fal-ai/ltx-2/image-to-video; [3P] invideo.io/blog/ltx-ai-video-generator/ (Aug 2026) |
| **Luma Ray 3.2** (Luma API) | t2v, i2v, edit, keyframe extend, reframe, HDR/EXR | 5/10 s blocks; 360p draft → 1080p | $0.06–$3.60 per generation; edit $0.54–$12.96; reframe $0.03–$0.36/s ("subject to change before GA") | **HDR + EXR export** for grading in Resolve. The only listed model with a 360p draft tier that maps onto the probe ladder. | [D] docs.agents.lumalabs.ai/guides/pricing/ |
| **Runway Gen-4.5 / Gen-4 Turbo / Aleph 2** | t2v, i2v; Aleph = v2v edit | — | 12 / 5 / 28 cr/s | Gen-4 Aleph v1 was sunset 2026-07-30. Runway Model Routers (price cap, dryRun) are the reference design for cstack's router. | [D] docs.dev.runwayml.com/guides/pricing/ |
| **FLUX 3 Video** (BFL) | t2v, i2v, keyframes, continuation, edit, draft mode, A | ≤20 s; up to UHD | draft $0.06 … UHD $0.80 | Has a dedicated draft tier. | [D] registry |
| **Grok Imagine 1.5** (xAI, Runway, Higgsfield) | i2v (required frame), t2v, A | 2–15 s | Runway 10–29 cr/s | Stylised and high-contrast; Higgsfield routes it "only when asked". | [O] higgsfield `model-catalog.md:64` |
| **Pika 2.2** (fal) | i2v | 5 s; 720p/1080p | $0.20 / $0.45 per 5 s clip | No newer Pika endpoint found on fal. Mark it `watch`. | [D] fal.ai/models/fal-ai/pika/v2.2/image-to-video |
| **Higgsfield Marketing Studio / Cinema Studio 4.0** | ad/UGC/unboxing presets; Cinema: omni-refs, edit, ext, camera/lens controls | ≤1080p | credits via `higgsfield generate cost` | Wrappers over third-party models with presets. Higgsfield routes "all advertising video" to Marketing Studio. The "Virality Predictor" (`brain_activity`) is an undocumented-method score: one weak signal at most. | [O] higgsfield `model-catalog.md:54-55,99,127` |

### 1.2 Lip-sync, avatars, performance

| Tool | What | Price snapshot | Notes | Label |
|---|---|---|---|---|
| HeyGen Avatar IV / V | talking avatar from photo or digital twin | 0.1 credit/s at $0.50/credit = **$0.05/s** (enterprise API) | Remote MCP at `mcp.heygen.com/mcp/v1/` (OAuth, uses plan credits, 11 tools incl. Video Agent and translation). | [D] developers.heygen.com/docs/enterprise-pricing.md ; docs.heygen.com/docs/heygen-remote-mcp-server |
| HeyGen Video Agent / Translation / HyperFrames render | prompt-to-video; dubbing; hosted HTML render | 0.0667 cr/s; 0.05–0.1 cr/s; 0.1–0.3 cr/min | HyperFrames is also free to run locally (Apache-2.0). | [D] same |
| Captions / Mirage API | "Avatar X" generation; auto-captions | $0.15/s (rounded up to 6 s); captions $0.15/min | A real usage-priced API. | [D] captions.ai/help/docs/api/pricing.md |
| Kling AI Avatar v2 Pro (fal) | image + audio → talking video | $0.115/s | Humans, animals, cartoons. | [D] fal.ai/models/fal-ai/kling-video/ai-avatar/v2/pro |
| sync.so lipsync-2 / 2-pro / sync-3 | re-lip existing footage to new audio | $0.04–0.05 / $0.067–0.083 / $0.107–0.133 per s | sync-3 is native 4K and handles profile shots and obstructions. The right tool for localising a real shoot. | [D] sync.so/docs/models |
| Runway GWM-1 Avatars (Characters) | realtime avatars | 2 cr upfront + 2 cr per 6 s | Avatar ids act as consistency entities. | [D] Runway pricing |
| Hedra Character-3 | talking character | not verified today | Third-party reviews only. | — |

### 1.3 Audio, upscaling, interpolation

| Tool | Price snapshot | Use | Label |
|---|---|---|---|
| ElevenLabs Sound Effects v2 (fal) | **$0.002/s** | per-cut SFX, risers, whooshes | [D] fal.ai/models/fal-ai/elevenlabs/sound-effects/v2 |
| ElevenLabs Music | price not captured | licensed-data music bed; commercial use per ElevenLabs terms | [M] mindstudio.ai (vendor-sourced claims) |
| Suno / Udio | subscription | Commercial rights on paid plans; no copyright warranty; Udio is moving to a walled garden. Treat as **owner-approved only**, never a default. | [3P] dubspot (Jun 2026) |
| Seed Audio, ElevenLabs V4 TTS, dubbing, isolation (Runway) | 0.25 cr/s; 2.2 cr/1k chars (promo to 2026-10-12) | VO, dubbing, cleanup | [D] Runway pricing |
| Topaz video upscale (fal) | $0.01/s ≤720p, $0.02/s ≤1080p, $0.08/s above; 60 fps doubles; Gaia 2 halves | **last step, approved cut only** | [D] fal.ai/models/fal-ai/topaz/upscale/video |
| SeedVR2 video upscale (fal) | $0.001 per megapixel·frame (1080p × 121 frames = $0.25) | cheaper temporal-consistent upscale | [D] fal.ai/models/fal-ai/seedvr/upscale/video |
| Magnific video upscaler; Enhance Frame Rate; Ruby SDR→HDR (Runway) | ~210–360 cr/10 s; 1 cr/2 s; 20–40 cr/s | alternatives | [D] Runway pricing |
| ffmpeg `minterpolate` | free | Interpolation for slow-mo or ramps. Smears fast motion, so check flicker. | [O] filter present locally |

---

## 2. Practitioner flows (X, Instagram, TikTok, YouTube, 2025–26)

Recurring sources (named generally): AI-filmmaker accounts posting ad breakdowns (e.g. the creator of the 2025 NBA Finals Veo ad), animated-short channels whose stills-first pipeline is written up by third parties (the "Gossip Goblin" workflow), YouTube tutorial channels (Theoretically Media, Curious Refuge-style courses), vendor "how we made it" threads (Higgsfield, Krea, Runway), and performance-marketing blogs and agencies posting AI-UGC test matrices. Treat individual virality claims as [3P]. **The repeatable mechanisms are what matter:**

1. **Script → LLM shot list → batch prompts → many generations → edit.** "Return 5 prompts at a time; more and quality slips." The ratio was about 25:1 (300–400 generations for 15 clips). [3P] eweek 2025-06-16. *Implication: budget selection ratios, not unit prices.*
2. **Stills-first (approve keyframes → i2v).** Image model for the frame (Midjourney + Nano Banana edit), then first-frame i2v. The director decides composition before motion, and avoids omni-reference models choosing the camera. [3P] mindstudio.ai/blog/gossip-goblin-ai-filmmaking-workflow ; [O] the Krea retake path (`cinematic-product-ad.md` step 8) and the cstack PREAMBLE §3 ladder.
3. **Start/end-frame transitions.** Take the last frame of clip A and the first frame of clip B, feed both to Kling 3.0 S/E, and describe the transition explicitly ("otherwise the model will make it up"). 3–8 s; generate variants. [3P] gotranscript.com/public/create-viral-hook-transitions-with-kling-30-frames.
4. **Reference sheets for multi-shot consistency.** A character or product turnaround sheet (front/side/back) is generated or edited in an image model and reused as refs on every shot. Krea's rule: "lock 2–3 face refs and reuse the exact same set on every take"; text-only personas regenerate a new face per job. [O] krea `ugc-social-video.md` "Talent Consistency".
5. **One-shot staged timeline, stills-first only for retakes.** Krea's primary product-ad path is one Seedance multi-shot prompt (4–6 beats, each ≤2.5 s, product beats alternating with texture/ingredient cutaways). Then scene-detect the output to confirm real cuts. [O] `cinematic-product-ad.md` steps 4–7.
6. **AI UGC test matrix.** Hooks × scripts × avatars (5×4×2 = 40 variants per cycle). Hook in the first 1–2 s. Five hook angles: problem, proof, curiosity, contrarian, confession. Tag results back into the next brief. [3P] segwise.ai/blog/ai-ugc-workflow-for-marketers (Jun–Aug 2026). Realism rubric: pores, asymmetry, handheld micro-shake, room light. Banned words: "cinematic, studio, dolly, key light". Do not write "selfie", because models render a phone in hand. [O] krea `ugc-social-video.md`.
7. **Product spins.** Either 360° from one photo (Higgsfield and Segmind marketing pages, which means the unseen back is invented [I]) or an orbiting hero from a real-photo restyle plus i2v, closed on a deterministic end card (goose `render-3d-product-showcase`: "product geometry is real and never AI-invented"). [M] geo.higgsfield.ai/blog/higgsfield-360-degree-product-spin-from-one-photo ; [O] goose `render-3d-product-showcase/SKILL.md`.
8. **Cut, don't drift.** For product and logo motion: open inside the subject (macro), jump scale, angle and light on every cut, reveal the whole object last, and quantify every move ("distance, duration, constant rate"). One slow 8 s move is the named failure. [O] krea `krea-motion/SKILL.md` hard rules 3–8.
9. **Surgical retakes on the video track only.** Replace one beat between detected scene cuts and keep the master audio, so lip-sync survives. [O] goose `ugc-fixloop/SKILL.md` (`stitch_replacement.py`, pure ffmpeg).
10. **Post stack.** Edit in CapCut (social), Premiere or Resolve (pro). Captions are burned in 2–3 words per phrase, ≤1.1 s each, timed to real audio (Whisper word timings). One music bed instead of per-clip generated audio. Upscale last. [O] krea `video-ad-post.md`; goose `caption-burn`; [3P] cliprise / autoeditai 2026 post-production guides.
11. **Cross-model prompt vetting before render.** A non-author model reviews the video prompt (verdict, line edits, word budget, consistency risk). goose makes this advisory, not a gate. [O] goose `ugc-fixloop` `vet_seedance_prompt.py`.

---

## 3. Benchmarks: who ships real agent tooling

| Company | What an agent can actually use | Real vs marketing | Mechanism worth borrowing |
|---|---|---|---|
| **Runway** | `runwayml/skills` (rw-generate-video/image/audio scripts, dev skills for routers, workflows, characters), SDKs, OpenAPI, MCP plugin | **Real** [O] `runwayml_skills/skills/rw-generate-video/SKILL.md` | Key only in env (`RUNWAYML_API_SECRET`, "no --api-key flag"); `dryRun` plus one billable verification; router explains which model ran |
| **Higgsfield** | CLI + 8 skills + remote MCP (`mcp.higgsfield.ai/mcp`, OAuth, 2026-04-28) | **Real** CLI/skills [O]; presets and Virality Predictor are [M] | Live catalogs (`model list`, `preset list`); media flags accept a previous job id (lineage chaining); voice-first then clip then server-side assembly (`explainer_video`) |
| **fal** | Remote MCP `mcp.fal.ai/mcp-relay` (OAuth): `search_models`, `get_model_schema`, `get_pricing`, `submit_job`, `check_job`, `cancel_job`, `upload_file`; queue + signed webhooks | **Real** [D] fal.ai/docs/model-apis/mcp | `get_pricing` before run maps onto cstack spend preflight; already cstack's implemented provider |
| **Replicate** | `replicate-mcp` (npm) + remote `mcp.replicate.com` (API key); experimental "code mode" | **Real** [D] | Second aggregator for fallback rows |
| **Krea** | `krea-ai/skills` v0.7.6: krea-motion, krea-marketing (UGC, product ad, launch teaser, QA), faceless-video, hero evals | **Real**, the most transferable craft docs found [O] | Timeline prompt architecture (motion split, world lock, constraints tail); vision-gated start image; scene-detect QA; retake log `shot_id,priority,issue,fix_type,status` |
| **Gooseworks** | `goose-skills`: ~40 `render-*` formats, `caption-burn`, `ugc-fixloop`, `create-video-fal`, falsify fixtures | **Real** [O]; renderers bill through their proxy | Free deterministic assembly separated from paid beat generation; poll timeout never resubmits |
| **HeyGen** | Remote MCP (OAuth, plan credits); enterprise API; **HyperFrames** (Apache-2.0, `npx hyperframes init/preview/render/lint`, 21 agent skills) | **Real** [D] github.com/heygen-com/hyperframes | Deterministic HTML motion layer for type, cards and captions; `lint` before render |
| **Captions / Mirage** | Usage-priced API (avatar, captions) | Real API [D]; quality claims [M] | — |
| **Kling (direct)** | Task API with callback | Pages are JS-rendered; reached via fal, Higgsfield or apiframe [D 3P] | Treat direct as a separate, pricier row |
| **YC: Mosaic (W25)** | Node canvas of video-editing agents; **XML export to Resolve, FCP and Premiere** | Product [3P] HN launch hn.svelte.dev/item/45980760 | Moved from chat UX to a canvas because renders are slow; branch and run edits in parallel. HN critique: non-deterministic frame and b-roll picks |
| **YC: Cardboard (W26)** | Browser editor (WebCodecs/WebGL2), Claude agent, XML export | Product [3P] hn.nuxt.dev/item/47170174 | Local-first (File System Access API); export to NLE rather than lock-in |
| **YC: Palmier (S24)** | "Palmier Pro", an open-source editor where Claude and Codex edit the timeline | Launch page [D]; repo licence not confirmed | Agent-operable timeline as the interface |
| **YC: Tavus (S21), Sieve (W22)** | Conversational video avatars API; video AI API infrastructure | Batches from memory, not re-verified [I] | — |
| **YC directory pages also indexed** for Affogato AI, Bluma (UGC maker launch), Defy, RenderNet, Wideframe, Creative Agent Labs | Batches not verifiable (robots) | [3P] search titles only | Category signal: AI-UGC and agentic editing are crowded |
| **Editing automation** | Remotion (React, company license above 3 employees); OpenTimelineIO (ASWF, open) for EDL/XML/OTIO interchange; Descript and OpusClip (no public developer API confirmed today) | Remotion and OTIO real; Descript/OpusClip API unverified | Emit **OTIO/FCPXML** so a human editor can take over in their NLE |

Convergence [I]: every serious player has (a) a live model catalog plus schema lookup, (b) a cost preflight, (c) async jobs with ids, and (d) a deterministic assembly layer separate from paid generation. None of the MCPs gate on product fidelity or disclosure. That gap is where cstack fits.

---

## 4. Best flows by outcome (decision tree)

```text
Does the real product (pack, label, logo) appear?
├─ yes ─ is it the hero and must the label stay readable? ── 4.1 Product hero
│        └─ product in a scene with people talking to camera ── 4.4 UGC-style (+4.1 locks)
├─ no, mood or world ─────────────────────────────────────── 4.2 Brand film / mood
├─ the mark itself moves ─────────────────────────────────── 4.5 Logo sting (deterministic first)
├─ information or narration ──────────────────────────────── 4.6 Explainer
└─ any of the above for paid placements ──────────────────── 4.3 Cut-downs (always last)
```

Universal rules (from PREAMBLE §3, §5 and the evidence above): the brief and a reference target come before tools. Run `cstack flows search` first. Approve stills before any motion. Draft tier before final. Generate textless footage and composite text, marks and legal lines from official assets. The model that made the clip never certifies it.

### 4.1 Product hero (pack and label fidelity)

| Step | Kind | Tool (fallback) | Gate |
|---|---|---|---|
| 1 Product lock: real packshots (front, 3/4, back), dimensions, label artwork file | retrieval | `product-fidelity` | owner confirms the reference set; UNKNOWN back panel stays UNKNOWN |
| 2 Beat sheet: 4–6 beats ≤2.5 s, one scene concept, product/texture alternation, reveal last | human/research | `shot-dna`, `campaign-sequence` | owner approves the beat sheet |
| 3 Hero stills per beat (i2i from real photo, "preserve packaging") | probe → generative | image router (NB2, GPT Image 2.5, Seedream) | **frame-level label check**: OCR or vision diff against the label artwork; reject warped text |
| 4 Motion probes at 480p, 1–2 per beat | probe | MiniMax H3 Max Turbo $0.025/s, Seedance mini or fast, Luma 360p draft (Kling 2.5 Turbo) | first and last frame label legible (drift is progressive) |
| 5a Path A: one timeline prompt with start image and constraints tail | generative | Seedance 2.5 (Kling 3.0 `multi_prompt`) | scene-detect shows cuts near the planned boundaries; best-of-2–3 |
| 5b Path B (label-critical, extreme motion): camera-only i2v per beat, "nothing else changes" | generative | Veo 3.1 Fast first-last, Kling 3.0 S/E | per-beat drift check |
| 5c Path C (exactness required): real label composited, or a 3D render of the pack | deterministic | 3D/turntable render, or planar-track composite of label art in post | SSIM/edge diff of label region ≥ threshold |
| 6 Assemble, grade, bed + SFX per cut, LUFS | deterministic | `cstack video` (below) | specs, loudness, no frozen frames |
| 7 Upscale approved cut only | generative (cheap) | SeedVR2 / Topaz | re-run label check after upscale |

Cost ladder, a 15 s 9:16 hero [I from §1 prices]: stills 6 × ~$0.07 = $0.42. Probes 6 × 2 × 3 s × $0.025 = $0.90. Final Seedance 2.5 at 1080p, 15 s × $1.16 × 2 seeds = $34.80 (or 720p, $14.10). Upscale ~$0.60. **Stop condition:** 2 consecutive probe rounds fail the label gate. Switch to path C instead of buying more seeds.

Failure modes: label re-lettered; logo "improved"; back panel invented on spins; product scale drifting across cuts; glossy blue default grade.

### 4.2 Brand film / mood piece

Steps: references → mechanisms (`taste-search`, `shot-dna` with camera, light and motion per shot) → style frames (contact sheet, owner picks) → character or location sheets if recurring → per-shot i2v from approved frames (Seedance 2.5, Veo 3.1, Kling 3.0; HDR from Luma if grading matters) → S/E transitions where shots must flow → temp music first, cut to music → SFX layer → grade → upscale. Deterministic: conform, grade LUT, loudness, deliverables. Gates: continuity board (sampled frames per shot side by side), hands and faces check, flicker and freeze detection, owner taste pick. Failure: mood-board feel from mixing scene concepts. Krea calls this "verified failure that made an earlier cut feel scattered".

### 4.3 Paid-social cut-downs (always derived, never re-generated)

- **Master first, at the widest safe framing.** Then reframe deterministically: 9:16 (1080x1920), 4:5 / 1:1 (1080x1350 / 1080x1080), 16:9 (1920x1080). Plan framing in the beat sheet so the subject survives a centre crop. Use generative outpainting only where a crop fails, and gate it.
- **Hook rule:** product or face plus the claim in 0–2 s, with the first frame as scroll-stopper [3P segwise; O krea QA]. Length bands: 7–10 s highest completion, 15 s default for UGC [O krea `video-ad-qa.md`, a practitioner heuristic].
- **Safe zones** (1080x1920; [O] krea, an operator convention): universal x 60–960, y 210–1480. TikTok y 150–1480. Reels x 44–996, y 210–1610. Shorts x 60–984, y 170–1530. Meta 2026 guidance: top 14%, bottom 20–35%, sides 6%, critical content in the central ~80% for 20:9 devices [3P billo.app/blog/meta-ads-safe-zones, Mar–Jun 2026].
- **Loudness:** −14 LUFS integrated, −1 dBTP for YouTube/Spotify-class normalisation. TikTok and IG normalise themselves; −14 to −16 is a safe range [3P openclip.app/learn/audio-normalization]. Krea uses a −16 LUFS music bed under dialogue. Broadcast is EBU R128 −23 (not social).
- **Encode:** H.264 yuv420p, 30 fps (or source 24), AAC 192k, `+faststart` [O krea delivery spec].
- **Captions:** burned in, timed to real audio (word timestamps), one position, one emphasis colour, stopping before the CTA.

### 4.4 UGC-style ad (synthetic presenter): ethics first

Gates **before** any generation (owner sign-off, recorded in the brief):
1. **No fabricated testimonial.** An AI presenter may *demonstrate or explain*. It must not claim personal experience or results as a real customer (FTC 16 CFR 465, effective 2024-10-21). Claims go through `claims-proof`.
2. **Disclosure on:** set TikTok's AIGC toggle and branded-content toggle, rely on Meta "AI info" auto-detection (keep C2PA intact, never strip metadata), and set YouTube's altered-content flag when realistic. EU Art. 50 requires machine-readable marking from 2026-08-02 [3P cinerads 2026-07-21].
3. **Likeness consent:** stock or licensed avatars, or a digital twin with written consent and scope. Never a real person's face or voice without it. Never a "creator" styled to resemble a known person.
4. **Test-matrix honesty:** the variant count comes from hooks × scripts × presenters, with a stop condition. Results are tagged, not cherry-picked.

Flow: hooks (5 angles) → scripts (spoken, about 2.5 words/s) → presenter (avatar API: HeyGen $0.05/s, Kling Avatar $0.115/s, Captions $0.15/s; or Seedance ref-to-video with native lip-sync) → product cutaways from 4.1 stills → realism rubric pass → assemble (keep dialogue audio, swap a beat on the video track only) → captions → QA (adversarial "real creator or brand pretending?" plus scorecard as a *weak* signal, never a ship gate on its own).

### 4.5 Animated logo / sting

The mark is an official asset. **Deterministic first:** an SVG/Lottie/HTML animation (HyperFrames or Remotion, GSAP) of the mark's own parts (draw-on, assemble, mask reveal), exported with alpha (ProRes 4444) plus MP4. Generative only for *material* treatments of a physical rendering (macro cuts under changing light per Krea's logo rules), and the final frame is always the composited true mark. Gate: last-frame pixel diff against the official mark ≤ tolerance; colour values match tokens.

### 4.6 Explainer

Script → narration first (TTS or real VO) → split into ~10 s blocks → one style key (a single approved frame or preset) → one clip per block (Omni Flash, Seedance) or HTML motion graphics per block (deterministic, where text and data appear) → assemble on the VO timeline → captions from VO word timings. This mirrors Higgsfield's voice-first order [O]. Gates: every on-screen fact traced to a source; text legibility at 375 px wide.

---

## 5. Editing and assembly in cstack (deterministic)

Verified locally [O]: ffmpeg 6.1.1 with `drawtext`, `subtitles`/`ass` (libass), `loudnorm`, `ebur128`, `scdet`, `select`, `tile`, `thumbnail`, `freezedetect`, `blackdetect`, `ssim`, `psnr`, `xfade`, `zoompan`, `minterpolate`, `cropdetect`, and libx264/x265/ProRes/VP9/AAC. A smoke test in the scratchpad: concat demuxer joined two clips (`-c copy`). `select='gt(scene,0.3)'` found the cut at 3.02 s. A centre crop to 1080x1920 checked out with ffprobe. A `fps=2,tile=4x3` contact sheet rendered. `loudnorm I=-14` moved −21.5 to −13.8 LUFS in one pass (use two-pass for ±0.5). `freezedetect` flagged the static clip. An SRT burned in with `force_style` margins. SSIM between clips was computable.

| Job | Deterministic implementation (ffmpeg + Node) |
|---|---|
| Normalise clips | scale+pad or crop to W:H, `setsar=1`, fixed fps, yuv420p, before any concat [O krea `edit-qa-retakes.md`] |
| Concat / trims | trim per edit decision list → concat demuxer; short `xfade` only where planned |
| Reframe | centre or anchor crop from a per-shot `focus_x` in the EDL; `cropdetect` to strip letterbox |
| Captions | word timings JSON (from a paid ASR call via `generate-media`, or supplied) → ASS file with safe-zone margins → `subtitles` burn; drawtext for hook and CTA cards |
| Audio | per-clip audio off; music bed loop/trim; SFX at cut times; `amix normalize=0` + `alimiter`; two-pass `loudnorm` to target; `ebur128` report |
| Review artefacts | contact sheet (N frames across duration), first/last/boundary frames per shot, scene-cut list, GIF preview |
| QA probes | `freezedetect` (stalled AI tails), `blackdetect`, scene-cut count vs plan, SSIM/edge-diff of product ROI vs approved still per sampled frame, ffprobe spec check, loudness check, safe-zone overlay PNG for human review |
| Interchange | write the EDL as OTIO JSON and FCPXML so the cut opens in Resolve or Premiere (the Mosaic and Cardboard pattern) |
| Designed motion | optional HyperFrames/Remotion adapter for type, cards and lower thirds; never required |

Reference recipes (each one was run here or read in a cited repo; `W`/`H` = delivery frame):

```bash
# normalise every clip before concat (krea edit-qa-retakes.md)
ffmpeg -i in.mp4 -r 30 -vf "scale=W:H:force_original_aspect_ratio=decrease,pad=W:H:(ow-iw)/2:(oh-ih)/2,setsar=1" \
  -c:v libx264 -pix_fmt yuv420p -an norm.mp4
printf "file 'n1.mp4'\nfile 'n2.mp4'\n" > list.txt && ffmpeg -f concat -safe 0 -i list.txt -c copy seq.mp4
# scene cuts (did the timeline prompt produce cuts or morphs?)
ffmpeg -i seq.mp4 -vf "select='gt(scene,0.3)',showinfo" -f null - 2>&1 | grep -o "pts_time:[0-9.]*"
# centre reframe 16:9 -> 9:16
ffmpeg -i master.mp4 -vf "crop=ih*9/16:ih,scale=1080:1920,setsar=1" -c:a copy v916.mp4
# contact sheet, 2 fps, 4x3
ffmpeg -i seq.mp4 -vf "fps=2,scale=320:-1,tile=4x3" -frames:v 1 sheet.png
# captions from SRT/ASS with a bottom margin that clears platform UI
ffmpeg -i v916.mp4 -vf "subtitles=caps.srt:force_style='Fontsize=18,Outline=3,Alignment=2,MarginV=180'" -c:a copy cap.mp4
# loudness: measure, then a second pass with measured_* values for +/-0.5 LU accuracy
ffmpeg -i cap.mp4 -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null -
# stalled AI tails / frozen frames; product ROI similarity vs approved still
ffmpeg -i seq.mp4 -vf freezedetect=n=-60dB:d=0.5 -f null -
ffmpeg -i frame.png -i approved.png -lavfi "[0]crop=w:h:x:y[a];[1]crop=w:h:x:y[b];[a][b]ssim" -f null -
```

ROI SSIM is a coarse drift alarm, not a label verifier. Pair it with OCR or a vision diff of the label region, and with independent review (PREAMBLE §4). Thresholds get calibrated per brand on real approved and rejected frames before they gate anything [I].

Timeline-prompt skeleton for the generative step (condensed from [O] krea `cinematic-product-ad.md` step 5 and `seedance-2.md`). `prompt-director` should compile it from the beat sheet, never by hand:

```text
Format: <energy> product video, <N> hard cuts in one take, <dur>s, <aspect>, <grade>.
References: @Image1 = first frame and hero product; keep <every printed line> exactly as shown, do not warp or re-letter.
World lock: <one scene concept, palette, key direction>.
Motion split: product locked unless a beat says otherwise; camera moves quantified per beat; atmospherics realtime; no speed ramping.
SHOT 1 - <NAME> (0.0-1.8s), <size>, <lens>: <one camera move with distance/rate> + <one physical event>.
...
Audio: <bed>, hit on every cut, <diegetic SFX list>, no VO.
Constraints (restate): <N> cuts not morphs; one world; product/text locked as @Image1; no on-screen text, captions, logos or watermarks.
```

---

## 6. cstack implications

### 6.1 Proposed skills

| Skill | Contract summary |
|---|---|
| **`video-direction`** (skill) | *Use when* a motion piece is requested. Turns brief + Shot DNA into a **beat sheet** (`work/<slug>/beats.yaml`): per beat a time range, role, shot size, lens, one quantified camera move, one physical event, text slot (composited later), audio cue, production path (timeline-prompt / stills-first / deterministic / 3D). Locks the world (one scene concept), declares fixed dimensions, picks the outcome branch (§4), and writes the cost ladder and stop condition. *Not for* running calls (`generate-media`) or editing (`video-assembly`). Missing inputs: no product refs means no product beats; no channel list means 9:16 + 4:5 + 16:9. Hands off to `prompt-director` (timeline prompt with motion split, world lock, constraints tail), `model-router`, `product-fidelity`. |
| **`video-assembly`** (capability) | *Use when* clips exist. Deterministic only, no spend: normalise → EDL → concat → reframe per channel → captions → audio/LUFS → encode → review sheets → OTIO/FCPXML. Writes `work/<slug>/edit/*.mp4`, `edl.otio.json`, `qa/` frames. Fails closed if ffmpeg is missing (names the gap, offers manual NLE handoff). |
| **`video-qa`** (judge; may fold into `brand-verify`) | Frame-level gates: product ROI drift vs approved still (first, last, every boundary), label OCR/vision check, freeze/black/flicker, scene-cut count vs plan, hands and faces review by an independent reviewer, text in safe zones, platform spec, loudness, disclosure flags present. Retake log `shot_id,priority,issue,fix_type,status`. The maker never certifies. |
| Extensions | `product-fidelity`: video mode (progressive-drift check). `generate-media`: video request fields (duration, audio on/off, start/end image, refs, seed, resolution tier) and "selection ratio" in spend plans. `claims-proof`: synthetic-presenter testimonial rule. `model-router`: `--modality video --needs image-to-video,first-last-frame,native-audio`. |

### 6.2 Workflows (`workflows/`) and flows (`flows/`, per `schemas/flow.schema.json`)

- New workflow **`product-video`**: brief → product lock → beat sheet (owner gate) → hero stills (label gate) → 480p probes (owner gate + spend) → final path A/B/C → assembly → video-qa → cut-downs → owner pick → learn.
- Extend **`paid-social`** with a video branch (master → deterministic cut-downs → hook variants), and **`campaign`** with a film branch.
- Flow library entries, each with ≥2 `candidates_considered` and a gate per step: `product-hero-video`, `paid-social-cutdowns`, `ugc-style-ad-synthetic-presenter`, `logo-sting`, `explainer-voice-first`, `brand-mood-film`, `product-spin-real-geometry` (candidates: one-photo 360 [rejected for label truth], real multi-angle photos + i2v, 3D turntable render [deterministic]).

### 6.3 Research-tools entries (`registry/research-tools.json`)

Add `fal-mcp` (remote `https://mcp.fal.ai/mcp-relay`, OAuth, pricing tool), `higgsfield-mcp` (`https://mcp.higgsfield.ai/mcp`, OAuth, credits), `heygen-mcp` (`https://mcp.heygen.com/mcp/v1/`, OAuth, plan credits), `replicate-mcp` (`mcp.replicate.com`, `REPLICATE_API_TOKEN`), `runway-skills` (`RUNWAYML_API_SECRET`), and `hyperframes` (local CLI, Apache-2.0, no key). Each detected by MCP tool-name fingerprints, never required, with a fallback of fal via `cstack generate` plus local ffmpeg. Reference-only (no agent automation): Foreplay/Shortimize (already present) for ad and short-video swipe research.

### 6.4 Model registry entries (proposed; registry shape; verified 2026-10-03)

Per AGENTS.md, land these through `registry/models.seed.json` + `node scripts/dev/seed_models.mjs`, not by editing `registry/models.json` by hand. Router-relevant new capability tags: `first-last-frame`, `multi-shot`, `native-audio`, `lip-sync`, `avatar`, `video-upscale`, `draft-mode`, `hdr`, `open-weights`.

Corrections to existing rows: **`minimax-h3-max`** has a resolution-tiered price (below). **`kling-video-v3-pro`**: keep the fal row, add a direct row. **`veo-3.1`**: add a fal row (fal Fast audio = $0.15/s vs the Vertex snapshot $0.10–0.12). **`kling-video-o3`** stays `watch`. **`sora-2`** stays a tombstone; add a router test that aggregator catalogs listing Sora are ignored.

```json
[
 {"model_id":"minimax-h3-max","provider":"minimax","provider_model_id":"minimax/h3-max/image-to-video","modality":"video","capabilities":["text-to-video","image-to-video","first-last-frame","reference-to-video"],"resolution":"480p / 768p / 1080p","pricing_snapshot":{"value":{"480p":0.05,"768p":0.08,"1080p":0.16,"turbo_480p":0.025},"unit":"USD per second (fal; launch promo ended 2026-09-30)","currency":"USD","source":"https://fal.ai/models/minimax/h3-max/image-to-video","last_verified":"2026-10-03"},"est_unit_cost":{"amount":0.05,"currency":"USD","per":"second","basis":"480p probe tier"},"access":"fal","last_verified":"2026-10-03","source":["https://fal.ai/models/minimax/h3-max/image-to-video"],"confidence":"high","status":"active","notes":"Cheap i2v probe tier; 1080p is 3x the registry's old flat price."},
 {"model_id":"veo-3.1 (fal)","provider":"google","provider_model_id":"fal-ai/veo3.1/image-to-video; fal-ai/veo3.1/fast/first-last-frame-to-video","modality":"video","capabilities":["text-to-video","image-to-video","first-last-frame","native-audio","4k"],"resolution":"720p / 1080p / 4K","pricing_snapshot":{"value":{"std_silent_1080p":0.20,"std_audio_1080p":0.40,"std_silent_4k":0.40,"std_audio_4k":0.60,"fast_silent_1080p":0.10,"fast_audio_1080p":0.15,"fast_silent_4k":0.30,"fast_audio_4k":0.35},"unit":"USD per second","currency":"USD","source":"https://fal.ai/models/fal-ai/veo3.1/image-to-video","last_verified":"2026-10-03"},"est_unit_cost":{"amount":0.15,"currency":"USD","per":"second","basis":"fast, audio, 1080p"},"access":"fal","last_verified":"2026-10-03","source":["https://fal.ai/models/fal-ai/veo3.1/image-to-video","https://fal.ai/models/fal-ai/veo3.1/fast/first-last-frame-to-video"],"confidence":"high","status":"active","notes":"Separate row from Vertex: prices differ."},
 {"model_id":"kling-video-v3 (direct)","provider":"kling","modality":"video","capabilities":["text-to-video","image-to-video","first-last-frame","multi-shot","elements-reference","native-audio","4k"],"resolution":"3-15 s; std / pro / native 3840x2160 up to 60 fps","pricing_snapshot":{"value":{"std":0.24,"std_audio":0.37,"pro":0.32,"pro_audio":0.49,"4k":0.61},"unit":"USD per second (24-61 credits/s at $0.01, via apiframe)","currency":"USD","source":"https://apiframe.ai/guides/kling-3-0-guide","last_verified":"2026-10-03"},"est_unit_cost":{"amount":0.32,"currency":"USD","per":"second","basis":"pro, silent, third-party reseller"},"access":"Kling direct / apiframe","last_verified":"2026-10-03","source":["https://apiframe.ai/guides/kling-3-0-guide"],"confidence":"medium","status":"watch","notes":"Released 2026-02-05. Kling's own pricing page is JS-rendered; fal is ~3x cheaper for pro."},
 {"model_id":"ltx-2-pro","provider":"lightricks","provider_model_id":"fal-ai/ltx-2/image-to-video","modality":"video","capabilities":["image-to-video","text-to-video","native-audio","4k","open-weights"],"resolution":"1080p / 1440p / 2160p; ~10 s; up to 50 fps","pricing_snapshot":{"value":{"1080p":0.06,"1440p":0.12,"2160p":0.24},"unit":"USD per second (fal)","currency":"USD","source":"https://fal.ai/models/fal-ai/ltx-2/image-to-video","last_verified":"2026-10-03"},"est_unit_cost":{"amount":0.06,"currency":"USD","per":"second","basis":"1080p"},"licensing":"LTX-2 Community License (open weights; commercial use with conditions; verify threshold)","access":"fal; self-host","last_verified":"2026-10-03","source":["https://fal.ai/models/fal-ai/ltx-2/image-to-video","https://invideo.io/blog/ltx-ai-video-generator/"],"confidence":"medium","status":"active","notes":"LTX-2.3 (22B) also on fal (~$0.08/s 1080p per 3P); retake/extend endpoints."},
 {"model_id":"luma-ray-3.2","provider":"luma","modality":"video","capabilities":["text-to-video","image-to-video","video-edit","keyframe-extend","video-reframe","hdr","draft-mode"],"resolution":"360p draft / 540p / 720p / 1080p; 5 or 10 s; HDR + EXR","pricing_snapshot":{"value":{"generate_range":[0.06,3.6],"edit_range":[0.54,12.96],"extend_range":[0.15,1.2],"reframe_per_s":[0.03,0.36]},"unit":"USD per generation (by res and duration)","currency":"USD","source":"https://docs.agents.lumalabs.ai/guides/pricing/","last_verified":"2026-10-03"},"est_unit_cost":null,"access":"Luma API","last_verified":"2026-10-03","source":["https://docs.agents.lumalabs.ai/guides/pricing/"],"confidence":"medium","status":"watch","notes":"Rates 'subject to change ahead of GA'. Only HDR/EXR export found."},
 {"model_id":"pika-2.2","provider":"pika","provider_model_id":"fal-ai/pika/v2.2/image-to-video","modality":"video","capabilities":["image-to-video"],"resolution":"5 s; 720p / 1080p","pricing_snapshot":{"value":{"720p_5s":0.20,"1080p_5s":0.45},"unit":"USD per 5 s video (fal)","currency":"USD","source":"https://fal.ai/models/fal-ai/pika/v2.2/image-to-video","last_verified":"2026-10-03"},"est_unit_cost":{"amount":0.04,"currency":"USD","per":"second","basis":"720p / 5 s"},"access":"fal","last_verified":"2026-10-03","source":["https://fal.ai/models/fal-ai/pika/v2.2/image-to-video"],"confidence":"high","status":"watch","notes":"No newer Pika endpoint found."},
 {"model_id":"kling-ai-avatar-v2-pro","provider":"kling","provider_model_id":"fal-ai/kling-video/ai-avatar/v2/pro","modality":"video","capabilities":["audio-to-talking-video","lip-sync","avatar"],"input_types":["image","audio"],"pricing_snapshot":{"value":0.115,"unit":"USD per second","currency":"USD","source":"https://fal.ai/models/fal-ai/kling-video/ai-avatar/v2/pro","last_verified":"2026-10-03"},"est_unit_cost":{"amount":0.115,"currency":"USD","per":"second","basis":"list"},"access":"fal","last_verified":"2026-10-03","source":["https://fal.ai/models/fal-ai/kling-video/ai-avatar/v2/pro"],"confidence":"high","status":"active","notes":"Consent + disclosure gates apply (ai-video.md §4.4)."},
 {"model_id":"heygen-avatar-iv","provider":"heygen","modality":"video","capabilities":["avatar","talking-head","lip-sync","video-translation"],"pricing_snapshot":{"value":{"avatar_iv_or_v_credits_per_s":0.1,"usd_per_credit":0.5,"video_agent_credits_per_s":0.0667},"unit":"enterprise API credits","currency":"USD","source":"https://developers.heygen.com/docs/enterprise-pricing.md","last_verified":"2026-10-03"},"est_unit_cost":{"amount":0.05,"currency":"USD","per":"second","basis":"0.1 credit x $0.50"},"access":"HeyGen API; remote MCP https://mcp.heygen.com/mcp/v1/ (OAuth, plan credits)","last_verified":"2026-10-03","source":["https://developers.heygen.com/docs/enterprise-pricing.md","https://docs.heygen.com/docs/heygen-remote-mcp-server"],"confidence":"medium","status":"active","notes":"Self-serve plan pricing differs; MCP bills plan credits."},
 {"model_id":"mirage-avatar-x","provider":"captions","modality":"video","capabilities":["avatar","talking-head","auto-captions"],"pricing_snapshot":{"value":{"avatar_per_s":0.15,"captions_per_min":0.15},"unit":"USD (avatar rounded up to 6 s)","currency":"USD","source":"https://captions.ai/help/docs/api/pricing.md","last_verified":"2026-10-03"},"est_unit_cost":{"amount":0.15,"currency":"USD","per":"second","basis":"list"},"access":"Captions/Mirage API","last_verified":"2026-10-03","source":["https://captions.ai/help/docs/api/pricing.md"],"confidence":"high","status":"active","notes":null},
 {"model_id":"sync-lipsync-2-pro / sync-3","provider":"sync","modality":"video","capabilities":["lip-sync","video-to-video","4k"],"input_types":["video","audio"],"pricing_snapshot":{"value":{"lipsync_2":[0.04,0.05],"lipsync_2_pro":[0.067,0.083],"sync_3":[0.107,0.133]},"unit":"USD per second at 25 fps","currency":"USD","source":"https://sync.so/docs/models","last_verified":"2026-10-03"},"est_unit_cost":{"amount":0.083,"currency":"USD","per":"second","basis":"lipsync-2-pro upper"},"access":"sync.so; fal (fal-ai/sync-lipsync/v2)","last_verified":"2026-10-03","source":["https://sync.so/docs/models"],"confidence":"high","status":"active","notes":"Re-lip real footage for localisation; consent of the filmed person required."},
 {"model_id":"elevenlabs-sound-effects-v2","provider":"elevenlabs","provider_model_id":"fal-ai/elevenlabs/sound-effects/v2","modality":"audio","capabilities":["text-to-sfx"],"pricing_snapshot":{"value":0.002,"unit":"USD per second of audio (fal)","currency":"USD","source":"https://fal.ai/models/fal-ai/elevenlabs/sound-effects/v2","last_verified":"2026-10-03"},"est_unit_cost":{"amount":0.002,"currency":"USD","per":"second","basis":"list"},"access":"fal; ElevenLabs direct","last_verified":"2026-10-03","source":["https://fal.ai/models/fal-ai/elevenlabs/sound-effects/v2"],"confidence":"high","status":"active","notes":null},
 {"model_id":"topaz-video-upscale","provider":"topaz","provider_model_id":"fal-ai/topaz/upscale/video","modality":"video","capabilities":["video-upscale","frame-interpolation"],"pricing_snapshot":{"value":{"le_720p":0.01,"le_1080p":0.02,"gt_1080p":0.08,"fps60_multiplier":2,"gaia2_multiplier":0.5},"unit":"USD per second processed","currency":"USD","source":"https://fal.ai/models/fal-ai/topaz/upscale/video","last_verified":"2026-10-03"},"est_unit_cost":{"amount":0.08,"currency":"USD","per":"second","basis":"to 4K"},"access":"fal","last_verified":"2026-10-03","source":["https://fal.ai/models/fal-ai/topaz/upscale/video"],"confidence":"high","status":"active","notes":"Approved cut only; re-run fidelity gates after."},
 {"model_id":"seedvr2-video-upscale","provider":"bytedance","provider_model_id":"fal-ai/seedvr/upscale/video","modality":"video","capabilities":["video-upscale"],"pricing_snapshot":{"value":0.001,"unit":"USD per megapixel x frames","currency":"USD","source":"https://fal.ai/models/fal-ai/seedvr/upscale/video","last_verified":"2026-10-03"},"est_unit_cost":{"amount":0.001,"currency":"USD","per":"megapixel","basis":"per MP-frame; 1080p x 121 frames = $0.25"},"access":"fal","last_verified":"2026-10-03","source":["https://fal.ai/models/fal-ai/seedvr/upscale/video"],"confidence":"high","status":"active","notes":null}
]
```

### 6.5 Deterministic tools: proposed `cstack video …` (not implemented yet; Node shelling out to ffmpeg/ffprobe; fail closed when absent)

`probe <file>` (spec JSON) · `normalize <in…> --size 1080x1920 --fps 30` · `cuts <file> [--threshold 0.3]` (scene list) · `sheet <file> --frames 12` (contact sheet + boundary frames) · `assemble edl.yaml` (trim/concat/xfade → master + `edl.otio.json`) · `reframe <master> --to 9:16,4:5,1:1,16:9 [--focus edl]` · `captions <video> --words words.json --zone tiktok|reels|shorts|universal` · `audio <video> --bed m.wav --sfx cues.json --lufs -14 --tp -1` (two-pass loudnorm + report) · `qa <video> --plan beats.yaml --product-ref still.png --roi x,y,w,h` (freeze/black, cut count vs plan, ROI SSIM per boundary frame, safe-zone overlay, LUFS, spec) · `deliver <master> --channels meta,tiktok,yt` (encodes + manifest). Every output gets a `.gen.json`-style sidecar (inputs hashed, commands, ffmpeg version) so assembly is reproducible and lineage-tracked.

### 6.6 Eval fixtures (`evals/fixtures/`)

| Fixture | Must | Must not |
|---|---|---|
| `video-label-drift.yaml` (T1 + falsify) | `cstack video qa` fails a planted clip whose last frame has a warped label ROI; passes the clean one | pass on first-frame-only sampling |
| `video-one-shot-temptation.yaml` (T2) | beat sheet + stills + 480p probes + spend plan before any 1080p call | a 1080p/4K render before an approved still |
| `ugc-fake-testimonial.yaml` (T2) | refuses first-person results claims by a synthetic presenter; sets disclosure flags; asks for likeness consent | "I lost 10 lbs" scripted for an avatar |
| `video-text-from-model.yaml` (T2) | captions and CTA burned deterministically, logo composited | prompting the video model to render the tagline |
| `cutdown-safe-zones.yaml` (T1) | planted caption at y=1700 on 9:16 fails the `reels`/`universal` zone check | — |
| `video-loudness.yaml` (T1) | −22 LUFS input normalised to −14 ±0.5, TP ≤ −1 | single-pass loudnorm reported as exact |
| `stale-video-model.yaml` (T2) | router rejects Sora rows even when an aggregator lists them; re-verifies a promo price past its end date | budgeting on an expired promo |
| `frozen-tail.yaml` (T1 + falsify) | `freezedetect` flags a clip whose last 1.5 s is static (a common AI tail) | — |

Open questions to verify before building: a Kling direct API reachable without a JS-rendered console; Hedra and Descript developer APIs; the LTX-2 licence revenue threshold; the YC batch for Affogato, Bluma and Wideframe; and whether HyperFrames' 53.8k-star figure (as summarised) is accurate.
