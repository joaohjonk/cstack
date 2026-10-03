// cstack video against a real ffmpeg: tiny lavfi clips generated per run in a temp folder (nothing binary is committed).
// Skips with a reason when ffmpeg, ffprobe or libx264 is unavailable; video-formats.test.mjs covers what needs no ffmpeg.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { binPath, toolInfo } from '../scripts/lib/video/ffmpeg.mjs';
import { runVideo } from '../scripts/lib/video/cli.mjs';
import { decodePNG, encodePNG } from '../scripts/lib/image/png.mjs';
import { tmpDir } from './tmp.mjs';

const exec = promisify(execFile);
const ffmpeg = (args, cwd) => exec(binPath('ffmpeg'), ['-hide_banner', '-nostdin', '-loglevel', 'error', ...args], { cwd, maxBuffer: 64 * 1024 * 1024 });
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const finding = (r, id) => r.result.findings.find((f) => f.id === id);

async function why() {
  if (!(await toolInfo('ffmpeg'))) return `ffmpeg not available ("${binPath('ffmpeg')}"; install it or set CSTACK_FFMPEG)`;
  if (!(await toolInfo('ffprobe'))) return `ffprobe not available ("${binPath('ffprobe')}")`;
  const { stdout } = await exec(binPath('ffmpeg'), ['-hide_banner', '-encoders']);
  return /\blibx264\b/.test(stdout) ? null : 'this ffmpeg build has no libx264 encoder';
}
const SKIP = await why();
const ON = { skip: SKIP ?? false, timeout: 120000 };
const LIBASS = SKIP ? false : /\bsubtitles\b/.test((await exec(binPath('ffmpeg'), ['-hide_banner', '-filters'])).stdout);

const X264 = ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'];
const testsrc = (size, d) => ['-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=30:duration=${d}`];

async function makeFixtures() {
  const d = tmpDir('cstack-video-');
  // a high-contrast checker "label" for the ROI gate: SSIM reacts to it going soft or changing
  const label = new Uint8ClampedArray(60 * 60 * 4);
  for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) label.fill((Math.floor(x / 6) + Math.floor(y / 6)) % 2 ? 235 : 20, (y * 60 + x) * 4, (y * 60 + x) * 4 + 3);
  for (let i = 3; i < label.length; i += 4) label[i] = 255;
  fs.writeFileSync(path.join(d, 'label.png'), encodePNG({ width: 60, height: 60, data: label }));
  fs.writeFileSync(path.join(d, 'white.png'), encodePNG({ width: 180, height: 320, data: new Uint8ClampedArray(180 * 320 * 4).fill(255) }));
  await Promise.all([
    ffmpeg([...testsrc('320x180', 2), '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2', ...X264, '-c:a', 'aac', 'src.mp4'], d),
    // hard cut at 1.5 s into colour bars with a moving box (moving, so the second shot is not a freeze)
    ffmpeg([...testsrc('320x180', 1.5), '-f', 'lavfi', '-i', 'smptebars=size=320x180:rate=30:duration=1.5', '-f', 'lavfi', '-i', 'color=c=white:size=20x20:rate=30', '-filter_complex', "[1:v][2:v]overlay=x='mod(t*200,300)':y=80:shortest=1[b];[0:v][b]concat=n=2:v=1:a=0[v]", '-map', '[v]', ...X264, 'cut.mp4'], d),
    // a 1.5 s frozen tail, lossless so the clones stay bit-identical (lossy frames settle over a few frames)
    ffmpeg([...testsrc('320x180', 1.5), '-vf', 'tpad=stop_mode=clone:stop_duration=1.5', ...X264, '-qp', '0', 'frozen.mp4'], d),
    ffmpeg([...testsrc('320x136', 2), '-vf', 'pad=320:180:0:22:color=black', ...X264, 'lbox.mp4'], d),
    ffmpeg([...testsrc('180x320', 2), '-i', 'label.png', '-filter_complex', '[0:v][1:v]overlay=60:130', ...X264, 'clean.mp4'], d),
    ffmpeg([...testsrc('180x320', 2), '-i', 'label.png', '-filter_complex', "[1:v]split[l][m];[m]boxblur=4[soft];[0:v][l]overlay=60:130[v];[v][soft]overlay=60:130:enable='gte(t,1.5)'", ...X264, 'bad.mp4'], d),
    ffmpeg([...testsrc('180x320', 2), '-i', 'label.png', '-filter_complex', '[0:v][1:v]overlay=60:130', '-frames:v', '1', '-update', '1', 'ref.png'], d),
    ffmpeg(['-f', 'lavfi', '-i', 'color=c=gray:size=64x64:rate=30:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2', '-af', 'volume=0.1', ...X264, '-c:a', 'aac', 'quiet.mp4'], d),
    ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=1', 'bed.wav'], d),
    ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x336699:size=180x320:rate=30:duration=2', ...X264, 'plain.mp4'], d),
  ]);
  return { d, p: (...n) => path.join(d, ...n) };
}
let fixtures;
const fx = () => (fixtures ??= makeFixtures());
after(async () => {
  if (fixtures) fs.rmSync((await fixtures).d, { recursive: true, force: true });
});

