# Agent Skills: the open standard and five public skill libraries

Research note for cstack Phase A. It covers the Agent Skills standard and the Rampstack, Higgsfield, Wondel, RefoundAI/Lenny and Trail of Bits libraries.
Date: 2026-10-03. Sources are the local clones under `research-src/` (paths below are relative to that directory) plus the agentskills.io and host docs fetched today.

Labels used in this note:
- **[code]**: seen in repository files, CI or scripts. This is architecture.
- **[docs]**: seen in official host or spec docs. WebFetch passes these pages through a summarizer, so treat exact field lists as "as documented", not "as tested".
- **[claim]**: README or marketing copy that no code backs up.
- **STALE**: superseded or no longer on the repo's main path.

---

## 0. Unreachable sources

| Source | What I tried | Result |
|---|---|---|
| `skills.sh/wondelai/skills/storybrand-messaging` | WebFetch, then `curl` | WebFetch permission request timed out. curl got `CONNECT tunnel failed, response 403` because the egress proxy blocks skills.sh. |
| `skills.sh/trailofbits/skills/interpreting-culture-index` | WebFetch | Permission timed out |
| `skills.sh/refoundai/lenny-skills/engineering-culture` | WebFetch | Permission timed out |
| `skills.sh/rampstackco/claude-skills/creative-direction` | WebFetch | Permission timed out |
| `skills.sh/higgsfield-ai/skills/higgsfield-brandkit` | WebFetch | Permission timed out |
| `agents.md` (AGENTS.md convention site) | WebFetch | Permission timed out |

As a result, this note says nothing about skills.sh install counts, audit badges or how the site presents skills. It covers only what the repos show. Repos do reference the skills.sh install path: `npx skills add <owner>/<repo>` (`higgsfield-ai_skills/INSTALL.md:29-37`) and `npx skills add wondelai/skills/<slug> --global` (`wondelai_skills/create-website/SKILL.md:38`). For AGENTS.md I state only what host docs or repos say.

**Important finding:** the skill at `skills.sh/refoundai/lenny-skills/engineering-culture` **no longer exists on the repo's main branch**. It was in the initial commit (`git show 0123453:skills/engineering-culture/SKILL.md`). The "Lenny Skills DB 2.0" rebuild (`0db1f49`) removed it. Its closest current successor is `skills/engineering-health/`. Both versions are analyzed below, and v1 is labeled STALE.

---

## 1. The standard

### 1.1 What the spec defines [docs: agentskills.io/specification]

A skill is a directory that contains `SKILL.md`, which is YAML frontmatter followed by a Markdown body. Optional siblings are `scripts/`, `references/` and `assets/`. Any other files are allowed.

| Field | Req | Constraint |
|---|---|---|
| `name` | yes | 1-64 chars, `[a-z0-9-]`, no leading, trailing or double hyphen, **must equal the parent dir name** |
| `description` | yes | 1-1024 chars. Says both what the skill does and when to use it |
| `license` | no | Short name or the name of a bundled file |
| `compatibility` | no | ≤500 chars of environment requirements (product, packages, network) |
| `metadata` | no | Map of string to string, for client- or author-defined keys |
| `allowed-tools` | no | Space-separated pre-approved tools. **Experimental**; support varies |

Anthropic's own packager enforces exactly these six keys and nothing else: `ALLOWED_PROPERTIES = {'name','description','license','allowed-tools','metadata','compatibility'}` (`anthropics_skills/skills/skill-creator/scripts/quick_validate.py:42`). The Claude Code docs warn that other hosts or upload paths may hard-error on non-standard keys [docs: code.claude.com/docs/en/skills, "Using skill frontmatter outside Claude Code"].

### 1.2 Progressive disclosure (the core runtime contract)

| Tier | Loaded | When | Budget guidance |
|---|---|---|---|
| 1 Catalog | `name` + `description` (+ location) | session start, every turn | ~50-100 tokens/skill |
| 2 Instructions | full SKILL.md body | on activation | <5000 tokens, <500 lines |
| 3 Resources | referenced files | only when the body points at them | unbounded, but keep files focused |

Rules that follow from this:
- References should sit **one level deep**: SKILL.md links to files, and those files do not link onward (spec, "File references").
- Claude Code caps the catalog at about **1% of the context window**. When the catalog overflows, it drops descriptions. `description` + `when_to_use` is truncated at 1,536 chars [docs].
- After compaction, Claude Code re-attaches only the **first 5,000 tokens of each invoked skill, with 25,000 tokens in total** [docs]. Any must-hold rule therefore belongs at the top of the body, or in a hook.

Activation is decided by the model, not by harness keyword matching. Hosts expose activation either as a file read of the listed `location` or through a dedicated tool (`activate_skill`, `Skill`). Users can also invoke a skill explicitly with `/name` (Claude Code, Cursor, Gemini, OpenCode) or `$name` (Codex) [docs: agentskills.io/client-implementation/adding-skills-support].

### 1.3 Directory conventions for discovery

agentskills.io's client guide recommends that every client scan **both** its native dir **and** `.agents/skills/`, at project and user scope. On a name collision, **project overrides user**. Hosts are told to parse frontmatter leniently: warn on a name/dir mismatch but still load; skip the skill if the description is missing; and retry a value with an unquoted colon after quoting it [docs].

### 1.4 Cross-host portability matrix (as documented 2026-10-03)

