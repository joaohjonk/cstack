# Video craft reference (video-direction and video-assembly)

Loaded on demand. Source: `docs/research/ai-video.md` (snapshot 2026-10-03); labels there say what was observed, documented or inferred.

## Decision tree

```text
Does the real product (pack, label, logo) appear?
├─ yes ─ is it the hero and must the label stay readable? ── product hero
│        └─ people talking to camera with the product ─────── presenter / UGC-style (+ product locks)
├─ no, mood or world ─────────────────────────────────────── brand film
├─ the mark itself moves ─────────────────────────────────── logo sting (deterministic first)
├─ information or narration ──────────────────────────────── explainer (voice first)
└─ any of the above for paid placements ──────────────────── cut-downs (always last, derived)
```

## Product hero paths

- A: one timeline prompt with the start image and a constraints tail (fast; check cuts are cuts, not morphs).
- B: camera-only image-to-video per beat, "nothing else changes" (label-critical, extreme motion).
- C: real label composited, or a 3D render of the pack (exactness required).
- Stop condition: two consecutive probe rounds fail the label gate, then switch to C.
- Worked ladder for 15 s 9:16 (inferred from list prices): stills about $0.42, probes about $0.90, finals $14–35, upscale about $0.60.

## Timeline prompt skeleton (compiled by prompt-director from beats.yaml)

```text
Format: <energy> product video, <N> hard cuts in one take, <dur>s, <aspect>, <grade>.
References: @Image1 = first frame and hero product; keep every printed line exactly as shown, do not warp or re-letter.
World lock: <one scene concept, palette, key direction>.
Motion split: product locked unless a beat says otherwise; camera moves quantified per beat; atmospherics realtime; no speed ramping.
SHOT 1 - <NAME> (0.0-1.8s), <size>, <lens>: <one camera move with distance or rate> + <one physical event>.
Audio: <bed>, hit on every cut, <diegetic SFX>, no VO.
Constraints (restate): <N> cuts not morphs; one world; product and text locked as @Image1; no on-screen text, captions, logos or watermarks.
```

## Paid-social specs

- Frames: 9:16 1080x1920, 4:5 1080x1350, 1:1 1080x1080, 16:9 1920x1080; plan framing so the subject survives a centre crop.
- Hook: product or face plus the claim in 0–2 s; 7–10 s cuts complete best, 15 s default for UGC-style (practitioner heuristic).
- Safe zones at 1080x1920 (operator convention): universal x 60–960, y 210–1480; TikTok y 150–1480; Reels x 44–996, y 210–1610; Shorts x 60–984, y 170–1530.
- Loudness: −14 LUFS integrated, −1 dBTP true peak for social and streaming; broadcast is EBU R128 −23.
- Encode: H.264 yuv420p, 30 fps (or source 24), AAC 192k, faststart.
- Captions: burned in, timed to the real audio, one position, one emphasis colour, stop before the CTA.

## Presenter and UGC-style gates (before any generation)

1. No fabricated testimonial: a synthetic presenter demonstrates or explains, never claims personal results (US FTC rule 16 CFR 465, effective 2024-10-21). Claims go through claims-proof.
2. Disclosure on: platform AI-content toggles set; C2PA provenance kept where the toolchain allows (any re-encode drops it, so re-sign after the final encode or record the loss); EU AI Act Article 50 marking applies from 2026-08-02.
3. Likeness consent: licensed avatars or a digital twin with written consent and scope; never a real person's face or voice without it.
4. Test-matrix honesty: hooks × scripts × presenters with a stop condition; results tagged, not cherry-picked.

## Logo sting

Animate the mark's own parts deterministically (SVG, Lottie or HTML motion), export with alpha plus MP4. Generative only for material treatments of a physical rendering; the last frame is always the composited true mark, checked by pixel diff against the official file.

## QA (video-assembly runs it)

First frame, last frame and every cut boundary checked against the approved still (drift grows over the clip); freeze and black detection (stalled AI tails); cut count against the plan; text inside safe zones; loudness and spec. ROI similarity is a coarse alarm: pair it with an independent visual check of the label.

## Image-to-video: prompt the motion

The start image already fixes composition, subject, light and style; the prompt describes what moves, the camera move, pace and duration. Re-describing the still while under-describing the motion is the most common image-to-video failure. Pick the start frame the Grid → Pick → Polish way ([../../prompt-director/references/grid-pick-polish.md](../../prompt-director/references/grid-pick-polish.md)).
