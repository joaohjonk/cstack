// F20: lettering and logos in generated images stop the batch. tesseract and the judge are faked on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../scripts/lib/core.mjs';
import { encodePNG } from '../scripts/lib/image/png.mjs';
import { parseTSV, judgeWords, judgeExpected, readExpected, parseJudge, judgePrompt } from '../scripts/lib/textcheck.mjs';
import { tmpDir } from './tmp.mjs';

const CLI = path.join(ROOT, 'bin', 'cstack.mjs');
const HEAD = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
const row = (text, conf) => `5\t1\t1\t1\t1\t1\t0\t0\t10\t10\t${conf}\t${text}`;

function setup() {
  const d = tmpDir('cstack-text-');
  const bin = path.join(d, 'bin');
  fs.mkdirSync(bin);
  // fake tesseract: an image whose name contains "label" reads as a word; "glyph" as garbled fragments
  fs.writeFileSync(path.join(bin, 'tesseract'), `#!/bin/sh\nprintf '%s\\n' '${HEAD}'\ncase "$1" in\n  *label*) printf '%s\\n' '${row('MERIDIAN', 91)}' ;;\n  *pack*) printf '%s\\n' '${row('MERIDIAN', 93)}' '${row('No.', 88)}' '${row('03', 90)}' '${row('$2.99', 85)}' ;;\n  *glyph*) printf '%s\\n' '${row('Tr8', 12)}' '${row('vve', 20)}' '${row('Qk', 9)}' ;;\n  *) printf '%s\\n' '${row('~', 5)}' ;;\nesac\n`);
  fs.chmodSync(path.join(bin, 'tesseract'), 0o755);
  const img = path.join(d, 'img');
  fs.mkdirSync(img);
  for (const n of ['clean.png', 'label.png', 'glyph.png', 'pack.png']) fs.writeFileSync(path.join(img, n), encodePNG({ width: 4, height: 4, data: Buffer.alloc(64, 200) }));
  return { d, bin, img };
}
const run = (args, bin, extraPath = true) => spawnSync(process.execPath, [CLI, 'image', 'text', ...args], { encoding: 'utf8', env: { ...process.env, PATH: extraPath ? `${bin}${path.delimiter}${process.env.PATH}` : '/usr/bin:/bin' } });

test('image text: OCR words decide, and garbled lettering counts as text', () => {
  const words = parseTSV([HEAD, row('Tr8', 12), row('vve', 20), row('Qk', 9), '4\t1\t1\t1\t1\t0\t0\t0\t1\t1\t-1\t'].join('\n'));
  assert.equal(words.length, 3);
  assert.equal(judgeWords(words).text, true, 'three glyph-like fragments are made-up lettering');
  assert.equal(judgeWords([{ text: 'MERIDIAN', conf: 91 }]).text, true);
  assert.equal(judgeWords([{ text: '~', conf: 5 }, { text: 'a', conf: 30 }]).text, false, 'stray marks are noise');
});

test('image text: exit 1 names each image with text; a clean folder passes', () => {
  const { bin, img } = setup();
  const r = run([img], bin);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FAIL .*label\.png.*read "MERIDIAN"/);
  assert.match(r.stdout, /FAIL .*glyph\.png.*3 glyph-like fragments/);
  assert.match(r.stdout, /PASS .*clean\.png/);
  assert.match(r.stdout, /FAIL \(3 of 4\)/);
  assert.equal(run([path.join(img, 'clean.png')], bin).status, 0);
});

test('image text: with no engine it refuses instead of passing', () => {
  const { img } = setup();
  const r = run([img], null, false);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /MISSING: no text check available here/);
});

test('image text: a judge command reads the image and returns JSON', () => {
  const { d, img } = setup();
  const judge = path.join(d, 'judge.sh');
  fs.writeFileSync(judge, `#!/bin/sh\nif grep -q "label\\.png"; then echo 'sure: {"text": true, "logo": false, "where": "word on the can", "confidence": "high"}'; else echo '{"text": false, "logo": false, "where": "", "confidence": "medium"}'; fi\n`);
  fs.chmodSync(judge, 0o755);
  const r = run([path.join(img, 'label.png'), path.join(img, 'clean.png'), '--engine', 'judge', '--judge', judge], null, false);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FAIL .*label\.png.*word on the can/);
  assert.match(r.stdout, /PASS .*clean\.png/);
  assert.equal(parseJudge('no verdict'), null);
  assert.match(judgePrompt('/x.png'), /made-up or garbled text/);
});

test('image text --expect: declared on-pack lines pass, missing, garbled or undeclared lettering fails (F76)', () => {
  const w = (text, conf = 90) => ({ text, conf });
  const lines = ['MERIDIAN', 'No. 03', '$2.99'];
  assert.deepEqual(judgeExpected([w('MERIDIAN'), w('No.'), w('03'), w('$2.99')], lines), { ok: true, missing: [], stray: [] });
  assert.equal(judgeExpected([w('MERIDLAN'), w('No'), w('03'), w('2.99')], lines).ok, true, 'one OCR slip in a long word is noise');
  assert.deepEqual(judgeExpected([w('MERIDIAN'), w('No.'), w('08'), w('$2.99')], lines).missing, ['No. 03'], 'a wrong drop number is caught');
  assert.deepEqual(judgeExpected([w('MERIDIAN'), w('No.'), w('03'), w('$2.99'), w('FRESHH')], lines).stray, ['freshh']);
  assert.deepEqual(readExpected({ expect: ['A'], files: [] }), ['A']);
  assert.deepEqual(judgeExpected([w('KÖCHI')], ['KŌCHI']).missing, ['KŌCHI'], 'a wrong diacritic is a misspelling, not OCR noise');
  assert.equal(judgeExpected([w('KŌCHI')], ['Kōchi']).ok, true, 'case is ignored');
  const { d, bin, img } = setup();
  const f = path.join(d, 'on-pack.txt');
  fs.writeFileSync(f, '# lettering on the flat wrap\nMERIDIAN\nNo. 03\n\n$2.99\n');
  const pass = run([path.join(img, 'pack.png'), '--expect-file', f], bin);
  assert.equal(pass.status, 0, pass.stdout + pass.stderr);
  assert.match(pass.stdout, /PASS .*pack\.png.*all 3 expected line\(s\) read/);
  assert.match(pass.stdout, /expecting 3 line\(s\)/);
  const miss = run([path.join(img, 'label.png'), '--expect', 'MERIDIAN', '--expect', 'No. 03'], bin);
  assert.equal(miss.status, 1);
  assert.match(miss.stdout, /missing or garbled: "No\. 03"/);
  assert.match(judgePrompt('/x.png', lines), /- No\. 03/);
  const judge = path.join(d, 'judge2.sh');
  fs.writeFileSync(judge, `#!/bin/sh\ncat >/dev/null\necho '{"text": true, "expected": [{"line": "MERIDIAN", "found": true}, {"line": "No. 03", "found": false}], "unexpected": "", "confidence": "high"}'\n`);
  fs.chmodSync(judge, 0o755);
  const j = run([path.join(img, 'pack.png'), '--engine', 'judge', '--judge', judge, '--expect', 'MERIDIAN', '--expect', 'No. 03'], null, false);
  assert.equal(j.status, 1);
  assert.match(j.stdout, /missing or garbled: "No\. 03"/);
});
