# Video formats

`cstack video` (scripts/lib/video/) is deterministic tooling over ffmpeg and ffprobe. No media is committed here:
tests/video.test.mjs generates tiny clips with ffmpeg's lavfi sources in a temp folder and skips with a reason when
ffmpeg is absent. This folder holds the two text formats as examples, `edl.yaml` (assemble) and `beats.yaml`
(qa --plan). tests/video-formats.test.mjs parses both, so they stay valid.

## EDL: `cstack video assemble <edl.yaml> --out master.mp4`

YAML or JSON. Unknown keys are errors, and every error is reported at once.

| Key | Default | Meaning |
|---|---|---|
| `version` | `1` | format version |
| `name` | EDL file name | timeline name in the OTIO |
| `output.size` | required | `"WxH"`, even integers (H.264 4:2:0) |
| `output.fps` | required | `30`, `24`, `"30000/1001"` |
| `output.fit` | `pad` | a clip of another aspect: `pad` letterboxes or pillarboxes, `crop` fills and crops at `focus_x` |
| `output.audio` | `false` | `true` keeps clip audio as AAC 192k (silence where a clip has none); `false` writes a silent master, and the bed and loudness come later from `cstack video audio` |
| `clips[]` | required | in timeline order |
| `clips[].src` | required | media file, relative to the EDL |
| `clips[].in` | `0` | source in point |
| `clips[].out` | end of source | source out point (exclusive) |
| `clips[].focus_x` | `0.5` | 0..1 horizontal subject position: anchors `fit: crop`, and later `video reframe` and `video deliver` |
| `clips[].name` | file stem | clip label in the OTIO |
| `clips[].transition` | none | `{type, duration}`: a planned xfade from the previous clip into this one. `type` is an ffmpeg xfade name (`fade` by default, `wipeleft`, `dissolve`, ...), `duration` is in seconds |

Times are seconds (`1.5`), `"1.5s"` or `"[hh:]mm:ss.xxx"` (quote that one in YAML).

Timing is frame-exact. A clip lasts `round((out - in) * fps)` frames, and a transition of T frames overlaps the
previous clip's tail, so the master has the sum of clip frames minus the sum of transition frames. `edl.yaml` gives
60 + 105 + 90 - 15 = 240 frames, 8.0 s. Without transitions the parts are joined by the concat demuxer (stream copy);
with any transition one xfade/concat graph re-encodes the join.

assemble writes the master (H.264 yuv420p, +faststart), `<edl stem>.otio.json` beside it (or `--otio <file>`) and
`<master>.gen.json`. The sidecar lists the OTIO as an extra output and records the per-clip focus segments, which
`reframe` and `deliver` reuse while the master's sha256 still matches. Without ffmpeg, assemble still writes the OTIO
when every clip has an `out` (nothing needs probing), then fails with MISSING.

## OpenTimelineIO output

- `Timeline.1` > `Stack.1` > one `Track.1` (`kind: Video`) whose children are `Clip.1` and `Transition.1` in order.
- Times are `RationalTime.1` at the master frame rate; `global_start_time` is 0.
- A clip's `source_range` covers the part outside transitions. A transition of T frames is centred on the cut:
  `in_offset` is floor(T/2) frames into the outgoing clip and `out_offset` the rest into the incoming one. The overlap
  is handle media beyond the neighbouring clips' ranges, as OTIO defines it, so the track duration equals the master
  frame count.
- `transition_type` is `SMPTE_Dissolve` for fade and dissolve, else `Custom_Transition` with the xfade name in
  `metadata.cstack.xfade`.
- `media_reference` is an `ExternalReference.1`. `target_url` is relative to the OTIO file (`--absolute-urls` writes
  `file://` URLs, which some editors need to relink on their own); `available_range` comes from ffprobe.
- `metadata.cstack` holds size, fps, fit, frames and the EDL and master paths, and per clip focus_x, in and out
  seconds, frames, record_start and the source sha256.

