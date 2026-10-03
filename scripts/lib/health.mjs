// Skill health dashboard (section 24A): one table a maintainer reads before trusting the catalog.
import path from 'node:path';
import fs from 'node:fs';
import { ROOT, Report, exists, readData, readJSONL } from './core.mjs';
import { listSkills, checkSkill, duplicateLines } from './skills.mjs';
import { checkBudgets } from './budget.mjs';
import { loadFixtures } from './evalplan.mjs';
import { STALE_DAYS } from './router.mjs';

export function healthReport() {
  const skills = listSkills();
  const slugs = skills.map((s) => s.slug);
  const budgets = checkBudgets(skills);
  const fixtures = loadFixtures();
  const failures = readJSONL(path.join(ROOT, 'state', 'failures.jsonl'));
  const wfSkills = new Set();
  const wfDir = path.join(ROOT, 'workflows');
  if (exists(wfDir))
    for (const d of fs.readdirSync(wfDir)) {
      const p = path.join(wfDir, d, 'workflow.yaml');
      if (exists(p)) for (const st of readData(p).steps ?? []) if (st.skill) wfSkills.add(st.skill);
    }
  const handedTo = new Set(skills.flatMap((s) => s.meta?.handoff ?? []));
  const now = Date.now();
  const rows = skills.map((s) => {
    const r = new Report();
    checkSkill(s, r, { allSlugs: slugs });
    const b = budgets.rows.find((x) => x.slug === s.slug);
    const fx = fixtures.filter((f) => (f.skills ?? []).includes(s.slug)).length;
    const lv = s.meta?.last_verified;
    const stale = !lv || (now - new Date(lv)) / 86400000 > STALE_DAYS;
    const used = wfSkills.has(s.slug) || handedTo.has(s.slug) || s.meta?.type === 'playbook' || ['office-hours', 'retro', 'learn'].includes(s.slug);
    return {
      slug: s.slug,
      type: s.meta?.type ?? '?',
      status: s.meta?.status ?? '?',
      valid: r.ok ? 'ok' : `${r.errors.length} err`,
      tokens: s.tokens,
      budget: b?.status ?? '-',
      fixtures: fx,
      cost: s.meta?.cost_class ?? '-',
      last_verified: lv ?? 'never',
      stale,
      used,
      failures: failures.filter((f) => f.task === s.slug).length,
    };
  });
  const dups = duplicateLines(skills);
  const lines = [];
  lines.push('slug'.padEnd(24) + 'type'.padEnd(11) + 'status'.padEnd(8) + 'valid'.padEnd(8) + 'tokens'.padStart(7) + ' budget'.padEnd(8) + ' fx'.padStart(4) + ' cost'.padEnd(8) + ' verified'.padEnd(12) + ' notes');
  for (const r of rows) {
    const notes = [r.fixtures ? null : 'no eval fixture', r.used ? null : 'unused (no workflow/handoff reaches it)', r.failures ? `${r.failures} known failures` : null].filter(Boolean).join('; ');
    lines.push(r.slug.padEnd(24) + r.type.padEnd(11) + r.status.padEnd(8) + r.valid.padEnd(8) + String(r.tokens).padStart(7) + ' ' + r.budget.padEnd(7) + String(r.fixtures).padStart(4) + ' ' + r.cost.padEnd(7) + ' ' + r.last_verified.padEnd(11) + ' ' + notes);
  }
  lines.push('');
  lines.push(`skills ${rows.length} · invalid ${rows.filter((r) => r.valid !== 'ok').length} · without fixtures ${rows.filter((r) => !r.fixtures).length} · over budget ${rows.filter((r) => r.budget === 'over').length} · catalog ${budgets.catalog.tokens} tokens`);
  if (dups.length) {
    lines.push(`duplicate instruction lines across skills: ${dups.length} (move shared text to skills/cstack-shared/)`);
    for (const d of dups.slice(0, 8)) lines.push(`  · [${d.skills.join(', ')}] ${d.line.slice(0, 90)}`);
  }
  const reg = exists(path.join(ROOT, 'registry', 'models.json')) ? readData(path.join(ROOT, 'registry', 'models.json')) : { models: [] };
  const staleModels = reg.models.filter((m) => !m.last_verified || (now - new Date(m.last_verified)) / 86400000 > STALE_DAYS);
  lines.push(`model registry: ${reg.models.length} entries, ${staleModels.length} stale or unverified (> ${STALE_DAYS} days)`);
  return { rows, duplicates: dups, catalog: budgets.catalog, stale_models: staleModels.map((m) => m.model_id), text: lines.join('\n') };
}
