// Markdown link check: relative links resolve, and #anchors match a heading in the target (GitHub slugs).
import fs from 'node:fs';
import path from 'node:path';

// GitHub's heading slug: lowercase, drop punctuation except - and _, spaces to -.
export function slug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, (c) => (c === '_' ? '_' : ''))
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

export function anchors(text) {
  const seen = new Map();
  const out = new Set();
  for (const m of text.replace(/^```[\s\S]*?^```/gm, '').matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const s = slug(m[1].replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'));
    const n = seen.get(s) ?? 0;
    seen.set(s, n + 1);
    out.add(n ? `${s}-${n}` : s);
  }
  for (const m of text.matchAll(/<a\s+(?:name|id)="([^"]+)"/g)) out.add(m[1]);
  return out;
}

// Returns [{ link, problem }] for one markdown file.
export function checkLinks(file, text = fs.readFileSync(file, 'utf8')) {
  const problems = [];
  const body = text.replace(/^```[\s\S]*?^```/gm, '').replace(/`[^`\n]*`/g, '');
  for (const m of body.matchAll(/\]\(([^)\s]+)\)/g)) {
    const link = m[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(link)) continue; // http:, mailto:, etc.
    const [p, frag] = link.split('#');
    const target = p ? path.resolve(path.dirname(file), decodeURIComponent(p)) : file;
    if (!fs.existsSync(target)) {
      problems.push({ link, problem: 'target does not exist' });
      continue;
    }
    if (frag && target.endsWith('.md') && !anchors(fs.readFileSync(target, 'utf8')).has(frag.toLowerCase())) problems.push({ link, problem: `no heading for #${frag}` });
  }
  return problems;
}
