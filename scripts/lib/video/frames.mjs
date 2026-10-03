// cstack video sheet: a contact sheet of N evenly spaced frames (one decode pass: select by time -> scale -> tile),
// plus first, last and cut-boundary frames (both sides of every cut) in a sibling folder for review.
import fs from 'node:fs';
import path from 'node:path';
import { requireTools, guardOutputs, Recorder, ffPath, encodeHead, sec, round, hashFile, pool, int, numIn } from './ffmpeg.mjs';
import { probe, videoDuration } from './probe.mjs';
import { analyze } from './detect.mjs';

/** First, last and both sides of every cut. Half-frame offsets make the accurate seek land on the intended frame. */
export function boundaryFrames(cuts, fps) {
  const f = 1 / (fps || 25);
  const list = [
    { name: 'first', at: 0 },
    { name: 'last', last: true },
  ];
  cuts.forEach((c, i) => {
    const k = String(i + 1).padStart(2, '0');
    list.push({ name: `cut-${k}-before`, at: Math.max(0, c.time - 1.5 * f), cut: c.time }, { name: `cut-${k}-after`, at: Math.max(0, c.time - 0.5 * f), cut: c.time });
  });
  return list;
}

/** Extract one frame (spec: {at} seconds from the start, or {last: true}) to `out` as PNG, recorded on `rec`. */
export async function extractFrame(rec, src, spec, out, fps) {
  const cwd = path.dirname(out);
  const seek = spec.last ? ['-sseof', sec(-Math.max(1, 3 / (fps || 25)))] : spec.at > 0 ? ['-ss', sec(spec.at)] : [];
  // -update 1 writes the literal file name (no %d pattern); for the last frame it keeps overwriting until EOF.
  const tailArgs = spec.last ? ['-fps_mode', 'passthrough', '-update', '1'] : ['-frames:v', '1', '-update', '1'];
  return rec.ffmpeg((o) => [...encodeHead(), ...seek, '-i', ffPath(src, cwd), '-map', '0:v:0', ...tailArgs, o], { cwd, outputs: [out] });
}

/** sheet({file, frames=12, cols=4, out, threshold=0.3, cell=320, force}) */
export async function sheet({ file, frames = 12, cols = 4, out, threshold = 0.3, cell = 320, force = false } = {}) {
  if (!file || !out || out === true) throw new Error('usage: cstack video sheet <file> [--frames 12] [--cols 4] --out sheet.png');
  const n = int(frames, '--frames', 1, 100);
  const c = Math.min(int(cols, '--cols', 1, 100), n);
  const cw = int(cell, '--cell', 16, 1920);
  const th = numIn(threshold, '--threshold', 0.01, 0.99);
  if (path.extname(out).toLowerCase() !== '.png') throw new Error('--out must be a .png file');
  await requireTools(['ffmpeg', 'ffprobe'], `written a ${n}-frame contact sheet of ${file} to ${out}, plus first, last and cut-boundary frames in a sibling folder`);
  const src = path.resolve(file);
  const info = await probe(src);
  if (!info.video || info.image) throw new Error(`${file}: no video stream`);
  const D = videoDuration(info);
  if (!(D > 0)) throw new Error(`${file}: unknown duration`);
  const fps = info.video.fps;
  const det = await analyze(src, { info, threshold: th });
  const sheetPath = path.resolve(out);
  const dir = path.join(path.dirname(sheetPath), `${path.basename(sheetPath, path.extname(sheetPath))}.frames`);
  const specs = boundaryFrames(det.cuts, fps).map((s) => ({ ...s, path: path.join(dir, `${s.name}.png`) }));
  guardOutputs([sheetPath, ...specs.map((s) => s.path)], [src], { force });
  fs.mkdirSync(dir, { recursive: true });

  const input = { file: src, sha256: await hashFile(src), bytes: fs.statSync(src).size };
  const rows = Math.ceil(n / c);
  const times = Array.from({ length: n }, (_, i) => round((D * (i + 0.5)) / n, 4));
  const t0 = info.start_time ?? 0;
  const select = times.map((t) => `gte(t,${sec(t + t0)})*lt(prev_pts*TB,${sec(t + t0)})`).join('+');
  const cwd = path.dirname(sheetPath);
  const rec = new Recorder('video.sheet', { frames: n, cols: c, rows, cell: cw, threshold: th }, [input]);
  rec.note(det.step.cwd, det.step.args, det.step);
  await rec.ffmpeg((o) => [...encodeHead(), '-i', ffPath(src, cwd), '-map', '0:v:0', '-vf', `select='${select}',scale='min(${cw},iw)':-2,tile=${c}x${rows}:margin=4:padding=4:color=0x202020`, '-frames:v', '1', '-fps_mode', 'passthrough', '-update', '1', o], { cwd, outputs: [sheetPath] });
  await rec.write(sheetPath, { times, cols: c, rows, cuts: det.cuts, freezes: det.freezes, blacks: det.blacks, frames_dir: path.basename(dir) });

  await pool(specs, 4, async (s) => {
    const fr = new Recorder('video.sheet', { frame: s.name, ...(s.last ? { last: true } : { at: round(s.at, 4) }), ...(s.cut != null ? { cut: s.cut } : {}) }, [input]);
    await extractFrame(fr, src, s, s.path, fps);
    await fr.write(s.path, { frame: s.name, at: s.last ? 'last' : round(s.at, 4), cut: s.cut ?? null });
  });
  return { file: src, sheet: sheetPath, frames_dir: dir, frames: specs.map(({ name, path: p, at, last, cut }) => ({ name, path: p, at: last ? 'last' : round(at, 4), cut: cut ?? null })), times, cols: c, rows, duration: D, cuts: det.cuts, freezes: det.freezes, blacks: det.blacks };
}
