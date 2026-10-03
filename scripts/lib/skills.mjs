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
    for (const e of s.meta.evals ?? []) if (!exists(path.join(ROOT, e))) report.error(mwhere, `declared eval "${e}" does not exist`);
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
// to 1-3 skills without loading every SKILL.md into context. Whole words with a light stem, so "ad"
// no longer matches "brand"; terms that appear in many skills ("brand") count for less (idf).
const STOP = new Set(['the', 'a', 'an', 'for', 'of', 'on', 'to', 'and', 'or', 'our', 'we', 'my', 'me', 'it', 'is', 'this', 'that', 'with', 'in', 'at', 'by', 'be', 'can', 'you', 'please', 'need', 'want', 'make', 'some', 'up', 'do', 'how', 'what']);
const stemWord = (w) => (w.length > 4 ? w.replace(/(ings|ing|ed|es|s)$/, '') : w.replace(/s$/, '')).replace(/e$/, '');
const wordsOf = (text) => (String(text ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? []).map(stemWord);
const matches = (term, words) => words.some((w) => w === term || (term.length >= 4 && w.startsWith(term)) || (w.length >= 4 && term.startsWith(w)));

export function search(index, query, k = 5) {
  const terms = [...new Set((String(query).toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => !STOP.has(t)).map(stemWord))].filter((t) => t.length > 1);
  const docs = index.skills.map((s) => ({
    s,
    fields: [
      [wordsOf(s.slug.replace(/-/g, ' ')), 4],
      [wordsOf(s.triggers.join(' ')), 3],
      [wordsOf(s.tags.join(' ')), 2],
      [wordsOf(s.summary), 1.5],
      [wordsOf(s.outputs.join(' ')), 0.5],
    ],
  }));
  const n = docs.length;
  const idf = Object.fromEntries(terms.map((t) => [t, Math.log((n + 1) / (docs.filter((d) => d.fields.some(([w]) => matches(t, w))).length + 0.5))]));
  const phrase = ` ${(String(query).toLowerCase().match(/[a-z0-9]+/g) ?? []).join(' ')} `;
  const scored = docs.map(({ s, fields }) => {
    let score = 0;
    for (const t of terms) for (const [w, weight] of fields) if (matches(t, w)) score += weight * idf[t];
    // a whole trigger phrase inside the request is the strongest signal
    for (const tr of s.triggers) if (tr.includes(' ') && phrase.includes(` ${(tr.toLowerCase().match(/[a-z0-9]+/g) ?? []).join(' ')} `)) score += 6;
    return { slug: s.slug, score: Math.round(score * 10) / 10, summary: s.summary, type: s.type };
  });
  return scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug)).slice(0, k);
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
