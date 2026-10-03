// cstack video qa: frame-level gates with ids and pass/warn/fail; any fail makes ok false (the CLI exits 1).
//   video.spec      H.264, yuv420p, even dimensions, constant common frame rate (and the plan's size/fps if given)
//   video.freeze    frozen segments >= 0.5 s: a frozen tail fails (a stalled AI ending), mid-clip warns; plan holds pass
//   video.black     black segments >= 0.1 s: a black opening fails (the first frame carries the hook, §4.3), others warn
//   video.cuts      hard cuts vs the plan's beat boundaries: the count must match; each within --cut-tolerance
//   video.roi       SSIM (luma) of a product ROI vs an approved still at the first, last and both sides of every cut
//   video.loudness  integrated loudness within ±1 LU of --lufs and true peak <= --tp
//   video.duration  vs the plan (±1.5 frames passes, ±0.5 s warns)
//   video.safezone  overlay PNG for a person to review (no automated text detection)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readData, writeJSON, nowISO } from '../core.mjs';
import { requireTools, guardOutputs, Recorder, ffmpeg, ffPath, analyzeHead, round, hashFile, pool, parseTime, parseSize, parseFps, numIn, toolInfo, CSTACK_VERSION } from './ffmpeg.mjs';
import { probe, videoDuration } from './probe.mjs';
import { analyze } from './detect.mjs';
import { boundaryFrames, extractFrame } from './frames.mjs';
import { ZONES, safezone } from './captions.mjs';
import { measureFile } from './audio.mjs';

/**
 * Beat plan for `--plan`: a YAML list of beats, or {beats: [...], duration?, size?, fps?}. Other beat keys
 * (role, lens, camera move, path, ...) are ignored, so a video-direction beats.yaml works as is.
 * @typedef {object} Beat
 * @property {number|string} start      seconds from the start of the cut
 * @property {number|string} end        seconds; beats in order, no overlap
 * @property {string} [time]            "0.0-1.8s" in place of start/end
 * @property {number} [duration]        in place of end (start defaults to the previous beat's end)
 * @property {string} [id]              shot id (also read from shot_id or name)
 * @property {boolean} [hold]           an intended static beat (end card, held frame): freezes inside it pass
 * @property {string} [transition]      the boundary INTO this beat is a planned transition, not a hard cut
 */
export function parsePlan(raw) {
  const obj = Array.isArray(raw) ? { beats: raw } : raw;
  if (!obj || !Array.isArray(obj.beats) || !obj.beats.length) throw new Error('plan must be a list of beats (or {beats: [...]}) with start/end seconds');
  const errors = [];
  let prevEnd = 0;
  const beats = obj.beats.map((b, i) => {
    const at = `beats[${i}]`;
    if (!b || typeof b !== 'object') {
      errors.push(`${at} must be a mapping`);
      return null;
    }
    let { start, end } = b;
    const range = typeof b.time === 'string' ? b.time.match(/^\s*(\d+(?:\.\d+)?)\s*s?\s*[-–]\s*(\d+(?:\.\d+)?)\s*s?\s*$/) : null;
    if (range && start == null && end == null) [start, end] = [range[1], range[2]];
    try {
      start = start == null ? prevEnd : parseTime(start, `${at}.start`);
      end = end == null && b.duration != null ? start + parseTime(b.duration, `${at}.duration`) : parseTime(end, `${at}.end`);
    } catch (e) {
      errors.push(e.message);
      return null;
    }
    if (!(end > start)) errors.push(`${at}: end (${end}) must be after start (${start})`);
    if (start < prevEnd - 0.001) errors.push(`${at}: starts at ${start} s, before the previous beat ends (${prevEnd} s)`);
    prevEnd = end;
    return { id: String(b.id ?? b.shot_id ?? b.name ?? `beat-${i + 1}`), start, end, hold: b.hold === true, transition: b.transition ?? null };
  });
  if (errors.length) throw new Error(`invalid plan:\n  - ${errors.join('\n  - ')}`);
  return {
    beats,
    duration: obj.duration != null ? parseTime(obj.duration, 'plan duration') : beats.at(-1).end,
    size: obj.size ? parseSize(obj.size, 'plan size') : null,
    fps: obj.fps ? parseFps(obj.fps, 'plan fps') : null,
  };
}

