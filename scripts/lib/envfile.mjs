// --env-from <file>: load provider keys from a .env file without a shell ever seeing it (field test F47, and earlier
// in R0: sourcing or grepping a .env echoed a key-like line into the session log). Only the variables cstack's
// adapters declare are read; values are never printed, and a malformed line is reported by number, never by content.
import fs from 'node:fs';

/** loadEnvFile(file, names, env) -> {loaded: [name], skipped: [name already set], malformed: [line numbers]} */
export function loadEnvFile(file, names, env = process.env) {
  const want = new Set(names);
  const out = { loaded: [], skipped: [], malformed: [] };
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) return void out.malformed.push(i + 1);
    const [, name, rest] = m;
    if (!want.has(name)) return;
    let value = rest.trim();
    const q = value[0];
    if ((q === '"' || q === "'") && value.endsWith(q) && value.length >= 2) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    // a value with spaces or control characters is not a key; using it would send a broken header
    if (!value || /[\s\x00-\x1f]/.test(value)) return void out.malformed.push(i + 1);
    if (env[name]) return void out.skipped.push(name);
    env[name] = value;
    out.loaded.push(name);
  });
  return out;
}
