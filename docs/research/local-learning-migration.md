# Local-learning migration (anonymized)

cstack does not start from zero. Its first design input was a private, real brand system built by the cstack author for a client brand (a pre-launch consumer product) over six intense days in September 2026: 39 commits, about 7,000 files, a validator, a lint, hard gates, three portability tests, a red team, eight image-system iterations and roughly $70 of logged generation spend.

**That brand's material is not in this repository and never will be.** cstack is brand-agnostic (see `AGENTS.md`). This note keeps only what generalizes, stated without brand names, product facts, pictures, prompts or file paths. The full brand-specific reconstruction (about 165 rows with file-and-line evidence) lives in the client's own private repository, where it belongs.

Method: two independent passes over the client repo (system/process/verbal/digital, and image/generative media), reading every canon file, the full change log, the build reports, the red-team and portability reports, every generation log and spend log, and the git history. The client's `npm run check` was also run on a clean Linux checkout. Evidence below is described by kind ("validator", "red team", "generation log", "portability run 3"), because exact paths would identify the client.

## How to read the table

- **Scope**: `durable` (true for any brand), `model-specific`, `tool-specific`. Brand- and campaign-specific learnings stayed private and are only counted at the end.
- **Confidence**: H = repeated evidence or an explicit owner decision after a failure; M = one clear logged instance; L = single observation.
- **Should become**: principle | skill rule | provider note | eval | anti-example | fixture.
- **Landed in**: where the learning now lives in cstack.

## A. Judgment, review and taste

| # | Learning | Evidence | When | Scope | Conf | Replaced | Should become | Landed in |
|---|---|---|---|---|---|---|---|---|
| A1 | An AI judge passing a set ("system passes", 9/10) did not predict the owner's verdict ("really far from the references"). AI judges filter rules; taste stays with the human owner until calibrated against their picks. | contact-sheet review vs generation log | 27-28 Sep | durable | H | trusting the internal judge as the gate before human review | principle + calibration fixture | `skills/cstack-shared/PREAMBLE.md` (judgment), `skills/creative-review`, `evals/fixtures/ai-judge-not-owner.yaml` |
| A2 | The author never judges their own output. Judge records carry `separate_from_author: true`; with no separate judge available, the piece is `judge_pending` and cannot ship. | judge records, lint `not_shippable`, judge queue | 25-28 Sep | durable | H | self-grading | eval contract | `schemas/eval.schema.json` (`evaluator.separate_from_author`), `skills/creative-review`, `skills/brand-verify` |
| A3 | Self-grading converges on 2 (top score) across every dimension. | final eval report, uniform-score check | 26 Sep | durable | H | author scores | eval (uniform-score detector) | `skills/creative-review` decision rules |
| A4 | Rule-usability and taste are separate measurements: the model that kept product truth best (4/4) was not the one the owner preferred on taste. | 3-model hero pilot | 28 Sep | durable | H | one "best model" score | principle | `skills/model-router`, `registry/models.json` notes |
| A5 | Totals hide what failed. A deprecated weighted "brand consistency score" was replaced by layered verdicts with no aggregate. | rubric, validator fails on weights | 25-26 Sep | durable | H | weighted score | principle | `docs/evals.md`, `schemas/eval.schema.json` |
| A6 | A rubric that cannot say n/a says fail. Score only dimensions that apply to the surface. | portability run 3 finding R1 | 26 Sep | durable | H | 0 for irrelevant dims | eval rule | `schemas/eval.schema.json` (`score: null`), `skills/creative-review` |
| A7 | Record what was authored (none / line / device / idea) so the piece is scored, not the assembled template. | rubric `authored` field | 26 Sep | durable | M | scoring the assembly | eval field | `skills/creative-review` |
| A8 | Anchors drive quality: with a gold anchor work scored 70-75, without 62-68. | portability reports | 26 Sep | durable | M | rubric text only | skill rule | `skills/cstack-shared/PREAMBLE.md`, quickstarts require a gold anchor |
| A9 | Internal judges over-score; re-anchor the scale to the owner's liked set (10 = indistinguishable from gold). | self-evaluation note | 28 Sep | durable | H | uncalibrated 0-10 | eval calibration | `docs/evals.md` |
| A10 | Machine predictions of human verdicts must be marked as predictions. | verdict index `verdict_by` | 25 Sep | durable | H | unmarked predictions | schema field | `schemas/common.schema.json` (`approval: inferred`) |
| A11 | Capture preferences as pairwise records with won-because / lost-because, general principle vs project-specific factor. The client designed this but captured picks in markdown lists instead; zero pairwise records were written. | pairwise schema vs pick lists | 26-28 Sep | durable | H | markdown pick lists | default capture path | `schemas/feedback-event.schema.json`, `skills/learn-loop`, `cstack feedback` |
| A12 | A learning loop that is designed but never fed teaches nothing (performance memory and lessons files: empty). A loop counts as built only after its first real record. | creative OS files | 25-29 Sep | durable | H | n/a | principle | `docs/learnings.md`, workflow `status: template` until a run record exists |
| A13 | Never promote a principle from one record; ROAS alone is never a rule. Promotion needs repeated windows, a minimum sample and a human pairwise. | lessons promotion rule | 25 Sep | durable | H | winner-takes-rule | skill rule | `scripts/lib/learn.mjs`, `workflows/paid-social` |

