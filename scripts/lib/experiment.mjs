// Bounded keep/discard experiments (Karpathy autoresearch pattern).
// The code enforces what prompts cannot: one mutable surface, budget ceilings, an append-only ledger,
// and an incumbent that only changes on a KEEP.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { exists, readData, writeAtomic, nowISO } from './core.mjs';
import { validateValue } from './schemas.mjs';

export const COLUMNS = ['run_id', 'timestamp', 'hypothesis', 'changed_variable', 'baseline', 'candidate', 'provider', 'model', 'seed_or_index', 'cost', 'latency', 'primary_score', 'guardrails', 'human_pref', 'decision', 'notes'];

// run ids name a folder under experiments/runs/: a plain name, never a path
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const runDir = (ws, id) => {
  if (!RUN_ID.test(String(id ?? '')) || String(id).includes('..')) throw new Error(`run_id must match ${RUN_ID.source} (got "${id}")`);
  return path.join(ws, 'experiments', 'runs', id);
};
const specPath = (ws, id) => path.join(runDir(ws, id), 'experiment-run.yaml');
const tsvPath = (ws) => path.join(ws, 'experiments', 'results.tsv');

export function experimentInit(ws, id, opts = {}) {
  if (exists(specPath(ws, id))) throw new Error(`run ${id} already exists`);
  const spec = {
    run_id: id,
    fixture: opts.fixture ?? 'fixtures/<locked-fixture>',
    baseline_version: opts.baseline ?? '<recipe-or-artifact@version>',
    mutable_surface: opts.surface ?? 'prompt.slot.lighting',
    frozen: ['fixture', 'evaluator', 'model', 'reference_set', 'crop', 'other prompt slots'],
    primary_metric: { name: 'pairwise preference vs incumbent', method: 'pairwise_vs_incumbent', higher_is_better: true },
    guardrails: [
      { name: 'product_truth', rule: 'product-fidelity gate passes' },
      { name: 'brand_fit', rule: 'no regression vs incumbent on brand_fit' },
    ],
    regression_fixtures: [],
    time_budget_minutes: Number(opts.minutes ?? 60),
    spend_budget: { amount: Number(opts.spend ?? 5), currency: opts.currency ?? 'USD' },
    max_experiments: Number(opts.max ?? 12),
    seeds_per_candidate: 2,
    stop_conditions: ['spend_budget reached', 'max_experiments reached', '4 consecutive discards (gains flattened)', 'evaluator uncertainty larger than apparent gain'],
    evaluator: 'genmedia-review (separate from author) + human pairwise for finalists',
    program: `experiments/runs/${id}/program.md`,
  };
  writeAtomic(specPath(ws, id), YAML.stringify(spec));
  writeAtomic(
    path.join(runDir(ws, id), 'program.md'),
    `# Program for ${id}\n\nHuman-editable instructions that steer proposals. If the agent keeps making the same bad move, fix THIS file, not the outputs.\n\n- Objective:\n- The one thing you may change: ${spec.mutable_surface}\n- Never change: ${spec.frozen.join(', ')}\n- Ideas to try first:\n- Ideas already tried (see results.tsv):\n`,
  );
  if (!exists(tsvPath(ws))) writeAtomic(tsvPath(ws), COLUMNS.join('\t') + '\n');
  return `scaffolded ${specPath(ws, id)} and program.md. Edit both, then log rows with: cstack experiment log ${id} --file row.json`;
}

export function readRows(ws, id) {
  if (!exists(tsvPath(ws))) return [];
  const [head, ...lines] = fs.readFileSync(tsvPath(ws), 'utf8').split('\n').filter(Boolean);
  const cols = head.split('\t');
  return lines.map((l) => Object.fromEntries(l.split('\t').map((v, i) => [cols[i], v]))).filter((r) => !id || r.run_id === id);
}

export function loadSpec(ws, id) {
  if (!exists(specPath(ws, id))) throw new Error(`no experiment run "${id}" (start one: cstack experiment init ${id})`);
  const spec = readData(specPath(ws, id));
  const v = validateValue('experiment-run', spec);
  if (!v.ok) throw new Error(`experiment-run.yaml invalid: ${v.errors}`);
  return spec;
}

export function experimentLog(ws, id, row) {
  const spec = loadSpec(ws, id);
  const rows = readRows(ws, id);
  const st = statusOf(spec, rows);
  if (st.stopped) throw new Error(`run ${id} is stopped: ${st.stop_reason}. Start a new run to continue.`);
  if (!['keep', 'discard', 'baseline'].includes(row.decision)) throw new Error('decision must be keep, discard or baseline');
  if (row.decision !== 'baseline' && row.changed_variable !== spec.mutable_surface)
    throw new Error(`changed_variable "${row.changed_variable}" is not the run's mutable surface "${spec.mutable_surface}" (one variable per run)`);
  if (row.decision === 'keep' && /fail/i.test(row.guardrails ?? '')) throw new Error('cannot KEEP a candidate that failed a guardrail');
  const full = { run_id: id, timestamp: nowISO(), ...row };
  const line = COLUMNS.map((c) => String(full[c] ?? '').replace(/[\t\n]/g, ' ')).join('\t');
  if (!exists(tsvPath(ws))) writeAtomic(tsvPath(ws), COLUMNS.join('\t') + '\n');
  fs.appendFileSync(tsvPath(ws), line + '\n');
  const after = statusOf(spec, [...rows, full]);
  return `logged ${row.decision} for ${id}. incumbent: ${after.incumbent}. spent ${after.spent}/${spec.spend_budget.amount} ${spec.spend_budget.currency}.${after.stopped ? ` STOP: ${after.stop_reason}` : ''}`;
}

export function statusOf(spec, rows) {
  const spentAmt = rows.reduce((s, r) => s + (Number(r.cost) || 0), 0);
  let incumbent = spec.baseline_version;
  let streak = 0;
  for (const r of rows) {
    if (r.decision === 'keep') {
      incumbent = r.candidate;
      streak = 0;
    } else if (r.decision === 'discard') streak++;
  }
  const experiments = rows.filter((r) => r.decision !== 'baseline').length;
  let stop_reason = null;
  if (spentAmt >= spec.spend_budget.amount) stop_reason = 'spend budget reached';
  else if (experiments >= spec.max_experiments) stop_reason = 'max experiments reached';
  else if (streak >= 4) stop_reason = '4 consecutive discards: gains flattened, keep the incumbent';
  return { incumbent, spent: Math.round(spentAmt * 10000) / 10000, experiments, discard_streak: streak, stopped: !!stop_reason, stop_reason };
}

export function experimentStatus(ws, id) {
  const spec = loadSpec(ws, id);
  const rows = readRows(ws, id);
  const st = statusOf(spec, rows);
  const text = [
    `run ${id}: mutable surface = ${spec.mutable_surface}`,
    `experiments ${st.experiments}/${spec.max_experiments}, spent ${st.spent}/${spec.spend_budget.amount} ${spec.spend_budget.currency}, discard streak ${st.discard_streak}`,
    `incumbent: ${st.incumbent}`,
    st.stopped ? `STOPPED: ${st.stop_reason}` : 'running',
  ].join('\n');
  return { ...st, text };
}
