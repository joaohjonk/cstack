// cstack video, the parts that need no ffmpeg: EDL, timeline and OTIO maths, beat plans, safe zones, SRT to ASS,
// filtergraph escaping, detector log parsing, framing geometry, argument handling, and the fail-closed MISSING path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readData } from '../scripts/lib/core.mjs';
import { binPath, escapeFilterValue, guardOutputs, parseFps, parseSize, parseTime, sec, MissingTool } from '../scripts/lib/video/ffmpeg.mjs';
import { parseEDL, buildTimeline, focusSegments, toOTIO } from '../scripts/lib/video/edl.mjs';
import { parseScene, parseFreeze, parseBlack, parseCrop, judgeCrop } from '../scripts/lib/video/detect.mjs';
import { parseLoudnorm } from '../scripts/lib/video/audio.mjs';
import { zoneRect, zoneMargins, parseSRT, assText, toASS } from '../scripts/lib/video/captions.mjs';
import { fitFilter, cropWindow, xExpression, aspectPlan, parseAspects } from '../scripts/lib/video/edit.mjs';
import { parsePlan, parseROI, specFinding, freezeFinding, blackFinding, cutsFinding, durationFinding } from '../scripts/lib/video/qa.mjs';
import { parseChannels, deliveryFps } from '../scripts/lib/video/deliver.mjs';
import { normArgs, runVideo, VIDEO_HELP } from '../scripts/lib/video/cli.mjs';
import { tmpDir } from './tmp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'tests', 'fixtures', 'video');
const tmp = () => tmpDir('cstack-videof-');

const threeClips = () =>
  parseEDL(
    {
      output: { size: '180x320', fps: 10 },
      clips: [
        { src: 'a.mp4', out: 1 },
        { src: 'b.mp4', in: 0.5, out: 1.5, transition: { type: 'wipeleft', duration: 0.3 } },
        { src: 'c.mp4', name: 'end' },
      ],
    },
    { baseDir: '/proj/cut', name: 'cut' }
  );

test('EDL: defaults, time formats and resolved paths', () => {
  const e = parseEDL({ output: { size: '180x320', fps: 30 }, clips: [{ src: 'a.mp4', out: 1 }, { src: 'clips/b.mp4', in: '0.5s', out: '00:01.5', transition: { duration: 0.2 } }] }, { baseDir: '/proj', name: 'cut' });
  assert.equal(e.name, 'cut');
  assert.deepEqual(e.output, { width: 180, height: 320, fps: { num: 30, den: 1, value: 30, str: '30' }, fit: 'pad', audio: false });
  assert.equal(e.clips[0].src, path.resolve('/proj', 'a.mp4'));
  assert.deepEqual([e.clips[0].in, e.clips[0].out, e.clips[0].focus_x, e.clips[0].transition], [0, 1, 0.5, null]);
  assert.deepEqual([e.clips[1].in, e.clips[1].out, e.clips[1].name], [0.5, 1.5, 'b']);
  assert.deepEqual(e.clips[1].transition, { type: 'fade', duration: 0.2 });
});

test('EDL: every problem is reported at once', () => {
  assert.throws(
    () => parseEDL({ output: { size: '181x320', fps: 'fast' }, clips: [{ src: 'a.mp4', in: 2, out: 1, focus_x: 2, zoom: 2, transition: { duration: 1 } }], extra: 1 }),
    (e) => {
      for (const re of [/unknown top-level key "extra"/, /output\.size 181x320: width and height must be even/, /output\.fps must be a number/, /clips\[0\]: unknown key "zoom"/, /clips\[0\]: out \(1\) must be after in \(2\)/, /clips\[0\]\.focus_x must be a number from 0 to 1/, /first clip cannot have a transition/]) assert.match(e.message, re);
      return true;
    }
  );
  assert.throws(() => parseEDL([]), /EDL must be a mapping/);
  assert.throws(() => parseEDL({ output: { size: '180x320', fps: 30 }, clips: [] }), /clips must be a non-empty list/);
});

