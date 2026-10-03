// cstack CLI (loaded by bin/cstack.mjs after its dependency check): the deterministic half of the stack. Skills hold judgment; this holds the gates.
// Run `cstack help` for commands. Every command is safe by default (read-only or append-only)
// unless it says otherwise.
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ROOT, Report, readData, readJSON, writeJSON, exists, rel, readJSONL, appendJSONL, newId, today, nowISO, walk } from '../scripts/lib/core.mjs';
import { schemaNames, validator, validateTree, validateValue } from '../scripts/lib/schemas.mjs';
import { listSkills, checkSkill, buildIndex, search, duplicateLines } from '../scripts/lib/skills.mjs';
import { checkBudgets, ratchet } from '../scripts/lib/budget.mjs';
import { compile, diffRecipes } from '../scripts/lib/prompt.mjs';
import { canonNames } from '../scripts/lib/prompt-names.mjs';
import { route } from '../scripts/lib/router.mjs';
import { planBatch, readLedger, spent } from '../scripts/lib/ledger.mjs';
import { record as recordLineage, summarize as summarizeLineage } from '../scripts/lib/lineage.mjs';
import { initBrand, checkBrand, applyToBrand, staleArtifacts, brandContext, resolveConflict } from '../scripts/lib/brand.mjs';
import { imageSize, sizeAudit } from '../scripts/lib/image.mjs';
import { checkTokens, buildCSS, lintRaw } from '../scripts/lib/tokens.mjs';
import { detectTools } from '../scripts/lib/tools.mjs';
import { listFlows, searchFlows, planFromFlow, checkFlow, checkFlowFile } from '../scripts/lib/flows.mjs';
import { runMedia, listPending } from '../providers/runner.mjs';
import { availability, getProvider, checkProviderRegistry } from '../providers/index.mjs';
import { lintShotDNA, lintShotDNATree } from '../scripts/lib/lint.mjs';
import { guardedCall } from '../scripts/lib/ledger.mjs';
import { experimentInit, experimentLog, experimentStatus } from '../scripts/lib/experiment.mjs';
import { evalPlan, checkFixtures, loadFixtures } from '../scripts/lib/evalplan.mjs';
import { healthReport } from '../scripts/lib/health.mjs';
import { promoteLearning, learningCandidates } from '../scripts/lib/learn.mjs';
import { installHosts } from '../scripts/lib/hosts.mjs';
import { checkLinks } from '../scripts/lib/links.mjs';

const [, , cmd, ...argv] = process.argv;

// Flags that never take a value: they must not swallow the next word (`--strict file.yaml`).
const BOOLEAN_FLAGS = new Set(['json', 'dry-run', 'confirm', 'confirm-unpriced', 'strict', 'ratchet', 'check', 'inferred', 'force', 'copy', 'deep', 'full', 'compact', 'interactive', 'internal', 'allow-mutation', 'no-background']);
// Flags that may repeat: values accumulate in an array.
const REPEATABLE_FLAGS = new Set(['set']);

function parseArgs(a) {
  const out = { _: [] };
  const put = (k, v) => {
    if (REPEATABLE_FLAGS.has(k)) out[k] = [...(out[k] ?? []), v];
    else out[k] = v;
  };
  for (let i = 0; i < a.length; i++) {
    const t = a[i];
    if (t === '--') {
      out._.push(...a.slice(i + 1));
      break;
    }
    if (t.startsWith('--')) {
      const eq = t.indexOf('=');
      const k = eq === -1 ? t.slice(2) : t.slice(2, eq);
      if (eq !== -1) put(k, t.slice(eq + 1));
      else if (!BOOLEAN_FLAGS.has(k) && a[i + 1] !== undefined && !a[i + 1].startsWith('--')) put(k, a[++i]);
      else put(k, true);
    } else out._.push(t);
  }
  return out;
}
const args = parseArgs(argv);
const ws = path.resolve(args.ws ?? process.env.CSTACK_WORKSPACE ?? process.cwd());
if (args.ws !== undefined && (args.ws === true || !fs.existsSync(ws))) {
  console.error(`--ws ${args.ws === true ? '(no value)' : ws}: no such directory`);
  process.exit(1);
}
// Commands that read or write brand state need a real workspace, not whatever folder the shell is in.
const requireWs = () => {
  if (!fs.existsSync(path.join(ws, 'brand', 'brand-system.json'))) die(`${ws} is not a brand workspace (no brand/brand-system.json). Pass --ws <dir>, or create one with cstack brand init <dir>`);
};
const json = (o) => console.log(JSON.stringify(o, null, 2));
const die = (msg, code = 1) => {
  console.error(msg);
  process.exit(code);
};
// errors print as one clean line; set CSTACK_DEBUG=1 for the stack
const onError = (e) => die(process.env.CSTACK_DEBUG ? e?.stack ?? String(e) : `error: ${e?.message ?? e}`);
process.on('uncaughtException', onError);
process.on('unhandledRejection', onError);

