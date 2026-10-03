// validate's markdown link check: missing targets and missing #anchors fail; GitHub-style slugs match.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkLinks, slug } from '../scripts/lib/links.mjs';

test('slug follows GitHub: punctuation dropped, spaces to hyphens', () => {
  assert.equal(slug('Known issues (v0.1)'), 'known-issues-v01');
  assert.equal(slug('2. Source precedence'), '2-source-precedence');
});

test('checkLinks: a missing file and a missing anchor fail; a real anchor, a URL and code spans pass', (t) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cstack-links-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  fs.writeFileSync(path.join(d, 'b.md'), '# Title\n\n## Known issues\n');
  const a = path.join(d, 'a.md');
  fs.writeFileSync(a, '[ok](b.md#known-issues) [url](https://x.dev/#y) `[code](nope.md)` [self](#top)\n[gone](c.md) [bad](b.md#missing)\n# Top\n');
  assert.deepEqual(checkLinks(a).map((p) => p.link), ['c.md', 'b.md#missing']);
});
