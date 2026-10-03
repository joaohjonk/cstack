// cstack svg: deterministic SVG checks for marks and icon sets. Wiring: `cstack svg <sub> ...` -> runSvg(sub, args, ws).
// Returns a printable string (help), or {ok, text, report}: print `text`; ok === false means exit 1.
import fs from 'node:fs';
import path from 'node:path';
import { lintFiles, formatLint } from './lint.mjs';
import { loadGrammar, loadPalette, resolveIn } from './grammar.mjs';

export const SVG_HELP = `cstack svg <sub> (deterministic checks for marks and icon sets; lint is pure Node, reduce and kit render with Chromium)
  lint <file|dir...> [--grammar icons.tokens.json] [--palette <ws|tokens dir|file.tokens.json|#hex,...|none>] [--kind icon|mark] [--json]
      structure and security, viewBox, complexity, palette, currentColor, strokes (per icon and across a set), grid and
      keylines against the grammar, a11y, transforms, stray groups, precision. No --palette: <ws>/brand/tokens if present.
  reduce <file> [--sizes 16,24,32,48,64] [--out dir] [--force] [--json]
      per size: on white, on black and one-color PNGs, plus contact-sheet.png and reduce.json; fails where counters close
      or parts merge, warns on features under 1 device px. Default --out: <ws>/work/svg/<name>-reduce-<stamp>/.
      Also takes a PNG, JPEG, WebP or GIF (a generated logo before redraw). Skips with a MISSING line without Chromium.
  kit <file> --out dir [--bg #ffffff] [--name "Brand"] [--force] [--json]
      favicon.svg (cleaned), favicon.ico (16/32/48), apple-touch-icon.png (180), icon-192.png, icon-512.png,
      maskable-512.png (safe zone checked), monochrome.svg, site.webmanifest, kit.json. Never overwrites the input;
      refuses an existing --out unless --force.
  legibility <file|dir...> [--width 324,830] [--min-px 11] [--page #ffffff,#0d1117] [--json]
      for figures (README images, diagrams, social cards): at each display width, text smaller than --min-px CSS px and
      text under WCAG contrast against the ground painted beneath it. Outlined type is estimated from its ink height (~).
Any FAIL exits 1.`;

const BOOL = ['json', 'force'];

function normArgs(args) {
  if (Array.isArray(args)) {
    const out = { _: [] };
    for (let i = 0; i < args.length; i++) {
      const t = args[i];
      if (!t.startsWith('--')) out._.push(t);
      else if (t.includes('=')) out[t.slice(2, t.indexOf('='))] = t.slice(t.indexOf('=') + 1);
      else if (BOOL.includes(t.slice(2))) out[t.slice(2)] = true;
      else if (args[i + 1] !== undefined && !args[i + 1].startsWith('--')) out[t.slice(2)] = args[++i];
      else out[t.slice(2)] = true;
    }
    return out;
  }
  const out = { _: [], ...(args ?? {}) };
  out._ = [...(out._ ?? [])];
  // a generic parser reads `--json icons/` as json="icons/": give the value back as a positional
  for (const k of BOOL) if (typeof out[k] === 'string') (out._.push(out[k]), (out[k] = true));
  return out;
}

const here = (p) => {
  const r = path.relative(process.cwd(), p);
  return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : p;
};
const str = (v) => (typeof v === 'string' && v !== '' ? v : null);
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

function inputFile(a, ws, usage) {
  const f = str(a._[0]);
  if (!f) throw new Error(`usage: ${usage}`);
  const p = resolveIn(f, ws);
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) throw new Error(`not found: ${f}`);
  return p;
}

/**
 * Entry point for `cstack svg <sub>`.
 * @param {string} sub  lint|reduce|kit|help
 * @param {object|string[]} args parsed args ({_: [...], flag: value}) or a raw argv array
 * @param {string} ws  workspace root (palette default, relative inputs, reduce output)
 */
