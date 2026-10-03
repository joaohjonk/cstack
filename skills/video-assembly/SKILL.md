---
name: video-assembly
description: "Cut, finish and check video with no model spend: normalize, assemble from an edit list, reframe per channel, burn captions inside safe zones, normalize loudness, run frame-level QA (drift at first, last and cut frames, frozen tails, specs) and deliver per channel with an OpenTimelineIO handoff. Use when clips or a master need editing, cut-downs or delivery. Not for planning (use video-direction)."
license: MIT
metadata:
  cstack-version: "0.1.0"
  cstack-meta: "skill.meta.json"
---

# /video-assembly

Paid generation and free assembly are separate jobs. Every edit here is a reproducible command with hashed inputs, so a cut can be rebuilt, audited and opened in an editor. [Shared preamble](../cstack-shared/PREAMBLE.md) applies. Specs and QA rules: [../video-direction/references/video-craft.md](../video-direction/references/video-craft.md).

## When to use

- Approved clips need a cut; a master needs 9:16, 4:5, 1:1 and 16:9 versions; captions, a music bed or loudness; a QA pass before review; delivery files for each platform.

## When not to use

- Deciding beats, paths and models: `video-direction`. Making clips: `generate-media`. Fixing one region of a frame: `image-edit` on the frame, then re-assemble.

## Inputs

- Clips with their sidecars, `beats.yaml` (the plan), an edit decision list (`edl.yaml`), the approved stills and label artwork for drift checks, captions (SRT or word timings), music or SFX files with their licences, the channel list.

## Missing-input behavior

- No ffmpeg: say `MISSING: ffmpeg`, write the EDL and OTIO so a person can cut in their editor, and stop; ask before anyone installs it.
- No plan: QA runs without the cut-count check and says so.
- Music without a licence record: internal preview only.

## Source precedence

The approved plan and EDL > owner notes > automatic suggestions (scene cuts). Composited text, marks and end cards come from official files, never from frames the model drew.

## Tools / providers

`cstack video probe|normalize|cuts|sheet|assemble|reframe|captions|safezone|audio|qa|deliver` (ffmpeg and ffprobe, deterministic, sidecars with commands and hashes). `cstack edit paste` for frame repairs, `browse` for HTML end cards, HyperFrames or an NLE (owner) when present.

## Process

1. **Probe and normalize** every clip to the master size, frame rate and pixel format before any join.
2. **Assemble** from `edl.yaml` (trims, planned transitions only); export the master and `edl.otio.json`.
3. **Sound**: per-clip audio decisions, music bed, SFX on cuts, two-pass loudness to −14 LUFS and −1 dBTP (or the channel's target).
4. **Captions and cards**: burned in from real timings inside the chosen safe zone; hook and end cards composited from official assets.
5. **Reframe** for each channel from the master using the EDL's focus; never regenerate a cut-down.
6. **QA** with `cstack video qa`: drift at first, last and cut frames against the approved still, freeze and black, cut count against the plan, safe zones, loudness, spec. Log retakes as `shot_id, priority, issue, fix_type, status` and send them back to `video-direction`.
7. **Deliver** per channel with a manifest; review sheets (contact sheet, boundary frames) go to `creative-review` and the owner.

## Decision rules

- Normalize before concat, always.
- Swap a beat on the video track only when dialogue or lip-sync must survive.
- A QA fail blocks delivery; the maker never waives its own fail.
- ROI similarity is an alarm, not proof: a fail sends the frame to a person or a vision check of the label.
- Any re-encode drops a C2PA manifest (`cstack video probe` reports one). When the source carried one, re-sign the delivered files with a C2PA tool or record that it was lost; platform AI labels and disclosure stay on either way.

## Outputs, files written, state updated

- `work/<slug>/edit/`: normalized clips, `master.mp4`, `edl.yaml`, `edl.otio.json`, channel files, `qa/` (sheets, boundary frames, safe-zone overlays, `qa.json`), `retakes.csv`, delivery `manifest.json`, sidecars per output.
- Lineage for delivered files; failures for QA misses; no ledger rows (no spend).

## Evals required

- T1: `cstack video qa` passes on every delivered file.
- Fixtures: `video-label-drift.yaml`, `frozen-tail.yaml`, `cutdown-safe-zones.yaml`, `video-loudness.yaml`.

## Handoff

`video-direction` (retakes), `creative-review`, `brand-verify`, `learn`.

## Failure modes

- Mixed frame rates or sizes joined without normalizing (stutter, black bars).
- Captions under platform UI; single-pass loudness reported as exact.
- A frozen AI tail left in; checking only the first frame for label drift.

## Examples

Five approved clips at mixed sizes become a 15 s master: normalized to 1080x1920 at 30 fps, assembled from the EDL, music bed 10 LU under the clips' own audio (`--bed-gap 10`), final −14 LUFS / −1 dBTP. QA flags a 1.2 s frozen tail on clip 4 (trimmed) and ROI drift on the last frame of clip 2 (retake logged, high priority). Cut-downs for Reels and Shorts, captions inside each zone, OTIO handed to the owner's editor.
