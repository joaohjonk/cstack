# Karpathy research-engineering patterns → cstack `/experiment` + `/creative-autoresearch`

Scope: master prompt §1.4B (meta-pattern) and §12A (creative autoresearch). Sources studied:

| Repo | Path | State | Notes |
|---|---|---|---|
| `karpathy/autoresearch` | `/home/claude/research-src/karpathy_autoresearch` | 36 commits, last ≈ Mar 2026 (`228791f`). Small, stable, not stale for our purpose. | 3 files that matter: `program.md` (114 lines), `prepare.py` (frozen), `train.py` (mutable). |
| `karpathy/nanochat` | `/home/claude/research-src/karpathy_nanochat` | 313 commits, last 2026-07-03 (`92d63d4`). Active. | Leaderboard (`dev/LEADERBOARD.md`), negative-results log (`dev/LOG.md`), contribution rules (`README.md:199-203`). |

Everything below is architecture seen in files or git history. The tweets linked from the READMEs (`autoresearch/README.md:7`, `nanochat/dev/LEADERBOARD.md:198`) were not fetched; claims that come only from those tweets are left out.

---

## 1. How autoresearch actually works (mechanism, not prose)

```
human edits program.md  ──►  agent reads README + prepare.py + train.py   (program.md:11-14)
                              │
  setup: new branch autoresearch/<tag>, results.tsv header only            (program.md:9-10, 16)
  first run = unmodified baseline, measured on THIS machine                (program.md:39; commit f16ece4)
                              │
  LOOP FOREVER                                                             (program.md:94-104)
    edit train.py  → git commit → run (stdout → run.log, never into context) (program.md:97-99)
    grep two metrics from the log                                           (program.md:100)
    empty grep = crash → tail -n 50 run.log, fix if trivial, else log crash (program.md:101, 110)
    append row to results.tsv (untracked)                                   (program.md:102; .gitignore "results.tsv")
    better → keep commit ("advance the branch"); equal/worse → git reset    (program.md:103-104)
    >10 min wall clock → kill, count as failure                             (program.md:108)
```

- **Frozen:** `prepare.py`. It holds `TIME_BUDGET = 300` (`prepare.py:31`), `MAX_SEQ_LEN`, `EVAL_TOKENS` (`prepare.py:30-32`), a pinned validation shard (`prepare.py:43`, "pinned validation shard"), the tokenizer, and `evaluate_bpb` (`prepare.py:344-365`). The rule is spelled out at `program.md:28-31`.
- **Mutable:** only `train.py` (`program.md:26`, `README.md:63`). Inside it the knobs are plain module-level constants (`train.py:433-451`). There is no config framework.
- **Metric:** `val_bpb`, which does not depend on vocab size, "so architectural changes are fairly compared" (`README.md:17`, `prepare.py:345-350`).
- **Fast-fail guard:** if the loss is NaN or above 100, print FAIL and exit (`train.py:569-572`). A later commit (`0be1e4f`, "fix NaN loss not caught by fast-fail check") fixed a gap in it, so even guards need regression fixes.
- **Ledger:** 5 TSV columns: `commit val_bpb memory_gb status description`, where status is keep, discard or crash (`program.md:66-88`). It is tab-separated because "commas break in descriptions" (`program.md:66`). Crashes get a sentinel 0.0 value (`program.md:75-76`).
- **Analysis:** `analysis.ipynb` reads `results.tsv` and reports the keep rate, the running-minimum frontier, discards drawn as faint dots, and the delta of each kept change against the previous keep.
- **Process repairs visible in git:** `bdf0c0d`/`bd75534` made the agent read the stack trace ("Fix agent crash blindspot"). `6fdefa7` made it read the README. `f16ece4` removed a hard-coded baseline number so the baseline is always re-measured. `068d93d` keeps the ledger out of git. Each one patches the *program*, not an output. That is principle 7 in practice.
- **Multi-agent hints:** `.gitignore` lists `worktrees/`, `queue/` and `results/`, plus `CLAUDE.md`/`AGENTS.md` "generated per-session by launchers". A `spawn.sh` multi-agent launcher was deleted (`ae81d55`). The README says multi-agent orgs are the obvious next step (`README.md:7`) but ships only one agent.

## 2. How nanochat uses the same loop at human scale

