// cstack video: deterministic video tools over ffmpeg/ffprobe. Wiring: `cstack video <sub> ...` -> runVideo(sub, args, ws).
// Returns the help string, or {ok, text, result}: print text; ok === false means exit 1 (qa FAIL, loudness out of
// tolerance, a deliverable off spec). A missing ffmpeg/ffprobe throws an Error whose message starts with "MISSING:".
import path from 'node:path';
import { requireTools, int } from './ffmpeg.mjs';
import { probe, formatProbe } from './probe.mjs';
import { analyze, formatAnalysis } from './detect.mjs';
import { sheet } from './frames.mjs';
import { normalize, assemble, reframe } from './edit.mjs';
import { captions, safezone } from './captions.mjs';
import { audio } from './audio.mjs';
import { qa, formatQA } from './qa.mjs';
import { deliver } from './deliver.mjs';

export const VIDEO_HELP = `cstack video <sub> (deterministic; needs ffmpeg + ffprobe, which cstack never installs; every output gets <file>.gen.json)
  probe <file> [--json]                          container, codecs, size, fps, pix_fmt, SAR/DAR, bitrate, audio, rotation
  normalize <in...> [--size 1080x1920] [--fps 30] [--fit pad|crop] [--keep-audio] --out <dir>
                                                 conform clips before any join: setsar=1, fixed fps, yuv420p, H.264
  cuts <file> [--threshold 0.3] [--json]         scene cuts, frozen (>= 0.5 s) and black (>= 0.1 s) segments
  sheet <file> [--frames 12] [--cols 4] --out sheet.png
                                                 contact sheet + first, last and cut-boundary frames in sheet.frames/
  assemble <edl.yaml> --out master.mp4 [--otio cut.otio.json] [--absolute-urls]
                                                 trims and planned xfades into a master, plus OpenTimelineIO (<edl>.otio.json)
  reframe <master> [--to 9:16,4:5,1:1,16:9] [--focus 0.5 | --edl edl.yaml] [--no-cropdetect] --out <dir>
                                                 1080x1920, 1080x1350, 1080x1080, 1920x1080; letterbox stripped first
  captions <video> --srt captions.srt [--zone universal|tiktok|reels|shorts] [--font Arial] [--font-size N] [--fonts-dir d] --out <file>
  safezone <video|png> [--zone universal|tiktok|reels|shorts] [--at seconds] --out overlay.png
  audio <video> [--bed music.wav] [--bed-gap 10] [--lufs -14] [--tp -1] --out <file>
                                                 two-pass loudnorm (linear), measured before and after
  qa <video> [--plan beats.yaml] [--product-ref still.png --roi x,y,w,h] [--zone reels] [--lufs -14] [--tp -1] [--out <dir>] [--json]
                                                 video.spec|freeze|black|cuts|roi|loudness|duration|safezone; exits 1 on FAIL
  deliver <master> [--channels meta,tiktok,youtube,reels] --out <dir>
                                                 per-channel H.264 + AAC 192k +faststart encodes and manifest.json
Encodes take --crf 18 and --preset medium. Outputs never replace an input; an existing output needs --force.
EDL and beat-plan formats: tests/fixtures/video/README.md. Binaries: $CSTACK_FFMPEG and $CSTACK_FFPROBE, else PATH.`;

const BOOL = ['json', 'force', 'keep-audio', 'no-cropdetect', 'absolute-urls'];
const PRESETS = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'];

/** argv array or parsed {_, flag} -> parsed args; a boolean flag that swallowed a positional gives it back. */
export function normArgs(args, sub) {
  let a;
  if (Array.isArray(args)) {
    a = { _: [] };
    for (let i = 0; i < args.length; i++) {
      const t = args[i];
      if (!t.startsWith('--')) a._.push(t);
      else if (t.includes('=')) a[t.slice(2, t.indexOf('='))] = t.slice(t.indexOf('=') + 1);
      else if (!BOOL.includes(t.slice(2)) && args[i + 1] !== undefined && !args[i + 1].startsWith('--')) a[t.slice(2)] = args[++i];
      else a[t.slice(2)] = true;
    }
  } else a = { ...(args ?? {}), _: [...(args?._ ?? [])] };
  for (const k of BOOL) {
    if (typeof a[k] !== 'string') continue;
    if (['true', 'false'].includes(a[k])) a[k] = a[k] === 'true';
    else {
      a._.push(a[k]);
      a[k] = true;
    }
  }
  if (sub && a._[0] === sub) a._.shift();
  return a;
}

