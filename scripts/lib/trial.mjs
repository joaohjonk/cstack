// cstack trial: does a brand replicate? Agent teams that get only the brand's files answer simulated real-world
// problems (trials/scenarios/), a control team answers the same problems with the brand's name and one line and none
// of its files, and the owner attributes the mixed, shuffled work blind. Brand work attributed far more often than
// control work, and two brand teams judged the same brand, is the evidence that the system carries the brand.
//   plan   pick scenarios and teams, price the generation round against a floor and a hard cap
//   run    each team's roles, one agent session per role, in a fresh workspace per team and scenario
//   score  collect the applications, build the blind attribution sheet and the cross-team pairs sheet
//   import read the owner's taps and write the report
// Media spend is capped per workspace through the normal budget envelope, so the cap holds even if an agent misbehaves.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { ROOT, exists, readData, readJSON, writeJSON, writeAtomic, sha256, sha256File, nowISO, today, walk } from './core.mjs';
import { validateValue } from './schemas.mjs';
import { isLimit } from './evalrun.mjs';

export const SCENARIO_DIR = path.join(ROOT, 'trials', 'scenarios');
const SCN = /\.scenario\.ya?ml$/;
const SHOWN = /\.(png|jpe?g|webp|gif|avif|svg)$/i;
// generated pictures an application may use when the scenario does not say
const PICTURES = { picture: 4, mockup: 2, vector: 0, page: 0, copy: 0 };

