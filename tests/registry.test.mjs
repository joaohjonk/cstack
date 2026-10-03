// registry/providers.json stays consistent with providers/index.mjs (ids, env var names, interfaces, stub status).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkProviderRegistry, loadProviderRegistry, availability, REGISTRY_PATH } from '../providers/index.mjs';
import { tmpDir } from './tmp.mjs';

test('providers registry: parses and matches the registered adapters', () => {
  assert.deepEqual(checkProviderRegistry(), []);
});

test('providers registry: env holds names only, never values', () => {
  const text = fs.readFileSync(REGISTRY_PATH, 'utf8');
  assert.doesNotMatch(text, /(sk-[A-Za-z0-9]{20,}|fal_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})/);
  for (const e of loadProviderRegistry()) for (const v of e.env) assert.match(v, /^[A-Z][A-Z0-9_]*$/);
});

test('providers registry: drift is reported', () => {
  const reg = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  reg.providers = reg.providers.filter((e) => e.id !== 'fal');
  reg.providers.find((e) => e.id === 'replicate').status = 'live';
  const dir = tmpDir('cstack-reg-');
  fs.mkdirSync(path.join(dir, 'registry'));
  const f = path.join(dir, 'registry', 'providers.json');
  fs.writeFileSync(f, JSON.stringify(reg));
  const p = checkProviderRegistry(f).join('\n');
  assert.match(p, /adapter "fal" missing/);
  assert.match(p, /replicate.*stub/);
  fs.writeFileSync(f, '{ nope');
  assert.match(checkProviderRegistry(f)[0], /does not parse/);
});

test('cstack providers merges registry metadata and lists local tools', () => {
  const rows = availability({});
  const fal = rows.find((r) => r.id === 'fal');
  assert.equal(fal.available, false);
  assert.deepEqual(fal.missing_env, ['FAL_KEY']);
  assert.equal(fal.status, 'live');
  assert.equal(rows.find((r) => r.id === 'region-paste')?.kind, 'local');
  assert.equal(availability({ FAL_KEY: 'x' }).find((r) => r.id === 'fal').available, true);
});