const COMMANDS = {
  help: 'show this help',
  validate: 'T0 static checks on cstack itself: schemas, skills, contracts, registry, links, index freshness',
  index: 'regenerate registry/skills-index.json from skills/*/skill.meta.json',
  search: 'search the skill catalog: cstack search "product photoshoot"',
  health: 'skill health dashboard (validity, budgets, evals, staleness, duplicates)',
  budget: 'context budgets: --check (CI), --ratchet, --accept <slug|catalog> --reason "..."',
  'brand init': 'create a brand workspace: cstack brand init <dir> --name "Brand" [--id brand-id]',
  'brand check': 'validate a brand workspace (schemas, conflicts, unknowns, ledgers): --ws <dir>',
  'brand set': 'write one sourced field through source precedence: cstack brand set <section.field> --file field.json',
  'brand context': 'compact, cache-stable brand facts for a prompt: cstack brand context [--sections voice,color] [--inferred]',
  'brand stale': 'artifacts whose brand inputs changed since they were made',
  'brand resolve': 'owner resolves an open conflict by picking a position: cstack brand resolve <conflict-id> --pick 1|2 [--by name] [--note "..."]',
  'prompt compile': 'compile a prompt recipe: cstack prompt compile <recipe.yaml> [--seed N] [--set slot=value]... (one --set per slot)',
  'prompt diff': 'component-level diff of two recipes: cstack prompt diff a.yaml b.yaml',
  route: 'rank models: cstack route --modality image --needs image-edit,text-rendering [--task t] [--max-cost 0.2] [--providers google,openai] [--avoid id,...]',
  'spend plan': 'estimate a batch before paying: cstack spend plan <items.json> --stop "condition" --ws <dir>',
  'spend summary': 'ledger summary for a workspace: --ws <dir> [--since YYYY-MM-DD]',
  generate: 'guarded media call (dedupe, budget, pending jobs, sidecar, size audit): cstack generate --file request.json [--dry-run] [--confirm (owner approved a call above confirm_over)] [--confirm-unpriced]',
  jobs: 'provider jobs still pending (resume, never resubmit)',
  tools: 'which research tools / MCPs are usable (registry/research-tools.json): cstack tools [--mcp "Figma,mobbin"] (pass the MCP server names you can see)',
  providers: 'which providers are usable here (env vars present) and which are stubs; merges registry/providers.json',
  'lint shot-dna': 'warn when Shot DNA lighting is adjectives, not a recipe: cstack lint shot-dna <file...> (no file: every *.shot-dna.* in the repo)',
  'edit paste': 'paste a patch onto a base with a feathered edge, writing a new file: cstack edit paste --base a.png --patch b.png --x N --y N [--feather 8] [--region x,y,w,h] --out c.png',
  audit: 'check an image against an expected size/aspect: cstack audit <file> --aspect 4:5 | --size 1080x1350',
  taste: 'Taste Labs capability: cstack taste search "intent" [--k 6] | extract <url> | verify --reference <url> --candidate <url>',
  failure: 'append a failure event: cstack failure --file event.json',
  eval: 'append an eval record: cstack eval --file record.json',
  'tokens check': 'validate DTCG design tokens in brand/tokens/*.tokens.json (types, aliases, cycles)',
  'tokens build': 'compile tokens to brand/generated/tokens.css (deterministic)',
  'tokens lint': 'flag raw colors in built files that are not brand tokens: cstack tokens lint <files...> [--allow #fff,#000]',
  browse: 'headless browser for brand work (lazy-loads playwright-core): cstack browse shot|snapshot|tokens|media|qa|pdf <url> [flags] | run <steps.yaml> | engines',
  'type scale': 'modular or fluid type scale with line-height, tracking, caps tracking, measure: cstack type scale [--base 16] [--ratio 1.25] [--steps -2..6] [--fluid ...] [--json|--tokens|--css]',
  'type qa': 'rendered-type QA per breakpoint (measure, leading, caps, size, contrast, widows, families, fallbacks): cstack type qa <url> [--breakpoints 375,768,1440] [--families "A,B"] [--max-families 3] [--scale-css tokens.css]; exits 1 on FAIL',
  'type font': 'read font files (TTF/OTF/TTC/WOFF/WOFF2): names, fsType, metrics, axes, features, coverage, languages: cstack type font <file...> [--languages pt,vi] [--json]',
  'video probe': 'container, codecs, size, fps, pixel format, aspect, bitrate, audio, rotation, C2PA presence (needs ffmpeg/ffprobe; cstack never installs them): cstack video probe <file> [--json]',
  'video normalize': 'conform clips before any join (square pixels, fixed fps, yuv420p, H.264): cstack video normalize <in...> [--size 1080x1920] [--fps 30] [--fit pad|crop] --out <dir>',
  'video cuts': 'scene cuts, frozen and black segments: cstack video cuts <file> [--threshold 0.3] [--json]',
  'video sheet': 'contact sheet plus first, last and cut-boundary frames for review: cstack video sheet <file> [--frames 12] --out sheet.png',
  'video assemble': 'trims and planned transitions into a master from an EDL, plus an OpenTimelineIO file for an editor: cstack video assemble <edl.yaml> --out master.mp4',
  'video reframe': 'derive 9:16, 4:5, 1:1 and 16:9 from one master (letterbox stripped first, focus per clip): cstack video reframe <master> [--to 9:16,4:5] [--focus 0.5 | --edl edl.yaml] --out <dir>',
  'video captions': 'burn SRT captions inside a platform safe zone: cstack video captions <video> --srt captions.srt [--zone universal|tiktok|reels|shorts] --out <file>',
  'video safezone': 'overlay a platform safe zone on a frame for review: cstack video safezone <video|png> [--zone reels] [--at seconds] --out overlay.png',
  'video audio': 'two-pass loudness to -14 LUFS / -1 dBTP, optional music bed under the original audio: cstack video audio <video> [--bed music.wav] [--bed-gap 10] --out <file>',
  'video qa': 'spec, freezes, black frames, cuts against the beat plan, label drift in a region against the approved still, loudness, duration, safe zone: cstack video qa <video> [--plan beats.yaml] [--product-ref still.png --roi x,y,w,h]; exits 1 on FAIL',
  'video deliver': 'per-channel H.264 + AAC encodes with faststart and a manifest: cstack video deliver <master> [--channels meta,tiktok,youtube,reels] --out <dir>',
  'mockup render': 'composite approved art onto a template package (quad, cylinder, mesh; displacement, shading; licence gate): cstack mockup render --template <dir> --art <file.png|svg> --out <file.png> [--placement id] [--force] [--internal]',
  'mockup verify': 'prove the art survived: inverse-warp each placement to flat art space and diff it (mean, edges, worst-tile SSIM, heatmap): cstack mockup verify --template <dir> --art <file> --render <file.png> [--placement id]; exits 1 on FAIL',
  'mockup check': 'validate a template package (placements, footprints, layer files, licence): cstack mockup check --template <dir>',
  'svg lint': 'lint marks and icon sets: structure and security, viewBox, complexity, palette, strokes across a set, grid against an icon grammar: cstack svg lint <file|dir...> [--grammar icons.tokens.json] [--palette ...]; exits 1 on FAIL',
  'svg reduce': 'does a mark survive small sizes? renders 16-64 px on white, black and one colour, fails where counters close or parts merge (Chromium): cstack svg reduce <file.svg|png> [--sizes 16,24,32,48,64]',
  'svg kit': 'favicon and app-icon kit from a vector master (svg, ico, apple-touch, 192/512, maskable with the safe zone checked, manifest): cstack svg kit <file.svg> --out dir [--bg #fff] [--name "Brand"]',
  '3d inspect': 'check a GLB/glTF against a delivery budget: bytes, triangles, textures, real-world size, origin, compression; model text is untrusted: cstack 3d inspect <file> [--budget web-hero|ar|social] [--dims 70x210x70mm]; exits 1 on FAIL',
  '3d frames': 'check an image-sequence hero: frame count, total and per-frame bytes, one size, no gaps, format: cstack 3d frames <dir> [--max-frames 150] [--max-bytes 8MB]; exits 1 on FAIL',
  '3d blender-script': 'write a Blender turntable or packshot script the owner runs (no Blender needed here): cstack 3d blender-script --glb <file> --mode turntable|packshot [--size 1080x1920] [--frames N] [--seconds S] [--out script.py]',
  'workflow list': 'the gated workflows (outcome → skills in order, owner gates) and the methods each one follows',
  'flows list': 'researched best-way-to-an-outcome flows (cstack flows/ + workspace flows/), with staleness',
  'flows search': 'find the flow for an outcome before making anything: cstack flows search "rotating 3d product on the homepage"',
  'flows show': 'print one flow: cstack flows show <id>',
  'flows plan': 'copy a flow into this run\'s plan: cstack flows plan <id> [--target "what as-close-as-possible means"] → work/flows/',
  'flows check': 'is a plan followable? 2+ candidates compared, a gate on every step, compare_to_target on every made thing, a stop condition, a stated target: cstack flows check work/flows/*.flow.yaml; exits 1 on FAIL',
  preamble: 'print the shared skill preamble (honesty, precedence, cost, safety rules)',
  lineage: 'record a creative commit: cstack lineage --ws <dir> --file entry.json   |   --show <artifact_id>',
  feedback: 'append a human feedback event: cstack feedback --ws <dir> --file event.json',
  'experiment init': 'scaffold a bounded experiment: cstack experiment init <run_id> --ws <dir>',
  'experiment log': 'append a result row: cstack experiment log <run_id> --file row.json --ws <dir>',
  'experiment status': 'incumbent, budget used, stop conditions: cstack experiment status <run_id> --ws <dir>',
  'learn add': 'append a learning event: cstack learn add --ws <dir> --file event.json',
  'learn candidates': 'learnings eligible for promotion (repeated evidence or strong human correction)',
  'learn promote': 'promote a learning: cstack learn promote <id> --to <target> --by <name> --ws <dir>',
  'evals plan': 'diff-aware eval selection: cstack evals plan [--since <git-ref>] [--files a,b]',
  setup: 'install skills into agent hosts: cstack setup [--host default|agents|claude-code|codex|cursor|gemini-cli|opencode|all] [--target <project>] [--copy] [--dry-run]',
};

