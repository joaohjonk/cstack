// Context-budget ratchet.
// Ceilings live in evals/static/context-budgets.json. A skill may shrink freely; growth beyond
// ceiling * (1 + tolerance) fails until someone runs `cstack budget --accept <slug> --reason "..."`,
// which records why the extra context is necessary.
import path from 'node:path';
import { ROOT, exists, readJSON, writeJSON, today, estimateTokens } from './core.mjs';

export const BUDGET_FILE = path.join(ROOT, 'evals', 'static', 'context-budgets.json');
export const TOLERANCE = 0.1;
// The always-loaded surface is the catalog of names + descriptions every host preloads.
export const catalogTokens = (skills) => skills.reduce((s, k) => s + estimateTokens(`${k.frontmatter?.name ?? ''}: ${k.frontmatter?.description ?? ''}`), 0);

export function loadBudgets() {
  return exists(BUDGET_FILE) ? readJSON(BUDGET_FILE) : { tolerance: TOLERANCE, catalog_ceiling: null, skills: {}, history: [] };
}

export function checkBudgets(skills, budgets = loadBudgets()) {
  const tol = budgets.tolerance ?? TOLERANCE;
  const rows = [];
  for (const s of skills) {
    const ceiling = budgets.skills?.[s.slug]?.ceiling ?? null;
    const limit = ceiling == null ? null : Math.ceil(ceiling * (1 + tol));
    const status = ceiling == null ? 'new' : s.tokens > limit ? 'over' : s.tokens < ceiling ? 'under' : 'ok';
    rows.push({ slug: s.slug, tokens: s.tokens, on_demand: s.onDemandTokens, ceiling, limit, status });
  }
  const cat = catalogTokens(skills);
  const catCeil = budgets.catalog_ceiling;
  const catalog = { tokens: cat, ceiling: catCeil, status: catCeil == null ? 'new' : cat > Math.ceil(catCeil * (1 + tol)) ? 'over' : 'ok' };
  return { rows, catalog, ok: !rows.some((r) => r.status === 'over') && catalog.status !== 'over' };
}

// Ratchet down automatically (shrinking lowers the ceiling); new skills get their first ceiling.
export function ratchet(skills, { accept = [], reason = '' } = {}) {
  const b = loadBudgets();
  b.tolerance ??= TOLERANCE;
  b.skills ??= {};
  b.history ??= [];
  for (const s of skills) {
    const cur = b.skills[s.slug]?.ceiling;
    if (cur == null || s.tokens < cur || accept.includes(s.slug)) {
      if (cur != null && s.tokens > cur) b.history.push({ date: today(), slug: s.slug, from: cur, to: s.tokens, reason });
      b.skills[s.slug] = { ceiling: s.tokens, set: today() };
    }
  }
  for (const k of Object.keys(b.skills)) if (!skills.some((s) => s.slug === k)) delete b.skills[k];
  const cat = catalogTokens(skills);
  if (b.catalog_ceiling != null && cat > b.catalog_ceiling && accept.includes('catalog')) b.history.push({ date: today(), slug: 'catalog', from: b.catalog_ceiling, to: cat, reason });
  if (b.catalog_ceiling == null || cat < b.catalog_ceiling || accept.includes('catalog')) b.catalog_ceiling = cat;
  writeJSON(BUDGET_FILE, b);
  return b;
}