## B. Rules, gates and validation

| # | Learning | Evidence | When | Scope | Conf | Replaced | Should become | Landed in |
|---|---|---|---|---|---|---|---|---|
| B1 | A gate that names a checker nobody wrote teaches agents to ignore gates. Every rule declares an implemented test or `manual`. | red team B1 | 25-26 Sep | durable | H | prose gates | validator check | `docs/skill-authoring.md` (rules that matter live in code), `cstack validate` |
| B2 | The sidecar plan is evidence, not trust: cross-check declared ids against the rendered output (10 of 12 bypass probes got through before). | final eval, bypass probes | 26 Sep | durable | H | trusting declared ids | lint primitive | `docs/architecture.md` (plan sidecar), backlog v0.2 |
| B3 | Gate the claim family, not the sentence: paraphrases inherit the claim's status. Keep lexicons as data. | claims lexicon | 25-26 Sep | durable | H | exact-string bans | skill rule | `skills/claims-proof`, `skills/copywriting` |
| B4 | Probes need exact semantics (`only: true`), and every rule ships a must-fail case: test the check with the mistake it exists for. | selftest 118/118, mutation runs | 26 Sep | durable | H | green-only tests | eval convention | `docs/evals.md`, `tests/` |
| B5 | Name the honest path for novelty (`proposal`, `new_strings`, `judge_pending`, `hold_for`) or agents smuggle new ideas into canon. | lint + sidecar | 26 Sep | durable | H | silent new copy | schema states | `schemas/common.schema.json` approval states, `skills/cstack-shared/PREAMBLE.md` |
| B6 | "Done" is not "ship-ready": 32 of 44 "done" retouches were judged redo. Separate done, judged and shippable. | judge record summary | 25 Sep | durable | H | done = generated | state machine | `schemas/artifact-lineage.schema.json` (`result`), `skills/creative-review` |
| B7 | Separate "may we say it" (legal status) from "who authorised it" from "where it may be used". | claims ledger | 25-26 Sep | durable | H | single approved flag | schema | `skills/claims-proof` contract |
| B8 | UNKNOWN is a slot, never a placeholder value; CONFLICT or UNKNOWN never ships as fact. | truth file statuses | 25 Sep | durable | H | TBD values in copy | schema + validator | `schemas/common.schema.json`, `cstack brand check` |
| B9 | Search the truth file before calling a fact unknown (an owner was asked twice for something already recorded). | change log | 27 Sep | durable | M | re-asking | skill rule | `skills/cstack-shared/PREAMBLE.md` (prior work is capital) |
| B10 | Every cited repo path must resolve, case-exact (the client's validator passes on macOS and fails on Linux on one case mismatch). | clean Linux check run | 3 Oct | durable | H | macOS-only testing | validator + Linux CI | `cstack validate`, `.github/workflows/check.yml` |
| B11 | No absolute home paths in canon (190 files carried them; nothing resolved off the author's laptop). | grep | 25-29 Sep | durable | H | n/a | validator | `cstack validate` hygiene check |
| B12 | Machine-bound tools break portability (OS-specific image utilities, hard-coded interpreter paths, bare-name existence checks). | environment probes | 25-29 Sep | durable | H | local tools | env probe | `setup` preflight |
| B13 | Generated files get hand-edited unless the generator owns every section. | "re-add after rebuild" note in a generated file | 28 Sep | durable | H | n/a | freshness gate | `cstack validate` (index freshness) |
| B14 | Decision ids must be namespaced and dated; two parallel series reused the same integers. | answers record | 28 Sep | durable | H | sequential ints | convention | `docs/provenance.md` |
| B15 | Change-log discipline lapses under deadline (5 commits without a log row). Enforce in a check, not in memory. | git log vs change log | 28-29 Sep | durable | H | n/a | pre-commit check | backlog v0.2 |
| B16 | A killed value kept in the build will be used; a killed concept can be revived by a later pick unnoticed. Keep a kill list outside the build and lint new picks against it. | killed tokens, later pick | 25-28 Sep | durable | H | commented-out values | anti library | `references/anti/`, `schemas/reference.schema.json` |
| B17 | Deprecate by scope with `superseded_by`, never by deletion; an archive that can still run is not an archive. | 24 deprecated rules, run guards | 27-28 Sep | durable | H | deleting | schema field | `schemas/common.schema.json` (`superseded_by`, `deprecated`) |
| B18 | Nothing binding may live in a folder people are told to skip, and a folder not in the load order does not exist for an agent. | portability runs | 25-26 Sep | durable | H | binding text in build notes | principle | `AGENTS.md` load order |
| B19 | When an owner's rules disagree with a later brief, log both sides with scope; do not silently pick. | conflict register (43 rows) | 26-28 Sep | durable | H | silent picks | schema | `schemas/brand-system.schema.json` `conflicts[]`, `scripts/lib/brand.mjs` `mergeField` |
| B20 | Semantic cross-refs: existence checks miss a claim that cites the wrong fact id. | claims ledger bug | 28 Sep | durable | H | existence-only xref | validator (later) | backlog v0.2 |
| B21 | Separate proven from inferred in every finding; never adopt another model's guess unverified. | reverse-engineering findings | 28 Sep | durable | H | LLM hypotheses as fact | principle | `skills/cstack-shared/PREAMBLE.md` |
| B22 | View-source auditing finds what screenshots hide (secret values in the DOM, dead links). | page audit | 28 Sep | durable | H | visual review only | skill rule | `skills/site-capture` (backlog), `skills/brand-verify` |
| B23 | A builder reporting PASS must look at what it built: render, then diff. | email build render check | 26-27 Sep | durable | H | exit code 0 | skill rule | `skills/brand-verify` |

## C. Load, context and onboarding

| # | Learning | Evidence | When | Scope | Conf | Replaced | Should become | Landed in |
|---|---|---|---|---|---|---|---|---|
| C1 | Load time is a design problem: per-task minimum-load slices cut time-to-first-output from 25 min to 6 min 16 s. | portability run 3 | 26 Sep | durable | H | read-everything | skill rule | every SKILL.md "Inputs" names the minimum load; `docs/cost-and-context.md` |
| C2 | Write the command, not the concept: blind testers stalled on prose instructions. | portability run 2 | 26 Sep | durable | H | prose | doc rule | `docs/quickstart.md`, `README.md` |
| C3 | Three separate precedence lists drifted apart; keep one machine-readable precedence with domain overrides. | load order vs escalation vs brief | 25-28 Sep | durable | H | parallel lists | code | `scripts/lib/brand.mjs` `PRECEDENCE` |
| C4 | Docs drift constantly behind data; generate summaries from data where possible. | 3 drifted READMEs | 26-29 Sep | durable | H | n/a | generator | `registry/skills-index.json` generated |
| C5 | Committing binaries per change made history exceed 2 GB; new machines had to shallow-clone. Keep heavy media out of git or in an asset store. | repo history | 28-29 Sep | durable | H | n/a | convention | `docs/provenance.md`, brand workspace `.gitignore` |
| C6 | Hand-copied handoff folders drift from the source; build handoffs by script. | handoff copies | 28 Sep | durable | H | n/a | principle | `docs/architecture.md` |
| C7 | A capability map needs defined levels ("partially" read as "done"). | coverage map | 25 Sep | durable | H | yes/no lists | schema | workflows carry `status: template|validated` |
| C8 | One owner per file during multi-agent passes; one writer per external tool at a time. | build synthesis | 24-26 Sep | durable | H | parallel writes | skill rule | `AGENTS.md` (multi-agent etiquette) |
| C9 | Spend and permission limits are stops, not detours: a refused permission goes to its owner, a credit limit stops the run. | workflow prompts, spend logs | 26-29 Sep | durable | H | routing around limits | code gate | `scripts/lib/ledger.mjs` (`budget_blocked`) |

## D. Generative media and production

| # | Learning | Evidence | When | Scope | Conf | Replaced | Should become | Landed in |
|---|---|---|---|---|---|---|---|---|
| D1 | Lead each image with real reference photographs passed as model inputs and a short prompt naming mechanisms; long text-only prompts with self-made style anchors failed. | generation log, pilot | 28 Sep | durable | H | long text prompts | skill rule | `skills/prompt-director` ("less text, stronger references") |
| D2 | Never prompt a model to fix product print or packaging text: it drifts on every model at hero scale. Composite the real art. | brief, pilot | 24-28 Sep | durable | H | "almost correct" packaging | principle | `skills/product-fidelity`, `skills/product-fidelity` |
| D3 | An integration pass (light, contact) redraws letters: use it only as a light source, then lay real art back with that light as a gain field ("generated light, real letters"). | generation log | 27-28 Sep | durable | H | trusting the pass | skill rule | `skills/product-fidelity` step order |
| D4 | Compositing over a generated object leaves its edges visible ("double object"); remove it first (clean plate) or cover its full footprint, then clean edges and zoom-check at 2x. | review notes | 27 Sep | tool-specific | H | compositing straight over | skill rule | `skills/product-fidelity` |
| D5 | Check product master cutouts for alpha: one semi-transparent master (12% see-through) contaminated three anchors. | generation log | 27 Sep | durable | H | assuming opaque | eval (asset QA) | `skills/product-fidelity` preflight |
| D6 | A blur patch to hide confidential pack text reads as a censor box; use a designed "secret" variant of the art. | review | 27 Sep | durable | H | blur op | skill rule | `skills/product-fidelity` |
| D7 | Presence comes from distance to the lens, not an oversized product, and never from shrinking a liked product in place. | self-evaluation | 28 Sep | durable | H | scale-fix passes | principle | `skills/shot-dna`, `skills/shot-dna` |
| D8 | Do not run a "fix to spec" pass over frames the owner already liked: it made 4 of 5 worse (shrunk product, lifted blacks, stilled gestures). The owner's picks are the base; fix locally. | self-evaluation | 28 Sep | durable | H | global fix passes | principle | `skills/image-edit`, `skills/cstack-shared/PREAMBLE.md` |
| D9 | Fixes are local: crop a box, edit, paste back inside a feathered region with colour matched on the ring; pixels outside stay identical. | batch runner, generation log | 28 Sep | tool-specific | H | full regeneration | skill rule + tool | `skills/image-edit`, `providers/local/region_paste.mjs` |
| D10 | Keep the before file beside the after and show both; never overwrite finals. | review notes | 28 Sep | durable | H | overwriting | lineage | `scripts/lib/lineage.mjs` |
| D11 | Grade targets are measured on the owner's liked set and split by light register; one band for all was wrong. Report deviations; do not force a grade onto content that differs (it produces colour casts). | editorial line, generation log | 28 Sep | durable | H | single band | eval | `skills/image-edit` |
| D12 | Anatomy is a hard gate: count limbs at full size per person, follow each to its shoulder or hip, including people at the edge and hands seen through glass. Three faults survived earlier checks. | owner answer, fix list | 28 Sep | durable | H | no anatomy gate | eval | `skills/creative-review` |
| D13 | Retired rules survive in old job templates: a retired "no visible logos" line kept erasing real third-party marks the owner wanted. Compile prompts from current rules and lint job prompts for retired phrases. | fix list | 28 Sep | durable | H | rules in prose only | principle + lint | `skills/prompt-director`, `scripts/lib/prompt.mjs` |
| D14 | Restore from source pixels before generating (reverting to the liked raw fixed it for free). | fix list | 28 Sep | durable | H | generative restore | cost ladder rung 0/1 | `docs/cost-and-context.md` |
| D15 | Never put a photographer, studio or brand name in a prompt: style leaks, parity risk, and edit endpoints may refuse (and still bill). The reference carries the style; names are metadata. | style rules, refused edit | 24-28 Sep | durable | H | "in the style of" | prompt lint (`scripts/lib/prompt-names.mjs`) | `skills/prompt-director`, `schemas/reference.schema.json` (`credit` never in prompts) |
| D16 | Physical-use logic is a recurring generator failure (pouring from the closed end, drinking through a closed lid, objects appearing before their step). Add an object-stage logic checklist. | generation log | 28 Sep | durable | H | n/a | eval | `skills/creative-review` |
| D17 | Objects drift toward category clichés (props that do not exist in the product world, extra vessels, wrong containers). Keep a named-substitution deny list per brand. | generation log, pilot | 27-28 Sep | durable | H | generic "don't change" | anti-example | `schemas/brand-world.schema.json` `forbidden_drift` |
| D18 | Product truths as a scale sheet with body anchors (head, finger, phone sizes) make scale measurable in-frame. Inferred dimensions spread errors across seven frames: measure the real object. | editorial line, size audit | 28 Sep | durable | H | "looks about right" | fixture | `schemas/brand-world.schema.json` (`immutable_traits` with measured/inferred) |
| D19 | Signature colours are measured, not described: polygon + HSV cues vs a gold swatch, PASS/WARN/FAIL; tiny regions go to a vision judge. | colour-check script | 25 Sep | durable | H | "make it denser" | eval pattern | `skills/product-fidelity` (signature colour gate) |
| D20 | When an output is wrong, look in the prompt before blaming the model: a pale drink came from the prompt's own words. | spend log hypothesis | 25 Sep | durable | H | re-rolling | skill rule | `skills/creative-review` diagnosis step |
| D21 | A masked regrade fixes only hue/lightness, never structure; structure goes to an edit pass. | retouch recipes | 25 Sep | tool-specific | H | regrade as universal fix | routing rule | `skills/image-edit` |
| D22 | Legibility is measured per text box (90% of zone pixels at 3:1 for headings, 4.5:1 for small type). The final fix was to compose the copy zone as real shade in the shot, not to darken the photograph. | legibility audit, owner answers | 28-29 Sep | durable | H | overlays, darkening | eval + shot-brief rule | `skills/shot-dna` (`copy_zone`), `skills/brand-verify` |
| D23 | Set-level checks: casting monotony, repeated scenes, and the "no-logo test" (blur every mark; does the set still read as one brand?). | review notes | 27-28 Sep | durable | H | per-image judging only | eval | `skills/campaign-sequence`, `skills/creative-review` |
| D24 | Sequences are generated in order, each frame fed from the chosen previous one: continuity beats single-frame beauty. | brief, generation log | 27-28 Sep | durable | H | independent frames | skill rule | `skills/campaign-sequence` |
| D25 | Pass the aspect ratio explicitly on every call; an edit keeps the source aspect and crop. | generation log | 24-27 Sep | durable | H | auto aspect | code | `providers/runner.mjs` size audit |
| D26 | After three edit rounds reproducing the same object error, stop: composite or regenerate cleanly. | retouch queue | 24 Sep | durable | M | repeated edits | retry ceiling | `skills/image-edit` |
| D27 | Explicit asset ids and an approval state machine; a site resolving pictures by loose filename patterns shipped the wrong file. | final review | 28 Sep | tool-specific | H | glob resolution | schema | `schemas/artifact-lineage.schema.json` |
| D28 | Fabricated social proof is never generated; founder claims need real photography. | ad masters | 25 Sep | durable | H | n/a | gate | `skills/claims-proof`, `skills/copywriting` |
| D29 | Rights check liked sets: a third-party magazine cover with text removed sat among "our" liked pictures. | liked set export | 24 Sep | durable | M | n/a | eval | `schemas/reference.schema.json` (`rights`) |
| D30 | Store references with mechanism and "what to take": if the image vanished, the record must still say what was learned. | reference README | 25-28 Sep | durable | H | image-only moodboards | principle | `schemas/shot-dna.schema.json`, `skills/shot-dna` |
| D31 | A cheap 2x2 pilot per model on the real task ($0.44-$1.58) chose the engine for each run. | spend log | 27-28 Sep | durable | H | defaults | skill rule | `skills/model-router` (micro-benchmark convention) |
| D32 | Truth vs presence (true-scale product reads tiny in a hero) is a human trade-off; log it, don't decide silently. | hero picks | 28-29 Sep | durable | M | strict true scale | principle | `skills/shot-dna` decision rules |

## E. Provider notes (dated; re-verify before relying on them)

These are observations from real runs through one model host's queue API between 24 and 29 September 2026. They are stored as dated notes in `registry/models.json`, not as permanent truth.

| # | Observation | Evidence | Conf | Landed in |
|---|---|---|---|---|
| E1 | Seedream v5 Pro Edit: strongest reference adherence on light and place, the owner's taste pick; but lifts frame elements from refs, reintroduces warm casts, garbles small print, resists scale edits, returns diptychs when given two gesture refs, and stamps a brand mark onto vessels when a branded ref is present. | pilot + 5 iterations | H | `registry/models.json` |
| E2 | GPT Image (2.5 edit tier): fixes scale and gesture by prompt in crop mode; refuses edits that name a real brand and still bills; bills late (balance reads $0 for seconds to a whole batch). | generation + spend logs | H | `registry/models.json` |
| E3 | Nano Banana Pro (edit): takes reference mechanisms without copying subjects, held framing on plate edits (<8 px drift), most product-faithful in the pilot; invented vessels and undersized product at stage A; redraws letters on integration passes. | pilot, plate edits | H | `registry/models.json` |
| E4 | FLUX.2 Pro (edit): 0 of 4 usable in a product pilot (copied reference subjects, product shape failures). One pilot only. | pilot | M | `registry/models.json` |
| E5 | Listed price vs real: one endpoint listed $0.0675/image, measured $0.10-0.24 by balance delta, varying with reference pixels. Snapshot prices with source and date; reconcile against billing. | spend log | H | `scripts/lib/ledger.mjs` (estimates vs actuals) |
| E6 | A result-fetch timeout still bills: retry the fetch, never resubmit. | spend log | H | `providers/runner.mjs`, `providers/fal.mjs` |
| E7 | Parallel agents on one account make balance deltas unattributable: log cost per call. | spend log | H | `schemas/cost-ledger-entry.schema.json` |
| E8 | Several edit endpoints return no seed: the prompt, refs, params and input hashes are the reproducibility record. | generation log | H | `providers/runner.mjs` sidecar |
| E9 | Outpainting invents architecture at seams; compare the expanded region against source geometry. | generation log | H | `skills/creative-review` |
| E10 | Upscaler variants shift hue; for photographs, blend the upscale with a classic resample to keep grain. | spend log | M | `skills/image-edit` |
| E11 | Generative redraws of flat vector-like art come back speckled and off-colour; upscale and recolour the vector source instead (deterministic first). | launch asset notes | M | `skills/model-router` cost ladder |
| E12 | References at ~1024 px long side; flatten alpha onto a neutral ground before upload; some endpoints bill by processed megapixels. | job builders | M | `providers/fal.mjs` comment |

## Do Not Relearn

The list lives in [`docs/learnings.md`](../learnings.md#do-not-relearn). Source rows for items 1-18: A1; A2; A5-A6; D2-D3; D5; D13; D8-D10; D12; D15; E5-E6; D18; D22; B1; B2; A11-A12; B10-B11; C9; C5.

## Conflicts between local evidence and generic advice

| Topic | Generic advice | Local evidence | Resolution in cstack |
|---|---|---|---|
| Automated aesthetic judges | Taste Labs and others ship LLM verifiers with a score | An AI judge's set verdict was the opposite of the owner's | Verifiers gate rules and adherence; taste stays human until a judge is calibrated against the owner's own pairwise picks (`docs/evals.md`). Both views are kept: verifiers are useful, but not as taste certification. |
| "Fix to spec" QA passes | Verify → fix → re-verify everywhere | A global fix pass degraded liked frames | The loop stays, but fixes are local and minimal, and a fix is diffed against the liked raw before it replaces it. |
| Reference images as model inputs | Rights caution: inspiration only, never an input | Reference-led inputs were the single biggest quality jump | Keep the conflict visible: a reference's `rights.status` decides whether it may be an input (`inspiration_only` = mechanism notes only; owned/licensed = may be input). The owner decides per brand. |
| Strict product true-scale | Product fidelity first | True scale read tiny in a hero; the owner accepted ~1.1-1.35x | Truth vs presence is a logged human decision (D32), never a silent agent choice. |

## V2 migration note

| Bucket | Count | Where |
|---|---|---|
| Promoted to cstack as durable principles, skill rules, evals or code | 77 (A1-A13, B1-B23, C1-C9, D1-D32) | rows above |
| Promoted as dated provider notes | 12 (E1-E12) | `registry/models.json` |
| Stayed brand-specific (palette, casting quotas, product facts, owner answers, campaign secrecy, aligned third-party brands, scale numbers, grade bands) | about 75 | the client's private repo |
| Unresolved, carried as open questions | 5 | below |

Unresolved:
1. **Reference images as model inputs vs rights**: per-brand owner decision (see conflicts table).
2. **AI taste-judge calibration**: no pairwise dataset existed to calibrate against; cstack makes pairwise capture the default so calibration becomes possible.
3. **Copy judging** remained self-judged in practice even after picture judging was separated.
4. **Video/motion**: no video model call was logged in the source project; video routing in cstack is researched, not field-tested.
5. **Performance loop**: designed but never fed; cstack's performance learning is architecture until a first real campaign closes the loop.

## Items the source project referenced but did not contain

Recorded so nobody assumes they were read: a separate tools folder with the original generation runner and key-handling notes, an expert-learnings file and other practitioner notes, any expert-conversation transcripts, mood-board exports, reference-board exports and a written reference-research method, any Higgsfield workflow (none referenced), and the non-vendored code of an earlier brand-system iteration. Their contents were not inferred.
