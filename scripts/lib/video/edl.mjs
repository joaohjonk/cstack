// Edit decision list for `cstack video assemble` and its OpenTimelineIO export (pure, no ffmpeg).
// Format reference with an example: tests/fixtures/video/README.md.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseSize, parseFps, parseTime, round } from './ffmpeg.mjs';

/**
 * @typedef {object} EDL
 * @property {number} [version=1]
 * @property {string} [name]             timeline name (OTIO); default: the EDL file name
 * @property {EDLOutput} output
 * @property {EDLClip[]} clips           in timeline order
 *
 * @typedef {object} EDLOutput
 * @property {string} size               "WxH", even integers, e.g. "1080x1920"
 * @property {number|string} fps         30, 24, "30000/1001"
 * @property {'pad'|'crop'} [fit='pad']  clips of another aspect: letterbox/pillarbox (pad) or fill (crop at focus_x)
 * @property {boolean} [audio=false]     keep clip audio (silence where a clip has none); false = silent master
 *
 * @typedef {object} EDLClip
 * @property {string} src                media file, relative to the EDL file
 * @property {number|string} [in=0]      source in point: seconds, "1.5s" or [hh:]mm:ss.xxx
 * @property {number|string} [out]       source out point (exclusive); default: end of the source
 * @property {number} [focus_x=0.5]      0..1 horizontal subject position; anchors fit: crop and `video reframe`
 * @property {string} [name]             clip label (OTIO)
 * @property {{type?: string, duration: number}} [transition]  planned xfade from the previous clip into this one
 *                                       (type: an ffmpeg xfade transition, default "fade"; duration in seconds)
 */

const KEYS = new Set(['version', 'name', 'output', 'clips']);
const CLIP_KEYS = new Set(['src', 'in', 'out', 'focus_x', 'name', 'transition']);

/** Validate an EDL object; returns {name, output:{width,height,fps,fit,audio}, clips:[{src(abs), src_rel, in, out|null, focus_x, name, transition}]}. */
export function parseEDL(raw, { baseDir = process.cwd(), name } = {}) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('EDL must be a mapping with output and clips');
  for (const k of Object.keys(raw)) if (!KEYS.has(k)) err(`unknown top-level key "${k}" (allowed: ${[...KEYS].join(', ')})`);
  if (raw.version != null && raw.version !== 1) err(`version ${raw.version} is not supported (1)`);
  const o = raw.output ?? {};
  let size = null;
  let fps = null;
  try {
    size = parseSize(o.size, 'output.size');
  } catch (e) {
    err(e.message);
  }
  try {
    fps = parseFps(o.fps, 'output.fps');
  } catch (e) {
    err(e.message);
  }
  const fit = o.fit ?? 'pad';
  if (!['pad', 'crop'].includes(fit)) err(`output.fit must be pad or crop (got ${fit})`);
  if (o.audio != null && typeof o.audio !== 'boolean') err('output.audio must be true or false');
  if (!Array.isArray(raw.clips) || !raw.clips.length) err('clips must be a non-empty list');
  const clips = (Array.isArray(raw.clips) ? raw.clips : []).map((c, i) => {
    const at = `clips[${i}]`;
    if (!c || typeof c !== 'object') {
      err(`${at} must be a mapping`);
      return null;
    }
    for (const k of Object.keys(c)) if (!CLIP_KEYS.has(k)) err(`${at}: unknown key "${k}" (allowed: ${[...CLIP_KEYS].join(', ')})`);
    if (typeof c.src !== 'string' || !c.src) err(`${at}.src is required`);
    const t = (v, k) => {
      try {
        const s = parseTime(v, `${at}.${k}`);
        if (s < 0) throw new Error(`${at}.${k} must be >= 0`);
        return s;
      } catch (e) {
        err(e.message);
        return null;
      }
    };
    const tin = c.in == null ? 0 : t(c.in, 'in');
    const tout = c.out == null ? null : t(c.out, 'out');
    if (tin != null && tout != null && tout <= tin) err(`${at}: out (${tout}) must be after in (${tin})`);
    const focus = c.focus_x ?? 0.5;
    if (typeof focus !== 'number' || focus < 0 || focus > 1) err(`${at}.focus_x must be a number from 0 to 1`);
    let transition = null;
    if (c.transition != null) {
      const tr = c.transition;
      if (i === 0) err(`${at}: the first clip cannot have a transition (it transitions from the previous clip)`);
      if (typeof tr !== 'object' || !(Number(tr.duration) > 0)) err(`${at}.transition needs a duration in seconds > 0`);
      else if (tr.type != null && !/^[a-z]+$/.test(tr.type)) err(`${at}.transition.type must be an ffmpeg xfade transition name like fade or wipeleft`);
      else transition = { type: tr.type ?? 'fade', duration: Number(tr.duration) };
    }
    return { src: typeof c.src === 'string' ? path.resolve(baseDir, c.src) : null, src_rel: c.src, in: tin, out: tout, focus_x: focus, name: c.name ?? (typeof c.src === 'string' ? path.basename(c.src, path.extname(c.src)) : `clip-${i + 1}`), transition };
  });
  if (errors.length) throw new Error(`invalid EDL:\n  - ${errors.join('\n  - ')}`);
  return { name: raw.name ?? name ?? 'timeline', output: { ...size, fps, fit, audio: !!o.audio }, clips };
}

/**
 * Frame-accurate timeline. sourceDurations[i] (seconds) fills a missing out point and bounds the clip.
 * Each clip spans round((out-in)*fps) frames; a transition of T frames overlaps the previous clip's tail.
 * Returns clips with frames, record_start/record_end (master frames) and the master frame count.
 */
