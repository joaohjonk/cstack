// Shared temp-dir helper for tests: every dir made here is removed when the test file's process exits
// (an exit hook, not after(): files with top-level await register tests after the root hooks ran).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dirs = [];
process.on('exit', () => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

export function tmpDir(prefix = 'cstack-') {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  dirs.push(d);
  return d;
}
