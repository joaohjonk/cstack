# Evals

Evals answer one question: does this still behave the way we said it would? cstack runs the cheapest evidence first and spends money only where a change can break something.

## Tiers

| Tier | What runs | Cost | When |
|---|---|---|---|
| **T0** static | `cstack validate` (schemas compile, skill contract, `skill.meta.json`, index freshness, governed data files, workflow skill references, flows pass `flows check`, fixture format, every named `cstack` command exists, no home paths, no credential-looking strings), `cstack budget --check` | free | always |
| **T1** unit / fixture | `node --test tests/*.test.mjs` (core libs, providers via the mock, browser) | free | code, schemas or tests changed |
| **T2** behavior | fixtures in `evals/fixtures/` run on a cheap model and graded | low | a touched skill or a declared dependency changed |
| **T3** live | provider smoke: dry run first, then one bounded live call if credentials exist | paid, bounded | a provider adapter changed |
| **T4** release | end-to-end workflow on a fixture brand plus multimodal gates | manual | before a release |

```bash
npm run check          # T0 + T1: validate, budget --check, node --test
cstack health          # per-skill validity, budget, fixture count, cost class, staleness, known failures
```

`cstack evals run` runs T2 fixtures ([below](#running-fixtures)). A person can still follow a fixture by hand and record the result with `cstack eval --file`.

## Running fixtures

```bash
cstack evals run make-it-cooler --dry-run                     # build the case and write the prompt; calls nothing
cstack evals run --all --ws ~/brands/evals --cost-per-call 0 \
  --agent "claude -p --output-format stream-json --verbose" \
  --judge "claude -p" --out runs/2026-10-05 --record          # live: 3 runs per fixture, graded, recorded
cstack evals run --all --recorded runs/2026-10-05             # regrade a saved run; calls nothing
cstack evals run --since main --agent "codex exec" --ws ...   # the fixtures `evals plan` selects
```

For each run of each fixture the runner:

1. Builds the case in `<out>/<id>.run<N>.ws/`: the fixture's `workspace` (or an `examples/...` folder its setup names), else a fresh starter workspace for a fictional brand, then its `setup_files` and `setup_props` ([below](#where-a-case-starts)). A missing ffmpeg for a video prop fails the build with `MISSING`. A `cstack` on that workspace's PATH runs this checkout and logs every call the agent makes.
2. Sends the agent the setup and the skills in play, never `expected`, on stdin, in that workspace. The agent is any command that reads a prompt on stdin and writes its reply on stdout (`claude -p`, `codex exec`, ...): cstack holds no model SDK and no key. A Claude Code `stream-json` trace is flattened into a transcript with a `$ command` line per command run.
3. Grades, deterministic first. `regex` reads the transcript. `tool_used` reads the calls the agent actually made (the PATH log, and the trace when there is one); with neither, it falls back to the transcript text and says so. `command` runs in the case's workspace after the agent. `llm` sends the case, `must` / `must_not`, the rubric and the numbered transcript to the `--judge` command, a separate process that never saw the agent's context, and reads back `{"verdict", "must", "must_not", "reason"}`; a PASS that marks an item failed counts as FAIL, and a reply with no verdict leaves the run pending.
4. Writes `prompt.txt`, `transcript.txt`, `calls.log`, `judge-prompt.txt` and `judge.txt` next to the workspace, and `summary.json` for the whole run.

A run is `pass` when every grader passes, `fail` when any fails, `pending` when a grader could not decide (no judge, no verdict). The command exits 1 on any failed fixture or failed call; `--strict` also fails on pending.

| Flag | Does |
|---|---|
| `<id...>`, `--all`, `--since <ref>`, `--tier T0\|T2` | which fixtures; `--all` leaves out T3, which runs only when named |
| `--dry-run` / `--agent "<cmd>"` / `--recorded <dir>` | the mode; T0 fixtures run their commands without an agent |
| `--judge "<cmd>"` | grades `llm` graders; without it they stay pending for a person |
| `--runs N` | overrides the fixture's `runs` |
| `--out <dir>` | where runs go (default: a new folder in the system temp dir) |
| `--ws <dir>` | the workspace whose ledger books each agent and judge call and whose `state/evals.jsonl` takes records |
| `--cost-per-call <USD>` | the owner's estimate per call; `0` for an agent on a flat subscription. Without it calls are unpriced and follow the usual unpriced rules (`--confirm-unpriced`) |
| `--record` | appends one `eval` record per graded run (gates from the graders, `decision` from the result) |
| `--timeout <s>` | per agent or judge call (default 900) |

Every agent and judge call goes through `guardedCall` on the `--ws` ledger, so the budget envelope, `confirm_over` and the unpriced rules apply as they do to media calls. A refusal stops the whole suite. Agents are told never to pass `--confirm`; the case workspaces have a zero budget, or `confirm_over: 0` where the setup describes a budget, so a media call inside a case is refused without the owner's confirmation anyway.

Saved runs in [tests/fixtures/evals-recorded/](../tests/fixtures/evals-recorded/README.md) are regraded by the tests, so a grader change that breaks a known verdict fails CI.

### Where a case starts

A setup that names a file the case never provides fails on the fixture, not the agent (field test F40). So every T2 fixture declares where it starts, and `cstack validate` fails one that declares nothing:

| Field | Gives the case |
|---|---|
| `workspace` | a repo-relative example workspace to copy (`examples/tessel-kiln`) |
| `setup_files` | `{workspace path: text}`: briefs, copy, CSV exports, state records; a YAML mapping is written as JSON |
| `setup_props` | `{workspace path: spec}`: files generated when the case is built, so no binary is committed |
| `fresh_workspace: true` | the empty starter workspace on purpose (a new brand, a request with nothing on disk); never combined with the others |

`workspace` combines with files and props. `setup_files` are written first, then `setup_props` in order, so a prop can start from an earlier one. Building a case plays the owner, so both may write `assets/official/`.

| Prop `kind` | Spec | Builds |
|---|---|---|
| `glb` | `size` [x, y, z] glTF units (metres), `origin` (base-centre, box-centre, corner), `triangles`, `textures` [{width, height, format, color}], `bytes`, `extras`, `materials`, `generator`, `node_name` | a valid GLB whose `cstack 3d inspect` numbers read as the setup says: real indices for the triangle count, embedded PNG textures (header-only WebP, JPEG, KTX2 or AVIF), padding to the stated bytes in a private PNG chunk |
| `png` | `size`, `background` (#hex or [top, bottom]), `shapes` [{rect}, {circle}, {ring}], `noise`, `tint`, `blur`; or `from` an earlier PNG | a drawn image (pure Node, no dependency) |
| `mp4` | `size`, `seconds`, `fps`, `source` (testsrc2 or #hex), `boxes`, `overlay`, `soften` (a planted drift from a time), `freeze_after`, `audio` {tone or noise, `lufs` or `volume_db`} | an H.264 clip through ffmpeg, the way tests/video.test.mjs makes lavfi clips |
| `frame` | `from` (a video), `at` | a PNG still through ffmpeg |
| `pdf` | `title`, `size`, `pages` [{text, title_size, color, draw}] | a minimal valid PDF; `draw` takes content-stream operators (a vector logo) |
| `svg`, `text` | `text` | the text, verbatim |
| `copy` | `from` (repo file or folder) | a copy: `tests/fixtures/svg/thin-mark.svg`, an `examples/` brand, a long page in `evals/fixtures/props/` |
| `flow-plan` | `flow`, `deliverable`, `key_visual`, `target` | the run plan `cstack flows plan` would write |
| `mockup` | `template`, `art`, `placement` | a `cstack mockup render` of the art |

```yaml
setup: 'A designer hands over a 28 MB GLB (4k textures, 640k triangles, no compression) ...'
setup_props:
  work/3d/hero/source/designer-hero.glb:
    kind: glb
    triangles: 640000
    textures: [{ width: 4096, height: 4096 }, { width: 4096, height: 4096 }]
    bytes: 28000000
```

A command grader that names a path the agent is meant to make (`work/3d/*/model.glb`) stays the agent's job: the prop goes elsewhere (`work/3d/hero/source/`). `tests/evalprops.test.mjs` builds every T2 case and checks each declared prop (the GLB parses with its stated numbers, the PNG has its size, the clip probes).

## Diff-aware plan

```bash
cstack evals plan                       # changes since HEAD~1, plus unstaged and untracked files
cstack evals plan --since main
cstack evals plan --files skills/taste-search/SKILL.md,providers/fal.mjs
```

```text
changed files: 2
T0: cstack validate | cstack budget --check
T1: -
T2: no-brand-vague-aesthetic
T3: provider smoke: fal (dry-run first, then one bounded live call if credentials exist)
T4: manual: run before releases (end-to-end workflow on a fixture brand + multimodal gates)
why T2: touched skills taste-search
```

Selection rules (`scripts/lib/evalplan.mjs`):

- **T0** always.
- **T1** when anything under `scripts/`, `bin/`, `schemas/`, `tests/` or `package.json` changed.
- **T2** gets every fixture whose `skills` include a touched `skills/<slug>/`, or whose `depends_on` globs match a changed file. A fixture marked `tier: T3` goes to T3 instead.
- **T3** gets a provider smoke for each changed `providers/<id>.mjs`.
- **Unknown change, full gate.** A changed file outside the known areas (skills, providers, code, workflows, templates, fixtures, docs, examples, references, experiments, state, `registry/models.json`, the generated index, `evals/static/`) selects every T2 fixture. An undeclared dependency means "run everything cheap".
- The shared preamble is listed in every fixture's `depends_on`, so editing it selects all T2 fixtures.

Pass `--json` to get the plan as data: `changed`, `tiers`, `why`, `full`.

## Fixture format

One YAML file per behavior case in `evals/fixtures/`:

```yaml
id: beautiful-but-off-brand            # by convention, the filename stem
tier: T2                               # T0 | T2 | T3 (T1 lives in tests/)
skills: [creative-review, brand-verify]
depends_on:                            # globs; a change here selects the fixture
  - skills/creative-review/SKILL.md
  - skills/cstack-shared/PREAMBLE.md
description: One sentence on the behavior under test.
cannot_isolate: What a pass does NOT prove, so nobody over-reads it.
setup: The situation and the request, in plain words.
setup_files:                           # T2: workspace, setup_files, setup_props or fresh_workspace: true
  work/review/hero.md: Agency delivery for the winter hero, shot under a softbox.
expected:
  must:     [behaviors that have to appear]
  must_not: [behaviors that fail the case]
graders:
  - type: tool_used
    pattern: cstack spend plan
  - type: llm
    rubric: PASS only if every 'must' holds and no 'must_not' occurs; cite the transcript line for each.
runs: 3                                # repeat to beat model noise
```

### Graders

| Type | Fields | Checks |
|---|---|---|
| `command` | `run`, `expect_exit` | a deterministic command and its exit code, e.g. `cstack budget --check` → `1` |
| `tool_used` | `pattern` | the transcript shows the agent ran a command (e.g. `cstack spend plan`) |
| `regex` | `pattern` | a pattern in the output |
| `llm` | `rubric` | a judge model reads the transcript against `must` / `must_not` and cites lines |

Order graders from deterministic to judged. If a `command` grader can decide the case, the `llm` grader only covers what the command cannot.

The suite has 46 fixtures: 45 at T2 and one at T0. Examples: `make-it-cooler` (diagnose before changing), `expensive-overnight-batch` (probes and a spend plan before 200 calls), `existing-brand-conflicting-assets` (surface the conflict, never average), `ai-judge-not-owner`, `model-list-stale`, `skill-grows-significantly`, `retired-rule-in-template`.

The craft fixtures added with 3D, mockups, vector, video and typography test the failure each medium is known for: `video-one-shot-temptation` and `3d-label-truth` (a researched plan that passes `cstack flows check` before anything is made), `mockup-logo-must-composite` (the real art is composited, never regenerated), `logo-generated-raster-as-master`, `mark-fails-16px`, `video-label-drift`, `ugc-fake-testimonial`, `cutdown-safe-zones`, `type-pairing-near-miss` and `type-review-beyond-font-choice`.

`cstack validate` checks the format of every fixture: the tier, grader types and their fields, patterns that compile in JavaScript (no inline `(?i)` flags), known skills, `depends_on` globs that match a file, and that a T2 fixture declares where it starts ([above](#where-a-case-starts)) with prop specs it can build.

## Judgment separation

These rules are in the shared preamble, the `creative-review` and `brand-verify` skills, and the eval schema.

1. **The author never certifies its own work.** Generation is followed by deterministic gates, then an independent reviewer (a different model, a provider verifier, or a fresh context given only the brief, brand context and artifact), then the owner when stakes are meaningful. Record the reviewer in `evaluator.kind` (`deterministic | llm_judge | vision_judge | provider_verifier | human`) and set `separate_from_author`.
2. **Gates before taste.** Hard gates (size audit, token lint, product fidelity, compliance) are pass/fail. Any hard fail means decision `fix`, and aesthetics are skipped.
3. **Judgments stay plural.** The axes are beauty, brand_fit, cultural_vitality, message_clarity, craft, product_truth, commercial_usefulness, novelty and correctness. Each is scored 0–2 or `null` with evidence and an anchor, and they are never summed. A composite exists only if a workflow declares one, and hard gates still block it.
4. **Judge against a baseline**: brief, reference, incumbent or last approved. Say which in `baseline`.
5. **An AI judge is never the owner.** A verifier score is evidence about rules and adherence, not taste certification. Owner decisions (approve, reject, gold, anti, pairwise with a reason) go to `cstack feedback` and outrank any judge. When they disagree, the disagreement is logged as a learning candidate, not argued away (fixture `ai-judge-not-owner`).
6. **Calibrate before trusting.** A taste judge is usable only after it agrees with the owner's own pairwise picks. Pairwise capture is the default so that calibration becomes possible. Blind pairs come from contact sheets ([sheets.md](sheets.md)).

## Records

Every record is schema-checked and appended to the workspace. `id` and `date` are filled in when missing.

| Command | File | Schema | Holds |
|---|---|---|---|
| `cstack eval --file r.json` | `state/evals.jsonl` | `eval` | one judgment: evaluator, baseline, gates, axes, lenses, provider verdict, failures, recommendations, `decision` (`promote | fix | reject | human_review | pending`), tradeoff, cost |
| `cstack feedback --file f.json` | `state/feedback.jsonl` | `feedback-event` | owner preference: `approve | reject | gold | anti | pairwise | comment | region_critique | edit`, pair `{a, b, winner, margin}`, region, reason codes |
| `cstack failure --file e.json` | `state/failures.jsonl` | `failure-event` | `type` from the failure taxonomy, diagnosis, repair, `repair_worked` |

```json
{ "artifact_ref": "work/out/cup-hero/cup-hero_1.png",
  "evaluator": { "kind": "vision_judge", "name": "creative-review", "separate_from_author": true },
  "baseline": "brief",
  "gates": [{ "id": "size_audit", "result": "pass" }, { "id": "product_fidelity", "result": "fail", "evidence": "handle redrawn as a loop" }],
  "axes": [{ "axis": "brand_fit", "score": 1, "evidence": "linen and window light match the photography rules" },
           { "axis": "product_truth", "score": 0, "evidence": "pulled-strap handle missing" }],
  "decision": "fix" }
```

`cstack health` counts known failures per skill from the repo's `state/failures.jsonl` (matched on `task`). Repeated failures feed [learnings.md](learnings.md).
