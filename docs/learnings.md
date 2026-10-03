# Learnings

Work in cstack should compound instead of vanishing into chat history. Failures, owner corrections, provider quirks and experiment results become **events**. Repeated evidence becomes **rules**, and every rule keeps its provenance and an expiry where one applies.

All of this lives in the brand workspace. Brand-specific learnings stay in the brand's repo. Only anonymized, general mechanisms are proposed upstream as cstack changes.

## Failure taxonomy

A failure is recorded with a `type` from `schemas/common.schema.json → failure_type`:

| Group | Types |
|---|---|
| Brand and product | `brand_drift`, `product_drift`, `beautiful_but_wrong`, `campaign_incoherence` |
| Image craft | `generic_ai`, `visual_cliche`, `overpolished`, `underartdirected`, `bad_hands`, `anatomy`, `material_failure`, `lighting_incoherence`, `unintended_reframe` |
| Type, layout, message | `type_failure`, `layout_failure`, `message_failure`, `cro_failure` |
| References and culture | `reference_overcopy`, `moodboard_mimicry`, `reference_monoculture`, `wrong_cultural_register`, `taste_without_reality`, `canon_ossification` |
| Risk | `claim_risk`, `compliance_failure`, `secret_leak` |
| Process | `adjective_prompting`, `option_addiction`, `context_dumping`, `retired_rule_resurfaced`, `self_certified`, `provider_failure` |
| Other | `other` |

```bash
cat > fail.json <<'EOF'
{ "type": "product_drift", "artifact_ref": "work/out/cup-hero/cup-hero_1.png", "task": "generate-media",
  "diagnosis": "handle redrawn as a loop; the real cup has a pulled strap handle",
  "repair": "composite the official product cut-out", "repair_worked": null }
EOF
cstack failure --file fail.json      # appended FAIL-20261003-xxxxxx to state/failures.jsonl
```

Set `repair_worked` once you know whether the repair worked. Retros count failure types and repair success.

## learn add, candidates, promote

**Add** a learning event (schema `learning-event`), appended to `state/learnings.jsonl`:

```json
{ "kind": "human_edit",
  "statement": "Owner prefers visible throwing rings over a machine-smooth glaze surface.",
  "scope": "brand_specific", "confidence": "high",
  "evidence": [{ "kind": "user_instruction", "ref": "state/feedback.jsonl#FB-20261003-29bb23", "by": "owner" }],
  "should_become": "anti_example", "tags": ["topic:surface-finish"] }
```

```bash
cstack learn add --file event.json
```

- `kind`: `observation`, `failure`, `approval`, `model_quirk`, `performance`, `human_edit`, `candidate` (plus `promoted` and `retired`, which the CLI and `/learn` write).
- `scope`: `durable`, `brand_specific`, `campaign_specific`, `model_specific`, `tool_specific`.
- `evidence` items are source refs (`{kind, ref, ...}`), the same shape as brand field sources.
- A `topic:<name>` tag groups related events. Without one, events are grouped by their normalized statement.

**Candidates** are learnings ready for promotion:

```bash
cstack learn candidates
```

A group qualifies with **repeated evidence** (2 or more events) or a **strong human correction** (`human_edit` or `approval` at `confidence: high`). Groups already promoted or retired drop out. Each candidate shows its evidence ids, count, reason, scopes, `should_become`, and `needs_expiry` (true when a model, tool or campaign scope has no `expires`).

**Promote** one with an approver:

```bash
cstack learn promote LE-20261003-b105e6 --to references/anti/ --by owner
# promoted LE-... → references/anti/ as LP-.... Now write the rule into references/anti/ with provenance (LP-...).
```

- `model_specific`, `tool_specific` and `campaign_specific` learnings are refused without `expires`. Model and tool facts go stale, and the default review is 60 days.
- Promotion appends a `promoted` event (`replaces`, `target`, `approved_by`). Writing the rule into the target, citing the `LP-...` id, is the `/learn` skill's job.
- Taste rules are never self-promoted. With the owner unavailable, a learning stays a candidate.

## Promotion targets

`should_become` says what a learning wants to be. `--to` says where it goes. Encode at the lowest reliable level: **token > rule > reference > rubric > canon > learning**.

