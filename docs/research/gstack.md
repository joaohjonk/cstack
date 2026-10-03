# gstack — mechanism study for cstack

Source: `garrytan/gstack`, cloned at `research-src/gstack`. HEAD `f30b7b78` (v1.91.13.0, 2026-10-02); visible history 2026-04-04 → 2026-10-02, 228 commits (mostly squashed PR "waves"). All paths below are relative to the repo root. The repo is current, not stale.

Scope: how gstack works and what cstack should borrow from it.

**Evidence label.** "Architecture" means I saw it in code, tests or generator output. "Claim" means it is marketing or self-reported and I did not verify it. Examples of claims: the ~810× productivity figure (`README.md:9`), "10-15 parallel sprints" (`README.md:439`), and A/B token savings (`CHANGELOG.md:1323`).

---

## 0. TL;DR

gstack is not a set of prompts. It is a **compiled workflow runtime** for coding agents:

- One template source (`*/SKILL.md.tmpl`) plus ~60 shared resolvers are compiled into host-specific `SKILL.md` files for 10 agent hosts.
- Every skill starts with a tiered **preamble**, which is executable startup code. It recovers context, loads prior learnings and decisions, and sets the question format, completion protocol and telemetry.
- Skills hand off to each other through **files in a per-project state root** (`~/.gstack/projects/<slug>/`): design docs, CEO plans, test plans, review logs, learnings, decisions and retro snapshots. They do not hand off through chat memory.
- **Hard gates** (STOP + AskUserQuestion) force reframing before implementation. **Bounded fix loops** with risk budgets and hard caps keep QA honest.
- An unusually heavy test system keeps the prompts from drifting: free static tests, diff-selected paid E2E, LLM judges, context-budget ratchets and freshness checks.

---

## 1. Why it feels like an operating system, not a prompt collection

| OS property | gstack mechanism | Evidence |
|---|---|---|
| Boot sequence | Every workflow skill begins with `{{PREAMBLE}}`. It runs `bin/gstack-skill-start` (update check, session tracking, repo mode, STATUS lines), then context recovery and ask-format rules. | `ARCHITECTURE.md:387-395`; `scripts/resolvers/preamble.ts:63-113` |
| Shared filesystem / IPC | Skills communicate through artifacts in the state root, e.g. `/office-hours` writes `*-design-*.md` and `/plan-ceo-review` reads it as "source of truth". | `README.md:211`; `plan-ceo-review/SKILL.md.tmpl:117`; `office-hours/sections/design-and-handoff.md.tmpl:1-46` |
| Process scheduler | `/autoplan` runs CEO → design → DX → eng sequentially. Eng always runs last so the required gate reviews the final amended plan. | `README.md:243`; `autoplan/SKILL.md.tmpl:99,316` |
| Syscalls | ~100 `bin/gstack-*` CLIs (learnings-log/search, decision-log/search, review-log/read, evidence, retro-metrics, redact, egress). Skills call these instead of re-describing logic in prose. | `ls bin/`; `ARCHITECTURE.md:389` |
| Permissions | `/careful`, `/freeze`, `/guard` use PreToolUse hooks. `/investigate` auto-freezes edits to the module under investigation. | `investigate/SKILL.md.tmpl:28-39`; `README.md:431` |
| Device drivers | Browser abstraction: the Aside browser is used first, with gstack's own headless Chromium daemon (`$B`) as fallback. Same skills, same evidence lines, two engines. | `ARCHITECTURE.md:7-58` |
| Memory / journaling | Append-only JSONL stores: `learnings.jsonl`, `decisions.jsonl`, `timeline.jsonl`, `*-reviews.jsonl`, `.context/retros/*.json`. | `scripts/resolvers/learnings.ts:1-13`; `CLAUDE.md:828-851` |
| Status / exit codes | Every skill must end with `DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT`, plus escalation after 3 failed attempts. | `scripts/resolvers/preamble/generate-completion-status.ts` (generateCompletionStatus) |
| Package manager / upgrades | `./setup`, `/gstack-upgrade`, migration scripts in `gstack-upgrade/migrations/`, a throttled SessionStart auto-update in team mode. | `CLAUDE.md:363-367`; `README.md:55-65` |
| Routing | A "Skill routing" block is injected into the project's CLAUDE.md. Skill descriptions contain "Proactively invoke this skill (do NOT answer directly) when…". | `CLAUDE.md:810-826`; `office-hours/SKILL.md.tmpl:12-16` |

The authors frame it as process, not tools: "gstack is a process, not a collection of tools" (`README.md:207`). Parallelism is the stated reason the process matters: "Without a process, ten agents is ten sources of chaos" (`README.md:441`, claim).

---

## 2. Lifecycle map: before / during / after execution