export function listScenarios(dir = SCENARIO_DIR) {
  if (!exists(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => SCN.test(f))
    .sort()
    .map((f) => ({ ...readData(path.join(dir, f)), file: path.join(dir, f) }));
}

// The roles of one team, in order. Each reads the files before it and writes one; the skills named are cstack's own.
export const ROLES = [
  { id: 'strategist', skills: ['creative-strategist', 'competitor-intel'], writes: 'trial/problem.md', job: 'Read the scenario and the brand files. Write what the situation actually needs, the constraint that makes it hard, which brand rules decide it, and what the asker will check. No designs yet.' },
  { id: 'art-director', skills: ['creative-direction', 'campaign-sequence', 'shot-dna'], writes: 'trial/direction.md', job: "Choose one move for this scenario from the brand's own territory and rules (never a new style). For each application say what it shows, which brand elements carry it, and what stays fixed across all of them." },
  { id: 'challenger', skills: ['creative-review', 'creative-strategist'], writes: 'trial/challenge.md', job: "Argue against the art director's direction before anything is made (creative-review references/challenge.md): name what it plays safe, propose one braver version inside the brand's beliefs, and ask one question each on price, claim and positioning. Matching the brand's habits is not enough; push for better work, not a new style." },
  { id: 'decider', skills: ['creative-direction'], writes: 'trial/decision.md', job: 'You are the art director again. Read the challenge and decide: keep your direction, adopt the braver version, or merge them, and say why in three lines. Everyone after you follows this decision.' },
  { id: 'copywriter', skills: ['copywriting', 'claims-proof'], writes: 'trial/copy.md', job: "Write every line that appears on every application, in the brand's voice, with any claim checked against the brand's proof. One line per string, grouped by application id; these lines are what the text check expects." },
  { id: 'producer', skills: ['asset-factory', 'model-router'], writes: 'trial/plan.json', job: 'Decide how each application is made, cheapest first: flat artwork with real type, a generated picture only where a picture goes, a mockup by template. Price it with cstack spend plan. Write {"applications":[{"id","method","pictures","est_usd"}]} and stay inside this workspace budget.' },
  { id: 'makers', skills: ['vector-master', 'prompt-director', 'generate-media', 'mockup'], writes: 'trial/out/manifest.json', job: 'Make each application as planned into trial/out/: SVG or PNG, one file per application named <application id>.<ext>. Pictures go through cstack generate under this workspace budget. Lettering is set as real type in the artwork, never asked of the image model. Write trial/out/manifest.json: {"applications":[{"id","file","method"}]}.' },
  { id: 'reviewer', skills: ['brand-verify', 'creative-review'], writes: 'trial/review.json', job: 'Check every application against the brand files: deterministic gates first (colour tokens, type, mark clear space, required elements, cstack image text --expect with the copy lines on anything with lettering), then judgment. Allow one fix round by editing or remaking the file. Write {"applications":[{"id","pass":true|false,"gates":[{"name","result","detail"}]}]}.' },
];

// What a brand team may see: the brand's system, never its working state, ledgers or secrets.
const BRAND_PARTS = ['cstack.config.yaml', 'brand', 'assets', 'references', 'recipes', 'briefs'];
const SECRET = /(^|[\\/])(\.env[^\\/]*|.*\.(key|pem|p12))$/i;
const MAX_FILE = 50 * 1024 * 1024;

export function brandFiles(ws) {
  if (!exists(path.join(ws, 'cstack.config.yaml'))) throw new Error(`${ws} is not a brand workspace (no cstack.config.yaml)`);
  if (!exists(path.join(ws, 'brand'))) throw new Error(`${ws} has no brand/ folder: a trial needs the brand's system to hand the teams`);
  const out = [];
  for (const part of BRAND_PARTS) {
    const p = path.join(ws, part);
    if (!exists(p)) continue;
    const files = fs.statSync(p).isDirectory() ? walk(p) : [p];
    for (const f of files) {
      const r = path.relative(ws, f);
      if (SECRET.test(r) || r.split(path.sep).includes('.git')) continue;
      if (fs.statSync(f).size > MAX_FILE) continue;
      out.push(r);
    }
  }
  return out.sort();
}

const round = (x) => Math.round(x * 10000) / 10000;

/**
 * planTrial({brand, scenarios, teams, control, floor, cap, per_picture, name, out})
 * A generation round prices every picture of every application, for every brand team and the control team, at
 * per_picture. Under the floor it is sent back (spend on quality, not less); over the cap it is refused.
 */
export function planTrial({ brand, scenarios = [], teams = 2, control = true, floor = 5, cap = 8, per_picture = 0.055, pictures_scale = 1, name, positioning, out } = {}) {
  const errors = [];
  if (!brand) errors.push('--brand <workspace> required');
  if (!out || out === true) errors.push('--out <trial dir> required');
  if (!(cap > 0)) errors.push('--cap must be above 0');
  if (floor < 0 || floor > cap) errors.push(`--floor ${floor} must be between 0 and the cap ${cap}`);
  const nTeams = Number(teams);
  if (!(nTeams >= 1 && nTeams <= 4)) errors.push('--teams must be 1 to 4');
  const lib = listScenarios();
  const want = scenarios.length ? scenarios : lib.map((s) => s.id);
  const chosen = [];
  for (const id of want) {
    const s = lib.find((x) => x.id === id);
    if (!s) errors.push(`no scenario "${id}" (have: ${lib.map((x) => x.id).join(', ')})`);
    else chosen.push(s);
  }
  if (errors.length) return { ok: false, errors };
  const files = brandFiles(path.resolve(brand));
  // one hash over every file a brand team gets: every brand team starts from byte-identical brand state
  const brand_hash = sha256(files.map((r) => `${r}\0${sha256File(path.join(path.resolve(brand), r))}`).join('\n'));
  const cfg = readData(path.join(path.resolve(brand), 'cstack.config.yaml')) ?? {};
  const brandName = name && name !== true ? String(name) : cfg.brand_name ?? cfg.brand_id ?? path.basename(path.resolve(brand));
  const teamIds = [...Array.from({ length: nTeams }, (_, i) => `team-${String.fromCharCode(97 + i)}`), ...(control ? ['control'] : [])];
  const units = [];
  for (const s of chosen)
    for (const t of teamIds) {
      const pics = s.applications.reduce((a, x) => a + Math.round((x.pictures ?? PICTURES[x.kind] ?? 0) * pictures_scale), 0);
      units.push({ id: `${t}/${s.id}`, team: t, scenario: s.id, control: t === 'control', pictures: pics, est_usd: round(pics * per_picture) });
    }
  const total = round(units.reduce((a, u) => a + u.est_usd, 0));
  const warnings = [];
  if (total > cap) errors.push(`this round is estimated at ${total} USD, over the cap of ${cap}: fewer scenarios or teams, or --pictures-scale ${round((cap / total) * pictures_scale * 0.95)}`);
  if (total < floor) errors.push(`this round is estimated at ${total} USD, under the floor of ${floor}: spend on quality, not less (--pictures-scale ${round(((floor / Math.max(total, 1e-9)) * pictures_scale) * 1.02)} gives each application more pictures to pick from), or add scenarios`);
  if (control && !(positioning && positioning !== true)) warnings.push('no --positioning given: the control team gets only the brand name; one line of what the brand is makes the control fairer');
  // the cap is split by planned pictures, so each workspace's budget stops it before the round passes the cap
  const shares = units.map((u) => ({ ...u, budget_usd: total > 0 ? round((u.est_usd / total) * cap) : round(cap / units.length) }));
  const plan = {
    tool: 'cstack trial',
    made: nowISO(),
    brand: path.resolve(brand),
    brand_name: brandName,
    positioning: positioning && positioning !== true ? String(positioning) : null,
    out: path.resolve(out),
    floor,
    cap,
    per_picture,
    pictures_scale,
    estimate_usd: total,
    teams: teamIds,
    scenarios: chosen.map((s) => s.id),
    roles: ROLES.map((r) => r.id),
    brand_files: files.length,
    brand_hash,
    units: shares,
  };
  return { ok: !errors.length, errors, warnings, plan };
}

export function writePlan(plan, { force = false } = {}) {
  const f = path.join(plan.out, 'trial.plan.json');
  if (exists(f) && !force) throw new Error(`${f} exists; pass --force to replace it, or pick another --out`);
  fs.mkdirSync(plan.out, { recursive: true });
  writeJSON(f, plan);
  return f;
}

export const readPlan = (dir) => {
  const f = path.join(path.resolve(dir), 'trial.plan.json');
  if (!exists(f)) throw new Error(`no trial.plan.json in ${dir}; run cstack trial plan first`);
  return readJSON(f);
};

const unitDir = (plan, u) => path.join(plan.out, 'runs', u.team, u.scenario);

/** A fresh workspace for one team and scenario: the brand's files (or the control stub), the scenario, a capped budget. */
export function prepareUnit(plan, u, { force = false } = {}) {
  const dir = unitDir(plan, u);
  if (exists(dir) && !force) return { dir, prepared: false };
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'trial', 'out'), { recursive: true });
  const budget = { currency: 'USD', per_run: u.budget_usd, per_day: u.budget_usd, confirm_over: u.budget_usd, allow_unpriced: false };
  if (u.control) {
    writeAtomic(path.join(dir, 'cstack.config.yaml'), YAML.stringify({ brand_id: 'control', budget, publish: { allowed: false } }));
    writeAtomic(path.join(dir, 'trial', 'brand.md'), `# ${plan.brand_name}\n\n${plan.positioning ?? ''}\n\nThis is everything you know about the brand.\n`);
  } else {
    for (const r of brandFiles(plan.brand)) {
      const to = path.join(dir, r);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(plan.brand, r), to);
    }
    const now = sha256(brandFiles(plan.brand).map((r) => `${r}\0${sha256File(path.join(plan.brand, r))}`).join('\n'));
    if (plan.brand_hash && now !== plan.brand_hash) throw new Error(`the brand workspace changed since the plan (brand files hash ${now.slice(0, 12)} vs ${plan.brand_hash.slice(0, 12)}); teams must start from the same brand state: re-plan with --force`);
    const cfgFile = path.join(dir, 'cstack.config.yaml');
    const cfg = readData(cfgFile) ?? {};
    writeAtomic(cfgFile, YAML.stringify({ ...cfg, budget, publish: { allowed: false } }));
  }
  const s = listScenarios().find((x) => x.id === u.scenario);
  const { file, ...scenario } = s;
  writeAtomic(path.join(dir, 'trial', 'scenario.yaml'), YAML.stringify(scenario));
  return { dir, prepared: true };
}