export function parseROI(s) {
  const p = String(s ?? '').split(',').map((v) => Number(v.trim()));
  if (p.length !== 4 || p.some((v) => !Number.isInteger(v) || v < 0)) throw new Error(`--roi must be x,y,w,h in whole pixels (got ${s})`);
  const [x, y, w, h] = p;
  if (w < 8 || h < 8) throw new Error('--roi must be at least 8x8 pixels (SSIM works on 8x8 windows)');
  return { x, y, w, h };
}

const F = (id, level, detail, data) => ({ id, level, detail, ...(data ? { data } : {}) });
const COMMON_FPS = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];
const tolFor = (fps) => Math.max(0.1, 1.5 / (fps || 25));

export function specFinding(info, plan) {
  const v = info.video;
  const fails = [];
  const warns = [];
  if (v.codec !== 'h264') fails.push(`codec ${v.codec} (H.264 required)`);
  if (v.pix_fmt !== 'yuv420p') fails.push(`pixel format ${v.pix_fmt} (yuv420p required)`);
  if (v.width % 2 || v.height % 2) fails.push(`odd dimensions ${v.width}x${v.height}`);
  if (!v.fps) fails.push('no frame rate');
  else if (v.vfr) warns.push(`variable frame rate (average ${v.fps} fps)`);
  else if (!COMMON_FPS.some((f) => Math.abs(f - v.fps) < 0.01)) warns.push(`${v.fps} fps is not a common delivery rate (24, 25, 30, 50, 60 or NTSC variants)`);
  if (plan?.size && (plan.size.width !== v.display_width || plan.size.height !== v.display_height)) fails.push(`size ${v.display_width}x${v.display_height}; the plan says ${plan.size.width}x${plan.size.height}`);
  if (plan?.fps && v.fps && Math.abs(plan.fps.value - v.fps) > 0.01) fails.push(`${v.fps} fps; the plan says ${plan.fps.str}`);
  if (v.rotation) warns.push(`rotation metadata ${v.rotation}° (bake it in; some players ignore it)`);
  if (v.sar_value !== 1) warns.push(`non-square pixels (SAR ${v.sar})`);
  if (info.audio && info.audio.codec !== 'aac') warns.push(`audio codec ${info.audio.codec} (AAC expected for delivery)`);
  const head = `${v.codec} ${v.pix_fmt} ${v.width}x${v.height} ${v.fps ?? '?'} fps${v.vfr ? ' VFR' : ''}`;
  const level = fails.length ? 'fail' : warns.length ? 'warn' : 'pass';
  return F('video.spec', level, [head, ...fails, ...warns].join('; '), { codec: v.codec, pix_fmt: v.pix_fmt, width: v.width, height: v.height, fps: v.fps, vfr: v.vfr });
}

export function freezeFinding(det, plan) {
  const tol = tolFor(det.fps);
  const holds = plan?.beats.filter((b) => b.hold) ?? [];
  const segs = det.freezes.map((s) => ({ ...s, held: holds.some((b) => s.start >= b.start - tol && s.end <= b.end + tol) }));
  const bad = segs.filter((s) => !s.held);
  const span = (s) => `${s.start.toFixed(2)}-${s.end.toFixed(2)} s (${s.duration.toFixed(2)} s)`;
  if (!bad.length) return F('video.freeze', 'pass', segs.length ? `${segs.length} frozen segment(s), all inside planned holds` : 'no frozen segment >= 0.5 s', { segments: segs });
  const tail = bad.find((s) => s.tail);
  if (tail) return F('video.freeze', 'fail', `frozen tail ${span(tail)}: a stalled ending; trim it, retake it, or mark the beat hold: true if it is an intended end card`, { segments: segs });
  return F('video.freeze', 'warn', `frozen mid-clip ${bad.map(span).join(', ')}: intended? mark the beat hold: true in the plan`, { segments: segs });
}

