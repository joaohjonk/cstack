// cstack mockup: deterministic mockups (composite the truth, then prove it). Wiring: `cstack mockup <sub> ...` ->
// runMockup(sub, args, ws). Relative inputs resolve against the cwd, then the workspace; outputs against the cwd.
import fs from 'node:fs';
import path from 'node:path';
import { renderMockup } from './render.mjs';
import { verifyMockup, THRESHOLDS } from './verify.mjs';
import { loadTemplate, licenceGate } from './template.mjs';
import { footprint } from './geometry.mjs';
import { makeCanTemplate, CAN_SIZES } from './can.mjs';

export const MOCKUP_HELP = `cstack mockup <sub> (pure Node; Chromium only to read SVG, JPEG or WebP)
  render --template <dir> --art <file.png|svg|jpg|webp> --out <file.png> [--placement id] [--force] [--internal]
         composite the art onto every placement (or one); writes <out>.mockup.json (template hash, art sha256,
         placements, timings, licence status). Existing --out needs --force; inputs are never written.
  verify --template <dir> --art <file> --render <file.png> [--placement id] [--heatmap <file.png>] [--force]
         inverse-warp each placement back to flat art space and diff it against the art as the template composites
         it: PASS / WARN / FAIL (exit 1 on FAIL); writes <render>.verify.json and a heatmap per placement
  check  --template <dir>   validate a template package: placements, footprints, files, licence, template hash
  template can --out <dir> [--size standard-12oz|sleek-12oz|tall-16oz] [--force]
         draw a plain aluminium can template (CC0, no photograph) with front, left and back placements, and print the
         flat wrap size the art should have
Licence gate: client_use_allowed false blocks render; "unknown" warns loudly unless --internal (internal comps only).
Template format and example: tests/fixtures/mockup/poster-wall/README.md. --json returns the record.`;

const BOOL_FLAGS = ['force', 'internal', 'json'];

function normArgs(args) {
  const out = { _: [] };
  if (Array.isArray(args)) {
    for (let i = 0; i < args.length; i++) {
      const t = args[i];
      if (!t.startsWith('--')) out._.push(t);
      else if (t.includes('=')) out[t.slice(2, t.indexOf('='))] = t.slice(t.indexOf('=') + 1);
      else if (args[i + 1] && !args[i + 1].startsWith('--') && !BOOL_FLAGS.includes(t.slice(2))) out[t.slice(2)] = args[++i];
      else out[t.slice(2)] = true;
    }
  } else Object.assign(out, args, { _: [...(args?._ ?? [])] });
  // a generic parser reads `--force x` as force=x; give a stray value back as a positional
  for (const k of BOOL_FLAGS) if (typeof out[k] === 'string') (/^(false|0|no)$/i.test(out[k]) ? (out[k] = false) : (out._.push(out[k]), (out[k] = true)));
  return out;
}

const pct = (v) => `${(v * 100).toFixed(2)}%`;

/**
 * Entry point for `cstack mockup <sub>`.
 * @param {string} sub  render|verify|check|help
 * @param {object|string[]} args parsed args ({_: [...], flag: value}) or a raw argv array
 * @param {string} ws  workspace root (fallback for relative inputs)
 * @returns {Promise<string|object>} printable summary, or the record with --json. A blocked licence throws; a FAIL verdict
 *   sets process.exitCode = 1 and still returns the report (ok: false with --json).
 */
