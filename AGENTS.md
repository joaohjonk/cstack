# AGENTS.md

Instructions for any coding or creative agent working **on cstack itself** (Claude Code, Codex, Cursor, Gemini CLI, OpenCode). For using cstack on a brand, the skills and `skills/cstack-shared/PREAMBLE.md` are the instructions.

## What this repo is

A brand-agnostic toolkit: skills (`skills/`), a Node CLI (`bin/cstack.mjs`, libs in `scripts/lib/`), provider adapters (`providers/`), JSON schemas (`schemas/`), registries (`registry/`), canon (`canon/`), workflows (`workflows/`), eval fixtures (`evals/fixtures/`), and a starter brand workspace (`templates/brand-workspace/`).

## Non-negotiables

1. **No brand data in cstack.** cstack serves many brands and holds none of them. Never add a real brand's name, assets, facts, prompts, IDs, file paths or private context. Lessons learned on a real brand enter only as anonymized general rules; examples use fictional brands (`examples/tessel-kiln`). Private notes go in gitignored paths (`private/`, `docs/research/private-*.md`) or outside the repo. Maintainers keep an untracked `private/brand-denylist.txt` (one case-insensitive regex per line, or point `CSTACK_BRAND_DENYLIST` at a file); `cstack validate` fails if any tracked file, docs included, matches.
2. **No secrets.** Credentials come from environment variables by name. Never commit keys, tokens, cookies or `.env` files. Persist provider job IDs, never credentials.
3. **No silent spend.** Paid provider calls only through `guardedCall` / `cstack generate`; tests use the mock provider. Ask before spending beyond small validation tests.
4. **Ask first** before deleting user files, installing system software, publishing externally or sending messages.
5. **Third-party code keeps its license.** Code derived from another project carries a header naming its source and is listed in `NOTICE.md` with the license text in `licenses/`.

## Before you commit

```bash
npm run check                 # validate + budget --check + tests
node bin/cstack.mjs evals plan --since main
```

- Changed a skill: keep the contract headings `cstack validate` requires, update `skill.meta.json`, run `cstack index`, stay inside the budget (`cstack budget --check`; raise it only with `cstack budget --accept <slug> --reason "..."`).
- Changed a schema: edit `schemas/*.json` directly. Every object sets `additionalProperties`, normally `false` (`tests/schemas.test.mjs` checks).
- Changed models: edit `registry/models.seed.json` and run `node scripts/dev/seed_models.mjs`; every entry needs a dated source.
- New command: add it to `COMMANDS` in `bin/cstack-main.mjs` so `cstack help` stays complete, and document it.
- Never document a command or flag that does not exist.

## Style

- Node 20 ESM, no build step, few dependencies (`ajv`, `ajv-formats`, `yaml`; `playwright-core` optional).
- Deterministic code before model calls. Pure functions in `scripts/lib/`, thin CLI.
- Skill prose is short, imperative and concrete. No name-dropping without an operational rule.
- Docs lead with the answer; examples are runnable.
