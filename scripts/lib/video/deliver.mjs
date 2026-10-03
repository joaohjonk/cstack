// cstack video deliver: per-channel encodes from one master plus manifest.json (files, verified specs, sha256).
// Frames and encode spec: docs/research/ai-video.md §4.3 (9:16 1080x1920, 4:5 1080x1350, 1:1 1080x1080,
// 16:9 1920x1080; H.264 yuv420p, 30 fps or source 24, AAC 192k, +faststart, [O] krea delivery spec).
// Which channel takes which frame is cstack's default (inferred, not a platform rule): feeds 4:5, full-screen 9:16, YouTube 16:9.
import fs from 'node:fs';
import path from 'node:path';
import { writeJSON, nowISO } from '../core.mjs';
import { requireTools, guardOutputs, Recorder, ffPath, encodeHead, containerFlags, x264, hashFile, toolInfo, CSTACK_VERSION } from './ffmpeg.mjs';
import { probe, videoDuration } from './probe.mjs';
import { ASPECTS, AAC, aspectPlan, aspectFilter, prepareFraming } from './edit.mjs';

export const CHANNELS = {
  meta: { aspect: '4:5', label: 'Meta feed (Facebook, Instagram)' },
  square: { aspect: '1:1', label: 'square feed' },
  reels: { aspect: '9:16', label: 'Instagram and Facebook Reels' },
  tiktok: { aspect: '9:16', label: 'TikTok' },
  shorts: { aspect: '9:16', label: 'YouTube Shorts' },
  youtube: { aspect: '16:9', label: 'YouTube' },
};
const ALIASES = { yt: 'youtube' };

export function parseChannels(s) {
  const list = [...new Set(String(s ?? '').split(',').map((c) => ALIASES[c.trim().toLowerCase()] ?? c.trim().toLowerCase()).filter(Boolean))];
  if (!list.length) throw new Error(`--channels needs one or more of ${Object.keys(CHANNELS).join(',')}`);
  for (const c of list) if (!CHANNELS[c]) throw new Error(`unknown channel "${c}" (known: ${Object.entries(CHANNELS).map(([k, v]) => `${k} ${v.aspect}`).join(', ')}; alias yt)`);
  return list;
}

/** Keep 24, 25 or 30 (and NTSC variants) from the source; anything else is delivered at 30. */
export function deliveryFps(src) {
  const keep = { 23.976: '24000/1001', 24: '24', 25: '25', 29.97: '30000/1001', 30: '30' };
  const hit = Object.keys(keep).find((k) => Math.abs(Number(k) - (src ?? 0)) < 0.01);
  return hit ? keep[hit] : '30';
}

