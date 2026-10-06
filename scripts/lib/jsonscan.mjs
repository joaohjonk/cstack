// lastJsonObject(text, accept): the last {...} span in a reply that parses and that accept() takes.
// Judges answer with one JSON object, often wrapped in prose; a malformed reply (a missing closing brace, as a
// live judge once returned) must come back null, never spin: lastIndexOf clamps a negative fromIndex to 0, so a
// scan that steps with `index - 1` returns index 0 forever once it gets there (F98).
export function lastJsonObject(text, accept = () => true) {
  const s = String(text ?? '');
  for (let end = s.lastIndexOf('}'); end > 0; end = s.lastIndexOf('}', end - 1)) {
    for (let start = s.lastIndexOf('{', end); start !== -1; start = start > 0 ? s.lastIndexOf('{', start - 1) : -1) {
      try {
        const v = JSON.parse(s.slice(start, end + 1));
        if (v && typeof v === 'object' && accept(v)) return v;
      } catch {
        /* not this span */
      }
    }
  }
  return null;
}
