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

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const code = (i) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`);

/**
 * makeSheet({inputs, out, title, cols, blind, seed, force})
 * Writes <out>.html, <out>.json (record with hashes) and, when blind, <out>.key.json plus code-named copies in
 * <out>.files/. Never overwrites without force.
 */
export function makeSheet({ inputs, out, title, cols = 4, blind = false, seed, force = false } = {}) {
  if (!out || out === true) throw new Error('--out <sheet.html> required');
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
  const c = Math.max(1, Math.min(12, Number(cols) || 4));
  const name = title && title !== true ? String(title) : path.basename(stem);
  writeAtomic(files.html, sheetHTML({ title: name, cols: c, blind, items, sheetId: path.basename(stem) }));
  const record = { tool: 'cstack sheet', ts: nowISO(), title: name, blind, cols: c, count: items.length, html: path.basename(files.html), items: blind ? items.map((it) => ({ code: it.code })) : items.map(({ file, source, ...x }) => x) };
  if (blind) {
    record.key = path.basename(files.key);
    writeJSON(files.key, { sheet: path.basename(files.html), seed: s, made: nowISO(), items: items.map(({ code: k, source, sha256, width, height }) => ({ code: k, src: source, sha256, width, height })) });
  }
  writeJSON(files.record, record);
  return { ...files, ...(blind ? { files_dir: filesDir } : {}), count: items.length, blind, seed: blind ? s : null };
}

function sheetHTML({ title, cols, blind, items, sheetId }) {
  const cells = items
    .map((it) => `<figure data-code="${esc(it.code)}"><img src="${esc(it.src)}" alt="${esc(it.code)}" loading="lazy"><figcaption>${esc(it.code)}${it.width ? ` <span>${it.width}×${it.height}</span>` : ''}</figcaption></figure>`)
    .join('\n');
  const data = JSON.stringify({ sheet: sheetId, blind, items: items.map((it) => ({ code: it.code, src: it.src })) }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#f6f4ef;--fg:#111;--mute:#666;--line:#ddd;--accent:#002fa7}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#eee;--mute:#999;--line:#333;--accent:#7f9cff}}
*{box-sizing:border-box}body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,sans-serif}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:baseline;justify-content:space-between;margin-bottom:12px}
h1{font-size:18px;margin:0}p{margin:0;color:var(--mute)}
.grid{display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:8px}
@media (max-width:640px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
figure{margin:0}img{display:block;width:100%;height:auto;background:var(--line)}
figcaption{font-size:12px;padding:4px 0;font-weight:600}figcaption span{font-weight:400;color:var(--mute)}
button{font:inherit;padding:8px 12px;border:1px solid var(--line);background:transparent;color:var(--fg);cursor:pointer}
button.primary{background:var(--accent);border-color:var(--accent);color:#fff}
#pick{display:none}#pick .pair{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}
#pick .pair img{max-height:70vh;object-fit:contain}
#pick .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}
input[type=text]{flex:1;min-width:200px;font:inherit;padding:8px;border:1px solid var(--line);background:transparent;color:var(--fg)}
body.picking #sheet{display:none}body.picking #pick{display:block}
</style></head><body>
<header><div><h1>${esc(title)}</h1><p>${items.length} images${blind ? ' · blind: codes only, no file names or models' : ''}</p></div>
<div><button id="toggle" class="primary">Pick pairs</button></div></header>
<main id="sheet" class="grid">
${cells}
</main>
<section id="pick">
<p id="count"></p>
<div class="pair"><figure><img id="la" alt=""><figcaption id="lc"></figcaption></figure><figure><img id="ra" alt=""><figcaption id="rc"></figcaption></figure></div>
<div class="row"><button data-w="a">Left wins</button><button data-w="b">Right wins</button><button data-w="tie">Tie</button><button data-w="neither">Neither</button>
<select id="margin" aria-label="margin"><option value="clear">clear</option><option value="slight">slight</option><option value="decisive">decisive</option></select></div>
<div class="row"><input id="reason" type="text" placeholder="Why the winner won (optional, one line)"></div>
<div class="row"><button id="download" class="primary">Download picks.json</button><button id="undo">Undo last</button><span id="saved"></span></div>
</section>
<script>
const SHEET=${data};
const KEY='cstack-picks:'+SHEET.sheet;
let picks=[];try{picks=JSON.parse(localStorage.getItem(KEY)||'[]')}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(picks))}catch(e){}};
const $=(id)=>document.getElementById(id);
let cur=null;
function next(){
  const n=SHEET.items.length;if(n<2){$('count').textContent='A pair needs two images.';return}
  const seen=new Set(picks.map(p=>[p.a,p.b].sort().join('|')));
  let tries=0,a,b;do{a=Math.floor(Math.random()*n);b=Math.floor(Math.random()*n);tries++}while((a===b||seen.has([SHEET.items[a].code,SHEET.items[b].code].sort().join('|')))&&tries<500);
  cur=[SHEET.items[a],SHEET.items[b]];
  $('la').src=cur[0].src;$('ra').src=cur[1].src;$('lc').textContent=cur[0].code;$('rc').textContent=cur[1].code;
  $('count').textContent=picks.length+' pick'+(picks.length===1?'':'s')+' so far';$('reason').value='';
}
document.querySelectorAll('[data-w]').forEach(btn=>btn.onclick=()=>{
  picks.push({a:cur[0].code,b:cur[1].code,winner:btn.dataset.w,margin:$('margin').value,reason:$('reason').value.trim(),at:new Date().toISOString()});save();next();
});
$('undo').onclick=()=>{picks.pop();save();next()};
$('toggle').onclick=()=>{const on=document.body.classList.toggle('picking');$('toggle').textContent=on?'Back to sheet':'Pick pairs';if(on)next()};
$('download').onclick=()=>{
  const blob=new Blob([JSON.stringify({sheet:SHEET.sheet,blind:SHEET.blind,picks},null,2)],{type:'application/json'});
  const u=URL.createObjectURL(blob);const l=document.createElement('a');l.href=u;l.download=SHEET.sheet+'.picks.json';l.click();URL.revokeObjectURL(u);
  $('saved').textContent='saved '+picks.length+' pick(s)';
};
</script>
</body></html>
`;
}

/**
 * importPicks({picksFile, sheet, by, brand_id, ws}) -> feedback-event records (pairwise), codes mapped back to files.
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
  const byCode = new Map(items.map((it) => [it.code, it]));
  const ref = (c) => {
    const it = byCode.get(c);
    if (!it) throw new Error(`pick names "${c}", which is not on the sheet`);
    const abs = path.resolve(path.dirname(html), it.src);
    return ws ? path.relative(ws, abs).split(path.sep).join('/') : abs;
  };
  const sheetRef = ws ? path.relative(ws, html).split(path.sep).join('/') : html;
  return (picks.picks ?? []).map((p) => ({
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
    await page.evaluate(() => document.getElementById('toggle')?.remove());
    await page.screenshot({ path: png, fullPage: true });
  } finally {
    await browser.close().catch(() => {});
  }
  return png;
}
