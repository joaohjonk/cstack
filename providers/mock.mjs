// Deterministic mock provider for T1 tests and dry rehearsals of workflows. Costs nothing.
// Behaviour is steered by the prompt: "FAIL_POLICY" → policy failure, "SLOW:n" → n polls before done.
import fs from 'node:fs';

// 1x1 PNG, then sized variants are irrelevant for mocks; size audits use `mock_size` param.
const PNG_1x1 = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

function pngOfSize(w, h) {
  const b = Buffer.from(PNG_1x1);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

const jobs = new Map();
let n = 0;

export const mock = {
  interfaces: ['media', 'verifier'],
  env: [],
  calls: { submit: 0 },
  async submit(req) {
    if (/FAIL_POLICY/.test(req.inputs?.prompt ?? '')) throw new Error('content policy violation (mock)');
    this.calls.submit++;
    const job_id = `mock-${++n}`;
    const slow = Number((req.inputs?.prompt ?? '').match(/SLOW:(\d+)/)?.[1] ?? 0);
    jobs.set(job_id, { polls: 0, slow, req });
    return { job_id };
  },
  async status(job) {
    const j = jobs.get(job.job_id);
    if (!j) return { state: 'failed', error: 'unknown job' };
    j.polls++;
    return { state: j.polls > j.slow ? 'done' : 'running' };
  },
  async result(job) {
    const j = jobs.get(job.job_id);
    const [w, h] = j.req.inputs?.params?.mock_size ?? [1024, 1280];
    const count = j.req.inputs?.params?.num_images ?? 1;
    return { outputs: Array.from({ length: count }, () => ({ bytes: pngOfSize(w, h), ext: 'png' })), seed: null, cost: { amount: 0, currency: 'USD' } };
  },
  async download(_url, file) {
    fs.writeFileSync(file, PNG_1x1);
  },
  estimate: () => ({ amount: 0, currency: 'USD' }),
  async verify({ artifact }) {
    return { score: null, verdict: 'n/a', recommendations: [], evidence: `mock verifier saw ${artifact}`, job_id: 'mock' };
  },
};
