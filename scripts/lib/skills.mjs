// Skill catalog: discovery, contract validation, index generation, search, duplicate detection.
// A skill = skills/<slug>/SKILL.md (portable Agent Skills format: name + description frontmatter)
//         + skills/<slug>/skill.meta.json (machine-readable twin, schemas/skill-meta.schema.json).
import path from 'node:path';
import fs from 'node:fs';
import { ROOT, exists, readText, readJSON, parseFrontmatter, estimateTokens, walk, rel } from './core.mjs';
import { validateValue } from './schemas.mjs';

export const SKILLS_DIR = path.join(ROOT, 'skills');

// Section 24 output contract. Each keyword must appear in at least one H2 heading;
// one heading may cover several ("## Outputs, files written, state updated").
export const CONTRACT_KEYWORDS = [
  ['when to use', /when to use/i],
  ['when not to use', /when not to use/i],
  ['inputs', /\binputs?\b/i],
  ['missing-input behavior', /missing/i],
  ['source precedence', /precedence/i],
  ['tools / providers', /tools|providers/i],
  ['process', /process/i],
  ['decision rules', /decision/i],
  ['outputs', /outputs?/i],
  ['files written', /files/i],
  ['state updated', /state/i],
  ['evals required', /evals?/i],
  ['handoff', /handoff/i],
  ['failure modes', /failure/i],
  ['examples', /examples?/i],
];

export function listSkills(dir = SKILLS_DIR) {
  if (!exists(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_') && exists(path.join(dir, e.name, 'SKILL.md')))
    .map((e) => loadSkill(path.join(dir, e.name)));
}

export function loadSkill(dir) {
  const slug = path.basename(dir);
  const mdPath = path.join(dir, 'SKILL.md');
  const metaPath = path.join(dir, 'skill.meta.json');
  const text = readText(mdPath);
  const { data, body } = parseFrontmatter(text);
  let meta = null;
  let metaError = null;
  if (exists(metaPath)) {
    try {
      meta = readJSON(metaPath);
    } catch (e) {
      metaError = e.message;
    }
  }
  const headings = [...body.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
  // Files bundled with the skill (references/, templates/) are loaded on demand: count them separately.
  const extra = walk(dir, (p) => p !== mdPath && p !== metaPath && /\.(md|ya?ml|json|txt)$/.test(p));
  return {
    slug,
    dir,
    mdPath,
    metaPath,
    text,
    frontmatter: data,
    body,
    meta,
    metaError,
    headings,
    tokens: estimateTokens(text),
    onDemandTokens: extra.reduce((s, p) => s + estimateTokens(readText(p)), 0),
    extraFiles: extra.map(rel),
  };
}

export function checkSkill(s, report, { allSlugs = [] } = {}) {
  const where = rel(s.mdPath);
  const fm = s.frontmatter;
  if (!fm) report.error(where, 'missing YAML frontmatter');
  else {
    if (fm.name !== s.slug) report.error(where, `frontmatter name "${fm.name}" must equal directory "${s.slug}"`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.name ?? '') || (fm.name ?? '').length > 64) report.error(where, 'name must be lowercase-hyphenated, max 64 chars');
    if (!fm.description || typeof fm.description !== 'string') report.error(where, 'description is required');
    else if (fm.description.length > 1024) report.error(where, `description is ${fm.description.length} chars (max 1024)`);
    else if (fm.description.length < 40) report.warn(where, 'description is very short; triggers will be weak');
    const allowed = new Set(['name', 'description', 'license', 'allowed-tools', 'metadata', 'compatibility']);
    for (const k of Object.keys(fm)) if (!allowed.has(k)) report.warn(where, `non-standard frontmatter key "${k}" (put it in skill.meta.json)`);
  }
  // contract sections
  for (const [label, re] of CONTRACT_KEYWORDS) if (!s.headings.some((h) => re.test(h))) report.error(where, `missing contract section: ${label}`);
  // meta
  const mwhere = rel(s.metaPath);
  if (s.metaError) report.error(mwhere, s.metaError);
  else if (!s.meta) report.error(mwhere, 'missing skill.meta.json');
  else {
    const v = validateValue('skill-meta', s.meta);
    if (!v.ok) report.error(mwhere, v.errors);
    if (s.meta.slug !== s.slug) report.error(mwhere, `slug "${s.meta.slug}" must equal directory "${s.slug}"`);
    for (const h of s.meta.handoff ?? []) if (allSlugs.length && !allSlugs.includes(h)) report.error(mwhere, `handoff to unknown skill "${h}"`);
    if (s.meta.status !== 'stub' && !(s.meta.evals ?? []).length) report.warn(mwhere, 'no evals declared');
  }
  // relative links inside SKILL.md must resolve (relative to the skill dir, or to repo root for `/`-less repo paths)
  for (const m of s.body.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)) {
    const link = m[1];
    if (/^[a-z]+:/i.test(link)) continue;
    const a = path.resolve(s.dir, link);
    const b = path.resolve(ROOT, link.replace(/^\//, ''));
    if (!exists(a) && !exists(b)) report.error(where, `broken link: ${link}`);
  }
}

export function buildIndex(skills) {
  return {
    generated_by: 'cstack index',
    note: 'GENERATED from skills/*/skill.meta.json. Do not edit by hand; run `cstack index`.',
    count: skills.length,
    skills: skills
      .filter((s) => s.meta)
      .map((s) => ({
        slug: s.slug,
        type: s.meta.type,
        status: s.meta.status,
        summary: s.meta.summary,
        tags: s.meta.tags ?? [],
        triggers: s.meta.triggers ?? [],
        required_inputs: s.meta.required_inputs ?? [],
        outputs: s.meta.outputs ?? [],
        handoff: s.meta.handoff ?? [],
        cost_class: s.meta.cost_class,
        context_class: s.meta.context_class,
        mutating: s.meta.mutating,
        required_providers: s.meta.required_providers ?? [],
        path: rel(s.mdPath),
        tokens: s.tokens,
      }))
      .sort((a, b) => a.slug.localeCompare(b.slug)),
  };
}

// Tiny lexical search over the index (no embeddings, no network): good enough to route a request
// to 1-3 skills without loading every SKILL.md into context.
export function search(index, query, k = 5) {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  const scored = index.skills.map((s) => {
    const fields = [
      [s.slug, 4],
      [s.triggers.join(' '), 3],
      [s.tags.join(' '), 2],
      [s.summary, 1.5],
      [s.outputs.join(' '), 0.5],
    ];
    let score = 0;
    for (const t of terms) for (const [f, w] of fields) if (f.toLowerCase().includes(t)) score += w;
    return { slug: s.slug, score, summary: s.summary, type: s.type };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}

// Duplicate instruction detection: normalized lines (>= 60 chars) that appear in 2+ skills.
// Shared boilerplate belongs in skills/cstack-shared/, not copied into every skill (section 24A).
export function duplicateLines(skills, minLen = 60) {
  const seen = new Map();
  for (const s of skills) {
    for (const raw of s.body.split('\n')) {
      const l = raw.replace(/^[\s>*\-\d.]+/, '').trim().toLowerCase();
      if (l.length < minLen) continue;
      if (!seen.has(l)) seen.set(l, new Set());
      seen.get(l).add(s.slug);
    }
  }
  return [...seen.entries()].filter(([, v]) => v.size > 1).map(([line, v]) => ({ line, skills: [...v] }));
}
