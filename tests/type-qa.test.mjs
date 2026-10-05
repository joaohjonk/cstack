// cstack type qa against local fixtures on 127.0.0.1 (no external network). Browser tests skip with a reason when
// Chromium cannot launch, like tests/browser.test.mjs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runType } from '../scripts/lib/type/cli.mjs';
import { loadEngine, launch } from '../scripts/lib/browser/launch.mjs';
import { tmpDir } from './tmp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'tests', 'fixtures', 'type');
const SCALE = path.join(FIX, 'scale.css');
// a TrueType file to serve as the fixture's web font: Linux CI fonts, then macOS system fonts (an owner's Mac, F72)
const WEB_FONT = ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf', '/Library/Fonts/Arial.ttf', '/System/Library/Fonts/Supplemental/Verdana.ttf'].find((f) => fs.existsSync(f));
const tmpWs = () => tmpDir('cstack-typeqa-');
const runDir = (ws, out) => path.join(ws, out.match(/^run: (.+)$/m)[1]);
const run = promisify(execFile);

let server;
let base;
let skipReason = null;

before(async () => {
  const pages = { '/faults.html': ['faults.html', 'text/html'], '/clean.html': ['clean.html', 'text/html'], '/scale.css': ['scale.css', 'text/css'] };
  server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (pages[p]) return res.writeHead(200, { 'content-type': pages[p][1] }).end(fs.readFileSync(path.join(FIX, pages[p][0])));
    if (p === '/fonts/fixture.ttf' && WEB_FONT) return res.writeHead(200, { 'content-type': 'font/ttf' }).end(fs.readFileSync(WEB_FONT));
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); // /fonts/ghost.woff2 never arrives
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  try {
    const b = await launch(await loadEngine());
    await b.close();
  } catch (e) {
    skipReason = `Chromium unavailable: ${e.message.split('\n')[0]}`;
  }
});
after(() => server?.close());

const browserTest = (name, fn) =>
  test(name, { timeout: 90000 }, async (t) => {
    if (skipReason) return t.skip(skipReason);
    await fn(t);
  });

test('type qa: the URL guard runs before any browser launch', async () => {
  await assert.rejects(runType('qa', ['http://169.254.169.254/latest'], tmpWs()), /BLOCKED/);
  await assert.rejects(runType('qa', [], tmpWs()), /usage: cstack type qa/);
  await assert.rejects(runType('qa', ['http://127.0.0.1:9/', '--scale-css', path.join(FIX, 'faults.html')], tmpWs()), /no font-size custom properties/);
});

