// cstack sheet: contact sheets for stills, and blind pairwise picks from them (docs/sheets.md).
// A sheet is one HTML page next to its images (relative links, nothing uploaded), optionally rendered to PNG with
// Chromium. In blind mode the page shows codes, never file names or models, and the code-to-file key goes to a
// sidecar the owner does not open. The page's pick mode shows random pairs and downloads picks.json; `cstack sheet
// import` turns those picks into feedback-event pairs, so the calibration in backlog P0 #3 and P1 #5 has data.
import fs from 'node:fs';
import path from 'node:path';
import { exists, writeAtomic, writeJSON, readJSON, sha256File, nowISO, today, newId } from './core.mjs';
import { imageSize } from './image.mjs';

const IMAGE = /\.(png|jpe?g|webp|gif|avif)$/i;

export function collectImages(inputs) {
  const out = [];
  for (const raw of inputs) {
    const p = path.resolve(String(raw));
    if (!exists(p)) throw new Error(`not found: ${p}`);
    if (fs.statSync(p).isDirectory()) {
      for (const f of fs.readdirSync(p).sort()) if (IMAGE.test(f) && fs.statSync(path.join(p, f)).isFile()) out.push(path.join(p, f));
    } else if (IMAGE.test(p)) out.push(p);
    else throw new Error(`not an image: ${p}`);
  }
  const uniq = [...new Set(out)];
  if (!uniq.length) throw new Error('no images found (png, jpg, webp, gif, avif)');
  return uniq;
}

// Small seeded PRNG so a blind order can be reproduced from its seed (recorded in the key).
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
export function shuffle(xs, seed) {
  const r = rng(seed);
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** "3x3" -> {cols: 3, rows: 3}; a grid image holds cols x rows candidate frames (Grid → Pick → Polish). */
export function parseGrid(g) {
  if (g === undefined || g === null || g === false) return null;
  const m = /^([1-6])x([1-6])$/i.exec(String(g).trim());
  if (!m) throw new Error(`--grid takes COLSxROWS from 1x1 to 6x6, like 2x2 or 3x3 (got "${g}")`);
  const grid = { cols: Number(m[1]), rows: Number(m[2]) };
  if (grid.cols * grid.rows < 2) throw new Error('--grid needs at least two cells');
  return grid;
}

/** Cells are numbered 1.. left to right, top to bottom; the code is "<image code>#<n>". */
export function gridCells(grid) {
  const out = [];
  for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) out.push({ n: r * grid.cols + c + 1, col: c, row: r });
  return out;
}