| Host | Project paths | User paths | Other scopes | Explicit invoke | Non-spec frontmatter honored | Sidecar metadata |
|---|---|---|---|---|---|---|
| **Claude Code** [docs] | `.claude/skills/` (+ ancestors to repo root, nested `<subdir>/.claude/skills` loaded lazily) | `~/.claude/skills/` | enterprise managed dir (highest), plugins `<plugin>/skills/` namespaced `/plugin:skill`, `--add-dir`, claude.ai synced to `~/.claude/skills/synced/` | `/skill args` | `when_to_use`, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`, `disallowed-tools`, `model`, `effort`, `context: fork`, `agent`, `background`, `hooks`, `paths`, `shell` | `.claude-plugin/plugin.json`, `marketplace.json` |
| **Codex** [docs: learn.chatgpt.com/docs/build-skills] | `.agents/skills` in cwd, parents, repo root | `$HOME/.agents/skills` | admin `/etc/codex/skills`, system bundled | `$skill`, `/skills` | spec only. **Drops skills with description >1024 chars** (`rampstackco_claude-skills/dist/codex/PORT_NOTES.md`, verified against codex-cli 0.118.0) | `<skill>/agents/openai.yaml` with `interface.*`, `policy.allow_implicit_invocation`, `dependencies.tools`. Also reads `.claude-plugin/marketplace.json` directly (`trailofbits_skills/AGENTS.md`, "Codex Compatibility") |
| **Cursor** [docs: cursor.com/docs/context/skills] | `.agents/skills/`, `.cursor/skills/`; compat `.claude/skills/`, `.codex/skills/` | `~/.agents/skills/`, `~/.cursor/skills/`; compat `~/.claude/skills/`, `~/.codex/skills/` | plugins | `/name` | `paths`, `disable-model-invocation`, `icon`, `color` | `.cursor-plugin/plugin.json` |
| **Gemini CLI** [docs: geminicli.com/docs/cli/skills] | `.gemini/skills/` or `.agents/skills/` (alias wins within tier) | `~/.gemini/skills/` or `~/.agents/skills/` | built-in, extension | `/skills …`; model calls `activate_skill` **with a user consent prompt** | not documented in fetched page | extensions |
| **OpenCode** [docs: opencode.ai/docs/skills] | `.opencode/skills/`, `.claude/skills/`, `.agents/skills/` (walks up to git worktree) | `~/.config/opencode/skills/` | n/a | skill tool | spec fields only. Name regex `^[a-z0-9]+(-[a-z0-9]+)*$`, must match dir | `opencode.json` `permission.skill` allow/deny/ask globs |

**Portable floor:** put each skill at `.agents/skills/<name>/SKILL.md`, using only spec frontmatter, a description of ≤1024 chars, and a quoted description whenever it contains `: `. Every host above except Claude Code reads `.agents/skills/` natively. Claude Code needs `.claude/skills/` or a plugin. Wondel and Rampstack both mirror into `.agents/skills/` for exactly this reason.

**AGENTS.md vs SKILL.md:** these do different jobs. AGENTS.md (or CLAUDE.md or GEMINI.md) is *always-on repo guidance*, while skills are *on-demand procedures*. Trail of Bits keeps a single `AGENTS.md` and has `CLAUDE.md` point to it (`trailofbits_skills/CLAUDE.md`). Wondel ships `CLAUDE.md`, `.cursorrules` and `.github/copilot-instructions.md` as separate files. The AGENTS.md convention site itself could not be reached (§0).

---

## 2. Per-repo mechanism tables

Each table extracts the same 11 dimensions. Cells cite file:line where the cell is load-bearing.

### 2.1 Rampstack: `rampstackco/claude-skills` (named skill `creative-direction`)

**Library shape [code].** It has 103 skills at `skills/<name>/{SKILL.md, references/}` with 490 reference files, plus 15 "forward-deployed" workflows in `workflows/`. A `SKILLS.lock` holds a sha256 for every skill file, and a `WORKFLOWS.lock` carries per-workflow `status`. Generated host builds live in `dist/codex/` and `dist/pi/`. The uniform 8-header contract is spelled out in `SKILL_AUTHORING.md:28-31`. The repo is active: last commit 2026-09-15.

| Dimension | `creative-direction` | Library-level mechanism |
|---|---|---|
| Trigger logic | Long "pushy" description with explicit trigger phrases plus negative routing ("Does NOT fire for… use `creative-brief`") at `skills/creative-direction/SKILL.md:3`. Body adds "When to use / When NOT to use" with sibling redirects at `:21-37`. | Authoring rules require 2-4 sentences, ≥5 trigger phrases, one implicit trigger, and NOT-to-use pointing at siblings (`SKILL_AUTHORING.md:106-129, 230-243`). Commit `cd90ddd` "trigger clauses and description boundary collisions" fixed collisions. A **heuristic token-overlap discovery audit** runs at build time with prompt→expected-skill fixtures and flags misses (`dist/codex/SKILL_DISCOVERY_AUDIT.md`), e.g. `brand-archetype-system` ranks 4. |
| Prerequisites | "Required inputs" lists project, audience, goal, optional 2-4 reference URLs, and declared constraints (`:41-48`). | Every skill has `## Required inputs`. Workflows carry `## Prerequisites` + a `connectors:` block with capability, access and bounds (`workflows/content-pipeline-prove-gates.md:20-37`). |
| State persistence | The output file is the state: `BRIEF.md` at the project root, which every downstream skill must check (`:116-117, 134`). | File artifacts only. No machine state. Workflows mention an "agreement log", but it is operated outside the repo (`workflows/README.md`). |
| Fixed vs latitude | Four axes, each a spectrum where picking a position excludes its neighbours (`:52-105`). **Rejection list** section: "what this brief explicitly says no to" (`:142`; `references/brief-template.md:57-65`). "Position is the gravitational center, not a fence" (`:125`). | Rejection lists recur. Constraints such as parent brand voice and accessibility floors are listed as inputs. |
| Approval checkpoints | One axis at a time, with the user selecting a position. Tensions such as Functional+Provocative are flagged and the user is asked to confirm (`:112-114`). | Workflows: "engines propose and stop, a human merges". `write-held` connectors mean nothing publishes by itself (`workflows/README.md`, merge doctrine). Phase "Done when: a human selects…" (`content-pipeline-prove-gates.md` Phase 1). |
| Deterministic vs generative | Purely generative/advisory. No scripts. | No scripts in skills. Determinism lives in CI tooling (lint, lock, dist builders). |
| Output contracts | Six fixed sections: header, axes, synthesis (present tense), references, rejection list, open questions (`:132-145`). | `## Output format` is mandatory. A template, a checklist and an example ship per skill (`SKILL_AUTHORING.md:192-206`). |
| References/templates | `axes-explained.md`, `brief-template.md`, `example-aesthetic-brief.md`. | Naming conventions `*-template.md`, `*-checklist.md`, `example-*.md` (`SKILL_AUTHORING.md:210-222`). |
| Evals/validation | None for model behaviour. | **Static only**: `lint_skills.py` checks headers, name/dir match, reference files resolving, cross-skill refs, line lengths, em dashes, and a private brand-name watchlist. It also checks that the generated README catalog is in sync (`.github/scripts/lint_skills.py:151-404`). `SKILLS.lock` hash parity. **dist drift guard** rebuilds and byte-diffs (`.github/workflows/dist-drift.yml`); the header explains `dist/pi` shipped 102/103 skills until this guard existed (#104). Workflow **status ladder** `template → validated (public run record) → hardened` (`workflows/README.md`). |
| Tool/model availability | Stack-agnostic by rule: principles over tools, and name 2-3 alternatives when a tool must be named (`SKILL_AUTHORING.md:150-180`). | **Honest-stop contract**: 60 of 103 skills carry an identical "If required data is unavailable" section, where the sanctioned output is the deliverable with the gap stated and fabrication is never allowed (commit `e5bc675`; e.g. `skills/accessibility-audit/SKILL.md:235-237`). Workflows have "If a prerequisite is unmet" → a report-blocked statement satisfies done-when, and blocked propagates downstream (`content-pipeline-prove-gates.md:47-53`). `creative-direction` does **not** carry the section (deliberately left alone; grep returns 0). |
| Chaining | Produces the brief that `landing-page-copy`, `art-direction`, `content-and-copy` and `brand-style-guide` consume (`:117`). `art-direction` says it "consumes" this brief (`skills/art-direction/SKILL.md:3,28`). | Chaining happens in prose through named slugs and is lint-checked (`check_cross_skill_references`). Workflows chain skills per phase with "Skills:", "Input", "Output artifact" and "Done when". |

**Portability [code].** `scripts/build-codex.mjs:1-37` keeps only `name`+`description` in the emitted SKILL.md. Non-spec keys (`category`, `catalog_summary`, `display_order`) go to a **reversible sidecar** at `references/_claude-frontmatter-extras.yaml`, descriptions longer than 1024 chars are truncated with the original kept, and the output is checked byte-for-byte deterministic across two builds. This is the clearest public example of "canonical source → generated host views".

### 2.2 Higgsfield: `higgsfield-ai/skills` (named skill `higgsfield-brandkit`)

**Library shape [code].** 8 top-level `higgsfield-*/` skills, each **self-contained** with no `../` references, so any one can be installed alone (`CLAUDE.md`, "Self-contained skills"). One `VERSION` (0.13.0) must match every SKILL.md `version:` and all 4 plugin manifests, and CI fails on drift (`.github/workflows/validate-skills.yml`). Manifests ship for Claude, Codex and Cursor. Every vendor action goes through one CLI (`higgsfield`); calling the API directly with curl is forbidden (`CLAUDE.md`, "API conventions"). The repo is active: last commit 2026-09-26.

| Dimension | `higgsfield-brandkit` |
|---|---|
| Trigger logic | `description` has a capability sentence + `Use when: "…"` phrases + `Chain with…` + `NOT for… (use X)` (`higgsfield-brandkit/SKILL.md:4-5`). CI **enforces** that `Use when` and `NOT for` substrings exist and that the description is ≤1024 chars (`validate-skills.yml`, frontmatter step). It also adds `argument-hint` (`:6`). |
| Prerequisites | A stage-scoped capability matrix (`references/prerequisites.md`): Python for state, the CLI for generation, Playwright for screenshots, rsvg and ImageMagick for logo export, LibreOffice and Poppler for the brandbook. It checks **only the tools the current stage needs** and "never install system packages without the user's permission" (`SKILL.md:24-25`). Auth failure → asks the user to log in and waits (`:31`). It inspects live model contracts before paid generation (`:32-38`). |
| State persistence | **Durable local JSON state** at `./brandkit/state.json`, mutated only through `scripts/brandkit.py state --action …` (`SKILL.md:16-22, 72-79`). Each slot (palette, logo, typography) carries a `revision`. Downstream elements store the revisions of their `required_slots` (`scripts/brandkit.py:197-200, 511-559`). "Never paste, hand-edit, or recreate approvals when the state file exists" (`SKILL.md:79`). |
| Fixed vs latitude | A **Brand Lock** where every field is `fixed` / `proposed` / `not_applicable` / `unknown`, each with an evidence label `source-declared` / `measured` / `visually-observed` / `inferred` (`references/brand-lock.md`, "Lock states"). User-supplied official assets are locked immediately with `lock_authoritative_*` (`references/intake.md`) and cannot be replaced by `approve_*` (`brandkit.py:350`). Request is classified as `apply-existing` / `extend-partial` / `create-identity` (`SKILL.md:68-71`). Three optional visual axes 0-100 (restrained↔expressive, geometric↔organic, familiar↔experimental). |
| Approval checkpoints | Hard stops after palette, logo and typography: "Never infer approval from silence, successful generation, or your own preference" (`SKILL.md:62-63`). Even in no-question mode, logos are never self-approved (`:135`). Downstream assets are saved only after explicit approval with their exact dependencies (`:100`). |
| Deterministic vs generative | Explicit split. Generative: Recraft V4.1 vector for new marks only, Seedream for photoreal mockups, GPT Image 2 only for readable-text stages (`:143-144`). Deterministic: HTML palette and type previews, SVG logo inspect / geometry fingerprint / recolor / export, and the PPTX/PDF brandbook builder (`scripts/brandkit.py` ~1.5k lines, `build_brandbook.py` ~1k lines). Rule: "Do not ask an image model to fake editable files" (`:145`). |
| Output contracts | Brandbook has a strict response contract: PPTX path, PDF path and a font warning only (`:179`). Everything else returns files + Brand Lock summary + editable-vs-flattened labels + font limits + **stable variant names for targeted revisions** (`:181-187`). State payload shapes are exact JSON, "replace values only" (`references/state-payloads.md`). |
| References/templates | 24 reference modules, loaded per stage ("Load only the requested production module", `:91-99`): Design Brain (kept private from the user, `:59`), logo prompt enhancer, preview payloads, and so on. |
| Evals/validation | Runtime QA: a preflight checklist before paid generation, a **set-level consistency matrix** across all assets, and "Do not accept a vision model's statement as proof of exact hex, font, spacing, or radius". Measurable properties are checked deterministically (`references/qa-and-iteration.md` §1-3). Repo evals are **manual**: 10 scenarios with expected behaviour + pass/partial/fail rubric, "no automated runner yet", and a >15% score regression or 2× time triggers a revert (`evals/README.md`, `evals/scenarios.md`). There is a "Key Decisions (Do Not Revisit Without Data)" slot, currently empty (`CLAUDE.md`). |
| Tool/model availability | Live discovery over memory: "never invent model or workflow names. Run `higgsfield model list`" (`CLAUDE.md`). Discovery guardrail: list the full catalog rather than trust semantic search (`higgsfield-generate/SKILL.md:51-66`). **Failure policy**: retry once with the same locked concept, stop after the second equivalent failure, never improvise a fallback generator and call it canonical, and disclose fidelity limits instead of claiming completion (`SKILL.md:169-175`). |
| Chaining | "Skills communicate through return values, not implicit state" (`CLAUDE.md`, "Skill chaining"): e.g. `soul-id` returns `reference_id` → `generate --soul-id`. Brandkit chains to `higgsfield-generate` and Marketing Studio brand-kits. Multi-skill requests run sequentially, one skill's questions at a time ("Don't batch-ask questions across skills"). **Dependency-aware invalidation**: a palette change invalidates the generated logo and its dependents, while a typography change does not invalidate the mark (`SKILL.md:139-141`; `brandkit.py:340-376`). |

**Portability notes [code].**
- Non-spec top-level `version:` and `argument-hint:` would fail Anthropic's `quick_validate.py:42` and could hard-error on other hosts.
- The `setup` script installs into `~/.cursor/plugins` and `~/.codex/plugins` (`setup:84-86`), which do not match the documented skill dirs `~/.cursor/skills` and `~/.agents/skills`. Whether those paths work is unverified.
- `npx skills add` and `gh skill install` are the recommended cross-agent installers (`INSTALL.md:29-47`).
- The backend "prompt enhancer" behind `product-photoshoot create` is private. The skill only says that bypassing it "produces noticeably worse output" (`higgsfield-product-photoshoot/SKILL.md:27, 213`). That claim is not verifiable here.

### 2.3 Wondel: `wondelai/skills` (named skill `storybrand-messaging`)

**Library shape [code].** 65 skills at the repo root: 51 "book skills" plus 14 **metaskills** (journeys). `.claude-plugin/marketplace.json` is the source of truth. Everything else is generated by `scripts/sync-ide-skills.sh` and `generate-plugins.sh` and must not be hand-edited: symlink mirrors in `.claude/ .cursor/ .windsurf/ .pi/ .agents/skills/`, Codex plugins, and Agent Plugins copies (`CLAUDE.md`, "Repository Structure"). The repo is active: last commit 2026-09-10.

| Dimension | `storybrand-messaging` (book skill) | Metaskill (e.g. `create-website`) |
|---|---|---|
| Trigger logic | Quoted phrases + "Also trigger when…" + **sibling routing** ("For memorable messaging, see made-to-stick", `storybrand-messaging/SKILL.md:3`). | Fixed 5-sentence description formula. Sentence 4 routes to sibling metaskills as negative triggers and must stay mutually consistent (`CLAUDE.md`, "Metaskill Format"; `create-website/SKILL.md:3`). |
| Prerequisites | None declared. Implicitly, copy to score. | **Intake on first run only**: 7 questions, each annotated with which phase it gates (`create-website/SKILL.md:44-56`). |
| State persistence | None. | **Durable tracker** `docs/<JOURNEY>-PLAN.md` with statuses `pending / in-progress / awaiting-evidence / done / deferred: reason / skipped: reason`, plus Key Decisions and Next Actions tables (`docs/ARTIFACT-REGISTRY.md:469-490`). "A journey with a tracker is resumed, never restarted" (`create-website/SKILL.md:35`). Shared UPPERCASE artifacts (`docs/POSITIONING.md`, `WEBSITE.md`, `DESIGN.md`…). Section headings are the **cross-journey contract**: extend under the exact headings and never rename `##` (`ARTIFACT-REGISTRY.md:7-11`). |
| Fixed vs latitude | Weak: framework rules ("customer is the hero") act as soft constraints. | Rule 8 per journey is a hard guardrail ("Every scarcity claim, testimonial, and guarantee… must be true", `create-website/SKILL.md:42`). Read-before-write: extend, don't overwrite others' sections (Rule 7). |
| Approval checkpoints | None. | Proceed/skip/defer at phase entry. **GATE phases may be deferred, never skipped** (Rule 3). "A decision made silently is a defect" (Rule 5). The draft artifact is shown for sign-off before writing (Rule 6). |
| Deterministic vs generative | All generative. | All generative. Determinism comes only from the templates. |
| Output contracts | Implicit: a score plus changes needed to reach 10/10. | Each phase has six fields: Purpose, Brief (fallback), Invoke, Decide with the user, Artifact (exact files + headings), Done when (`create-website/SKILL.md:58-…`). The exit checklist closes the journey (`:221-229`). |
| References/templates | 6 reference files (brand script worksheet, one-liners, wireframe, email sequences…), each linked **inline at the point of need** with a "when to read" clause (`:194, 214, 223-224`). Spec'd at 1500-3000 words each. | `references/artifact-templates.md` holds full skeletons for every file the journey creates (`CLAUDE.md`). |
| Evals/validation | **Reproducible scoring rule** tied to a Quick Diagnostic table: "1 point per satisfied row (7 rows) plus up to 3 points…", with explicit bands (`storybrand-messaging/SKILL.md:20`). The template requires a scoring rule that spans 0-10 ("Don't write '1 point per row' when there are fewer than 10 rows", `CLAUDE.md`). | No automated evals. Validation is **end-to-end smoke runs in scratch projects with every constituent skill treated as uninstalled** (commit `79bdb3a`), which found that the templates covered only 2 of 5-7 files. A testing policy bans tautological tests (`3a5623d`). |
| Tool/model availability | n/a | **Graceful degradation per phase**: if the named skill is missing, offer `npx skills add wondelai/skills/<slug> --global`; if the user declines, run the phase from its inline **Brief (fallback)**, "State which mode you are in" (Rule 4, `create-website/SKILL.md:38`). Optimization metaskills also ship `references/methods.md` so they can run standalone. |
| Chaining | Prose cross-links to siblings. | Explicit ordered Journey Map: Phase, Skill, Question, Artifact (`:20-31`). Phase outputs (e.g. the avatar and USP in MARKETING.md) are fed into the next phase's Invoke line. "Completing the Journey" routes forward to `improve-website` / `create-app` (`:231`). |

**Portability [code].** Mirrors are generated symlinks into five host dirs, `.agents/skills/` included. Plugin trees use **copies** because the Agent Plugins spec requires paths to resolve inside the plugin root. Frontmatter is spec-pure: version lives in `metadata.version` rather than top-level. Versions sync to GitHub releases (`.github/workflows/sync-marketplace-version.yml`).

### 2.4 RefoundAI / Lenny: `RefoundAI/lenny-skills` (named skill `engineering-culture`, STALE)

**Library shape [code].** v2 (`0db1f49`): 76 skills, each **exactly** `SKILL.md` + `references/artifacts.md` + `references/guest-insights.md`. The pipeline output is uniform (verified with `find`). Skills are grouped by how a product organization operates: strategy, planning, discovery, building, launch, growth, team and cadence, plus a career track (`README.md`, "What's new in 2.0"). Install is a plain copy into `.claude/skills/`. There is no CI, no manifest and no versioning. Last commit 2026-07-15.

| Dimension | v1 `engineering-culture` (STALE, `git show 0123453:skills/engineering-culture/SKILL.md`) | v2 successor `engineering-health` |
|---|---|---|
| Trigger logic | `Help users… Use when someone is improving developer experience…` | Description has **no "Use when" clause**: 0 of 76 v2 descriptions contain it (`grep`). This is a regression versus v1. |
| Prerequisites | none | none |
| State persistence | none | none |
| Fixed vs latitude | none. Guidance only. | none |
| Approval checkpoints | none | none |
| Deterministic vs generative | generative advisory | generative advisory |
| Output contracts | none. A 4-step "How to Help" | same, plus "Templates & Frameworks" pointers (`skills/engineering-health/SKILL.md:12-17, 66-79`) |
| References/templates | `references/guest-insights.md` | `artifacts.md` (named frameworks with "How it works", e.g. Core 4) + `guest-insights.md` (per-source insight, tactical advice, timestamped source link) |
| Evals/validation | none | none. **README claims** "every quote verified verbatim" [claim], but the generated references hold **437 empty `**Insight:**` entries out of 4,019** and **12 leaked LLM refusals** ("The provided text does not contain…", across 10 files) (`grep` over `skills/*/references/guest-insights.md`). These are exactly the defects a structural lint would catch. |
| Tool/model availability | n/a | n/a |
| Chaining | "Related Skills" by display name, e.g. "Technical Roadmaps" (a skill that does not exist) | "Related Skills" by **display name, not slug** ("Writing Prds", `engineering-health/SKILL.md:101-106`). These names cannot be resolved mechanically. |

**What is worth borrowing.**
- Source attribution and quote provenance per principle: guest name + quote + timestamped URL.
- "Diagnostic questions" and "Common Mistakes to Flag" as first-class sections.
- A catalog organized around how an organization actually runs.

**What is not worth borrowing.** A generation pipeline with no output validation. Section 3 has more.

### 2.5 Trail of Bits: `trailofbits/skills` (named skill `interpreting-culture-index`)

**Library shape [code].** 44 plugins at `plugins/<plugin>/{.claude-plugin/plugin.json, skills/, agents/, commands/, hooks/, workflows/*.js, evals/, tests/}` (`AGENTS.md`, "Plugin Structure"). A single canonical `.claude-plugin/marketplace.json` serves Claude Code, Codex and ChatGPT. **Sidecars are banned**: no `.agents/`, `.codex/`, `.opencode/` or `.codex-plugin/`, and the validator enforces this after the earlier set drifted (#173). Real **loadability checks run in CI under both the Claude Code and Codex CLIs** (`.github/scripts/check_{claude,codex}_loadability.py`). The repo is active: last commit 2026-09-28.

| Dimension | `interpreting-culture-index` |
|---|---|
| Trigger logic | A third-person capability description. A "Use when…" clause was **added on 2026-09-28** (commit `ed01a6b`), which shows that even mature repos fix triggering late. `## When to Use` / `## When NOT to Use` excludes other assessments (DISC, MBTI…), clinical use, and use as the sole hiring basis (`SKILL.md:62-77`). |
| Prerequisites | Input-format gate: use JSON if it exists, else run PDF → `extract_pdf.py --verify`. "If uv is not installed: Stop… Do NOT fall back to vision" (`SKILL.md:117-130`). `scripts/check_deps.py` is a PEP 723 script with exit-code semantics. |
| State persistence | Extracted JSON is written next to the PDF and reused next time ("Check same directory as PDF for matching `.json`", `:115, 142-143`). |
| Fixed vs latitude | `<essential_principles>` hold the non-negotiables (`:7-60`). **Never compare absolute trait values between people; interpret distance from the per-survey baseline (the "arrow")** (`:11-22`). There is a documented exception: L and I are absolute (`:50-57`). Thresholds are fixed numbers (EU utilization 70-130% healthy, `:293-300`). |
| Approval checkpoints | None formal. Step 2 menu: the user picks 1 of 11 tasks (`:158-177`). "Visually confirm the verification summary matches the PDF" (`:127`). |
| Deterministic vs generative | **Deterministic extraction**: OpenCV PDF chart reader with a pydantic model (`scripts/culture_index/{opencv_extractor,models}.py`). "NEVER use visual estimation… 20-30% error rate" (`:119`). Vision may only *sanity-check*. Formulas are given explicitly (`Utilization = Job EU / Survey EU × 100`). Interpretation is generative. |
| Output contracts | `templates/burnout-report.md`, `templates/predicted-profile.md` are fill-in tables. The verification report is "Interpretation complete" + 2-3 key findings + recommended actions (`:213-216`). `<success_criteria>` list (`:318-329`). |
| References/templates | 25 `references/` (traits, 17 archetype profiles, anti-patterns, motivators…). 11 `workflows/*.md` reached through a **routing table** from user words to a workflow file ("After reading the workflow, follow it exactly", `:181-199`). Each workflow starts with `<required_reading>` (`workflows/detect-burnout.md:1-7`). |
| Evals/validation | **`<verification_loop>` self-check after every interpretation**: relative positions used, arrow referenced, Survey vs Job compared, no value judgments, EU checked (`:203-218`). No `evals/` for this plugin (`ls plugins/culture-index`). **Repo-wide eval system** (for other plugins): `evals/<case>/case.yaml` (schema_version, prompt, fixture `add_dirs`, `allowed_tools`, `max_turns`, `runs: 3`, `expected_outcome`) + typed graders: **55 `llm`, 42 `regex`, 13 `tool_used`, 12 `file_exists`** (`grep '^type:'`). Negative-trigger cases are named `neg-*` (`plugins/property-based-testing/evals-extra/`). Case descriptions record **what the eval cannot measure** (`plugins/audit-context-building/evals/routes-to-workflow/case.yaml`). `make check` runs **validator self-tests and eval-harness self-tests first**, because "A checker that has silently stopped matching reports a clean repo forever" (`Makefile`, self-test target). |
| Tool/model availability | Hard-stop rather than degrade when the deterministic path fails ("If extraction fails: Report error, do NOT fall back to vision", `:149`). `allowed-tools: Bash Read Grep Glob Write` (`:4`). |
| Chaining | None to other plugins. Internal chaining goes through routing → workflow → required_reading → template. In the wider repo, multi-step plans move into JS **dynamic workflows** at plugin root. "If a SKILL.md has 'Phase 1', 'for each finding', or 'repeat until'… the plan belongs in a script" (`AGENTS.md`, "Two different workflows/"). |

**Hard-won validator rules worth copying (`AGENTS.md`, "What the validator enforces") [code]:**
- An unquoted `: ` or ` #` in a top-level frontmatter value makes the YAML block unparseable, so the loader drops **every** field and the skill silently never triggers.
- Agents use `tools:` while skills use `allowed-tools:`. The wrong key is silently ignored, so restrictions vanish.
- The version must increase on every change, because clients only pull updates when the number goes up.
- No hardcoded `/Users/…` or `/home/…` paths.
- The README must name every invocable thing.
- `{baseDir}` is used for skill-relative paths (`AGENTS.md`, "Path Handling"). Note that Claude Code documents `${CLAUDE_SKILL_DIR}`. `{baseDir}` is a convention the model resolves, not a documented substitution, so portability is unverified.

---

## 3. Cross-cutting patterns

| # | Mechanism | Who does it (evidence) | Strength |
|---|---|---|---|
| P1 | **Description = trigger + boundary.** "Use when" phrases plus "NOT for / use X instead" naming siblings | Higgsfield (CI-enforced substrings), Rampstack (authoring rules + collision fixes), Wondel (sibling routing sentence), ToB (late fix `ed01a6b`), Anthropic skill-creator ("pushy", `SKILL.md:67`) | Universal. Missing in Lenny v2. |
| P2 | **Trigger testing.** Should/should-not query sets, train/test split | Anthropic skill-creator `run_loop.py:5`, `improve_description.py:72-77`; ToB `neg-*` cases; Rampstack static token-overlap audit | Only ToB and Anthropic run real model trigger evals |
| P3 | **Canonical source → generated host views** + drift guard | Rampstack `build-codex.mjs` (+ reversible sidecar, determinism check, CI byte-diff); Wondel `sync-ide-skills.sh` (symlinks) + `generate-plugins.sh` (copies) | Strong. ToB takes the opposite route: a single manifest that hosts read natively, with sidecars banned. |
| P4 | **Durable, file-based state with resume** | Higgsfield `brandkit/state.json` (revisions, script-only writes); Wondel `docs/*-PLAN.md` tracker; Rampstack `BRIEF.md`; ToB extracted JSON cache | Higgsfield's is the only one that is machine-checked |
| P5 | **Fixed vs proposed vs unknown, with an evidence label** | Higgsfield Brand Lock (`fixed/proposed/not_applicable/unknown` × `source-declared/measured/visually-observed/inferred`) | Unique and directly relevant to brand truth |
| P6 | **Rejection list / negative direction** | Rampstack brief rejection list; Higgsfield `forbidden treatments` / `avoid`; ToB "Rationalizations to Reject" for security skills (`AGENTS.md`) | Common |
| P7 | **Explicit human gates.** Silence is not approval. | Higgsfield ("Never infer approval from silence…"); Wondel GATE phases + sign-off before write; Rampstack write-held + human merge | Strong in the three workflow-heavy repos |
| P8 | **Honest stop / stated gap beats fabrication** | Rampstack (60 skills + all workflows, blocked propagates); Higgsfield ("disclose the limitation instead of claiming completion"); ToB (no vision fallback) | Strong. Lenny's leaked refusals show the opposite failure. |
| P9 | **Deterministic for exact or editable artifacts, generative for ideation** | Higgsfield (SVG/PPTX/HTML scripts vs image models; "Do not accept a vision model's statement as proof of exact hex"); ToB (OpenCV extraction vs vision) | Strong |
| P10 | **Relative-to-baseline interpretation** | ToB "distance from the arrow", L/I exception documented | Generalizes to creative evals as deltas vs brief/reference/approved |
| P11 | **Dependency-aware invalidation** | Higgsfield `required_slots` + revision pinning, so a palette change invalidates only dependents | Unique |
| P12 | **Graceful degradation per phase** | Wondel inline "Brief (fallback)" + "state which mode you are in"; Higgsfield stage-scoped prerequisites | Strong |
| P13 | **Chaining through explicit artifacts / return values** | Higgsfield (`reference_id`); Wondel (Journey Map + artifact headings as contract); Rampstack (`BRIEF.md` required reading) | Strong. Lenny's display-name links are the counter-example. |
| P14 | **Live catalog over memorized catalog** | Higgsfield "never invent model names; run `model list`"; presets are "live CMS data, never embed" | Directly relevant to the cstack model router |
| P15 | **Context budget rules** | Spec <500 lines; Rampstack <250 target / 500 cap; Higgsfield "300-line rule" with a decision test (keep only what changes the next decision); ToB warns >500 | Universal. Only Rampstack and ToB check it in CI. |
| P16 | **Validators that test themselves** | ToB `make self-test` + eval-harness `--self-test` before validate; Rampstack dist guard born from a silent 102/103 bug | ToB only. High value. |
| P17 | **Self-contained skill folders** (no `../`) | Higgsfield (CI-checked; duplicate shared docs rather than link) | Needed for per-skill install (`npx skills add owner/repo/skill`) |
| P18 | **Version discipline** | Higgsfield single VERSION across 12 places; ToB must-increase per plugin; Wondel `metadata.version` + release sync | Common |
| P19 | **Status ladder by evidence** | Rampstack `template → validated (public run record) → hardened` | Rare. Maps onto cstack `status` + `last_verified`. |
| P20 | **Evals record their own blind spots** | ToB `case.yaml` description states what the case cannot isolate | Rare. Supports eval integrity. |

**Anti-patterns observed.**
- Non-spec top-level frontmatter keys: Higgsfield `version`/`argument-hint` and Rampstack `category`/… in source. Both are portability hazards; Rampstack handles them in its build.
- Generated reference content with no lint (Lenny, P8 inverse).
- Install scripts that disagree with documented host paths (Higgsfield `setup:84-86`).
- Unenforced "verified" claims in a README (Lenny).

---

## 4. cstack implications

### 4.1 Borrow / don't borrow

| Mechanism | Borrow? | How in cstack |
|---|---|---|
| P1 trigger + boundary description | **Borrow** | T0 lint: description ≤1024 chars, contains a "Use when" clause and a "Not for"/"use X" clause naming a real slug (Higgsfield-style substring check, plus slug resolution). |
| P2 trigger evals | **Borrow** | `evals/<skill>/triggers.json` with ≥8 should and ≥8 should-not near-misses. T2 cheap-LLM tier, diff-aware. Use a train/test split when optimizing descriptions (skill-creator). |
| P3 canonical → generated views | **Borrow (Rampstack variant)** | `skills/` is the canonical source. `cstack setup` emits host views. A CI drift check rebuilds and byte-diffs. Spec-only frontmatter in emitted SKILL.md. Non-spec data lives in `skill.meta.json` from the start, so no sidecar is needed. |
| ToB "no sidecars" | **Partially** | Don't hand-maintain per-host copies. Generated host files (e.g. `agents/openai.yaml`) are fine when built from `skill.meta.json` and drift-checked. |
| P4/P11 durable state + dependency invalidation | **Borrow (Higgsfield model)** | All brand-state writes go through a script/CLI (`cstack state …`), never by hand-editing. Every approved slot carries a `revision`. Derived artifacts record `depends_on: {slot: revision}`. Changing a slot lists the invalidated artifacts. This maps to `state/approvals.jsonl` + `artifact-lineage.schema.json`. |
| P5 lock states × evidence labels | **Borrow verbatim as a schema concept** | `brand-system.schema.json` fields carry `lock: fixed\|proposed\|not_applicable\|unknown` and `evidence: source-declared\|measured\|visually-observed\|inferred`, plus `source` provenance. |
| P6 rejection list | **Borrow** | Every brief and direction artifact gets a required `rejections[]`. Feed it into anti libraries (§8). |
| P7 human gates | **Borrow** | `approval_gates[]` in skill.meta. A runtime rule says generation success or self-assessment never counts as approval. Logos and marks are never self-approved, even in autonomous mode. |
| P8 honest stop | **Borrow, put in the shared preamble once** | One canonical "missing-input behavior" block in `skills/cstack-shared/` rather than 60 copies (Rampstack copy-pastes). Blocked status propagates through workflows. |
| P9 deterministic vs generative | **Borrow** | Editable or exact deliverables (SVG, PPTX, HTML, palette swatches, type specimens) are built by scripts. Never accept VLM claims for hex, fonts or spacing; measure them. |
| P10 baseline-relative evaluation | **Borrow, generalized** | Eval outputs report deltas vs brief, reference and last approved version, not absolute 0-10 alone. A skill must document any metric that is legitimately absolute (the ToB L/I exception pattern). |
| P12 per-phase fallback | **Borrow** | Each workflow phase has an inline minimal method used when its skill or provider is missing, and must announce the mode. |
| P13 artifact contracts | **Borrow** | Workflow phases declare `input artifacts` → `output artifact (exact path + headings or schema)`. Prefer JSON schemas over Markdown headings where cstack has them. |
| P14 live catalogs | **Borrow** | The model router reads `registry/models.json` plus live provider listings. Skills never hardcode model names in the body. |
| P15/P16 budgets + self-testing validators | **Borrow** | The context-budget ratchet. The validator ships `--self-test` fixtures, with one bad skill per rule, run before `validate`. |
| P17 self-contained folders | **Borrow with care** | ⚠ The current `scripts/lib/hosts.mjs` installs a sibling `cstack-shared/` dir next to the skills. Skills that `../cstack-shared` break under per-skill installers (`npx skills add …/<skill>`) and under Codex/agents scanners that treat every dir as a candidate skill. Either inline the shared preamble at build time (generated view) or make `cstack-shared` a valid skill itself with `user-invocable: false` semantics. |
| P19 evidence status ladder | **Borrow** | `status: stub → beta → stable` requires a linked run record or eval result for promotion. Reuse `last_verified`. |
| Lenny source-backed frameworks | **Borrow the provenance shape, not the pipeline** | Canon references (`references/canon/`) carry author, source URL, timestamp and a short quote (<25 words). Lint for empty or refusal-shaped entries. |
| Wondel scoring formula | **Borrow** | Diagnostic-table scoring with a reproducible rule that spans the full range. Score bands are documented. |
| ToB eval case format | **Borrow** | `case.yaml` + typed graders (`regex`, `file_exists`, `tool_used`, `llm`), `runs: N`, and a description field that states what the case cannot measure. Matches T1/T2 tiers. |
| Higgsfield private "Design Brain" prompt enhancer behind a backend | **Don't borrow** | cstack is open. Prompt recipes are compiled, versioned and testable in-repo. |
| Non-spec top-level frontmatter | **Don't** | Keep extras in `skill.meta.json` or `metadata`. |

### 4.2 Recommended SKILL.md frontmatter (canonical source, spec-pure)

```yaml
---
name: product-photoshoot              # = folder name, [a-z0-9-], ≤64
description: "Plan and produce on-brand product packshots and lifestyle shots from an approved brand system and Shot DNA. Use when the user asks for product photos, a packshot, a hero image, or a product photoshoot, even if they only say 'make it look premium'. Not for logo or identity work (use create-brand) or unbranded one-off images (use generate-image)."
license: MIT
compatibility: "Requires node>=20 and the cstack CLI; provider keys optional (degrades to brief-only)."
metadata:
  cstack-version: "0.1.0"             # strings only (spec: string→string)
  cstack-meta: "skill.meta.json"
---
```

Rules:
- **Quote the description**, always. It routinely contains `: ` (ToB failure mode).
- Keep it ≤1024 chars (Codex drop) and front-load the trigger, because Claude truncates description + `when_to_use` at 1,536 chars and drops descriptions when the catalog overflows.
- Leave `allowed-tools` out of the canonical source. It is experimental, and its syntax differs per host. Emit it only in the Claude Code view, generated from `skill.meta.json.allowed_tools`.
- Leave out `disable-model-invocation`, `context: fork`, `paths` and similar. These are host-specific keys and also go only into generated host views.
- Body order follows the skill contract: WHEN TO USE / WHEN NOT TO USE / INPUTS / MISSING-INPUT BEHAVIOR (pointer to shared preamble) / SOURCE PRECEDENCE / TOOLS / PROCESS / DECISION RULES / OUTPUTS / FILES WRITTEN / STATE UPDATED / EVALS REQUIRED / HANDOFF / FAILURE MODES / EXAMPLES. Put must-hold rules in the **first ~5k tokens** (compaction re-attach budget).

### 4.3 Recommended `skill.meta.json`: diff against the existing `schemas/skill-meta.schema.json`

The existing schema already covers slug, type, triggers, not_for, required_inputs, outputs, reads, writes, compatible_hosts, providers, cost_class, context_class, mutating, destructive, handoff, evals, version, last_verified and status. I recommend adding these fields. The schema has `additionalProperties: false`, so they must go into the schema itself.

| Field | Type | Why (evidence) |
|---|---|---|
| `approval_gates` | `[{id, after_step, artifact, never_self_approve: bool}]` | Higgsfield hard stops; Wondel GATE (deferrable, not skippable) |
| `state_slots` | `{reads:[slot], writes:[slot]}` | Enables Higgsfield-style invalidation |
| `depends_on_slots` | `[slot]` | The `required_slots` analogue: which approved slots outputs pin |
| `lock_policy` | `{fixed_sources:[…], may_propose:[…]}` | Brand Lock fixed/proposed split |
| `deterministic_steps` / `generative_steps` | `[string]` | Makes P9 auditable |
| `fallback` | `{when_missing:[provider\|skill], mode: "brief-only"\|"degraded"\|"blocked"}` | Wondel fallback, Rampstack honest stop |
| `output_contract` | `{path, schema?: "$id", headings?: [..]}` | Wondel headings-as-contract; cstack has schemas |
| `allowed_tools` | `[string]` | Source for Claude `allowed-tools` view only |
| `host_overrides` | `{ "claude-code": {disable_model_invocation, context, agent, paths}, "codex": {allow_implicit_invocation, display_name, short_description}, "cursor": {paths} }` | Feeds generated views (Codex `agents/openai.yaml` needs non-empty `display_name` + `short_description`, ToB `AGENTS.md`) |
| `trigger_eval` | string path to `triggers.json` | P2 |
| `baseline` | `"brief"\|"reference"\|"last_approved"\|"absolute"` | P10. States what evals are relative to |
| `budget` | `{skill_md_tokens_max, refs_tokens_max}` | ratchet ceiling recorded per skill |

Example:

```json
{
  "slug": "product-photoshoot",
  "type": "composite",
  "summary": "On-brand packshots and lifestyle shots from brand system + Shot DNA",
  "triggers": ["product photo", "packshot", "hero image", "product photoshoot"],
  "not_for": ["create-brand", "generate-image"],
  "required_inputs": ["brand-system.json", "product reference images"],
  "outputs": ["shots/*.png", "shot-dna/*.json"],
  "reads": ["state/brand-system.json"],
  "writes": ["artifacts/photoshoot/", "state/approvals.jsonl"],
  "state_slots": { "reads": ["palette", "logo", "art_direction"], "writes": [] },
  "depends_on_slots": ["palette", "art_direction"],
  "approval_gates": [{ "id": "shot-plan", "after_step": "plan", "artifact": "shot-plan.md", "never_self_approve": false },
                     { "id": "finals", "after_step": "verify", "artifact": "shots/", "never_self_approve": true }],
  "deterministic_steps": ["crop/resize", "color measurement", "contact sheet"],
  "generative_steps": ["shot ideation", "image generation"],
  "fallback": { "when_missing": ["image-provider"], "mode": "brief-only" },
  "output_contract": { "path": "artifacts/photoshoot/manifest.json", "schema": "https://cstack.dev/schemas/artifact-lineage.schema.json" },
  "baseline": "last_approved",
  "compatible_hosts": ["any"],
  "required_providers": [], "optional_providers": ["image-gen"],
  "cost_class": "medium", "context_class": "m",
  "mutating": true, "destructive": false,
  "handoff": ["paid-social", "landing-page"],
  "evals": ["evals/product-photoshoot/case-*.yaml"],
  "trigger_eval": "evals/product-photoshoot/triggers.json",
  "allowed_tools": ["Read", "Write", "Bash(cstack *)"],
  "host_overrides": { "codex": { "display_name": "Product Photoshoot", "short_description": "On-brand product imagery" } },
  "budget": { "skill_md_tokens_max": 3500, "refs_tokens_max": 12000 },
  "version": "0.1.0", "last_verified": null, "status": "stub"
}
```

### 4.4 Install paths per host (proposed `registry/hosts.json` data for the existing `hosts.mjs`)

| id | `project_dir` | `user_dir` | Generated extras | Notes |
|---|---|---|---|---|
| `agents` (portable default) | `.agents/skills` | `.agents/skills` | none | Read natively by Codex, Cursor, Gemini CLI, OpenCode. **Install here first.** |
| `claude-code` | `.claude/skills` | `.claude/skills` | Claude-only frontmatter (`allowed-tools`, `disable-model-invocation`, `context`) from `host_overrides`; optional `.claude-plugin/` marketplace for `/plugin install` | Claude Code does not document `.agents/skills`. Plugin skills are namespaced `/cstack:<skill>`. |
| `codex` | `.agents/skills` | `.agents/skills` (`$HOME/.agents/skills`) | `<skill>/agents/openai.yaml` (`interface.display_name`, `short_description`, `policy.allow_implicit_invocation`) | Codex also reads `.claude-plugin/marketplace.json`. Enforce ≤1024-char descriptions. |
| `cursor` | `.agents/skills` (or `.cursor/skills`) | `.cursor/skills` | none required | Also reads `.claude/skills` for compatibility. Avoid installing to both, to prevent duplicates. |
| `gemini-cli` | `.agents/skills` (alias beats `.gemini/skills`) | `.gemini/skills` or `.agents/skills` | none | Activation prompts for user consent. Keep descriptions honest about what dirs the skill touches. |
| `opencode` | `.agents/skills` (or `.opencode/skills`) | `.config/opencode/skills` | optional `opencode.json` permission globs | Enforces the name regex and name = dir. |

Notes for implementation:
- Writing one `.agents/skills/` view and one `.claude/skills/` view covers all five hosts. Installing into several compatible dirs at the same scope can produce duplicate or shadowed entries, because Cursor and OpenCode scan `.claude/skills` too. Default to `agents` + `claude-code` only, and make everything else opt-in.
- Use symlinks for in-repo dev, as Wondel does, and copies for plugins and distribution, as Wondel and Agent Plugins do, because paths must resolve inside the root. The existing `--copy` flag fits this.
- Add a CI **loadability check** per host where a CLI is available (ToB pattern) and a **dist drift check** (Rampstack pattern).
- Never overwrite a non-cstack skill dir. The current `hosts.mjs` already skips these, which is correct.
