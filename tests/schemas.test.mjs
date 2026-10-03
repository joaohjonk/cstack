// Every object node in schemas/*.json decides additionalProperties explicitly, so a typo in a governed file
// (for example `gate.pass_iff`) fails validation instead of passing as an unknown key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'schemas');

const MAPS = ['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas'];
// `if` and `not` are conditions, not shapes: closing them would change what they match.
const ONE = ['items', 'additionalItems', 'additionalProperties', 'unevaluatedProperties', 'contains', 'propertyNames', 'then', 'else'];
const MANY = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];

function objectNodesMissingAP(node, at, out) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return out;
  const types = [].concat(node.type ?? []);
  const isObject = types.includes('object') || (node.properties && !node.$ref);
  if (isObject && !('additionalProperties' in node) && !('unevaluatedProperties' in node)) out.push(at || '/');
  for (const k of MAPS) for (const [name, sub] of Object.entries(node[k] ?? {})) objectNodesMissingAP(sub, `${at}/${k}/${name}`, out);
  for (const k of ONE) objectNodesMissingAP(node[k], `${at}/${k}`, out);
  for (const k of MANY) (Array.isArray(node[k]) ? node[k] : []).forEach((sub, i) => objectNodesMissingAP(sub, `${at}/${k}/${i}`, out));
  return out;
}

test('schemas: every object node sets additionalProperties', () => {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.schema.json'));
  assert.ok(files.length > 0);
  const missing = files.flatMap((f) => objectNodesMissingAP(JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')), '', []).map((p) => `${f}#${p}`));
  assert.deepEqual(missing, []);
});

test('schemas: the walker catches a nested object without additionalProperties', () => {
  const s = { type: 'object', additionalProperties: false, properties: { a: { type: 'object', properties: { b: { type: 'string' } } } } };
  assert.deepEqual(objectNodesMissingAP(s, '', []), ['/properties/a']);
});
