// Eval fixtures follow the documented format so a T2 runner can execute their graders.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFixtures, evalPlan } from '../scripts/lib/evalplan.mjs';
import { listSkills } from '../scripts/lib/skills.mjs';

test('fixtures: tiers, graders, skills and patterns are valid', () => {
  const { errors } = checkFixtures({ skills: listSkills().map((s) => s.slug) });
  assert.deepEqual(errors, []);
});

test('evals plan: a flow or canon edit is a known area, not the full gate', () => {
  const p = evalPlan({ files: ['flows/3d-web-hero.flow.yaml', 'canon/paul-rand.canon-entry.yaml'] });
  assert.equal(p.full, false);
  assert.ok(p.tiers.T2.includes('3d-label-truth'));
});
