// Research-tool and MCP detection (registry/research-tools.json). Capability, never a hard dependency:
// skills plan around what exists and fall back honestly. The CLI cannot see the agent's MCP tool list,
// so the agent passes the server names it can see (--mcp "Figma,mobbin" or CSTACK_MCP_SERVERS).
// Env vars are checked for presence only; values are never read into output.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, exists, readJSON } from './core.mjs';

export function loadTools() {
  return readJSON(path.join(ROOT, 'registry', 'research-tools.json')).tools;
}

// 'mcp__cosmos_so__*' -> 'cosmos_so'; compare normalized (lowercase, -/_ removed)
const norm = (s) => String(s).toLowerCase().replace(/[-_\s.]/g, '');
const serverOf = (pattern) => pattern.replace(/^mcp__/, '').replace(/__\*$/, '');

function onPath(bin) {
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

export function detectTools(ws, { mcpServers = [], env = process.env } = {}) {
  const servers = new Set(mcpServers.map(norm));
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
    for (const a of t.access ?? []) {
      const host = String(a.endpoint_or_package ?? '').match(/https?:\/\/([^/{}]+)/)?.[1];
      if (a.mode === 'mcp' && host && !host.includes('{') && cfg.includes(host.toLowerCase())) signals.push(`mcp config references ${host}`);
    }
    for (const e of d.env ?? []) if (env[e]) signals.push(`env ${e} is set`);
    for (const c of d.cli ?? []) if (onPath(c)) signals.push(`cli ${c} on PATH`);
    for (const f of d.files ?? []) if (!f.includes('*') && exists(path.join(ws, f))) signals.push(`file ${f}`);
    const machine = (t.access ?? []).some((a) => ['mcp', 'api', 'cli'].includes(a.mode));
    const available = signals.length > 0 && !exclude;
    return {
      id: t.id,
      name: t.name,
      layer: t.layer,
      available,
      signals: exclude ? [...signals, 'excluded: unrelated package with the same name'] : signals,
      agent_access: machine ? 'mcp/api' : 'none (browser or owner export only)',
      fallback: t.fallback,
      skills: t.cstack_skills ?? [],
    };
  });
}
