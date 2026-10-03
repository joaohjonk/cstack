// svg legibility: text size at a display width, and text contrast against the ground painted under it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { legibilitySVG } from '../scripts/lib/svg/legibility.mjs';
import { tmpDir } from './tmp.mjs';

const svg = (body, vb = '0 0 1200 600') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${body}</svg>`;
const ids = (r, id) => r.findings.filter((f) => f.id === id);
// a run of five outlined "glyphs": five closed contours side by side, 30 units tall
const run = (x, y, fill, h = 30) => `<path fill="${fill}" d="${[0, 1, 2, 3, 4].map((i) => `M${x + i * 20} ${y}h14v${h}h-14z`).join('')}"/>`;

test('live text: size scales with the display width', () => {
  const s = svg('<rect width="1200" height="600" fill="#ffffff"/><text x="10" y="100" font-size="24" fill="#111111">Small label</text><text x="10" y="300" font-size="60" fill="#111111">Headline</text>');
  const phone = legibilitySVG(s, { widths: [324] }); // scale 0.27: 24 -> 6.5 px, 60 -> 16.2 px
  assert.deepEqual(ids(phone, 'svg.text-size').map((f) => [f.level, f.line]), [['fail', 1]]);
  assert.match(ids(phone, 'svg.text-size')[0].detail, /"Small label" renders at 6\.5 px at 324 px wide/);
  assert.ok(legibilitySVG(s, { widths: [830] }).ok, '24 units at 830 px is 16.6 px');
});

test('font-size inherits from a group and scales with transforms', () => {
  const s = svg('<rect width="1200" height="600" fill="#fff"/><g font-size="20" transform="scale(2)"><text x="5" y="50" fill="#000">inherited</text></g>');
  const r = legibilitySVG(s, { widths: [600] }); // 20 * 2 * 0.5 = 20 px
  assert.equal(ids(r, 'svg.text-size').length, 0);
  assert.equal(ids(legibilitySVG(s, { widths: [300] }), 'svg.text-size').length, 1); // 10 px
});

test('contrast is measured against the ground under the text, opacity included', () => {
  const s = svg('<rect width="1200" height="600" fill="#F6F4EF"/><rect y="300" width="1200" height="300" fill="#002FA7"/>' + '<text x="10" y="100" font-size="20" fill="#8C8A85">grey on cream</text><text x="10" y="150" font-size="80" fill="#8C8A85">large grey passes 3:1</text>' + '<text x="10" y="200" font-size="80" fill="#151515">ink on cream</text>' + '<text x="10" y="450" font-size="80" fill="#ffffff">white on blue</text>' + '<text x="10" y="550" font-size="80" fill="#ffffff" fill-opacity="0.3">faint on blue</text>');
  const c = ids(legibilitySVG(s, { widths: [1200] }), 'svg.text-contrast');
  assert.deepEqual(c.map((f) => f.detail.split('"')[1]), ['grey on cream', 'faint on blue']);
  assert.match(c[0].detail, /#8c8a85 on #f6f4ef is 3\.14:1, needs 4\.5:1/i);
});

test('outlined type: estimated from ink height; fails only when clearly too small', () => {
  const s = svg('<rect width="1200" height="600" fill="#ffffff"/>' + run(10, 10, '#111111', 30) + run(10, 100, '#111111', 12) + '<rect x="600" y="10" width="40" height="40" fill="#111111"/>');
  const r = legibilitySVG(s, { widths: [324] }); // 30 units of ink ~ 42.9 em -> 11.6 px; 12 units -> 4.6 px
  const sizes = ids(r, 'svg.text-size');
  assert.equal(sizes.length, 1, 'the 30-unit run passes and a lone square is not text');
  assert.equal(sizes[0].level, 'fail');
  assert.match(sizes[0].detail, /outlined type at 10,100" renders at ~4\.6 px/);
  const near = legibilitySVG(svg('<rect width="1200" height="600" fill="#fff"/>' + run(10, 10, '#111', 24)), { widths: [324] });
  assert.equal(ids(near, 'svg.text-size')[0].level, 'warn', '~9.3 px is an estimate near the line: warn');
});

test('a figure with no ground of its own is checked on each page colour', () => {
  const s = svg('<text x="10" y="100" font-size="80" fill="#151515">dark ink, no background</text><rect y="300" width="1200" height="300" fill="#ffffff"/><text x="10" y="450" font-size="80" fill="#151515">on its own white</text>');
  const c = ids(legibilitySVG(s, { widths: [1200], pages: ['#ffffff', '#0d1117'] }), 'svg.text-contrast');
  assert.equal(c.length, 1, 'the opaque white band answers the same on every page');
  assert.match(c[0].detail, /dark ink, no background.*\(page #0d1117\)/);
});

test('a wordmark that bleeds off the canvas is judged on the ground it shows on', () => {
  const s = svg('<rect width="1200" height="600" fill="#002FA7"/>' + `<path fill="#ffffff" d="${[0, 1, 2, 3].map((i) => `M${i * 300} 400h250v400h-250z`).join('')}"/>`);
  assert.ok(legibilitySVG(s, { widths: [324] }).ok);
});

test('cli: svg legibility exits 1 on FAIL and validates its flags', () => {
  const dir = tmpDir('cstack-leg-');
  const f = path.join(dir, 'fig.svg');
  fs.writeFileSync(f, svg('<rect width="1200" height="600" fill="#F6F4EF"/><text x="10" y="100" font-size="20" fill="#8C8A85">tiny grey</text>'));
  const cli = (...a) => spawnSync(process.execPath, ['bin/cstack.mjs', 'svg', 'legibility', ...a], { encoding: 'utf8' });
  const r = cli(f, '--width', '324');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FAIL svg\.text-size/);
  assert.match(r.stdout, /FAIL svg\.text-contrast/);
  assert.equal(JSON.parse(cli(f, '--json').stdout).ok, false);
  assert.notEqual(cli(f, '--width', 'wide').status, 0);
  assert.notEqual(cli(f, '--page', 'white').status, 0);
});