- **One complexity dial:** `--depth`. Every other hyperparameter is derived from it (`README.md:6`, `README.md:108`). A change must hold "for all settings of depth" (`README.md:108`, `LEADERBOARD.md:51`).
- **Leaderboard as the incumbent table:** time, val_bpb, CORE, description, date, commit and contributors (`README.md:14-22`). Rows 5 and 6 came from autoresearch rounds on d12 and transferred to d24 (`LEADERBOARD.md:198`, `:202`; commit `6ed7d1d`: "developed by Claude running autonomously over ~2 days").
- **Noise is handled explicitly:**
  - Run 4 was repeated 7 times and its CORE spread was 0.01646 (`LEADERBOARD.md:178-190`). Runs 5 and 6 report the mean of 5 runs (`:196`, `:202`).
  - The smoother val_bpb is reported next to the noisy headline metric (`LEADERBOARD.md:49`, `:192`).
  - A safety margin on the guardrail metric was kept instead of squeezing to the threshold (`:196`).
  - The data-order "luck" problem is documented, not hidden (`:190`).
- **Comparability is invalidated explicitly:** "val_bpb is as of this run *NOT* comparable" after a data change (`LEADERBOARD.md:192`).
- **Negative results are first-class:**
  - `dev/LOG.md` records DyT (`:7-15`), MoE (`:134-179`, with "What was easy / hard / Verdict"), FineWeb ("fifth failed attempt", `:187`), batch-size ramp ("not sufficient to justify the code complexity… Not merged", `:269`).
  - A parameter-golf sweep came with cached notes, `knowledge/parameter_golf.md` (`:21`).
  - Commit `dc54a1a` is literally "tried and failed at DyT".
- **Complexity is a cost and deletion is a win:** "no giant configuration objects, model factories, or if-then-else monsters" (`README.md:201`). Commits `da32e1d` (−~1000 LOC UI), `f10bd75` (−540 LOC report), `02baa15` ("i need to delete a lot of code") and `a445144` (fewer deps against supply-chain risk) make the same point.
- **Merge has a taste gate:** "qualitative and aesthetic considerations… if it is gnarly or it significantly bloats the code" (`LEADERBOARD.md:51`). An LLM-disclosure policy covers PRs (`README.md:203`).
- **Correctness check after a complex keep:** after round 2 added smear/backout, Karpathy "verified with a unit test that the Engine inference is correct" (`LEADERBOARD.md:202`).

---

## 3. The 9 process principles (§1.4B) with file evidence

| # | Principle | Evidence | Mechanism to copy |
|---|---|---|---|
| 1 | **Strong, tiny baseline first** | "deliberately kept small and only really has three files that matter" (`autoresearch/README.md:11`). The first run is always the unmodified baseline (`program.md:39`). nanochat calls itself a "strong baseline" codebase (`nanochat/README.md:201`). | No run starts until the baseline has been measured on the actual harness and machine (`f16ece4`). |
| 2 | **Small mutable surface** | Only `train.py` is editable. `prepare.py` and the eval are read-only, and no new dependencies are allowed (`program.md:25-31`). "keeps the scope manageable and diffs reviewable" (`README.md:63`). | Declare a mutable allow-list per run. Everything else is read-only and enforced by diff checks. |
| 3 | **Fixed experiment budget** | `TIME_BUDGET = 300` lives in the frozen file (`prepare.py:31`). The training clock excludes warmup and compile (`train.py:578`, `:602-603`). There is a hard kill at 10 min (`program.md:108`). README:64 says this makes results comparable but platform-specific. | The budget is part of the frozen harness, not something the agent can tune. There are two limits: a soft per-experiment budget and a hard kill. |
| 4 | **One primary metric + guardrails** | "get the lowest val_bpb" (`program.md:33`). VRAM is a soft guardrail (`program.md:35`). nanochat uses CORE as the target and val_bpb as a smoother guardrail with a safety gap (`LEADERBOARD.md:49`, `:196`). | One scalar decides keep or discard. Guardrails are veto-only and logged alongside it. |
| 5 | **Keep / discard loop** | Advance the branch if better, `git reset` if equal or worse (`program.md:103-104`). Equal counts as discard, which biases toward the incumbent. | Strict improvement over the incumbent, else revert. Ties go to the incumbent unless the change is simpler (principle 8). |
| 6 | **Append-only experiment log** | `results.tsv` with keep/discard/crash rows. Crashes are logged too, and the file stays untracked (`program.md:64-88`, `:102`). nanochat `dev/LOG.md` records negative results with rationale. | Log every attempt, including crashes and discards. The ledger lives outside the mutable surface so a revert can't erase it. |
| 7 | **Program the research org** | "you are programming the `program.md` Markdown files… This file is edited and iterated on by the human" (`README.md:7`, `:15`). `program.md` is "a super lightweight skill" (`README.md:50`). Git shows `program.md` repairs (`bd75534`, `6fdefa7`, `f16ece4`). | The human edits the skill or program. The agent edits the artifact recipe. Repeated failure modes become program edits, not output patches. |
| 8 | **Cognitive complexity is a cost** | The simplicity criterion: "A 0.001 val_bpb improvement that adds 20 lines of hacky code? Probably not worth it… from deleting code? Definitely keep" (`program.md:37`). One dial, `--depth` (`nanochat/README.md:108`). Many deletion commits. | Complexity delta is a recorded column that can flip a marginal keep into a discard. Simplification at equal score is a keep. |
| 9 | **Make the baseline forkable** | "minimal, readable, hackable, maximally-forkable" (`nanochat/README.md:201`). The notable-forks section and advice to forks (`autoresearch/README.md:71-88`). The single file `runs/speedrun.sh` "always reflects the reference way" (`nanochat/README.md:12`, `LEADERBOARD.md:9`). | A run spec plus a fixture folder fully reproduce an experiment. One canonical reference recipe for each task type. |

