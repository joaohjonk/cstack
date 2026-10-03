// Documented adapter stubs. Each names the env var it needs and the interface it will implement.
// A stub never pretends: calling it throws with what is missing, and skills fall back or ask.
// To implement one, copy fal.mjs's shape (submit/status/result/download) and register it in index.mjs.
const stub = (id, interfaces, env, note) => ({
  interfaces,
  env,
  stub: true,
  note,
  available: () => false,
  async submit() {
    throw new Error(`${id} adapter is a documented stub (${note}). Implement providers/${id}.mjs or route to another provider.`);
  },
  async status() {
    return { state: 'failed', error: `${id} stub` };
  },
  async result() {
    throw new Error(`${id} stub`);
  },
  async download() {
    throw new Error(`${id} stub`);
  },
});

export const stubs = {
  higgsfield: stub('higgsfield', ['media'], ['HF_API_KEY', 'HF_API_SECRET'], 'Higgsfield exposes generation via its own CLI/skills; route by mode (image, video, product photoshoot, brandkit). See docs/integrations.md'),
  'openai-image': stub('openai-image', ['media'], ['OPENAI_API_KEY'], 'OpenAI image generation/edit; many teams reach it through fal instead'),
  google: stub('google', ['media'], ['GEMINI_API_KEY'], 'Gemini image / Veo video via Google AI APIs'),
  replicate: stub('replicate', ['media'], ['REPLICATE_API_TOKEN'], 'generic model host'),
  // local verifier = deterministic gates + a separate judge; implemented by skills + scripts, not HTTP
  'local-verifier': {
    interfaces: ['verifier'],
    env: [],
    available: () => true,
    async verify({ candidate }) {
      return { verdict_id: null, kind: 'brand_adherence', provider: 'local', judge: { type: 'deterministic', version: '0.1' }, candidate, score: null, partial: false, fixes: [], recommendations: [], note: 'run /brand-verify: deterministic value gates + independent judge; score stays null unless a rubric defines one' };
    },
  },
};
