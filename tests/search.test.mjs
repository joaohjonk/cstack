// Lexical skill routing: whole-word, stemmed, idf-weighted, with a bonus for whole trigger phrases.
// These requests are the routing contract for the catalog; a skill edit that breaks one should say why.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listSkills, buildIndex, search } from '../scripts/lib/skills.mjs';

const index = buildIndex(listSkills());
const top = (q, k = 1) => search(index, q, k).map((r) => r.slug);

const CASES = [
  ['is this on brand', 'brand-verify'],
  ['product photoshoot', 'product-fidelity'],
  ['rotate the product on the homepage', 'three-d'],
  ['view in AR on the product page', 'three-d'],
  ['logo on a tote bag', 'mockup'],
  ['show the label on a can', 'mockup'],
  ['we need a new logo', 'symbol-design'],
  ['clean up this svg icon set', 'vector-master'],
  ['make an ad for reels', 'video-direction'],
  ['cut downs for tiktok', 'video-assembly'],
  ['pair fonts for the brand', 'type-director'],
  ['how should we make this, no flow for this yet', 'flow-research'],
];

for (const [q, want] of CASES) test(`search routes "${q}" to ${want}`, () => assert.equal(top(q)[0], want, JSON.stringify(search(index, q, 3))));

test('search: short words do not match inside longer ones', () => {
  // "ad" used to match "brand" by substring
  const r = search(index, 'ad', 30).map((x) => x.slug);
  assert.ok(!r.includes('brand-import'));
});

test('search: no terms, no results', () => assert.deepEqual(search(index, 'the and of'), []));
