// Prompt Slots compiler: one stable template, named slots, deterministic variant pools.
// Fails loudly on missing required slots, undeclared placeholders and unused values (wiring bugs).
import { hashValue, sha256 } from './core.mjs';
import { styleLeaks } from './prompt-names.mjs';

const PLACEHOLDER = /(?<!\{)\{([a-z][a-z0-9_]*)\}(?!\})/g;

export function placeholders(template) {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[1]))];
}

// Deterministic index from a seed and slot name, so `seed` reproduces the same variant choice everywhere.
export function seededIndex(seed, slot, n) {
  const h = sha256(`${seed}:${slot}`);
  return parseInt(h.slice(0, 8), 16) % n;
}

/**
 * compile(recipe, {values, variant_index, seed}) -> {prompt, slot_values, hash, errors}
 * opts.names: names that must never reach a prompt (canonNames()); style phrases ("in the style of") always fail.
 * Precedence for each slot: explicit value > variant_index > seed-derived variant > (required ? error : empty).
 */
export function compile(recipe, opts = {}) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe) || typeof recipe.template !== 'string' || !recipe.template.trim() || (recipe.slots != null && typeof recipe.slots !== 'object'))
    throw new Error('not a prompt recipe (needs a template string and a slots map)');
  const errors = [];
  const template = recipe.template ?? '';
  const slots = recipe.slots ?? {};
  const values = { ...(recipe.values ?? {}), ...(opts.values ?? {}) };
  const vindex = { ...(recipe.variant_index ?? {}), ...(opts.variant_index ?? {}) };
  const seed = opts.seed ?? recipe.seed;
  const used = placeholders(template);

  for (const p of used) if (!(p in slots)) errors.push(`placeholder {${p}} is not declared in slots`);
  for (const s of Object.keys(slots)) if (!used.includes(s)) errors.push(`slot "${s}" is declared but never used in the template`);
  for (const v of Object.keys(values)) if (!(v in slots)) errors.push(`value given for unknown slot "${v}"`);
  for (const v of Object.keys(vindex)) if (!(v in slots)) errors.push(`variant_index given for unknown slot "${v}"`);

  const resolved = {};
  for (const [name, def] of Object.entries(slots)) {
    const pool = def.variants ?? [];
    let val;
    let how;
    if (values[name] !== undefined && values[name] !== null && values[name] !== '') {
      val = String(values[name]);
      how = 'value';
    } else if (vindex[name] !== undefined) {
      if (!pool.length) errors.push(`variant_index for "${name}" but the slot has no variants`);
      else if (vindex[name] < 0 || vindex[name] >= pool.length) errors.push(`variant_index ${vindex[name]} out of range for "${name}" (0..${pool.length - 1})`);
      else {
        val = pool[vindex[name]];
        how = `variant[${vindex[name]}]`;
      }
    } else if (seed !== undefined && pool.length) {
      const i = seededIndex(seed, name, pool.length);
      val = pool[i];
      how = `seed:${seed}->variant[${i}]`;
    }
    if (val === undefined) {
      if (def.required !== false) errors.push(`required slot "${name}" has no value`);
      val = '';
      how = 'empty';
    }
    resolved[name] = { value: val, how };
  }

  let prompt = template.replace(PLACEHOLDER, (_, n) => resolved[n]?.value ?? '');
  prompt = prompt
    .replace(/\{\{/g, '{')
    .replace(/\}\}/g, '}')
    .replace(/[ \t]+([,.;:])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  for (const leak of styleLeaks(prompt, opts.names)) errors.push(`prompt ${leak}`);
  const warnings = contradictions({ template, ...Object.fromEntries(Object.entries(resolved).map(([k, v]) => [`slot "${k}"`, v.value])) });

  const slot_values = Object.fromEntries(Object.entries(resolved).map(([k, v]) => [k, v.value]));
  const hash = hashValue({ template, slot_values, target_model: recipe.target_model ?? null, parameters: recipe.parameters ?? {} });
  return { prompt, slot_values, resolution: resolved, hash, errors, warnings, ok: errors.length === 0 };
}

