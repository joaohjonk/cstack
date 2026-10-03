// cstack video cuts: scene cuts, frozen and black segments in ONE decode pass
// (freezedetect -> blackdetect -> select gt(scene,t) -> metadata print), and letterbox detection (cropdetect).
// Times are seconds from the start of the file (stream start_time removed).
import path from 'node:path';
import { ffmpeg, ffPath, analyzeHead, round } from './ffmpeg.mjs';
import { videoDuration } from './probe.mjs';

const N = '([-+0-9.e]+)';

/** Scene cuts from `select='gt(scene,t)',metadata=mode=print:key=lavfi.scene_score` log lines. */
export function parseScene(stderr, start = 0) {
  const cuts = [];
  let t = null;
  for (const line of stderr.split('\n')) {
    const m = line.match(new RegExp(`\\[Parsed_metadata_\\d+ @ [^\\]]+\\] frame:\\s*\\d+\\s+pts:\\s*\\S+\\s+pts_time:${N}`));
    if (m) {
      t = Number(m[1]);
      continue;
    }
    const s = line.match(/lavfi\.scene_score=([0-9.]+)/);
    if (s && t != null) {
      cuts.push({ time: round(t - start, 4), score: round(Number(s[1]), 4) });
      t = null;
    }
  }
  return cuts;
}

const tolerance = (fps) => Math.max(0.1, 1.5 / (fps || 25));

/** Frozen segments. freezedetect logs no freeze_end when the freeze runs to EOF: that open segment is the frozen tail. */
export function parseFreeze(stderr, { start = 0, duration = null, fps = null } = {}) {
  const out = [];
  let open = null;
  for (const m of stderr.matchAll(new RegExp(`lavfi\\.freezedetect\\.freeze_(start|end):\\s*${N}`, 'g'))) {
    const v = Number(m[2]) - start;
    if (m[1] === 'start') open = v;
    else if (open != null) {
      out.push({ start: open, end: v });
      open = null;
    }
  }
  if (open != null && duration != null) out.push({ start: open, end: duration, open: true });
  const tol = tolerance(fps);
  return out.map((s) => ({ start: round(s.start), end: round(s.end), duration: round(s.end - s.start), tail: !!s.open || (duration != null && s.end >= duration - tol) }));
}

/** Black segments from blackdetect (which does report a black tail at EOF). */
export function parseBlack(stderr, { start = 0, duration = null, fps = null } = {}) {
  const tol = tolerance(fps);
  return [...stderr.matchAll(new RegExp(`black_start:${N} black_end:${N} black_duration:${N}`, 'g'))].map((m) => {
    const s = Number(m[1]) - start;
    const e = Number(m[2]) - start;
    return { start: round(s), end: round(e), duration: round(Number(m[3])), head: s <= tol, tail: duration != null && e >= duration - tol };
  });
}

/** Last cropdetect line (reset=0 accumulates over the whole file, so it is the union of all content). */
export function parseCrop(stderr) {
  const all = [...stderr.matchAll(/crop=(-?\d+):(-?\d+):(-?\d+):(-?\d+)/g)];
  if (!all.length) return null;
  const [w, h, x, y] = all.at(-1).slice(1).map(Number);
  return { w, h, x, y };
}

/**
 * analyze(file, {info, threshold=0.3, freezeNoise='-60dB', freezeMin=0.5, blackMin=0.1, pixTh=0.1})
 * -> {duration, fps, threshold, cuts:[{time, score}], freezes:[{start,end,duration,tail}], blacks:[{start,end,duration,head,tail}], step}
 */