```
BEFORE (plan mode; no code)          DURING (build + verify)              AFTER (reflect + remember)
/office-hours ──design doc──▶        implement (host agent)               /ship  (tests, coverage audit,
/plan-ceo-review ──ceo-plan──▶       /review  (pre-landing diff review)           doc audit, PR)
/plan-design-review (+mockups)       /investigate (root cause, freeze)    /land-and-deploy, /canary
/plan-devex-review                   /qa  (test→fix→verify, atomic)       /document-release
/plan-eng-review ──test-plan──▶      /design-review (audit→fix→verify)    /retro (metrics + trends)
/autoplan = all of the above         /codex | /claude-code (2nd model)    /learn (prune/export memory)
          │                                   │                                   │
          └──── review log ──▶ Review Readiness Dashboard ◀── evidence ledger ────┘
                           (gate read by /ship and /land-and-deploy)
```

- **Before.** Each pre-execution skill states that it does no implementation. `/office-hours` has "HARD GATE: Do NOT … write any code" (`office-hours/SKILL.md.tmpl:68`). `/plan-ceo-review` says "Review only. Do not change code or implement." (`plan-ceo-review/SKILL.md.tmpl:68`). `/plan-design-review` says "The output of this skill is a better plan, not a document about the plan." (`plan-design-review/SKILL.md.tmpl:30-32`).
- **During.** Execution skills require a clean git tree so that each fix is one atomic, revertable commit (`qa/SKILL.md.tmpl:75-87`; `design-review/SKILL.md.tmpl:65`). They write evidence directories (`qa/SKILL.md.tmpl:89-96`; `design-review/SKILL.md.tmpl:126-142`).
- **After.** `/retro` computes metrics through one deterministic helper and compares them with the prior snapshot (`retro/SKILL.md.tmpl:106-120,339-375`). Every skill also runs a mandatory "Operational Self-Improvement" learnings step before its completion status (generateCompletionStatus).

**Handoff artifacts are typed by filename pattern** in `$GSTACK_STATE_ROOT/projects/$SLUG/`: `{user}-{branch}-design-{ts}.md`, `ceo-plans/*.md`, `*-test-plan-*.md`, `{branch}-reviews.jsonl`, `learnings.jsonl`, `decisions.jsonl`, `timeline.jsonl`, `checkpoints/`. The plan-to-QA bridge is explicit: `/plan-eng-review` writes a test plan and `/qa` finds it before falling back to `git diff` (`docs/skills.md:263-265`; `qa/SKILL.md.tmpl:115-129`).

---

## 3. How reframing is forced before implementation

gstack does not rely on the model being humble. It uses structural forcing functions.

1. **Mode question first.** `/office-hours` asks for the goal (startup, intrapreneurship, hackathon, OSS, learning, fun) even when the request already suggests one. The answer selects one of two section files with different interrogation styles (`office-hours/SKILL.md.tmpl:97-112`).
2. **Stage-routed forcing questions.** Six questions (demand reality, status quo, desperate specificity, narrowest wedge, observation, future-fit). Only a subset is asked, based on product stage (`office-hours/sections/phase-2a-startup-diagnostic.md.tmpl:67-79`). Questions are asked one at a time (`office-hours/SKILL.md.tmpl:339`).
3. **Anti-sycophancy as a banned-phrase list plus a "push twice" rule.** Examples: "Never say … 'That's an interesting approach' — take a position instead". Every answer gets a position plus the evidence that would change it (`phase-2a-startup-diagnostic.md.tmpl:17-36`). Five worked BAD/GOOD pushback patterns follow (lines 38-66).
4. **Landscape search, then a "Layer 3" check.** Search for conventional wisdom, then ask whether it is wrong *here*. The result is named as a "EUREKA" and logged to `~/.gstack/analytics/eureka.jsonl`. A privacy gate asks permission first and searches only generalized category terms (`office-hours/SKILL.md.tmpl:170-210`; ETHOS "three layers", `ETHOS.md:64-112`).
5. **Premises must be explicitly agreed.** They are output as `PREMISES: 1. … — agree/disagree?` and confirmed via AskUserQuestion. Disagreement loops back (`office-hours/SKILL.md.tmpl:214-232`). This applies even when the user brings a fully formed plan (`:341`).
6. **Mandatory alternatives with fixed archetypes.** There must be at least two approaches: one "minimal viable", one "ideal architecture", optionally one "creative/lateral". Each has effort, risk, pros, cons and reuse. Then a hard **STOP**: a "clearly winning approach" still needs explicit approval (`office-hours/SKILL.md.tmpl:240-272`).
7. **Scope posture as an explicit mode.** `/plan-ceo-review` makes the user pick one of four postures: EXPANSION, SELECTIVE EXPANSION, HOLD SCOPE, REDUCTION. The recommendation comes from heuristics: greenfield → expansion, fix → hold, more than 15 files → reduction. Once chosen, the reviewer must commit, with no arguing for less in expansion mode (`plan-ceo-review/SKILL.md.tmpl:58-67,399-416`).
8. **Back-routing.** If, mid-review, the user "cannot articulate a stable problem", the reviewer offers to run `/office-hours` inline and then resume (`plan-ceo-review/SKILL.md.tmpl:134-148`).
9. **Anti-shortcut clause.** Models used to explore, dump all findings into a plan file and exit plan mode without asking. A shared resolver now states that "the plan file is the OUTPUT of the interactive review, not a substitute for it", and gate-tier E2E tests pin it (`CHANGELOG.md:6466-6480`, v1.27.1.0).

