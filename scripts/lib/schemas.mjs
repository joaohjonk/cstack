// Schema registry + data-file conventions.
// Convention: any file named `<anything>.<schema>.(json|yaml|yml)` validates against schemas/<schema>.schema.json.
// Fixed paths and JSONL ledgers are mapped below.
import path from 'node:path';
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { ROOT, readJSON, readData, readJSONL, walk, rel } from './core.mjs';

const SCHEMA_DIR = path.join(ROOT, 'schemas');

export const FIXED = {
  'registry/models.json': 'model-registry',
  'brand/brand-system.json': 'brand-system',
  'brand/brand-world.json': 'brand-world',
  'registry/creative-taxonomy.json': 'creative-taxonomy',
};
export const JSONL = {
  'learnings.jsonl': 'learning-event',
  'approvals.jsonl': 'feedback-event',
  'feedback.jsonl': 'feedback-event',
  'cost-ledger.jsonl': 'cost-ledger-entry',
  'failures.jsonl': 'failure-event',
  'evals.jsonl': 'eval',
  'lineage.jsonl': 'artifact-lineage',
  'culture.jsonl': 'cultural-signal',
  'competitors.jsonl': 'competitor-observation',
  'performance.jsonl': 'creative-performance',
  'insights.jsonl': 'creative-insight',
};

let _ajv;
export function ajv() {
  if (_ajv) return _ajv;
  _ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(_ajv);
  for (const f of fs.readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.schema.json'))) {
    const s = readJSON(path.join(SCHEMA_DIR, f));
    // register under both its $id and its bare filename so relative $refs resolve
    _ajv.addSchema(s, f);
  }
  return _ajv;
}

export const schemaNames = () =>
  fs.readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.schema.json')).map((f) => f.replace('.schema.json', ''));

export function validator(name) {
  const v = ajv().getSchema(`${name}.schema.json`);
  if (!v) throw new Error(`unknown schema: ${name}`);
  return v;
}

export function formatErrors(errors = []) {
  return errors.map((e) => `${e.instancePath || '/'} ${e.message}${e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ''}`).join('; ');
}

export function validateValue(name, value) {
  const v = validator(name);
  const ok = v(value);
  return { ok, errors: ok ? '' : formatErrors(v.errors) };
}

// Which schema governs this file, if any.
export function schemaFor(file, base = ROOT) {
  const r = path.relative(base, file).split(path.sep).join('/');
  if (FIXED[r]) return FIXED[r];
  // a brand workspace nested anywhere (examples/<brand>/brand/...) uses the same fixed paths; templates hold placeholders
  if (!r.startsWith('templates/')) for (const [k, v] of Object.entries(FIXED)) if (k.startsWith('brand/') && r.endsWith(`/${k}`)) return v;
  const b = path.basename(file);
  if (b === 'experiment-run.yaml' || b === 'experiment-run.json') return 'experiment-run';
  if (b.endsWith('.jsonl')) return JSONL[b] ?? null;
  const m = b.match(/\.([a-z0-9-]+)\.(json|ya?ml)$/);
  if (m && schemaNames().includes(m[1])) return m[1];
  return null;
}

// Validate every governed data file under `dir`. Returns [{file, schema, ok, errors}]
export function validateTree(dir, { base = dir, skip = [] } = {}) {
  const results = [];
  const files = walk(dir, (p) => /\.(json|ya?ml|jsonl)$/.test(p) && !p.includes(`${path.sep}schemas${path.sep}`));
  for (const f of files) {
    const r = path.relative(base, f);
    if (skip.some((s) => r.startsWith(s))) continue;
    const schema = schemaFor(f, base);
    if (!schema) continue;
    try {
      if (f.endsWith('.jsonl')) {
        readJSONL(f).forEach((row, i) => {
          const res = validateValue(schema, row);
          results.push({ file: `${rel(f)}#${i + 1}`, schema, ...res });
        });
      } else {
        results.push({ file: rel(f), schema, ...validateValue(schema, readData(f)) });
      }
    } catch (e) {
      results.push({ file: rel(f), schema, ok: false, errors: e.message });
    }
  }
  return results;
}