export async function runSvg(sub, args = [], ws = process.cwd()) {
  const a = normArgs(args);
  if (a._[0] === sub) a._.shift();
  ws = path.resolve(ws);
  const done = (rep, text) => ({ ok: rep.ok !== false, text: a.json ? JSON.stringify(rep, null, 2) : text, report: rep });
  switch (sub) {
    case 'lint': {
      if (!a._.length) throw new Error('usage: cstack svg lint <file|dir...> [--grammar icons.tokens.json] [--palette ...] [--kind icon|mark] [--json]');
      const kind = str(a.kind);
      if (a.kind !== undefined && !['icon', 'mark'].includes(kind)) throw new Error('--kind must be icon or mark');
      const grammar = str(a.grammar) ? loadGrammar(resolveIn(a.grammar, ws)) : null;
      const palette = loadPalette(a.palette === true ? undefined : a.palette, ws);
      const rep = lintFiles(a._.map((p) => resolveIn(String(p), ws)), { kind, grammar, palette, display: here });
      return done(rep, formatLint(rep));
    }
    case 'reduce': {
      const file = inputFile(a, ws, 'cstack svg reduce <file.svg> [--sizes 16,24,32,48,64] [--out dir] [--force] [--json]');
      const { reduceTest, formatReduce, parseSizes } = await import('./reduce.mjs');
      const sizes = parseSizes(a.sizes);
      const out = str(a.out) ? path.resolve(a.out) : path.join(ws, 'work', 'svg', `${path.basename(file).replace(/\.(svg|png|jpe?g|webp|gif)$/i, '')}-reduce-${stamp()}`);
      const rep = await reduceTest(file, { sizes, out, force: !!a.force, display: here });
      return done(rep, formatReduce(rep, here(out)));
    }
    case 'kit': {
      const file = inputFile(a, ws, 'cstack svg kit <file.svg> --out <dir> [--bg #hex] [--name "Brand"] [--force] [--json]');
      if (!str(a.out)) throw new Error('usage: cstack svg kit <file.svg> --out <dir> [--bg #hex] [--name "Brand"] [--force] [--json]');
      const { buildKit, formatKit } = await import('./kit.mjs');
      const out = path.resolve(a.out);
      const rep = await buildKit(file, { out, bg: str(a.bg) ?? '#ffffff', name: str(a.name), force: !!a.force, display: here });
      return done(rep, formatKit(rep, here(out)));
    }
    case 'legibility': {
      if (!a._.length) throw new Error('usage: cstack svg legibility <file|dir...> [--width 324,830] [--min-px 11] [--page #ffffff,#0d1117] [--json]');
      const { legibilityFiles, formatLegibility, MIN_TEXT_PX } = await import('./legibility.mjs');
      const { svgFiles } = await import('./lint.mjs');
      const nums = (v, name) => {
        const n = String(v).split(',').map(Number);
        if (n.some((x) => !(x > 0))) throw new Error(`--${name} takes positive numbers, e.g. 324,830`);
        return n;
      };
      const widths = str(a.width) ? nums(a.width, 'width') : [324, 830];
      const minPx = str(a['min-px']) ? nums(a['min-px'], 'min-px')[0] : MIN_TEXT_PX;
      const pages = str(a.page) ? String(a.page).split(',').map((p) => p.trim().toLowerCase()) : ['#ffffff'];
      if (pages.some((p) => !/^#[0-9a-f]{6}$/.test(p))) throw new Error('--page takes #rrggbb colours, e.g. #ffffff,#0d1117');
      const files = svgFiles(a._.map((p) => resolveIn(String(p), ws)));
      if (!files.length) throw new Error(`no .svg files in ${a._.join(', ')}`);
      const rep = legibilityFiles(files, { widths, minPx, pages }, here);
      return done(rep, formatLegibility(rep));
    }
    case undefined:
    case 'help':
      return SVG_HELP;
    default:
      throw new Error(`unknown svg subcommand "${sub}"\n${SVG_HELP}`);
  }
}