Patterns we also saw beyond the nine:
- **Generalisation test before promotion.** Tune at d12, then confirm at d24 (`LEADERBOARD.md:198`).
- **Repeat to beat noise.** Seven runs and five runs (`LEADERBOARD.md:178`, `:196`).
- **Keep context lean.** "do NOT use tee or let output flood your context" (`program.md:99`). Grep only the metric lines (`:100`).
- **Prior-work cache.** `knowledge/parameter_golf.md` (`LOG.md:21`).
- **Autonomy contract.** "NEVER STOP… The loop runs until the human interrupts you" (`program.md:112`). cstack must **not** copy this as written; see §6.

---

## 4. Translation into cstack

Two skills share one engine:

- **`/experiment`** is interactive and small, roughly 1–10 candidates. It answers one question ("does recipe change X beat the incumbent on fixture F?"), and a human may judge.
- **`/creative-autoresearch`** is unattended and overnight. It is the same loop run for N experiments under hard budget and stop conditions, with results ready for morning review. It never promotes to the brand's canonical recipe on its own (§3.10, human taste is sovereign).

### 4.1 Mapping table (ML → creative)

| autoresearch | cstack equivalent |
|---|---|
| `prepare.py` (frozen) | `fixture/` (brief, product lock, refs with roles, shot DNA, brand state snapshot hash) + `evaluator/` (rubric, judge prompt and model pinned, deterministic checks) + `budget` |
| `train.py` (mutable) | One **recipe** file (`recipes/<task>.recipe.yaml`: prompt-recipe modules, slot values, model, params, ref selection, crop). The run declares which keys are mutable. |
| `program.md` | `skills/creative-autoresearch/SKILL.md` + per-run `program.md` notes (human-editable search guidance, "ideas to try", banned moves) |
| `val_bpb` | One primary metric chosen per run: pairwise win rate vs incumbent, product-fidelity score, brand-adherence score, or human pref. There is never one universal metric. |
| VRAM soft limit | Guardrails: product fidelity ≥ threshold, typography OCR exact match, logo/colour delta-E, safety/compliance, cost/asset ceiling, latency ceiling |
| 5-minute wall clock | Spend budget per experiment ($) + max assets per experiment + wall clock per experiment, all frozen in the run spec |
| git commit / reset | Recipe versions are content-hashed. Keep = incumbent pointer advances. Discard = pointer unchanged. Outputs are always kept in the asset store with lineage. |
| `results.tsv` | `experiments/results.tsv` (append-only, §12A columns) + `experiments/<run_id>/` artefacts |
| `analysis.ipynb` | `/experiment report`: frontier chart, keep rate, cost per keep, contact sheet of incumbent vs every candidate |
| d12 → d24 transfer | Promote only after the change also wins on **regression fixtures** (other products, shots, aspect ratios) |

