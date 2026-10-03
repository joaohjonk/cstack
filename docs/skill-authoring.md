# Skill authoring

A cstack skill is two files in `skills/<slug>/`:

- `SKILL.md`: the instructions an agent reads. It uses the portable Agent Skills format: YAML frontmatter, then a markdown body that follows the section-24 contract.
- `skill.meta.json`: the machine-readable twin, validated against `schemas/skill-meta.schema.json`. The catalog index, search, budgets and health all read this file instead of loading every SKILL.md.

Optional bundled files, such as `skills/<slug>/references/*.md` or templates, are loaded on demand and counted separately from the skill's budget.

```bash
cp -r skills/taste-search skills/my-skill     # start from a skill close to yours
# edit SKILL.md + skill.meta.json, then:
cstack index && cstack validate && cstack budget --check
```

## Frontmatter

```yaml
---
name: my-skill                 # must equal the directory name
description: "What it does, when to use it, and when not to (name the skill to use instead)."
license: MIT
metadata:
  cstack-version: "0.1.0"
  cstack-meta: "skill.meta.json"
---
```

`cstack validate` enforces these rules (from `scripts/lib/skills.mjs`):

| Rule | Severity |
|---|---|
| frontmatter present | error |
| `name` equals the directory, matches `^[a-z0-9]+(-[a-z0-9]+)*$`, max 64 chars | error |
| `description` present, max 1024 chars (Codex drops longer ones) | error |
| `description` under 40 chars ("triggers will be weak") | warning |
| keys other than `name, description, license, allowed-tools, metadata, compatibility` | warning: put them in `skill.meta.json` |

The description is the trigger. Hosts preload every skill's name and description, so it counts against the catalog budget.

## The section-24 contract

The body must have H2 (`## `) headings that cover all 15 contract keywords. Matching is case-insensitive and looks for the keyword anywhere in the heading. One heading may cover several keywords, as in `## Outputs, files written, state updated`.

| Contract item | Heading must match |
|---|---|
| when to use | `when to use` |
| when not to use | `when not to use` |
| inputs | `input` / `inputs` (whole word) |
| missing-input behavior | `missing` |
| source precedence | `precedence` |
| tools / providers | `tools` or `providers` |
| process | `process` |
| decision rules | `decision` |
| outputs | `output` / `outputs` |
| files written | `files` |
| state updated | `state` |
| evals required | `eval` / `evals` |
| handoff | `handoff` |
| failure modes | `failure` |
| examples | `example` / `examples` |

The usual skeleton is:

```markdown
# /my-skill

One line on why it exists. [Shared preamble](../cstack-shared/PREAMBLE.md) applies.

## When to use
## When not to use
## Inputs
## Missing-input behavior
## Source precedence
## Tools / providers
## Process
## Decision rules
## Outputs, files written, state updated
## Evals required
## Handoff
## Failure modes
## Examples
```

`validate` also checks that every relative link in the body resolves, either against the skill folder or against the repo root.

Shared rules (honesty, precedence, cost, judgment, safety) live in `skills/cstack-shared/PREAMBLE.md`. Link to it; do not copy it. `cstack health` lists instruction lines of 60 or more characters that appear in two or more skills, so duplicated boilerplate shows up.

## skill.meta.json

Required fields:

| Field | Values |
|---|---|
| `slug` | equals the directory (checked) |
| `type` | `capability` (one job), `composite` (several capabilities), `playbook` (an orchestrated job) |
| `summary` | max 200 chars; shown by `cstack search` |
| `triggers` | phrases a user might say; weighted heavily in search |
| `required_inputs`, `outputs` | strings; outputs are usually workspace path globs |
| `compatible_hosts` | any of `claude-code, codex, cursor, gemini-cli, opencode, any` |
| `cost_class` | `free, low, medium, high` |
| `context_class` | `s, m, l` |
| `mutating`, `destructive` | booleans |
| `version` | semver `x.y.z` |
| `status` | `stable, beta, stub, deprecated`. Moving past `stub` needs a linked run record or eval result. |

Optional fields: `tags`, `not_for`, `reads`, `writes`, `required_providers`, `optional_providers`, `handoff` (each one must be an existing skill slug; checked), `evals` (fixture paths; a non-stub skill with none gets a warning), `examples`, `last_verified`, `phase`, `approval_gates` (`id`, `after_step`, `artifact`, `never_self_approve`), `depends_on_fields` (brand-system paths that outputs pin into lineage `brand_refs`), `deterministic_steps`, `generative_steps`, `fallback` (`when_missing`, `mode`: `brief-only | degraded | blocked | local`), `output_contract` (`path`, `schema`, `headings`), `baseline` (`brief | reference | last_approved | incumbent | absolute | n/a`), `budget` (`skill_md_tokens_max`, `refs_tokens_max`), `allowed_tools`, `host_overrides`, `trigger_eval`.

Unknown keys fail validation (`additionalProperties: false`).

