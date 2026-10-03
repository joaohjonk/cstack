// Rights gates: names stay out of prompts, captures stay out of generation, robots.txt is honoured.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { canonNames, styleLeaks } from '../scripts/lib/prompt-names.mjs';
import { compile } from '../scripts/lib/prompt.mjs';
import { rightsCheck } from '../providers/runner.mjs';
import { robotsAllows, checkRobots } from '../scripts/lib/browser/robots.mjs';

test('canon people and studios become prompt-name guards', () => {
  const names = canonNames();
  for (const n of ['John Pawson', 'Massimo Vignelli', 'Bureau Borsche', 'Mirko Borsche', 'Dieter Rams']) assert.ok(names.includes(n), n);
  assert.ok(!names.some((n) => /^[a-z]/.test(n)), 'no lowercase role words');
});

test('styleLeaks flags names and style phrases, passes plain descriptions', () => {
  const names = ['John Pawson'];
  assert.equal(styleLeaks('stoneware plate, ochre glaze, low morning light', names).length, 0);
  assert.equal(styleLeaks('a room by john pawson', names).length, 1);
  assert.equal(styleLeaks('poster in the style of a 1960s airline', names).length, 1);
  assert.equal(styleLeaks('a Vignelli-style map', names).length, 1);
  assert.equal(styleLeaks('a Pawsonian room', names).length, 0, 'partial words do not match');
});

test('compile fails a recipe that puts a name in the prompt', () => {
  const recipe = { template: 'a bowl, {look}', slots: { look: { variants: ['matte glaze'] } } };
  assert.equal(compile(recipe, { variant_index: { look: 0 }, names: ['John Pawson'] }).ok, true);
  const bad = compile(recipe, { values: { look: 'like John Pawson would' }, names: ['John Pawson'] });
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join(' '), /names "John Pawson"/);
});

test('runner refuses named prompts and captured inputs before any spend', () => {
  const ws = path.resolve('/tmp/ws');
  assert.throws(() => rightsCheck(ws, { inputs: { prompt: 'in the manner of Dieter Rams' } }), /rights check failed/);
  assert.throws(() => rightsCheck(ws, { inputs: { prompt: 'a cup', images: ['work/browse/run1/media/001-a.jpg'] } }, []), /third-party captures/);
  assert.doesNotThrow(() => rightsCheck(ws, { inputs: { prompt: 'a cup', images: ['work/browse/run1/media/001-a.jpg'] }, capture_rights: 'licence on file, lineage L-12' }, []));
  assert.doesNotThrow(() => rightsCheck(ws, { inputs: { prompt: 'a cup', images: ['assets/product/cup.png'] } }, []));
});

test('robots.txt: groups, longest match, wildcards', () => {
  const txt = 'User-agent: *\nDisallow: /private\nAllow: /private/press\nDisallow: /*.pdf$\n\nUser-agent: OtherBot\nDisallow: /';
  assert.equal(robotsAllows(txt, '/').allowed, true);
  assert.equal(robotsAllows(txt, '/private/a').allowed, false);
  assert.equal(robotsAllows(txt, '/private/press/kit').allowed, true);
  assert.equal(robotsAllows(txt, '/files/a.pdf').allowed, false);
  assert.equal(robotsAllows(txt, '/files/a.pdf?x=1').allowed, true);
  assert.equal(robotsAllows('User-agent: cstack\nDisallow: /\n\nUser-agent: *\nDisallow:', '/a').allowed, false);
});

test('checkRobots allows on 404 or network failure, blocks on a disallow', async () => {
  const fake = (status, body) => async () => ({ ok: status === 200, status, text: async () => body });
  assert.equal((await checkRobots('https://a.example/x', { fetchImpl: fake(404, '') })).allowed, true);
  assert.equal((await checkRobots('https://a.example/x', { fetchImpl: fake(200, 'User-agent: *\nDisallow: /x') })).allowed, false);
  assert.equal((await checkRobots('https://a.example/x', { fetchImpl: async () => { throw new TypeError('offline'); } })).allowed, true);
});
