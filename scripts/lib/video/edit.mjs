// cstack video normalize | assemble | reframe: conform clips, cut a master from an EDL, and crop it per aspect.
// Deterministic: same inputs, flags and ffmpeg build give the same bytes (libx264 is deterministic by default).
import fs from 'node:fs';
import path from 'node:path';
import { readData, readJSON, writeJSON } from '../core.mjs';
import { requireTools, guardOutputs, Recorder, MissingTool, ffPath, encodeHead, containerFlags, x264, sec, round, hashFile, parseSize, parseFps, numIn, sidecarPath } from './ffmpeg.mjs';
import { probe, videoDuration } from './probe.mjs';
import { cropDetect } from './detect.mjs';
import { parseEDL, buildTimeline, toOTIO, focusSegments } from './edl.mjs';

export const AAC = ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2'];
const stem = (p) => path.basename(p, path.extname(p));
const relFrom = (dir, p) => path.relative(dir, p).split(path.sep).join('/');

/** Filter chain conforming any clip to W x H at fps: square pixels, fit (pad, or crop anchored at focus), yuv420p. */
export function fitFilter({ width: W, height: H, fps, fit = 'pad', focus = 0.5, sar = 1 }) {
  const f = [`fps=${fps.str}`];
  if (Math.abs(sar - 1) > 0.001) f.push(`scale='trunc(iw*sar/2)*2':ih`, 'setsar=1');
  if (fit === 'crop') {
    const x = Math.abs(focus - 0.5) < 1e-9 ? '(iw-ow)/2' : `'max(0,min(iw-ow,iw*${round(focus, 4)}-ow/2))'`;
    f.push(`scale=${W}:${H}:force_original_aspect_ratio=increase:force_divisible_by=2`, `crop=${W}:${H}:${x}:(ih-oh)/2`);
  } else f.push(`scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2`, `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`);
  f.push('setsar=1', 'format=yuv420p');
  return f.join(',');
}

function sourceWarnings(info, label) {
  const w = [];
  if (['smpte2084', 'arib-std-b67'].includes(info.video?.color_transfer)) w.push(`${label}: HDR transfer (${info.video.color_transfer}) is converted to 8-bit yuv420p without tone mapping`);
  if (info.c2pa) w.push(`${label}: carries a C2PA manifest; re-encoding drops it, so re-sign the output or keep the platform AI-content disclosure on`);
  return w;
}

async function videoInfo(file) {
  if (!fs.existsSync(file)) throw new Error(`input not found: ${file}`);
  const info = await probe(file);
  if (!info.video || info.image) throw new Error(`${file}: no video stream`);
  return info;
}