// F70: slots that pull against each other ("no lettering" in one, "the price printed on the can" in another) compile
// fine and confuse the model. Each pair is two sides of one decision; the first side is removed from a text before the
// second is looked for, so "no logos" does not also count as asking for a logo. A warning, not a failure: the words
// may be deliberate, and the recipe's author decides.
const CLASHES = [
  ['no lettering', /\b(no|without|free of|never any)\s+(visible\s+)?(text|lettering|letters|words|typography|type|logos?|labels?|branding)\b/gi, 'text or a mark in the frame', /\b(printed|lettering|wordmark|logo|headline|caption|typography|the price|price tag|label reads|reads ")/i],
  ['close-up', /\b(close-up|close up|macro|extreme close|tight crop)\b/gi, 'a wide frame', /\b(wide shot|wide angle|establishing|full[- ]body|long shot|aerial)\b/i],
  ['night or dark', /\b(night|nighttime|after dark|moonlit|low[- ]key|pitch dark)\b/gi, 'daylight', /\b(midday|noon|bright daylight|harsh sun|high[- ]key|sunny)\b/i],
  ['studio', /\b(studio|seamless (backdrop|background|paper)|cyclorama)\b/gi, 'outdoors', /\b(outdoors?|on the street|beach|forest|park|in the wild|rooftop)\b/i],
  ['shallow focus', /\b(shallow depth of field|bokeh|f\/1\.[0-9]|wide open aperture)\b/gi, 'deep focus', /\b(deep focus|everything in focus|f\/(8|11|16|22)|front-to-back sharp)\b/i],
  ['black and white', /\b(black and white|black-and-white|monochrome|greyscale|grayscale)\b/gi, 'saturated colour', /\b(vivid|saturated|full colou?r|technicolor|neon colou?rs?)\b/i],
  ['top-down', /\b(top[- ]down|overhead|flat ?lay|bird'?s[- ]eye)\b/gi, 'eye level or low angle', /\b(eye[- ]level|low angle|worm'?s[- ]eye|from below)\b/i],
  ['minimal', /\b(minimal|sparse|empty|single object|lone)\b/gi, 'a busy frame', /\b(busy|crowded|cluttered|packed|maximalist|many objects)\b/i],
];

export function contradictions(sources) {
  const out = [];
  for (const [aName, aRe, bName, bRe] of CLASHES) {
    const as = [];
    const bs = [];
    for (const [where, text] of Object.entries(sources)) {
      const t = String(text ?? '');
      if (new RegExp(aRe.source, 'i').test(t)) as.push(where);
      if (bRe.test(t.replace(new RegExp(aRe.source, 'gi'), ' '))) bs.push(where);
    }
    for (const a of as) {
      const b = bs.find((x) => x !== a) ?? (bs.includes(a) ? a : null);
      if (b) {
        out.push(`${a} asks for ${aName} and ${b === a ? 'also' : b} asks for ${bName}; pick one, or say how both hold`);
        break;
      }
    }
  }
  return out;
}

// Component-level diff between two recipes (never diff two 4k strings by eye).
export function diffRecipes(a, b) {
  const out = [];
  if ((a.template ?? '') !== (b.template ?? '')) out.push({ part: 'template', change: 'changed' });
  if ((a.target_model ?? '') !== (b.target_model ?? '')) out.push({ part: 'target_model', from: a.target_model, to: b.target_model });
  if (JSON.stringify(a.seed ?? null) !== JSON.stringify(b.seed ?? null)) out.push({ part: 'seed', from: a.seed ?? null, to: b.seed ?? null });
  const keys = new Set([...Object.keys(a.values ?? {}), ...Object.keys(b.values ?? {}), ...Object.keys(a.slots ?? {}), ...Object.keys(b.slots ?? {})]);
  const same = (x, y) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
  for (const k of [...keys].sort()) {
    const av = a.values?.[k];
    const bv = b.values?.[k];
    if (av !== bv) out.push({ part: `slot.${k}`, from: av ?? null, to: bv ?? null });
    if (!same(a.variant_index?.[k], b.variant_index?.[k])) out.push({ part: `slot.${k}.variant_index`, from: a.variant_index?.[k] ?? null, to: b.variant_index?.[k] ?? null });
    const as = a.slots?.[k];
    const bs = b.slots?.[k];
    if (!as || !bs) {
      if (as || bs) out.push({ part: `slot.${k}.definition`, change: as ? 'removed' : 'added' });
      continue;
    }
    if (!same(as.variants, bs.variants)) out.push({ part: `slot.${k}.variants`, from: as.variants ?? [], to: bs.variants ?? [] });
    if (!same(as.required, bs.required)) out.push({ part: `slot.${k}.required`, from: as.required ?? null, to: bs.required ?? null });
  }
  const ap = JSON.stringify(a.parameters ?? {});
  const bp = JSON.stringify(b.parameters ?? {});
  if (ap !== bp) out.push({ part: 'parameters', from: a.parameters ?? {}, to: b.parameters ?? {} });
  const ar = JSON.stringify(a.references ?? []);
  const br = JSON.stringify(b.references ?? []);
  if (ar !== br) out.push({ part: 'references', change: 'changed' });
  return out;
}