export function blackFinding(det) {
  const span = (s) => `${s.start.toFixed(2)}-${s.end.toFixed(2)} s`;
  if (!det.blacks.length) return F('video.black', 'pass', 'no black segment >= 0.1 s', { segments: [] });
  const head = det.blacks.find((b) => b.head);
  if (head) return F('video.black', 'fail', `black opening ${span(head)}: the first frame must carry the hook`, { segments: det.blacks });
  return F('video.black', 'warn', `black ${det.blacks.map((b) => `${span(b)}${b.tail ? ' (tail)' : ''}`).join(', ')}`, { segments: det.blacks });
}

export function cutsFinding(det, plan, tolerance = 0.5) {
  const times = det.cuts.map((c) => c.time);
  const list = times.length ? ` at ${times.map((t) => t.toFixed(2)).join(', ')} s` : '';
  if (!plan) return F('video.cuts', 'pass', `${times.length} hard cut(s)${list}; no plan to compare (pass --plan beats.yaml)`, { cuts: det.cuts });
  const expected = plan.beats.slice(1).filter((b) => !b.transition).map((b) => b.start);
  const data = { cuts: det.cuts, expected, threshold: det.threshold };
  if (times.length !== expected.length)
    return F('video.cuts', 'fail', `${times.length} hard cut(s)${list}; the plan expects ${expected.length} (${plan.beats.length} beats): ${times.length < expected.length ? 'morphs or held shots where cuts were planned' : 'extra cuts (flashes, jump cuts or a scene change inside a beat)'}`, data);
  const off = expected.map((b, i) => ({ b, t: times[i] })).filter((x) => Math.abs(x.t - x.b) > tolerance);
  if (off.length) return F('video.cuts', 'warn', `${times.length} cut(s) as planned, but ${off.map((x) => `${x.t.toFixed(2)} s vs ${x.b.toFixed(2)} s`).join(', ')} are more than ${tolerance} s from the plan`, data);
  return F('video.cuts', 'pass', `${times.length} hard cut(s)${list}, matching the plan within ${tolerance} s`, data);
}

export function durationFinding(info, plan) {
  const d = videoDuration(info);
  if (!(d > 0)) return F('video.duration', 'fail', 'unknown or zero duration');
  if (!plan) return F('video.duration', 'pass', `${d.toFixed(2)} s (no plan to compare)`, { duration: d });
  const diff = d - plan.duration;
  const tol = tolFor(info.video.fps);
  const level = Math.abs(diff) <= tol ? 'pass' : Math.abs(diff) <= 0.5 ? 'warn' : 'fail';
  return F('video.duration', level, `${d.toFixed(2)} s; the plan says ${plan.duration.toFixed(2)} s (${diff >= 0 ? '+' : ''}${diff.toFixed(2)} s)`, { duration: d, planned: plan.duration });
}

// ffmpeg prints SSIM with %f: structurally opposite content goes negative, and a constant pair can print nan
const SSIM_RE = (k) => new RegExp(`\\[ssim@q${k} @ [^\\]]+\\] SSIM Y:(-?(?:[0-9.]+|nan|inf)).*?All:(-?(?:[0-9.]+|nan|inf))`);
const ssimValue = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * ROI drift: SSIM of the same rectangle in the product reference (scaled to the video size) and in each sampled frame.
 * A coarse drift alarm, not a label verifier (docs/research/ai-video.md §5). warn < 0.85 and fail < 0.7 are
 * uncalibrated defaults: calibrate them per brand on approved and rejected frames before they gate anything.
 */
