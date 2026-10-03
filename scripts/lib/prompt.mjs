// Prompt Slots compiler (section 12): one stable template, named slots, deterministic variant pools.
// Fails loudly on missing required slots, undeclared placeholders and unused values (wiring bugs).
import { hashValue, sha256 } from './core.mjs';

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
 * Precedence for each slot: explicit value > variant_index > seed-derived variant > (required ? error : empty).
 */
export function compile(recipe, opts = {}) {
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

  const slot_values = Object.fromEntries(Object.entries(resolved).map(([k, v]) => [k, v.value]));
  const hash = hashValue({ template, slot_values, target_model: recipe.target_model ?? null, parameters: recipe.parameters ?? {} });
  return { prompt, slot_values, resolution: resolved, hash, errors, ok: errors.length === 0 };
}

// Component-level diff between two recipes (section 12: never diff two 4k strings by eye).
export function diffRecipes(a, b) {
  const out = [];
  if ((a.template ?? '') !== (b.template ?? '')) out.push({ part: 'template', change: 'changed' });
  if ((a.target_model ?? '') !== (b.target_model ?? '')) out.push({ part: 'target_model', from: a.target_model, to: b.target_model });
  const keys = new Set([...Object.keys(a.values ?? {}), ...Object.keys(b.values ?? {}), ...Object.keys(a.slots ?? {}), ...Object.keys(b.slots ?? {})]);
  for (const k of [...keys].sort()) {
    const av = a.values?.[k];
    const bv = b.values?.[k];
    if (av !== bv) out.push({ part: `slot.${k}`, from: av ?? null, to: bv ?? null });
  }
  const ap = JSON.stringify(a.parameters ?? {});
  const bp = JSON.stringify(b.parameters ?? {});
  if (ap !== bp) out.push({ part: 'parameters', from: a.parameters ?? {}, to: b.parameters ?? {} });
  const ar = JSON.stringify(a.references ?? []);
  const br = JSON.stringify(b.references ?? []);
  if (ar !== br) out.push({ part: 'references', change: 'changed' });
  return out;
}
