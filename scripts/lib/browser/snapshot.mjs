// Derived from gstack (https://github.com/garrytan/gstack): browse/src/snapshot.ts (aria line parser, -i/-c/-d
// filters, two-pass @eN ref assignment with getByRole().nth() disambiguation).
// MIT License, Copyright (c) 2026 Garry Tan, modified for cstack. See licenses/gstack-MIT.txt.
// Changes: pure buildRefs() returning serialisable refs (refs.json) instead of live Locators; escaped quotes in
// names; exact-name locators; secret-looking textbox values redacted; no diff/annotate/cursor scan.
import { isSecretField } from './safety.mjs';

export const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox', 'menuitem', 'menuitemcheckbox',
  'menuitemradio', 'option', 'searchbox', 'slider', 'spinbutton', 'switch', 'tab', 'treeitem',
]);
const SKIP_ROLES = new Set(['text']);

/** Parse one ariaSnapshot line: `  - role "name" [props]: inline`. Metadata lines (`- /url: ...`) return null. */
export function parseLine(line) {
  const m = line.match(/^(\s*)-\s+([a-z]+)(?:\s+"((?:[^"\\]|\\.)*)")?(?:\s+(\[.*?\]))?\s*(?::\s*(.*))?$/i);
  if (!m) return null;
  let name = m[3] ?? null;
  if (name !== null) {
    try {
      name = JSON.parse(`"${name}"`);
    } catch {}
  }
  return { indent: m[1].length, role: m[2], name, props: m[4] || '', children: (m[5] ?? '').trim() };
}

/**
 * Two passes: count role+name pairs, then assign @eN refs. Returns text lines and serialisable refs
 * ({ref, role, name, nth}); nth is set only when the pair is ambiguous.
 */
export function buildRefs(ariaText, { interactive = false, compact = false, depth } = {}) {
  const nodes = String(ariaText ?? '').split('\n').map(parseLine).filter((n) => n && !SKIP_ROLES.has(n.role));
  const counts = new Map();
  for (const n of nodes) counts.set(`${n.role}:${n.name ?? ''}`, (counts.get(`${n.role}:${n.name ?? ''}`) ?? 0) + 1);
  const seen = new Map();
  const lines = [];
  const refs = [];
  for (const n of nodes) {
    const key = `${n.role}:${n.name ?? ''}`;
    const d = Math.floor(n.indent / 2);
    const isInteractive = INTERACTIVE_ROLES.has(n.role);
    if (depth !== undefined && d > depth) continue;
    const idx = seen.get(key) ?? 0;
    if (interactive && !isInteractive) {
      seen.set(key, idx + 1);
      continue;
    }
    if (compact && !isInteractive && !n.name && !n.children) continue;
    seen.set(key, idx + 1);
    const ref = `e${refs.length + 1}`;
    refs.push({ ref, role: n.role, name: n.name ?? '', nth: counts.get(key) > 1 ? idx : null });
    let children = n.children;
    if ((n.role === 'textbox' || n.role === 'searchbox') && children && isSecretField({ label: n.name })) children = '[redacted]';
    let out = `${'  '.repeat(d)}@${ref} [${n.role}]`;
    if (n.name) out += ` "${n.name}"`;
    if (n.props) out += ` ${n.props}`;
    if (children) out += `: ${children}`;
    lines.push(out);
  }
  return { lines, refs };
}

/** Rebuild a Playwright locator for a ref entry, or for `@eN` against a refs list. */
export function locatorFor(page, target, refs = []) {
  if (typeof target === 'string' && /^@e\d+$/.test(target)) {
    const entry = refs.find((r) => r.ref === target.slice(1));
    if (!entry) throw new Error(`unknown ref ${target}; take a snapshot step first`);
    target = entry;
  }
  if (typeof target === 'string') return page.locator(target);
  let loc = page.getByRole(target.role, target.name ? { name: target.name, exact: true } : {});
  if (target.nth !== null && target.nth !== undefined) loc = loc.nth(target.nth);
  return loc;
}

export async function takeSnapshot(page, opts = {}) {
  const root = opts.selector ? page.locator(opts.selector) : page.locator('body');
  if (opts.selector && !(await root.count())) throw new Error(`selector not found: ${opts.selector}`);
  const aria = await root.ariaSnapshot();
  const { lines, refs } = buildRefs(aria, opts);
  return { text: lines.length ? lines.join('\n') : '(no accessible elements found)', refs };
}