test('timeline: frame counts, transition overlap, focus switch points', () => {
  const tl = buildTimeline(threeClips(), [2, 2, 0.8]);
  assert.deepEqual(
    tl.clips.map((c) => [c.frames, c.transition_frames, c.record_start, c.record_end]),
    [
      [10, 0, 0, 10],
      [10, 3, 7, 17],
      [8, 0, 17, 25],
    ]
  );
  assert.equal(tl.frames, 25);
  assert.equal(tl.duration, 2.5);
  assert.deepEqual(focusSegments(tl).map((s) => s.start), [0, 0.8, 1.7]);
  assert.throws(() => buildTimeline(threeClips(), [2, 2, undefined]), /no out point and the source duration is unknown/);
  assert.throws(() => buildTimeline(threeClips(), [0.5, 2, 1]), /past the end of the source/);
  const long = parseEDL({ output: { size: '180x320', fps: 10 }, clips: [{ src: 'a.mp4', out: 0.2 }, { src: 'b.mp4', out: 1, transition: { duration: 0.5 } }] });
  assert.throws(() => buildTimeline(long), /must be shorter than both clips/);
});

test('OTIO: schema tree, ranges that exclude the overlap, track as long as the master, urls', () => {
  const tl = buildTimeline(threeClips(), [2, 2, 0.8]);
  const o = toOTIO(tl, { otioDir: '/proj/cut/out', metadata: { edl: '../edl.yaml' } });
  assert.equal(o.OTIO_SCHEMA, 'Timeline.1');
  assert.equal(o.tracks.OTIO_SCHEMA, 'Stack.1');
  const track = o.tracks.children[0];
  assert.equal(track.OTIO_SCHEMA, 'Track.1');
  assert.equal(track.kind, 'Video');
  assert.deepEqual(track.children.map((c) => c.OTIO_SCHEMA), ['Clip.1', 'Transition.1', 'Clip.1', 'Clip.1']);
  const clips = track.children.filter((c) => c.OTIO_SCHEMA === 'Clip.1');
  // outgoing clip loses the 2 frames after the cut point, incoming starts 1 frame (floor(3/2)) after its in point
  assert.deepEqual(clips.map((c) => [c.source_range.start_time.value, c.source_range.duration.value]), [[0, 8], [6, 9], [0, 8]]);
  assert.equal(clips.reduce((s, c) => s + c.source_range.duration.value, 0), tl.frames);
  assert.ok(clips.every((c) => c.source_range.duration.rate === 10 && c.source_range.duration.OTIO_SCHEMA === 'RationalTime.1'));
  const tr = track.children[1];
  assert.deepEqual([tr.in_offset.value, tr.out_offset.value, tr.transition_type, tr.metadata.cstack.xfade], [1, 2, 'Custom_Transition', 'wipeleft']);
  assert.equal(clips[0].media_reference.OTIO_SCHEMA, 'ExternalReference.1');
  assert.equal(clips[0].media_reference.target_url, '../a.mp4');
  assert.equal(clips[2].name, 'end');
  assert.deepEqual(o.metadata.cstack, { size: '180x320', fps: '10', fit: 'pad', frames: 25, edl: '../edl.yaml' });
  assert.deepEqual(JSON.parse(JSON.stringify(o)), o);
  const abs = toOTIO(tl, { absoluteUrls: true });
  assert.match(abs.tracks.children[0].children[0].media_reference.target_url, /^file:\/\/.*\/proj\/cut\/a\.mp4$/);
});

