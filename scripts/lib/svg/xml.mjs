// Minimal XML reader/writer for SVG files: elements, attributes and text. Comments, processing instructions and the
// DOCTYPE are skipped but recorded; an internal DTD subset is flagged and never expanded (no entity expansion, no
// external entities). Not a general XML parser: no namespace resolution, no validation. Pure and dependency-free.

export class XMLError extends Error {
  constructor(msg, line) {
    super(line ? `line ${line}: ${msg}` : msg);
    this.line = line;
  }
}

const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function decodeEntities(s, onUnknown) {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[A-Za-z_][\w.-]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    if (e in ENT) return ENT[e];
    onUnknown?.(e);
    return m;
  });
}

function lineIndex(text) {
  const starts = [0];
  for (let k = 0; k < text.length; k++) if (text.charCodeAt(k) === 10) starts.push(k + 1);
  return (pos) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

const NAME = /[A-Za-z_:][\w:.-]*/y;
const isWs = (c) => c === ' ' || c === '\n' || c === '\t' || c === '\r';

/**
 * Parse SVG/XML text. Returns {root, doctype, entities, pis, comments, issues}; throws XMLError (with a line) when the
 * text is not well-formed. Element: {type:'el', name, attrs (null-prototype object), children, line}; text:
 * {type:'text', value, line, cdata?}.
 */
export function parseXML(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lineAt = lineIndex(text);
  const meta = { doctype: null, entities: false, pis: [], comments: 0, issues: [] };
  const top = { type: 'root', children: [] };
  const stack = [top];
  const n = text.length;
  const unknown = (pos) => (e) => meta.issues.push({ line: lineAt(pos), detail: `undefined entity &${e}; (only the five XML entities and numeric references are allowed)` });
  const addText = (value, pos, cdata = false) => {
    const node = { type: 'text', value: cdata ? value : decodeEntities(value, unknown(pos)), line: lineAt(pos) };
    if (cdata) node.cdata = true;
    stack[stack.length - 1].children.push(node);
  };
  let i = 0;
  while (i < n) {
    const lt = text.indexOf('<', i);
    const end = lt === -1 ? n : lt;
    if (end > i) addText(text.slice(i, end), i);
    if (lt === -1) break;
    i = lt;
    if (text.startsWith('<!--', i)) {
      const e = text.indexOf('-->', i + 4);
      if (e === -1) throw new XMLError('unterminated comment', lineAt(i));
      meta.comments++;
      i = e + 3;
    } else if (text.startsWith('<![CDATA[', i)) {
      const e = text.indexOf(']]>', i + 9);
      if (e === -1) throw new XMLError('unterminated CDATA section', lineAt(i));
      if (stack.length === 1) throw new XMLError('CDATA outside the root element', lineAt(i));
      addText(text.slice(i + 9, e), i, true);
      i = e + 3;
    } else if (text.startsWith('<!', i)) {
      let j = i + 2, depth = 0, q = null;
      for (; j < n; j++) {
        const c = text[j];
        if (q) {
          if (c === q) q = null;
        } else if (c === '"' || c === "'") q = c;
        else if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
      }
      if (j >= n) throw new XMLError('unterminated markup declaration', lineAt(i));
      const body = text.slice(i, j + 1);
      if (!/^<!DOCTYPE\s/i.test(body) || stack.length > 1) throw new XMLError('unexpected markup declaration', lineAt(i));
      meta.doctype = { text: body.slice(0, 200), line: lineAt(i) };
      if (/<!ENTITY/i.test(body)) meta.entities = true;
      i = j + 1;
    } else if (text.startsWith('<?', i)) {
      const e = text.indexOf('?>', i + 2);
      if (e === -1) throw new XMLError('unterminated processing instruction', lineAt(i));
      const body = text.slice(i + 2, e);
      meta.pis.push({ target: body.match(/^[^\s?]+/)?.[0] ?? '', body: body.slice(0, 300), line: lineAt(i) });
      i = e + 2;
    } else if (text[i + 1] === '/') {
      NAME.lastIndex = i + 2;
      const m = NAME.exec(text);
      let j = i + 2 + (m ? m[0].length : 0);
      while (j < n && isWs(text[j])) j++;
      if (!m || text[j] !== '>') throw new XMLError('malformed closing tag', lineAt(i));
      const cur = stack[stack.length - 1];
      if (stack.length === 1 || cur.name !== m[0]) throw new XMLError(`closing </${m[0]}> does not match <${cur.name ?? '(none)'}>`, lineAt(i));
      stack.pop();
      i = j + 1;
    } else {
      NAME.lastIndex = i + 1;
      const m = NAME.exec(text);
      if (!m) throw new XMLError('"<" that does not start a tag (escape it as &lt;)', lineAt(i));
      const el = { type: 'el', name: m[0], attrs: Object.create(null), children: [], line: lineAt(i) };
      let j = i + 1 + m[0].length;
      let selfClose = false;
      for (;;) {
        const before = j;
        while (j < n && isWs(text[j])) j++;
        if (j >= n) throw new XMLError(`unterminated <${el.name}> tag`, el.line);
        if (text[j] === '>') {
          j++;
          break;
        }
        if (text[j] === '/' && text[j + 1] === '>') {
          j += 2;
          selfClose = true;
          break;
        }
        if (j === before) throw new XMLError(`attributes of <${el.name}> must be separated by whitespace`, lineAt(j));
        NAME.lastIndex = j;
        const am = NAME.exec(text);
        if (!am) throw new XMLError(`bad attribute in <${el.name}>`, lineAt(j));
        j += am[0].length;
        while (j < n && isWs(text[j])) j++;
        if (text[j] !== '=') throw new XMLError(`attribute ${am[0]} on <${el.name}> has no value`, lineAt(j));
        j++;
        while (j < n && isWs(text[j])) j++;
        const q = text[j];
        if (q !== '"' && q !== "'") throw new XMLError(`attribute ${am[0]} on <${el.name}> is not quoted`, lineAt(j));
        const e = text.indexOf(q, j + 1);
        if (e === -1) throw new XMLError(`unterminated value of ${am[0]}`, lineAt(j));
        const raw = text.slice(j + 1, e);
        if (raw.includes('<')) throw new XMLError(`"<" inside the value of ${am[0]}`, lineAt(j));
        if (am[0] in el.attrs) throw new XMLError(`duplicate attribute ${am[0]} on <${el.name}>`, lineAt(j));
        el.attrs[am[0]] = decodeEntities(raw, unknown(j)).replace(/[\t\n\r]/g, ' ');
        j = e + 1;
      }
      if (stack.length === 1 && top.children.some((c) => c.type === 'el')) throw new XMLError('more than one root element', el.line);
      stack[stack.length - 1].children.push(el);
      if (!selfClose) stack.push(el);
      i = j;
    }
  }
  if (stack.length > 1) throw new XMLError(`<${stack[stack.length - 1].name}> is never closed`, stack[stack.length - 1].line);
  const root = top.children.find((c) => c.type === 'el');
  if (!root) throw new XMLError('no root element');
  const stray = top.children.find((c) => c.type === 'text' && c.value.trim());
  if (stray) throw new XMLError('text outside the root element', stray.line);
  return { root, ...meta };
}

export const localName = (name) => name.slice(name.indexOf(':') + 1);
export const tagOf = (el) => localName(el.name).toLowerCase();
export const childElements = (el) => el.children.filter((c) => c.type === 'el');
export const textOf = (el) => el.children.map((c) => (c.type === 'text' ? c.value : c.type === 'el' ? textOf(c) : '')).join('');

/** Depth-first walk over every element: fn(el, parent, depth). Returning false skips the element's subtree. */
export function walkElements(el, fn, parent = null, depth = 0) {
  if (fn(el, parent, depth) === false) return;
  for (const c of el.children) if (c.type === 'el') walkElements(c, fn, el, depth + 1);
}

export function cloneNode(node) {
  if (node.type !== 'el') return { ...node };
  const attrs = Object.assign(Object.create(null), node.attrs);
  return { ...node, attrs, children: node.children.map(cloneNode) };
}

const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Serialize an element tree. Elements holding text are written inline; whitespace-only text between elements is dropped. */
export function serialize(el, { indent = '  ', level = 0 } = {}) {
  const pad = indent ? indent.repeat(level) : '';
  const attrs = Object.entries(el.attrs).map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('');
  if (!el.children.length) return `${pad}<${el.name}${attrs}/>`;
  const hasText = el.children.some((c) => c.type === 'text' && c.value.trim());
  if (hasText) {
    const inner = el.children.map((c) => (c.type === 'text' ? escText(c.value) : serialize(c, { indent: '', level: 0 }))).join('');
    return `${pad}<${el.name}${attrs}>${inner}</${el.name}>`;
  }
  const kids = el.children.filter((c) => c.type === 'el');
  if (!kids.length) return `${pad}<${el.name}${attrs}/>`;
  const nl = indent ? '\n' : '';
  return `${pad}<${el.name}${attrs}>${nl}${kids.map((c) => serialize(c, { indent, level: level + 1 })).join(nl)}${nl}${pad}</${el.name}>`;
}