### 4.2 Run spec (YAML)

```yaml
# experiments/<run_id>/run.yaml  — frozen once the run starts (hash stored in ledger)
run_id: 2026-10-03-acme-hero-lighting-a
kind: creative-autoresearch          # or: experiment
fixture:
  id: acme/hero-packshot-v3           # folder: brief.md, product_lock.yaml, refs/, shot_dna.yaml
  hash: sha256:…                      # computed; run aborts if fixture changes mid-run
regression_fixtures:                  # must not regress; checked on finalists only (cheap-first)
  - acme/hero-packshot-v2-9x16
  - acme/lifestyle-kitchen-v1
  - other-brand/control-packshot     # catches overfitting to one brand
baseline_version: recipes/packshot.recipe.yaml@sha256:…   # incumbent at start
mutable_surface:                      # allow-list; anything else changing = harness error
  - recipe.modules.lighting
  - recipe.modules.camera
frozen:                               # explicit, for readability
  - model                             # changing model is a different run
  - refs
  - crop
  - evaluator
primary_metric:
  name: pairwise_win_rate_vs_incumbent
  judge: {model: <pinned judge id>, rubric: evaluator/packshot_rubric.md@sha256:…, position_swap: true}
  n_pairs: 6                          # seeds x judge orders
  keep_threshold: 0.67                # must win ≥ 4/6 (ties → incumbent)
guardrails:                           # veto-only, never traded against primary
  product_fidelity: {check: evaluator/product_fidelity.py, min: 0.90}
  label_text_exact: {check: ocr_exact, required: true}
  brand_palette_deltaE: {max: 6}
  safety: {check: provider_moderation + policy_list}
  cost_per_asset_usd: {max: 0.25}
seed_policy: {seeds_per_candidate: 3, fixed_seed_set: [11, 23, 47]}  # same seeds for incumbent + candidate
time_budget: {per_experiment_min: 10, hard_kill_min: 20, run_total_h: 8}
spend_budget: {per_experiment_usd: 1.50, run_total_usd: 40.00, judge_spend_included: true}
max_experiments: 40
stop_conditions:
  - budget_exhausted                 # spend or time
  - max_experiments_reached
  - plateau: {window: 8, min_gain: 0.02}          # no keep with ≥ min_gain in last 8
  - evaluator_uncertainty_exceeds_gain             # see 4.6
  - consecutive_crashes: 3
  - guardrail_violation_rate: {window: 10, max: 0.5}   # recipe space is broken
human_gate: required_for_promotion    # autoresearch can only produce a "proposed incumbent"
program_notes: experiments/<run_id>/program.md      # human-editable ideas / banned moves
```

### 4.3 Loop

```
SETUP
  freeze fixture + evaluator + budget → hash → write run.yaml
  provider preflight: model reachable, price snapshot fresh, idempotency keys enabled
  BASELINE: render incumbent on fixture with fixed seed set (re-measured, never copied — cf. f16ece4)
  evaluate incumbent: guardrails + absolute scores (for the report, not for keep/discard)
  append ledger row decision=baseline

LOOP until any stop_condition:
  1. read ledger tail + program.md (NOT full outputs — context discipline, cf. program.md:99)
  2. propose ONE change to ONE key in mutable_surface, with a written hypothesis
     - classify: method change vs randomness exploration (seed-only rows are tagged explore, never kept as method)
     - reject if it touches a frozen key (harness error, logged)
     - reject if identical recipe hash already in ledger (dedupe; prior work is capital)
  3. budget guard: estimated_cost(candidate, n_seeds) + judge_cost ≤ remaining → else stop
  4. render: cheap tier first (low-res / draft mode) on fixture, fixed seeds
  5. cheap gates (T0/T1): deterministic checks, OCR, palette, product-mask IoU → fail = discard, log reason
  6. pairwise judge vs incumbent (same seeds, position-swapped) → win rate + judge disagreement
  7. decide:
       guardrail fail                  → discard
       win_rate ≥ keep_threshold AND gain > uncertainty → candidate_keep
       tie AND simpler recipe (fewer tokens/modules)    → candidate_keep (simplicity win, program.md:37)
       else                            → discard
  8. candidate_keep → run regression fixtures (cheap tier) → any regression → discard (log "regressed: <fixture>")
  9. keep → incumbent pointer advances (proposed_incumbent; canonical recipe untouched)
 10. append ledger row (always), write artefacts, update frontier
 11. crash (provider error, moderation, timeout) → retry once with same idempotency key; else log crash, move on

FINALISE
  render proposed_incumbent at final quality on fixture + regressions (premium spend only here — §11 ladder)
  produce morning report: frontier, keep rate, $ per keep, contact sheet, top discards, program.md suggestions
  human: approve / reject / pick → only then recipe promoted + preference data recorded (§21)
```