test('fixtures: the documented EDL and beat plan examples parse and agree', () => {
  const edl = parseEDL(readData(path.join(FIX, 'edl.yaml')), { baseDir: FIX });
  const tl = buildTimeline(edl);
  assert.equal(tl.frames, 240);
  assert.equal(tl.duration, 8);
  assert.equal(tl.clips[1].transition_frames, 15);
  const plan = parsePlan(readData(path.join(FIX, 'beats.yaml')));
  assert.deepEqual(plan.beats.map((b) => [b.id, b.start, b.end, b.hold, b.transition]), [
    ['hook', 0, 1.75, false, null],
    ['product', 1.75, 5, false, 'fade'],
    ['endcard', 5, 8, true, null],
  ]);
  assert.equal(plan.duration, tl.duration);
  assert.equal(tl.clips[2].record_start / edl.output.fps.value, plan.beats[2].start);
  const doc = fs.readFileSync(path.join(FIX, 'README.md'), 'utf8');
  for (const k of ['focus_x', 'transition', 'hold: true', 'Transition.1', 'MISSING:']) assert.ok(doc.includes(k), k);
});

test('beat plan: list or mapping, time ranges, chained durations, overlap errors', () => {
  const p = parsePlan([{ id: 'hook', time: '0-1.5s' }, { shot_id: 'S2', start: 1.5, end: '3.0s', hold: true }]);
  assert.deepEqual(p.beats.map((b) => [b.id, b.start, b.end, b.hold]), [['hook', 0, 1.5, false], ['S2', 1.5, 3, true]]);
  assert.equal(p.duration, 3);
  const q = parsePlan({ beats: [{ duration: 1 }, { duration: 2, transition: 'xfade' }], size: '1080x1920', fps: '30000/1001', duration: 3.1 });
  assert.deepEqual(q.beats.map((b) => [b.id, b.start, b.end, b.transition]), [['beat-1', 0, 1, null], ['beat-2', 1, 3, 'xfade']]);
  assert.equal(q.duration, 3.1);
  assert.deepEqual(q.size, { width: 1080, height: 1920 });
  assert.equal(q.fps.str, '30000/1001');
  assert.throws(() => parsePlan([{ start: 0, end: 2 }, { start: 1, end: 3 }]), /before the previous beat ends/);
  assert.throws(() => parsePlan([{ start: 2, end: 1 }]), /must be after start/);
  assert.throws(() => parsePlan([]), /list of beats/);
});

test('qa findings: freeze, black, cuts, duration and spec levels', () => {
  const plan = parsePlan([{ time: '0-1.5s' }, { time: '1.5-3s', hold: true }]);
  const tail = { fps: 30, freezes: [{ start: 1.5, end: 3, duration: 1.5, tail: true }] };
  assert.equal(freezeFinding(tail).level, 'fail');
  assert.equal(freezeFinding(tail, plan).level, 'pass');
  assert.equal(freezeFinding({ fps: 30, freezes: [{ start: 0.5, end: 1.2, duration: 0.7, tail: false }] }).level, 'warn');
  assert.equal(freezeFinding({ fps: 30, freezes: [] }).level, 'pass');
  assert.equal(blackFinding({ blacks: [{ start: 0, end: 0.4, duration: 0.4, head: true, tail: false }] }).level, 'fail');
  assert.equal(blackFinding({ blacks: [{ start: 2.8, end: 3, duration: 0.2, head: false, tail: true }] }).level, 'warn');
  const det = (times) => ({ threshold: 0.3, cuts: times.map((time) => ({ time, score: 0.5 })) });
  assert.equal(cutsFinding(det([1.52]), plan).level, 'pass');
  assert.equal(cutsFinding(det([2.2]), plan).level, 'warn');
  assert.equal(cutsFinding(det([]), plan).level, 'fail');
  assert.equal(cutsFinding(det([0.7, 1.5]), plan).level, 'fail');
  assert.equal(cutsFinding(det([]), parsePlan([{ time: '0-1.5s' }, { time: '1.5-3s', transition: 'fade' }])).level, 'pass');
  assert.equal(cutsFinding(det([1, 2])).level, 'pass');
  const info = (d, v = {}) => ({ video: { codec: 'h264', pix_fmt: 'yuv420p', width: 1080, height: 1920, display_width: 1080, display_height: 1920, fps: 30, vfr: false, rotation: 0, sar: '1:1', sar_value: 1, duration: d, ...v }, audio: null, duration: d });
  assert.equal(durationFinding(info(3.02), plan).level, 'pass');
  assert.equal(durationFinding(info(3.3), plan).level, 'warn');
  assert.equal(durationFinding(info(4), plan).level, 'fail');
  assert.equal(specFinding(info(3)).level, 'pass');
  assert.equal(specFinding(info(3, { codec: 'hevc' })).level, 'fail');
  assert.equal(specFinding(info(3, { vfr: true })).level, 'warn');
  assert.equal(specFinding(info(3, { fps: 12 })).level, 'warn');
  assert.equal(specFinding(info(3), parsePlan({ beats: [{ time: '0-3s' }], size: '1080x1350' })).level, 'fail');
  assert.deepEqual(parseROI('10,20,30,40'), { x: 10, y: 20, w: 30, h: 40 });
  assert.throws(() => parseROI('1,2,3'), /x,y,w,h/);
  assert.throws(() => parseROI('0,0,4,4'), /at least 8x8/);
});

