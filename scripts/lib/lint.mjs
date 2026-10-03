// Craft lints: deterministic warnings for decisions that read as adjectives instead of recipes.
// Shot DNA lighting (skills/shot-dna/SKILL.md, decision rule 1): "cinematic", "moody", "premium" are not
// lighting decisions. A lighting field passes when it names at least one recipe term: a source or modifier
// (key/fill/rim, softbox, strip, octabox, bounce, flag, scrim, diffusion, window light, flash...), a color
// temperature in K, a lighting ratio (3:1), hard light WITH a direction, or a time of day WITH a direction.
// Warnings only: a lint never blocks, it asks the author to replace adjectives with decisions.
import path from 'node:path';
import { ROOT, readData, walk, rel } from './core.mjs';

// Mood/quality words that describe an outcome, not a lighting setup.
export const LIGHTING_ADJECTIVES = [
  'cinematic', 'moody', 'premium', 'editorial', 'dramatic', 'soft', 'beautiful', 'luxurious', 'luxury', 'elegant',
  'natural', 'warm', 'cool', 'cold', 'bright', 'dark', 'dreamy', 'ethereal', 'atmospheric', 'high-end', 'clean',
  'crisp', 'gorgeous', 'stunning', 'striking', 'epic', 'magical', 'glowing', 'lush', 'rich', 'vibrant', 'flattering',
  'professional', 'studio', 'perfect', 'nice', 'good', 'great', 'pleasing', 'subtle', 'gentle', 'harsh', 'hard',
  'golden', 'filmic', 'commercial', 'polished', 'sleek', 'modern', 'minimal', 'minimalist', 'airy', 'bold', 'intimate',
  'evocative', 'immersive', 'balanced', 'even', 'lighting', 'light', 'lit', 'look', 'feel', 'vibe', 'mood', 'tone',
];

// Terms that are a recipe on their own.
const RECIPE_TERMS = [
  /\bkey(?:\s*light)?\b/, /\bfill(?:\s*light)?\b/, /\brim(?:\s*light)?\b/, /\bback[\s-]?light(?:ing|s)?\b/, /\bhair\s*light\b/,
  /\bedge\s*light\b/, /\bkicker\b/, /\bsoft\s*box(?:es)?\b/, /\bsoftbox(?:es)?\b/, /\bstrip(?:\s*(?:box|light|softbox))?s?\b/,
  /\boctabox(?:es)?\b/, /\bbeauty\s*dish\b/, /\bumbrella\b/, /\bring\s*light\b/, /\bbounce(?:d)?\b/, /\breflector\b/,
  /\bv[\s-]?flat\b/, /\bflag(?:s|ged)?\b/, /\bnegative\s*fill\b/, /\bscrim\b/, /\bsilk\b/, /\bdiffus(?:ion|ed|er)\b/,
  /\bgrid(?:ded)?\b/, /\bsnoot\b/, /\bfresnel\b/, /\bgobo\b/, /\bcookie\b/, /\bwindow(?:\s*light)?\b/, /\bskylight\b/,
  /\bflash\b/, /\bstrobe\b/, /\bspeedlight\b/, /\bon[\s-]camera\b/, /\bcross[\s-]?light(?:ing)?\b/, /\bside[\s-]?light(?:ing)?\b/,
  /\btop[\s-]?light\b/, /\bunder[\s-]?light(?:ing)?\b/, /\bpractical(?:s)?\b/, /\btungsten\b/, /\bsodium\b/, /\bfluorescent\b/,
  /\bhmi\b/, /\bled\s*panel\b/, /\bpolari[sz](?:ed|er|ing)\b/, /\bcross[\s-]?polari[sz]/, /\boverhead\b/, /\boverexpos/,
  /\bunderexpos/, /\bambient\b/, /\bspecular\b/, /\bfalloff\b/, /\bfall-off\b/, /\bcontre[\s-]?jour\b/, /\boverc(?:ast|loud)\b/,
  /\bopen\s*shade\b/, /\bdaylight\b/, /\bsun(?:light)?\b/, /\bmoonlight\b/, /\bcandle(?:light)?\b/, /\bneon\b/,
  /\b\d{4,5}\s?k\b/, /\bkelvin\b/, /\b\d+(?:\.\d+)?\s?:\s?\d+(?:\.\d+)?\b/, /\bf\/?\d/, /\bev\s?[+-]?\d/,
];