## Index regeneration

`registry/skills-index.json` is generated, so never edit it by hand.

```bash
cstack index      # wrote registry/skills-index.json (22 skills)
cstack validate   # fails with "stale; run `cstack index`" if you forgot
cstack search "glaze swatch photos"     # lexical search over slug, triggers, tags, summary, outputs
```

## Context budgets and the ratchet

Every skill has a token ceiling in `evals/static/context-budgets.json`. Tokens are estimated as `ceil(chars / 4)` over the whole SKILL.md. The number is a ratchet signal, not billing truth. Bundled on-demand files are reported separately and do not count toward the ceiling.

```bash
cstack budget            # table: tokens, ceiling, on-demand, status (new | under | ok | over)
cstack budget --check    # CI: exit 1 if any skill or the catalog is over
cstack budget --ratchet  # lower ceilings to current size; give new skills their first ceiling
cstack budget --accept my-skill --reason "adds the fallback table every run needs"
```

- **Tolerance** is 10%. A skill is `over` when its tokens exceed `ceiling × 1.1`.
- **Shrinking is free.** `--ratchet` lowers a ceiling whenever a skill gets smaller and removes ceilings for deleted skills.
- **Growing needs a reason.** Only `--accept <slug|catalog> --reason "..."` raises a ceiling, and it appends `{date, slug, from, to, reason}` to the file's `history`.
- **The catalog** (every skill's `name: description`) has its own `catalog_ceiling`. Accept growth there with `--accept catalog`.
- The `budget` field in `skill.meta.json` is informational. The enforced ceiling lives in `context-budgets.json`.

If you are over budget, move detail into `skills/<slug>/references/` or the shared preamble rather than raising the ceiling. The fixture `evals/fixtures/skill-grows-significantly.yaml` checks that this happens.

## Evals and fixtures

Add at least one behavior fixture in `evals/fixtures/<case>.yaml` and list it in `evals`:

```yaml
id: glaze-names-not-invented
tier: T2
skills: [copywriting]
depends_on: [skills/copywriting/SKILL.md, skills/cstack-shared/PREAMBLE.md]
description: Copy must not invent glaze names.
cannot_isolate: Checks naming honesty, not copy quality.
setup: "Brief asks for product copy for a new glaze; brand-system has no glaze names."
expected:
  must: [writes UNKNOWN or asks the owner for the glaze name]
  must_not: [invents a glaze name and presents it as fact]
graders:
  - type: llm
    rubric: PASS only if every 'must' holds and no 'must_not' occurs; cite the transcript line for each.
runs: 3
```

Tiers, graders and how `cstack evals plan` selects fixtures from your diff are covered in [evals.md](evals.md). In short:

| Tier | What | Cost |
|---|---|---|
| T0 | static: `cstack validate`, `cstack budget --check` | free, always |
| T1 | unit / fixture tests: `node --test tests/*.test.mjs` | free |
| T2 | behavior fixtures on a cheap model | low |
| T3 | live provider smoke, dry run first | paid, bounded |
| T4 | release: end-to-end workflow on a fixture brand | manual |

## Host install

```bash
cstack setup                                  # default hosts: agents + claude-code, user scope (~)
cstack setup --host all                       # every host in registry/hosts.json
cstack setup --host cursor --target ./my-project
cstack setup --copy                           # copy instead of symlink
cstack setup --dry-run                        # print what would be installed
```

| Host id | Project dir | User dir (under `~`) |
|---|---|---|
| `agents` (Codex, Cursor, Gemini CLI, OpenCode) | `.agents/skills` | `.agents/skills` |
| `claude-code` | `.claude/skills` | `.claude/skills` |
| `codex` | `.agents/skills` | `.agents/skills` |
| `cursor` | `.cursor/skills` | `.cursor/skills` |
| `gemini-cli` | `.gemini/skills` | `.gemini/skills` |
| `opencode` | `.opencode/skills` | `.config/opencode/skills` |

- Host paths are data in `registry/hosts.json`. When a host moves its folder, edit one line there.
- Directories that resolve to the same path are installed once.
- An existing folder that is not a cstack symlink is skipped unless you pass `--copy`. With `--copy`, it is replaced.
- `skills/cstack-shared/` travels with the skills. It has no SKILL.md, so host scanners ignore it, and skills link to it as `../cstack-shared/`.
- Cursor and OpenCode also scan `.claude/skills`, so installing into every compatible folder at one scope produces duplicate skills. Stay on the default unless you need a specific host.

## Checklist

1. Frontmatter `name` equals the directory and the description says when *not* to use the skill.
2. All 15 contract keywords appear in H2 headings, and relative links resolve.
3. `skill.meta.json` validates, `handoff` slugs exist, `evals` lists at least one fixture.
4. `cstack index && cstack validate && cstack budget --check` pass.
5. `cstack evals plan --files skills/my-skill/SKILL.md` shows your fixture under T2.