test('safe zones: documented 1080x1920 rectangles become ASS margins in output pixels', () => {
  const m = (z, W = 1080, H = 1920, o) => {
    const { MarginL, MarginR, MarginV } = zoneMargins(z, W, H, o);
    return [MarginL, MarginR, MarginV];
  };
  assert.deepEqual(m('universal'), [60, 120, 440]);
  assert.deepEqual(m('tiktok'), [60, 120, 440]);
  assert.deepEqual(m('reels'), [44, 84, 310]);
  assert.deepEqual(m('shorts'), [60, 96, 390]);
  assert.deepEqual(m('universal', 720, 1280), [40, 80, 293]);
  assert.deepEqual(m('universal', 1080, 1920, { outline: 3 }), [63, 123, 443]);
  assert.deepEqual(zoneRect('reels', 180, 320), { x0: 7, x1: 166, y0: 35, y1: 268 });
  assert.throws(() => zoneRect('snapchat', 1080, 1920), /unknown --zone "snapchat"/);
});

test('SRT to ASS: BOM, CRLF, missing index, tags, control characters, PlayRes = frame', () => {
  const cues = parseSRT('\uFEFF1\r\n00:00:00,500 --> 00:00:01,250\r\nHello <i>there</i>\r\nline two\r\n\r\n00:00:02.000 --> 00:00:03.5\r\n{odd} \\ <font color="red">text</font>\r\n');
  assert.deepEqual(cues, [
    { start: 0.5, end: 1.25, text: 'Hello <i>there</i>\nline two' },
    { start: 2, end: 3.5, text: '{odd} \\ <font color="red">text</font>' },
  ]);
  assert.deepEqual(assText(cues[0].text), { text: 'Hello {\\i1}there{\\i0}\\Nline two', changed: false });
  assert.deepEqual(assText(cues[1].text), { text: '(odd) / text', changed: true });
  assert.throws(() => parseSRT('1\n00:00:01 --> 00:00:02\nx'), /bad SRT timing line/);
  assert.throws(() => parseSRT('1\n00:00:02,000 --> 00:00:01,000\nx'), /ends before it starts/);
  const margins = zoneMargins('tiktok', 180, 320, { outline: 1 });
  const ass = toASS(cues, { W: 180, H: 320, margins, font: 'Arial', size: 11, outline: 1, zone: 'tiktok' });
  assert.equal(ass.changed, true);
  assert.match(ass.text, /^PlayResX: 180$/m);
  assert.match(ass.text, /^PlayResY: 320$/m);
  assert.match(ass.text, /^Style: Default,Arial,11,.*,1,1,0,2,11,21,74,1$/m);
  assert.match(ass.text, /^Dialogue: 0,0:00:00\.50,0:00:01\.25,Default,,0,0,0,,Hello \{\\i1\}there\{\\i0\}\\Nline two$/m);
});

