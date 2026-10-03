// cstack original work. robots.txt for `cstack browse`: a site that disallows a path is not captured there unless the
// owner says so (--ignore-robots, e.g. their own site). Groups and longest-match Allow/Disallow follow RFC 9309.
export const CSTACK_AGENT = 'cstack';

// parseRobots(text) -> [{agents:[...], rules:[{allow, path}]}]
export function parseRobots(text) {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && cur) {
      if (val) cur.rules.push({ allow: key === 'allow', path: val });
      lastWasAgent = false;
    } else lastWasAgent = false;
  }
  return groups;
}

const toRegex = (p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));

// robotsAllows(text, pathWithQuery, agent) -> {allowed, rule}
export function robotsAllows(text, target, agent = CSTACK_AGENT) {
  const groups = parseRobots(text);
  const named = groups.filter((g) => g.agents.some((a) => a !== '*' && agent.toLowerCase().includes(a)));
  const rules = (named.length ? named : groups.filter((g) => g.agents.includes('*'))).flatMap((g) => g.rules);
  let best = null;
  for (const r of rules) {
    if (!toRegex(r.path).test(target)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return { allowed: !best || best.allow, rule: best ? `${best.allow ? 'Allow' : 'Disallow'}: ${best.path}` : null };
}

// checkRobots(href) -> {allowed, rule, status}. An unreachable or missing robots.txt allows (RFC 9309: 4xx = no rules).
export async function checkRobots(href, { fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
  const u = new URL(href);
  const target = u.pathname + u.search;
  try {
    const res = await fetchImpl(`${u.origin}/robots.txt`, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
    if (!res.ok) return { allowed: true, rule: null, status: `robots.txt HTTP ${res.status}` };
    return { ...robotsAllows(await res.text(), target), status: 'robots.txt read' };
  } catch (e) {
    return { allowed: true, rule: null, status: `robots.txt unreachable (${e.name})` };
  }
}