### 4.4 Ledger: `experiments/results.tsv`

TSV, append-only, one row per attempt (including baseline, crashes, harness rejections). The §12A columns come first, in order. The extra columns after them are what the Karpathy repos showed we need.

| column | source | notes |
|---|---|---|
| `run_id` | §12A | |
| `timestamp` | §12A | ISO-8601 UTC |
| `hypothesis` | §12A | one sentence: "warmer key light increases perceived premium without hurting label legibility" |
| `changed_variable` | §12A | dotted key from `mutable_surface`, or `seed` for explore rows, or `none` for baseline |
| `baseline` | §12A | incumbent recipe hash at time of attempt |
| `candidate` | §12A | candidate recipe hash |
| `provider` | §12A | |
| `model` | §12A | exact model id + snapshot (e.g. `gpt-image-2.5-sunburst-2026-09-08`) |
| `seed/index` | §12A | seed list or variant-pool index |
| `cost` | §12A | USD, actual if provider reports it (e.g. fal `X-Fal-Billable-Units`), else estimate + flag |
| `latency` | §12A | ms, wall clock submit→result |
| `primary_score` | §12A | e.g. pairwise win rate 0.83 (5/6) |
| `guardrails` | §12A | compact `name=pass/fail(value)` list |
| `human_pref` | §12A | empty overnight; filled at morning review |
| `decision` | §12A | `baseline` / `keep` / `discard` / `crash` / `rejected_harness` / `explore` |
| `notes` | §12A | short free text (no tabs) |
| `uncertainty` | added | judge disagreement or bootstrap CI half-width (needed for stop rule) |
| `complexity_delta` | added | recipe token/module delta (principle 8) |
| `regression_result` | added | `n/a` / `pass` / `regressed:<fixture>` |
| `output_ids` | added | asset ids → lineage (§3.6) |
| `run_spec_hash` | added | proves fixture/evaluator were frozen |

Ledger rules (all copied from autoresearch):
- Tabs only.
- Crashes are rows with sentinel scores.
- The ledger lives outside the mutable surface so it can never be reverted.
- Never rewrite rows. Corrections go in as new rows with `decision=correction`.

### 4.5 Pairwise-vs-incumbent judging

Why pairwise: absolute aesthetic scores drift and saturate. autoresearch can use an absolute scalar only because `val_bpb` is deterministic given the model. Creative scoring isn't, so §12A asks for pairwise "whenever aesthetic scoring is unstable".

Protocol:
1. Pair each candidate output with the incumbent output for the **same seed** and the same fixture.
2. Ask the judge both orders (A/B and B/A). If the two verdicts disagree, the pair counts as a tie. This controls position bias.
3. Use a rubric-anchored judge prompt that names the separate judgments (§3.8): beautiful, on-brand, product-correct and effective are scored separately. Only the run's primary dimension decides keep. The others are logged.
4. The judge model must differ from the generator's family where possible (§24A eval integrity). Pin the judge model id and rubric hash in the run spec.
5. Win rate = wins / (pairs). Ties go to the incumbent. Keep requires win rate ≥ threshold **and** gain > uncertainty.
6. Human calibration: the morning report shows a blind sample of judge decisions for human A/B. Where human and judge disagree, the case is stored as an evaluator-quality fixture. A separate run can then target the evaluator itself (§12A allows this only explicitly).

### 4.6 Stop conditions (precise)