test('filtergraph escaping matches the ffmpeg-filters documentation example', () => {
  assert.equal(escapeFilterValue("this is a 'string': may contain one, or more, special characters"), String.raw`this is a \\\'string\\\'\\: may contain one\, or more\, special characters`);
  assert.equal(escapeFilterValue("./cap's [final].ass"), String.raw`./cap\\\'s \[final\].ass`);
  assert.equal(escapeFilterValue('C:\\subs\\a.ass'), String.raw`C\\:\\\\subs\\\\a.ass`);
});

test('detector logs: scene cuts, frozen tail, black head, letterbox, loudnorm JSON', () => {
  // lines as ffmpeg 6.1 prints them (addresses shortened)
  const log = [
    '[freezedetect @ 0x1] lavfi.freezedetect.freeze_start: 0',
    '[freezedetect @ 0x1] lavfi.freezedetect.freeze_duration: 0.5',
    '[freezedetect @ 0x1] lavfi.freezedetect.freeze_end: 0.5',
    '[blackdetect @ 0x1] black_start:0 black_end:0.5 black_duration:0.5',
    '[Parsed_metadata_3 @ 0x1] frame:0    pts:5120    pts_time:0.5',
    '[Parsed_metadata_3 @ 0x1] lavfi.scene_score=0.433780',
    '[Parsed_metadata_3 @ 0x1] frame:1    pts:15360   pts_time:1.5',
    '[Parsed_metadata_3 @ 0x1] lavfi.scene_score=0.413203',
    '[freezedetect @ 0x1] lavfi.freezedetect.freeze_start: 1.5',
  ].join('\n');
  assert.deepEqual(parseScene(log), [{ time: 0.5, score: 0.4338 }, { time: 1.5, score: 0.4132 }]);
  assert.deepEqual(parseScene(log, 0.5).map((c) => c.time), [0, 1]);
  // freezedetect logs no freeze_end for a freeze that runs to EOF: that open segment is the tail
  assert.deepEqual(parseFreeze(log, { duration: 2.5, fps: 10 }), [
    { start: 0, end: 0.5, duration: 0.5, tail: false },
    { start: 1.5, end: 2.5, duration: 1, tail: true },
  ]);
  assert.deepEqual(parseBlack(log, { duration: 2.5, fps: 10 }), [{ start: 0, end: 0.5, duration: 0.5, head: true, tail: false }]);
  const crop = parseCrop('[Parsed_cropdetect_0 @ 0x1] x1:0 x2:63 y1:6 y2:41 w:64 h:36 x:0 y:6 pts:2 t:0.200000 limit:0.094118 crop=64:36:0:6');
  assert.deepEqual(crop, { w: 64, h: 36, x: 0, y: 6 });
  assert.deepEqual(judgeCrop(crop, 64, 48).crop, { w: 64, h: 36, x: 0, y: 6 });
  assert.equal(judgeCrop(crop, 64, 48).letterbox, true);
  assert.equal(judgeCrop({ w: 64, h: 38, x: 0, y: 0 }, 64, 48).applied, false, 'one dark edge is not a letterbox');
  assert.equal(judgeCrop({ w: 64, h: 46, x: 0, y: 1 }, 64, 48).applied, false, 'thin bars are ignored');
  assert.equal(parseCrop('no crop lines'), null);
  const ln = (i, tp) => `[Parsed_loudnorm_0 @ 0x1] \n{\n\t"input_i" : "${i}",\n\t"input_tp" : "${tp}",\n\t"input_lra" : "0.00",\n\t"input_thresh" : "-65.75",\n\t"output_i" : "-14.05",\n\t"output_tp" : "-10.29",\n\t"output_lra" : "0.00",\n\t"output_thresh" : "-24.05",\n\t"normalization_type" : "linear",\n\t"target_offset" : "0.05"\n}\n`;
  const m = parseLoudnorm(ln('-60.00', '-58.00') + ln('-55.75', '-52.04'));
  assert.deepEqual([m.input_i, m.input_tp, m.input_lra, m.normalization_type], [-55.75, -52.04, 0, 'linear']);
  assert.equal(parseLoudnorm(ln('-inf', '-inf')).input_i, -Infinity);
  assert.throws(() => parseLoudnorm('nothing'), /printed no measurement/);
});