export async function roiFinding({ src, info, det, ref, rect, warnAt = 0.85, failAt = 0.7, keepDir = null, input, rec = null }) {
  const W = info.video.display_width;
  const H = info.video.display_height;
  if (rect.x + rect.w > W || rect.y + rect.h > H) throw new Error(`--roi ${rect.x},${rect.y},${rect.w},${rect.h} falls outside the ${W}x${H} frame`);
  const refInfo = await probe(ref);
  if (!refInfo.video) throw new Error(`${ref}: not an image`);
  const RW = refInfo.video.display_width;
  const RH = refInfo.video.display_height;
  const dir = keepDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'cstack-video-qa-'));
  try {
    fs.mkdirSync(dir, { recursive: true });
    const samples = boundaryFrames(det.cuts, info.video.fps).map((s) => ({ ...s, path: path.join(dir, `${s.name}.png`) }));
    await pool(samples, 4, async (s) => {
      const fr = new Recorder('video.qa', { frame: s.name, ...(s.last ? { last: true } : { at: round(s.at, 4) }) }, [input]);
      await extractFrame(fr, src, s, s.path, info.video.fps);
      if (keepDir) await fr.write(s.path, { frame: s.name, at: s.last ? 'last' : round(s.at, 4), cut: s.cut ?? null, roi: rect });
    });
    const crop = `crop=${rect.w}:${rect.h}:${rect.x}:${rect.y}`;
    const g = [`[0:v]scale=${W}:${H}:flags=bicubic,${crop},format=yuv444p,split=${samples.length}${samples.map((_, k) => `[r${k}]`).join('')}`];
    samples.forEach((_, k) => g.push(`[${k + 1}:v]${crop},format=yuv444p[f${k}]`, `[f${k}][r${k}]ssim@q${k}[o${k}]`));
    const img = (p) => ['-f', 'image2', '-pattern_type', 'none', '-i', ffPath(p, dir)];
    const args = [...analyzeHead(), ...img(ref), ...samples.flatMap((s) => img(s.path)), '-filter_complex', g.join(';'), ...samples.flatMap((_, k) => ['-map', `[o${k}]`, '-f', 'null', '-'])];
    const r = await ffmpeg(args, { cwd: dir });
    rec?.note(dir, args, r);
    const scores = samples.map((s, k) => {
      const m = r.stderr.match(SSIM_RE(k));
      if (!m) throw new Error(`no SSIM result for frame ${s.name}`);
      return { frame: s.name, at: s.last ? round(videoDuration(info), 3) : round(s.at, 3), ssim_y: round(ssimValue(m[1]), 4), ssim_all: round(ssimValue(m[2]), 4) };
    });
    const worst = scores.reduce((a, b) => (b.ssim_y < a.ssim_y ? b : a));
    let level = worst.ssim_y < failAt ? 'fail' : worst.ssim_y < warnAt ? 'warn' : 'pass';
    const notes = [];
    if (Math.abs(RW / RH - W / H) / (W / H) > 0.01) {
      notes.push(`the reference is ${RW}x${RH}, a different aspect from the ${W}x${H} video: the comparison is unreliable`);
      if (level === 'pass') level = 'warn';
    } else if (RW !== W || RH !== H) notes.push(`reference scaled from ${RW}x${RH} to ${W}x${H}`);
    const detail = `min SSIM(Y) ${worst.ssim_y} at ${worst.frame} (${worst.at} s) over ${scores.length} frames (first, last, ${det.cuts.length} cut(s) x2) in ROI ${rect.x},${rect.y} ${rect.w}x${rect.h}; coarse drift alarm with uncalibrated defaults (warn < ${warnAt}, fail < ${failAt}): calibrate per brand and confirm a fail with a person or a vision check of the label${notes.length ? `; ${notes.join('; ')}` : ''}`;
    return F('video.roi', level, detail, { roi: rect, reference: path.basename(ref), thresholds: { warn: warnAt, fail: failAt, calibrated: false }, frames: scores });
  } finally {
    if (!keepDir) fs.rmSync(dir, { recursive: true, force: true });
  }
}

