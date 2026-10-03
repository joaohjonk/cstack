// cstack video audio: two-pass loudnorm to a target integrated loudness and true peak, with an optional music bed
// mixed under the original audio. Pass 1 measures (print_format=json); pass 2 applies the measured_* values with
// linear=true; a final pass measures the written file, so the report is what was delivered, not loudnorm's estimate.
// Targets (docs/research/ai-video.md §4.3): -14 LUFS integrated and -1 dBTP for YouTube/Spotify-class normalisation
// ([3P] openclip.app/learn/audio-normalization); TikTok and Instagram normalise themselves (-14 to -16 is a safe range);
// EBU R128 -23 is broadcast, not social.
import fs from 'node:fs';
import path from 'node:path';
import { requireTools, guardOutputs, Recorder, ffmpeg, ffPath, encodeHead, analyzeHead, containerFlags, sec, round, numIn } from './ffmpeg.mjs';
import { probe, videoDuration } from './probe.mjs';
import { AAC } from './edit.mjs';

const num = (v) => (v === '-inf' ? -Infinity : v === 'inf' || v === '+inf' ? Infinity : Number(v));

/** The last loudnorm JSON block in an ffmpeg log. */
export function parseLoudnorm(stderr) {
  const all = [...stderr.matchAll(/\{\s*"input_i"[\s\S]*?\}/g)];
  if (!all.length) throw new Error('loudnorm printed no measurement (no audio, or the audio is too short)');
  const j = JSON.parse(all.at(-1)[0]);
  const out = {};
  for (const k of ['input_i', 'input_tp', 'input_lra', 'input_thresh', 'output_i', 'output_tp', 'output_lra', 'output_thresh', 'target_offset']) out[k] = num(j[k]);
  out.normalization_type = j.normalization_type ?? null;
  return out;
}

const STEREO = 'aresample=48000,aformat=channel_layouts=stereo';

/** Measure integrated loudness and true peak of a graph ending in [mix] (or of a file's first audio stream). */
export async function measure({ cwd, inputs, graph, I = -14, TP = -1, LRA = 11 }) {
  const args = [...analyzeHead(), ...inputs, '-filter_complex', `${graph};[mix]loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:print_format=json[out]`, '-map', '[out]', '-f', 'null', '-'];
  const r = await ffmpeg(args, { cwd });
  return { ...parseLoudnorm(r.stderr), step: { cwd, args, started_at: r.started_at, elapsed_ms: r.elapsed_ms } };
}

export async function measureFile(file, opts = {}) {
  const abs = path.resolve(file);
  const cwd = path.dirname(abs);
  return measure({ cwd, inputs: ['-i', ffPath(abs, cwd)], graph: `[0:a:0]${STEREO}[mix]`, ...opts });
}

const finite = (v) => Number.isFinite(v) && v > -70;

/**
 * audio({file, bed?, lufs=-14, tp=-1, lra=11, bedGap=10, out, force})
 * bedGap: the bed sits this many LU under the original audio before the final normalisation (an uncalibrated default;
 * mix by ear). Without original audio the bed is the soundtrack. The bed loops to cover the video and fades out.
 */