/** One frame of a video as RGBA pixels (via a temp PNG). */
async function frameAt(file, t, dir) {
  const out = path.join(dir, `.frame-${crypto.randomBytes(4).toString('hex')}.png`);
  await ffmpeg(['-ss', String(t), '-i', file, '-frames:v', '1', '-update', '1', out], dir);
  const img = decodePNG(fs.readFileSync(out));
  fs.rmSync(out);
  return img;
}
const px = (img, x, y) => Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 3));

test('probe: container, codec, size, rate, pixel format, audio, faststart', ON, async () => {
  const f = await fx();
  const r = await runVideo('probe', [f.p('src.mp4'), '--json']);
  const p = r.result;
  assert.deepEqual(JSON.parse(r.text).video, p.video);
  assert.deepEqual([p.video.codec, p.video.width, p.video.height, p.video.fps, p.video.pix_fmt, p.video.sar, p.video.rotation, p.video.vfr], ['h264', 320, 180, 30, 'yuv420p', '1:1', 0, false]);
  assert.deepEqual([p.audio.codec, p.audio.sample_rate], ['aac', 48000]);
  assert.ok(Math.abs(p.duration - 2) < 0.1, `duration ${p.duration}`);
  assert.deepEqual([p.bmff, p.faststart, p.c2pa], [true, false, false]);
  assert.match((await runVideo('probe', [f.p('src.mp4')])).text, /video {6}h264 .*320x180 {2}30 fps {2}yuv420p/);
});

