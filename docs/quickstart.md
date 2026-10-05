# Quickstart

Ten minutes, no spend. You will create a brand workspace for a fictional ceramics studio, **Tessel Kiln**, record one sourced fact, load compact brand context, look for references, rank models, plan a batch, generate with the free mock provider, and record a review.

A fuller version of this brand lives in [`examples/tessel-kiln/`](../examples/tessel-kiln).

## 1. Install (1 min)

Requires Node 20+.

```bash
git clone https://github.com/joaohjonk/cstack ~/cstack
cd ~/cstack
./setup                                   # npm install + skills into your agent hosts
# or, equivalently:
npm install && node bin/cstack.mjs setup  # links skills into ~/.agents/skills and ~/.claude/skills
alias cstack="node ~/cstack/bin/cstack.mjs"
cstack help
```

`setup` never overwrites a skill folder it did not create. Other hosts: `cstack setup --host auto` (adds Copilot CLI, Factory and Kiro when they are on your machine), `--host all`, or one of `agents | claude-code | codex | cursor | gemini-cli | opencode | copilot | factory | kiro`. Add `--target <project>` to install into a project instead of your home directory, `--copy` to copy instead of symlink, `--dry-run` to preview. See [skill-authoring.md](skill-authoring.md#host-install).

`playwright-core` is an optional dependency, used only by `cstack browse`.

To update later, run `/cstack-update` in your agent or `cstack update`: it fast-forwards the checkout (never discarding your changes), reinstalls dependencies when they changed, relinks every host you installed into and shows what is new. Skills check for updates once a session; `cstack update --auto on` updates without asking, `--checks off` stops the checks.

## 2. Create a workspace (1 min)

A workspace is the brand's own repo. cstack never holds brand data.

```bash
cstack brand init ~/brands/tessel-kiln --name "Tessel Kiln"   # brand_id defaults to tessel-kiln
cd ~/brands/tessel-kiln && git init
```

Commands default to the current folder as the workspace. Elsewhere, pass `--ws <dir>` or set `CSTACK_WORKSPACE`.

## 3. First brand check (30 s)

```bash
cstack brand check
#   · brand-system: 0 fields (); 0 open conflicts
# brand check .: PASS (0 errors, 0 warnings)
```

`brand check` validates every governed file against its schema, flags fields with no source, `conflict`/`unknown` fields that carry a value, campaign fields without `expires`, more than 50% inferred fields, a missing budget envelope, and anything that looks like a credential.

## 4. Record one fact, then load context (1 min)

Brand truth is written one sourced field at a time, through source precedence:

```bash
cat > /tmp/tone.json <<'EOF'
{ "value": "Warm, plain-spoken, workshop-first. Short sentences.",
  "sources": [{ "kind": "user_instruction", "ref": "owner interview 2026-10-03", "by": "owner" }],
  "confidence": "high", "approval": "current", "permanence": "core" }
EOF
cstack brand set voice.tone --file /tmp/tone.json
# voice.tone: set (new field)

cstack brand context --sections voice,color
```

`brand context` prints only approved values (`locked`, `current`, `testing`; add `--inferred` to include inferred ones), lists everything else under `not_facts`, lists open conflicts, and ends with a `hash`. Identical inputs give an identical, cacheable prompt prefix. See [provenance.md](provenance.md) and [cost-and-context.md](cost-and-context.md#cache-stable-brand-context).

In an agent, `/brand-import` (existing brand) or `/workflow create-brand` (new brand) fills the brand system properly.

## 5. What is usable here (30 s)

```bash
cstack providers                       # media providers: available, env var names needed, stubs
cstack tools --mcp "Figma,Refero"      # research tools; pass the MCP server names your agent can see
```

Nothing is required. Every tool has a fallback. See [integrations.md](integrations.md).

## 6. Taste search (1 min)

```bash
cstack taste search "hand-thrown stoneware, a quiet morning ritual in the workshop" --k 6
```

With `TASTE_API_KEY` set, this calls Taste Labs through the spend guard, saves the raw result under `references/_taste/` and prints the ranked list (`rank`, `name`, `url`, `reason`). Rank order is the only signal. Without a key, the command stops with `MISSING: TASTE_API_KEY not set` before any call, so nothing is written to `state/cost-ledger.jsonl`, and `/taste-search` falls back to local gold and canon plus public browsing, and says so.

## 7. Route a model (30 s)

```bash
cstack route --modality image --needs image-edit,multi-image-reference --max-cost 0.2
```

This ranks entries in `registry/models.json` and prints a fallback chain and warnings (stale entries, close scores, no unit price). Use the registry's own vocabulary: modalities are `image | video | vector | 3d | audio | analysis`, and capabilities look like `text-to-image`, `image-edit`, `multi-image-reference`, `mask-inpainting`, `text-rendering`. The registry is a dated snapshot. See [cost-and-context.md](cost-and-context.md#model-router-and-registry-staleness).

## 8. Plan the spend first (1 min)

New workspaces have a budget envelope of 0. Plan a small batch of mock probes:

```bash
cat > /tmp/items.json <<'EOF'
[ { "provider": "mock", "model": "mock-image", "operation": "generate", "est": { "amount": 0, "currency": "USD" } },
  { "provider": "mock", "model": "mock-image", "operation": "generate", "est": { "amount": 0, "currency": "USD" } } ]
EOF
cstack spend plan /tmp/items.json --stop "stop after 2 probes, or if either fails product fidelity"
```

The JSON shows `estimated_total`, `spent_today`, `needs_confirmation`, `ok` and `problems`. The command exits non-zero if the batch would break `per_run` or `per_day`, if no budget is configured, or if no `--stop` condition was given. Add one paid item, such as `{"provider":"fal",...,"est":{"amount":0.05,"currency":"USD"}}`, and the plan fails until you raise `budget:` in `cstack.config.yaml`.

## 9. Generate with the mock provider (2 min)

Compile a recipe so the prompt has a hash. The hash links each output back to the recipe that made it.

```bash
mkdir -p recipes && cat > recipes/cup-hero.prompt-recipe.yaml <<'EOF'
id: cup-hero
version: 1
task: text_to_image
template: "{subject} on {surface}, {light}. Visible throwing rings, honest glaze."
slots:
  subject: { required: true }
  surface: { variants: ["a linen cloth", "a scrubbed oak bench", "a slate shelf"] }
  light:   { variants: ["low morning window light", "overcast north light"] }
values:
  subject: "a hand-thrown stoneware cup"
EOF
cstack prompt compile recipes/cup-hero.prompt-recipe.yaml --seed 7          # prompt + short hash
cstack prompt compile recipes/cup-hero.prompt-recipe.yaml --seed 7 --json   # full "hash"
```

Write the request, putting the full hash in `recipe_hash`:

```json
{
  "provider": "mock", "model": "mock-image", "operation": "generate", "skill": "generate-media",
  "recipe_hash": "<full hash from --json>",
  "inputs": {
    "prompt": "a hand-thrown stoneware cup on a scrubbed oak bench, low morning window light. Visible throwing rings, honest glaze.",
    "params": { "num_images": 2, "mock_size": [1080, 1350] }
  },
  "out_dir": "work/out/quickstart", "out_prefix": "cup-probe",
  "expected_size": { "aspect": "4:5" },
  "estimated_cost": { "amount": 0, "currency": "USD" }
}
```

```bash
cstack generate --file request.json
# wrote work/out/quickstart/cup-probe_1.png (+ work/out/quickstart/cup-probe_1.png.gen.json)
# wrote work/out/quickstart/cup-probe_2.png (+ ...)
cstack generate --file request.json        # same request again
# identical call already done: ... (not paid again)
cstack audit work/out/quickstart/cup-probe_1.png --aspect 4:5
cstack spend summary
cstack jobs                                 # pending provider jobs (none for the mock)
```

Each output has a `.gen.json` sidecar with the provider, model, job id, idempotency key, prompt, recipe hash, input hashes, params, seed, size audit and cost.

## 10. Review and record (2 min)

The maker never certifies its own work. In your agent, run `/creative-review` (independent lenses) and `/brand-verify` (deterministic gates, then a verifier). Then record the results:

```bash
cstack lineage --file lineage.json     # creative commit: artifact_id, kind, intent_of_change, operation, output_files
cstack eval --file eval.json           # one judgment: evaluator, gates, separate axes, decision
cstack feedback --file pick.json       # the owner's pick, e.g. a pairwise A/B with a reason
cstack lineage --show cup-hero         # the artifact's history
```

`lineage.json`, the creative commit for the two probes (`version` and the output hashes are filled in for you):

```json
{ "artifact_id": "cup-hero", "kind": "image", "operation": "generate",
  "intent_of_change": "first probe: cup on oak in morning light, from recipe cup-hero v1",
  "prompt_recipe": { "id": "cup-hero", "version": 1 },
  "model": { "provider": "mock", "model_id": "mock-image" },
  "output_files": ["work/out/quickstart/cup-probe_1.png", "work/out/quickstart/cup-probe_2.png"] }
```

`eval.json`, one reviewer's judgment, kept apart from the maker and never summed into one score:

```json
{ "artifact_ref": "cup-hero", "artifact_version": "1", "baseline": "brief",
  "evaluator": { "kind": "llm_judge", "name": "creative-review (fresh context)", "separate_from_author": true },
  "gates": [ { "id": "size-audit", "result": "pass" } ],
  "axes": [ { "axis": "brand_fit", "score": 2, "evidence": "throwing rings and honest glaze visible" },
            { "axis": "craft", "score": 1, "evidence": "rim highlight blown out on probe 1" } ],
  "decision": "fix", "recommendations": ["lower the window light by a stop; keep everything else"] }
```

`pick.json`, the owner's pick:

```json
{ "by": "owner", "type": "pairwise", "artifact_ref": "cup-hero",
  "pair": { "a": "work/out/quickstart/cup-probe_1.png", "b": "work/out/quickstart/cup-probe_2.png", "winner": "b", "margin": "clear" },
  "reason": "b keeps the throwing rings visible" }
```

`id` and `date` are filled in for you. Every record is schema-checked before it is appended to `state/*.jsonl`. Owner feedback outranks any judge score. See [evals.md](evals.md).

## Next

- Learn from the run: `cstack learn add`, then `cstack learn candidates` ([learnings.md](learnings.md)).
- Run a whole job: `/workflow product-photoshoot`. `cstack workflow list` shows the others.
- Decide what to make next from ad results: `cstack creative import`, `cstack creative report`, then `/workflow growth-creative`.
- Write your own skill: [skill-authoring.md](skill-authoring.md).