**What broke in practice.** Prompt-only forcing has limits, and gstack documents them:

- The AskUserQuestion "fallback" clause let models quietly write decisions into plan files. It was deleted as the "root cause of forever war" (`CHANGELOG.md:6074-6086`, v1.31.0.0).
- `/plan-ceo-review` skips its mode-handoff message in "0 of 15 answered samples … across four wording repairs". The TODO concludes "A prose fix won't reach it; this needs a mechanism outside the prompt (a hook or a tool-result gate)" (`TODOS.md:16-25`).

---

## 4. How specialist roles are separated

- **One role, one job, one artifact.** Each skill names a persona and a hard boundary: CEO, eng manager, senior designer, QA lead, debugger, release engineer, CSO (`README.md:213-247`). The persona is backed by different checklists, not just a different name. CEO has 11 review sections plus an error-and-rescue registry (`plan-ceo-review/sections/review-sections.md.tmpl:107-303`). Design has 7 passes with 0-10 ratings (`plan-design-review/sections/review-sections.md.tmpl:41-115`). Investigate has a pattern table and a 3-strike rule (`investigate/SKILL.md.tmpl:192`).
- **Plan-stage vs live-stage twins.** `/plan-design-review` ↔ `/design-review`, `/plan-devex-review` ↔ `/devex-review`, `/plan-eng-review` ↔ `/review` (`README.md:294-301`). The live twin compares against the plan's scores, "the boomerang that shows if your plan matched reality" (`README.md:226`).
- **Report-only vs fix variants.** `/qa` and `/qa-only` share sections, and the report-only variant is tested to make *no* writes (`README.md:229-230`; `CONTRIBUTING.md:190-195`).
- **Shared rubrics, not shared prompts.** One resolver feeds several roles: `{{DESIGN_METHODOLOGY}}` feeds both design skills, `{{TEST_VALUE_BAR}}` feeds qa, test-audit, eng-review and ship. Roles share standards without merging (`ARCHITECTURE.md:345-360`).
- **Composition through declared dependencies.** Frontmatter `benefits-from: [office-hours]` (`plan-ceo-review/SKILL.md.tmpl:15`), `{{INVOKE_SKILL:office-hours}}` for inline delegation, and review chaining in which each review recommends the next based on dashboard state (`plan-ceo-review/sections/review-sections.md.tmpl:572-585`).
- **Orchestrator with decision classes.** `/autoplan` auto-answers intermediate questions using 6 decision principles, with phase-specific tie-breakers. It classifies each decision as *Mechanical* (decide silently), *Taste* (decide, but surface at the final gate) or *User Challenge* (both models want to change the user's direction, never auto-decided) (`autoplan/SKILL.md.tmpl:54-97`). User sovereignty is the ethos's top rule (`ETHOS.md:115-146`).
- **Independent second voice.** `/codex` and `/claude-code` send the review to the *other* vendor's model, routed by host (`README.md:429`). Cross-model agreement is "signal, not proof" (`ETHOS.md:119-124`).

---

## 5. QA and retro as first-class stages

**QA (`/qa`, `/design-review`)**

- Parameterized tiers: Quick fixes critical and high only, Standard adds medium, Exhaustive adds cosmetic. Regression mode runs against a prior baseline (`qa/SKILL.md.tmpl:50-71`).
- Diff-aware by default on a feature branch, and surface-aware: CLI, API and webhook targets do not get a browser (`qa/SKILL.md.tmpl:68-71`; `README.md:249-286`).
- Evidence before claims: a short `exploration-NNN.json` note is saved before each probe (`README.md:267-274`). Every design fix gets a before/after screenshot pair (`design-review/SKILL.md.tmpl:229`).
- Red-first regression: write a failing native test *before* the fix, prove the defect caused the failure, then fix and re-run (`qa/SKILL.md.tmpl:175-196`).
- Atomic commit per verified fix. Each issue is classified `verified`, `best-effort` or `reverted`. Revert on regression (`qa/SKILL.md.tmpl:213-240`; `design-review/SKILL.md.tmpl:197-204,328-330`).
- **Self-regulating risk budget.** A "WTF-likelihood" score adds +15% per revert, +20% for touching unrelated files, and so on. Above 20% the agent stops and asks. Hard caps are 50 fixes (QA) and 30 (design) (`qa/SKILL.md.tmpl:240-255`; `design-review/SKILL.md.tmpl:249-265`).
- Final re-audit against the baseline, with a warning if scores got worse (`design-review/SKILL.md.tmpl:269-277`).
- Executable deadline guard rather than an estimated clock. Unfinished checks stay visible as coverage gaps (`README.md:282-286`).

**Retro (`/retro`)**

- Metrics come from one deterministic helper (`bin/gstack-retro-metrics`). If it is unavailable: "never invent values" (`retro/SKILL.md.tmpl:106-117`).
- A freshness guard blocks the retro if the analyzed window is stale, e.g. wrong "today" or an unfetched remote (`retro/SKILL.md.tmpl:122-127`).
- A persistent snapshot (`.context/retros/{date}-{n}.json`) gives week-over-week deltas (`:339-375`).
- **Shortcut debt ledger.** When a user accepts a lower-completeness option, a `gstack-shortcut(...)` marker is left in code. The retro harvests these markers and joins them against the decision log. Markers with no upgrade trigger are flagged as the ones that "silently rot" (`retro/SKILL.md.tmpl:312-337`).
- `/retro global` aggregates across repos and AI tools (`README.md:239`).

**Learn (`/learn` and automatic capture)**

- Typed learnings: pattern, pitfall, preference, architecture, tool, operational. Each carries a source (observed, user-stated, inferred, cross-model), a 1-10 confidence and a list of files used for staleness detection. Storage is append-only; on read, the latest entry per key and type wins (`scripts/resolvers/learnings.ts:1-13,103-134`).
- Prune checks for deleted referenced files (stale) and same-key contradictions (`learn/SKILL.md.tmpl` Prune section).
- Retrieval is task-shaped. A skill re-queries learnings with a single keyword once it has a hypothesis, and cites "Prior learning applied: [key]" so the compounding is visible (`investigate/SKILL.md.tmpl` "Refresh learnings"; `learnings.ts:96-100`).
- **What broke.** "43 of 44 learnings came from explicit /learn because 'if you discovered' read as optional." The capture step was changed to ALWAYS run, with an explicit "No durable learnings this session" when nothing is found (`generate-completion-status.ts:~53`).
- Separate durable **decision memory** (`decisions.jsonl`): it is resurfaced at session start, and reversing a decision must be announced (`CLAUDE.md:828-851`).
- **Domain skills.** Per-website notes go through a quarantined → active (after 3 clean uses) → global lifecycle (`docs/domain-skills.md`). **Taste memory** stores design-variant approvals and rejections with 5%/week decay (`bin/gstack-taste-update:30,145`).

---

## 6. State and context conventions

- **One state root, one resolver.** The chain is `GSTACK_STATE_ROOT → GSTACK_HOME → GSTACK_STATE_DIR → CLAUDE_PLUGIN_DATA → ~/.gstack`. It lives in two owner files kept identical by a parity test. A ratchet test rejects hand-rolled path chains (`docs/state-root.md:1-30`; `AGENTS.md:288`).
- **Project identity = slug** from the git remote. Branch names are slugged for filenames (`generate-context-recovery.ts`).
- **Context recovery at boot.** The preamble lists the newest CEO plans and checkpoints, the review count, the last timeline events, the last completed skill on this branch, recent skill patterns and active decisions. It then gives a 2-sentence "welcome back" and suggests the next skill once (`scripts/resolvers/preamble/generate-context-recovery.ts`).
- **Dual-write of decision artifacts.** The private copy goes to `~/.gstack` (for memory and discovery). The team copy goes to `docs/designs/` in the repo, after a redaction scan of the exact bytes (`office-hours/sections/design-and-handoff.md.tmpl:19-36`).
- **Lineage.** A new design doc gets `Supersedes: <prior>` when one exists on the branch (`design-and-handoff.md.tmpl:11-17`). Docs are "a decision record, not a transcript" (`:38-44`).
- **Content-bound evidence.** Reviews and test runs are bound to a working-tree content fingerprint (`gstack-wtree`), not to a commit SHA. A review is CURRENT only if the fingerprints at start and finish match (`README.md:334-337`; `docs/skills.md:257-261`; fix history `CHANGELOG.md:567`).
- **Project config lives with the project.** Skills never hardcode commands. They read CLAUDE.md, ask if a value is missing, and persist the answer back (`CLAUDE.md:217-227`).
- **Prompt-authoring rules for stateless shells.** Each bash block runs in a fresh shell, so state passes through prose ("the base branch detected in Step 0"), and conditionals are written as numbered English steps (`CLAUDE.md:229-244`).
- **Context-pressure priority lists.** Big skills declare what to never skip when context runs short (`plan-ceo-review/SKILL.md.tmpl:91-93`; `plan-design-review/SKILL.md.tmpl:131-134`).
- **Section carving.** Large skills keep a skeleton plus `sections/*.md` read on demand. A *passive* `manifest.json` holds only IDs, titles and trigger text. The skeleton prose alone decides when to read a section ("No machine predicate here", `office-hours/sections/manifest.json:5`), and a self-check verifies that the sections were actually read (`office-hours/SKILL.md.tmpl:328-330`).

---

## 7. Install and host abstraction

- **Typed host configs.** `hosts/*.ts` are built with `defineHost()`. A host declares paths, frontmatter allowlist and description limit, path rewrites (`~/.claude/skills/gstack → $GSTACK_ROOT`, `CLAUDE.md → AGENTS.md`), tool-name rewrites (`"the Bash tool" → "the exec tool"`), suppressed resolvers (e.g. cross-model review and gbrain), a metadata sidecar (`agents/openai.yaml` for Codex), a co-author trailer and a boundary instruction (`hosts/define-host.ts`; `hosts/codex.ts`). Cursor is an 8-line file (`hosts/cursor.ts`). "Adding a host is one TypeScript config file, zero code changes" (`README.md:159`).
- **Model overlays.** Per-model behavioral patches (`model-overlays/*.md`) are chosen at generation time. Example: a bounded-scope profile for one GPT variant (`README.md:138-148`).
- **Three install tiers.** (1) Full install for skill-reading hosts. (2) Methodology-only artifacts for OpenClaw and Hermes. (3) A ~2KB instruction-only digest (`agents-digest/gstack-AGENTS.md`) for any rules-reading agent (`README.md:116-136`).
- **Setup** (`setup`, 3,398 lines of bash) builds binaries, links the skills and registers hooks in one canonical location. It self-heals stale hooks. An **ownership gate** (`.gstack-owned` marker, or byte-identity plus banner) ensures it never deletes or overwrites a skill gstack did not create; anything uncertain is backed up first (`CLAUDE.md:322-354`; `README.md:370-376`).
- **Team mode.** gstack is not vendored into the repo. The repo gets a "required/optional" bootstrap and a throttled, silent auto-update check per session (`README.md:55-65`). Vendoring is deprecated (`CLAUDE.md:356-357`).
- **Detect, never install** for heavy third-party pieces (Aside, impeccable). They are probed, and the skill degrades with one line of explanation (`ARCHITECTURE.md:123`; `README.md:401`).

---

## 8. Skill-compile pipeline

```
*/SKILL.md.tmpl  +  sections/*.md.tmpl  +  scripts/resolvers/*.ts  +  hosts/*.ts  +  model-overlays/*.md
                    │  scripts/gen-skill-docs.ts  (runGeneration → compare-or-write)
                    ▼
<host>/…/SKILL.md (committed for Claude; per-host renders)  +  agents/openai.yaml  +  review/design-checklist.md
```

- **Placeholders are filled from source code or shared resolvers.** `{{COMMAND_REFERENCE}}` comes from `commands.ts`, so "if a command exists in code, it appears in docs. If it doesn't exist, it can't appear" (`ARCHITECTURE.md:314-367`). Shared prose blocks (`{{PREAMBLE}}`, `{{ASIDE_SETUP}}`, `{{LEARNINGS_LOG}}`, `{{REVIEW_DASHBOARD}}`, `{{TEST_VALUE_BAR:mode}}`, `{{DESIGN_HARD_RULES}}`, …) are written once and rendered everywhere.
- **Resolvers validate their inputs.** For example, the `query=` macro values are whitelisted against shell injection (`scripts/resolvers/learnings.ts:20-35`). `preamble-tier` is mandatory, and generation throws without it (`preamble.ts:63-74`).
- **Preamble tiers.** T1 is core startup. T2 adds the ask format, context recovery, completeness, confusion protocol, evidence directive and context health. T3 adds repo mode and search-before-building. T4 is the same as T3. Each skill declares its tier, e.g. browse=T1, investigate=T2, office-hours/plan-*=T3, qa/ship=T4 (`preamble.ts:54-62`; `generate-context-health.ts` comment).
- **Catalog trim.** Long `description:` routing prose is moved out of frontmatter into a "When to invoke" body section. This keeps the always-loaded catalog small (`scripts/gen-skill-docs.ts:220-404`).
- **Generated output is committed**, for three reasons: hosts read the file at load time, CI can check freshness, and git blame works (`ARCHITECTURE.md:397-403`). Merge conflicts are resolved on templates, then everything is regenerated, never by picking a side of a generated file (`CLAUDE.md:211-215`).
- **`skill:check`** renders every host into temporary storage and validates frontmatter YAML, unknown `$B` commands, `.claude` path leaks into non-Claude hosts, and stale or untracked outputs (`scripts/skill-check.ts`). This is gstack's "skill health dashboard". Note that the `/health` *skill* is a different thing: a code-quality dashboard for user projects (`health/SKILL.md.tmpl:1-10`).

---

## 9. Test tiers, diff-aware selection, budgets

**Tiers** (`ARCHITECTURE.md:522-533`; `CONTRIBUTING.md:206-228`; `CLAUDE.md:56-76`)

| Tier | What | Cost | When |
|---|---|---|---|
| Free static | command and flag validation against the registry, contract-sentence pins, SKILL.md correctness, generated freshness, budgets, parity | $0 | every `bun run test`, required CI check, secretless so fork PRs get signal |
| Paid E2E | real `claude -p` / PTY sessions in a hermetic env (scrubbed env, temp state root, seeded skills) | ~$4/run (claim; dated) | diff-selected per PR |
| LLM judge | quality scoring of skill docs and outputs | ~$0.15 | selected per PR |
| Periodic | non-deterministic, quality benchmarks, external services | weekly cron | `evals-periodic.yml` |

- **Diff-aware selection.** Each eval declares the files it depends on in `test/helpers/touchfiles-data.ts`. Changes to `GLOBAL_TOUCHFILES` (session runner, shard engine, budgets) trigger everything (`touchfiles-data.ts:1550`). `eval:select` previews the selection. Unknown dependencies restore the full gate, and a prompt with no registered coverage blocks planning (`CLAUDE.md:50-54,103-106`). Later, selection was "derived from each eval's own imports" (`CHANGELOG.md:178`).
- **Gate vs periodic classification rule.** Safety or deterministic tests are `gate`. Quality, non-deterministic or external tests are `periodic`. A free test enforces the alignment (`CLAUDE.md:67-76`).
- **Eval integrity rules.** Paid evals never retry. Trial counts are fixed per case kind before the run (rule = 1 trial; behavior = panel of 3, pass at ≥2; judge = 3 samples, mean against an unchanged threshold). The rules forbid lowering thresholds, adding trials after seeing a result, or "rejudging a failure to manufacture a pass" (`AGENTS.md:148-153,212-222`). Captured transcripts are reused in free regressions before paying for another run (`AGENTS.md:148-150`). The blame protocol: you may not call a failure "pre-existing" without running it on main (`CLAUDE.md:690-703`).
- **Ground-truth fixtures.** QA evals run against HTML pages with *planted* bugs and a JSON answer key (id, category, severity, detection hints) (`test/fixtures/qa-eval-ground-truth.json`).
- **Context budgets, three ledgers.**
  1. A warning above 160KB (~40K tokens) per generated SKILL.md, described as a "watch for feature bloat" guardrail, not a hard gate (`CLAUDE.md:179-188`).
  2. A **hard** cap on the always-loaded catalog (name + description across all skills ≤ 1,171 token-equivalents, 260 bytes per skill), because every host pays it every session (`CLAUDE.md:190-195`).
  3. A **ratchet** (`test/context-budget-ratchet.test.ts`) with absolute per-skill ceilings for eager tokens in `test/fixtures/context-budget.json`. Headroom is ×1.05 always-on and ×1.1 per invocation. A new skill fails until it has a budget, and reductions are locked by recommitting the fixture (`CLAUDE.md:200-209`).

  `bin/gstack-context-bill` prints the token bill of materials (always-on vs per-invocation, `--diff`, `--budget`) (`README.md:330`).
- **Observability.** Heartbeat and partial-result files are written atomically, so a killed run still leaves data. Observability I/O is non-fatal. `eval:compare`, `eval:summary` and `eval:flake-rank` exist (`ARCHITECTURE.md:464-520`). Long runs are detached and lock-serialized so worktrees don't saturate the API (`CLAUDE.md:718-758`).
- **Fixture hygiene.** Never copy a full SKILL.md into an E2E fixture; extract only the section under test, which took one test from timing out to ~38s (`CLAUDE.md:760-777`).

**What broke in practice (git log / CHANGELOG)**

- Prompt bloat. v1.71.0.0 moved preamble bash into runtime scripts and gated one-time onboarding text, roughly halving eager tokens per skill (claimed: /review 109.5KB → 53.7KB). CI ceilings lock the gain (`CHANGELOG.md:1323-1340`). v1.15.0.0 had already cut ~50K tokens per invocation (`CHANGELOG.md:7497`).
- Guards that silently failed open. A series of fix waves ("guards failing open / silent failures", v1.61; "every guard in the pipeline now provably fires", v1.64.1, −24,943 lines) shows that prompt guards rot unless each one has a test (`CHANGELOG.md:2323`).
- Test sprawl. v1.91.8.0 removed 227 test files and retired the evals that had been "red eight runs straight" (`CHANGELOG.md:178-190`).
- Review evidence could falsely read CURRENT after edits. Fixed by binding evidence to start and end content (`CHANGELOG.md:567`).
- Feature retreat. Continuous WIP checkpoint commits were removed (`CHANGELOG.md:388-392`).
- Host and model drift. The preamble order matters: "reversing this order regresses plan-review cadence (v1.6.4.0 bug)" (`preamble.ts` comment above generateAskUserFormat). Per-model overlays exist for the same reason.

---

## 10. Mechanism → evidence → creative-work analogue for cstack

| gstack mechanism | Evidence | Creative-work analogue for cstack |
|---|---|---|
| `/office-hours` hard gate + forcing questions + mandatory alternatives | `office-hours/SKILL.md.tmpl:68,214-272` | `/creative-office-hours`: no generation allowed. Ask about the job of the piece, the audience shift, the product truth, the tension, and which convention to use, invert or ignore. Output a creative brief with ≥2 routes: "safe", "ideal", "lateral". |
| Mode selection by goal and stage | `office-hours/SKILL.md.tmpl:97-116`; `phase-2a…:73-79` | Mode by job type (brand-building / conversion / culture / launch) and by brand maturity (new / established / rebrand). Each mode routes to a different question subset. |
| CEO scope postures (expand / selective / hold / reduce) | `plan-ceo-review/SKILL.md.tmpl:58-67,399-416` | Ambition posture for a campaign: Big Idea expansion / selective adds / hold to brief / reduce to hero asset. Chosen explicitly and recorded. |
| Premises must be agreed | `office-hours/SKILL.md.tmpl:224-232` | Classified input sheet (FACT / HARD_CONSTRAINT / … / UNKNOWN) confirmed line by line before production. |
| 0-10 rating per dimension + "what makes it a 10" + one question per gap | `plan-design-review/SKILL.md.tmpl:273-293` | Multi-lens review (strategist, brand director, art director, photographer…). Each lens scores separately, never one merged score. Each gap is resolved individually. |
| Mockups are the plan ("reviews without visuals are just opinion") | `plan-design-review/SKILL.md.tmpl:77-90` | Moodboard or low-cost thumbnails before high-cost renders. References are retrieved before generating. |
| AI-slop pass with hard rejections and litmus tests | `plan-design-review/sections/review-sections.md.tmpl:70-83`; `lib/design-catalog.ts` | Brand anti-library and slop catalog as a typed source rendered into every creative skill. |
| Plan-stage vs live-stage twins ("boomerang") | `README.md:226,294-301` | `/plan-art-direction` scores the brief; `/creative-qa` scores the actual assets against the same rubric and reports the delta. |
| Atomic fix loop: before/after evidence, revert on regression, risk budget, hard cap | `design-review/SKILL.md.tmpl:197-265`; `qa/SKILL.md.tmpl:240-255` | Refinement loop: change one variable per iteration and store before/after plus a diff note. Stop and ask when "drift risk" rises (e.g. a regenerated identity element, an off-palette result, more than N iterations). Hard cap on paid regenerations. |
| Red-first regression test | `qa/SKILL.md.tmpl:175-196` | Each rejected asset becomes an anti-example fixture, and the eval must flag it before the fix is accepted. |
| Planted-bug ground-truth fixtures | `test/fixtures/qa-eval-ground-truth.json` | Brand-QA eval sets with planted violations (wrong logo clearspace, off-brand color, banned phrase, legal claim) and an answer key. |
| Typed learnings with source + confidence + files + staleness | `scripts/resolvers/learnings.ts` | Brand learnings tied to the assets or brand-state files they reference. Each records its source (client-stated / observed-in-edits / inferred / cross-judge). A learning goes stale when its referenced asset is retired. |
| Mandatory "no learnings" explicit result | `generate-completion-status.ts:~53` | Every creative skill ends with a learnings step that cannot be skipped. Edit diffs are mined. |
| Decision log, resurfaced at session start | `CLAUDE.md:828-851`; `generate-context-recovery.ts` | Creative decision log: route chosen, routes killed and why. Shown on resume so settled art-direction calls are not reopened. |
| Taste memory with decay | `bin/gstack-taste-update:30,145` | Per-brand preference model from pairwise picks, with decay, kept separate from fixed brand truth. |
| Domain skills (quarantined → active → global) | `docs/domain-skills.md` | Provider and tool notes ("model X ignores negative prompts", "platform Y crops 4:5") under the same probation lifecycle. |
| Retro from deterministic metrics + snapshot deltas + shortcut-debt ledger | `retro/SKILL.md.tmpl:106-375` | `/retro` on campaign data: cost per accepted asset, rounds per approval, rejection reasons, spend by provider, performance deltas. Plus a "creative shortcut ledger" (placeholder copy, AI-only image approved without a photo shoot, etc.). |
| Review Readiness Dashboard bound to content fingerprint | `docs/skills.md:237-261` | Release gate per deliverable. Brand verification counts only for the exact asset hash that was reviewed; any edit invalidates it. |
| Orchestrator with Mechanical / Taste / User-Challenge classes | `autoplan/SKILL.md.tmpl:62-97` | `/campaign-autopilot` auto-decides only mechanical choices. It surfaces taste choices at one gate and never auto-overrides a creative director's stated direction. |
| Template + resolver compile to host views | `ARCHITECTURE.md:314-403`; `hosts/define-host.ts` | One canonical skill source compiled per host. Brand state is injected by resolvers, not copy-pasted. |
| Tiered preamble | `scripts/resolvers/preamble.ts:54-113` | Preamble tiers: T1 load brand state; T2 add recovery, ask format and decision log; T3 add reference retrieval. |
| Passive section manifest + section self-check | `office-hours/sections/manifest.json` | Load medium-specific rubrics (packaging, video, OOH) only when that medium is in scope. |
| Context budgets: catalog cap + per-skill ratchet + bill CLI | `CLAUDE.md:179-209` | The same three ledgers for cstack, plus a budget for brand-state injection size. |
| Diff-aware paid eval selection via touchfiles | `test/helpers/touchfiles-data.ts`; `CLAUDE.md:50-54` | A typography-skill edit runs only typography fixtures; a provider adapter edit runs only that provider's tiny live test. |
| Paid evals never retry; fixed trial panels | `AGENTS.md:212-222` | Multimodal judges run as a pre-registered panel with fixed samples. Spend is recorded. No re-judging until a pass appears. |
| Redaction at sink + egress receipts | `CLAUDE.md:287-306,385-421` | Unreleased campaign material and client data are scanned before leaving the machine. Each provider call writes a receipt (provider, hash, cost). |
| Ownership gate on install | `CLAUDE.md:332-354` | Never overwrite official brand assets or a user's own skills without proof of ownership; back up first. |

---

## 11. cstack implications

**Borrow**

1. **The lifecycle as artifacts, not chat.** Each stage writes a typed file into a per-brand / per-project state dir with a `Supersedes:` chain. Downstream skills discover it by pattern. This is what makes gstack "an OS".
2. **Hard gates with explicit STOPs at decision points.** Use them in creative office hours, route choice and posture choice. Pair them with a structured decision brief (ELI10, stakes, recommendation, per-option completeness). Put the gate logic in one shared resolver.
3. **Mandatory alternatives with fixed archetypes** (safe / ideal / lateral) before any production.
4. **Separate lenses with separate rubrics**, and plan-stage/live-stage twins that compare scores.
5. **Bounded, evidence-first fix loops**: one variable per iteration, before/after, revert on regression, a numeric drift budget, a hard cap. This maps almost directly onto image and copy refinement.
6. **Always-run learnings capture with an explicit empty result**, typed, with confidence and file links for staleness. Plus a separate decision log resurfaced at boot. gstack's own data (43/44) shows that optional capture does not happen.
7. **One canonical source compiled to host views**, with typed host configs (path and tool rewrites, suppressed blocks, description limits) and generated files committed and checked for freshness.
8. **Three context ledgers** (always-on catalog cap, per-skill eager ratchet, bill-of-materials CLI) from day one. gstack had to cut ~50% of its tokens after the fact.
9. **Free static tier + diff-selected paid tier + periodic tier**, with touchfile dependencies, "unknown deps → full gate", fixed trial panels, no retries, and a blame protocol.
10. **Planted-defect ground-truth fixtures** for brand QA.
11. **Content-hash-bound approvals.** A brand-verification pass belongs to an asset hash, not to a file name.

**Do not borrow (or borrow carefully)**

1. **The "Boil the Ocean" completeness ethos** (`ETHOS.md:34-60`; autoplan P1/P2). It conflicts with a minimal baseline and with cost. Creative generation has real marginal cost per variant, and "complete" is not a coherent goal for taste. Keep the pressure for completeness in verification, not in generation volume.
2. **Persona voice and founder branding baked into skills** (`CLAUDE.md:458-474`). cstack's voice should come from each brand's state, not from the toolkit author.
3. **Prompt-only enforcement of critical handoffs.** gstack's own TODO says that wording repairs failed 0/15 and that a hook or tool-result gate is needed (`TODOS.md:16-25`). Put critical gates (approval before paid batch, brand verification before export) in code or hooks, not prose.
4. **The size of the system.** 3,400 lines of setup bash, ~100 bin CLIs, ~1,000 test files, constant "fix waves". Start with ~15 units and add a mechanism only when it fixes a demonstrated failure. gstack's v1.91.8 test purge and v1.64.1 "−24,943 lines" show what happens otherwise.
5. **Very large skills (25-35K tokens).** gstack tolerates them (`CLAUDE.md:184`). cstack should prefer section carving plus passive manifests from the start.
6. **Browser-daemon infrastructure.** It is not needed. For creative QA, render through one deterministic renderer and add a vision judge only for finalists.

---

## Unreachable sources

None needed. Everything above comes from the local clone. I did not consult the GitHub web UI, issues or the PR discussions referenced by `#NNNN` numbers. Claims attributed to those PRs are as described in CHANGELOG/TODOS text only. History earlier than 2026-04-04 is not present in this clone.