The tests check its internal consistency. It has not been validated with the `opentimelineio` library.

## Beat plan: `cstack video qa <video> --plan beats.yaml`

A list of beats, or a mapping `{beats, duration?, size?, fps?}`. Other beat keys are ignored, so a video-direction
beat sheet works as is.

| Beat key | Meaning |
|---|---|
| `start`, `end` | seconds (any time format above); beats in order, no overlap |
| `time` | `"0-1.75s"` in place of start and end |
| `duration` | in place of `end`; a missing `start` is the previous beat's end |
| `id` | label (also read from `shot_id` or `name`) |
| `hold: true` | an intended static beat (end card, held frame): freezes inside it pass |
| `transition` | the boundary into this beat is a planned transition, so no hard cut is expected there |

Every other beat boundary is an expected hard cut. `duration` (default: the last beat's end), `size` and `fps` are
checked when given.

| Gate | Pass | Warn | Fail |
|---|---|---|---|
| `video.spec` | H.264, yuv420p, even size, constant 24/25/30/50/60 fps (or NTSC) | VFR, other fps, rotation tag, non-square pixels, non-AAC audio | other codec or pixel format, odd size, size or fps differs from the plan |
| `video.freeze` | no frozen segment >= 0.5 s (freezedetect n=-60dB), or all inside `hold` beats | frozen mid-clip | frozen tail |
| `video.black` | no black segment >= 0.1 s (blackdetect pix_th=0.1) | black after the opening | black opening |
| `video.cuts` | hard cuts (scene score > 0.3) match the plan, each within 0.5 s | count matches, a cut is further off | count differs |
| `video.roi` | min SSIM(Y) of the ROI vs the approved still >= 0.85 | < 0.85 | < 0.7 |
| `video.loudness` | within 1 LU of `--lufs` (-14) and true peak <= `--tp` (-1) | no audio and no `--lufs` | out of range, or no audio with `--lufs` |
| `video.duration` | within 1.5 frames of the plan | within 0.5 s | further off |
| `video.safezone` | | always: an overlay PNG for a person (needs `--out`) | |

The ROI SSIM samples the first and last frames and both sides of every detected cut. It is a coarse drift alarm with
uncalibrated thresholds, not a label verifier: calibrate per brand on approved and rejected frames, and confirm a
fail with a person or a vision check of the label.

## Sidecar: `<output>.gen.json`

Every file a command writes gets one, including the OTIO, the burned ASS, `qa.json` and `manifest.json`.

- `tool`, `provider: local`, `model: ffmpeg`, `operation: video.<sub>`, `cstack_version`
- `output` (this file) and `extra_outputs` (other files the same run wrote): `{path, sha256, bytes}`
- `inputs`: `{path (relative to the sidecar), sha256, bytes, role}`, plus `input_hashes`
- `params`: the flags that shape the output; `ffmpeg`: version and library versions
- `recipe_hash`: a hash of the operation, input hashes, params and ffmpeg version
- `steps`: `{bin, cwd, args, started_at, elapsed_ms, analysis?}`. ffmpeg runs with cwd set to the output folder and
  relative paths, so `cd <sidecar folder>/<cwd> && ffmpeg <args>` replays a step once the old output is moved away
  (the args carry `-n`, which never overwrites)
- `warnings`, `result`, `cost: null`, `started_at`, `finished_at`, `elapsed_ms`

The same inputs, flags and ffmpeg build give the same bytes: libx264 is deterministic for a given build and thread count.

## ffmpeg is an external dependency

Each command checks the binaries it needs (`ffmpeg -version`, `ffprobe -version`) before writing anything. When one
is missing it fails with exit 1 and a message that starts `MISSING: ffmpeg (no working "ffmpeg" found). This command
would have <what it would have done>. Nothing was written.` cstack never installs or downloads ffmpeg.
`CSTACK_FFMPEG` and `CSTACK_FFPROBE` point at specific binaries; ffprobe defaults to the one beside `CSTACK_FFMPEG`.