| `should_become` | Typical `--to` target |
|---|---|
| `principle` | workspace `docs/learnings.md` (promoted rules with provenance) |
| `skill_rule` | `brand/rules/brand-rules.yaml`; a cstack skill only for global, brand-agnostic lessons |
| `provider_note` | a model's `notes` / `known_weaknesses` in `registry/models.json` (dated), or an entity's `model_notes` in `brand/brand-world.json` (with expiry) |
| `eval` / `fixture` | `evals/fixtures/<case>.yaml` |
| `anti_example` | `references/anti/` with `why_it_fails` |
| `archive_only` | stays in `state/learnings.jsonl` |

A canon entry (`canon/*.canon-entry.yaml`) is a valid target for a durable mental model. Retiring a rule (`kind: retired`) means removing it from templates and recipes too. Otherwise it resurfaces (`retired_rule_resurfaced`, fixture `retired-rule-in-template`).

## Do Not Relearn

Each weekly or milestone retro (`/learn retro`, written to `work/retro/<date>.md`) ends by updating a **Do Not Relearn** list: expensive lessons already paid for once. Each one should be enforced in code or written into a skill rule, so nobody has to remember it.

cstack started with this list, distilled from an earlier real brand project (anonymized in [research/local-learning-migration.md](research/local-learning-migration.md)):

1. A passing AI judge is not owner approval.
2. The author never judges their own work. No separate judge means not shippable.
3. Never total the judgment layers; `n/a` is not 0.
4. Never trust model-drawn product print, and never trust an integration pass to keep it.
5. Check product masters for alpha before compositing.
6. Compile prompts from current rules. Job templates outlive rule changes.
7. Do not "fix to spec" frames the owner liked. Fix locally and keep the before file.
8. Count limbs at full size on every frame.
9. Never name a real brand or photographer in a prompt; transfer the mechanism.
10. Fetch timeouts still bill: retry the fetch, never resubmit. The listed price is not the real price.
11. Measure real product dimensions. Inferred sizes spread errors.
12. Compose for type in the shot brief. Do not darken the owner's photograph to fit copy.
13. A gate must name a checker that exists.
14. The sidecar is evidence, not trust.
15. Preferences are pairwise records, not pick lists. A loop exists only after its first record.
16. No absolute home paths, case-exact references, CI on Linux.
17. Spend and permission limits are stops, not detours.
18. Keep binaries out of git history.

A brand's own list lives in its workspace and grows from its retros.

## Experiments and autoresearch

When a learning needs testing rather than belief, `/creative-autoresearch` runs a bounded keep/discard loop, in the spirit of Karpathy's autoresearch. Code enforces what prompts cannot:

```bash
cstack experiment init exp-cup-light --surface prompt.slot.lighting --spend 2 --max 8
#   also: --fixture, --baseline, --minutes, --currency
cstack experiment log exp-cup-light --file row.json
cstack experiment status exp-cup-light
```

`init` scaffolds `experiments/runs/<id>/experiment-run.yaml` (one mutable surface; frozen fixture, evaluator, model, reference set and crop; guardrails; budgets; stop conditions) and a human-editable `program.md`. Edit both before the first row. Every row is appended to `experiments/results.tsv`:

```text
run_id timestamp hypothesis changed_variable baseline candidate provider model seed_or_index
cost latency primary_score guardrails human_pref decision notes
```

`experiment log` enforces:

- `decision` is `keep`, `discard` or `baseline`.
- One variable per run: `changed_variable` must equal the run's `mutable_surface`.
- A candidate whose `guardrails` mention a failure cannot be kept.
- The incumbent changes only on `keep`.
- A stopped run refuses new rows. It stops when the spend budget is reached, at `max_experiments`, or after **4 consecutive discards** (gains have flattened, so keep the incumbent).

The skill also stops on evaluator uncertainty larger than the apparent gain, repeated crashes, or a human interrupt. Those stops are judgment, not code. Keeping the incumbent is a valid result. If the agent keeps making the same bad move, fix `program.md` or the recipe, not the outputs. Durable findings go back through `cstack learn add` with a model or recipe scope and an expiry.