/** deliver({file, channels='meta,tiktok,youtube,reels', out (dir), focus?, edl?, cropdetect=true, force, crf=18, preset='medium'}) */
export async function deliver({ file, channels = 'meta,tiktok,youtube,reels', out, focus, edl, cropdetect = true, force = false, crf = 18, preset = 'medium' } = {}) {
  if (!file || !out || out === true) throw new Error('usage: cstack video deliver <master> --channels meta,tiktok,youtube,reels --out <dir>');
  const list = parseChannels(channels);
  await requireTools(['ffmpeg', 'ffprobe'], `encoded ${file} for ${list.map((c) => `${c} ${ASPECTS[CHANNELS[c].aspect].width}x${ASPECTS[CHANNELS[c].aspect].height}`).join(', ')} (H.264 yuv420p, AAC 192k, +faststart) with a manifest into ${out}`);
  const src = path.resolve(file);
  if (!fs.existsSync(src)) throw new Error(`input not found: ${file}`);
  const info = await probe(src);
  if (!info.video || info.image) throw new Error(`${file}: no video stream`);
  const outDir = path.resolve(out);
  const base = path.basename(src, path.extname(src));
  const files = list.map((c) => ({ channel: c, aspect: CHANNELS[c].aspect, out: path.join(outDir, `${base}.${c}.mp4`) }));
  const manifestPath = path.join(outDir, 'manifest.json');
  guardOutputs([...files.map((f) => f.out), manifestPath], [src], { force });
  const framing = await prepareFraming(src, info, { focus, edl, cropdetect });
  fs.mkdirSync(outDir, { recursive: true });
  const fps = deliveryFps(info.video.fps);
  const input = { file: src, sha256: await hashFile(src), bytes: fs.statSync(src).size };
  const warnings = [];
  if (!info.audio) warnings.push('the master has no audio stream; files are delivered silent (platforms expect AAC)');
  if (info.c2pa) warnings.push('the master carries a C2PA manifest; re-encoding drops it, so re-sign the deliverables or rely on the platform AI-content disclosure');
  const encoded = new Map();
  const rows = [];
  // the manifest's own sidecar: every pass behind the delivery, in order
  const all = new Recorder('video.deliver', { channels: list, fps, crf: Number(crf), preset: String(preset), focus_source: framing.focus.source }, [input]);
  if (framing.crop) all.note(framing.crop.step.cwd, framing.crop.step.args, framing.crop.step);
  for (const f of files) {
    const target = ASPECTS[f.aspect];
    const plan = aspectPlan(framing.region, target, framing.focus.segments);
    const params = { channel: f.channel, aspect: f.aspect, size: `${target.width}x${target.height}`, fps, audio: info.audio ? 'aac 192k 48 kHz stereo' : null, crf: Number(crf), preset: String(preset), focus_source: framing.focus.source };
    const rec = new Recorder('video.deliver', params, [input]);
    if (framing.crop) rec.note(framing.crop.step.cwd, framing.crop.step.args, framing.crop.step);
    if (plan.upscale > 1.01) rec.warnings.push(`${f.channel}: upscaled ${plan.upscale}x from a ${plan.w}x${plan.h} crop (soft)`);
    const same = encoded.get(f.aspect);
    if (same) {
      // same frame, same encode parameters: copy the bytes instead of encoding twice (libx264 output is deterministic)
      const t0 = Date.now();
      fs.copyFileSync(same.out, f.out);
      rec.steps.push(same.step, { bin: 'copy', cwd: outDir, args: [ffPath(same.out, outDir), ffPath(f.out, outDir)], started_at: nowISO(), elapsed_ms: Date.now() - t0, note: `the encode above wrote ${path.basename(same.out)}; this file is a byte copy` });
      all.steps.push(rec.steps.at(-1));
    } else {
      const cwd = outDir;
      const vf = `fps=${fps},${aspectFilter(plan, target, info.start_time)}`;
      await rec.ffmpeg((o) => [...encodeHead(), '-i', ffPath(src, cwd), '-map', '0:v:0', ...(info.audio ? ['-map', '0:a:0'] : []), '-vf', vf, ...x264({ crf, preset }), '-profile:v', 'high', ...(info.audio ? AAC : []), ...containerFlags(o), o], { cwd, outputs: [f.out] });
      encoded.set(f.aspect, { out: f.out, step: rec.steps.at(-1) });
      all.steps.push(rec.steps.at(-1));
    }
    const o = await probe(f.out);
    const issues = [];
    if (o.video.codec !== 'h264') issues.push(`codec ${o.video.codec}`);
    if (o.video.pix_fmt !== 'yuv420p') issues.push(`pixel format ${o.video.pix_fmt}`);
    if (o.video.width !== target.width || o.video.height !== target.height) issues.push(`size ${o.video.width}x${o.video.height}`);
    if (!o.faststart) issues.push('moov atom is not at the front (no faststart)');
    if (info.audio && (o.audio?.codec !== 'aac' || o.audio?.sample_rate !== 48000)) issues.push(`audio ${o.audio?.codec ?? 'missing'} ${o.audio?.sample_rate ?? ''}`.trim());
    const sha256 = await hashFile(f.out);
    const row = {
      channel: f.channel,
      label: CHANNELS[f.channel].label,
      path: path.relative(outDir, f.out).split(path.sep).join('/'),
      aspect: f.aspect,
      width: o.video.width,
      height: o.video.height,
      fps: o.video.fps,
      duration: videoDuration(o),
      video_codec: o.video.codec,
      profile: o.video.profile,
      pix_fmt: o.video.pix_fmt,
      audio_codec: o.audio?.codec ?? null,
      audio_bit_rate: o.audio?.bit_rate ?? null,
      sample_rate: o.audio?.sample_rate ?? null,
      faststart: o.faststart,
      upscale: plan.upscale,
      bytes: fs.statSync(f.out).size,
      sha256,
      issues,
    };
    await rec.write(f.out, { ...row, crop: plan });
    rows.push({ ...row, warnings: rec.warnings });
  }
  const ok = rows.every((r) => !r.issues.length);
  const manifest = {
    tool: 'cstack video deliver',
    cstack_version: CSTACK_VERSION,
    created_at: nowISO(),
    ok,
    source: { path: path.relative(outDir, src).split(path.sep).join('/'), sha256: input.sha256, width: info.video.display_width, height: info.video.display_height, fps: info.video.fps, duration: videoDuration(info), audio: !!info.audio },
    encode: { video: `H.264 libx264 high, yuv420p, crf ${crf}, preset ${preset}`, fps, audio: info.audio ? 'AAC 192 kb/s, 48 kHz, stereo' : 'none', container: 'mp4, +faststart' },
    specs_source: 'docs/research/ai-video.md §4.3 (cstack); channel-to-frame mapping is a cstack default',
    framing: { focus: framing.focus.source, letterbox_removed: framing.crop?.applied ?? false, region: framing.region },
    ffmpeg: (await toolInfo('ffmpeg'))?.version ?? null,
    files: rows.map(({ warnings: _w, ...r }) => r),
    warnings: [...warnings, ...rows.flatMap((r) => r.warnings)],
  };
  writeJSON(manifestPath, manifest);
  all.warnings.push(...manifest.warnings);
  await all.write(manifestPath, { ok, files: rows.map((r) => ({ channel: r.channel, path: r.path, sha256: r.sha256 })) });
  return { ok, out: outDir, manifest: manifestPath, files: rows, warnings: manifest.warnings };
}