| condition | rule |
|---|---|
| Budget | `spent + next_estimate > run_total_usd`, or wall clock > `run_total_h` |
| Max experiments | count of non-harness rows ≥ `max_experiments` |
| Plateau | no keep with gain ≥ `min_gain` in the last `window` attempts (analogous to the flattening frontier in `analysis.ipynb`) |
| Uncertainty > gain | median judge-disagreement CI half-width across the last `window` > the best recent gain, so the evaluator can no longer tell signal from noise (the nanochat CORE-noise lesson, `LEADERBOARD.md:190`) |
| Crash streak | 3 consecutive crashes (autoresearch: "give up" after a few attempts, `program.md:101`) |
| Guardrail collapse | more than 50% of the last 10 candidates fail guardrails, so the mutable surface is poorly chosen; stop and report |
| Human interrupt | always honoured; partial ledger is valid |

If no candidate beats the incumbent, the incumbent stands (§12A). That counts as a successful run with a negative result, and it goes in a `LOG.md`-style entry.

### 4.7 Regression fixtures

- Each recipe family has 3–6 frozen regression fixtures: different products, aspect ratios, one "hard" case (reflective or transparent material, small label text), and one **other-brand control** so the method does not overfit one brand.
- They run only on candidate keeps, at cheap tier, so they stay cheaper than the thing they protect (§3.17).
- They mirror nanochat's d12→d24 transfer requirement (`LEADERBOARD.md:198`) and the "must work for all depths" rule (`README.md:108`).
- Fixture folders are versioned. Changing one creates a new fixture id, and old ledger rows remain comparable only to their own id (cf. "NOT comparable", `LEADERBOARD.md:192`).

### 4.8 Budget guard

- **Pre-flight:** estimate the run cost as (baseline + max_experiments × seeds × est_cost) + judge cost + regression cost, using `pricing_snapshot` from `models.seed.json`. Refuse to start if it exceeds `run_total_usd`, or if the price snapshot is older than N days (re-verify first).
- **Per experiment:** reserve the estimated cost before submitting and reconcile with the actual cost after. On fal, read `X-Fal-Billable-Units`. On Higgsfield, use `higgsfield generate cost …` before submitting. On BFL and Runway, use the documented per-unit credits.
- **Idempotency:** every provider call carries a key derived from `hash(run_id, candidate_hash, seed, fixture_hash)`. Retries reuse it, and webhook handlers dedupe on the provider request id (fal `request_id`, Higgsfield `request_id`, Ideogram `generation_id`, OpenAI `webhook-id`). This stops retries from double-spending (§11).
- **Tiering:** autoresearch experiments run at draft or low tier: FLUX 3 Video "draft" mode, low `quality` on GPT Image, 1K Nano Banana, Veo 3.1 Lite. Only the finalised proposed incumbent gets a premium render (§11 ladder).
- **Kill:** an over-budget call is cancelled where the provider supports it (fal `PUT …/cancel`), and the row is logged as `crash: budget_kill`.
- **Low priority:** overnight runs use the `X-Fal-Queue-Priority: low` header on fal and batch APIs where they exist (OpenAI image Batch at 50% of output price, Gemini Batch at 50%). See `model-landscape.md`.

---

## 5. Context discipline for the agent loop (copied from autoresearch)

- Never stream provider logs or base64 images into the agent context. Write them to files and read back scalar results only (`program.md:99-100`).
- The agent sees the ledger tail and contact-sheet thumbnails. It doesn't see full-resolution outputs unless it is debugging.
- On failure, read only a short error tail (`program.md:101`).

## 6. What does NOT translate from ML to creative work

