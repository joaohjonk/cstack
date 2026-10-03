// cstack video captions | safezone: burn SRT captions with libass inside a platform safe zone, and draw a zone over a
// frame for human review. Captions are converted to ASS with PlayResX/PlayResY = the frame size, so every margin
// below is in output pixels.
import fs from 'node:fs';
import path from 'node:path';
import { readText, writeAtomic } from '../core.mjs';
import { requireTools, guardOutputs, Recorder, ffPath, encodeHead, containerFlags, x264, escapeFilterValue, round, hashFile, int, numIn, sec } from './ffmpeg.mjs';
import { probe, videoDuration } from './probe.mjs';

// Safe zones on a 1080x1920 (9:16) frame, from docs/research/ai-video.md §4.3, sourced there to krea-ai/skills
// ([O], an operator convention, snapshot 2026-10-03): universal x 60–960, y 210–1480; TikTok y 150–1480;
// Reels x 44–996, y 210–1610; Shorts x 60–984, y 170–1530. The doc gives no x range for TikTok: x 60–960 is inferred
// (universal is the intersection of the three, and only TikTok can set its right edge at 960).
// Meta's own 2026 guidance (same section, [3P] billo.app) is looser: top 14%, bottom 20–35%, sides 6%.
// Other frame sizes scale x by W/1080 and y by H/1920: exact for 9:16, an approximation for 4:5, 1:1 and 16:9.
export const ZONES = {
  universal: { x: [60, 960], y: [210, 1480] },
  tiktok: { x: [60, 960], y: [150, 1480], x_inferred: true },
  reels: { x: [44, 996], y: [210, 1610] },
  shorts: { x: [60, 984], y: [170, 1530] },
};

export function zoneRect(zone, W, H) {
  const z = ZONES[zone];
  if (!z) throw new Error(`unknown --zone "${zone}" (known: ${Object.keys(ZONES).join(', ')})`);
  const sx = W / 1080;
  const sy = H / 1920;
  return { x0: Math.round(z.x[0] * sx), x1: Math.round(z.x[1] * sx), y0: Math.round(z.y[0] * sy), y1: Math.round(z.y[1] * sy) };
}

/** ASS margins for bottom-centred captions that stay inside the zone; outline and shadow are added so the stroke stays in too. */
export function zoneMargins(zone, W, H, { outline = 0, shadow = 0 } = {}) {
  const r = zoneRect(zone, W, H);
  const pad = Math.ceil(outline + shadow);
  return { MarginL: r.x0 + pad, MarginR: W - r.x1 + pad, MarginV: H - r.y1 + pad, rect: r };
}

/** SRT -> [{start, end, text}] (seconds). Accepts a BOM, CRLF, a missing index line and "." millisecond separators. */
export function parseSRT(text) {
  const cues = [];
  for (const block of text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
    const lines = block.split('\n');
    const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti < 0) continue;
    const m = lines[ti].match(/(\d+):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/);
    if (!m) throw new Error(`bad SRT timing line: "${lines[ti].trim()}"`);
    const t = (h, mi, s, ms) => Number(h) * 3600 + Number(mi) * 60 + Number(s) + Number(ms.padEnd(3, '0')) / 1000;
    const start = t(m[1], m[2], m[3], m[4]);
    const end = t(m[5], m[6], m[7], m[8]);
    if (!(end > start)) throw new Error(`SRT cue ends before it starts: "${lines[ti].trim()}"`);
    const body = lines.slice(ti + 1).join('\n').trim();
    if (body) cues.push({ start, end, text: body });
  }
  return cues;
}

const assTime = (t) => {
  const cs = Math.max(0, Math.round(t * 100));
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};

/** SRT text -> ASS text: <i>/<b>/<u> become override tags, other tags drop, ASS control characters are neutralised. */
export function assText(s) {
  let changed = false;
  const t = s
    .replace(/[{}\\]/g, (c) => {
      changed = true;
      return { '{': '(', '}': ')', '\\': '/' }[c];
    })
    .replace(/<(\/?)([ibu])>/gi, (_, close, tag) => `{\\${tag.toLowerCase()}${close ? 0 : 1}}`)
    .replace(/<[^>]+>/g, '')
    .replace(/\n/g, '\\N');
  return { text: t, changed };
}