const DIRECTION = /\b(?:from\s+)?(?:camera[\s-])?(?:left|right|behind|above|below|front|overhead|side|back|top)\b|\b\d{1,3}\s?(?:°|deg(?:rees?)?)\b|\b(?:o'?clock|north|south|east|west|axis|frontal)\b/;
const HARD_LIGHT = /\bhard(?:\s+(?:light|sun|source|shadows?))?\b/;
const TIME_OF_DAY = /\b(?:golden\s*hour|blue\s*hour|dawn|dusk|sunrise|sunset|noon|midday|morning|afternoon|evening|twilight|night)\b/;

const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'with', 'very', 'really', 'super', 'quite', 'slightly', 'of', 'in', 'to', 'but', 'yet', 'feel', 'look', 'style', 'vibes', 'feeling', 'quality', 'overall']);

function asText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(asText).join(' ');
  if (typeof v === 'object') return Object.values(v).map(asText).join(' ');
  return String(v);
}

/** Classify one lighting description. Returns {ok, recipe_terms[], adjectives[], reason?}. */
export function lintLighting(value) {
  const text = asText(value).toLowerCase().trim();
  if (!text) return { ok: false, recipe_terms: [], adjectives: [], reason: 'lighting is empty' };
  const terms = [];
  for (const re of RECIPE_TERMS) {
    const m = text.match(re);
    if (m) terms.push(m[0].trim());
  }
  const dir = text.match(DIRECTION)?.[0];
  if (dir && HARD_LIGHT.test(text)) terms.push(`${text.match(HARD_LIGHT)[0]} + ${dir.trim()}`);
  if (dir && TIME_OF_DAY.test(text)) terms.push(`${text.match(TIME_OF_DAY)[0]} + ${dir.trim()}`);
  const words = text.split(/[^a-z-]+/).filter(Boolean);
  const adjectives = [...new Set(words.filter((w) => LIGHTING_ADJECTIVES.includes(w)))];
  if (terms.length) return { ok: true, recipe_terms: [...new Set(terms)], adjectives };
  const content = words.filter((w) => !STOP.has(w));
  const adjectiveOnly = content.length > 0 && content.every((w) => LIGHTING_ADJECTIVES.includes(w) || TIME_OF_DAY.test(w));
  return {
    ok: false,
    recipe_terms: [],
    adjectives,
    reason: adjectiveOnly ? `adjective-only lighting (${adjectives.join(', ')})` : `no recipe term${adjectives.length ? ` (adjectives: ${adjectives.join(', ')})` : ''}`,
  };
}

const HINT = 'name a recipe: source + modifier + direction (e.g. "large softbox camera-left, white bounce right, 4:1"), a color temperature in K, or a LIGHT_* lighting_recipe id';

/**
 * lintShotDNA(record) -> {ok, findings:[{level:'warn', field, detail}]}
 * Warns when `lighting` lacks a recipe term. A `lighting_recipe` id (LIGHT_*) counts as a recipe for the record,
 * but adjective-only free text alongside it still warns so the prose does not drift from the id.
 */
export function lintShotDNA(record) {
  const findings = [];
  if (!record || typeof record !== 'object') return { ok: false, findings: [{ level: 'warn', field: '/', detail: 'not a shot-dna object' }] };
  const res = lintLighting(record.lighting);
  const hasRecipeId = typeof record.lighting_recipe === 'string' && /^LIGHT_/i.test(record.lighting_recipe);
  if (!res.ok && !(hasRecipeId && !res.adjectives.length && res.reason !== 'lighting is empty')) {
    findings.push({ level: 'warn', field: 'lighting', detail: `${res.reason}; ${HINT}` });
  }
  return { ok: findings.length === 0, findings, recipe_terms: res.recipe_terms };
}

/** Shot DNA records in the repo (examples, fixtures, templates...): files named *.shot-dna.(json|yaml|yml). tests/ is skipped: it holds deliberate failures. */
export function findShotDNAFiles(dir = ROOT, { skip = ['node_modules', 'tests', '.cstack'] } = {}) {
  return walk(dir, (p) => /\.shot-dna\.(json|ya?ml)$/.test(p)).filter((f) => !skip.some((s) => path.relative(dir, f).startsWith(s)));
}

/** Lint every shot-dna file under dir. Returns [{file, findings}] (only files with findings, plus read errors). */
export function lintShotDNATree(dir = ROOT, opts) {
  const out = [];
  for (const f of findShotDNAFiles(dir, opts)) {
    let rec;
    try {
      rec = readData(f);
    } catch (e) {
      out.push({ file: rel(f), findings: [{ level: 'warn', field: '/', detail: `unreadable: ${e.message}` }] });
      continue;
    }
    const r = lintShotDNA(rec);
    if (r.findings.length) out.push({ file: rel(f), findings: r.findings });
  }
  return out;
}