test('framing: conform filters, crop windows, per-shot crop expressions', () => {
  assert.equal(fitFilter({ width: 180, height: 320, fps: parseFps(30) }), 'fps=30,scale=180:320:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=180:320:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p');
  assert.equal(fitFilter({ width: 180, height: 320, fps: parseFps('30000/1001'), fit: 'crop', focus: 0.25 }), "fps=30000/1001,scale=180:320:force_original_aspect_ratio=increase:force_divisible_by=2,crop=180:320:'max(0,min(iw-ow,iw*0.25-ow/2))':(ih-oh)/2,setsar=1,format=yuv420p");
  assert.match(fitFilter({ width: 180, height: 320, fps: parseFps(25), sar: 2 }), /^fps=25,scale='trunc\(iw\*sar\/2\)\*2':ih,setsar=1,scale=/);
  assert.deepEqual(cropWindow(1920, 1080, 1080, 1920, 0.5), { w: 608, h: 1080, x: 656, y: 0 });
  assert.equal(cropWindow(1920, 1080, 1080, 1920, 0).x, 0);
  assert.equal(cropWindow(1920, 1080, 1080, 1920, 1).x, 1312);
  assert.deepEqual(cropWindow(180, 320, 1920, 1080), { w: 180, h: 102, x: 0, y: 110 });
  assert.deepEqual(cropWindow(1080, 1920, 1080, 1920), { w: 1080, h: 1920, x: 0, y: 0 });
  assert.equal(xExpression([{ start: 0, x: 10 }]), '10');
  assert.equal(xExpression([{ start: 0, x: 10 }, { start: 1.5, x: 20 }, { start: 3, x: 30 }], 0.1), "'if(lt(t,1.6),10,if(lt(t,3.1),20,30))'");
  // letterbox-free region 320x136 at y=22 inside a 320x180 frame, cropped to 9:16
  assert.deepEqual(aspectPlan({ w: 320, h: 136, x: 0, y: 22 }, { width: 1080, height: 1920 }, [{ start: 0, focus_x: 0.5 }]), { w: 76, h: 136, y: 22, xs: [{ start: 0, x: 122 }], upscale: 14.211 });
  assert.deepEqual(parseAspects('9:16, 9:16,1:1'), ['9:16', '1:1']);
  assert.throws(() => parseAspects('2:3'), /unknown aspect "2:3"/);
  assert.deepEqual(parseChannels('meta, YT,tiktok,meta'), ['meta', 'youtube', 'tiktok']);
  assert.throws(() => parseChannels('myspace'), /unknown channel "myspace"/);
  assert.deepEqual([29.97, 25, 24, 12, 60].map(deliveryFps), ['30000/1001', '25', '24', '30', '30']);
});

test('values: sizes, rates, times, seconds formatting', () => {
  assert.deepEqual(parseSize('1080x1920'), { width: 1080, height: 1920 });
  assert.throws(() => parseSize('1081x1920'), /must be even/);
  assert.equal(parseFps('30000/1001').str, '30000/1001');
  assert.equal(parseFps(29.97).str, '2997/100');
  assert.throws(() => parseFps('0'), /out of range/);
  assert.equal(parseTime('01:02:03.5'), 3723.5);
  assert.equal(parseTime('1.5s'), 1.5);
  assert.throws(() => parseTime('soon'), /not seconds/);
  assert.deepEqual([sec(1 / 3), sec(2), sec(100), sec(0.5), sec(1e-7)], ['0.333333', '2', '100', '0.5', '0']);
});