export async function loudnessFinding(src, info, { target = -14, tp = -1, explicit = false, rec = null } = {}) {
  if (!info.audio) return F('video.loudness', explicit ? 'fail' : 'warn', `no audio stream${explicit ? '' : ' (a silent master? pass --lufs to require audio)'}`);
  const m = await measureFile(src, { I: target, TP: tp });
  rec?.note(m.step.cwd, m.step.args, m.step);
  const okI = Math.abs(m.input_i - target) <= 1;
  const okTP = m.input_tp <= tp;
  return F('video.loudness', okI && okTP ? 'pass' : 'fail', `${m.input_i} LUFS integrated (target ${target} ±1)${okI ? '' : ' OUT OF RANGE'}, true peak ${m.input_tp} dBTP (max ${tp})${okTP ? '' : ' TOO HOT'}`, { integrated_lufs: m.input_i, true_peak_dbtp: m.input_tp, lra: m.input_lra, target, tp });
}

/**
 * qa({file, plan?, productRef?, roi?, zone?, lufs?, tp=-1, out?, force, roiWarn=0.85, roiFail=0.7, threshold=0.3, cutTolerance=0.5})
 * -> {ok, findings:[{id, level, detail, data}], ...}. --out <dir> keeps review artefacts: qa.json, roi/ frames, safezone-<zone>.png.
 */