export async function runMockup(sub, args = {}, ws = process.cwd()) {
  const a = normArgs(args);
  if (a._[0] === sub) a._.shift();
  ws = path.resolve(ws);
  const need = (k, usage) => {
    if (a[k] === undefined || a[k] === true || a[k] === '') throw new Error(`--${k} required. usage: cstack mockup ${usage}`);
    return String(a[k]);
  };
  const input = (p) => {
    const c = path.resolve(p);
    return fs.existsSync(c) || path.isAbsolute(p) || !fs.existsSync(path.resolve(ws, p)) ? c : path.resolve(ws, p);
  };
  const here = (p) => {
    const r = path.relative(process.cwd(), p);
    return r && !r.startsWith('..') ? r : p;
  };
  const placement = a.placement === undefined ? null : need('placement', `${sub} ... --placement <id>`);
  switch (sub) {
    case 'render': {
      const usage = 'render --template <dir> --art <file> --out <file.png> [--placement id] [--force] [--internal]';
      const tdir = input(need('template', usage)), art = input(need('art', usage)), out = path.resolve(need('out', usage));
      const rec = await renderMockup({ template: tdir, art, out, placement, force: !!a.force, internal: !!a.internal });
      const loud = rec.warnings.filter((w) => w.startsWith('WARNING: template licence'));
      if (a.json) {
        for (const w of loud) process.stderr.write(`${w}\n`); // stdout stays machine-readable
        return rec;
      }
      const places = rec.placements.map((p) => `${p.id} ${p.kind} @ ${p.region.x},${p.region.y} ${p.region.w}x${p.region.h}`).join('; ');
      return [
        ...loud,
        `wrote ${here(rec.out_file)} ${rec.out.width}x${rec.out.height} (${rec.placements.length} placement${rec.placements.length === 1 ? '' : 's'}: ${places}; ${rec.timings_ms.total} ms)`,
        `template ${rec.template.id} ${rec.template.hash.slice(0, 12)} · art ${rec.art.format} ${rec.art.raster.width}x${rec.art.raster.height} sha256:${rec.art.sha256.slice(0, 12)}`,
        `licence: ${rec.licence.status}${rec.licence.client_facing ? '' : ' (not cleared for client-facing use)'}`,
        `sidecar: ${here(rec.sidecar_file)}`,
        ...rec.warnings.filter((w) => !loud.includes(w)).map((w) => `warning: ${w}`),
        `next: cstack mockup verify --template ${here(tdir)} --art ${here(art)} --render ${here(rec.out_file)}`,
      ].join('\n');
    }
    case 'verify': {
      const usage = 'verify --template <dir> --art <file> --render <file.png> [--placement id] [--heatmap <file.png>]';
      const rep = await verifyMockup({
        template: input(need('template', usage)),
        art: input(need('art', usage)),
        render: input(need('render', usage)),
        placement,
        heatmap: typeof a.heatmap === 'string' ? path.resolve(a.heatmap) : null,
        force: !!a.force,
      });
      if (rep.verdict === 'fail') process.exitCode = 1;
      if (a.json) return rep;
      const T = THRESHOLDS;
      const lines = rep.placements.map((r) => {
        const m = r.metrics;
        const head = `${r.verdict.toUpperCase().padEnd(4)} ${rep.template.id}/${r.placement}`;
        const body = m ? `mad ${m.mad.toFixed(2)} · edge ${m.edge_diff.toFixed(3)} · ssim mean ${m.ssim_mean.toFixed(3)} min ${m.ssim_min.toFixed(3)} · changed ${pct(m.changed_fraction)}` : '';
        const where = r.verdict !== 'pass' && r.worst_tile ? ` · worst tile art ${r.worst_tile.art_px.x},${r.worst_tile.art_px.y} ${r.worst_tile.art_px.w}x${r.worst_tile.art_px.h}${r.worst_tile.base_px ? ` (base ~${r.worst_tile.base_px.x},${r.worst_tile.base_px.y})` : ''}` : '';
        return [`${head}  ${body}${where}`, ...(r.reasons.length ? [`     ${r.reasons.join('; ')}`] : []), `     grid ${r.grid.width}x${r.grid.height} · heatmap ${here(path.resolve(path.dirname(rep.report_file), r.heatmap))}`].join('\n');
      });
      return [
        ...lines,
        `verdict: ${rep.verdict.toUpperCase()} (reference: ${rep.reference})`,
        `thresholds: pass needs mad <= ${T.pass.mad}, edge <= ${T.pass.edge_diff}, ssim_min >= ${T.pass.ssim_min}, changed <= ${pct(T.pass.changed_fraction)}; fail past mad ${T.fail.mad}, edge ${T.fail.edge_diff}, ssim_min ${T.fail.ssim_min}, changed ${pct(T.fail.changed_fraction)}`,
        `report: ${here(rep.report_file)}`,
        ...rep.warnings.map((w) => `warning: ${w}`),
      ].join('\n');
    }
    case 'check': {
      const tpl = loadTemplate(input(need('template', 'check --template <dir>')));
      const gate = licenceGate(tpl.licence);
      const rows = tpl.placements.map((p) => {
        const fp = footprint(p.mapper, { s0: 0, s1: 1, t0: 0, t1: 1 });
        const b = fp?.bbox;
        return { id: p.id, kind: p.kind, footprint: b ? { x: Math.floor(b.x0), y: Math.floor(b.y0), w: Math.ceil(b.x1) - Math.floor(b.x0), h: Math.ceil(b.y1) - Math.floor(b.y0) } : null, mask: p.mask ?? null, displacement: p.displacement ? p.displacement.map ?? 'from base' : null, shading: (p.shading ?? []).map((l) => `${l.mode}:${l.map ?? 'from base'}`) };
      });
      const rec = { ok: true, id: tpl.id, base: { file: path.basename(tpl.base.file), width: tpl.base.width, height: tpl.base.height }, hash: tpl.hash, files: tpl.files, licence: { ...tpl.licence, status: gate.status }, placements: rows };
      if (a.json) return rec;
      return [
        `template ${tpl.id}: OK (${tpl.base.width}x${tpl.base.height} base, ${rows.length} placement${rows.length === 1 ? '' : 's'}, hash ${tpl.hash.slice(0, 12)})`,
        ...rows.map((r) => `  ${r.id.padEnd(14)} ${r.kind.padEnd(8)} footprint ${r.footprint ? `${r.footprint.x},${r.footprint.y} ${r.footprint.w}x${r.footprint.h}` : 'none visible'}${r.mask ? ` · mask ${r.mask}` : ''}${r.displacement ? ` · displace ${r.displacement}` : ''}${r.shading.length ? ` · ${r.shading.join(', ')}` : ''}`),
        `licence: ${gate.status} (${tpl.licence.source}; ${tpl.licence.terms})${gate.error ? ' - renders are blocked' : gate.warning ? ' - renders warn unless --internal' : ''}`,
      ].join('\n');
    }
    case 'template': {
      const kind = a._[0];
      if (kind !== 'can') throw new Error(`usage: cstack mockup template can --out <dir> [--size ${Object.keys(CAN_SIZES).join('|')}] (only can templates are drawn so far)`);
      const r = makeCanTemplate({ size: typeof a.size === 'string' ? a.size : 'standard-12oz', out: need('out', 'template can --out <dir>'), force: !!a.force });
      if (a.json) return r;
      return [
        `wrote ${here(r.template)} and ${here(r.base)} (${r.size}, placements front, left, back; CC0, drawn, no photograph)`,
        `flat wrap art: ${r.wrap.mm.w} x ${r.wrap.mm.h} mm, aspect ${r.wrap.aspect} (${r.wrap.px.w} x ${r.wrap.px.h} px at 12 px/mm); a converter's dieline wins for print`,
        `next: cstack mockup render --template ${here(r.dir)} --art <wrap.svg|png> --placement front --out <file.png>`,
      ].join('\n');
    }
    case undefined:
    case 'help':
      return MOCKUP_HELP;
    default:
      throw new Error(`unknown mockup subcommand "${sub}"\n${MOCKUP_HELP}`);
  }
}