| ML assumption in autoresearch | Why it breaks for creative work | cstack adjustment |
|---|---|---|
| A deterministic, cheap, objective metric (`val_bpb`) | Taste is contested and judges are noisy and biased. "Beautiful", "on brand" and "effective" are different (§3.8). | Pairwise with position swap, separate dimensions, human calibration, an explicit uncertainty column. |
| More compute → monotone better, and the budget is just a clock | Generative APIs are stochastic per seed. One lucky seed is not a method improvement. | Fixed seed sets shared by incumbent and candidate. Seed-only rows are tagged `explore`. Promote only after repeated evidence (§12A). |
| Ledger + `git reset` discards the artefact | Discarded creative outputs are still valuable (anti-library, preference data, surprises). | Never delete outputs. Discard only means the incumbent pointer doesn't move. |
| "NEVER STOP… indefinitely" (`program.md:112`) | Real money per call and moderation strikes (Runway warns that "too many moderated requests will lead to account suspension"). | Hard spend, time and experiment caps plus stop rules. Autonomy covers search only; the human approves promotion. |
| Agent may change "everything" in `train.py` (`program.md:26`) | Changing prompt, model, refs, crop and evaluator together makes the cause unattributable. §12A forbids it. | One key per experiment from an explicit allow-list. A model swap is a separate run, which `/model-router` micro-benchmarks own. |
| Metric is non-gameable because the eval code is frozen | An LLM judge can be gamed by the generator, e.g. text in the image that flatters the judge, or a prompt that steers toward the judge's taste. | Deterministic guardrails (OCR, palette, product-mask IoU), a different judge family, and periodic human audit of judge decisions. |
| Results are platform-specific but stable (`README.md:64`) | Provider models change silently behind the same id, and prices change (BFL raised prices in May 2026 per third-party tracker, unverified). | Pin snapshot ids where offered (OpenAI `…-2026-09-08`). Store `model` + snapshot + price snapshot date per row. Re-measure the baseline at every run start. |
| A single scalar suffices | Brand work has hard constraints (exact label text, logo geometry, legal copy) that are pass/fail, not tradeable. | Guardrails are vetoes, never weighted into the primary metric. |
| Simplicity = fewer lines of code | For prompts, shorter is not always better (§12 "less text + stronger references"). | Complexity is measured as recipe modules, slot count and tokens, and refs count too. It's a tie-breaker, not a target. |
| Transfer test d12→d24 is cheap | Regression fixtures cost real money per render. | Run them only on candidate keeps, at cheap tier. |

## 7. cstack implications

| Mechanism seen | Borrow | Don't borrow |
|---|---|---|
| Frozen harness file vs single mutable file (`program.md:25-31`) | Run spec `frozen` + `mutable_surface` allow-list, enforced by hash and diff. | Letting the agent edit "everything" in the mutable file. Limit it to one key per experiment. |
| Fixed budget inside the frozen file (`prepare.py:31`) | Spend, time and asset budgets in `run.yaml`, hashed. Hard kill. | Wall clock as the only budget. Money is the binding constraint. |
| keep/discard/crash TSV, untracked (`program.md:64-88`) | `experiments/results.tsv` with the §12A columns + `uncertainty`, `complexity_delta`, `regression_result`, `output_ids`, `run_spec_hash`. | Deleting discarded artefacts. |
| Baseline is always re-measured (`f16ece4`) | The baseline row is rendered fresh at every run start, using the same seeds. | Copying the baseline from a previous run or doc. |
| Simplicity criterion (`program.md:37`) | Simplicity wins on ties, and the complexity delta is logged. | Treating "fewer tokens" as always better for prompts. |
| `program.md` as the human-programmed org (`README.md:7`) | A per-run `program.md` + skill edits when the same bad move repeats (§12A "research the research loop"). | — |
| Repeat runs to measure noise (`LEADERBOARD.md:178-190`) | Fixed seed sets, pairwise with position swap, uncertainty-aware stop. | Single-sample decisions. |
| Negative-results log (`dev/LOG.md`) | `experiments/LOG.md` with hypothesis, what was tried, verdict, and why it isn't merged. Read it before proposing a run (prior work is capital, §3.13). | — |
| Transfer test before promotion (`LEADERBOARD.md:198`) | Regression fixtures + an other-brand control. | — |
| Taste gate on merge (`LEADERBOARD.md:51`) | Human approval is required to promote a recipe. | Autonomous promotion. |
| "NEVER STOP" (`program.md:112`) | Don't ask "should I continue?" *within* budget, so the run stays unattended. | Unbounded runs. |
| Context hygiene (`program.md:99-100`) | Outputs go to files. The agent reads scalars and thumbnails. | — |

### Unreachable sources
- Karpathy's tweets referenced at `autoresearch/README.md:7` and `nanochat/dev/LEADERBOARD.md:198` (x.com) were not fetched. No claims here depend on them.
- `nanochat` GitHub Discussions #481 and #420 were not fetched.
