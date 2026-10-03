---
name: video-direction
description: "Direct AI and hybrid video: pick the branch (product hero, brand film, cut-downs, presenter ad, logo sting, explainer), write a beat sheet with one world and a production path per beat, set ethics and disclosure gates, and stage stills, draft probes and finals with a stop condition. Use for films, ads, reels and stings. Not for running calls (use generate-media), editing (use video-assembly) or 3D turntables (use three-d)."
license: MIT
---

# /video-direction

Video models now cut, move and sing in one generation; they still re-letter labels, invent backs and drift over time. Direct the film as beats, approve stills before motion, draft before final, and never ask a model for text, logos or legal lines. [Shared preamble](../cstack-shared/PREAMBLE.md) applies; method first (`cstack flows search "<outcome>"`). Craft rules, specs and prompt skeleton: [references/video-craft.md](references/video-craft.md). Evidence: `docs/research/ai-video.md`.

## When to use

- "A 15 second product video", "a brand film", "reels and TikTok cut-downs", "an ad with a presenter", "animate the logo", "an explainer".

## When not to use

- Running generations: `generate-media`. Editing, captions, loudness, delivery: `video-assembly`.
- A turntable or 3D hero of the real product: `three-d` (this skill may call it for a beat).
- Single images: `shot-dna`.

## Inputs

- Brief (objective, audience, channels, length), the approved creative direction, Shot DNA or references, product references (front, three-quarter, back, label artwork, dimensions), claims cleared by `claims-proof`, budget.

## Missing-input behavior

- No product references: no product beats; say so.
- No channel list: plan a master that survives 9:16, 4:5 and 16:9 centre crops.
- A presenter or UGC-style ad without likeness consent and a disclosure plan: stop before any generation.
- No budget: plan to probes only.

## Source precedence

Owner direction > approved brand state and official assets > approved stills > references > model output. A generated frame never overrides the label artwork or the approved still it started from.

## Tools / providers

- `cstack flows search|plan`, `cstack route --modality video --needs image-to-video,first-last-frame,native-audio`, `cstack spend plan`, `cstack generate` (through `generate-media`), `prompt-director` (timeline prompt compiled from the beat sheet).
- Optional MCPs detected by `cstack tools`: fal, Higgsfield, HeyGen, Replicate, Runway; HyperFrames for deterministic motion graphics.

## Process

1. **Branch** with the decision tree in the reference file; name the reference film that defines the target.
2. **Beat sheet** (`work/<slug>/beats.yaml`): per beat a time range, role, shot size, lens, one quantified camera move, one physical event, a text slot (composited later), an audio cue and a production path. One scene concept for the whole piece.
3. **Gates before generation**: product lock (`product-fidelity`), claims (`claims-proof`), and for presenters: no testimonial, likeness consent, disclosure plan.
4. **Stills first**: one approved still per beat, label checked against the artwork, owner pick.
5. **Probes**: one or two cheap draft-tier clips per beat; check the first frame, the last frame and every cut for drift.
6. **Finals** on the chosen path per beat, best of two or three; switch a beat to the deterministic path after two failed probe rounds.
7. **Hand to `video-assembly`** for the cut, captions, sound, loudness, cut-downs and QA; then `creative-review` and the owner.

## Decision rules

- The label must be exact: camera-only image-to-video, or a composite or 3D render; never trust a free generation.
- Text, captions, logos and legal lines are composited after; the prompt asks for none.
- Draft tier before final tier; upscale only the approved cut, then re-check fidelity.
- Cut-downs are derived from the master, never regenerated.
- A synthetic presenter may demonstrate or explain, never claim personal results; disclosure stays on and metadata stays intact.

## Outputs, files written, state updated

- `work/<slug>/beats.yaml`, the run's flow plan, approved stills, probe clips with `.gen.json` sidecars, `direction.md` (target, path per beat, cost ladder, stop condition, gates passed).
- Ledger rows; lineage per clip; learnings for model quirks (drift, failure types).

## Evals required

- Fixtures: `video-one-shot-temptation.yaml`, `video-text-from-model.yaml`, `ugc-fake-testimonial.yaml`, `stale-video-model.yaml`.

## Handoff

`prompt-director`, `model-router`, `generate-media`, `product-fidelity`, `three-d`, `video-assembly`, `claims-proof`, `creative-review`.

## Failure modes

- A one-line prompt to a premium model; a mood board of mixed scene concepts.
- Label re-lettered, back panel invented, scale drifting across cuts.
- A presenter scripted as a satisfied customer; disclosure stripped.
- Budgeting on an expired promotional price.

## Examples

A 15 second 9:16 product hero for a fictional cold-brew can: five beats, reveal last, one kitchen-at-dawn world. Stills from real packshots (about $0.07 each), two 480p probes per beat (about $0.025/s), label checked at first and last frames; beat 4 (a 180° orbit) fails twice and moves to a rendered turntable from `three-d`. Finals on the timeline prompt for beats 1–3 and 5. Caption and end card composited in `video-assembly`.
