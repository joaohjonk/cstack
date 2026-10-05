// cstack sheet: contact sheets for stills and blind pairwise picks (F22; backlog P0 #3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, readJSONL } from '../scripts/lib/core.mjs';
import { encodePNG } from '../scripts/lib/image/png.mjs';
import { makeSheet, makeBoard, importPicks, renderPNG, shuffle } from '../scripts/lib/sheet.mjs';
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

test('sheet --grid: each grid image offers its frames; winners import as approvals with why and the frame region (F63)', () => {
  const ws = tmpDir('cstack-sheet-');
  const files = probes(path.join(ws, 'work', 'grids'), ['g1.png', 'g2.png']);
  assert.throws(() => makeSheet({ inputs: files, out: path.join(ws, 'x.html'), grid: '3by3' }), /COLSxROWS/);
  const r = makeSheet({ inputs: files, out: path.join(ws, 'work', 'sheets', 'grid.html'), blind: true, seed: 5, grid: '3x3' });
  assert.equal(r.cells, 18);
  const html = fs.readFileSync(r.html, 'utf8');
  assert.match(html, /data-unit="A#9"/);
  assert.match(html, /How to pick/);
  const picksFile = path.join(ws, 'picks.json');
  fs.writeFileSync(picksFile, JSON.stringify({ sheet: 'grid', blind: true, grid: { cols: 3, rows: 3 }, winners: [{ code: 'B#5', reason_codes: ['composition', 'product read'], reason: 'the can reads first', at: '2026-10-05T16:00:00Z' }], picks: [{ a: 'A#1', b: 'B#5', winner: 'b', margin: 'clear' }] }));
  const recs = importPicks({ picksFile, sheet: r.html, by: 'Owner', ws });
  for (const rec of recs) assert.ok(validateValue('feedback-event', rec).ok, JSON.stringify(rec));
  const [win, pair] = recs;
  const key = JSON.parse(fs.readFileSync(r.key, 'utf8'));
  assert.equal(win.type, 'approve');
  assert.equal(win.artifact_ref, `work/grids/${path.basename(key.items[1].src)}`);
  assert.deepEqual(win.region, { x: 0.333333, y: 0.333333, w: 0.333333, h: 0.333333, unit: 'fraction' });
  assert.deepEqual(win.reason_codes, ['composition', 'product read']);
  assert.equal(win.context.scope, 'blind winner pick');
  assert.equal(pair.pair.b, `work/grids/${path.basename(key.items[1].src)}#5`);
  fs.writeFileSync(picksFile, JSON.stringify({ sheet: 'grid', winners: [{ code: 'A#10' }] }));
  assert.throws(() => importPicks({ picksFile, sheet: r.html, by: 'Owner', ws }), /"A#10", which is not on the sheet/);
  fs.writeFileSync(picksFile, JSON.stringify({ sheet: 'grid', winners: ['A#1', 'A#2', 'A#3', 'A#4'].map((code) => ({ code })) }));
  assert.throws(() => importPicks({ picksFile, sheet: r.html, by: 'Owner', ws }), /one to three/);
});

test('sheet make and open print where the page is and how to pick (F62)', () => {
  const ws = tmpDir('cstack-sheet-');
  probes(path.join(ws, 'p'), ['1.png', '2.png']);
  const out = path.join(ws, 's.html');
  const made = cli(['sheet', 'make', path.join(ws, 'p'), '--out', out]);
  assert.equal(made.status, 0, made.stderr);
  assert.match(made.stdout, /file:\/\/\S+s\.html/);
  assert.match(made.stdout, /click up to three winners/);
  const opened = cli(['sheet', 'open', out, '--print-only']);
  assert.equal(opened.status, 0, opened.stderr);
  assert.match(opened.stdout, /Download picks\.json/);
  assert.notEqual(cli(['sheet', 'open', path.join(ws, 'nope.html'), '--print-only']).status, 0);
});

test('sheet: a click on a grid frame picks it as a winner, with its reasons, in the browser', async () => {
  const ws = tmpDir('cstack-sheet-');
  probes(path.join(ws, 'p'), ['1.png', '2.png']);
  const r = makeSheet({ inputs: [path.join(ws, 'p')], out: path.join(ws, 'gsheet.html'), blind: true, seed: 2, grid: '2x2' });
  const { loadEngine, launch } = await import('../scripts/lib/browser/launch.mjs');
  const browser = await launch(await loadEngine());
  try {
    const page = await browser.newPage();
    await page.goto(`file://${r.html}`);
    await page.click('[data-unit="B#3"]');
    await page.check('#wlist input[type=checkbox] >> nth=0');
    await page.fill('#wlist input[type=text]', 'calm');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cstack-picks:gsheet:winners') || '[]'));
    assert.equal(stored.length, 1);
    assert.equal(stored[0].code, 'B#3');
    assert.deepEqual(stored[0].reason_codes, ['composition']);
    assert.equal(stored[0].reason, 'calm');
    assert.match(await page.textContent('#wcount'), /1 of 3/);
    await page.click('#toggle');
    assert.match(await page.textContent('#lc'), /^[AB]#[1-4]$/);
  } finally {
    await browser.close();
  }
});

function refRecord(file, id, extra = '') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `id: ${id}\nkind: image\nlibrary: inspiration\nrights:\n  status: inspiration_only\ntransferable_mechanism: one hard edge against grain\n${extra}`);
}