export function toASS(cues, { W, H, margins, font = 'Arial', size, outline, zone }) {
  const r = margins.rect;
  const fontName = String(font).replace(/[,\n]/g, ' ');
  let changed = false;
  const events = cues.map((c) => {
    const a = assText(c.text);
    changed ||= a.changed;
    return `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${a.text}`;
  });
  const text = [
    '[Script Info]',
    `; cstack video captions: ${zone} safe zone x ${r.x0}-${r.x1}, y ${r.y0}-${r.y1} on ${W}x${H}`,
    'ScriptType: v4.00+',
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${fontName},${size},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,${outline},0,2,${margins.MarginL},${margins.MarginR},${margins.MarginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events,
    '',
  ].join('\n');
  return { text, changed };
}

const stem = (p) => path.basename(p, path.extname(p));

/** captions({file, srt, zone='universal', out, font='Arial', fontSize?, fontsDir?, force, crf, preset}) */
export async function captions({ file, srt, zone = 'universal', out, font = 'Arial', fontSize, fontsDir, force = false, crf = 18, preset = 'medium' } = {}) {
  if (!file || !srt || srt === true || !out || out === true) throw new Error('usage: cstack video captions <video> --srt captions.srt [--zone universal|tiktok|reels|shorts] --out <file>');
  zoneRect(zone, 1080, 1920);
  await requireTools(['ffmpeg', 'ffprobe'], `burned the captions in ${srt} into ${file} inside the ${zone} safe zone (libass), writing ${out}`);
  const src = path.resolve(file);
  const srtAbs = path.resolve(srt);
  const outAbs = path.resolve(out);
  if (!fs.existsSync(srtAbs)) throw new Error(`captions file not found: ${srt}`);
  if (!/\.srt$/i.test(srtAbs)) throw new Error('--srt takes a SubRip (.srt) file');
  if (!fs.existsSync(src)) throw new Error(`input not found: ${file}`);
  const info = await probe(src);
  if (!info.video || info.image) throw new Error(`${file}: no video stream`);
  const W = info.video.display_width;
  const H = info.video.display_height;
  const cues = parseSRT(readText(srtAbs));
  if (!cues.length) throw new Error(`${srt}: no captions found`);
  const size = fontSize != null && fontSize !== true ? int(fontSize, '--font-size', 6, 400) : Math.max(8, Math.round((64 * H) / 1920));
  const outline = Math.max(1, Math.round((3 * H) / 1920));
  const margins = zoneMargins(zone, W, H, { outline });
  const ass = toASS(cues, { W, H, margins, font, size, outline, zone });
  const assPath = path.join(path.dirname(outAbs), `${stem(outAbs)}.captions.ass`);
  guardOutputs([outAbs, assPath], [src, srtAbs], { force });
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  writeAtomic(assPath, ass.text);

  const rec = new Recorder('video.captions', { zone, zone_px: margins.rect, margins: { MarginL: margins.MarginL, MarginR: margins.MarginR, MarginV: margins.MarginV }, font, font_size: size, outline, crf: Number(crf), preset: String(preset) });
  await rec.addInput(src, 'video');
  await rec.addInput(srtAbs, 'srt');
  if (Math.abs(W / H - 9 / 16) > 0.01) rec.warnings.push(`frame is ${W}x${H}, not 9:16: zones are defined for full-screen 9:16 and were scaled proportionally (approximate)`);
  if (ZONES[zone].x_inferred) rec.warnings.push('TikTok x range 60–960 is inferred, not documented');
  const D = videoDuration(info);
  const late = cues.filter((c) => D != null && c.start >= D).length;
  if (late) rec.warnings.push(`${late} caption(s) start after the video ends (${round(D)} s) and will not show`);
  if (ass.changed) rec.warnings.push('captions contained { } or \\ (ASS control characters); they were replaced with ( ) and /');
  const cwd = path.dirname(outAbs);
  const vf = `subtitles=filename=${escapeFilterValue(ffPath(assPath, cwd))}${fontsDir && fontsDir !== true ? `:fontsdir=${escapeFilterValue(ffPath(fontsDir, cwd))}` : ''}`;
  const r = await rec.ffmpeg((o) => [...encodeHead('info'), '-i', ffPath(src, cwd), '-map', '0:v:0', '-map', '0:a:0?', '-vf', vf, ...x264({ crf, preset }), '-c:a', 'copy', ...containerFlags(o), o], { cwd, outputs: [outAbs] });
  const fonts = [...new Set([...r.stderr.matchAll(/fontselect: \(([^,]+), \d+, \d+\) -> (?:.*[/\\])?([^/\\,]+), \d+, (\S+)/g)].map((m) => `${m[1]} -> ${m[3]} (${m[2]})`))];
  if (/failed to find any fallback|no usable fontconfig/i.test(r.stderr)) rec.warnings.push('libass found no usable font: captions may be missing; pass --font with an installed family or --fonts-dir');
  const result = { width: W, height: H, zone, zone_px: margins.rect, margins: { MarginL: margins.MarginL, MarginR: margins.MarginR, MarginV: margins.MarginV }, font_size: size, outline, cues: cues.length, fonts, ass: path.basename(assPath) };
  await rec.write(outAbs, result, [assPath]);
  return { out: outAbs, ass: assPath, ...result, warnings: rec.warnings };
}

/** safezone({file, zone='universal', out (png), at?, force}): darken outside the zone, outline the zone, on one frame. */
export async function safezone({ file, zone = 'universal', out, at, force = false } = {}) {
  if (!file || !out || out === true) throw new Error('usage: cstack video safezone <video|png> [--zone universal|tiktok|reels|shorts] [--at seconds] --out overlay.png');
  zoneRect(zone, 1080, 1920);
  if (path.extname(out).toLowerCase() !== '.png') throw new Error('--out must be a .png file');
  await requireTools(['ffmpeg', 'ffprobe'], `drawn the ${zone} safe zone over a frame of ${file} into ${out}`);
  const src = path.resolve(file);
  if (!fs.existsSync(src)) throw new Error(`input not found: ${file}`);
  const info = await probe(src);
  if (!info.video) throw new Error(`${file}: no image or video stream`);
  const outAbs = path.resolve(out);
  guardOutputs([outAbs], [src], { force });
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  const W = info.video.display_width;
  const H = info.video.display_height;
  const r = zoneRect(zone, W, H);
  const D = videoDuration(info);
  const t = info.image ? null : at != null && at !== true ? numIn(at, '--at', 0, D ?? 1e9) : (D ?? 0) / 2;
  const dim = 'black@0.55';
  const lw = Math.max(2, Math.round(W / 360));
  // drawbox treats w=0 or h=0 as "the whole frame", so empty bands are skipped
  const boxes = [
    [0, 0, W, r.y0],
    [0, r.y1, W, H - r.y1],
    [0, r.y0, r.x0, r.y1 - r.y0],
    [r.x1, r.y0, W - r.x1, r.y1 - r.y0],
  ]
    .filter(([, , w, h]) => w > 0 && h > 0)
    .map(([x, y, w, h]) => `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${dim}:t=fill`);
  boxes.push(`drawbox=x=${r.x0}:y=${r.y0}:w=${r.x1 - r.x0}:h=${r.y1 - r.y0}:color=0x00FF66@0.9:t=${lw}`);
  const rec = new Recorder('video.safezone', { zone, zone_px: r, at: t == null ? null : round(t, 4) });
  await rec.addInput(src);
  if (Math.abs(W / H - 9 / 16) > 0.01) rec.warnings.push(`frame is ${W}x${H}, not 9:16: the zone was scaled proportionally (approximate)`);
  const cwd = path.dirname(outAbs);
  const input = info.image ? ['-f', 'image2', '-pattern_type', 'none', '-i', ffPath(src, cwd)] : [...(t > 0 ? ['-ss', sec(t)] : []), '-i', ffPath(src, cwd)];
  await rec.ffmpeg((o) => [...encodeHead(), ...input, '-map', '0:v:0', '-vf', boxes.join(','), '-frames:v', '1', '-update', '1', o], { cwd, outputs: [outAbs] });
  const result = { width: W, height: H, zone, zone_px: r, at: t == null ? null : round(t, 4), legend: 'darkened = outside the zone; green outline = zone edge' };
  await rec.write(outAbs, result);
  return { out: outAbs, ...result, warnings: rec.warnings, sha256: await hashFile(outAbs) };
}
