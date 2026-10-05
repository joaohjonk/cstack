// cstack CLI (loaded by bin/cstack.mjs after its dependency check): the deterministic half of the stack. Skills hold judgment; this holds the gates.
// Run `cstack help` for commands. Every command is safe by default (read-only or append-only)
// unless it says otherwise.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ROOT, Report, readData, readJSON, writeJSON, exists, rel, shown, readJSONL, appendJSONL, newId, today, nowISO, walk } from '../scripts/lib/core.mjs';
import { schemaNames, validator, validateTree, validateValue } from '../scripts/lib/schemas.mjs';
import { listSkills, checkSkill, buildIndex, search, duplicateLines } from '../scripts/lib/skills.mjs';
import { checkBudgets, ratchet } from '../scripts/lib/budget.mjs';
import { compile, diffRecipes } from '../scripts/lib/prompt.mjs';
import { canonNames } from '../scripts/lib/prompt-names.mjs';
import { route, leaderboardWarning } from '../scripts/lib/router.mjs';
import { planBatch, readLedger, spent, loadBudget } from '../scripts/lib/ledger.mjs';
import { record as recordLineage, summarize as summarizeLineage } from '../scripts/lib/lineage.mjs';
import { initBrand, checkBrand, applyToBrand, staleArtifacts, brandContext, taskContext, resolveConflict } from '../scripts/lib/brand.mjs';
import { buildGuide } from '../scripts/lib/guide.mjs';
import { imageSize, sizeAudit } from '../scripts/lib/image.mjs';
import { checkTokens, buildCSS, lintRaw } from '../scripts/lib/tokens.mjs';
import { detectTools } from '../scripts/lib/tools.mjs';
import { approveBrief, reopenBrief } from '../scripts/lib/brief.mjs';
import { listFlows, searchFlows, searchWorkflows, planFromFlow, checkFlow, checkFlowFile, gateFlow, GATE_STAGES } from '../scripts/lib/flows.mjs';
import { runMedia, listPending, priceRequest, registryPrice } from '../providers/runner.mjs';
import { availability, getProvider, checkProviderRegistry } from '../providers/index.mjs';
import { lintShotDNA, lintShotDNATree } from '../scripts/lib/lint.mjs';
import { guardedCall } from '../scripts/lib/ledger.mjs';
import { experimentInit, experimentLog, experimentStatus } from '../scripts/lib/experiment.mjs';
import { evalPlan, checkFixtures, loadFixtures } from '../scripts/lib/evalplan.mjs';
import { runFixture, selectFixtures, evalRecords, tokenize } from '../scripts/lib/evalrun.mjs';
import { makeSheet, importPicks, renderPNG } from '../scripts/lib/sheet.mjs';
import { reconcile, billedVsEstimated } from '../scripts/lib/billing.mjs';
import { checkText } from '../scripts/lib/textcheck.mjs';
import { healthReport } from '../scripts/lib/health.mjs';
import { promoteLearning, learningCandidates } from '../scripts/lib/learn.mjs';
import { installHosts, hostIds, loadHosts } from '../scripts/lib/hosts.mjs';
import { checkForUpdate, runUpdate, snooze, setConfig, readConfig, recordInstall, installsToRefresh, stateDir } from '../scripts/lib/update.mjs';
import { checkLinks } from '../scripts/lib/links.mjs';
import { loadEnvFile } from '../scripts/lib/envfile.mjs';
import { report as creativeReport, checkBet, checkFamily, checkPlan, readPerformance, families as taxFamilies } from '../scripts/lib/creative.mjs';
import { parseCSV, rowsToRecords } from '../providers/evidence/csv.mjs';

const [, , cmd, ...argv] = process.argv;