export function rolePrompt(plan, u, role) {
  const before = ROLES.slice(0, ROLES.indexOf(role)).map((r) => r.writes);
  const what = u.control
    ? `You know the brand only from trial/brand.md: its name${plan.positioning ? ' and one line about it' : ''}. Invent nothing beyond that you could not defend.`
    : 'Everything you know about the brand is in this workspace: brand/ (the brand system), references/ (what the founder kept and killed), assets/, recipes/, briefs/. Read them first; they decide, not your taste.';
  return [
    `You are the ${role.id} on a small brand team answering a real-world request. Work only inside this folder.`,
    what,
    `The request is in trial/scenario.yaml.${before.length ? ` Your teammates already wrote: ${before.join(', ')}. Read them and build on them; do not redo their decisions.` : ''}`,
    `Your job: ${role.job}`,
    `Use the cstack skills ${role.skills.map((s) => `/${s}`).join(', ')} where they apply.`,
    `Write your result to ${role.writes}. Keep it short and concrete.`,
    `Rules: spend only through cstack generate, which stops at this workspace's budget (${u.budget_usd} USD); never pass --confirm or --confirm-unpriced; never read, print or source any .env or key file; do not publish, post or email anything; do not look at other folders.`,
  ].join('\n');
}

const statePath = (plan) => path.join(plan.out, 'trial.state.json');
const readState = (plan) => (exists(statePath(plan)) ? readJSON(statePath(plan)) : { done: {} });

