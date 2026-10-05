// Research-tool and MCP detection (registry/research-tools.json). Capability, never a hard dependency:
// skills plan around what exists and fall back honestly. The CLI cannot see the agent's MCP tool list,
// so the agent passes the server names it can see (--mcp "Figma,mobbin" or CSTACK_MCP_SERVERS).
// Env vars are checked for presence only; values are never read into output.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, exists, readJSON, readData } from './core.mjs';

export function loadTools() {
  return readJSON(path.join(ROOT, 'registry', 'research-tools.json')).tools;
}

// 'mcp__cosmos_so__*' -> 'cosmos_so'; compare normalized (lowercase, -/_ removed)
const norm = (s) => String(s).toLowerCase().replace(/[-_\s.]/g, '');
const serverOf = (pattern) => pattern.replace(/^mcp__/, '').replace(/__\*$/, '');

export function onPath(bin) {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// MCP config files the user may have; we only look for a tool's hostname or server key, never print contents.
function mcpConfigText(ws) {
  const files = [path.join(ws, '.mcp.json'), path.join(os.homedir(), '.claude.json'), path.join(os.homedir(), '.cursor', 'mcp.json'), path.join(os.homedir(), '.codex', 'config.toml'), path.join(os.homedir(), '.gemini', 'settings.json')];
  return files.filter(exists).map((f) => {
    try {
      return fs.readFileSync(f, 'utf8');
    } catch {
      return '';
    }
  }).join('\n').toLowerCase();
}

// Hosts prefix connector servers ('claude_ai_Cosmos', 'plugin_design_figma'); the bare name is what identifies the tool.
const HOST_PREFIX = /^(claudeai|claude|plugin[a-z0-9]*?)(?=[a-z])/;
const bare = (s) => norm(s).replace(/^mcp/, '').replace(HOST_PREFIX, '');

// The owner's own call on a tool whose terms bar agents, in <ws>/cstack.config.yaml:
//   research_tools: { cosmos: { agent_use: { allowed: true, accepted_by: <owner>, date: YYYY-MM-DD, note: ... } } }
// It counts only with a name and a date, and only for that workspace; the registry default stays for everyone else.
export function ownerOverrides(ws) {
  const f = ['cstack.config.yaml', 'cstack.config.yml', 'cstack.config.json'].map((n) => path.join(ws, n)).find(exists);
  let cfg = null;
  try {
    cfg = f ? readData(f) : null;
  } catch {}
  const out = {};
  for (const [id, v] of Object.entries(cfg?.research_tools ?? {})) {
    const u = v?.agent_use;
    if (u?.allowed === true && u.accepted_by && u.date) out[id] = u;
  }
  return out;
}

export function detectTools(ws, { mcpServers = [], env = process.env } = {}) {
  const owner = ownerOverrides(ws);
  const servers = new Set(mcpServers.flatMap((s) => [norm(s), bare(s)]));
  const cfg = mcpConfigText(ws);
  return loadTools().map((t) => {
    const d = t.detect ?? {};
    const signals = [];
    const exclude = (d.mcp_exclude_packages ?? []).some((p) => cfg.includes(p.toLowerCase()));
    for (const p of d.mcp_tool_patterns ?? []) {
      const s = serverOf(p);
      if (s.includes('*')) {
        const re = new RegExp('^' + norm(s).replace(/\*/g, '.*') + '$');
        if ([...servers].some((x) => re.test(x))) signals.push(`mcp server matches ${p}`);
      } else if (servers.has(norm(s))) signals.push(`mcp server "${s}" visible to the agent`);
    }
    // a connector named after the tool itself ('Cosmos', 'claude_ai_Cosmos') counts, unless it is the unrelated package
    if (!signals.length && [norm(t.id), norm(t.name)].some((n) => servers.has(n))) signals.push(`mcp server named "${t.name}" visible to the agent`);
    for (const a of t.access ?? []) {
      const host = String(a.endpoint_or_package ?? '').match(/https?:\/\/([^/{}]+)/)?.[1];
      if (a.mode === 'mcp' && host && !host.includes('{') && cfg.includes(host.toLowerCase())) signals.push(`mcp config references ${host}`);
    }
    for (const e of d.env ?? []) if (env[e]) signals.push(`env ${e} is set`);
    for (const c of d.cli ?? []) if (onPath(c)) signals.push(`cli ${c} on PATH`);
    for (const f of d.files ?? []) if (!f.includes('*') && exists(path.join(ws, f))) signals.push(`file ${f}`);
    signals.splice(0, signals.length, ...new Set(signals.map((x) => x.replace(/"([^"]*)"/, (m, n) => `"${n.replace(/_/g, '-')}"`))));
    const machine = (t.access ?? []).some((a) => ['mcp', 'api', 'cli'].includes(a.mode));
    const available = signals.length > 0 && !exclude;
    // detected is not the same as allowed (field test F30): a tool whose terms bar agent access stays unused when connected
    const barred = t.agent_use?.allowed === false;
    const override = barred ? owner[t.id] : null;
    return {
      id: t.id,
      name: t.name,
      layer: t.layer,
      available,
      usable: available && (!barred || !!override),
      ...(barred && !override ? { agent_use: `not allowed: ${t.agent_use.reason}` } : {}),
      ...(override ? { agent_use: `allowed by the owner (${override.accepted_by}, ${override.date}), terms risk acknowledged for this workspace: ${t.agent_use.reason}` } : {}),
      signals: exclude ? [...signals, 'excluded: unrelated package with the same name'] : signals,
      agent_access: machine ? 'mcp/api' : 'none (browser or owner export only)',
      fallback: t.fallback,
      skills: t.cstack_skills ?? [],
    };
  });
}