// Flags that never take a value: they must not swallow the next word (`--strict file.yaml`).
const BOOLEAN_FLAGS = new Set(['key-visual', 'json', 'workflows', 'dry-run', 'confirm', 'confirm-unpriced', 'strict', 'ratchet', 'check', 'inferred', 'force', 'copy', 'deep', 'full', 'compact', 'interactive', 'internal', 'allow-mutation', 'no-background', 'write', 'refresh', 'snooze', 'all', 'record', 'blind', 'png']);
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
// --env-from <file>: provider keys from a .env file, read here so no shell prints it (F47); values never shown
if (args['env-from'] !== undefined) {
  if (args['env-from'] === true || !fs.existsSync(path.resolve(args['env-from']))) {
    console.error('--env-from needs an existing file');
    process.exit(1);
  }
  const names = [...new Set(availability().flatMap((p) => p.needs ?? []).concat(['FAL_ADMIN_KEY']))];
  const r = loadEnvFile(path.resolve(args['env-from']), names);
  const parts = [r.loaded.length ? `loaded ${r.loaded.join(', ')}` : 'loaded nothing', r.skipped.length ? `kept the shell's ${r.skipped.join(', ')}` : '', r.malformed.length ? `skipped malformed line(s) ${r.malformed.join(', ')} (not shown)` : ''].filter(Boolean);
  console.error(`env: ${parts.join('; ')} from ${path.basename(args['env-from'])}; values are never printed`);
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
  'brand context': 'compact, cache-stable brand facts for a prompt: cstack brand context [--sections voice,color | --task copy] [--inferred] (--task reads brand/context-map.yaml and adds the files that task needs)',
  'brand guide': 'write brand/generated/guide.html, the human-readable guide built from the same brand files agents read: cstack brand guide [--out file.html]',
  'brand stale': 'artifacts whose brand inputs changed since they were made',
  'brand resolve': 'owner resolves an open conflict by picking a position: cstack brand resolve <conflict-id> --pick 1|2 [--by name] [--note "..."]',
  'prompt compile': 'compile a prompt recipe: cstack prompt compile <recipe.yaml> [--seed N] [--set slot=value]... (one --set per slot)',
  'prompt diff': 'component-level diff of two recipes: cstack prompt diff a.yaml b.yaml',
  route: 'rank models (flagship first; --tier draft ranks cheap probe models first): cstack route --modality image --needs image-edit,text-rendering [--task t] [--max-cost 0.2] [--providers fal,openai] [--avoid id,...] [--tier draft|final]',
  'spend plan': 'estimate a batch before paying: cstack spend plan <items.json> --stop "condition" --ws <dir>',
  'spend summary': 'ledger summary for a workspace: --ws <dir> [--since YYYY-MM-DD]; with billed amounts, estimate vs billed',
  'spend reconcile': 'fetch what a provider billed for each paid request: cstack spend reconcile --provider <id> --ws <dir> [--since YYYY-MM-DD] [--dry-run] (adapters with a billing lookup: fal, which needs FAL_ADMIN_KEY or FAL_KEY)',
  generate: 'guarded media call (dedupe, budget, pending jobs, sidecar, size audit): cstack generate --file request.json [--dry-run] [--confirm (owner approved a call above confirm_over)] [--confirm-unpriced]',
  jobs: 'provider jobs still pending (resume, never resubmit)',
  tools: 'which research tools / MCPs are usable (registry/research-tools.json): cstack tools [--mcp "Figma,mobbin"] (pass the MCP server names you can see)',
  providers: 'which providers are usable here (env vars present) and which are stubs; merges registry/providers.json. Pass --mcp "Server,…" (or CSTACK_MCP_SERVERS) to add agent_mcp, the same answer `cstack tools` gives',
  'lint shot-dna': 'warn when Shot DNA lighting is adjectives, not a recipe: cstack lint shot-dna <file...> (no file: every *.shot-dna.* in the repo)',
  'edit paste': 'paste a patch onto a base with a feathered edge, writing a new file: cstack edit paste --base a.png --patch b.png --x N --y N [--feather 8] [--region x,y,w,h] --out c.png',
  'image text': 'stop on lettering or logos in generated images: cstack image text <images|folders...> [--engine auto|tesseract|judge] [--judge "<cmd>"] [--json] (exit 1 when any image shows text)',
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
  'svg legibility': 'can a figure be read where it is shown: text size at each display width and text contrast on its ground: cstack svg legibility <file|dir...> [--width 324,830] [--min-px 11] [--page #ffffff,#0d1117]; exits 1 on FAIL',
  'svg lint': 'lint marks and icon sets: structure and security, viewBox, complexity, palette, strokes across a set, grid against an icon grammar: cstack svg lint <file|dir...> [--grammar icons.tokens.json] [--palette ...]; exits 1 on FAIL',
  'svg reduce': 'does a mark survive small sizes? renders 16-64 px on white, black and one colour, fails where counters close or parts merge (Chromium): cstack svg reduce <file.svg|png> [--sizes 16,24,32,48,64]',
  'svg kit': 'favicon and app-icon kit from a vector master (svg, ico, apple-touch, 192/512, maskable with the safe zone checked, manifest): cstack svg kit <file.svg> --out dir [--bg #fff] [--name "Brand"]',
  '3d inspect': 'check a GLB/glTF against a delivery budget: bytes, triangles, textures, real-world size, origin, compression; model text is untrusted: cstack 3d inspect <file> [--budget web-hero|ar|social] [--dims 70x210x70mm]; exits 1 on FAIL',
  '3d frames': 'check an image-sequence hero: frame count, total and per-frame bytes, one size, no gaps, format: cstack 3d frames <dir> [--max-frames 150] [--max-bytes 8MB]; exits 1 on FAIL',
  '3d blender-script': 'write a Blender turntable or packshot script the owner runs (no Blender needed here): cstack 3d blender-script --glb <file> --mode turntable|packshot [--size 1080x1920] [--frames N] [--seconds S] [--out script.py]',
  'creative import': 'ads export (CSV) → state/performance.jsonl, tags from family-named columns: cstack creative import <file.csv> --channel meta [--preset meta-ads-manager|tiktok-ads|generic] [--map \'{"spend":"Their Header"}\'] [--period 2026-09] [--currency USD] [--dry-run] --ws <dir>',
  'creative report': 'observations only from state/performance.jsonl: groups by taxonomy family against the account median, spend concentration, confounds, fatigue; below the data minimums nothing is read: cstack creative report --ws <dir> [--family format] [--min-spend 50] [--min-impressions 2000] [--min-ads 3] [--concentration 0.6] [--write (append to state/insights.jsonl)] [--json]',
  'creative check': 'gate a creative bet (experiment design), family (winner-scaler) or production plan (asset-factory) by its file name: cstack creative check <x.creative-bet.yaml|x.creative-family.yaml|x.production-plan.yaml> --ws <dir>; exits 1 on errors',
  'workflow list': 'the gated workflows (outcome → skills in order, owner gates) and the methods each one follows',
  'flows list': 'researched best-way-to-an-outcome flows (cstack flows/ + workspace flows/), with staleness',
  'flows search': 'find the flow for an outcome before making anything: cstack flows search "rotating 3d product on the homepage" [--json [--workflows]]; also lists the workflows that cover the outcome',
  'flows show': 'print one flow: cstack flows show <id>',
  'flows plan': 'copy a flow into this run\'s plan, deliverable included: cstack flows plan <id> [--target "what as-close-as-possible means"] [--deliverable image|video|3d|vector|type|diagram|page|copy|other] [--key-visual] → work/flows/',
  'flows gate': 'before making, deciding and calling it final: cstack flows gate <plan> --stage make|decide|final. make: plan passes check, deliverable stated, imagery has a usable media provider here (or the owner approved a substitute); decide: 2+ territories with probe sheets; final: gold references exist and the work sits side by side with one. Exits 1 on FAIL',
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
  'brief approve': "record the founder's yes to a founder brief, with a fingerprint the make gate checks: cstack brief approve <briefs/x.founder-brief.yaml> --by <founder>",
  'brief reopen': 'take an approved founder brief back after a pivot, so make re-gates until it is approved again: cstack brief reopen <file> --reason "<what changed>" [--by <name>]',
  'sheet make': 'contact sheet for stills, where the owner picks winners: cstack sheet make <images|folders...> --out work/sheets/a.html [--grid 3x3] [--cols 4] [--title "..."] [--blind [--seed N]] [--png] [--force]',
  'sheet open': 'open a sheet in the default browser and print how to pick: cstack sheet open work/sheets/a.html',
  'sheet import': 'winners and pairs picked on a sheet into feedback events: cstack sheet import <picks.json> --sheet work/sheets/a.html --by <name> [--ws dir]',
  'evals run': 'run T2 fixtures: cstack evals run <id...>|--all|--since <ref> (--dry-run | --agent "<cmd>" [--judge "<cmd>"] | --recorded <dir>) [--runs N] [--out <dir>] [--record]',
  setup: 'install skills into agent hosts: cstack setup [--host default|auto|all|agents|claude-code|codex|cursor|gemini-cli|opencode|copilot|factory|kiro] [--target <project>] [--copy] [--dry-run]   |   --refresh: relink every install this checkout made (cstack update runs it)',
  update: 'update this cstack checkout (fast-forward only; never stashes or resets), reinstall dependencies if they changed, relink every host it was installed into, show what is new: cstack update [--dry-run]   |   --check [--force]: one line when an update exists (skills run this)   |   --snooze   |   --auto on|off   |   --checks on|off',
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
    // the same schema brand check applies, so a recipe that compiles also passes the workspace check (F29)
    const sv = validateValue('prompt-recipe', recipe);
    if (!sv.ok) {
      res.errors.push(`[prompt-recipe schema] ${sv.errors}`);
      res.ok = false;
    }
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
    tier: args.tier,
  };
  if (args.tier && !['draft', 'final'].includes(args.tier)) die('--tier must be draft (probes) or final');
  if (!req.modality) die('usage: cstack route --modality <m> [--needs a,b] [--task t] [--max-cost n] [--providers fal,openai]');
  // which adapters exist here and which keys are missing (names only), so the best model's gaps can be named
  req.adapters = Object.fromEntries(availability(process.env).map((a) => [a.id, { status: a.status, missing_env: a.missing_env }]));
  const res = route(reg, req);
  if (args.json) return json(res);
  const b = res.best_now;
  if (b) {
    console.log(`best now: ${b.model_id} (#${b.rank} ${b.leaderboard}, as of ${b.as_of}${b.fresh ? '' : ', STALE'})`);
    for (const e of b.endpoints) console.log(`${' '.repeat(6)}${e.provider}: ${e.endpoint_id}  ${e.reachable ? 'reachable' : 'NOT reachable'}${e.needs.length ? `; needs ${e.needs.join('; ')}` : ''}`);
    if (!b.endpoints.length) console.log(`${' '.repeat(6)}no route in the registry: add one (maker API or host) before it can be called`);
    console.log('');
  }
  for (const c of res.candidates) {
    console.log(`${String(c.score).padStart(4)}  ${c.model_id.padEnd(34)} ${c.provider.padEnd(12)} ${c.why}`);
    // the id to put in a request's "model", per provider; an unpriced host route is refused until it has a price
    for (const e of c.endpoints) console.log(`${' '.repeat(6)}${e.provider}: ${e.endpoint_id}${e.priced === false ? '  (no price yet: ask the owner, then --confirm-unpriced)' : e.token_priced ? '  (token-priced: give token_estimate, or ask the owner, then --confirm-unpriced)' : ''}`);
  }
  console.log(`\nfallback chain: ${res.chain.join(' → ') || '(none)'}`);
  for (const w of res.warnings) console.log(`WARN ${w}`);
  console.log(`registry: ${shown(regPath)} (snapshot; the /model-router skill re-verifies live docs, leaderboard rank and as_of for important batches)`);
}

