// cstack type: deterministic typography tools. Wiring: `cstack type <sub> ...` -> runType(sub, argv, ws).
// Returns a printable string, or {ok, text} where ok === false means exit 1.
import fs from 'node:fs';
import path from 'node:path';
import { typeScale, fluidScale, scaleTokens, scaleCss, formatScale, RATIOS } from './scale.mjs';
import { fontInfo, formatFont, LANGUAGES } from './font.mjs';

export const TYPE_HELP = `cstack type <sub> (deterministic typography; no model calls, never writes brand state)
  scale [--base 16] [--ratio 1.25|major-third] [--steps -2..6] [--json|--tokens|--css]
      modular scale: px, rem, line-height, tracking, all-caps tracking and body measure per step
  scale --fluid [--min-vw 360] [--max-vw 1440] [--min-base 16] [--max-base 20] [--min-ratio 1.2] [--max-ratio 1.333] [--steps ...]
      fluid clamp() scale between two viewports (utopia.fyi method)
  qa <url> [--breakpoints 375,768,1440] [--families "A,B"] [--max-families 3] [--scale-css tokens.css] [--allow-origin o] [--json]
      rendered-type checks per breakpoint: measure, leading, caps tracking, small text, contrast, widows, justification,
      families, web-font fallback, size count, off-scale sizes. Run dir: work/browse/<run-id>/. Exits 1 on any FAIL.
  font <file...> [--languages pt,es,vi] [--json]
      TTF/OTF/TTC/WOFF/WOFF2: names, embedding flags, metrics, axes, features, coverage, language support
--tokens prints a DTCG 2025.10 fragment (save it as brand/tokens/<name>.tokens.json yourself). --css prints custom
properties for a page or for qa --scale-css (fluid steps as clamp()). font --json prints an array, one entry per file.
Ratios: ${Object.entries(RATIOS).map(([k, v]) => `${k} ${v}`).join(', ')}.
Languages: ${Object.keys(LANGUAGES).join(' ')}.`;

const BOOL = new Set(['json', 'tokens', 'css', 'fluid']);
const FLUID_ONLY = ['min-vw', 'max-vw', 'min-base', 'max-base', 'min-ratio', 'max-ratio'];

/** argv -> {_: positionals, flag: value}; boolean flags never swallow the next token. */
export function parseTypeArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) out._.push(t);
    else if (t.includes('=')) out[t.slice(2, t.indexOf('='))] = t.slice(t.indexOf('=') + 1);
    else if (BOOL.has(t.slice(2))) out[t.slice(2)] = true;
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) out[t.slice(2)] = argv[++i];
    else out[t.slice(2)] = true;
  }
  return out;
}

function scaleFrom(a) {
  if (a.fluid) {
    if (a.base !== undefined || a.ratio !== undefined) throw new Error('--base and --ratio set the modular scale; with --fluid use --min-base/--max-base and --min-ratio/--max-ratio');
    return fluidScale({ minVw: a['min-vw'] ?? 360, maxVw: a['max-vw'] ?? 1440, minBase: a['min-base'] ?? 16, maxBase: a['max-base'] ?? 20, minRatio: a['min-ratio'] ?? 1.2, maxRatio: a['max-ratio'] ?? 1.333, steps: a.steps ?? '-2..6' });
  }
  const stray = FLUID_ONLY.filter((k) => a[k] !== undefined);
  if (stray.length) throw new Error(`--${stray[0]} needs --fluid`);
  return typeScale({ base: a.base ?? 16, ratio: a.ratio ?? 1.25, steps: a.steps ?? '-2..6' });
}

/**
 * Entry point for `cstack type <sub>`.
 * @param {string} sub  scale|qa|font|help
 * @param {string[]|object} args raw argv after the subcommand, or parsed args ({_: [...], flag: value})
 * @param {string} ws  workspace root (qa writes <ws>/work/browse/<run-id>/)
 */
export async function runType(sub, args = [], ws = process.cwd()) {
  const a = Array.isArray(args) ? parseTypeArgs(args) : { ...args, _: [...(args._ ?? [])] };
  switch (sub) {
    case 'scale': {
      const scale = scaleFrom(a);
      if (a.tokens) return JSON.stringify(scaleTokens(scale), null, 2);
      if (a.css) return scaleCss(scale).trimEnd();
      if (a.json) return JSON.stringify(scale, null, 2);
      return formatScale(scale);
    }
    case 'qa': {
      const { runTypeQa } = await import('./qa.mjs');
      const r = await runTypeQa(a, path.resolve(ws));
      return { ok: r.ok, text: r.text ?? JSON.stringify(r.record, null, 2) };
    }
    case 'font': {
      if (!a._.length) throw new Error('usage: cstack type font <file...> [--languages pt,es,vi] [--json]');
      if (a.languages === true) throw new Error('--languages needs a list, e.g. --languages pt,es,vi');
      const langs = a.languages ? a.languages.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) : null;
      for (const l of langs ?? []) if (!LANGUAGES[l]) throw new Error(`unknown language "${l}" (known: ${Object.keys(LANGUAGES).join(' ')})`);
      const infos = a._.map((f) => {
        try {
          return fontInfo(fs.readFileSync(path.resolve(f)), { file: f, languages: langs });
        } catch (e) {
          return { file: f, error: e.code === 'ENOENT' ? 'file not found' : e.message };
        }
      });
      const ok = infos.every((i) => !i.error);
      if (a.json) return { ok, text: JSON.stringify(infos, null, 2) };
      return { ok, text: infos.map((i) => (i.error ? `${i.file}: ${i.error}` : formatFont(i, { detail: !!langs }))).join('\n\n') };
    }
    case undefined:
    case 'help':
      return TYPE_HELP;
    default:
      throw new Error(`unknown type subcommand "${sub}"\n${TYPE_HELP}`);
  }
}
