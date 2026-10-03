// cstack video probe: ffprobe summary of a media file, plus two container facts ffprobe does not report:
// faststart (moov before mdat) and an embedded C2PA manifest (which any ffmpeg re-encode drops).
import fs from 'node:fs';
import path from 'node:path';
import { ffprobe, ffPath, round } from './ffmpeg.mjs';

const num = (v) => (v == null || v === 'N/A' || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const ratio = (s) => {
  const m = String(s ?? '').match(/^(-?\d+(?:\.\d+)?)[/:](\d+(?:\.\d+)?)$/);
  return m && Number(m[2]) ? Number(m[1]) / Number(m[2]) : null;
};

/** Top-level ISO-BMFF boxes (type, offset, size; uuid usertype for 'uuid' boxes). [] when the file is not BMFF. */
export function topLevelBoxes(file, max = 256) {
  const fd = fs.openSync(file, 'r');
  const size = fs.fstatSync(fd).size;
  const h = Buffer.alloc(32);
  const out = [];
  try {
    for (let off = 0; off + 8 <= size && out.length < max; ) {
      const n = fs.readSync(fd, h, 0, 32, off);
      if (n < 32) h.fill(0, n);
      let len = h.readUInt32BE(0);
      const type = h.toString('latin1', 4, 8);
      let hdr = 8;
      if (len === 1) {
        len = Number(h.readBigUInt64BE(8));
        hdr = 16;
      } else if (len === 0) len = size - off;
      if (!/^[\x20-\x7e]{4}$/.test(type) || len < hdr) break;
      out.push({ type, offset: off, size: len, ...(type === 'uuid' ? { uuid: h.toString('hex', hdr, hdr + 16) } : {}) });
      off += len;
    }
  } finally {
    fs.closeSync(fd);
  }
  return out[0]?.type === 'ftyp' ? out : [];
}

// C2PA embeds its manifest store in BMFF as a 'uuid' box with this usertype (C2PA spec, BMFF embedding).
const C2PA_UUID = 'd8fec3d61b0e483c92975828877ec481';

export function containerFacts(file) {
  const boxes = topLevelBoxes(file);
  if (!boxes.length) return { bmff: false, faststart: null, c2pa: null };
  const moov = boxes.findIndex((b) => b.type === 'moov');
  const mdat = boxes.findIndex((b) => b.type === 'mdat');
  return { bmff: true, faststart: moov >= 0 && mdat >= 0 ? moov < mdat : null, c2pa: boxes.some((b) => b.type === 'uuid' && b.uuid === C2PA_UUID) };
}

function rotationOf(v) {
  const sd = (v?.side_data_list ?? []).find((d) => d.rotation != null);
  const r = sd ? Number(sd.rotation) : num(v?.tags?.rotate);
  return r == null ? 0 : ((r % 360) + 360) % 360;
}

/** Normalize ffprobe JSON (-show_format -show_streams) into the fields cstack checks. */
export function summarize(j, file = null) {
  const f = j.format ?? {};
  const streams = j.streams ?? [];
  const v = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const a = streams.find((s) => s.codec_type === 'audio');
  const image = /(_pipe|^image2)$/.test(f.format_name ?? '') || (v && !num(f.duration) && !num(v.duration) && ['png', 'mjpeg', 'webp', 'bmp', 'tiff'].includes(v.codec_name));
  let video = null;
  if (v) {
    const rotation = rotationOf(v);
    const swap = rotation % 180 === 90;
    const avg = ratio(v.avg_frame_rate);
    const r = ratio(v.r_frame_rate);
    const fps = avg || r || null;
    const sar = ratio(v.sample_aspect_ratio) || 1;
    video = {
      codec: v.codec_name ?? null,
      profile: v.profile ?? null,
      width: v.width,
      height: v.height,
      display_width: swap ? v.height : v.width,
      display_height: swap ? v.width : v.height,
      fps: fps && round(fps, 3),
      frame_rate: (avg ? v.avg_frame_rate : v.r_frame_rate) ?? null,
      vfr: !image && !!(avg && r && Math.abs(avg - r) / r > 0.01),
      pix_fmt: v.pix_fmt ?? null,
      sar: v.sample_aspect_ratio && v.sample_aspect_ratio !== '0:1' ? v.sample_aspect_ratio : '1:1',
      sar_value: round(sar, 4),
      dar: v.display_aspect_ratio && v.display_aspect_ratio !== '0:1' ? v.display_aspect_ratio : null,
      bit_rate: num(v.bit_rate),
      rotation,
      nb_frames: num(v.nb_frames),
      duration: num(v.duration),
      color_transfer: v.color_transfer ?? null,
      color_primaries: v.color_primaries ?? null,
      field_order: v.field_order ?? null,
    };
  }
  return {
    file,
    container: f.format_name ?? null,
    container_long: f.format_long_name ?? null,
    duration: image ? null : num(f.duration) ?? video?.duration ?? null,
    start_time: num(f.start_time) ?? 0,
    bit_rate: num(f.bit_rate),
    size_bytes: num(f.size),
    image: !!image,
    video,
    audio: a ? { codec: a.codec_name ?? null, sample_rate: num(a.sample_rate), channels: a.channels ?? null, channel_layout: a.channel_layout ?? null, bit_rate: num(a.bit_rate), duration: num(a.duration) } : null,
    streams: streams.length,
  };
}

/** probe(file) -> summary + container facts. Needs ffprobe (callers check with requireTools first). */
export async function probe(file) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new Error(`input not found: ${file}`);
  const cwd = path.dirname(abs);
  const r = await ffprobe(['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', ffPath(abs, cwd)], { cwd });
  return { ...summarize(JSON.parse(r.stdout), abs), ...containerFacts(abs) };
}

/** Duration of the video stream (falls back to the container). */
export const videoDuration = (p) => p.video?.duration ?? p.duration ?? null;

export function formatProbe(p) {
  const v = p.video;
  const a = p.audio;
  const kb = (b) => (b ? `${Math.round(b / 1000)} kb/s` : '-');
  return [
    `${p.file}`,
    `  container  ${p.container}${p.duration != null ? `  ${round(p.duration, 3)} s` : ''}  ${kb(p.bit_rate)}${p.bmff ? `  faststart ${p.faststart ? 'yes' : 'no'}` : ''}${p.c2pa ? '  C2PA manifest present' : ''}`,
    v
      ? `  video      ${v.codec}${v.profile ? ` (${v.profile})` : ''} ${v.width}x${v.height}${v.rotation ? ` rotation ${v.rotation}° (displays ${v.display_width}x${v.display_height})` : ''}  ${v.fps ?? '?'} fps${v.vfr ? ' (variable)' : ''}  ${v.pix_fmt}  SAR ${v.sar} DAR ${v.dar ?? '-'}  ${kb(v.bit_rate)}`
      : '  video      none',
    a ? `  audio      ${a.codec} ${a.sample_rate} Hz ${a.channels} ch${a.channel_layout ? ` (${a.channel_layout})` : ''}  ${kb(a.bit_rate)}` : '  audio      none',
  ].join('\n');
}