test('normalize: size, rate, silence for clips without audio, sidecar replay, refusal and --force', ON, async () => {
  const f = await fx();
  const out = f.p('norm');
  const r = await runVideo('normalize', [f.p('src.mp4'), f.p('lbox.mp4'), '--size', '180x320', '--fps', '25', '--keep-audio', '--preset', 'ultrafast', '--out', out]);
  assert.deepEqual(r.result.files.map((x) => [path.basename(x.out), x.width, x.height, x.fps, x.audio]), [
    ['src.norm.mp4', 180, 320, 25, true],
    ['lbox.norm.mp4', 180, 320, 25, true],
  ]);
  assert.match(r.result.files[1].warnings.join('\n'), /no audio stream; wrote silence/);
  const o = f.p('norm', 'src.norm.mp4');
  const pr = (await runVideo('probe', [o])).result;
  assert.deepEqual([pr.faststart, pr.video.sar, pr.audio.sample_rate], [true, '1:1', 48000]);

  const side = readJSON(`${o}.gen.json`);
  assert.deepEqual([side.provider, side.model, side.operation, side.cost], ['local', 'ffmpeg', 'video.normalize', null]);
  assert.deepEqual(side.inputs.map((i) => [i.path, i.sha256]), [['../src.mp4', sha(f.p('src.mp4'))]]);
  assert.deepEqual(side.input_hashes, [sha(f.p('src.mp4'))]);
  assert.equal(side.output.sha256, sha(o));
  assert.equal(typeof side.ffmpeg.version, 'string');
  assert.match(side.recipe_hash, /^[0-9a-f]{16,}$/);
  const step = side.steps.at(-1);
  assert.ok(step.args.every((a) => typeof a === 'string') && step.args.includes('-vf') && step.args.at(-1) === './src.norm.mp4');
  assert.equal(typeof step.elapsed_ms, 'number');

  // the recorded argument list replays from the sidecar's folder to the same bytes
  fs.renameSync(o, `${o}.orig`);
  await exec(binPath('ffmpeg'), step.args, { cwd: path.resolve(out, step.cwd) });
  assert.equal(sha(o), side.output.sha256);
  fs.rmSync(`${o}.orig`);

  // same inputs and flags elsewhere: same bytes, same recipe hash
  const again = await runVideo('normalize', [f.p('src.mp4'), '--size', '180x320', '--fps', '25', '--keep-audio', '--preset', 'ultrafast', '--out', f.p('norm2')]);
  assert.equal(sha(again.result.files[0].out), side.output.sha256);
  assert.equal(readJSON(`${again.result.files[0].out}.gen.json`).recipe_hash, side.recipe_hash);

  const before = sha(o);
  await assert.rejects(runVideo('normalize', [f.p('src.mp4'), '--size', '180x320', '--preset', 'ultrafast', '--out', out]), /output exists: .*src\.norm\.mp4 \(pass --force/);
  assert.equal(sha(o), before);
  const forced = await runVideo('normalize', [f.p('src.mp4'), '--size', '180x320', '--fps', '30', '--preset', 'ultrafast', '--out', out, '--force']);
  assert.deepEqual([forced.result.files[0].fps, forced.result.files[0].audio], [30, false]);
  assert.deepEqual(fs.readdirSync(out).filter((n) => n.includes('.tmp-')), []);
});

test('cuts: a hard cut at the 1.5 s boundary; a 1.5 s frozen tail is flagged', ON, async () => {
  const f = await fx();
  const c = (await runVideo('cuts', [f.p('cut.mp4'), '--json'])).result;
  assert.equal(c.cuts.length, 1, JSON.stringify(c.cuts));
  assert.ok(Math.abs(c.cuts[0].time - 1.5) <= 1.5 / 30, `cut at ${c.cuts[0].time}`);
  assert.deepEqual([c.freezes, c.blacks], [[], []]);
  const z = await runVideo('cuts', [f.p('frozen.mp4')]);
  const tail = z.result.freezes.find((s) => s.tail);
  assert.ok(tail && Math.abs(tail.duration - 1.5) <= 2 / 30 && tail.end === 3, JSON.stringify(z.result.freezes));
  assert.equal(z.result.cuts.length, 0);
  assert.match(z.text, /frozen: .* TAIL/);
});

test('sheet: tiled contact sheet plus first, last and both sides of the cut', ON, async () => {
  const f = await fx();
  const out = f.p('sheet', 'cut.png');
  const r = await runVideo('sheet', [f.p('cut.mp4'), '--frames', '6', '--cols', '3', '--out', out]);
  const img = decodePNG(fs.readFileSync(out));
  // tile: 4 px margin around, 4 px padding between cells of 320x180
  assert.deepEqual([img.width, img.height], [2 * 4 + 3 * 320 + 2 * 4, 2 * 4 + 2 * 180 + 4]);
  assert.deepEqual(r.result.times, [0.25, 0.75, 1.25, 1.75, 2.25, 2.75]);
  const names = r.result.frames.map((x) => x.name);
  assert.deepEqual(names, ['first', 'last', 'cut-01-before', 'cut-01-after']);
  const frames = Object.fromEntries(names.map((n) => [n, decodePNG(fs.readFileSync(f.p('sheet', 'cut.frames', `${n}.png`)))]));
  for (const n of names) {
    assert.deepEqual([frames[n].width, frames[n].height], [320, 180]);
    assert.equal(readJSON(f.p('sheet', 'cut.frames', `${n}.png.gen.json`)).operation, 'video.sheet');
  }
  // the two boundary frames sit on opposite sides of the scene change
  const diff = (a, b) => a.data.reduce((s, v, i) => s + Math.abs(v - b.data[i]), 0) / a.data.length;
  assert.ok(diff(frames['cut-01-before'], frames['cut-01-after']) > 25);
  assert.ok(diff(frames['cut-01-after'], frames.last) < 5, 'after the cut is the bars scene');
});

test('assemble: frame-exact master with a planned xfade, OpenTimelineIO with the right clips, sidecar', ON, async () => {
  const f = await fx();
  const edl = f.p('edl.yaml');
  fs.writeFileSync(edl, ['version: 1', 'name: test-cut', 'output: {size: 180x320, fps: 30, fit: crop}', 'clips:', '  - {src: src.mp4, out: 1.0, focus_x: 0.3, name: open}', '  - {src: cut.mp4, in: 1.0, out: 2.0, transition: {type: fade, duration: 0.4}}', '  - {src: src.mp4, in: 1.0}', ''].join('\n'));
  const master = f.p('cut', 'master.mp4');
  const r = await runVideo('assemble', [edl, '--out', master, '--preset', 'ultrafast']);
  assert.deepEqual([r.result.frames, r.result.clips, r.result.transitions], [30 + 30 + 30 - 12, 3, 1]);
  const p = (await runVideo('probe', [master])).result;
  assert.deepEqual([p.video.width, p.video.height, p.video.fps, p.faststart, p.audio], [180, 320, 30, true, null]);
  assert.ok(Math.abs(p.video.duration - 78 / 30) <= 1.5 / 30, `duration ${p.video.duration}`);

  const otioPath = f.p('cut', 'edl.otio.json');
  const otio = readJSON(otioPath);
  assert.equal(otio.OTIO_SCHEMA, 'Timeline.1');
  assert.equal(otio.name, 'test-cut');
  const kids = otio.tracks.children[0].children;
  const clips = kids.filter((c) => c.OTIO_SCHEMA === 'Clip.1');
  assert.deepEqual(kids.map((c) => c.OTIO_SCHEMA), ['Clip.1', 'Transition.1', 'Clip.1', 'Clip.1']);
  assert.equal(clips.reduce((s, c) => s + c.source_range.duration.value, 0), 78);
  assert.deepEqual(clips.map((c) => c.name), ['open', 'cut', 'src']);
  for (const c of clips) {
    assert.ok(fs.existsSync(path.resolve(path.dirname(otioPath), c.media_reference.target_url)), c.media_reference.target_url);
    assert.equal(c.metadata.cstack.sha256, sha(path.resolve(path.dirname(otioPath), c.media_reference.target_url)));
    assert.equal(c.media_reference.available_range.duration.rate, 30);
  }

  const side = readJSON(`${master}.gen.json`);
  assert.deepEqual(side.inputs.map((i) => [i.path, i.role]), [['../edl.yaml', 'edl'], ['../src.mp4', 'clip'], ['../cut.mp4', 'clip']]);
  assert.deepEqual(side.extra_outputs.map((x) => [x.path, x.sha256]), [['edl.otio.json', sha(otioPath)]]);
  assert.equal(side.steps.length, 4);
  assert.ok(side.steps.at(-1).args.some((a) => a.includes('xfade=transition=fade:duration=0.4:offset=0.6')), 'join step records the xfade');
  assert.deepEqual(side.result.focus.map((s) => [s.start, s.focus_x]), [[0, 0.3], [(18 + 6) / 30, 0.5], [48 / 30, 0.5]]);
  const otioSide = readJSON(`${otioPath}.gen.json`);
  assert.deepEqual([otioSide.operation, otioSide.output.path, otioSide.extra_outputs[0].path, otioSide.recipe_hash], ['video.assemble', 'edl.otio.json', 'master.mp4', side.recipe_hash]);
  assert.deepEqual(fs.readdirSync(f.p('cut')).sort(), ['edl.otio.json', 'edl.otio.json.gen.json', 'master.mp4', 'master.mp4.gen.json']);
});

test('reframe: letterbox stripped, each aspect at its delivery size', ON, async () => {
  const f = await fx();
  const r = await runVideo('reframe', [f.p('lbox.mp4'), '--to', '9:16,1:1', '--preset', 'ultrafast', '--out', f.p('reframe')]);
  assert.equal(r.result.letterbox, true);
  assert.deepEqual(r.result.region, { w: 320, h: 136, x: 0, y: 22 });
  assert.equal(r.result.focus.source, 'default');
  const sizes = [];
  for (const name of ['lbox.9x16.mp4', 'lbox.1x1.mp4']) {
    const p = (await runVideo('probe', [f.p('reframe', name)])).result;
    sizes.push([name, p.video.width, p.video.height, p.faststart]);
  }
  assert.deepEqual(sizes, [['lbox.9x16.mp4', 1080, 1920, true], ['lbox.1x1.mp4', 1080, 1080, true]]);
  assert.match(r.text, /upscaled/);
  // no bar survives: the top and bottom rows carry picture, not black
  const img = await frameAt(f.p('reframe', 'lbox.1x1.mp4'), 0.5, f.d);
  const rowLuma = (y) => Array.from({ length: img.width }, (_, x) => px(img, x, y)).reduce((s, [r, g, b]) => s + (r + g + b) / 3, 0) / img.width;
  assert.ok(rowLuma(2) > 30 && rowLuma(img.height - 3) > 30, `edge rows ${rowLuma(2)} ${rowLuma(img.height - 3)}`);
});

test('captions: burned inside the TikTok zone, ASS margins in output pixels, names with quotes and brackets', { ...ON, skip: SKIP ?? (LIBASS ? false : 'this ffmpeg build has no subtitles filter (libass)') }, async () => {
  const f = await fx();
  const srt = f.p('my caps.srt');
  fs.writeFileSync(srt, '1\n00:00:00,000 --> 00:00:01,000\nSafe zone check\nwith two lines\n\n2\n00:00:01,000 --> 00:00:02,000\n<i>Second</i> cue\n');
  const out = f.p('cap out', "cap's [final].mp4");
  const r = await runVideo('captions', [f.p('plain.mp4'), '--srt', srt, '--zone', 'tiktok', '--preset', 'ultrafast', '--out', out]);
  assert.deepEqual(r.result.zone_px, { x0: 10, x1: 160, y0: 25, y1: 247 });
  assert.deepEqual(r.result.margins, { MarginL: 11, MarginR: 21, MarginV: 74 });
  assert.match(r.result.warnings.join('\n'), /TikTok x range 60–960 is inferred/);
  const ass = fs.readFileSync(f.p('cap out', "cap's [final].captions.ass"), 'utf8');
  assert.deepEqual(readJSON(f.p('cap out', "cap's [final].captions.ass.gen.json")).inputs.map((i) => [i.path, i.role]), [['../plain.mp4', 'video'], ['../my caps.srt', 'srt']]);
  assert.match(ass, /^PlayResX: 180$/m);
  assert.match(ass, /,2,11,21,74,1$/m);
  const p = (await runVideo('probe', [out])).result;
  assert.deepEqual([p.video.width, p.video.height], [180, 320]);
  // every pixel the captions changed lies inside the zone (2 px allowance for chroma subsampling)
  const a = await frameAt(f.p('plain.mp4'), 0.5, f.d);
  const b = await frameAt(out, 0.5, f.d);
  let n = 0;
  const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (let y = 0; y < 320; y++)
    for (let x = 0; x < 180; x++) {
      const [p1, p2] = [px(a, x, y), px(b, x, y)];
      if (Math.max(...p1.map((v, i) => Math.abs(v - p2[i]))) <= 60) continue;
      n++;
      Object.assign(box, { x0: Math.min(box.x0, x), x1: Math.max(box.x1, x), y0: Math.min(box.y0, y), y1: Math.max(box.y1, y) });
    }
  if (!r.result.fonts.length) return; // no font found by libass: nothing was drawn to locate (the warning says so)
  assert.ok(n > 20, `${n} changed pixels`);
  assert.ok(box.x0 >= 10 - 2 && box.x1 <= 160 + 2 && box.y0 >= 25 - 2 && box.y1 <= 247 + 2, JSON.stringify(box));
});

test('safezone: outside darkened, inside untouched, zone outlined', ON, async () => {
  const f = await fx();
  const out = f.p('zone', 'reels.png');
  const r = await runVideo('safezone', [f.p('white.png'), '--zone', 'reels', '--out', out]);
  assert.deepEqual(r.result.zone_px, { x0: 7, x1: 166, y0: 35, y1: 268 });
  const img = decodePNG(fs.readFileSync(out));
  assert.deepEqual([img.width, img.height], [180, 320]);
  assert.ok(px(img, 90, 10).every((v) => v < 160), `top band ${px(img, 90, 10)}`);
  assert.ok(px(img, 3, 150).every((v) => v < 160), `left band ${px(img, 3, 150)}`);
  assert.ok(px(img, 90, 300).every((v) => v < 160), `bottom band ${px(img, 90, 300)}`);
  assert.ok(px(img, 90, 150).every((v) => v > 240), `inside ${px(img, 90, 150)}`);
  const [r1, g1, b1] = px(img, 7, 150);
  assert.ok(g1 > r1 + 50 && g1 > b1 + 50, `outline ${[r1, g1, b1]}`);
});

test('audio: a quiet sine reaches -14 LUFS within 1 LU and -1 dBTP, alone and with a bed', ON, async () => {
  const f = await fx();
  const r = await runVideo('audio', [f.p('quiet.mp4'), '--out', f.p('audio', 'loud.mp4')]);
  assert.equal(r.ok, true, r.text);
  assert.ok(r.result.input.integrated_lufs < -24, `input ${r.result.input.integrated_lufs}`);
  assert.ok(Math.abs(r.result.output.integrated_lufs + 14) <= 1, `output ${r.result.output.integrated_lufs}`);
  assert.ok(r.result.output.true_peak_dbtp <= -1 + 0.05, `true peak ${r.result.output.true_peak_dbtp}`);
  assert.equal(r.result.normalization_type, 'linear');
  const p = (await runVideo('probe', [f.p('audio', 'loud.mp4')])).result;
  assert.deepEqual([p.video.codec, p.video.width, p.audio.codec, p.audio.sample_rate], ['h264', 64, 'aac', 48000]);

  const b = await runVideo('audio', [f.p('quiet.mp4'), '--bed', f.p('bed.wav'), '--out', f.p('audio', 'bed.mp4')]);
  assert.equal(b.ok, true, b.text);
  assert.equal(typeof b.result.bed.gain_db, 'number');
  assert.ok(Math.abs(b.result.output.integrated_lufs + 14) <= 1);
  assert.deepEqual(readJSON(f.p('audio', 'bed.mp4.gen.json')).inputs.map((i) => i.role), ['video', 'bed']);
});

test('qa: ROI corruption on the last frame fails, the clean clip passes', ON, async () => {
  const f = await fx();
  const roi = ['--product-ref', f.p('ref.png'), '--roi', '60,130,60,60'];
  const clean = await runVideo('qa', [f.p('clean.mp4'), ...roi, '--json']);
  assert.equal(clean.ok, true, JSON.stringify(clean.result.findings));
  const ok = finding(clean, 'video.roi');
  assert.equal(ok.level, 'pass');
  assert.ok(ok.data.frames.every((x) => x.ssim_y > 0.9), JSON.stringify(ok.data.frames));
  assert.equal(ok.data.thresholds.calibrated, false);

  const bad = await runVideo('qa', [f.p('bad.mp4'), ...roi, '--out', f.p('qa-bad')]);
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.result.findings.filter((x) => x.level === 'fail').map((x) => x.id), ['video.roi']);
  const frames = finding(bad, 'video.roi').data.frames;
  assert.equal(frames.reduce((a, b) => (b.ssim_y < a.ssim_y ? b : a)).frame, 'last');
  assert.ok(frames.find((x) => x.frame === 'last').ssim_y < 0.7 && frames.find((x) => x.frame === 'first').ssim_y > 0.9, JSON.stringify(frames));
  assert.match(bad.text, /FAIL {2}video\.roi .*coarse drift alarm/);
  assert.match(bad.text, /video qa: FAIL/);
  assert.equal(readJSON(f.p('qa-bad', 'qa.json')).ok, false);
  for (const n of ['first.png', 'last.png', 'last.png.gen.json']) assert.ok(fs.existsSync(f.p('qa-bad', 'roi', n)), n);
  const qaSide = readJSON(f.p('qa-bad', 'qa.json.gen.json'));
  assert.deepEqual(qaSide.inputs.map((i) => [i.path, i.role]), [['../bad.mp4', 'video'], ['../ref.png', 'product_ref']]);
  assert.ok(qaSide.steps.length === 2 && qaSide.steps.every((s) => s.analysis && s.args.includes('-filter_complex') !== s.args.includes('-vf')), 'scene/freeze/black pass and the SSIM pass');
});