function help() {
  console.log('cstack — agentic brand/creative operating system\n');
  for (const [k, v] of Object.entries(COMMANDS)) console.log(`  cstack ${k.padEnd(18)} ${v}`);
  console.log('\nGlobal: --ws <dir> sets the brand workspace (default: cwd or $CSTACK_WORKSPACE). --json for machine output where supported.');
}

function cmdValidate() {
  const r = new Report();
  // 1 schemas compile
  for (const n of schemaNames()) {
    try {
      validator(n);
    } catch (e) {
      r.error(`schemas/${n}.schema.json`, e.message);
    }
  }
  r.note(`${schemaNames().length} schemas compile`);
  // 2 skills
  const skills = listSkills();
  const slugs = skills.map((s) => s.slug);
  const fixtures = loadFixtures();
  for (const s of skills) checkSkill(s, r, { allSlugs: slugs, fixtures });
  r.note(`${skills.length} skills checked against the skill contract`);
  // 3 index freshness
  const idxPath = path.join(ROOT, 'registry', 'skills-index.json');
  const fresh = JSON.stringify(buildIndex(skills).skills);
  if (!exists(idxPath)) r.error('registry/skills-index.json', 'missing; run `cstack index`');
  else if (JSON.stringify(readJSON(idxPath).skills) !== fresh) r.error('registry/skills-index.json', 'stale; run `cstack index`');
  // 4 governed data files in the repo (registry, fixtures, templates, examples)
  const results = validateTree(ROOT, { skip: ['node_modules', 'tests/tmp', '.cstack'] });
  for (const x of results) if (!x.ok) r.error(x.file, `[${x.schema}] ${x.errors}`);
  r.note(`${results.length} governed data records validated`);
  // 4b provider registry parses and matches providers/index.mjs
  for (const p of checkProviderRegistry()) r.error('registry/providers.json', p);
  // 4c craft lints (warnings only): Shot DNA lighting must name a recipe, not adjectives
  const lint = lintShotDNATree(ROOT);
  for (const x of lint) for (const f of x.findings) r.warn(x.file, `[shot-dna lint] ${f.field}: ${f.detail}`);
  // 5 workflows reference real skills
  const wfDir = path.join(ROOT, 'workflows');
  if (exists(wfDir))
    for (const d of fs.readdirSync(wfDir)) {
      const p = path.join(wfDir, d, 'workflow.yaml');
      if (!exists(p)) continue;
      const wf = readData(p);
      for (const st of wf.steps ?? []) if (st.skill && !slugs.includes(st.skill)) r.error(rel(p), `step "${st.id}" uses unknown skill "${st.skill}"`);
      if (!slugs.includes(d) && !wf.entry_skill) r.warn(rel(p), 'workflow has no matching playbook skill (entry_skill)');
      for (const m of wf.methods ?? []) if (!exists(path.join(ROOT, 'flows', `${m}.flow.yaml`))) r.error(rel(p), `method "${m}" has no flows/${m}.flow.yaml`);
      for (const st of wf.steps ?? []) if (!st.skill && !st.does) r.error(rel(p), `step "${st.id}" has neither a skill nor a does`);
    }
  // flows: the library passes the same check a run's plan must pass; stale flows are flagged
  const flows = listFlows(ROOT);
  for (const f of flows) {
    const { file, scope, age_days, stale, ...flow } = f;
    const c = checkFlow(flow, { skills: slugs });
    for (const e of c.errors) r.error(rel(file), e);
    for (const w of c.warnings) r.warn(rel(file), w);
    if (stale) r.warn(rel(file), `flow last verified ${f.last_verified} (${age_days} days); re-research it`);
  }
  r.note(`${flows.length} flows checked`);
  // eval fixtures follow the documented format (docs/evals.md) so a runner can execute their graders
  const fx = checkFixtures({ skills: slugs });
  for (const [f, e] of fx.errors) r.error(f, e);
  for (const [f, w] of fx.warnings) r.warn(f, w);
  // commands named in skills, docs, fixture graders and flow gates exist; a planned one says "planned"
  // a command with subcommands must name a real one (`cstack generate banana` is fine: generate has none; `cstack brand banana` is not)
  const knownCmd = (a, b) => {
    const subs = Object.keys(COMMANDS).filter((k) => k.startsWith(`${a} `));
    if (!subs.length || !b) return !!COMMANDS[a] || subs.length > 0;
    return !!COMMANDS[`${a} ${b}`] || (!!COMMANDS[a] && !/^[a-z]+$/.test(b));
  };
  const refRe = /\bcstack ([a-z0-9][\w-]*)(?: ([a-z][\w-]*))?/g;
  const checkRefs = (where, text, re) => {
    for (const m of text.matchAll(re)) if (!knownCmd(m[1], m[2])) r.error(where, `names \`cstack ${m[1]}${m[2] ? ` ${m[2]}` : ''}\`, which is not a command (implement it, fix the name, or say it is planned)`);
  };
  const docFiles = [
    ...walk(path.join(ROOT, 'skills'), (p) => p.endsWith('.md')),
    ...['README.md', 'AGENTS.md'].map((f) => path.join(ROOT, f)).filter(exists),
    ...fs.readdirSync(path.join(ROOT, 'docs')).filter((f) => f.endsWith('.md') && !f.startsWith('backlog')).map((f) => path.join(ROOT, 'docs', f)),
  ];
  for (const f of docFiles) for (const line of fs.readFileSync(f, 'utf8').split('\n')) if (!/\(planned\b/i.test(line)) checkRefs(rel(f), line, /`cstack ([a-z0-9][\w-]*)(?: ([a-z][\w-]*))?/g);
  for (const x of loadFixtures()) for (const g of x.graders ?? []) if (g.type === 'command' && /^cstack /.test(g.run ?? '')) checkRefs(x.file, g.run.split(/\s+/).slice(0, 3).join(' '), refRe);
  for (const f of flows) for (const st of f.steps ?? []) if (st.gate?.check) checkRefs(rel(f.file), st.gate.check, refRe);
  // markdown links resolve and their #anchors exist
  for (const f of execFileSync('git', ['ls-files', '-co', '--exclude-standard', '*.md'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean).map((x) => path.join(ROOT, x)).filter(exists))
    for (const p of checkLinks(f)) r.error(rel(f), `broken link ${p.link}: ${p.problem}`);
  // research tools name real skills and workflows
  const rt = readJSON(path.join(ROOT, 'registry', 'research-tools.json'));
  const wfNames = exists(path.join(ROOT, 'workflows')) ? fs.readdirSync(path.join(ROOT, 'workflows')) : [];
  for (const t of rt.tools ?? rt) {
    for (const k of t.cstack_skills ?? []) if (!slugs.includes(k)) r.error('registry/research-tools.json', `${t.id}: unknown skill "${k}"`);
    for (const k of t.cstack_workflows ?? []) if (!wfNames.includes(k)) r.error('registry/research-tools.json', `${t.id}: unknown workflow "${k}"`);
  }
  // 6 hygiene: no absolute home paths, no secrets-looking strings in tracked text
  for (const f of walkText()) {
    const t = fs.readFileSync(f, 'utf8');
    if (/\/Users\/[a-z]+\/|\/home\/[a-z]+\//i.test(t) && !f.includes('tests')) r.error(rel(f), 'absolute home path; use workspace-relative paths');
    if (/(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|fal_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,})/.test(t)) r.error(rel(f), 'looks like a credential; keys never live in the repo');
  }
  // 7 brand-agnostic: terms from a private, untracked denylist (owner brands, private projects) must not appear anywhere, docs included
  const denyFile = process.env.CSTACK_BRAND_DENYLIST ?? path.join(ROOT, 'private', 'brand-denylist.txt');
  if (exists(denyFile)) {
    const terms = fs.readFileSync(denyFile, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    // one case-insensitive regular expression per line, so common words can be matched precisely
    const res = terms.map((w) => new RegExp(w, 'i'));
    let visible = null;
    try {
      visible = new Set(execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean).map((x) => path.join(ROOT, x)));
    } catch {}
    for (const f of walkText({ includeDocs: true }).filter((x) => !visible || visible.has(x))) {
      const t = fs.readFileSync(f, 'utf8');
      const hit = res.findIndex((re) => re.test(t));
      if (hit >= 0) r.error(rel(f), `contains a term from the private brand denylist (#${hit + 1}); cstack stays brand-agnostic`);
    }
  }
  r.print('cstack validate');
  process.exit(r.ok ? 0 : 1);
}

function walkText({ includeDocs = false } = {}) {
  const out = [];
  const skipDirs = new Set(['node_modules', '.git', 'private', ...(includeDocs ? [] : ['docs'])]);
  const walkDir = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (skipDirs.has(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walkDir(p);
      else if (/\.(md|json|ya?ml|mjs|js|sh|txt|tsv)$/.test(e.name) && e.name !== 'package-lock.json') out.push(p);
    }
  };
  walkDir(ROOT);
  return out;
}

function cmdIndex() {
  const idx = buildIndex(listSkills());
  writeJSON(path.join(ROOT, 'registry', 'skills-index.json'), idx);
  console.log(`wrote registry/skills-index.json (${idx.count} skills)`);
}

function cmdSearch() {
  const q = args._.join(' ');
  if (!q) die('usage: cstack search "<request>"');
  const idx = readJSON(path.join(ROOT, 'registry', 'skills-index.json'));
  const hits = search(idx, q, Number(args.k ?? 5));
  if (args.json) return json(hits);
  if (!hits.length) return console.log('no matching skill; try /brief to frame the request');
  for (const h of hits) console.log(`${String(h.score).padStart(5)}  ${h.slug.padEnd(24)} [${h.type}] ${h.summary}`);
}

function cmdBudget() {
  const skills = listSkills();
  if (args.ratchet || args.accept) {
    const accept = args.accept ? String(args.accept).split(',') : [];
    if (accept.length && !args.reason) die('--accept needs --reason "why the extra context is necessary"');
    ratchet(skills, { accept, reason: args.reason ?? '' });
    console.log('context budgets updated: evals/static/context-budgets.json');
  }
  const res = checkBudgets(skills);
  if (args.json) return json(res);
  console.log('skill'.padEnd(26), 'tokens'.padStart(7), 'ceiling'.padStart(8), 'on-demand'.padStart(10), ' status');
  for (const r of res.rows) console.log(r.slug.padEnd(26), String(r.tokens).padStart(7), String(r.ceiling ?? '-').padStart(8), String(r.on_demand).padStart(10), ' ' + r.status);
  console.log(`catalog (always-loaded names+descriptions): ${res.catalog.tokens} tokens, ceiling ${res.catalog.ceiling ?? '-'} → ${res.catalog.status}`);
  const over = res.rows.filter((r) => r.status === 'over');
  if (over.length) console.log(`\nOVER BUDGET: ${over.map((o) => o.slug).join(', ')}. Move detail into references/ or skills/cstack-shared/, or run: cstack budget --accept <slug> --reason "..."`);
  if (args.check) process.exit(res.ok ? 0 : 1);
}

function cmdHealth() {
  const rep = healthReport();
  if (args.json) return json(rep);
  console.log(rep.text);
}

function cmdPrompt(sub) {
  if (sub === 'compile') {
    const f = args._[0];
    if (!f) die('usage: cstack prompt compile <recipe.yaml> [--seed N] [--set slot=value]... (repeat --set per slot; values may contain commas)');
    const recipe = readData(path.resolve(f));
    const values = {};
    for (const kv of args.set ?? []) {
      const eq = String(kv).indexOf('=');
      if (eq < 1) die(`--set expects slot=value, got "${kv}"`);
      values[String(kv).slice(0, eq)] = String(kv).slice(eq + 1);
    }
    const res = compile(recipe, { values, seed: args.seed, names: canonNames() });
    if (args.json) json(res);
    else {
      if (res.ok) console.log(res.prompt + '\n');
      for (const e of res.errors) console.log(`FAIL ${e}`);
      console.log(`hash ${res.hash.slice(0, 16)}  ${res.ok ? 'OK' : 'FAILED'}`);
    }
    process.exit(res.ok ? 0 : 1);
  }
  if (sub === 'diff') {
    const [a, b] = args._;
    if (!a || !b) die('usage: cstack prompt diff a.yaml b.yaml');
    const d = diffRecipes(readData(path.resolve(a)), readData(path.resolve(b)));
    if (args.json) return json(d);
    if (!d.length) return console.log('no component changes');
    for (const x of d) console.log(`${x.part}: ${x.change ?? `${JSON.stringify(x.from)} → ${JSON.stringify(x.to)}`}`);
    if (d.length > 1) console.log(`\nnote: ${d.length} components changed; refinement should change one meaningful variable`);
    return;
  }
  die('usage: cstack prompt compile|diff ...');
}

function cmdRoute() {
  const regPath = exists(path.join(ws, 'registry', 'models.json')) ? path.join(ws, 'registry', 'models.json') : path.join(ROOT, 'registry', 'models.json');
  const reg = readJSON(regPath);
  const req = {
    modality: args.modality,
    needs: args.needs ? String(args.needs).split(',') : [],
    avoid: args.avoid ? String(args.avoid).split(',') : [],
    task: args.task,
    max_cost: args['max-cost'] != null ? Number(args['max-cost']) : undefined,
    providers_available: args.providers ? String(args.providers).split(',') : undefined,
  };
  if (!req.modality) die('usage: cstack route --modality <m> [--needs a,b] [--task t] [--max-cost n] [--providers fal,openai]');
  const res = route(reg, req);
  if (args.json) return json(res);
  for (const c of res.candidates) console.log(`${String(c.score).padStart(4)}  ${c.model_id.padEnd(34)} ${c.provider.padEnd(12)} ${c.why}`);
  console.log(`\nfallback chain: ${res.chain.join(' → ') || '(none)'}`);
  for (const w of res.warnings) console.log(`WARN ${w}`);
  console.log(`registry: ${rel(regPath)} (snapshot; the /model-router skill re-verifies live docs for important batches)`);
}

function cmdSpend(sub) {
  if (sub === 'plan') {
    const items = readData(path.resolve(args._[0] ?? die('usage: cstack spend plan <items.json> --stop "..."')));
    const res = planBatch(ws, items, { stop_condition: args.stop });
    json(res);
    process.exit(res.ok ? 0 : 1);
  }
  if (sub === 'summary') {
    const rows = readLedger(ws);
    const by = {};
    for (const r of rows) {
      const k = `${r.provider}/${r.model ?? '-'}`;
      by[k] ??= { calls: 0, ok: 0, failed: 0, dedup: 0, dry: 0 };
      by[k].calls++;
      if (r.status === 'ok') by[k].ok++;
      else if (r.status?.startsWith('failed')) by[k].failed++;
      else if (r.status === 'deduplicated') by[k].dedup++;
      else if (r.status === 'dry_run') by[k].dry++;
    }
    const cur = args.currency ?? 'USD';
    if (args.json) return json({ by, spent: spent(rows, { currency: cur, since: args.since }) });
    for (const [k, v] of Object.entries(by)) console.log(`${k.padEnd(40)} calls ${v.calls}  ok ${v.ok}  failed ${v.failed}  dedup ${v.dedup}  dry ${v.dry}`);
    console.log(`spent ${spent(rows, { currency: cur, since: args.since })} ${cur}${args.since ? ` since ${args.since}` : ''}`);
    return;
  }
  die('usage: cstack spend plan|summary');
}

function cmdLineage() {
  if (args.show) {
    const rows = readJSONL(path.join(ws, 'state', 'lineage.jsonl')).filter((r) => r.artifact_id === args.show);
    if (args.json) return json(rows);
    for (const r of rows) console.log(summarizeLineage(r) + '\n');
    return;
  }
  if (!args.file) die('usage: cstack lineage --file entry.json | --show <artifact_id>');
  const rec = recordLineage(ws, readData(path.resolve(args.file)));
  console.log(summarizeLineage(rec));
}

function appendValidated(schema, file, target) {
  const obj = readData(path.resolve(file));
  obj.id ??= newId({ 'feedback-event': 'FB', 'failure-event': 'FAIL', eval: 'EV' }[schema] ?? 'LE');
  obj.date ??= today();
  const v = validateValue(schema, obj);
  if (!v.ok) die(`invalid ${schema}: ${v.errors}`);
  appendJSONL(path.join(ws, 'state', target), obj);
  console.log(`appended ${obj.id} to state/${target}`);
}

function cmdExperiment(sub) {
  const id = args._[0];
  if (!id) die('usage: cstack experiment init|log|status <run_id>');
  if (sub === 'init') return console.log(experimentInit(ws, id, args));
  if (sub === 'log') return console.log(experimentLog(ws, id, readData(path.resolve(args.file ?? die('--file row.json required')))));
  if (sub === 'status') {
    const s = experimentStatus(ws, id);
    return args.json ? json(s) : console.log(s.text);
  }
  die('usage: cstack experiment init|log|status <run_id>');
}

function cmdLearn(sub) {
  if (sub === 'add') return appendValidated('learning-event', args.file ?? die('--file required'), 'learnings.jsonl');
  if (sub === 'candidates') return json(learningCandidates(ws));
  if (sub === 'promote') return console.log(promoteLearning(ws, args._[0], { to: args.to, by: args.by }));
  die('usage: cstack learn add|candidates|promote');
}

function cmdBrand(sub) {
  if (sub === 'init') {
    const dir = path.resolve(args._[0] ?? die('usage: cstack brand init <dir> --name "Brand"'));
    console.log(initBrand(dir, { name: args.name, id: args.id }));
    return;
  }
  requireWs();
  if (sub === 'check') {
    const r = checkBrand(ws);
    r.print(`brand check ${rel(ws)}`);
    process.exit(r.ok ? 0 : 1);
  }
  if (sub === 'set') {
    const field = args._[0] ?? die('usage: cstack brand set <section.field> --file field.json');
    if (!args.file || !/\.json$/i.test(String(args.file))) die('--file <field>.json required: one JSON object with value and sources');
    const res = applyToBrand(ws, field, readData(path.resolve(args.file)));
    if (args.json) return json(res);
    console.log(`${field}: ${res.action}${res.reason ? ` (${res.reason})` : ''}`);
    const st = staleArtifacts(ws);
    if (st.length) console.log(`now stale: ${st.map((a) => `${a.artifact_id} v${a.version}`).join(', ')}`);
    return;
  }
  if (sub === 'context') {
    const ctx = brandContext(ws, { sections: args.sections ? String(args.sections).split(',') : undefined, includeInferred: !!args.inferred });
    return json(ctx);
  }
  if (sub === 'resolve') {
    const id = args._[0] ?? die('usage: cstack brand resolve <conflict-id> --pick 1|2 [--by name]');
    try {
      if (!['1', '2'].includes(String(args.pick))) die('--pick 1|2 required: the owner chooses a position; nothing is picked by default');
      const r = resolveConflict(ws, id, { pick: args.pick, by: args.by, note: args.note });
      return console.log(`${r.conflict} resolved: ${r.field} = ${JSON.stringify(r.value)} (stale artifacts: cstack brand stale)`);
    } catch (e) {
      die(e.message);
    }
  }
  if (sub === 'stale') {
    const st = staleArtifacts(ws);
    if (args.json) return json(st);
    if (!st.length) return console.log('no stale artifacts');
    for (const a of st) console.log(`${a.artifact_id} v${a.version}: brand inputs changed (${a.changed.join(', ')})`);
    return;
  }
  die('usage: cstack brand init|check|set|context|stale|resolve');
}

async function cmdGenerate() {
  const req = readData(path.resolve(args.file ?? die('usage: cstack generate --file request.json [--dry-run]')));
  if (args['dry-run']) req.dry_run = true;
  if (args['confirm-unpriced']) req.confirm_unpriced = true;
  if (args.confirm) req.confirmed = true;
  const res = await runMedia(ws, req);
  if (args.json) return json(res);
  if (res.dry_run) return console.log(`dry run logged (${req.provider}/${req.model}); nothing was paid`);
  if (res.blocked) die(`blocked by budget: ${res.problems.join('; ')}`);
  if (res.deduplicated) return console.log(`identical call already done: ${res.output_ids.join(', ')} (not paid again)`);
  if (res.pending) return console.log(`job still running at the provider; run \`cstack generate\` again with the same request to re-attach (never resubmits)`);
  if (res.failed) die(`${res.row.status}: ${res.row.error}`);
  for (const o of res.output_ids) console.log(`wrote ${o} (+ ${o}.gen.json)`);
}

function cmdAudit() {
  const f = path.resolve(args._[0] ?? die('usage: cstack audit <file> --aspect 4:5 | --size 1080x1350'));
  const actual = imageSize(f);
  const expected = args.size ? { width: Number(String(args.size).split('x')[0]), height: Number(String(args.size).split('x')[1]) } : args.aspect ? { aspect: String(args.aspect) } : die('--aspect or --size required');
  const res = sizeAudit(actual, expected);
  if (args.json) return json({ actual, ...res });
  console.log(`${rel(f)} ${actual.width}x${actual.height}: ${res.ok ? 'PASS' : 'FAIL'}`);
  for (const x of res.findings) console.log(`  ${x.level ?? ''} ${x.detail}`);
  process.exit(res.ok ? 0 : 1);
}

async function cmdTaste(sub) {
  const t = getProvider('taste-labs');
  if (['search', 'extract', 'verify'].includes(sub) && t.available && !t.available(process.env)) die(`MISSING: ${(t.env ?? ['TASTE_API_KEY']).join(', ')} not set; Taste Labs is unavailable here (fallback: local libraries + browse)`);
  const ended = (res) => {
    if (res.blocked) die(`blocked by budget: ${res.problems.join('; ')}`);
    if (res.failed) die(`${res.row.status}: ${res.row.error}`);
    if (res.dry_run) { console.log('dry run logged; nothing was paid'); process.exit(0); }
    return res;
  };
  const spec = (operation, params) => ({ provider: 'taste-labs', model: t.versions?.[operation === 'search' ? 'search' : operation === 'extract' ? 'extractor' : 'verifier'] ?? 'n/a', operation, params, skill: args.skill, estimated_cost: null, confirm_unpriced: !!args['confirm-unpriced'], confirmed: !!args.confirm, stop_condition: 'single call' });
  const save = (kind, obj) => {
    const dir = path.join(ws, 'references', '_taste');
    const p = path.join(dir, `${kind}-${today()}-${newId('T').slice(-6)}.json`);
    writeJSON(p, obj);
    return rel(p);
  };
  if (sub === 'search') {
    const intent = args._[0] ?? die('usage: cstack taste search "intent" [--k 6] [--depth fast|deep]');
    const params = { intent, k: Number(args.k ?? 6), depth: args.depth ?? 'fast' };
    const res = ended(await guardedCall(ws, spec('search', params), async () => { const r = await t.search(params); return { output_ids: [save('search', r)], result: r }; }));
    return res.result ? json(res.result.results.map((c) => ({ rank: c.rank, name: c.name, url: c.url, reason: c.reason }))) : json(res);
  }
  if (sub === 'extract') {
    const url = args._[0] ?? die('usage: cstack taste extract <url>');
    const res = ended(await guardedCall(ws, spec('extract', { url }), async () => { const r = await t.extract({ url, deep: !!args.deep }); return { output_ids: [save('extract', r)], result: r }; }));
    return console.log(res.output_ids ? `raw design system saved: ${res.output_ids[0]} (normalise with /brand-import; never write it straight into brand state)` : JSON.stringify(res));
  }
  if (sub === 'verify') {
    const reference = args.reference ?? die('--reference <url> required');
    const candidate = args.candidate ?? die('--candidate <public url> required');
    const res = ended(await guardedCall(ws, spec('verify', { reference, candidate }), async () => { const r = await t.verify({ reference, candidate }); return { output_ids: [save('verify', r)], result: r }; }));
    return json(res.result ?? res);
  }
  die('usage: cstack taste search|extract|verify');
}

function cmdTokens(sub) {
  if (sub === 'check') {
    const r = checkTokens(ws);
    if (args.json) return json(r);
    console.log(`${r.count} tokens; ${r.ok ? 'PASS' : 'FAIL'}`);
    for (const p of r.problems) console.log(`  FAIL ${p}`);
    process.exit(r.ok ? 0 : 1);
  }
  if (sub === 'build') {
    const r = buildCSS(ws, { out: args.out ? path.resolve(args.out) : undefined });
    return console.log(`wrote ${r.count} custom properties to ${r.file}`);
  }
  if (sub === 'lint') {
    const files = args._.map((f) => path.resolve(f));
    if (!files.length) die('usage: cstack tokens lint <files...> [--allow #ffffff,#000000]');
    const r = lintRaw(ws, files, { allow: args.allow ? String(args.allow).split(',') : [] });
    if (args.json) return json(r);
    for (const x of r.findings) console.log(`${rel(x.file)}:${x.line} ${x.value} ${x.detail}`);
    console.log(r.ok ? 'tokens lint: PASS' : `tokens lint: FAIL (${r.findings.length})`);
    process.exit(r.ok ? 0 : 1);
  }
  die('usage: cstack tokens check|build|lint');
}

function cmdEvals(sub) {
  if (sub !== 'plan') die('usage: cstack evals plan [--since ref] [--files a,b]');
  const p = evalPlan({ since: args.since, files: args.files ? String(args.files).split(',') : undefined });
  if (args.json) return json(p);
  console.log(p.text);
}

function cmdLint(sub) {
  if (sub !== 'shot-dna') die('usage: cstack lint shot-dna <file...>');
  const files = args._.map((f) => path.resolve(f));
  const rows = files.length
    ? files.map((f) => {
        if (!exists(f)) die(`not found: ${f}`);
        return { file: rel(f), findings: lintShotDNA(readData(f)).findings };
      })
    : lintShotDNATree(ROOT);
  if (args.json) return json(rows);
  for (const x of rows) for (const f of x.findings) console.log(`WARN ${x.file}: ${f.field}: ${f.detail}`);
  const n = rows.reduce((a, x) => a + x.findings.length, 0);
  console.log(`shot-dna lint: ${n ? `${n} warning(s)` : 'PASS'} (${files.length || 'repo'} ${files.length === 1 ? 'file' : 'files'})`);
  if (args.strict && n) process.exit(1);
}

async function cmdEdit(sub) {
  if (sub !== 'paste') die('usage: cstack edit paste --base a.png --patch b.png --x N --y N [--feather 8] [--region x,y,w,h] --out c.png');
  const { regionPaste } = await import('../providers/local/region_paste.mjs');
  for (const k of ['base', 'patch', 'x', 'y', 'out']) if (args[k] === undefined || args[k] === true) die(`--${k} required. usage: cstack edit paste --base a.png --patch b.png --x N --y N [--feather 8] --out c.png`);
  try {
    const res = await regionPaste({ base: args.base, patch: args.patch, x: args.x, y: args.y, feather: args.feather ?? 8, region: args.region, out: args.out, engine: args.engine ?? 'auto', force: !!args.force });
    const here = (p) => path.relative(process.cwd(), p) || p;
    if (args.json) return json({ ...res, out: here(res.out), base: here(res.base), patch: here(res.patch) });
    console.log(`wrote ${here(res.out)} ${res.width}x${res.height} (engine ${res.engine.name}; changed box ${res.changed_box ? `${res.changed_box.x},${res.changed_box.y} ${res.changed_box.w}x${res.changed_box.h}` : 'none: patch outside base'}; feather ${res.feather}px; inputs untouched)`);
  } catch (e) {
    die(e.message);
  }
}

function cmdSetup() {
  let res;
  try {
    res = installHosts({ host: args.host ?? 'default', target: args.target ? path.resolve(args.target) : undefined, copy: !!args.copy, dryRun: !!args['dry-run'] });
  } catch (e) {
    die(`setup: ${e.message}`);
  }
  for (const l of res) console.log(l);
}

const two = argv[0] && !argv[0].startsWith('--') ? `${cmd} ${argv[0]}` : null;
if (two && ['brand', 'prompt', 'spend', 'experiment', 'learn', 'evals', 'taste', 'tokens', 'browse', 'lint', 'edit', 'type', 'flows', '3d', 'svg', 'mockup', 'video'].includes(cmd)) {
  args._.shift();
}
// Unknown flags: a typo like --dryrun must never fall through to a paid call. Known = every flag the
// help documents plus every flag this file reads. Media CLIs (type, video, svg, mockup, browse, 3d) check their own.
if (!['type', 'video', 'svg', 'mockup', 'browse', '3d'].includes(cmd)) {
  const src = fs.readFileSync(new URL(import.meta.url), 'utf8');
  const known = new Set(['ws', ...BOOLEAN_FLAGS, ...REPEATABLE_FLAGS]);
  for (const m of Object.values(COMMANDS).join(' ').matchAll(/--([a-z][a-z0-9-]*)/g)) known.add(m[1]);
  for (const m of src.matchAll(/args(?:\.([a-z][a-z0-9_]*)|\['([a-z][a-z0-9-]*)'\])/g)) known.add(m[1] ?? m[2]);
  const unknown = Object.keys(args).filter((k) => k !== '_' && !known.has(k));
  if (unknown.length) {
    const msg = `unknown flag${unknown.length > 1 ? 's' : ''}: ${unknown.map((k) => `--${k}`).join(', ')} (see cstack help)`;
    if (['generate', 'spend', 'taste'].includes(cmd)) die(`refused: ${msg}; spending commands never guess at flags`);
    console.error(`warning: ${msg}; ignored`);
  }
}
switch (cmd) {
  case undefined:
  case 'help':
  case '--help':
  case '-h':
    help();
    break;
  case 'validate':
    cmdValidate();
    break;
  case 'index':
    cmdIndex();
    break;
  case 'search':
    cmdSearch();
    break;
  case 'health':
    cmdHealth();
    break;
  case 'budget':
    cmdBudget();
    break;
  case 'prompt':
    cmdPrompt(argv[0]);
    break;
  case 'route':
    cmdRoute();
    break;
  case 'spend':
    cmdSpend(argv[0]);
    break;
  case 'lineage':
    cmdLineage();
    break;
  case 'feedback':
    appendValidated('feedback-event', args.file ?? die('--file required'), 'feedback.jsonl');
    break;
  case 'failure':
    appendValidated('failure-event', args.file ?? die('--file required'), 'failures.jsonl');
    break;
  case 'eval':
    appendValidated('eval', args.file ?? die('--file required'), 'evals.jsonl');
    break;
  case 'generate':
    await cmdGenerate();
    break;
  case 'workflow': {
    if (argv[0] && argv[0] !== 'list') die('usage: cstack workflow list [--json]');
    const dir = path.join(ROOT, 'workflows');
    const rows = fs.readdirSync(dir).filter((d) => exists(path.join(dir, d, 'workflow.yaml'))).map((d) => readData(path.join(dir, d, 'workflow.yaml')));
    if (args.json) json(rows.map(({ name, status, summary, methods, steps }) => ({ name, status, summary, methods: methods ?? [], steps: (steps ?? []).length })));
    else for (const w of rows) console.log(`${w.name.padEnd(20)} ${String(w.status).padEnd(9)} ${w.summary}${w.methods?.length ? `\n${' '.repeat(31)}methods: ${w.methods.join(', ')}` : ''}`);
    break;
  }
  case 'jobs': {
    requireWs();
    const p = listPending(ws);
    if (args.json) json(p);
    else console.log(p.length ? p.map((j) => `${j.provider}/${j.model} ${j.request_id ?? ''} since ${j.submitted_at ?? '?'}`).join('\n') : 'no pending jobs');
    break;
  }
  case 'flows': {
    const sub = argv[0];
    if (sub === 'list' || !sub) {
      const fl = listFlows(ws);
      if (args.json) json(fl);
      else for (const f of fl) console.log(`${(f.stale ? 'STALE' : f.status).padEnd(10)}  ${f.id.padEnd(30)} ${f.outcome}${f.scope === 'workspace' ? '  (workspace)' : ''}`);
    } else if (sub === 'search') {
      const res = searchFlows(ws, args._.join(' ') || die('usage: cstack flows search "<outcome>"'));
      if (args.json) json(res);
      else if (!res.length) console.log('no researched flow matches; run /flow-research to design one before making anything');
      else for (const r of res) console.log(`${String(r.score).padStart(3)}  ${r.flow.id.padEnd(30)} ${r.flow.outcome}${r.flow.stale ? '  [STALE: re-verify before use]' : ''}`);
    } else if (sub === 'show') {
      const f = listFlows(ws).find((x) => x.id === args._[0]) ?? die(`no flow "${args._[0]}"`);
      if (args.json) json(f);
      else console.log(fs.readFileSync(f.file, 'utf8') + (f.stale ? `\n# STALE: last verified ${f.last_verified} (${f.age_days} days); re-verify tools and models before following it\n` : ''));
    } else if (sub === 'plan') {
      const r = planFromFlow(ws, args._[0] ?? die('usage: cstack flows plan <id> [--target "..."]'), { target: args.target });
      const shown = path.relative(process.cwd(), r.file);
      console.log(`plan written: ${shown}${r.stale ? `\nwarning: source flow is stale (${r.age_days} days); re-verify tools and models first` : ''}\nnext: adjust steps and target to this run, then cstack flows check ${shown}`);
    } else if (sub === 'check') {
      if (!args._.length) die('usage: cstack flows check <plan.flow.yaml...>');
      const slugs = listSkills().map((s) => s.slug);
      const res = args._.map((f) => checkFlowFile(ws, path.resolve(f), { skills: slugs }));
      if (args.json) json(res);
      else for (const x of res) {
        console.log(`${x.errors.length ? 'FAIL' : 'PASS'}  ${path.relative(process.cwd(), x.file)}`);
        for (const e of x.errors) console.log(`  error: ${e}`);
        for (const w of x.warnings) console.log(`  warn:  ${w}`);
      }
      if (res.some((x) => x.errors.length)) process.exitCode = 1;
    } else die('usage: cstack flows list|search|show|plan|check');
    break;
  }
  case 'browse': {
    const { runBrowse } = await import('../scripts/lib/browser/cli.mjs');
    const out = await runBrowse(argv[0] ?? 'help', args, ws);
    if (typeof out === 'string') console.log(out);
    else json(out);
    if ((typeof out === 'string' && /^VERDICT=FAIL/m.test(out)) || out?.result?.ok === false) process.exitCode = 1;
    break;
  }
  case 'type': {
    const { runType } = await import('../scripts/lib/type/cli.mjs');
    const out = await runType(argv[0] ?? 'help', argv.slice(1), ws);
    console.log(typeof out === 'string' ? out : out.text);
    if (out?.ok === false) process.exitCode = 1;
    break;
  }
  case 'video': {
    const { runVideo } = await import('../scripts/lib/video/cli.mjs');
    const out = await runVideo(argv[0] ?? 'help', argv.slice(1), ws);
    console.log(typeof out === 'string' ? out : out.text);
    if (out?.ok === false) process.exitCode = 1;
    break;
  }
  case 'mockup': {
    const { runMockup } = await import('../scripts/lib/mockup/cli.mjs');
    const out = await runMockup(argv[0] ?? 'help', args, ws);
    if (typeof out === 'string') console.log(out);
    else json(out);
    if (out?.ok === false) process.exitCode = 1;
    break;
  }
  case 'svg': {
    const { runSvg } = await import('../scripts/lib/svg/cli.mjs');
    const out = await runSvg(argv[0] ?? 'help', argv.slice(1), ws);
    console.log(typeof out === 'string' ? out : args.json ? JSON.stringify(out.report ?? out, null, 2) : out.text);
    if (out?.ok === false) process.exitCode = 1;
    break;
  }
  case '3d': {
    const { runThree } = await import('../scripts/lib/three/cli.mjs');
    const out = await runThree(argv[0] ?? 'help', args, ws);
    if (typeof out === 'string') console.log(out);
    else json(out);
    if (out?.ok === false) process.exitCode = 1;
    break;
  }
  case 'tools': {
    const mcp = String(args.mcp ?? process.env.CSTACK_MCP_SERVERS ?? '').split(',').filter(Boolean);
    const res = detectTools(ws, { mcpServers: mcp });
    if (args.json) json(res);
    else {
      for (const t of res) console.log(`${t.available ? 'YES' : ' - '}  ${t.name.padEnd(26)} ${t.available ? t.signals.join('; ') : `fallback: ${t.fallback ?? 'none'}`}`);
      if (!mcp.length) console.log('\nnote: MCP servers visible to the agent were not passed (--mcp); MCP-only tools may be under-reported.');
    }
    break;
  }
  case 'providers':
    json(availability());
    break;
  case 'audit':
    cmdAudit();
    break;
  case 'taste':
    await cmdTaste(argv[0]);
    break;
  case 'tokens':
    cmdTokens(argv[0]);
    break;
  case 'preamble':
    console.log(fs.readFileSync(path.join(ROOT, 'skills', 'cstack-shared', 'PREAMBLE.md'), 'utf8'));
    break;
  case 'experiment':
    cmdExperiment(argv[0]);
    break;
  case 'learn':
    cmdLearn(argv[0]);
    break;
  case 'brand':
    cmdBrand(argv[0]);
    break;
  case 'evals':
    cmdEvals(argv[0]);
    break;
  case 'setup':
    cmdSetup();
    break;
  case 'lint':
    cmdLint(argv[0]);
    break;
  case 'edit':
    await cmdEdit(argv[0]);
    break;
  default:
    die(`unknown command "${cmd}". Run: cstack help`);
}