export async function audio({ file, bed, lufs = -14, tp = -1, lra = 11, bedGap = 10, out, force = false } = {}) {
  if (!file || !out || out === true) throw new Error('usage: cstack video audio <video> [--bed music.wav] [--lufs -14] [--tp -1] --out <file>');
  const I = numIn(lufs, '--lufs', -70, -5);
  const TP = numIn(tp, '--tp', -9, 0);
  const LRA = numIn(lra, '--lra', 1, 50);
  const gap = numIn(bedGap, '--bed-gap', 0, 40);
  const hasBed = bed != null && bed !== true;
  await requireTools(['ffmpeg', 'ffprobe'], `normalized the audio of ${file}${hasBed ? ` with ${bed} mixed under it` : ''} to ${I} LUFS / ${TP} dBTP (two-pass loudnorm, linear) into ${out}`);
  const src = path.resolve(file);
  const bedAbs = hasBed ? path.resolve(bed) : null;
  const outAbs = path.resolve(out);
  for (const f of [src, bedAbs].filter(Boolean)) if (!fs.existsSync(f)) throw new Error(`input not found: ${f}`);
  const info = await probe(src);
  const bedInfo = hasBed ? await probe(bedAbs) : null;
  if (hasBed && !bedInfo.audio) throw new Error(`${bed}: no audio stream`);
  if (!info.audio && !hasBed) throw new Error(`${file}: no audio stream and no --bed; nothing to normalise`);
  const D = videoDuration(info) ?? info.audio?.duration;
  if (!(D > 0)) throw new Error(`${file}: unknown duration`);
  guardOutputs([outAbs], [src, bedAbs].filter(Boolean), { force });
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });

  const rec = new Recorder('video.audio', { lufs: I, tp: TP, lra: LRA, bed: hasBed, bed_gap: hasBed ? gap : null });
  await rec.addInput(src, 'video');
  if (hasBed) await rec.addInput(bedAbs, 'bed');
  const cwd = path.dirname(outAbs);
  const inputs = ['-i', ffPath(src, cwd), ...(hasBed ? ['-stream_loop', '-1', '-i', ffPath(bedAbs, cwd)] : [])];
  const dur = sec(D);
  const fade = Math.min(0.5, D / 4);
  const orig = `[0:a:0]${STEREO},apad=whole_dur=${dur},atrim=duration=${dur}`;
  const bedChain = (gain) => `[1:a:0]${STEREO},atrim=duration=${dur}${gain ? `,volume=${round(gain, 2)}dB` : ''},afade=t=out:st=${sec(D - fade)}:d=${sec(fade)}`;
  const report = { input: null, bed: null, mix: null };

  let graph;
  if (info.audio) {
    const m = await measure({ cwd, inputs, graph: `${orig}[mix]`, I, TP, LRA });
    rec.note(cwd, m.step.args, m.step);
    report.input = { integrated_lufs: m.input_i, true_peak_dbtp: m.input_tp, lra: m.input_lra };
  }
  if (hasBed) {
    const b = await measure({ cwd, inputs, graph: `${bedChain(0)}[mix]`, I, TP, LRA });
    rec.note(cwd, b.step.args, b.step);
    report.bed = { integrated_lufs: b.input_i, true_peak_dbtp: b.input_tp };
    if (!finite(b.input_i)) throw new Error(`${bed}: the bed is silent`);
    if (info.audio && finite(report.input.integrated_lufs)) {
      const gain = report.input.integrated_lufs - gap - b.input_i;
      report.bed.gain_db = round(gain, 2);
      graph = `${orig}[o];${bedChain(gain)}[b];[o][b]amix=inputs=2:duration=first:normalize=0[mix]`;
    } else {
      if (info.audio) rec.warnings.push('original audio is silent; the bed is the whole soundtrack');
      graph = `${bedChain(0)}[mix]`;
    }
  } else graph = `${orig}[mix]`;

  const m1 = await measure({ cwd, inputs, graph, I, TP, LRA });
  rec.note(cwd, m1.step.args, m1.step);
  report.mix = { integrated_lufs: m1.input_i, true_peak_dbtp: m1.input_tp, lra: m1.input_lra, thresh: m1.input_thresh };
  if (!finite(m1.input_i)) throw new Error(`${file}: the audio to normalise is silent (${m1.input_i} LUFS)`);
  // linear mode needs target LRA >= source LRA, else loudnorm silently falls back to dynamic
  const lraT = m1.input_lra > LRA ? Math.min(50, Math.ceil(m1.input_lra + 1)) : LRA;
  if (lraT !== LRA) rec.warnings.push(`source LRA ${m1.input_lra} LU exceeds --lra ${LRA}; target LRA raised to ${lraT} to keep linear normalisation`);

  // loudnorm reads measured_LRA=0 as "not given" and drops to dynamic mode; steady sources (tones, flat beds) measure
  // 0.00, so pass 0.01 LU, inside the measurement's own rounding
  const mLRA = Math.max(m1.input_lra, 0.01);
  const apply = async (tpT) => {
    const ln = `loudnorm=I=${I}:TP=${tpT}:LRA=${lraT}:measured_I=${m1.input_i}:measured_TP=${m1.input_tp}:measured_LRA=${mLRA}:measured_thresh=${m1.input_thresh}:offset=${m1.target_offset}:linear=true:print_format=json`;
    const r = await rec.ffmpeg((o) => [...encodeHead('info'), ...inputs, '-filter_complex', `${graph};[mix]${ln},aresample=48000[out]`, '-map', '0:v:0?', '-c:v', 'copy', '-map', '[out]', ...AAC, '-t', dur, ...containerFlags(o), o], { cwd, outputs: [outAbs] });
    const applied = parseLoudnorm(r.stderr);
    const v = await measureFile(outAbs, { I, TP, LRA: lraT });
    rec.note(v.step.cwd, v.step.args, v.step);
    return { tp_target: tpT, normalization_type: applied.normalization_type, output: { integrated_lufs: v.input_i, true_peak_dbtp: v.input_tp, lra: v.input_lra } };
  };
  let res = await apply(TP);
  if (res.output.true_peak_dbtp > TP + 0.05) {
    // the AAC encode overshoots the limiter: retry once with the target lowered by the overshoot
    const lower = round(Math.max(-9, TP - (res.output.true_peak_dbtp - TP) - 0.2), 2);
    rec.warnings.push(`true peak ${res.output.true_peak_dbtp} dBTP after encoding exceeded ${TP}; re-applied with TP=${lower}`);
    res = await apply(lower);
  }
  const okI = Math.abs(res.output.integrated_lufs - I) <= 1;
  const okTP = res.output.true_peak_dbtp <= TP + 0.05;
  if (res.normalization_type !== 'linear') rec.warnings.push(`loudnorm used ${res.normalization_type} mode (the linear gain would have pushed the true peak over the target), so a limiter shaped the peaks`);
  const result = { target: { integrated_lufs: I, true_peak_dbtp: TP, lra: lraT }, ...report, output: res.output, normalization_type: res.normalization_type, tp_target_used: res.tp_target, within_tolerance: okI && okTP, duration: round(D, 6) };
  await rec.write(outAbs, result);
  return { ok: okI && okTP, out: outAbs, ...result, warnings: rec.warnings };
}