browserTest('type qa (cli): every deliberate fault is reported, run dir is hashed, exit code is 1', async () => {
  const ws = tmpWs();
  const args = [path.join(ROOT, 'bin', 'cstack.mjs'), 'type', 'qa', `${base}/faults.html`, '--families', 'Ghost Sans,serif,sans-serif,Fixture Web', '--scale-css', path.relative(ROOT, SCALE), '--ws', ws];
  const err = await run(process.execPath, args, { cwd: ROOT, encoding: 'utf8' }).then(() => null, (e) => e);
  assert.ok(err, 'a page with FAIL findings exits non-zero');
  assert.equal(err.code, 1);
  const out = err.stdout;
  assert.match(out, /^RESULT=FAIL$/m);
  // Ghost Sans never loads; Fixture Web loads only when this machine has a font file to serve as it
  assert.match(out, new RegExp(`^FONT_FALLBACK=${WEB_FONT ? 1 : 2}$`, 'm'));
  assert.match(out, /--- BEGIN UNTRUSTED EXTERNAL CONTENT[\s\S]*"Low contrast copy[\s\S]*--- END UNTRUSTED EXTERNAL CONTENT ---/);
  const dir = runDir(ws, out);
  const rec = JSON.parse(fs.readFileSync(path.join(dir, 'run.json'), 'utf8'));
  assert.equal(rec.sub, 'type-qa');
  assert.equal(rec.untrusted_content, true);
  for (const f of rec.files) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f.path))).digest('hex'), f.sha256);
  const q = JSON.parse(fs.readFileSync(path.join(dir, 'type-qa.json'), 'utf8'));
  const find = (rule, p) => q.findings.find((f) => f.rule === rule && (!p || f.path === p));
  assert.equal(find('measure', 'p#long')?.level, 'fail');
  assert.ok(find('measure', 'p#long').values['1440'] > 100);
  assert.equal(find('leading', 'p#tight')?.level, 'warn');
  assert.equal(find('leading', 'h1#loose')?.level, 'warn');
  assert.match(find('caps-tracking', 'p#eyebrow')?.detail ?? '', /all-caps "COLLECTION"/);
  assert.match(find('widow', 'h2#widow')?.detail ?? '', /single word "week"/);
  assert.deepEqual(find('widow', 'h2#widow').breakpoints, [375, 768, 1440]);
  assert.equal(find('contrast', 'p#faint')?.level, 'fail');
  assert.equal(find('contrast', 'p#faint').value, 2.32);
  assert.match(find('font-fallback')?.detail ?? '', /"Ghost Sans" is declared but did not load/);
  assert.equal(find('small-text', 'p#tiny')?.level, 'fail');
  assert.equal(find('small-text', 'p#fine')?.level, 'warn');
  assert.equal(find('justify-hyphens', 'p#justified')?.level, 'warn');
  assert.match(find('too-many-families')?.detail ?? '', /families rendered \(max 3\)/);
  assert.equal(find('too-many-sizes')?.level, 'warn');
  assert.deepEqual(q.findings.filter((f) => f.rule === 'family-outside').map((f) => f.path).sort(), ['p#cursive', 'p#fantasy', 'p#mono']);
  assert.ok(q.findings.some((f) => f.rule === 'off-scale' && f.path === 'p#odd'));
  assert.equal(find('off-scale', 'h2#widow')?.sample, 'Spring collection arrives this week', 'run samples keep the space a <br> implies');
  assert.ok(!q.findings.some((f) => f.path === 'p#lead'), '20px is on the scale and otherwise clean');
  const fams = q.breakpoints[0].families;
  if (WEB_FONT) {
    assert.ok(fams.some((f) => f.name === 'Fixture Web' && f.kind === 'web'), JSON.stringify(fams));
    assert.ok(!q.findings.some((f) => f.rule === 'font-fallback' && /Fixture Web/.test(f.detail)));
  } else assert.ok(q.findings.some((f) => f.rule === 'font-fallback' && /Fixture Web/.test(f.detail)));
  assert.equal(q.summary.ok, false);
  assert.equal(q.options.scale_css.file, 'scale.css');
});

browserTest('type qa: a well-set page passes with no findings', async () => {
  const ws = tmpWs();
  const out = await runType('qa', [`${base}/clean.html`, '--families', 'serif', '--scale-css', SCALE], ws);
  const q = JSON.parse(fs.readFileSync(path.join(runDir(ws, out.text), 'type-qa.json'), 'utf8'));
  assert.deepEqual(q.findings.map((f) => `${f.rule} ${f.path}: ${f.detail}`), []);
  assert.equal(out.ok, true);
  assert.match(out.text, /^RESULT=PASS$/m);
  for (const b of q.breakpoints) {
    assert.deepEqual(b.families.map((f) => f.name), ['serif']);
    assert.deepEqual(b.sizes_px, [12.8, 16, 25, 39.06]);
  }
  const blocks = JSON.parse(fs.readFileSync(path.join(runDir(ws, out.text), 'type-blocks.json'), 'utf8'));
  const body = blocks.breakpoints.find((b) => b.breakpoint === 1440).blocks.find((b) => b.path === 'main > p:nth-of-type(2)');
  assert.ok(body.lines >= 3 && body.cpl >= 45 && body.cpl <= 85, `cpl ${body.cpl} over ${body.lines} lines`);
  assert.equal(body.line_height, 1.5);
});