test('qa: cuts and duration against a beat plan; a frozen tail fails unless the plan holds it', ON, async () => {
  const f = await fx();
  fs.writeFileSync(f.p('beats.yaml'), '- {id: hook, time: 0-1.5s}\n- {id: bars, time: 1.5-3.0s}\n');
  const q = await runVideo('qa', [f.p('cut.mp4'), '--plan', f.p('beats.yaml')]);
  assert.equal(q.ok, true, q.text);
  assert.deepEqual(['video.spec', 'video.freeze', 'video.black', 'video.cuts', 'video.duration'].map((id) => finding(q, id).level), ['pass', 'pass', 'pass', 'pass', 'pass']);
  assert.equal(finding(q, 'video.loudness').level, 'warn');
  fs.writeFileSync(f.p('three.yaml'), '- {time: 0-1s}\n- {time: 1-2s}\n- {time: 2-3s}\n');
  assert.equal(finding(await runVideo('qa', [f.p('cut.mp4'), '--plan', f.p('three.yaml')]), 'video.cuts').level, 'fail');

  const z = await runVideo('qa', [f.p('frozen.mp4')]);
  assert.equal(z.ok, false);
  assert.equal(finding(z, 'video.freeze').level, 'fail');
  fs.writeFileSync(f.p('hold.yaml'), '- {id: move, time: 0-1.3s}\n- {id: end-card, time: 1.3-3.0s, hold: true, transition: hold}\n');
  const h = await runVideo('qa', [f.p('frozen.mp4'), '--plan', f.p('hold.yaml')]);
  assert.equal(h.ok, true, h.text);
  assert.equal(finding(h, 'video.freeze').level, 'pass');
});

