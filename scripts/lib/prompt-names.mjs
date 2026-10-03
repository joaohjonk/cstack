// Names stay out of prompts: a canon person or studio, or a "style of" phrase, never reaches a generation model.
// The reference carries the style; names are metadata (docs/lineage.md, prompt-director). This makes that rule a check.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, exists, readYAML } from './core.mjs';

const STYLE_PHRASE = /\b(in the (?:style|manner|spirit) of|à la|a la maniere de|à la manière de)\b|\b[A-Z][\p{L}]+-(?:style|esque)\b/iu;
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Canon entries of kind person or studio, as the full names a prompt could carry ("Bureau Borsche", "Mirko Borsche").
export function canonNames(dir = path.join(ROOT, 'canon')) {
  if (!exists(dir)) return [];
  const names = new Set();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.canon-entry.yaml'))) {
    const e = readYAML(path.join(dir, f));
    if (!['person', 'studio'].includes(e?.kind) || typeof e.name !== 'string') continue;
    const inner = e.name.match(/\(([^)]*)\)/)?.[1] ?? '';
    for (const part of [e.name.replace(/\(.*?\)/g, ''), ...inner.split(/,| and /)].flatMap((s) => s.split(/\s+\/\s+/))) {
      const n = part.trim();
      if (n.split(/\s+/).length >= 2 && /^\p{Lu}/u.test(n) && !/\bstudio\b/i.test(n)) names.add(n);
    }
  }
  return [...names].sort();
}

// styleLeaks(prompt, names) -> list of problems; empty means the prompt carries no names or style phrases.
export function styleLeaks(prompt, names = []) {
  const text = String(prompt ?? '');
  const out = [];
  const m = text.match(STYLE_PHRASE);
  if (m) out.push(`"${m[0]}": describe the mechanism (light, material, grid, palette), not a person or style`);
  for (const n of names) if (new RegExp(`(?<![\\p{L}])${escape(n)}(?![\\p{L}])`, 'iu').test(text)) out.push(`names "${n}": names are metadata, never prompt text`);
  return out;
}