test('sheet board: keep and kill on references import as gold and anti on the reference files (F65)', () => {
  const ws = path.join(tmpDir('cstack-board-'), 'ws');
  assert.equal(cli(['brand', 'init', ws, '--name', 'Boardcase']).status, 0);
  probes(path.join(ws, 'references', 'inspiration'), ['shelf.png']);
  refRecord(path.join(ws, 'references', 'inspiration', 'tall-poster.reference.yaml'), 'ref-tall-poster', 'local_path: references/inspiration/shelf.png\n');
  refRecord(path.join(ws, 'references', 'anti', 'loud.reference.yaml'), 'ref-loud', 'uri: https://example.com/loud\n');
  const out = path.join(ws, 'work', 'sheets', 'refs.html');
  const made = cli(['sheet', 'board', path.join(ws, 'references'), '--out', out]);
  assert.equal(made.status, 0, made.stderr);
  assert.match(made.stdout, /3 references/);
  assert.match(made.stdout, /Keep or Kill/);
  const html = fs.readFileSync(out, 'utf8');
  assert.match(html, /data-code="ref-tall-poster"/);
  assert.match(html, /src="\.\.\/\.\.\/references\/inspiration\/shelf\.png"/);
  assert.match(html, /href="https:\/\/example\.com\/loud"/);
  const picks = path.join(ws, 'p.json');
  fs.writeFileSync(picks, JSON.stringify({ sheet: 'refs', board: true, reactions: [{ code: 'ref-tall-poster', verdict: 'keep', reason: 'one big picture', at: '2026-10-05T16:30:00Z' }, { code: 'ref-loud', verdict: 'kill' }] }));
  const imp = cli(['sheet', 'import', picks, '--sheet', out, '--by', 'Founder', '--ws', ws]);
  assert.equal(imp.status, 0, imp.stderr);
  assert.match(imp.stdout, /1 keep\(s\) and 1 kill\(s\)/);
  const rows = readJSONL(path.join(ws, 'state', 'feedback.jsonl'));
  assert.deepEqual(rows.map((r) => [r.type, r.artifact_ref]), [['gold', 'references/inspiration/tall-poster.reference.yaml'], ['anti', 'references/anti/loud.reference.yaml']]);
  assert.equal(rows[0].reason, 'one big picture');
  for (const r of rows) assert.ok(validateValue('feedback-event', r).ok);
  assert.equal(cli(['brand', 'check', '--ws', ws]).status, 0);
  fs.writeFileSync(picks, JSON.stringify({ sheet: 'refs', reactions: [{ code: 'ref-loud', verdict: 'maybe' }] }));
  assert.notEqual(cli(['sheet', 'import', picks, '--sheet', out, '--by', 'Founder', '--ws', ws]).status, 0);
});

test('sheet board: Keep and Kill toggle in the browser and the download carries the why', async () => {
  const ws = tmpDir('cstack-board-');
  refRecord(path.join(ws, 'refs', 'a.reference.yaml'), 'ref-a');
  refRecord(path.join(ws, 'refs', 'b.reference.yaml'), 'ref-b', 'uri: "javascript:alert(1)"\n');
  const r = makeBoard({ inputs: [path.join(ws, 'refs')], out: path.join(ws, 'board.html') });
  assert.ok(!fs.readFileSync(r.html, 'utf8').includes('javascript:'), 'only http(s) links are rendered');
  const { loadEngine, launch } = await import('../scripts/lib/browser/launch.mjs');
  const browser = await launch(await loadEngine());
  try {
    const page = await browser.newPage();
    await page.goto(`file://${r.html}`);
    await page.click('article[data-code="ref-a"] [data-v="keep"]');
    await page.fill('article[data-code="ref-a"] input', 'calm');
    await page.click('article[data-code="ref-b"] [data-v="kill"]');
    await page.click('article[data-code="ref-b"] [data-v="kill"]');
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('cstack-board:board') || '{}'));
    assert.equal(state['ref-a'].verdict, 'keep');
    assert.equal(state['ref-a'].reason, 'calm');
    assert.equal(state['ref-b'].verdict, null);
    assert.match(await page.textContent('#count'), /1 kept, 0 killed/);
  } finally {
    await browser.close();
  }
});