export async function analyze(file, { info, threshold = 0.3, freezeNoise = '-60dB', freezeMin = 0.5, blackMin = 0.1, pixTh = 0.1 } = {}) {
  if (!(threshold > 0 && threshold < 1)) throw new Error(`--threshold must be between 0 and 1 (got ${threshold})`);
  const abs = path.resolve(file);
  const cwd = path.dirname(abs);
  const vf = [`freezedetect=n=${freezeNoise}:d=${freezeMin}`, `blackdetect=d=${blackMin}:pix_th=${pixTh}`, `select='gt(scene,${threshold})'`, 'metadata=mode=print:key=lavfi.scene_score'].join(',');
  const args = [...analyzeHead(), '-i', ffPath(abs, cwd), '-map', '0:v:0', '-vf', vf, '-an', '-sn', '-dn', '-f', 'null', '-'];
  const r = await ffmpeg(args, { cwd });
  const start = info?.start_time ?? 0;
  const duration = info ? videoDuration(info) : null;
  const fps = info?.video?.fps ?? null;
  return {
    file: abs,
    duration,
    fps,
    threshold,
    cuts: parseScene(r.stderr, start),
    freezes: parseFreeze(r.stderr, { start, duration, fps }),
    blacks: parseBlack(r.stderr, { start, duration, fps }),
    step: { cwd, args, started_at: r.started_at, elapsed_ms: r.elapsed_ms },
  };
}

/**
 * Letterbox / pillarbox detection. Applied only when the bars are significant (>= 2% and >= 8 px) and symmetric
 * (within 1% / 4 px), so a dark vignette or a dark scene edge is not mistaken for bars.
 */
export function judgeCrop(det, W, H) {
  const none = { w: W, h: H, x: 0, y: 0 };
  if (!det || det.w <= 0 || det.h <= 0 || det.w > W || det.h > H) return { detected: det, letterbox: false, pillarbox: false, applied: false, crop: none };
  const top = det.y;
  const bottom = H - det.y - det.h;
  const left = det.x;
  const right = W - det.x - det.w;
  const sig = (a, b, D) => a + b >= Math.max(8, 0.02 * D) && Math.abs(a - b) <= Math.max(4, 0.01 * D);
  const letterbox = sig(top, bottom, H);
  const pillarbox = sig(left, right, W);
  const crop = { w: pillarbox ? det.w : W, h: letterbox ? det.h : H, x: pillarbox ? det.x : 0, y: letterbox ? det.y : 0 };
  return { detected: det, bars: { top, bottom, left, right }, letterbox, pillarbox, applied: letterbox || pillarbox, crop };
}

export async function cropDetect(file, info) {
  const abs = path.resolve(file);
  const cwd = path.dirname(abs);
  const args = [...analyzeHead(), '-i', ffPath(abs, cwd), '-map', '0:v:0', '-vf', 'cropdetect=round=2:reset=0', '-an', '-sn', '-dn', '-f', 'null', '-'];
  const r = await ffmpeg(args, { cwd });
  return { ...judgeCrop(parseCrop(r.stderr), info.video.display_width, info.video.display_height), step: { cwd, args, started_at: r.started_at, elapsed_ms: r.elapsed_ms } };
}

export function formatAnalysis(a) {
  const span = (s) => `${s.start.toFixed(2)}-${s.end.toFixed(2)} s (${s.duration.toFixed(2)} s)`;
  const lines = [`${a.file}  ${a.duration != null ? `${a.duration.toFixed(2)} s` : ''}${a.fps ? `  ${a.fps} fps` : ''}  threshold ${a.threshold}`];
  lines.push(a.cuts.length ? `  cuts (${a.cuts.length}): ${a.cuts.map((c) => `${c.time.toFixed(3)} s (${c.score.toFixed(2)})`).join(', ')}` : '  cuts: none');
  lines.push(a.freezes.length ? `  frozen: ${a.freezes.map((s) => `${span(s)}${s.tail ? ' TAIL' : ''}`).join(', ')}` : '  frozen: none >= 0.5 s');
  lines.push(a.blacks.length ? `  black: ${a.blacks.map((s) => `${span(s)}${s.head ? ' HEAD' : ''}${s.tail ? ' TAIL' : ''}`).join(', ')}` : '  black: none >= 0.1 s');
  return lines.join('\n');
}