async function cmdSpend(sub) {
  if (sub === 'reconcile') {
    const provider = args.provider && args.provider !== true ? String(args.provider) : die('--provider required (any adapter with a billing lookup; fal today)');
    // provider-neutral: any adapter that exports billing(request_id) can be reconciled; the others say so
    const adapter = getProvider(provider);
    if (typeof adapter.billing !== 'function') die(`${provider} has no billing lookup yet, so its rows keep cstack's estimate only; add billing(request_id) to its adapter to reconcile it`);
    const r = await reconcile(ws, { provider, since: args.since, dry_run: !!args['dry-run'], lookup: (id) => adapter.billing(id) });
    if (args.json) return json({ ...r, check: billedVsEstimated(ws, { provider }) });
    if (args['dry-run']) return console.log(`would ask ${provider} about ${r.asked} request(s); nothing fetched`);
    const by = (k) => r.rows.filter((x) => x.status === k).length;
    console.log(`asked ${provider} about ${r.asked} request(s): ${by('billed')} billed, ${by('not_found')} not billed yet, ${by('error')} failed`);
    for (const x of r.rows.filter((y) => y.status === 'error')) console.log(`  ${x.request_id}: ${x.error}`);
    const c = billedVsEstimated(ws, { provider });
    if (c.requests) console.log(`billed ${c.billed} vs estimated ${c.estimated} ${c.currency} over ${c.requests} request(s): ${c.drift >= 0 ? '+' : ''}${Math.round(c.drift * 100)}% (${c.within ? 'within' : 'outside'} ${c.tolerance * 100}%)`);
    if (by('error')) process.exit(1);
    return;
  }
  if (sub === 'plan') {
    const items = readData(path.resolve(args._[0] ?? die('usage: cstack spend plan <items.json> --stop "..."')));
    // items without est are priced the way `generate` prices a call: from the registry, through the host's route
    const price = (i) => {
      const req = { provider: i.provider, model: i.model, inputs: i.inputs ?? { params: i.params ?? {}, images: i.images }, token_estimate: i.token_estimate };
      const { estimate, reason } = priceRequest(req);
      return estimate ? { est: estimate } : { reason: `${i.provider}/${i.model}: ${reason}` };
    };
    const res = planBatch(ws, items, { stop_condition: args.stop, price });
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
    if (args.json) return json({ by, spent: spent(rows, { currency: cur, since: args.since }), billed_vs_estimated: billedVsEstimated(ws, { since: args.since }) });
    for (const [k, v] of Object.entries(by)) console.log(`${k.padEnd(40)} calls ${v.calls}  ok ${v.ok}  failed ${v.failed}  dedup ${v.dedup}  dry ${v.dry}`);
    console.log(`spent ${spent(rows, { currency: cur, since: args.since })} ${cur}${args.since ? ` since ${args.since}` : ''} (cstack's estimates)`);
    const c = billedVsEstimated(ws, { since: args.since });
    if (c.requests) console.log(`billed ${c.billed} vs estimated ${c.estimated} ${c.currency} over ${c.requests} reconciled request(s): ${c.drift >= 0 ? '+' : ''}${Math.round(c.drift * 100)}% (${c.within ? 'within' : 'outside'} ${c.tolerance * 100}%)`);
    return;
  }
  die('usage: cstack spend plan|summary|reconcile');
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

function cmdCreative(sub) {
  if (sub === 'import') {
    requireWs();
    const file = path.resolve(args._[0] ?? die('usage: cstack creative import <file.csv> --channel meta [--preset ...] --ws <dir>'));
    let map = {};
    if (args.map) {
      try {
        map = JSON.parse(args.map);
      } catch {
        die('--map must be JSON, e.g. \'{"spend":"Cost (USD)"}\'');
      }
    }
    const { records, skipped, columns } = rowsToRecords(parseCSV(fs.readFileSync(file, 'utf8')), {
      preset: args.preset ?? 'generic',
      map,
      families: taxFamilies(),
      channel: args.channel ?? die('--channel required (meta, tiktok, ...)'),
      period: args.period,
      currency: args.currency,
      file: path.relative(ws, file).startsWith('..') ? path.basename(file) : path.relative(ws, file),
      imported_at: nowISO(),
    });
    const existing = new Set(readPerformance(ws).map((r) => r.id));
    const fresh = [];
    for (const r of records) {
      const v = validateValue('creative-performance', r);
      if (!v.ok) skipped.push({ row: r.artifact_ref, reason: v.errors });
      else if (existing.has(r.id)) skipped.push({ row: r.artifact_ref, reason: `already imported (${r.id})` });
      else fresh.push(r);
    }
    if (!args['dry-run']) for (const r of fresh) appendJSONL(path.join(ws, 'state', 'performance.jsonl'), r);
    const out = { imported: fresh.length, skipped, columns, dry_run: !!args['dry-run'] };
    if (args.json) return json(out);
    console.log(`${args['dry-run'] ? 'would import' : 'imported'} ${fresh.length} records into state/performance.jsonl`);
    for (const [h, f] of Object.entries(columns)) console.log(`  ${h} → ${f}`);
    for (const s of skipped) console.log(`  skipped ${s.row}: ${s.reason}`);
    return;
  }
  if (sub === 'report') {
    requireWs();
    const r = creativeReport(readPerformance(ws), { family: args.family, min_spend: args['min-spend'], min_impressions: args['min-impressions'], min_ads: args['min-ads'], concentration: args.concentration });
    if (args.write) for (const i of r.insights) appendJSONL(path.join(ws, 'state', 'insights.jsonl'), i);
    if (args.json) return json(r);
    const a = r.account;
    console.log(`${a.ads} ads, ${a.sufficient} with enough data, ${a.untagged} untagged; spend ${a.spend}; median ${a.metric.toUpperCase()} ${a.median ?? 'n/a'}`);
    console.log('every line below is an OBSERVATION: a correlation to question, not a cause');
    for (const w of r.warnings) console.log(`! ${w}`);
    for (const g of r.groups) console.log(`  ${g.read.padEnd(12)} ${`${g.family}=${g.term}`.padEnd(40)} ads ${g.sufficient_ads}/${g.ads}  share ${Math.round(g.share * 100)}%  median ${g.median ?? '-'}`);
    for (const i of r.insights) console.log(`- ${i.statement}${i.confounds ? `\n  confounded: ${i.confounds.join('; ')}` : ''}${i.brand_note ? `\n  brand: ${i.brand_note}` : ''}${i.next_test ? `\n  next test: ${i.next_test}` : ''}`);
    if (args.write) console.log(`appended ${r.insights.length} observations to state/insights.jsonl`);
    return;
  }
  if (sub === 'check') {
    const file = path.resolve(args._[0] ?? die('usage: cstack creative check <file> --ws <dir>'));
    const obj = readData(file);
    const b = path.basename(file);
    const all = (kind) => walk(ws, (p) => new RegExp(`\\.${kind}\\.(json|ya?ml)$`).test(p) && !p.includes(`${path.sep}node_modules${path.sep}`)).map((p) => readData(p));
    const r = /\.creative-bet\./.test(b) ? checkBet(obj) : /\.creative-family\./.test(b) ? checkFamily(obj, { performance: readPerformance(ws) }) : /\.production-plan\./.test(b) ? checkPlan(obj, { bets: all('creative-bet'), families: all('creative-family') }) : die('name the file *.creative-bet.yaml, *.creative-family.yaml or *.production-plan.yaml');
    if (args.json) json(r);
    else {
      console.log(`${r.ok ? 'PASS' : 'FAIL'} ${shown(file)}`);
      for (const e of r.errors) console.log(`  error: ${e}`);
      for (const w of r.warnings) console.log(`  warn: ${w}`);
      if (r.cells) console.log(`  cells: ${r.cells}${r.min_spend_total ? `, minimum spend to read it: ${r.min_spend_total}` : ''}`);
    }
    if (!r.ok) process.exitCode = 1;
    return;
  }
  die('usage: cstack creative import|report|check');
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
    r.print(`brand check ${shown(ws)}`);
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
    if (args.task !== undefined && args.sections !== undefined) die('pass --task or --sections, not both');
    if (args.task !== undefined) {
      if (args.task === true) die('--task needs a name from brand/context-map.yaml');
      try {
        return json(taskContext(ws, String(args.task), { includeInferred: !!args.inferred }));
      } catch (e) {
        die(e.message);
      }
    }
    const ctx = brandContext(ws, { sections: args.sections ? String(args.sections).split(',') : undefined, includeInferred: !!args.inferred });
    return json(ctx);
  }
  if (sub === 'guide') {
    const r = buildGuide(ws, { out: args.out ? path.resolve(args.out) : undefined });
    if (args.json) return json(r);
    return console.log(`wrote ${shown(r.file)}: ${r.sections} sections of approved fields, ${r.colours} colours (context ${r.hash})`);
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
  die('usage: cstack brand init|check|set|context|guide|stale|resolve');
}

async function cmdGenerate() {
  const req = readData(path.resolve(args.file ?? die('usage: cstack generate --file request.json [--dry-run]')));
  if (args['dry-run']) req.dry_run = true;
  if (args['confirm-unpriced']) req.confirm_unpriced = true;
  if (args.confirm) req.confirmed = true;
  // before a paid image run: say so when the "best model now" data is old or missing (field test F55)
  const model = registryPrice(req).model;
  const stale = model?.modality === 'image' ? leaderboardWarning(readJSON(path.join(ROOT, 'registry', 'models.json')), 'image') : null;
  if (stale) console.error(`WARN ${stale}`);
  const res = await runMedia(ws, req);
  if (args.json) return json(res);
  if (res.would_block) die(`dry run (${req.provider}/${req.model}): a real call would be blocked by budget: ${res.problems.join('; ')}; nothing was paid`);
  if (res.dry_run) {
    const b = res.row?.booked_cost;
    return console.log(`dry run logged (${req.provider}/${req.model}); nothing was paid${b ? `; this call has no price, so a real call is booked at ${b.amount} ${b.currency}, the budget's ceiling, not a price` : ''}`);
  }
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
  console.log(`${shown(f)} ${actual.width}x${actual.height}: ${res.ok ? 'PASS' : 'FAIL'}`);
  for (const x of res.findings) console.log(`  ${x.level ?? ''} ${x.detail}`);
  process.exit(res.ok ? 0 : 1);
}

async function cmdTaste(sub) {
  const t = getProvider('taste-labs');
  if (['search', 'extract', 'verify'].includes(sub) && t.available && !t.available(process.env)) die(`MISSING: ${(t.env ?? ['TASTE_API_KEY']).join(', ')} not set; Taste Labs is unavailable here (fallback: local libraries + browse)`);
  const ended = (res) => {
    if (res.blocked) die(`blocked by budget: ${res.problems.join('; ')}`);
    if (res.failed) die(`${res.row.status}: ${res.row.error}`);
    if (res.would_block) die(`dry run: a real call would be blocked by budget: ${res.problems.join('; ')}; nothing was paid`);
    if (res.dry_run) { console.log('dry run logged; nothing was paid'); process.exit(0); }
    return res;
  };
  const spec = (operation, params) => ({ provider: 'taste-labs', model: t.versions?.[operation === 'search' ? 'search' : operation === 'extract' ? 'extractor' : 'verifier'] ?? 'n/a', operation, params, skill: args.skill, estimated_cost: null, confirm_unpriced: !!args['confirm-unpriced'], confirmed: !!args.confirm, stop_condition: 'single call' });
  const save = (kind, obj) => {
    const dir = path.join(ws, 'references', '_taste');
    const p = path.join(dir, `${kind}-${today()}-${newId('T').slice(-6)}.json`);
    writeJSON(p, obj);
    return shown(p);
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
    for (const x of r.findings) console.log(`${shown(x.file)}:${x.line} ${x.value} ${x.detail}`);
    console.log(r.ok ? 'tokens lint: PASS' : `tokens lint: FAIL (${r.findings.length})`);
    process.exit(r.ok ? 0 : 1);
  }
  die('usage: cstack tokens check|build|lint');
}

async function cmdEvals(sub) {
  if (sub === 'run') return cmdEvalsRun();
  if (sub !== 'plan') die('usage: cstack evals plan [--since ref] [--files a,b] | cstack evals run <id...> --dry-run|--agent "<cmd>"|--recorded <dir>');
  const p = evalPlan({ since: args.since, files: args.files ? String(args.files).split(',') : undefined });
  if (args.json) return json(p);
  console.log(p.text);
}

// cstack image text (field test F20): a per-image gate a flow's stop rule can run after each generation
function cmdImage(sub) {
  if (sub !== 'text') die('usage: cstack image text <images|folders...> [--engine auto|tesseract|judge] [--judge "<cmd>"]');
  if (args.judge === true) die('--judge needs a command');
  const r = checkText(args._, { engine: args.engine ?? 'auto', judge: args.judge ? tokenize(args.judge) : null });
  if (args.json) json(r);
  else {
    for (const i of r.images) console.log(`${i.result.toUpperCase().padEnd(5)} ${shown(i.file)}  ${i.evidence}`);
    const bad = r.images.filter((i) => i.result !== 'pass').length;
    console.log(`image text (${r.engine}${r.thresholds ? ', thresholds uncalibrated' : ''}): ${r.ok ? 'PASS' : `FAIL (${bad} of ${r.images.length})`}`);
  }
  if (!r.ok) process.exit(1);
}

// docs/sheets.md: contact sheets for stills and blind pairwise picks
function cmdBrief(sub) {
  const file = args._[0];
  if (!['approve', 'reopen'].includes(sub) || !file) die('usage: cstack brief approve <file> --by <founder> | cstack brief reopen <file> --reason "<what changed>"');
  const p = path.resolve(file);
  if (!fs.existsSync(p)) die(`no such brief: ${shown(p)}`);
  try {
    if (sub === 'approve') {
      const b = approveBrief(p, { by: args.by });
      console.log(`approved ${shown(p)} by ${b.owner_approval.by} on ${b.owner_approval.date} (${b.owner_approval.fingerprint.slice(0, 19)}...; copy kept at ${shown(b.snapshot)}); any later edit needs a new approval before make, and reference reactions count from here`);
    } else {
      const b = reopenBrief(p, { reason: args.reason, by: args.by });
      console.log(`reopened ${shown(p)}: ${b.amendments.at(-1).reason}.${b.changed ? ` Changed since the founder's yes: ${b.changed.length ? b.changed.join(', ') : 'nothing yet'}.` : ' No copy of the approved version was kept, so what changed cannot be shown.'} flows gate --stage make now refuses until the founder approves it again (cstack brief approve), and reactions to earlier references stop counting then`);
    }
  } catch (e) {
    die(e.message);
  }
}

async function cmdSheet(sub) {
  if (sub === 'make') {
    let r;
    try {
      r = makeSheet({ inputs: args._, out: args.out, title: args.title, cols: args.cols, blind: !!args.blind, seed: args.seed, force: !!args.force, grid: args.grid });
    } catch (e) {
      die(e.message);
    }
    if (args.png) r.png = await renderPNG(r.html, r.html.replace(/\.html$/, '.png'), { force: !!args.force });
    if (args.json) return json({ ...r, url: pathToFileURL(r.html).href });
    console.log(`wrote ${shown(r.html)} (${r.count} images${r.grid ? `, ${r.cells} frames in ${r.grid.cols}x${r.grid.rows} grids` : ''}${r.blind ? `, blind, seed ${r.seed}` : ''})`);
    if (r.png) console.log(`wrote ${shown(r.png)}`);
    if (r.blind) console.log(`key in ${shown(r.key)}: do not open it before the picks are in`);
    console.log(sheetHowTo(r.html));
    return;
  }
  if (sub === 'open') {
    const html = args._[0] && path.resolve(String(args._[0]));
    if (!html || !fs.existsSync(html)) die('usage: cstack sheet open <sheet.html>');
    const opener = process.platform === 'darwin' ? ['open', [html]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', html]] : ['xdg-open', [html]];
    if (!args['print-only']) {
      try {
        spawn(opener[0], opener[1], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
      } catch {}
    }
    console.log(sheetHowTo(html));
    return;
  }
  if (sub === 'import') {
    if (!args._[0] || !args.sheet || args.sheet === true) die('usage: cstack sheet import <picks.json> --sheet <sheet.html> --by <name> [--ws dir]');
    requireWs();
    const brand = (() => {
      try {
        return readData(path.join(ws, 'cstack.config.yaml'))?.brand_id;
      } catch {
        return undefined;
      }
    })();
    const recs = importPicks({ picksFile: args._[0], sheet: args.sheet, by: args.by, brand_id: brand ? String(brand) : undefined, ws });
    for (const rec of recs) {
      const v = validateValue('feedback-event', rec);
      if (!v.ok) die(`invalid feedback-event: ${v.errors}`);
    }
    for (const rec of recs) appendJSONL(path.join(ws, 'state', 'feedback.jsonl'), rec);
    if (args.json) return json(recs);
    const wins = recs.filter((r) => r.type === 'approve');
    const pairs = recs.filter((r) => r.type === 'pairwise');
    const w = pairs.filter((r) => ['a', 'b'].includes(r.pair.winner)).length;
    console.log(`appended ${wins.length} winner(s) and ${pairs.length} pairwise pick(s) (${w} with a winner) to ${shown(path.join(ws, 'state', 'feedback.jsonl'))}`);
    for (const r of wins) console.log(`  winner: ${r.artifact_ref}${r.region ? ` (frame at x ${r.region.x}, y ${r.region.y} of the grid)` : ''}${r.reason_codes ? `: ${r.reason_codes.join(', ')}` : ''}${r.reason ? ` ("${r.reason}")` : ''}`);
    if (wins.length) console.log('next: polish each winner as a single image (flow grid-pick-polish), editing locally; upscale only the finalists');
    return;
  }
  die('usage: cstack sheet make|open|import');
}

// F62: the owner could not tell where the boards are picked. Every sheet command says where the page is and what to press.
function sheetHowTo(html) {
  return [
    `pick on the sheet in a browser: ${pathToFileURL(html).href}`,
    '  (cstack sheet open <sheet> opens it; it is a file on this computer, not a web page)',
    '  1. click up to three winners, and tick why each won',
    '  2. press "Download picks.json"',
    `  3. cstack sheet import <downloaded picks.json> --sheet ${shown(html)} --by <name>`,
    '  "Pick pairs" on the page is optional, for calibrating the reviewers',
  ].join('\n');
}

// docs/evals.md#running-fixtures. Live calls go through guardedCall on the --ws ledger, like any model call.
async function cmdEvalsRun() {
  if (args.agent === true || args.judge === true || args.recorded === true || args.out === true) die('--agent, --judge, --recorded and --out need a value');
  if (args['dry-run'] && args.recorded) die('pass --dry-run or --recorded <dir>, not both');
  const plan = args.since ? evalPlan({ since: args.since }) : null;
  const planned = plan ? [...plan.tiers.T2, ...plan.tiers.T3.filter((x) => !x.startsWith('provider smoke'))] : null;
  const fixtures = selectFixtures(loadFixtures(), { ids: args._, everything: !!args.all, planned, tier: args.tier });
  if (!fixtures.length) return console.log('no fixtures selected');
  const mode = args['dry-run'] ? 'dry' : args.recorded ? 'recorded' : 'live';
  // T0 cases are deterministic and run without an agent; anything else needs one
  if (mode === 'live' && !args.agent && fixtures.some((f) => f.tier !== 'T0')) die('live runs need --agent "<cmd>" (for example --agent "claude -p --output-format stream-json --verbose"); or pass --dry-run, or --recorded <dir>');
  const out = path.resolve(mode === 'recorded' ? args.recorded : args.out ?? path.join(fs.realpathSync(os.tmpdir()), `cstack-evals-${nowISO().replace(/[:.]/g, '-')}`));
  if (mode === 'recorded' && !exists(out)) die(`--recorded ${out}: no such folder`);
  fs.mkdirSync(out, { recursive: true });
  const agent = args.agent ? tokenize(args.agent) : null;
  const judge = args.judge ? tokenize(args.judge) : null;
  const cost = args['cost-per-call'] !== undefined ? Number(args['cost-per-call']) : null;
  if (cost != null && !(cost >= 0)) die('--cost-per-call must be a number of USD, 0 or more');
  const callsModel = (mode === 'live' && agent) || (mode !== 'dry' && judge);
  if (callsModel && !loadBudget(ws)) die(`${ws} has no budget envelope (cstack.config.yaml budget:); model calls are booked in a workspace ledger. Pass --ws <workspace>, or cstack brand init one`);
  const session = newId('EVS');
  const cmdLabel = (argv) => [path.basename(argv[0]), ...argv.slice(1)].join(' ').slice(0, 80);
  const guard = (operation, fn) =>
    guardedCall(
      ws,
      { provider: 'agent-cli', model: cmdLabel(operation === 'eval_judge' ? judge : agent), operation, params: { session, n: newId('C') }, estimated_cost: cost == null ? null : { amount: cost, currency: 'USD', basis: 'owner-stated per call' }, unpriced_reason: 'agent CLI cost unknown; pass --cost-per-call', confirm_unpriced: !!args['confirm-unpriced'], confirmed: !!args.confirm, skill: 'evals', max_retries: 0 },
      fn,
    );
  const results = [];
  const state = {};
  let recorded = 0;
  // the summary and the records grow as the suite goes, so a killed or limited run keeps what it graded (F51)
  const summarize = () => ({ date: today(), mode, out, agent: agent?.join(' ') ?? null, judge: judge?.join(' ') ?? null, fixtures: results.length, of: fixtures.length, pass: results.filter((r) => r.result === 'pass').length, fail: results.filter((r) => r.result === 'fail').length, results: results.map(({ runs, ...x }) => ({ ...x, runs: runs.map(({ files, ...y }) => y) })) });
  const record = (r) => {
    for (const rec of evalRecords(r, { judge: judge && cmdLabel(judge), date: today() })) {
      rec.id = newId('EV');
      const v = validateValue('eval', rec);
      if (!v.ok) die(`invalid eval record for ${r.id}: ${v.errors}`);
      appendJSONL(path.join(ws, 'state', 'evals.jsonl'), rec);
      recorded++;
    }
  };
  for (const fx of fixtures) {
    const r = await runFixture(fx, { out, mode, runs: args.runs, agent, judge, guard, state, timeout_s: args.timeout ? Number(args.timeout) : undefined });
    results.push(r);
    if (args.record && mode !== 'dry') record(r);
    if (mode !== 'recorded') writeJSON(path.join(out, 'summary.json'), summarize());
    if (r.aborted) {
      const left = fixtures.slice(fixtures.indexOf(fx)).map((x) => x.id);
      if (!args.json) console.log(`STOPPED  ${fx.id} (${r.stop_reason ?? 'refused'}): ${r.runs.at(-1)?.evidence ?? ''}\nresume with the same command and these ${left.length} fixture id(s): ${left.join(' ')}`);
      break;
    }
    if (!args.json) {
      console.log(`${r.result.toUpperCase().padEnd(8)} ${fx.id}  ${r.passed}/${r.runs.length} pass${r.failed ? `, ${r.failed} fail` : ''}${r.pending ? `, ${r.pending} pending` : ''}`);
      for (const run of r.runs) {
        if (run.evidence) console.log(`  run ${run.run}: ${run.evidence}`);
        for (const g of run.graders ?? []) if (g.result !== 'pass') console.log(`  run ${run.run} ${g.type} ${g.result}: ${g.pattern ?? g.run ?? ''}${g.pattern || g.run ? ' — ' : ''}${g.evidence}`);
      }
    }
  }
  const summary = summarize();
  if (args.record && mode !== 'dry' && !args.json) console.log(`recorded ${recorded} eval record(s) in ${shown(path.join(ws, 'state', 'evals.jsonl'))}`);
  if (args.json) json(summary);
  else if (mode === 'dry') console.log(`${summary.fixtures} fixture(s) prepared, nothing called (dry run); prompts and workspaces in ${shown(out)}`);
  else console.log(`${summary.pass}/${summary.fixtures} fixtures pass (${mode}); runs in ${shown(out)}`);
  if (summary.fail || results.some((r) => r.aborted || r.runs.some((x) => x.result === 'error')) || (args.strict && results.some((r) => r.result !== 'pass'))) process.exit(1);
}

function cmdLint(sub) {
  if (sub !== 'shot-dna') die('usage: cstack lint shot-dna <file...>');
  const files = args._.map((f) => path.resolve(f));
  const rows = files.length
    ? files.map((f) => {
        if (!exists(f)) die(`not found: ${f}`);
        return { file: shown(f), findings: lintShotDNA(readData(f)).findings };
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
    const here = (p) => shown(p);
    if (args.json) return json({ ...res, out: here(res.out), base: here(res.base), patch: here(res.patch) });
    console.log(`wrote ${here(res.out)} ${res.width}x${res.height} (engine ${res.engine.name}; changed box ${res.changed_box ? `${res.changed_box.x},${res.changed_box.y} ${res.changed_box.w}x${res.changed_box.h}` : 'none: patch outside base'}; feather ${res.feather}px; inputs untouched)`);
  } catch (e) {
    die(e.message);
  }
}

// research tools and media providers that share an id (taste-labs) report both routes the same way in `tools` and `providers`
function routes() {
  const mcp = String(args.mcp ?? process.env.CSTACK_MCP_SERVERS ?? '').split(',').filter(Boolean);
  const prov = new Map(availability().map((p) => [p.id, p]));
  const res = detectTools(ws, { mcpServers: mcp }).map((t) => {
    const p = prov.get(t.id);
    return p ? { ...t, cli_adapter: p.available ? 'usable' : `needs ${p.missing_env.join(', ') || 'setup'}` } : t;
  });
  return { mcp, res, tools: new Map(res.map((t) => [t.id, t])) };
}

function cmdSetup() {
  const dryRun = !!args['dry-run'];
  const target = args.target ? path.resolve(args.target) : undefined;
  // --refresh: the installs this checkout made (recorded, or found at user scope); none found → the default hosts
  const jobs = args.refresh ? installsToRefresh({ hosts: loadHosts() }) : [{ host: args.host ?? 'default', target, copy: !!args.copy }];
  if (args.refresh && !jobs.length) jobs.push({ host: 'default', copy: false });
  for (const j of jobs) {
    let res;
    try {
      res = installHosts({ ...j, dryRun });
    } catch (e) {
      die(`setup: ${e.message}`);
    }
    for (const l of res) console.log(l);
    if (!dryRun) {
      try {
        for (const h of hostIds(j.host)) recordInstall({ host: h, target: j.target, copy: j.copy });
      } catch (e) {
        console.log(`note: could not record this install in ${shown(stateDir())} (${e.message}); cstack update will look for it in your home folder instead`);
      }
    }
  }
}

function cmdUpdate() {
  const onOff = (flag) => {
    const v = String(args[flag]);
    if (!['on', 'off'].includes(v)) die(`update: --${flag} takes on or off`);
    return v === 'on';
  };
  if (args.auto !== undefined || args.checks !== undefined) {
    if (args.auto !== undefined) setConfig('auto_update', onOff('auto'));
    if (args.checks !== undefined) setConfig('update_check', onOff('checks'));
    const c = readConfig();
    console.log(`update checks ${c.update_check ? 'on' : 'off'}, automatic updates ${c.auto_update ? 'on' : 'off'} (${shown(path.join(stateDir(), 'config.json'))})`);
    return;
  }
  if (args.snooze) {
    const r = snooze();
    console.log(r.snoozed ? `update reminder snoozed for ${r.hours === 168 ? 'a week' : `${r.hours} hours`}` : 'no pending update to snooze');
    return;
  }
  if (args.check) {
    for (const l of checkForUpdate({ force: !!args.force })) console.log(l);
    return;
  }
  const r = runUpdate({ dryRun: !!args['dry-run'] });
  for (const l of r.lines) console.log(l);
  if (!r.ok) process.exit(1);
}

const two = argv[0] && !argv[0].startsWith('--') ? `${cmd} ${argv[0]}` : null;
if (two && ['brand', 'prompt', 'spend', 'experiment', 'learn', 'creative', 'evals', 'brief', 'sheet', 'image', 'taste', 'tokens', 'browse', 'lint', 'edit', 'type', 'flows', '3d', 'svg', 'mockup', 'video'].includes(cmd)) {
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
    await cmdSpend(argv[0]);
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
    if (args.json) json(rows.map(({ name, aliases, status, summary, methods, steps }) => ({ name, aliases: aliases ?? [], status, summary, methods: methods ?? [], steps: (steps ?? []).length })));
    else for (const w of rows) console.log(`${w.name.padEnd(20)} ${String(w.status).padEnd(9)} ${w.summary}${w.aliases?.length ? `\n${' '.repeat(31)}also: ${w.aliases.join(', ')}` : ''}${w.methods?.length ? `\n${' '.repeat(31)}methods: ${w.methods.join(', ')}` : ''}`);
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
      const query = args._.join(' ') || die('usage: cstack flows search "<outcome>"');
      const res = searchFlows(ws, query);
      const wfs = searchWorkflows(query);
      if (args.json) json(args.workflows ? { flows: res, workflows: wfs } : res);
      else {
        if (!res.length) console.log(`no researched flow matches${wfs.length ? '' : '; run /flow-research to design one before making anything'}`);
        for (const r of res) console.log(`${String(r.score).padStart(3)}  ${r.flow.id.padEnd(30)} ${r.flow.outcome}${r.flow.stale ? '  [STALE: re-verify before use]' : ''}`);
        if (wfs.length) {
          console.log(`\nworkflows that cover it (run /workflow <id> in your agent; each names its methods):`);
          for (const r of wfs) console.log(`${String(r.score).padStart(3)}  ${r.workflow.id.padEnd(30)} ${r.workflow.summary}${r.workflow.methods.length ? ` [methods: ${r.workflow.methods.join(', ')}]` : ''}`);
        }
      }
    } else if (sub === 'show') {
      const f = listFlows(ws).find((x) => x.id === args._[0]) ?? die(`no flow "${args._[0]}"`);
      if (args.json) json(f);
      else console.log(fs.readFileSync(f.file, 'utf8') + (f.stale ? `\n# STALE: last verified ${f.last_verified} (${f.age_days} days); re-verify tools and models before following it\n` : ''));
    } else if (sub === 'plan') {
      const r = planFromFlow(ws, args._[0] ?? die('usage: cstack flows plan <id> [--target "..."] [--deliverable <kind>] [--key-visual]'), { target: args.target, deliverable: args.deliverable, key_visual: !!args['key-visual'] });
      const where = shown(r.file);
      console.log(`plan written: ${where}${r.stale ? `\nwarning: source flow is stale (${r.age_days} days); re-verify tools and models first` : ''}\nnext: adjust steps and target to this run, then cstack flows check ${where}`);
    } else if (sub === 'check') {
      if (!args._.length) die('usage: cstack flows check <plan.flow.yaml...>');
      const slugs = listSkills().map((s) => s.slug);
      const res = args._.map((f) => checkFlowFile(ws, path.resolve(f), { skills: slugs }));
      if (args.json) json(res);
      else for (const x of res) {
        console.log(`${x.errors.length ? 'FAIL' : 'PASS'}  ${shown(x.file)}`);
        for (const e of x.errors) console.log(`  error: ${e}`);
        for (const w of x.warnings) console.log(`  warn:  ${w}`);
      }
      if (res.some((x) => x.errors.length)) process.exitCode = 1;
    } else if (sub === 'gate') {
      const f = args._[0] ?? die('usage: cstack flows gate <plan.flow.yaml> --stage make|decide|final');
      const stage = args.stage ?? die(`--stage required: ${GATE_STAGES.join('|')}`);
      if (!GATE_STAGES.includes(stage)) die(`--stage must be one of ${GATE_STAGES.join(', ')}`);
      const x = gateFlow(ws, path.resolve(f), { stage, providers: availability(), skills: listSkills().map((s) => s.slug), budget: loadBudget(ws) });
      if (args.json) json(x);
      else {
        console.log(`${x.errors.length ? 'FAIL' : 'PASS'}  ${stage}  ${shown(x.file)}`);
        for (const e of x.errors) console.log(`  error: ${e}`);
        for (const w of x.warnings) console.log(`  warn:  ${w}`);
      }
      if (x.errors.length) process.exitCode = 1;
    } else die('usage: cstack flows list|search|show|plan|check|gate');
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
    const { mcp, res } = routes();
    if (args.json) json(res);
    else {
      for (const t of res) {
        const mark = t.usable ? 'YES' : t.available ? 'NO ' : ' - ';
        const why = t.usable ? `${t.signals.join('; ')}${t.agent_use ? `; ${t.agent_use}` : ''}` : t.available ? `connected (${t.signals.join('; ')}), but ${t.agent_use}; fallback: ${t.fallback ?? 'none'}` : `fallback: ${t.fallback ?? 'none'}`;
        console.log(`${mark}  ${t.name.padEnd(26)} ${why}${t.cli_adapter ? `  [cstack CLI: ${t.cli_adapter}]` : ''}`);
      }
      if (!mcp.length) console.log('\nnote: MCP servers visible to the agent were not passed (--mcp); MCP-only tools may be under-reported.');
    }
    break;
  }
  case 'providers': {
    // one answer per route, shared with `cstack tools`: the CLI adapter (env keys) and the agent's MCP server
    const { tools } = routes();
    json(availability().map((p) => (tools.has(p.id) ? { ...p, agent_mcp: tools.get(p.id).usable, agent_signals: tools.get(p.id).signals } : p)));
    break;
  }
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
  case 'creative':
    cmdCreative(argv[0]);
    break;
  case 'learn':
    cmdLearn(argv[0]);
    break;
  case 'brand':
    cmdBrand(argv[0]);
    break;
  case 'evals':
    await cmdEvals(argv[0]);
    break;
  case 'brief':
    cmdBrief(argv[0]);
    break;
  case 'sheet':
    await cmdSheet(argv[0]);
    break;
  case 'image':
    cmdImage(argv[0]);
    break;
  case 'setup':
    cmdSetup();
    break;
  case 'update':
  case 'upgrade':
    cmdUpdate();
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
