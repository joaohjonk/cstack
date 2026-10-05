---
name: cstack-update
description: "Update cstack itself to the latest version: check the remote, fast-forward the checkout, reinstall dependencies if they changed, relink the skills into every agent host it was installed in, and say what is new. Also answers the start-of-session update check (ask, update, snooze or turn checks off). Use when asked to update or upgrade cstack, get the latest cstack, or when a skill's update check prints UPDATE_AVAILABLE. Not for updating gstack (use /gstack-upgrade) or a brand workspace."
license: MIT
---

# /cstack-update

Keep cstack current without losing anyone's work. The update only fast-forwards: it never stashes, resets or discards files.

## When to use

- The owner asks to update, upgrade or "get the latest" cstack.
- A skill's start-of-run check (preamble section 0) printed `UPDATE_AVAILABLE` or `JUST_UPDATED`.

## When not to use

- Updating gstack: `/gstack-upgrade`. Updating models or providers: `model-router`.
- Changing a brand workspace: that is brand work, not an install.

## Inputs

The cstack checkout (where `bin/cstack.mjs` lives). Find it once per run:

```bash
CSTACK_DIR="${CSTACK_DIR:-$(cat ~/.cstack/checkout 2>/dev/null)}"
[ -f "$CSTACK_DIR/bin/cstack.mjs" ] || CSTACK_DIR="$HOME/cstack"
node "$CSTACK_DIR/bin/cstack.mjs" update --check --force
```

`cstack` below means `node "$CSTACK_DIR/bin/cstack.mjs"` when the alias is not set.

## Missing-input behavior

- No checkout found, or `CHECK_FAILED ... not a git checkout`: say so and give the install line from the README (`git clone ... ~/cstack && cd ~/cstack && ./setup`). Never clone over an existing folder.
- `CHECK_FAILED` for a network or access reason: show the line; never report "up to date".

## Source precedence

The owner's answer > `~/.cstack/config.json` (`auto_update`, `update_check`) > the default (ask).

## Tools / providers

`cstack update --check [--force]`, `cstack update [--dry-run]`, `cstack update --snooze`, `cstack update --auto on|off`, `cstack update --checks on|off`, `cstack setup --refresh`. Git and npm only; no paid calls, no keys.

## Process

1. **Check.** Run the block in Inputs. The line decides the rest:
   - `UP_TO_DATE <version>`: say "cstack is up to date (version)" and stop.
   - `UPDATE_AVAILABLE <local> <remote>` ending in `auto`: go to step 2 without asking.
   - `UPDATE_AVAILABLE <local> <remote>`: ask once, with four options: **Update now**, **Always keep me up to date** (`cstack update --auto on`, then update), **Not now** (`cstack update --snooze`; reminders wait 24 hours, then 48, then a week), **Never ask again** (`cstack update --checks off`; `--checks on` turns them back).
   - `JUST_UPDATED <old> <new>`: say "cstack was updated (old → new)" in one line and continue.
2. **Update.** `cstack update`. It fetches, fast-forwards, runs `npm ci` only when `package-lock.json` changed, relinks every host this checkout was installed into (recorded by `cstack setup` in `~/.cstack/installs.json`, plus any home host folder holding cstack's links) and prints what is new.
3. **Stopped?** Relay the reason and its list exactly. Dirty files or local commits are the owner's: never run `git stash`, `git reset`, `git checkout --` or a fresh clone to get past them.
4. **Report.** Summarise "What is new" in three to seven plain bullets, then continue with the skill the owner was running.

## Decision rules

- Ask before updating unless `auto` is on or the owner asked for the update.
- One reminder per session; "Not now" is final for the session.
- A host that still shows the old skills after an update needs a new session, not a reinstall.

## Outputs, files written, state updated

- The checkout itself (fast-forward), `node_modules/` when the lockfile changed, the skill links in each host folder.
- `~/.cstack/`: `last-update-check.json` (cache), `update-snoozed.json`, `just-updated.json`, `config.json`. Nothing in any brand workspace.

## Evals required

- T1: `tests/update.test.mjs` (check, snooze, fast-forward, refusal on dirty files and local commits, relink, what is new).

## Handoff

None. Return to the skill the owner was running.

## Failure modes

- Reporting "up to date" when the check failed.
- Getting past a stopped update by discarding the owner's changes.
- Updating gstack's checkout instead: cstack's lives where `~/.cstack/checkout` points, normally `~/cstack`.

## Examples

```text
UPDATE_AVAILABLE 0.1.0@74b41d9 3c1e0aa
Claude: cstack has an update (74b41d9 → 3c1e0aa). Update now, always keep me
        up to date, not now, or never ask again?
You:    Update now.
Claude: Updated, 6 commits. New: cstack update and /cstack-update; ./setup auto
        also installs for Copilot CLI, Factory and Kiro when they are on this machine.
```