/** normalize({inputs, size='1080x1920', fps=30, fit='pad', keepAudio=false, out (dir), force, crf=18, preset='medium'}) */
export async function normalize({ inputs = [], size = '1080x1920', fps = 30, fit = 'pad', keepAudio = false, out, force = false, crf = 18, preset = 'medium' } = {}) {
  if (!inputs.length || !out || out === true) throw new Error('usage: cstack video normalize <in...> --size 1080x1920 --fps 30 [--fit crop|pad] [--keep-audio] --out <dir>');
  const S = parseSize(size);
  const F = parseFps(fps);
  if (!['pad', 'crop'].includes(fit)) throw new Error(`--fit must be pad or crop (got ${fit})`);
  await requireTools(['ffmpeg', 'ffprobe'], `scaled and ${fit === 'crop' ? 'cropped' : 'padded'} ${inputs.length} clip(s) to ${S.width}x${S.height} at ${F.str} fps (H.264 yuv420p, ${keepAudio ? 'audio kept as AAC' : 'audio removed'}) into ${out}`);
  const outDir = path.resolve(out);
  const srcs = inputs.map((f) => path.resolve(f));
  const outputs = srcs.map((s) => path.join(outDir, `${stem(s)}.norm.mp4`));
  const infos = [];
  for (const s of srcs) infos.push(await videoInfo(s));
  guardOutputs(outputs, srcs, { force });
  fs.mkdirSync(outDir, { recursive: true });
  const files = [];
  for (const [i, src] of srcs.entries()) {
    const info = infos[i];
    const rec = new Recorder('video.normalize', { size: `${S.width}x${S.height}`, fps: F.str, fit, keep_audio: !!keepAudio, crf: Number(crf), preset: String(preset) });
    await rec.addInput(src);
    rec.warnings.push(...sourceWarnings(info, path.basename(src)));
    const cwd = outDir;
    const silent = keepAudio && !info.audio;
    const extraIn = silent ? ['-f', 'lavfi', '-t', sec(videoDuration(info)), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000'] : [];
    const audio = !keepAudio ? ['-an'] : ['-map', silent ? '1:a:0' : '0:a:0', ...AAC];
    const vf = fitFilter({ ...S, fps: F, fit, sar: info.video.sar_value });
    await rec.ffmpeg((o) => [...encodeHead(), '-i', ffPath(src, cwd), ...extraIn, '-map', '0:v:0', '-vf', vf, ...x264({ crf, preset }), ...audio, ...containerFlags(o), o], { cwd, outputs: [outputs[i]] });
    if (silent) rec.warnings.push(`${path.basename(src)}: no audio stream; wrote silence so clips concat cleanly`);
    const o = await probe(outputs[i]);
    await rec.write(outputs[i], { width: o.video.width, height: o.video.height, fps: o.video.fps, duration: videoDuration(o), audio: !!o.audio });
    files.push({ src, out: outputs[i], width: o.video.width, height: o.video.height, fps: o.video.fps, duration: videoDuration(o), audio: !!o.audio, warnings: rec.warnings });
  }
  return { out: outDir, size: S, fps: F.str, fit, files };
}

/** Join graph for parts 0..n-1 (video) and n..2n-1 (audio WAV): concat where cut, xfade/acrossfade where planned. */
export function joinGraph(clips, { fps, audio = false }) {
  const n = clips.length;
  const rate = fps.value;
  const g = [];
  for (let i = 0; i < n; i++) {
    g.push(`[${i}:v]settb=AVTB,setpts=PTS-STARTPTS[v${i}]`);
    if (audio) g.push(`[${n + i}:a]asetpts=PTS-STARTPTS[a${i}]`);
  }
  let v = 'v0';
  let a = 'a0';
  let acc = clips[0].frames;
  for (let i = 1; i < n; i++) {
    const T = clips[i].transition_frames;
    if (T) {
      g.push(`[${v}][v${i}]xfade=transition=${clips[i].transition.type}:duration=${sec(T / rate)}:offset=${sec((acc - T) / rate)}[x${i}]`);
      if (audio) g.push(`[${a}][a${i}]acrossfade=d=${sec(T / rate)}[y${i}]`);
      acc += clips[i].frames - T;
    } else {
      g.push(`[${v}][v${i}]concat=n=2:v=1:a=0[x${i}]`);
      if (audio) g.push(`[${a}][a${i}]concat=n=2:v=0:a=1[y${i}]`);
      acc += clips[i].frames;
    }
    v = `x${i}`;
    a = `y${i}`;
  }
  g.push(`[${v}]fps=${fps.str},format=yuv420p[v]`);
  if (audio) g.push(`[${a}]atrim=duration=${sec(acc / rate)}[a]`);
  return g.join(';');
}

const edlStem = (f) => path.basename(f).replace(/\.(ya?ml|json)$/i, '');

/**
 * assemble({edl, out, otio?, force, crf, preset, absoluteUrls}): trim + normalize every clip to a frame-exact part,
 * join them (concat demuxer with stream copy when there are no transitions, else one xfade/concat graph), write the
 * master, and write the cut as OpenTimelineIO JSON (default <master dir>/<edl name>.otio.json).
 * Without ffmpeg: writes only the OTIO (when every clip has an out point) and fails with MISSING.
 */
export async function assemble({ edl: edlFile, out, otio, force = false, crf = 18, preset = 'medium', absoluteUrls = false } = {}) {
  if (!edlFile || !out || out === true) throw new Error('usage: cstack video assemble <edl.yaml> --out <master.mp4> [--otio <file.otio.json>]');
  const edlAbs = path.resolve(edlFile);
  if (!fs.existsSync(edlAbs)) throw new Error(`EDL not found: ${edlFile}`);
  const edl = parseEDL(readData(edlAbs), { baseDir: path.dirname(edlAbs), name: edlStem(edlAbs) });
  const master = path.resolve(out);
  const otioPath = path.resolve(otio && otio !== true ? otio : path.join(path.dirname(master), `${edlStem(edlAbs)}.otio.json`));
  const srcs = [...new Set(edl.clips.map((c) => c.src))];
  const missing = srcs.filter((s) => !fs.existsSync(s));
  if (missing.length) throw new Error(`EDL clips not found: ${missing.map((s) => relFrom(path.dirname(edlAbs), s)).join(', ')}`);
  const { width, height, fps, fit, audio } = edl.output;
  const otioOpts = (media = []) => ({ otioDir: path.dirname(otioPath), absoluteUrls, media, metadata: { edl: relFrom(path.dirname(otioPath), edlAbs), master: relFrom(path.dirname(otioPath), master) } });
  try {
    await requireTools(['ffmpeg', 'ffprobe'], `trimmed, normalized and joined ${edl.clips.length} clip(s) from ${edlFile} into ${out} (${width}x${height} at ${fps.str} fps, fit ${fit}${audio ? ', clip audio kept' : ', silent'}) and written ${otioPath}`);
  } catch (e) {
    if (!(e instanceof MissingTool) || edl.clips.some((c) => c.out == null)) throw e;
    guardOutputs([otioPath], [edlAbs, ...srcs], { force });
    const tl = buildTimeline(edl);
    fs.mkdirSync(path.dirname(otioPath), { recursive: true });
    writeJSON(otioPath, toOTIO(tl, otioOpts()));
    const rec = new Recorder('video.assemble', { size: `${width}x${height}`, fps: fps.str, fit, audio, otio_only: true });
    await rec.addInput(edlAbs, 'edl');
    for (const s of srcs) await rec.addInput(s, 'clip');
    rec.warnings.push('ffmpeg or ffprobe is missing: the master was not rendered; clip durations come from the EDL out points');
    await rec.write(otioPath, { frames: tl.frames, duration: round(tl.duration, 6), clips: tl.clips.length, master: null });
    throw new MissingTool(e.message.replace('Nothing was written.', `Only the OpenTimelineIO handoff was written (${otioPath}, with its .gen.json), so the cut can be made in an editor.`));
  }
  const infos = new Map();
  for (const s of srcs) infos.set(s, await videoInfo(s));
  const tl = buildTimeline(edl, edl.clips.map((c) => videoDuration(infos.get(c.src))));
  guardOutputs([master, otioPath], [edlAbs, ...srcs], { force });
  fs.mkdirSync(path.dirname(master), { recursive: true });
  fs.mkdirSync(path.dirname(otioPath), { recursive: true });

  const rec = new Recorder('video.assemble', { size: `${width}x${height}`, fps: fps.str, fit, audio, crf: Number(crf), preset: String(preset) });
  await rec.addInput(edlAbs, 'edl');
  const idx = new Map();
  for (const s of srcs) {
    await rec.addInput(s, 'clip');
    idx.set(s, rec.inputs.length - 1);
    rec.warnings.push(...sourceWarnings(infos.get(s), path.basename(s)));
  }
  rec.params.clips = tl.clips.map((c) => ({ input: idx.get(c.src), in: c.in, out: round(c.out, 6), frames: c.frames, focus_x: c.focus_x, transition: c.transition ? { ...c.transition, frames: c.transition_frames } : null }));
  const cwd = path.dirname(master);
  const tmp = fs.mkdtempSync(path.join(cwd, `.${stem(master)}.parts-`));
  try {
    const parts = [];
    const wavs = [];
    for (const [i, c] of tl.clips.entries()) {
      const info = infos.get(c.src);
      const D = c.frames / fps.value;
      const k = String(i + 1).padStart(3, '0');
      const seek = c.in > 0 ? ['-ss', sec(c.in)] : [];
      const part = path.join(tmp, `part-${k}.mp4`);
      const vf = fitFilter({ width, height, fps, fit, focus: c.focus_x, sar: info.video.sar_value });
      await rec.ffmpeg((o) => [...encodeHead(), ...seek, '-i', ffPath(c.src, cwd), '-map', '0:v:0', '-vf', vf, '-frames:v', String(c.frames), ...x264({ crf, preset }), '-an', o], { cwd, outputs: [part] });
      parts.push(part);
      if (!audio) continue;
      const wav = path.join(tmp, `part-${k}.wav`);
      if (info.audio) await rec.ffmpeg((o) => [...encodeHead(), ...seek, '-i', ffPath(c.src, cwd), '-map', '0:a:0', '-af', `aresample=48000,aformat=sample_fmts=s16:channel_layouts=stereo,apad=whole_dur=${sec(D)}`, '-t', sec(D), '-c:a', 'pcm_s16le', o], { cwd, outputs: [wav] });
      else await rec.ffmpeg((o) => [...encodeHead(), '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-t', sec(D), '-c:a', 'pcm_s16le', o], { cwd, outputs: [wav] });
      wavs.push(wav);
    }
    if (!tl.clips.some((c) => c.transition_frames)) {
      const list = (name, files) => {
        const p = path.join(tmp, name);
        fs.writeFileSync(p, files.map((f) => `file '${path.basename(f)}'\n`).join(''));
        return p;
      };
      const vlist = list('video.txt', parts);
      const alist = audio ? list('audio.txt', wavs) : null;
      await rec.ffmpeg((o) => [...encodeHead(), '-f', 'concat', '-i', ffPath(vlist, cwd), ...(audio ? ['-f', 'concat', '-i', ffPath(alist, cwd)] : []), '-map', '0:v:0', '-c:v', 'copy', ...(audio ? ['-map', '1:a:0', ...AAC] : []), ...containerFlags(o), o], { cwd, outputs: [master] });
    } else {
      const graph = joinGraph(tl.clips, { fps, audio });
      const ins = [...parts, ...wavs].flatMap((p) => ['-i', ffPath(p, cwd)]);
      await rec.ffmpeg((o) => [...encodeHead(), ...ins, '-filter_complex', graph, '-map', '[v]', ...(audio ? ['-map', '[a]'] : []), ...x264({ crf, preset }), ...(audio ? AAC : []), ...containerFlags(o), o], { cwd, outputs: [master] });
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const got = await probe(master);
  const gotDur = videoDuration(got);
  if (gotDur != null && Math.abs(gotDur - tl.duration) > 1.5 / fps.value) rec.warnings.push(`master is ${round(gotDur)} s; the EDL computes ${round(tl.duration)} s`);
  const media = tl.clips.map((c) => ({ sha256: rec.inputs[idx.get(c.src)].sha256, duration: videoDuration(infos.get(c.src)), fps: infos.get(c.src).video.fps }));
  writeJSON(otioPath, toOTIO(tl, otioOpts(media)));
  const rate = fps.value;
  const timeline = tl.clips.map((c) => ({ name: c.name, src: relFrom(cwd, c.src), in: c.in, out: round(c.out, 6), frames: c.frames, start: round(c.record_start / rate, 6), end: round(c.record_end / rate, 6), focus_x: c.focus_x, transition: c.transition ? { ...c.transition, frames: c.transition_frames } : null }));
  const result = { width, height, fps: fps.str, frames: tl.frames, duration: round(tl.duration, 6), measured_duration: gotDur, audio: !!got.audio, timeline, focus: focusSegments(tl).map((s) => ({ ...s, start: round(s.start, 6) })), otio: relFrom(cwd, otioPath) };
  await rec.write(master, result, [otioPath]);
  return { master, otio: otioPath, ...result, clips: tl.clips.length, transitions: tl.clips.filter((c) => c.transition_frames).length, warnings: rec.warnings };
}

export const ASPECTS = { '9:16': { width: 1080, height: 1920 }, '4:5': { width: 1080, height: 1350 }, '1:1': { width: 1080, height: 1080 }, '16:9': { width: 1920, height: 1080 } };

export function parseAspects(to) {
  const list = [...new Set(String(to ?? '').split(',').map((s) => s.trim()).filter(Boolean))];
  if (!list.length) throw new Error(`--to needs one or more of ${Object.keys(ASPECTS).join(',')}`);
  for (const a of list) if (!ASPECTS[a]) throw new Error(`unknown aspect "${a}" (known: ${Object.entries(ASPECTS).map(([k, v]) => `${k} ${v.width}x${v.height}`).join(', ')})`);
  return list;
}

const even = (v) => Math.max(2, 2 * Math.round(v / 2));

/** Crop window with the target aspect inside a w x h region: horizontal anchor at focus (0..1), vertical centre. */
export function cropWindow(w, h, tw, th, focus = 0.5) {
  const ta = tw / th;
  if (Math.abs(w / h - ta) / ta < 0.005) return { w, h, x: 0, y: 0 };
  if (w / h > ta) {
    const cw = Math.min(w, even(h * ta));
    const x = Math.min(w - cw, Math.max(0, 2 * Math.round((focus * w - cw / 2) / 2)));
    return { w: cw, h, x, y: 0 };
  }
  const ch = Math.min(h, even(w / ta));
  return { w, h: ch, x: 0, y: Math.min(h - ch, Math.max(0, 2 * Math.round((h - ch) / 4))) };
}

/** Crop filter x as a function of t: piecewise per shot, so each shot keeps its own anchor. */
export function xExpression(xs, t0 = 0) {
  const uniq = [...new Set(xs.map((s) => s.x))];
  if (uniq.length === 1) return String(uniq[0]);
  let e = String(xs.at(-1).x);
  for (let i = xs.length - 2; i >= 0; i--) e = `if(lt(t,${sec(xs[i + 1].start + t0)}),${xs[i].x},${e})`;
  return `'${e}'`;
}

/** Where the subject is: --focus, else an EDL, else the master's assemble sidecar (if it still matches), else centre. */
export async function focusPlan(file, { focus, edl } = {}) {
  if (focus != null && focus !== true) return { source: 'flag', segments: [{ start: 0, focus_x: numIn(focus, '--focus', 0, 1) }] };
  if (edl && edl !== true) {
    const edlAbs = path.resolve(edl);
    const parsed = parseEDL(readData(edlAbs), { baseDir: path.dirname(edlAbs) });
    const durs = [];
    for (const c of parsed.clips) durs.push(c.out ?? videoDuration(await probe(c.src)));
    return { source: 'edl', segments: focusSegments(buildTimeline(parsed, durs)) };
  }
  const side = sidecarPath(path.resolve(file));
  if (fs.existsSync(side)) {
    try {
      const s = readJSON(side);
      if (s.operation === 'video.assemble' && s.result?.focus?.length && s.output?.sha256 === (await hashFile(file))) return { source: 'assemble sidecar', segments: s.result.focus };
    } catch {}
  }
  return { source: 'default', segments: [{ start: 0, focus_x: 0.5 }] };
}

/** One aspect: crop window per shot inside the (letterbox-free) region, then scale to the target size. */
export function aspectPlan(region, target, segments) {
  const base = cropWindow(region.w, region.h, target.width, target.height, 0.5);
  const xs = segments.map((s) => ({ start: s.start, x: region.x + cropWindow(region.w, region.h, target.width, target.height, s.focus_x).x }));
  return { w: base.w, h: base.h, y: region.y + base.y, xs, upscale: round(target.width / base.w, 3) };
}

export const aspectFilter = (plan, target, t0 = 0) => `crop=${plan.w}:${plan.h}:${xExpression(plan.xs, t0)}:${plan.y},scale=${target.width}:${target.height}:flags=lanczos,setsar=1,format=yuv420p`;

/** Shared by reframe and deliver: geometry for every target from one cropdetect pass. */
export async function prepareFraming(src, info, { focus, edl, cropdetect = true } = {}) {
  const W = info.video.display_width;
  const H = info.video.display_height;
  const crop = cropdetect ? await cropDetect(src, info) : null;
  const region = crop?.applied ? crop.crop : { w: W, h: H, x: 0, y: 0 };
  const plan = await focusPlan(src, { focus, edl });
  return { region, crop, focus: plan };
}

/** reframe({file, to='9:16,4:5,1:1,16:9', focus?, edl?, out (dir), cropdetect=true, force, crf, preset}) */
export async function reframe({ file, to, focus, edl, out, cropdetect = true, force = false, crf = 18, preset = 'medium' } = {}) {
  if (!file || !out || out === true) throw new Error('usage: cstack video reframe <master> --to 9:16,4:5,1:1,16:9 [--focus 0.5 | --edl edl.yaml] --out <dir>');
  const aspects = parseAspects(to ?? Object.keys(ASPECTS).join(','));
  await requireTools(['ffmpeg', 'ffprobe'], `cropped ${file} to ${aspects.map((a) => `${a} ${ASPECTS[a].width}x${ASPECTS[a].height}`).join(', ')} into ${out}`);
  const src = path.resolve(file);
  const info = await videoInfo(src);
  const outDir = path.resolve(out);
  const outputs = aspects.map((a) => path.join(outDir, `${stem(src)}.${a.replace(':', 'x')}.mp4`));
  guardOutputs(outputs, [src], { force });
  const framing = await prepareFraming(src, info, { focus, edl, cropdetect });
  fs.mkdirSync(outDir, { recursive: true });
  const input = { file: src, sha256: await hashFile(src), bytes: fs.statSync(src).size };
  const files = [];
  for (const [i, a] of aspects.entries()) {
    const target = ASPECTS[a];
    const plan = aspectPlan(framing.region, target, framing.focus.segments);
    const rec = new Recorder('video.reframe', { aspect: a, size: `${target.width}x${target.height}`, focus_source: framing.focus.source, focus: framing.focus.segments.map((s) => ({ start: round(s.start, 6), focus_x: s.focus_x })), cropdetect: !!cropdetect, crf: Number(crf), preset: String(preset) }, [input]);
    if (framing.crop) rec.note(framing.crop.step.cwd, framing.crop.step.args, framing.crop.step);
    rec.warnings.push(...sourceWarnings(info, path.basename(src)));
    if (plan.upscale > 1.01) rec.warnings.push(`${a}: upscaled ${plan.upscale}x from a ${plan.w}x${plan.h} crop (soft); master wider or larger for this aspect`);
    const cwd = outDir;
    await rec.ffmpeg((o) => [...encodeHead(), '-i', ffPath(src, cwd), '-map', '0:v:0', '-map', '0:a:0?', '-vf', aspectFilter(plan, target, info.start_time), ...x264({ crf, preset }), '-c:a', 'copy', ...containerFlags(o), o], { cwd, outputs: [outputs[i]] });
    const o = await probe(outputs[i]);
    const result = { aspect: a, width: o.video.width, height: o.video.height, crop: plan, letterbox: framing.crop ? { applied: framing.crop.applied, detected: framing.crop.detected, region: framing.region } : null, duration: videoDuration(o) };
    await rec.write(outputs[i], result);
    files.push({ out: outputs[i], ...result, warnings: rec.warnings });
  }
  return { file: src, out: outDir, focus: framing.focus, letterbox: framing.crop?.applied ?? false, region: framing.region, files };
}
