#!/usr/bin/env node
// cstack launcher: fail with a next step, not ERR_MODULE_NOT_FOUND, on a fresh clone without npm install.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(path.join(root, 'package.json'));
const missing = ['ajv', 'ajv-formats', 'yaml'].filter((m) => {
  try { require.resolve(m); return false; } catch { return true; }
});
if (missing.length) {
  console.error(`cstack: missing dependencies (${missing.join(', ')}). Run ./setup in ${root}, or: cd ${root} && npm install`);
  process.exit(1);
}
await import('./cstack-main.mjs');