/**
 * runTrial(plan, {agent: argv, timeout_s, only: [unit ids], runner}) runs every role of every unit in order and keeps
 * each transcript. A role already done is skipped, so a stopped run resumes. A usage limit stops the run and lists
 * what is left. runner(argv, {cwd, input, timeout_s}) -> {status, stdout, stderr, error} is a test seam.
 */
export function runTrial(plan, { agent, timeout_s = 1800, only = [], runner = defaultRunner, log = () => {} } = {}) {
  if (!agent?.length) throw new Error('--agent "<agent command>" required (for example: claude -p --setting-sources project ...)');
  const state = readState(plan);
  const units = plan.units.filter((u) => !only.length || only.includes(u.id) || only.includes(u.team) || only.includes(u.scenario));
  const ran = [];
  for (const u of units) {
    const { dir } = prepareUnit(plan, u);
    for (const role of ROLES) {
      const key = `${u.id}:${role.id}`;
      if (state.done[key]) continue;
      log(`${u.id} ${role.id}`);
      const r = runner(agent, { cwd: dir, input: rolePrompt(plan, u, role), timeout_s });
      const tdir = path.join(dir, 'trial', 'transcripts');
      fs.mkdirSync(tdir, { recursive: true });
      writeAtomic(path.join(tdir, `${role.id}.txt`), `${r.stdout ?? ''}${r.stderr ? `\n--- stderr\n${r.stderr}` : ''}`);
      const wrote = exists(path.join(dir, role.writes));
      const failed = r.error || r.status !== 0;
      if (failed && isLimit(`${r.stderr ?? ''} ${r.stdout ?? ''} ${r.error ?? ''}`)) {
        writeJSON(statePath(plan), state);
        const left = units.flatMap((x) => ROLES.map((ro) => `${x.id}:${ro.id}`)).filter((k) => !state.done[k]);
        return { stopped: 'usage limit', ran, left };
      }
      state.done[key] = { at: nowISO(), status: failed ? 'agent_failed' : wrote ? 'ok' : 'no_output', ...(failed ? { error: String(r.error ?? r.stderr ?? '').slice(0, 300) } : {}) };
      ran.push({ unit: u.id, role: role.id, ...state.done[key] });
      writeJSON(statePath(plan), state);
    }
  }
  return { stopped: null, ran, left: [] };
}

