// Every prompt recipe shipped in the repo (examples, templates) compiles: missing or unused slots fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ROOT, walk, readData } from '../scripts/lib/core.mjs';
import { compile } from '../scripts/lib/prompt.mjs';

test('every *.prompt-recipe.yaml in examples/ and templates/ compiles', () => {
  const files = ['examples', 'templates'].flatMap((d) => walk(path.join(ROOT, d), (p) => p.endsWith('.prompt-recipe.yaml')));
  assert.ok(files.length > 0, 'no recipes found');
  for (const f of files) {
    const res = compile(readData(f));
    assert.ok(res.ok, `${path.relative(ROOT, f)}: ${res.errors.join('; ')}`);
  }
});