test('arguments: argv arrays and parsed objects, boolean flags give back swallowed positionals', () => {
  assert.deepEqual(normArgs(['clip.mp4', '--json', '--roi', '1,2,3,4', '--lufs', '-14'], 'qa'), { _: ['clip.mp4'], json: true, roi: '1,2,3,4', lufs: '-14' });
  assert.deepEqual(normArgs({ _: ['qa'], json: 'clip.mp4' }, 'qa'), { _: ['clip.mp4'], json: true });
  assert.deepEqual(normArgs(['a.mp4', '--force=false', '--out=x y.mp4'], 'audio'), { _: ['a.mp4'], force: false, out: 'x y.mp4' });
  assert.deepEqual(normArgs(['normalize', 'a.mp4', '--keep-audio', 'b.mp4'], 'normalize'), { _: ['a.mp4', 'b.mp4'], 'keep-audio': true });
});

test('guards: never an input, never two outputs on one path, never an existing file without --force', () => {
  const d = tmp();
  const a = path.join(d, 'a.mp4');
  fs.writeFileSync(a, 'x');
  assert.throws(() => guardOutputs([path.join(d, '.', 'a.mp4')], [a]), /refusing to overwrite an input/);
  assert.throws(() => guardOutputs([a], [a], { force: true }), /refusing to overwrite an input/);
  assert.throws(() => guardOutputs([a], []), /output exists/);
  assert.doesNotThrow(() => guardOutputs([a], [], { force: true }));
  assert.throws(() => guardOutputs([path.join(d, 'o.mp4'), path.join(d, 'o.mp4')]), /share one path/);
});

test('cli: help, unknown subcommand, flag validation before any tool runs', async () => {
  assert.equal(await runVideo('help'), VIDEO_HELP);
  assert.equal(await runVideo(undefined), VIDEO_HELP);
  await assert.rejects(runVideo('explode', []), /unknown video subcommand "explode"/);
  await assert.rejects(runVideo('normalize', ['a.mp4', '--out', 'o', '--preset', 'turbo']), /--preset must be one of/);
  await assert.rejects(runVideo('normalize', ['a.mp4', '--out', 'o', '--crf', '99']), /--crf must be an integer from 0 to 51/);
  await assert.rejects(runVideo('qa', ['a.mp4', '--roi', '0,0,10,10']), /--product-ref and --roi go together/);
});

test('binaries: CSTACK_FFMPEG and CSTACK_FFPROBE, ffprobe beside a pinned ffmpeg', () => {
  assert.equal(binPath('ffmpeg', {}), 'ffmpeg');
  assert.equal(binPath('ffprobe', {}), 'ffprobe');
  assert.equal(binPath('ffmpeg', { CSTACK_FFMPEG: '/opt/ff/bin/ffmpeg' }), '/opt/ff/bin/ffmpeg');
  assert.equal(binPath('ffprobe', { CSTACK_FFMPEG: '/opt/ff/bin/ffmpeg' }), path.join('/opt/ff/bin', 'ffprobe'));
  assert.equal(binPath('ffprobe', { CSTACK_FFMPEG: 'ffmpeg6' }), 'ffprobe');
  assert.equal(binPath('ffprobe', { CSTACK_FFMPEG: '/opt/ff/bin/ffmpeg', CSTACK_FFPROBE: '/usr/bin/ffprobe' }), '/usr/bin/ffprobe');
});

async function withMissingFfmpeg(fn) {
  const prev = process.env.CSTACK_FFMPEG;
  process.env.CSTACK_FFMPEG = '/nonexistent';
  try {
    await fn();
  } finally {
    if (prev === undefined) delete process.env.CSTACK_FFMPEG;
    else process.env.CSTACK_FFMPEG = prev;
  }
}