export function buildTimeline(edl, sourceDurations = []) {
  const { value: rate } = edl.output.fps;
  const errors = [];
  let pos = 0;
  const clips = edl.clips.map((c, i) => {
    const dur = sourceDurations[i];
    const out = c.out ?? dur;
    if (out == null) {
      errors.push(`clips[${i}] (${c.src_rel}): no out point and the source duration is unknown`);
      return null;
    }
    if (dur != null && out > dur + 0.5 / rate) errors.push(`clips[${i}] (${c.src_rel}): out ${out} s is past the end of the source (${round(dur)} s)`);
    if (out <= c.in) errors.push(`clips[${i}] (${c.src_rel}): in ${c.in} s is at or past the out point ${round(out)} s`);
    const frames = Math.round((out - c.in) * rate);
    if (frames < 1) errors.push(`clips[${i}] (${c.src_rel}): shorter than one frame at ${round(rate)} fps`);
    const tFrames = c.transition ? Math.round(c.transition.duration * rate) : 0;
    if (c.transition && tFrames < 1) errors.push(`clips[${i}]: transition shorter than one frame`);
    return { ...c, out, frames, transition_frames: tFrames };
  });
  clips.forEach((c, i) => {
    if (!c || !c.transition_frames) return;
    const prev = clips[i - 1];
    if (prev && (c.transition_frames >= prev.frames || c.transition_frames >= c.frames)) errors.push(`clips[${i}]: transition (${c.transition_frames} frames) must be shorter than both clips it joins (${prev.frames} and ${c.frames} frames)`);
  });
  if (errors.length) throw new Error(`invalid EDL:\n  - ${errors.join('\n  - ')}`);
  for (const c of clips) {
    pos -= c.transition_frames;
    c.record_start = pos;
    pos += c.frames;
    c.record_end = pos;
  }
  return { ...edl, clips, frames: pos, duration: pos / rate };
}

/** Focus segments on the master timeline (seconds): the switch happens mid-transition, where the OTIO cut point sits. */
export function focusSegments(tl) {
  const rate = tl.output.fps.value;
  return tl.clips.map((c) => ({ start: (c.record_start + Math.floor(c.transition_frames / 2)) / rate, focus_x: c.focus_x, name: c.name }));
}

const RT = (value, rate) => ({ OTIO_SCHEMA: 'RationalTime.1', rate, value: round(value, 6) });
const TR = (start, duration, rate) => ({ OTIO_SCHEMA: 'TimeRange.1', duration: RT(duration, rate), start_time: RT(start, rate) });

/**
 * Minimal valid OpenTimelineIO JSON (Timeline.1 > Stack.1 > one Video Track.1 of Clip.1 and Transition.1).
 * Clip source ranges are in master frames; a transition of T frames sits centred on the cut (in_offset floor(T/2) into
 * the outgoing clip, out_offset the rest into the incoming one), so clip ranges exclude the overlap and the track
 * duration equals the master's frame count. target_url is relative to the OTIO file unless absoluteUrls.
 */
export function toOTIO(tl, { otioDir = process.cwd(), absoluteUrls = false, media = [], metadata = {} } = {}) {
  const rate = tl.output.fps.value;
  const children = [];
  tl.clips.forEach((c, i) => {
    const lead = Math.floor(c.transition_frames / 2);
    const next = tl.clips[i + 1];
    const trail = next ? next.transition_frames - Math.floor(next.transition_frames / 2) : 0;
    if (c.transition_frames)
      children.push({ OTIO_SCHEMA: 'Transition.1', metadata: { cstack: { xfade: c.transition.type } }, name: c.transition.type, transition_type: c.transition.type === 'fade' || c.transition.type === 'dissolve' ? 'SMPTE_Dissolve' : 'Custom_Transition', in_offset: RT(lead, rate), out_offset: RT(c.transition_frames - lead, rate) });
    const m = media[i] ?? {};
    const url = absoluteUrls ? pathToFileURL(path.resolve(c.src)).href : path.relative(otioDir, c.src).split(path.sep).join('/');
    children.push({
      OTIO_SCHEMA: 'Clip.1',
      metadata: { cstack: { focus_x: c.focus_x, in: c.in, out: round(c.out, 6), frames: c.frames, record_start: c.record_start, ...(m.sha256 ? { sha256: m.sha256 } : {}) } },
      name: c.name,
      source_range: TR(c.in * rate + lead, c.frames - lead - trail, rate),
      effects: [],
      markers: [],
      enabled: true,
      media_reference: {
        OTIO_SCHEMA: 'ExternalReference.1',
        metadata: {},
        name: path.basename(c.src),
        available_range: m.duration && m.fps ? TR(0, Math.round(m.duration * m.fps), m.fps) : null,
        target_url: url,
      },
    });
  });
  return {
    OTIO_SCHEMA: 'Timeline.1',
    metadata: { cstack: { size: `${tl.output.width}x${tl.output.height}`, fps: tl.output.fps.str, fit: tl.output.fit, frames: tl.frames, ...metadata } },
    name: tl.name,
    global_start_time: RT(0, rate),
    tracks: {
      OTIO_SCHEMA: 'Stack.1',
      metadata: {},
      name: 'tracks',
      source_range: null,
      effects: [],
      markers: [],
      enabled: true,
      children: [{ OTIO_SCHEMA: 'Track.1', metadata: {}, name: 'V1', source_range: null, effects: [], markers: [], enabled: true, kind: 'Video', children }],
    },
  };
}