function defaultRunner(argv, { cwd, input, timeout_s }) {
  const r = spawnSync(argv[0], argv.slice(1), { cwd, input, encoding: 'utf8', timeout: timeout_s * 1000, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error ? String(r.error.message) : null };
}

// The applications a unit produced, with the reviewer's verdict when it wrote one.
export function collectUnit(plan, u) {
  const dir = unitDir(plan, u);
  const outDir = path.join(dir, 'trial', 'out');
  const files = exists(outDir) ? fs.readdirSync(outDir).filter((f) => SHOWN.test(f)).sort() : [];
  let review = null;
  try {
    review = exists(path.join(dir, 'trial', 'review.json')) ? readJSON(path.join(dir, 'trial', 'review.json')) : null;
  } catch {
    review = null;
  }
  const verdict = new Map((review?.applications ?? []).map((a) => [String(a.id), a.pass === true]));
  return files.map((f) => {
    const app = f.replace(/\.[^.]+$/, '');
    return { unit: u.id, team: u.team, scenario: u.scenario, control: u.control, application: app, file: path.join(outDir, f), passed: verdict.has(app) ? verdict.get(app) : null };
  });
}

// seeded shuffle, so the blind order can be reproduced from the key
function shuffle(xs, seed) {
  let s = seed >>> 0 || 1;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * scoreTrial(plan, {seed}) copies every application under a shuffled code into score/files/, writes the attribution
 * sheet (score/attribution.html: is this the brand's?), the pairs sheet (score/pairs.html: the brand teams' answers
 * to one scenario side by side, same brand or not), the key (score/key.json) and score/collected.json.
 */
export function scoreTrial(plan, { seed = Date.now() % 2 ** 31, force = false } = {}) {
  const sdir = path.join(plan.out, 'score');
  if (exists(path.join(sdir, 'key.json')) && !force) throw new Error(`${sdir}/key.json exists; the owner may be tapping that sheet. Pass --force to rebuild it`);
  fs.rmSync(path.join(sdir, 'files'), { recursive: true, force: true });
  fs.mkdirSync(path.join(sdir, 'files'), { recursive: true });
  const items = plan.units.flatMap((u) => collectUnit(plan, u));
  if (!items.length) throw new Error('no applications found under runs/*/*/trial/out/; run cstack trial run first');
  const coded = shuffle(items, seed).map((it, i) => {
    const code = `T${String(i + 1).padStart(3, '0')}`;
    const ext = path.extname(it.file).toLowerCase();
    fs.copyFileSync(it.file, path.join(sdir, 'files', `${code}${ext}`));
    return { code, src: `files/${code}${ext}`, ...it, sha256: sha256File(it.file) };
  });
  const brandTeams = plan.teams.filter((t) => t !== 'control');
  const pairs = [];
  if (brandTeams.length >= 2)
    for (const s of plan.scenarios) {
      const [a, b] = brandTeams.slice(0, 2).map((t) => coded.filter((c) => c.team === t && c.scenario === s));
      if (a.length && b.length) pairs.push({ code: `P${String(pairs.length + 1).padStart(2, '0')}`, scenario: s, left: a.map((x) => x.code), right: b.map((x) => x.code) });
    }
  writeJSON(path.join(sdir, 'key.json'), { made: nowISO(), seed, items: coded.map(({ file, ...x }) => ({ ...x, file: path.relative(plan.out, file) })), pairs });
  writeJSON(path.join(sdir, 'collected.json'), { applications: items.length, by_team: Object.fromEntries(plan.teams.map((t) => [t, items.filter((x) => x.team === t).length])) });
  writeAtomic(path.join(sdir, 'attribution.html'), attributionHTML({ title: `Which of these are ${plan.brand_name}?`, items: coded, sheet: `${path.basename(plan.out)}-attribution` }));
  if (pairs.length) writeAtomic(path.join(sdir, 'pairs.html'), pairsHTML({ title: 'Same brand?', pairs, items: coded, sheet: `${path.basename(plan.out)}-pairs` }));
  return { dir: sdir, attribution: path.join(sdir, 'attribution.html'), pairs: pairs.length ? path.join(sdir, 'pairs.html') : null, count: coded.length, pair_count: pairs.length, seed };
}

const STYLE = `:root{--bg:#f6f4ef;--fg:#111;--mute:#666;--line:#ddd;--accent:#002fa7;--on:#fff;--no:#8a1c1c}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#eee;--mute:#999;--line:#333;--accent:#7f9cff;--on:#111;--no:#ff8a8a}}
*{box-sizing:border-box}body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,sans-serif}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:baseline;justify-content:space-between;margin-bottom:12px}h1{font-size:18px;margin:0}
.how{border:1px solid var(--line);padding:10px 12px;margin:0 0 12px}.how ol{margin:4px 0 0;padding-left:20px}
main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}@media (max-width:640px){main{grid-template-columns:1fr}}
article{border:1px solid var(--line);padding:8px}article.yes{outline:3px solid var(--accent)}article.no{outline:3px solid var(--no);opacity:.75}
img{display:block;width:100%;height:auto;background:var(--line)}h2{font-size:13px;margin:6px 0}
.row{display:flex;gap:8px;margin:6px 0}.btn{font:inherit;padding:6px 12px;border:1px solid var(--line);background:transparent;color:var(--fg);cursor:pointer}
.btn.primary,article.yes .yes{background:var(--accent);border-color:var(--accent);color:var(--on)}article.no .no{background:var(--no);border-color:var(--no);color:var(--on)}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}.side{display:grid;gap:6px}`;

function tapScript(data, yes, no, kind) {
  return `<script>
const SHEET=${JSON.stringify(data).replace(/</g, '\\u003c')};
const KEY='cstack-trial:'+SHEET.sheet;let state={};try{state=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}};
const count=()=>{const v=Object.values(state);document.getElementById('count').textContent=v.filter(x=>x==='yes').length+' ${yes}, '+v.filter(x=>x==='no').length+' ${no}, '+(SHEET.codes.length-v.length)+' left'};
document.querySelectorAll('article').forEach(a=>{const c=a.dataset.code;const paint=()=>{a.classList.toggle('yes',state[c]==='yes');a.classList.toggle('no',state[c]==='no')};
a.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{if(state[c]===b.dataset.v)delete state[c];else state[c]=b.dataset.v;save();paint();count()});paint()});count();
document.getElementById('download').onclick=()=>{const taps=SHEET.codes.filter(c=>state[c]).map(c=>({code:c,answer:state[c]}));
const blob=new Blob([JSON.stringify({sheet:SHEET.sheet,kind:'${kind}',taps},null,2)],{type:'application/json'});const u=URL.createObjectURL(blob);const l=document.createElement('a');l.href=u;l.download=SHEET.sheet+'.taps.json';l.click();URL.revokeObjectURL(u)};
</script>`;
}

function attributionHTML({ title, items, sheet }) {
  const cards = items.map((it) => `<article data-code="${esc(it.code)}"><img src="${esc(it.src)}" alt="${esc(it.code)}" loading="lazy"><h2>${esc(it.code)}</h2><div class="row"><button type="button" class="btn yes" data-v="yes">The brand's</button><button type="button" class="btn no" data-v="no">Not the brand's</button></div></article>`).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head><body>
<header><h1>${esc(title)}</h1><div><span id="count"></span> <button id="download" class="btn primary">Download taps.json</button></div></header>
<section class="how"><strong>How to tap</strong><ol><li>Some of these were made by teams that had the brand's files, some by a team that only knew its name. Nothing tells you which.</li><li>For each piece, tap <em>The brand's</em> if it reads as the brand, <em>Not the brand's</em> if it does not. Go on instinct; tap again to undo.</li><li>Press <em>Download taps.json</em> and run <code>cstack trial import</code> on it (or send it back).</li></ol></section>
<main>
${cards}
</main>
${tapScript({ sheet, codes: items.map((i) => i.code) }, 'the brand\'s', 'not', 'attribution')}
</body></html>
`;
}

function pairsHTML({ title, pairs, items, sheet }) {
  const src = new Map(items.map((i) => [i.code, i.src]));
  const side = (codes) => `<div class="side">${codes.map((c) => `<img src="${esc(src.get(c))}" alt="${esc(c)}" loading="lazy">`).join('')}</div>`;
  const cards = pairs.map((p) => `<article data-code="${esc(p.code)}"><h2>${esc(p.code)}</h2><div class="pair">${side(p.left)}${side(p.right)}</div><div class="row"><button type="button" class="btn yes" data-v="yes">Same brand</button><button type="button" class="btn no" data-v="no">Not the same</button></div></article>`).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${STYLE}main{grid-template-columns:1fr}</style></head><body>
<header><h1>${esc(title)}</h1><div><span id="count"></span> <button id="download" class="btn primary">Download taps.json</button></div></header>
<section class="how"><strong>How to tap</strong><ol><li>Each card shows two answers to the same request, made by two teams that never saw each other's work.</li><li>Tap <em>Same brand</em> if they read as one brand, <em>Not the same</em> if not.</li><li>Press <em>Download taps.json</em> and run <code>cstack trial import</code> on it.</li></ol></section>
<main>
${cards}
</main>
${tapScript({ sheet, codes: pairs.map((p) => p.code) }, 'same', 'not', 'pairs')}
</body></html>
`;
}

const pct = (n, d) => (d ? Math.round((100 * n) / d) : null);

/**
 * importTaps(plan, files) reads one or both taps files and writes score/report.json and score/report.md:
 * attribution rate for brand teams against control, cross-team agreement, reviewer pass rate and the reviewer's
 * agreement with the owner, spend from each workspace ledger against the plan.
 */
export function importTaps(plan, files = []) {
  const sdir = path.join(plan.out, 'score');
  const key = readJSON(path.join(sdir, 'key.json'));
  const byCode = new Map(key.items.map((i) => [i.code, i]));
  const result = { made: nowISO(), attribution: null, pairs: null };
  for (const f of files) {
    const t = readJSON(path.resolve(f));
    if (t.kind === 'attribution') {
      const taps = (t.taps ?? []).filter((x) => byCode.has(x.code));
      const unknown = (t.taps ?? []).filter((x) => !byCode.has(x.code)).length;
      if (unknown) throw new Error(`${unknown} tap(s) name codes this trial's key does not have; is this the right sheet?`);
      const side = (ctl) => {
        const s = taps.filter((x) => byCode.get(x.code).control === ctl);
        return { tapped: s.length, yes: s.filter((x) => x.answer === 'yes').length, rate: pct(s.filter((x) => x.answer === 'yes').length, s.length) };
      };
      const brand = side(false);
      const control = side(true);
      // reviewer verdicts against the owner's taps, on brand-team work the reviewer judged
      const judged = taps.filter((x) => !byCode.get(x.code).control && byCode.get(x.code).passed != null);
      const agree = judged.filter((x) => byCode.get(x.code).passed === (x.answer === 'yes')).length;
      result.attribution = { brand, control, lift: brand.rate != null && control.rate ? Math.round((brand.rate / control.rate) * 100) / 100 : null, reviewer_agreement: { judged: judged.length, agree, rate: pct(agree, judged.length) }, untapped: key.items.length - taps.length };
    } else if (t.kind === 'pairs') {
      const taps = t.taps ?? [];
      result.pairs = { tapped: taps.length, same: taps.filter((x) => x.answer === 'yes').length, rate: pct(taps.filter((x) => x.answer === 'yes').length, taps.length), of: key.pairs.length };
    } else throw new Error(`${f} is not a trial taps file (kind ${t.kind ?? 'missing'})`);
  }
  const reviewed = key.items.filter((i) => !i.control && i.passed != null);
  result.reviewer_pass = { judged: reviewed.length, passed: reviewed.filter((i) => i.passed).length, rate: pct(reviewed.filter((i) => i.passed).length, reviewed.length) };
  let spent = 0;
  for (const u of plan.units) {
    const led = path.join(unitDir(plan, u), 'state', 'cost-ledger.jsonl');
    if (!exists(led)) continue;
    for (const line of fs.readFileSync(led, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (r.status === 'ok') spent += Number((r.actual_cost_if_available ?? r.estimated_cost ?? r.booked_cost)?.amount ?? 0);
      } catch {
        /* a bad line counts nothing */
      }
    }
  }
  result.spend = { estimated_usd: round(spent), cap: plan.cap, floor: plan.floor, planned_usd: plan.estimate_usd };
  writeJSON(path.join(sdir, 'report.json'), result);
  writeAtomic(path.join(sdir, 'report.md'), reportMD(plan, key, result));
  return { ...result, report: path.join(sdir, 'report.md') };
}

function reportMD(plan, key, r) {
  const a = r.attribution;
  const lines = [`# Brand trial: ${plan.brand_name}`, '', `${today()} · ${plan.scenarios.length} scenarios · ${plan.teams.filter((t) => t !== 'control').length} brand teams${plan.teams.includes('control') ? ' and a control team' : ''} · ${key.items.length} applications`, '', `Every brand team started from the same ${plan.brand_files} brand files (hash ${String(plan.brand_hash ?? 'not recorded').slice(0, 12)}).`, ''];
  if (a) lines.push(`Blind, the owner attributed **${a.brand.yes} of ${a.brand.tapped}** brand-team pieces to the brand (${a.brand.rate}%) against **${a.control.yes} of ${a.control.tapped}** control pieces (${a.control.rate ?? 0}%).${a.lift ? ` Brand work was picked ${a.lift} times as often.` : ''}`);
  if (r.pairs) lines.push(`Two teams that never saw each other's work were judged the same brand in **${r.pairs.same} of ${r.pairs.tapped}** scenarios.`);
  if (r.reviewer_pass.judged) lines.push(`The reviewer passed ${r.reviewer_pass.passed} of ${r.reviewer_pass.judged} brand-team pieces${a?.reviewer_agreement.judged ? ` and agreed with the owner on ${a.reviewer_agreement.agree} of ${a.reviewer_agreement.judged}` : ''}.`);
  lines.push(`Media spend by cstack's estimates: ${r.spend.estimated_usd} USD of a ${r.spend.cap} USD cap (plan ${r.spend.planned_usd}, floor ${r.spend.floor}); reconcile with cstack spend reconcile in each workspace for the billed amount.`, '');
  lines.push('| Scenario | Team | Applications | Reviewer passed |', '| --- | --- | --- | --- |');
  for (const s of plan.scenarios)
    for (const t of plan.teams) {
      const xs = key.items.filter((i) => i.scenario === s && i.team === t);
      lines.push(`| ${s} | ${t} | ${xs.length} | ${xs.filter((i) => i.passed === true).length} |`);
    }
  lines.push('', 'Numbers come from this run only; a claim built on them names the run, the date and the brand.');
  return lines.join('\n') + '\n';
}