/** The cell as a fraction of the grid image, the shape a feedback-event `region` takes. */
export const cellRegion = (grid, n) => {
  const i = n - 1;
  const r = (v) => Math.round(v * 1e6) / 1e6;
  return { x: r((i % grid.cols) / grid.cols), y: r(Math.floor(i / grid.cols) / grid.rows), w: r(1 / grid.cols), h: r(1 / grid.rows), unit: 'fraction' };
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const code = (i) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`);

/**
 * makeSheet({inputs, out, title, cols, blind, seed, force})
 * Writes <out>.html, <out>.json (record with hashes) and, when blind, <out>.key.json plus code-named copies in
 * <out>.files/. Never overwrites without force.
 */
export function makeSheet({ inputs, out, title, cols = 4, blind = false, seed, force = false, grid: gridArg } = {}) {
  if (!out || out === true) throw new Error('--out <sheet.html> required');
  const grid = parseGrid(gridArg);
  const html = path.resolve(String(out).endsWith('.html') ? out : `${out}.html`);
  const stem = html.slice(0, -5);
  const files = { html, record: `${stem}.json`, key: `${stem}.key.json` };
  for (const f of [files.html, files.record, ...(blind ? [files.key] : [])]) if (exists(f) && !force) throw new Error(`${f} exists; pass --force to replace it`);
  const images = collectImages(inputs);
  for (const im of images) if (path.resolve(im) === html) throw new Error('the sheet cannot include itself');
  const s = Number.isFinite(Number(seed)) && seed !== undefined && seed !== true ? Number(seed) : Math.floor(Math.random() * 2 ** 31);
  const ordered = blind ? shuffle(images, s) : images;
  const dir = path.dirname(html);
  // blind sheets show copies named by code, so neither the page nor "open image" reveals a file name or model
  const filesDir = `${stem}.files`;
  if (blind) {
    if (exists(filesDir) && !force) throw new Error(`${filesDir} exists; pass --force to replace it`);
    fs.rmSync(filesDir, { recursive: true, force: true });
    fs.mkdirSync(filesDir, { recursive: true });
  }
  const items = ordered.map((f, i) => {
    let size = null;
    try {
      size = imageSize(f);
    } catch {
      /* unknown format: shown without a size */
    }
    const k = blind ? code(i) : path.basename(f);
    let shown = f;
    if (blind) {
      shown = path.join(filesDir, `${k}${path.extname(f).toLowerCase()}`);
      fs.copyFileSync(f, shown);
    }
    return { code: k, src: path.relative(dir, shown).split(path.sep).join('/'), source: path.relative(dir, f).split(path.sep).join('/'), file: f, sha256: sha256File(f), width: size?.width ?? null, height: size?.height ?? null };
  });
  // a grid sheet shows fewer, larger images: each one already holds several frames
  const c = Math.max(1, Math.min(12, Number(cols) || (grid ? 2 : 4)));
  const name = title && title !== true ? String(title) : path.basename(stem);
  writeAtomic(files.html, sheetHTML({ title: name, cols: c, blind, items, grid, sheetId: path.basename(stem) }));
  const record = { tool: 'cstack sheet', ts: nowISO(), title: name, blind, cols: c, ...(grid ? { grid } : {}), count: items.length, html: path.basename(files.html), items: blind ? items.map((it) => ({ code: it.code })) : items.map(({ file, source, ...x }) => x) };
  if (blind) {
    record.key = path.basename(files.key);
    writeJSON(files.key, { sheet: path.basename(files.html), seed: s, made: nowISO(), ...(grid ? { grid } : {}), items: items.map(({ code: k, source, sha256, width, height }) => ({ code: k, src: source, sha256, width, height })) });
  }
  writeJSON(files.record, record);
  return { ...files, ...(blind ? { files_dir: filesDir } : {}), count: items.length, ...(grid ? { grid, cells: items.length * grid.cols * grid.rows } : {}), blind, seed: blind ? s : null };
}

const REASONS = ['composition', 'mood', 'light', 'product read', 'casting and styling', 'idea'];

function sheetHTML({ title, cols, blind, items, grid, sheetId }) {
  const overlay = (it) =>
    grid
      ? `<div class="cells" style="grid-template-columns:repeat(${grid.cols},1fr);grid-template-rows:repeat(${grid.rows},1fr)">${gridCells(grid)
          .map((c) => `<button type="button" class="unit" data-unit="${esc(`${it.code}#${c.n}`)}" aria-label="${esc(`${it.code} frame ${c.n}`)}"><span>${c.n}</span></button>`)
          .join('')}</div>`
      : `<button type="button" class="unit whole" data-unit="${esc(it.code)}" aria-label="${esc(it.code)}"></button>`;
  const cells = items
    .map((it) => `<figure data-code="${esc(it.code)}"><div class="frame-wrap"><img src="${esc(it.src)}" alt="${esc(it.code)}" loading="lazy">${overlay(it)}</div><figcaption>${esc(it.code)}${it.width ? ` <span>${it.width}×${it.height}</span>` : ''}</figcaption></figure>`)
    .join('\n');
  // what can be picked: whole images, or each frame of a grid image
  const units = items.flatMap((it) =>
    grid
      ? gridCells(grid).map((c) => ({ code: `${it.code}#${c.n}`, src: it.src, w: it.width, h: it.height, cell: { col: c.col, row: c.row } }))
      : [{ code: it.code, src: it.src, w: it.width, h: it.height }],
  );
  const data = JSON.stringify({ sheet: sheetId, blind, grid: grid ?? null, reasons: REASONS, units }).replace(/</g, '\\u003c');
  const what = grid ? `${items.length} grid image${items.length === 1 ? '' : 's'}, ${units.length} frames` : `${items.length} images`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#f6f4ef;--fg:#111;--mute:#666;--line:#ddd;--accent:#002fa7;--on:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#eee;--mute:#999;--line:#333;--accent:#7f9cff;--on:#111}}
*{box-sizing:border-box}body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,sans-serif}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:baseline;justify-content:space-between;margin-bottom:12px}
h1{font-size:18px;margin:0}p{margin:0;color:var(--mute)}
.how{border:1px solid var(--line);padding:10px 12px;margin:0 0 12px}.how ol{margin:4px 0 0;padding-left:20px}
.grid{display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:8px}
@media (max-width:640px){.grid{grid-template-columns:repeat(${grid ? 1 : 2},minmax(0,1fr))}}
figure{margin:0}img{display:block;width:100%;height:auto;background:var(--line)}
.frame-wrap{position:relative}
.cells{position:absolute;inset:0;display:grid}
.unit{position:absolute;inset:0;background:transparent;border:0;padding:0;cursor:pointer}
.cells .unit{position:relative;inset:auto;outline:1px solid rgba(255,255,255,.35)}
.cells .unit span{position:absolute;left:4px;top:4px;background:rgba(0,0,0,.6);color:#fff;font-size:11px;padding:1px 5px}
.unit.on{outline:4px solid var(--accent);outline-offset:-4px}
.unit.on span{background:var(--accent)}
figcaption{font-size:12px;padding:4px 0;font-weight:600}figcaption span{font-weight:400;color:var(--mute)}
button{font:inherit}
.btn{padding:8px 12px;border:1px solid var(--line);background:transparent;color:var(--fg);cursor:pointer}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--on)}
#winners{border:1px solid var(--line);padding:10px 12px;margin:0 0 12px}
#winners .w{display:grid;grid-template-columns:96px 1fr;gap:10px;margin:8px 0;align-items:start}
.thumb{width:96px;background-repeat:no-repeat;background-color:var(--line)}
#winners label{margin-right:10px;white-space:nowrap}
#winners input[type=text]{width:100%;margin-top:6px}
#pick{display:none}#pick .pair{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}
#pick .pair .big{width:100%;max-height:70vh;background-repeat:no-repeat;background-color:var(--line)}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}
input[type=text]{flex:1;min-width:200px;font:inherit;padding:8px;border:1px solid var(--line);background:transparent;color:var(--fg)}
body.picking #sheet,body.picking #winners{display:none}body.picking #pick{display:block}
</style></head><body>
<header><div><h1>${esc(title)}</h1><p>${what}${blind ? ' · blind: codes only, no file names or models' : ''}</p></div>
<div class="controls"><button id="toggle" class="btn">Pick pairs</button> <button id="download" class="btn primary">Download picks.json</button></div></header>
<section class="how controls"><strong>How to pick</strong><ol>
<li>Click the ${grid ? 'frames' : 'images'} you would take further, up to three. Click again to drop one.</li>
<li>Tick why each one won, and add a line if you like.</li>
<li>Press <em>Download picks.json</em> and send the file back (or run <code>cstack sheet import</code>).</li>
</ol><p><em>Pick pairs</em> is optional: it shows two at a time, for calibrating the reviewers.</p></section>
<section id="winners" class="controls"><strong id="wcount">No winners picked yet.</strong><div id="wlist"></div></section>
<main id="sheet" class="grid">
${cells}
</main>
<section id="pick">
<p id="count"></p>
<div class="pair"><figure><div id="la" class="big"></div><figcaption id="lc"></figcaption></figure><figure><div id="ra" class="big"></div><figcaption id="rc"></figcaption></figure></div>
<div class="row"><button class="btn" data-w="a">Left wins</button><button class="btn" data-w="b">Right wins</button><button class="btn" data-w="tie">Tie</button><button class="btn" data-w="neither">Neither</button>
<select id="margin" aria-label="margin"><option value="clear">clear</option><option value="slight">slight</option><option value="decisive">decisive</option></select></div>
<div class="row"><input id="reason" type="text" placeholder="Why the winner won (optional, one line)"></div>
<div class="row"><button id="undo" class="btn">Undo last</button><span id="saved"></span></div>
</section>
<script>
const SHEET=${data};
const KEY='cstack-picks:'+SHEET.sheet,WKEY=KEY+':winners',MAX=3;
const load=(k)=>{try{return JSON.parse(localStorage.getItem(k)||'[]')}catch(e){return []}};
let picks=load(KEY),winners=load(WKEY);
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(picks));localStorage.setItem(WKEY,JSON.stringify(winners))}catch(e){}};
const $=(id)=>document.getElementById(id);
const byCode=new Map(SHEET.units.map(u=>[u.code,u]));
// show one unit (a whole image, or one frame of a grid) in a box, cropped in the browser
function paint(el,u){
  const g=SHEET.grid,w=u.w||1,h=u.h||1;
  el.style.backgroundImage='url("'+u.src+'")';
  if(g&&u.cell){
    el.style.backgroundSize=(g.cols*100)+'% '+(g.rows*100)+'%';
    el.style.backgroundPosition=(g.cols>1?u.cell.col/(g.cols-1)*100:0)+'% '+(g.rows>1?u.cell.row/(g.rows-1)*100:0)+'%';
    el.style.aspectRatio=(w/g.cols)/(h/g.rows);
  }else{el.style.backgroundSize='contain';el.style.backgroundPosition='center';el.style.aspectRatio=w/h}
}
function renderWinners(){
  document.querySelectorAll('.unit').forEach(b=>b.classList.toggle('on',winners.some(x=>x.code===b.dataset.unit)));
  $('wcount').textContent=winners.length?winners.length+' of '+MAX+' winners picked':'No winners picked yet.';
  const list=$('wlist');list.textContent='';
  winners.forEach(win=>{
    const row=document.createElement('div');row.className='w';
    const t=document.createElement('div');t.className='thumb';paint(t,byCode.get(win.code));row.appendChild(t);
    const right=document.createElement('div');
    const head=document.createElement('div');head.innerHTML='<strong></strong>';head.firstChild.textContent=win.code;right.appendChild(head);
    const boxes=document.createElement('div');
    SHEET.reasons.forEach(r=>{const l=document.createElement('label');const c=document.createElement('input');c.type='checkbox';c.checked=win.reason_codes.includes(r);
      c.onchange=()=>{win.reason_codes=c.checked?[...win.reason_codes,r]:win.reason_codes.filter(x=>x!==r);save()};l.appendChild(c);l.append(' '+r);boxes.appendChild(l)});
    right.appendChild(boxes);
    const line=document.createElement('input');line.type='text';line.placeholder='Why this one (optional, one line)';line.value=win.reason||'';line.oninput=()=>{win.reason=line.value;save()};
    right.appendChild(line);row.appendChild(right);list.appendChild(row);
  });
}
document.querySelectorAll('.unit').forEach(b=>b.onclick=()=>{
  const c=b.dataset.unit,i=winners.findIndex(x=>x.code===c);
  if(i>=0)winners.splice(i,1);
  else if(winners.length>=MAX){$('wcount').textContent='Three winners already: click one to drop it first.';return}
  else winners.push({code:c,reason_codes:[],reason:'',at:new Date().toISOString()});
  save();renderWinners();
});
let cur=null;
function next(){
  const n=SHEET.units.length;if(n<2){$('count').textContent='A pair needs two images.';return}
  const seen=new Set(picks.map(p=>[p.a,p.b].sort().join('|')));
  let tries=0,a,b;do{a=Math.floor(Math.random()*n);b=Math.floor(Math.random()*n);tries++}while((a===b||seen.has([SHEET.units[a].code,SHEET.units[b].code].sort().join('|')))&&tries<500);
  cur=[SHEET.units[a],SHEET.units[b]];
  paint($('la'),cur[0]);paint($('ra'),cur[1]);$('lc').textContent=cur[0].code;$('rc').textContent=cur[1].code;
  $('count').textContent=picks.length+' pair'+(picks.length===1?'':'s')+' so far';$('reason').value='';
}
document.querySelectorAll('[data-w]').forEach(btn=>btn.onclick=()=>{
  picks.push({a:cur[0].code,b:cur[1].code,winner:btn.dataset.w,margin:$('margin').value,reason:$('reason').value.trim(),at:new Date().toISOString()});save();next();
});
$('undo').onclick=()=>{picks.pop();save();next()};
$('toggle').onclick=()=>{const on=document.body.classList.toggle('picking');$('toggle').textContent=on?'Back to winners':'Pick pairs';if(on)next()};
$('download').onclick=()=>{
  const out={sheet:SHEET.sheet,blind:SHEET.blind,...(SHEET.grid?{grid:SHEET.grid}:{}),winners:winners.map(w=>({...w,reason:(w.reason||'').trim()})),picks};
  const blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'});
  const u=URL.createObjectURL(blob);const l=document.createElement('a');l.href=u;l.download=SHEET.sheet+'.picks.json';l.click();URL.revokeObjectURL(u);
  $('saved').textContent='saved '+winners.length+' winner(s) and '+picks.length+' pair(s)';
  $('wcount').textContent='Saved '+SHEET.sheet+'.picks.json with '+winners.length+' winner(s) and '+picks.length+' pair(s).';
};
renderWinners();
</script>
</body></html>
`;
}

/**
 * importPicks({picksFile, sheet, by, brand_id, ws}) -> feedback-event records, codes mapped back to files: one `approve`
 * per winner (with `reason_codes`, and `region` for a frame of a grid image), then one `pairwise` per pair.
 * sheet: the sheet's .html (its .key.json is read for blind sheets; open sheets use file names as codes).
 */
export function importPicks({ picksFile, sheet, by, brand_id, ws }) {
  if (!by || by === true) throw new Error('--by <name> required: picks are the owner’s, and the record says whose');
  const picks = readJSON(path.resolve(picksFile));
  const html = path.resolve(sheet);
  const stem = html.replace(/\.html$/, '');
  const blind = exists(`${stem}.key.json`);
  const record = exists(`${stem}.json`) ? readJSON(`${stem}.json`) : null;
  const key = blind ? readJSON(`${stem}.key.json`) : null;
  if (picks.sheet && picks.sheet !== path.basename(stem)) throw new Error(`these picks are for sheet "${picks.sheet}", not "${path.basename(stem)}"`);
  const items = blind ? key.items : record?.items ?? [];
  const grid = (blind ? key.grid : record?.grid) ?? null;
  const byCode = new Map(items.map((it) => [it.code, it]));
  // "A#3" is frame 3 of grid image A; a pair or winner on a grid sheet names the image and its frame
  const split = (c) => {
    const m = /^(.*)#(\d+)$/.exec(String(c));
    if (!m || !grid) return { base: String(c), n: null };
    const n = m[1] ? Number(m[2]) : NaN;
    if (!(n >= 1 && n <= grid.cols * grid.rows)) throw new Error(`pick names "${c}", which is not on the sheet`);
    return { base: m[1], n };
  };
  const ref = (c) => {
    const { base, n } = split(c);
    const it = byCode.get(base);
    if (!it) throw new Error(`pick names "${c}", which is not on the sheet`);
    const abs = path.resolve(path.dirname(html), it.src);
    const file = ws ? path.relative(ws, abs).split(path.sep).join('/') : abs;
    return n ? `${file}#${n}` : file;
  };
  const sheetRef = ws ? path.relative(ws, html).split(path.sep).join('/') : html;
  const winners = (picks.winners ?? []).map((w) => {
    const { n } = split(w.code);
    const file = ref(w.code).replace(/#\d+$/, '');
    const codes = (w.reason_codes ?? []).map(String).filter(Boolean);
    return {
      id: newId('FB'),
      date: String(w.at ?? '').slice(0, 10) || today(),
      by: String(by),
      ...(brand_id ? { brand_id } : {}),
      type: 'approve',
      artifact_ref: file,
      ...(n ? { region: cellRegion(grid, n) } : {}),
      ...(w.reason ? { reason: String(w.reason) } : {}),
      ...(codes.length ? { reason_codes: codes } : {}),
      context: { surface: n ? `contact sheet ${sheetRef}, frame ${n} of a ${grid.cols}x${grid.rows} grid` : `contact sheet ${sheetRef}`, scope: blind ? 'blind winner pick' : 'winner pick' },
    };
  });
  if (winners.length > 3) throw new Error(`${winners.length} winners: a pick is one to three, so the polish pass stays small`);
  const pairs = (picks.picks ?? []).map((p) => ({
    id: newId('FB'),
    date: String(p.at ?? '').slice(0, 10) || today(),
    by: String(by),
    ...(brand_id ? { brand_id } : {}),
    type: 'pairwise',
    artifact_ref: sheetRef,
    pair: { a: ref(p.a), b: ref(p.b), winner: p.winner, ...(p.margin ? { margin: p.margin } : {}) },
    ...(p.reason ? { reason: String(p.reason) } : {}),
    context: { surface: 'contact sheet', scope: blind ? 'blind pairwise' : 'pairwise' },
  }));
  return [...winners, ...pairs];
}

// The sheet as a PNG for places that take an image (a gate record, a message): Chromium, local file only.
export async function renderPNG(html, png, { width = 1440, force = false } = {}) {
  if (exists(png) && !force) throw new Error(`${png} exists; pass --force to replace it`);
  const { loadEngine, launch } = await import('./browser/launch.mjs');
  const eng = await loadEngine();
  const browser = await launch(eng);
  try {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
    await page.goto(`file://${path.resolve(html)}`, { waitUntil: 'load' });
    await page.evaluate(() => Promise.all([...document.images].map((i) => (i.loading = 'eager', i.complete ? null : new Promise((r) => (i.onload = i.onerror = r))))));
    await page.evaluate(() => document.querySelectorAll('.controls').forEach((el) => el.remove()));
    await page.screenshot({ path: png, fullPage: true });
  } finally {
    await browser.close().catch(() => {});
  }
  return png;
}