test('deliver: per-channel encodes, one encode per frame shape, manifest hashes, overwrite refusal', ON, async () => {
  const f = await fx();
  const out = f.p('deliver');
  const r = await runVideo('deliver', [f.p('src.mp4'), '--channels', 'meta,tiktok,reels', '--preset', 'ultrafast', '--out', out]);
  assert.equal(r.ok, true, r.text);
  const m = readJSON(f.p('deliver', 'manifest.json'));
  assert.equal(m.ok, true);
  assert.equal(m.source.sha256, sha(f.p('src.mp4')));
  assert.deepEqual(m.files.map((x) => [x.channel, x.path, x.width, x.height, x.fps, x.video_codec, x.pix_fmt, x.audio_codec, x.sample_rate, x.faststart, x.issues.length]), [
    ['meta', 'src.meta.mp4', 1080, 1350, 30, 'h264', 'yuv420p', 'aac', 48000, true, 0],
    ['tiktok', 'src.tiktok.mp4', 1080, 1920, 30, 'h264', 'yuv420p', 'aac', 48000, true, 0],
    ['reels', 'src.reels.mp4', 1080, 1920, 30, 'h264', 'yuv420p', 'aac', 48000, true, 0],
  ]);
  for (const x of m.files) {
    assert.equal(x.sha256, sha(path.join(out, x.path)));
    assert.equal(x.bytes, fs.statSync(path.join(out, x.path)).size);
  }
  assert.equal(m.files[1].sha256, m.files[2].sha256, 'same frame, same encode: tiktok and reels are one file');
  assert.deepEqual(readJSON(path.join(out, 'src.reels.mp4.gen.json')).steps.map((s) => s.bin), ['ffmpeg', 'ffmpeg', 'copy']);
  const ms = readJSON(path.join(out, 'manifest.json.gen.json'));
  assert.deepEqual(ms.steps.map((s) => [s.bin, !!s.analysis]), [['ffmpeg', true], ['ffmpeg', false], ['ffmpeg', false], ['copy', false]]);
  assert.deepEqual(ms.result.files.map((x) => x.sha256), m.files.map((x) => x.sha256));

  const before = sha(f.p('deliver', 'manifest.json'));
  await assert.rejects(runVideo('deliver', [f.p('src.mp4'), '--channels', 'meta', '--out', out]), /output exists: .*src\.meta\.mp4/);
  assert.equal(sha(f.p('deliver', 'manifest.json')), before);
});