export async function qa({ file, plan, productRef, roi, zone, lufs, tp = -1, out, force = false, roiWarn = 0.85, roiFail = 0.7, threshold = 0.3, cutTolerance = 0.5 } = {}) {
  if (!file) throw new Error('usage: cstack video qa <video> [--plan beats.yaml] [--product-ref still.png --roi x,y,w,h] [--zone reels] [--lufs -14] [--out <dir>] [--json]');
  const has = (v) => v != null && v !== true && v !== '';
  if (has(productRef) !== has(roi)) throw new Error('--product-ref and --roi go together (the ROI is cropped from both the still and the video)');
  const rect = has(roi) ? parseROI(roi) : null;
  if (has(zone) && !ZONES[zone]) throw new Error(`unknown --zone "${zone}" (known: ${Object.keys(ZONES).join(', ')})`);
  const explicit = has(lufs);
  const target = explicit ? numIn(lufs, '--lufs', -70, -5) : -14;
  const tpT = numIn(tp, '--tp', -9, 0);
  const wAt = numIn(roiWarn, '--roi-warn', 0, 1);
  const fAt = numIn(roiFail, '--roi-fail', 0, 1);
  if (fAt > wAt) throw new Error('--roi-fail must not be above --roi-warn');
  const tol = numIn(cutTolerance, '--cut-tolerance', 0, 10);
  const planAbs = has(plan) ? path.resolve(plan) : null;
  const planObj = planAbs ? parsePlan(readData(planAbs)) : null;
  await requireTools(['ffmpeg', 'ffprobe'], `checked ${file}: spec, frozen and black segments, cuts${planObj ? ' against the plan' : ''}${rect ? ', ROI drift against the product reference' : ''}, loudness and duration`);
  const src = path.resolve(file);
  if (!fs.existsSync(src)) throw new Error(`input not found: ${file}`);
  const refAbs = rect ? path.resolve(productRef) : null;
  if (refAbs && !fs.existsSync(refAbs)) throw new Error(`product reference not found: ${productRef}`);
  const info = await probe(src);
  if (!info.video || info.image) throw new Error(`${file}: no video stream`);
  const det = await analyze(src, { info, threshold: numIn(threshold, '--threshold', 0.01, 0.99) });

  const outDir = has(out) ? path.resolve(out) : null;
  const roiDir = outDir && rect ? path.join(outDir, 'roi') : null;
  const zonePng = outDir && has(zone) ? path.join(outDir, `safezone-${zone}.png`) : null;
  if (outDir) {
    const planned = [path.join(outDir, 'qa.json'), ...(roiDir ? boundaryFrames(det.cuts, info.video.fps).map((s) => path.join(roiDir, `${s.name}.png`)) : []), ...(zonePng ? [zonePng] : [])];
    guardOutputs(planned, [src, refAbs, planAbs].filter(Boolean), { force });
    fs.mkdirSync(outDir, { recursive: true });
  }
  const input = { file: src, sha256: await hashFile(src), bytes: fs.statSync(src).size };
  // with --out, qa.json gets a sidecar like any other output: inputs, every analysis pass, ffmpeg version
  const rec = outDir ? new Recorder('video.qa', { plan: !!planObj, roi: rect, zone: has(zone) ? zone : null, lufs: target, lufs_required: explicit, tp: tpT, roi_warn: wAt, roi_fail: fAt, threshold: det.threshold, cut_tolerance: tol }, [{ ...input, role: 'video' }]) : null;
  if (rec && planAbs) await rec.addInput(planAbs, 'plan');
  if (rec && refAbs) await rec.addInput(refAbs, 'product_ref');
  rec?.note(det.step.cwd, det.step.args, det.step);
  const findings = [specFinding(info, planObj), freezeFinding(det, planObj), blackFinding(det), cutsFinding(det, planObj, tol)];
  if (rect) findings.push(await roiFinding({ src, info, det, ref: refAbs, rect, warnAt: wAt, failAt: fAt, keepDir: roiDir, input, rec }));
  findings.push(await loudnessFinding(src, info, { target, tp: tpT, explicit, rec }));
  findings.push(durationFinding(info, planObj));
  if (has(zone)) {
    if (zonePng) {
      await safezone({ file: src, zone, out: zonePng, force });
      findings.push(F('video.safezone', 'warn', `human review: is all text and every key element inside the ${zone} zone? overlay ${path.relative(outDir, zonePng)}`, { overlay: zonePng }));
    } else findings.push(F('video.safezone', 'warn', `not checked: pass --out <dir> to write the ${zone} overlay for human review`));
  }
  const count = (l) => findings.filter((f) => f.level === l).length;
  const ok = count('fail') === 0;
  const report = {
    tool: 'cstack video qa',
    cstack_version: CSTACK_VERSION,
    file: src,
    sha256: input.sha256,
    ok,
    summary: { fail: count('fail'), warn: count('warn'), pass: count('pass') },
    video: { width: info.video.display_width, height: info.video.display_height, fps: info.video.fps, duration: videoDuration(info), audio: !!info.audio },
    plan: planAbs,
    findings,
    ffmpeg: (await toolInfo('ffmpeg'))?.version ?? null,
    created_at: nowISO(),
  };
  if (outDir) {
    const rel = (p) => (p ? path.relative(outDir, p).split(path.sep).join('/') : p);
    writeJSON(path.join(outDir, 'qa.json'), { ...report, file: rel(src), plan: rel(planAbs), findings: findings.map((f) => (f.data?.overlay ? { ...f, data: { ...f.data, overlay: rel(f.data.overlay) } } : f)) });
    await rec.write(path.join(outDir, 'qa.json'), { ok, summary: report.summary });
    report.report = path.join(outDir, 'qa.json');
  }
  return report;
}

export function formatQA(r) {
  const v = r.video;
  const lines = [`video qa ${r.file}: ${v.width}x${v.height} ${v.fps} fps ${v.duration?.toFixed(2)} s${v.audio ? '' : ' (no audio)'}`];
  for (const f of r.findings) lines.push(`  ${f.level.toUpperCase().padEnd(4)}  ${f.id.padEnd(15)} ${f.detail}`);
  if (r.report) lines.push(`  report: ${r.report}`);
  lines.push(`video qa: ${r.ok ? 'PASS' : 'FAIL'} (${r.summary.fail} fail, ${r.summary.warn} warn)`);
  return lines.join('\n');
}
