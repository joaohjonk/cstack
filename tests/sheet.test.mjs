// cstack sheet: contact sheets for stills and blind pairwise picks (F22; backlog P0 #3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, readJSONL } from '../scripts/lib/core.mjs';
import { encodePNG } from '../scripts/lib/image/png.mjs';
import { makeSheet, importPicks, renderPNG, shuffle } from '../scripts/lib/sheet.mjs';
import { validateValue } from '../scripts/lib/schemas.mjs';
import { tmpDir } from './tmp.mjs';

const CLI = path.join(ROOT, 'bin', 'cstack.mjs');
const cli = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

function probes(dir, names) {
  fs.mkdirSync(dir, { recursive: true });
  return names.map((n, k) => {
    const w = 40;
    const h = 50;
    const data = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) data.set([k * 40, 47, 167, 255], i * 4);
    const p = path.join(dir, n);
    fs.writeFileSync(p, encodePNG({ width: w, height: h, data }));
    return p;
  });
}

test('sheet: an open sheet names its files and records their hashes', () => {
  const ws = tmpDir('cstack-sheet-');
  probes(path.join(ws, 'work', 'probes'), ['a-klein4b.png', 'b-klein9b.png']);
  const r = makeSheet({ inputs: [path.join(ws, 'work', 'probes')], out: path.join(ws, 'work', 'sheets', 'open') });
  const html = fs.readFileSync(r.html, 'utf8');
  assert.match(html, /a-klein4b\.png/);
  const rec = JSON.parse(fs.readFileSync(r.record, 'utf8'));
  assert.equal(rec.count, 2);
  assert.equal(rec.items[0].width, 40);
  assert.match(rec.items[0].sha256, /^[0-9a-f]{64}$/);
  assert.throws(() => makeSheet({ inputs: [path.join(ws, 'work', 'probes')], out: r.html }), /exists; pass --force/);
});

test('sheet --blind: codes and code-named copies only; the key maps back and reproduces from its seed', () => {
  const ws = tmpDir('cstack-sheet-');
  const files = probes(path.join(ws, 'work', 'probes'), ['terr-A-klein4b-1.png', 'terr-B-klein9b-2.png', 'terr-C-klein4b-3.png']);
  const r = makeSheet({ inputs: files, out: path.join(ws, 'work', 'sheets', 'blind.html'), blind: true, seed: 42 });
  const html = fs.readFileSync(r.html, 'utf8');
  for (const f of files) assert.ok(!html.includes(path.basename(f)), 'the page never names a source file');
  assert.ok(!fs.readFileSync(r.record, 'utf8').includes('klein'), 'nor does the record next to it');
  assert.deepEqual(fs.readdirSync(r.files_dir).sort(), ['A.png', 'B.png', 'C.png']);
  const key = JSON.parse(fs.readFileSync(r.key, 'utf8'));
  assert.equal(key.seed, 42);
  assert.deepEqual(key.items.map((x) => path.basename(x.src)), shuffle(files, 42).map((f) => path.basename(f)));
});

test('sheet import: picks become schema-valid pairwise feedback on the source files', () => {
  const ws = tmpDir('cstack-sheet-');
  const files = probes(path.join(ws, 'work', 'probes'), ['one.png', 'two.png', 'three.png']);
  const r = makeSheet({ inputs: files, out: path.join(ws, 'work', 'sheets', 's.html'), blind: true, seed: 3 });
  const key = JSON.parse(fs.readFileSync(r.key, 'utf8'));
  const picksFile = path.join(ws, 'picks.json');
  fs.writeFileSync(picksFile, JSON.stringify({ sheet: 's', blind: true, picks: [{ a: 'A', b: 'C', winner: 'b', margin: 'decisive', reason: 'holds the blue', at: '2026-10-05T03:00:00Z' }] }));
  const [fb] = importPicks({ picksFile, sheet: r.html, by: 'Owner', ws });
  assert.ok(validateValue('feedback-event', fb).ok);
  assert.equal(fb.pair.a, `work/probes/${path.basename(key.items[0].src)}`);
  assert.equal(fb.pair.b, `work/probes/${path.basename(key.items[2].src)}`);
  assert.equal(fb.context.scope, 'blind pairwise');
  assert.equal(fb.date, '2026-10-05');
  assert.throws(() => importPicks({ picksFile, sheet: r.html, ws }), /--by/);
  fs.writeFileSync(picksFile, JSON.stringify({ sheet: 's', picks: [{ a: 'A', b: 'Z', winner: 'a' }] }));
  assert.throws(() => importPicks({ picksFile, sheet: r.html, by: 'Owner', ws }), /"Z", which is not on the sheet/);
  fs.writeFileSync(picksFile, JSON.stringify({ sheet: 'other', picks: [] }));
  assert.throws(() => importPicks({ picksFile, sheet: r.html, by: 'Owner', ws }), /for sheet "other"/);
});

test('sheet make and import from the CLI write to the workspace', () => {
  const ws = path.join(tmpDir('cstack-sheet-'), 'ws');
  assert.equal(cli(['brand', 'init', ws, '--name', 'Sheetcase']).status, 0);
  probes(path.join(ws, 'work', 'probes'), ['x.png', 'y.png']);
  const made = cli(['sheet', 'make', path.join(ws, 'work', 'probes'), '--out', path.join(ws, 'work', 'sheets', 't.html'), '--blind', '--seed', '1']);
  assert.equal(made.status, 0, made.stderr);
  assert.match(made.stdout, /do not open it/);
  const picks = path.join(ws, 'p.json');
  fs.writeFileSync(picks, JSON.stringify({ sheet: 't', picks: [{ a: 'A', b: 'B', winner: 'a', margin: 'clear' }] }));
  const imp = cli(['sheet', 'import', picks, '--sheet', path.join(ws, 'work', 'sheets', 't.html'), '--by', 'Owner', '--ws', ws]);
  assert.equal(imp.status, 0, imp.stderr);
  assert.equal(readJSONL(path.join(ws, 'state', 'feedback.jsonl')).length, 1);
  assert.equal(cli(['brand', 'check', '--ws', ws]).status, 0);
});

test('sheet: renders to PNG and the pick mode records a pair in the browser', async () => {
  const ws = tmpDir('cstack-sheet-');
  probes(path.join(ws, 'p'), ['1.png', '2.png', '3.png']);
  const r = makeSheet({ inputs: [path.join(ws, 'p')], out: path.join(ws, 'sheet.html'), blind: true, seed: 9 });
  const png = await renderPNG(r.html, path.join(ws, 'sheet.png'));
  assert.equal(fs.readFileSync(png).subarray(1, 4).toString(), 'PNG');
  const { loadEngine, launch } = await import('../scripts/lib/browser/launch.mjs');
  const browser = await launch(await loadEngine());
  try {
    const page = await browser.newPage();
    await page.goto(`file://${r.html}`);
    await page.click('#toggle');
    await page.fill('#reason', 'quieter');
    await page.click('[data-w="a"]');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cstack-picks:sheet') || '[]'));
    assert.equal(stored.length, 1);
    assert.equal(stored[0].winner, 'a');
    assert.equal(stored[0].reason, 'quieter');
    assert.notEqual(stored[0].a, stored[0].b);
  } finally {
    await browser.close();
  }
});