const here = (p) => (p ? path.relative(process.cwd(), p) || p : p);
const done = (a, result, text, ok = true) => ({ ok, text: a.json ? JSON.stringify(result, null, 2) : text, result });
const warnLines = (ws = []) => ws.map((w) => `  warning: ${w}`);
const s2 = (v) => (v == null ? '?' : Number(v).toFixed(2));

/**
 * Entry point for `cstack video <sub>`.
 * @param {string} sub  probe|normalize|cuts|sheet|assemble|reframe|captions|safezone|audio|qa|deliver|help
 * @param {object|string[]} args parsed args ({_: [...], flag: value}) or a raw argv array
 * @param {string} ws  workspace root (paths resolve against the current directory, like other file commands)
 */
export async function runVideo(sub, args = {}, ws = process.cwd()) {
  void ws;
  const a = normArgs(args, sub);
  const enc = { force: !!a.force, crf: a.crf != null ? int(a.crf, '--crf', 0, 51) : 18, preset: a.preset ?? 'medium' };
  if (!PRESETS.includes(enc.preset)) throw new Error(`--preset must be one of ${PRESETS.join(', ')}`);
  const out = a.out === true ? undefined : a.out;
  switch (sub) {
    case 'probe': {
      if (!a._[0]) throw new Error('usage: cstack video probe <file> [--json]');
      await requireTools(['ffprobe'], `read the container, codec and stream spec of ${a._[0]}`);
      const p = await probe(a._[0]);
      return done(a, p, formatProbe(p));
    }
    case 'normalize': {
      const r = await normalize({ inputs: a._, size: a.size ?? '1080x1920', fps: a.fps ?? 30, fit: a.fit ?? 'pad', keepAudio: !!a['keep-audio'], out, ...enc });
      const lines = [`wrote ${r.files.length} clip(s) to ${here(r.out)} (${r.size.width}x${r.size.height} at ${r.fps} fps, fit ${r.fit}, H.264 yuv420p, ${a['keep-audio'] ? 'audio AAC' : 'no audio'})`];
      for (const f of r.files) lines.push(`  ${here(f.out)}  ${f.width}x${f.height}  ${s2(f.duration)} s`, ...warnLines(f.warnings));
      return done(a, r, lines.join('\n'));
    }
    case 'cuts': {
      if (!a._[0]) throw new Error('usage: cstack video cuts <file> [--threshold 0.3] [--json]');
      await requireTools(['ffmpeg', 'ffprobe'], `listed scene cuts, frozen and black segments in ${a._[0]}`);
      const info = await probe(a._[0]);
      if (!info.video || info.image) throw new Error(`${a._[0]}: no video stream`);
      const { step, ...r } = await analyze(a._[0], { info, threshold: a.threshold != null ? Number(a.threshold) : 0.3 });
      return done(a, r, formatAnalysis(r));
    }
    case 'sheet': {
      const r = await sheet({ file: a._[0], frames: a.frames ?? 12, cols: a.cols ?? 4, cell: a.cell ?? 320, threshold: a.threshold ?? 0.3, out, force: enc.force });
      const cuts = r.cuts.length;
      return done(a, r, [`wrote ${here(r.sheet)} (${r.times.length} frames, ${r.cols}x${r.rows})`, `  ${r.frames.length} frames in ${here(r.frames_dir)}/: first, last${cuts ? `, before and after ${cuts} cut(s)` : ''}`].join('\n'));
    }
    case 'assemble': {
      const r = await assemble({ edl: a._[0], out, otio: a.otio, absoluteUrls: !!a['absolute-urls'], ...enc });
      return done(a, r, [`wrote ${here(r.master)} (${r.width}x${r.height} at ${r.fps} fps, ${r.frames} frames = ${s2(r.duration)} s, ${r.clips} clip(s), ${r.transitions} transition(s)${r.audio ? ', audio' : ', silent'})`, `  ${here(r.otio)} (OpenTimelineIO, opens in an editor)`, ...warnLines(r.warnings)].join('\n'));
    }
    case 'reframe': {
      const r = await reframe({ file: a._[0], to: a.to, focus: a.focus, edl: a.edl, out, cropdetect: !a['no-cropdetect'], ...enc });
      const lines = [`reframed ${here(r.file)} (focus from ${r.focus.source}${r.letterbox ? `; letterbox removed, content ${r.region.w}x${r.region.h} at ${r.region.x},${r.region.y}` : ''})`];
      for (const f of r.files) lines.push(`  ${here(f.out)}  ${f.width}x${f.height}  crop ${f.crop.w}x${f.crop.h}${f.crop.upscale > 1.01 ? `  upscaled ${f.crop.upscale}x` : ''}`, ...warnLines(f.warnings));
      return done(a, r, lines.join('\n'));
    }
    case 'captions': {
      const r = await captions({ file: a._[0], srt: a.srt, zone: a.zone ?? 'universal', font: a.font ?? 'Arial', fontSize: a['font-size'], fontsDir: a['fonts-dir'], out, ...enc });
      const z = r.zone_px;
      return done(a, r, [`wrote ${here(r.out)} (${r.cues} caption(s), ${r.zone} zone x ${z.x0}-${z.x1}, y ${z.y0}-${z.y1} on ${r.width}x${r.height}: MarginL ${r.margins.MarginL}, MarginR ${r.margins.MarginR}, MarginV ${r.margins.MarginV}; font size ${r.font_size}${r.fonts.length ? `; ${r.fonts.join(', ')}` : ''})`, `  ${here(r.ass)} (the styled captions that were burned)`, ...warnLines(r.warnings)].join('\n'));
    }
    case 'safezone': {
      const r = await safezone({ file: a._[0], zone: a.zone ?? 'universal', at: a.at, out, force: enc.force });
      const z = r.zone_px;
      return done(a, r, [`wrote ${here(r.out)} (${r.zone} zone x ${z.x0}-${z.x1}, y ${z.y0}-${z.y1} on ${r.width}x${r.height}${r.at != null ? `, frame at ${r.at} s` : ''}; ${r.legend})`, ...warnLines(r.warnings)].join('\n'));
    }
    case 'audio': {
      const r = await audio({ file: a._[0], bed: a.bed, lufs: a.lufs ?? -14, tp: a.tp ?? -1, lra: a.lra ?? 11, bedGap: a['bed-gap'] ?? 10, out, force: enc.force });
      const lu = (m) => (m ? `${m.integrated_lufs} LUFS / ${m.true_peak_dbtp} dBTP` : '-');
      const lines = [`wrote ${here(r.out)}: ${r.input ? `input ${lu(r.input)}` : 'no original audio'}${r.bed ? `; bed ${lu(r.bed)}${r.bed.gain_db != null ? ` (gain ${r.bed.gain_db} dB)` : ''}` : ''} -> output ${lu(r.output)} (target ${r.target.integrated_lufs} LUFS / ${r.target.true_peak_dbtp} dBTP, ${r.normalization_type})`];
      lines.push(...warnLines(r.warnings), `video audio: ${r.ok ? 'PASS' : 'FAIL'} (output ${r.ok ? 'within' : 'outside'} ±1 LU of the target with true peak <= ${r.target.true_peak_dbtp} dBTP)`);
      return done(a, r, lines.join('\n'), r.ok);
    }
    case 'qa': {
      const r = await qa({ file: a._[0], plan: a.plan, productRef: a['product-ref'], roi: a.roi, zone: a.zone, lufs: a.lufs, tp: a.tp ?? -1, out, force: enc.force, roiWarn: a['roi-warn'] ?? 0.85, roiFail: a['roi-fail'] ?? 0.7, threshold: a.threshold ?? 0.3, cutTolerance: a['cut-tolerance'] ?? 0.5 });
      return done(a, r, formatQA(r), r.ok);
    }
    case 'deliver': {
      const r = await deliver({ file: a._[0], channels: a.channels ?? 'meta,tiktok,youtube,reels', out, focus: a.focus, edl: a.edl, cropdetect: !a['no-cropdetect'], ...enc });
      const lines = r.files.map((f) => `  ${f.channel.padEnd(8)} ${here(path.join(r.out, f.path))}  ${f.width}x${f.height} ${f.fps} fps ${f.video_codec}/${f.audio_codec ?? 'no audio'}  sha256:${f.sha256.slice(0, 12)}${f.issues.length ? `  ISSUES: ${f.issues.join('; ')}` : ''}`);
      return done(a, r, [`delivered ${r.files.length} file(s); manifest ${here(r.manifest)}`, ...lines, ...warnLines(r.warnings)].join('\n'), r.ok);
    }
    case undefined:
    case 'help':
      return VIDEO_HELP;
    default:
      throw new Error(`unknown video subcommand "${sub}"\n${VIDEO_HELP}`);
  }
}
