// cstack core helpers: paths, file IO, hashing, frontmatter, JSONL.
// Deterministic and dependency-light on purpose: everything here is T0/T1 testable.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const rel = (p) => path.relative(ROOT, p) || '.';
export const exists = (p) => fs.existsSync(p);
export const readText = (p) => fs.readFileSync(p, 'utf8');
export const readJSON = (p) => JSON.parse(readText(p));
export const readYAML = (p) => YAML.parse(readText(p));
export const readData = (p) => (p.endsWith('.json') ? readJSON(p) : readYAML(p));

// Atomic write: write to a temp file in the same dir, then rename (section 25).
export function writeAtomic(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, p);
}
export const writeJSON = (p, obj) => writeAtomic(p, JSON.stringify(obj, null, 2) + '\n');

export function appendJSONL(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, JSON.stringify(obj) + '\n');
}
export function readJSONL(p) {
  if (!exists(p)) return [];
  return readText(p)
    .split('\n')
    .map((l, i) => [l.trim(), i + 1])
    .filter(([l]) => l && !l.startsWith('//'))
    .map(([l, line]) => {
      try {
        return JSON.parse(l);
      } catch (e) {
        throw new Error(`${rel(p)}:${line} invalid JSON line: ${e.message}`);
      }
    });
}

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
export const sha256File = (p) => sha256(fs.readFileSync(p));
// Stable hash of a JSON value: keys sorted, so recipe hashes don't change with key order.
export function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}
export const hashValue = (v) => sha256(stableStringify(v));

// YAML frontmatter between leading '---' lines.
export function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: null, body: text };
  return { data: YAML.parse(m[1]) ?? {}, body: text.slice(m[0].length) };
}

export function walk(dir, filter = () => true, out = []) {
  if (!exists(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, filter, out);
    else if (filter(p)) out.push(p);
  }
  return out;
}

export const today = () => new Date().toISOString().slice(0, 10);
export const nowISO = () => new Date().toISOString();

// Rough, deterministic token estimate (chars/4) used for context budgets.
// It is a ratchet signal, not billing truth; the same estimator is used on both sides of every comparison.
export const estimateTokens = (text) => Math.ceil(text.length / 4);

export function newId(prefix) {
  const d = today().replaceAll('-', '');
  return `${prefix}-${d}-${crypto.randomBytes(3).toString('hex')}`;
}

export class Report {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.notes = [];
  }
  error(where, msg) {
    this.errors.push(`${where}: ${msg}`);
  }
  warn(where, msg) {
    this.warnings.push(`${where}: ${msg}`);
  }
  note(msg) {
    this.notes.push(msg);
  }
  get ok() {
    return this.errors.length === 0;
  }
  print(title) {
    for (const n of this.notes) console.log(`  · ${n}`);
    for (const w of this.warnings) console.log(`  WARN ${w}`);
    for (const e of this.errors) console.log(`  FAIL ${e}`);
    console.log(`${title}: ${this.ok ? 'PASS' : 'FAIL'} (${this.errors.length} errors, ${this.warnings.length} warnings)`);
  }
}