test('MISSING: no ffmpeg fails closed, names what would have happened, writes nothing', async () => {
  await withMissingFfmpeg(async () => {
    const d = tmp();
    const out = path.join(d, 'norm');
    await assert.rejects(runVideo('normalize', [path.join(d, 'in clip.mp4'), '--size', '1080x1920', '--out', out]), (e) => {
      assert.ok(e instanceof MissingTool);
      assert.equal(e.code, 'MISSING');
      assert.match(e.message, /^MISSING: ffmpeg \(no working "\/nonexistent" found\)/);
      assert.match(e.message, /would have scaled and padded 1 clip\(s\) to 1080x1920 at 30 fps/);
      assert.match(e.message, /Nothing was written/);
      assert.match(e.message, /never installs or downloads/);
      return true;
    });
    assert.equal(fs.existsSync(out), false);
    // ffprobe is looked up beside the pinned ffmpeg
    await assert.rejects(runVideo('probe', [path.join(d, 'x.mp4')]), /^Error: MISSING: ffprobe \(no working "\/ffprobe" found\)\. This command would have read the container/);
    for (const [sub, args] of [
      ['qa', ['x.mp4']],
      ['deliver', ['x.mp4', '--out', path.join(d, 'dl')]],
      ['audio', ['x.mp4', '--out', path.join(d, 'a.mp4')]],
      ['sheet', ['x.mp4', '--out', path.join(d, 's.png')]],
      ['captions', ['x.mp4', '--srt', 'c.srt', '--out', path.join(d, 'c.mp4')]],
    ])
      await assert.rejects(runVideo(sub, args), /MISSING: ffmpeg/, sub);
    assert.deepEqual(fs.readdirSync(d), []);
  });
});

test('MISSING: assemble still hands off the cut as OpenTimelineIO when every clip has an out point', async () => {
  await withMissingFfmpeg(async () => {
    const d = tmp();
    for (const n of ['a.mp4', 'b.mp4']) fs.writeFileSync(path.join(d, n), 'not decoded');
    const edl = path.join(d, 'my cut.yaml');
    fs.writeFileSync(edl, 'output: {size: 1080x1920, fps: 30}\nclips:\n  - {src: a.mp4, out: 2}\n  - {src: b.mp4, in: 1, out: 3, transition: {duration: 0.5}}\n  - {src: a.mp4, in: 2, out: 3}\n');
    const master = path.join(d, 'out', 'master.mp4');
    await assert.rejects(runVideo('assemble', [edl, '--out', master]), (e) => {
      assert.match(e.message, /^MISSING: ffmpeg/);
      assert.match(e.message, /Only the OpenTimelineIO handoff was written/);
      return true;
    });
    assert.equal(fs.existsSync(master), false);
    const otio = JSON.parse(fs.readFileSync(path.join(d, 'out', 'my cut.otio.json'), 'utf8'));
    const kids = otio.tracks.children[0].children;
    assert.equal(kids.filter((c) => c.OTIO_SCHEMA === 'Clip.1').length, 3);
    assert.equal(kids.filter((c) => c.OTIO_SCHEMA === 'Transition.1').length, 1);
    assert.equal(otio.metadata.cstack.frames, 60 + 60 - 15 + 30);
    assert.equal(kids[0].media_reference.target_url, '../a.mp4');
    const side = JSON.parse(fs.readFileSync(path.join(d, 'out', 'my cut.otio.json.gen.json'), 'utf8'));
    assert.deepEqual([side.ffmpeg, side.params.otio_only, side.steps, side.inputs.map((i) => i.role)], [null, true, [], ['edl', 'clip', 'clip']]);
    // an out point is needed to time a clip without probing it
    fs.writeFileSync(edl, 'output: {size: 1080x1920, fps: 30}\nclips:\n  - {src: a.mp4}\n');
    await assert.rejects(runVideo('assemble', [edl, '--out', master, '--force']), /^Error: MISSING: ffmpeg.*Nothing was written/s);
  });
});
