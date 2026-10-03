# Provenance

Every brand fact in cstack records where it came from, how sure anyone is, whether a human approved it, and what was made from it. When nobody knows a fact, the field says `UNKNOWN`.

## Field-level provenance

`brand/brand-system.json` holds named sections (`voice`, `color`, `photography`, `claims`, ... about 50 in the template). Each key in a section is a **Field** (`schemas/common.schema.json#/$defs/field`):

```json
"voice": {
  "tone": {
    "value": "Warm, plain-spoken, workshop-first. Short sentences.",
    "sources": [{ "kind": "user_instruction", "ref": "assets/official/owner-interview-2026-09-14.md#voice",
                  "quote": "We talk like we're in the studio, not a gallery.", "captured_at": "2026-09-14", "by": "owner" }],
    "confidence": "high",
    "approval": "current",
    "permanence": "core",
    "input_class": "HARD_CONSTRAINT",
    "last_updated": "2026-10-03"
  }
}
```

| Property | Meaning |
|---|---|
| `value` | anything; `UNKNOWN` or `null` when there is no source |
| `sources[]` | `{kind, ref, quote?, captured_at?, by?}`. `ref` is a file path (with `:line` or `#anchor`), a URL, a decision id or a provider job id. |
| `confidence` | `high` (verified against a primary source or an explicit human statement), `medium` (consistent evidence, unconfirmed), `low` (one weak signal or a model inference) |
| `approval` | lifecycle status (below) |
| `permanence` | `core`, `seasonal`, `campaign`, `experimental`. `campaign` and `experimental` need `expires`. |
| `input_class` | `FACT`, `HARD_CONSTRAINT`, `SOFT_CONSTRAINT`, `CAMPAIGN_DIRECTION`, `REFERENCE_MECHANISM`, `OPEN_CREATIVE_SPACE`, `UNKNOWN` |
| `scope`, `expires`, `superseded_by`, `notes` | campaign scoping, review date or condition, replacement, free text |

`cstack brand check` fails any field with no source ("write UNKNOWN instead of inventing"). It warns when a `conflict` or `unknown` field carries a value without notes, when a campaign or experimental field has no `expires`, and when more than half the fields are `inferred`.

## Approval statuses

| Status | Meaning | Ships as fact in `brand context`? |
|---|---|---|
| `locked` | only the owner changes it | yes, marked `locked: true` |
| `current` | the rule today | yes |
| `testing` | in a labelled test run | yes |
| `provisional` | a default the owner can overrule | no, listed in `not_facts` |
| `inferred` | model or extraction output nobody confirmed | only with `--inferred` |
| `conflict` | sources disagree | never |
| `unknown` | no source | never |
| `deprecated` | being phased out; kept to explain | no |
| `killed` | rejected on purpose; kept so nobody reintroduces it | no |
| `historical` | was true; kept for lineage | no |

Logos, marks, claims and packaging rules are never self-approved. Silence is not approval.

## Source precedence

When two sources speak to the same field, the higher one wins:

```text
1 user_instruction       the owner said so, explicitly
2 approved_brand_state   an already-approved field or rule
3 official_asset         assets/official/ (guidelines, packaging masters, approved photos)
4 live_brand_behavior    what the brand actually does in public now
5 campaign_exception     a scoped, expiring exception
6 extracted_pattern      parsed from a site, file or tool (e.g. `cstack browse tokens`, Taste extraction)
7 external_reference     a third-party reference or framework
8 model_inference        a model's guess
```

Write brand truth only through the merge function:

```bash
cstack brand set color.clay --file clay.json
# color.clay: set (higher-precedence source (official_asset over extracted_pattern))
# now stale: tile-card v1
```

`mergeField` in `scripts/lib/brand.mjs` decides, using the best-ranked source on each side:

| Situation | Action |
|---|---|
| no existing field | **set** |
| same value | **set**: the evidence is merged into `sources` |
| existing is `locked` and the incoming source is not `user_instruction` | **keep** |
| incoming outranks existing | **set**, with a note "supersedes value from ..." |
| incoming ranks lower | **keep** |
| equal rank, different value | **conflict** record |

A new owner instruction on a field that already rests on an owner instruction replaces it: the owner can change their mind. The earlier value moves to the field's `history`. This applies to `locked` fields too, since only the owner can change those.

Official assets in `assets/official/` are never overwritten or edited in place, and nothing derived is written beside them: a summary there would rank as an official asset. Every cstack write enforces this (core writes, generation `out_dir`, video, SVG, mockup and paste outputs, lineage sidecars), `--force` included. Derived files go under `work/`.

## Conflicts: surfaced, never averaged

An equal-rank disagreement becomes a record in `brand-system.json → conflicts[]`:

```json
{ "id": "CF-2026-10-03-voice-tone", "field": "voice.tone", "status": "open",
  "positions": [ { "value": "Warm, plain-spoken...", "source": { "kind": "user_instruction", "ref": "owner interview" } },
                 { "value": "Formal and lyrical.",   "source": { "kind": "user_instruction", "ref": "co-founder note" } } ],
  "default_until_resolved": "Warm, plain-spoken..." }
```

- Both positions are kept with their sources. cstack never blends them into a third value.
- The existing value stays the working default. `brand context` and `brand check` list the open conflict by id so a skill asks the owner before relying on it.
- While open, the field is listed under `not_facts` in `brand context` (with the working default shown), never under `facts`.
- A second identical disagreement does not open a duplicate; ids are unique per field and day.
- The owner resolves it with `cstack brand resolve <conflict-id> --pick 1|2 [--by name]`. The pick becomes a `user_instruction`, the conflict is marked `resolved`, and `cstack brand stale` lists artifacts made with the old value.

## Lineage

Git diffs lines. Lineage records the creative intent behind each version. `cstack lineage` appends to `state/lineage.jsonl` and writes `<output>.lineage.json` next to each output file:

```json
{ "artifact_id": "cup-hero", "kind": "image", "operation": "generate",
  "intent_of_change": "lower, raking light to show the throwing rings",
  "changed_dimensions": ["lighting"], "unchanged_dimensions": ["product", "crop", "surface"],
  "output_files": ["work/out/cup-hero/cup-hero_1.png"],
  "prompt_recipe": { "id": "cup-hero", "version": 4, "hash": "<recipe hash>" },
  "brand_refs": { "color.clay": "<field hash>", "photography.light": "<field hash>" },
  "skill": "generate-media" }
```

```bash
cstack lineage --file entry.json      # prints a "creative commit" summary
cstack lineage --show cup-hero        # every version: intent, changed, kept, result
```

- `version` and `parent_version` are assigned automatically. Output files get a `sha256`.
- After the first version, `changed_dimensions` is required. Changing more than 2 dimensions at once prints a warning: refine one meaningful variable at a time.
- `result` starts as `pending`. It becomes `promoted`, `rejected` or `superseded` after review.

## Recipe hashes

`cstack prompt compile` hashes `{template, resolved slot values, target_model, parameters}` with keys sorted, so the hash does not depend on key order. The same recipe and seed give the same prompt and the same hash. Pass that hash as `recipe_hash` to `cstack generate`. It lands in the ledger, the idempotency key and the `.gen.json` sidecar, and it links an output back to the exact recipe that made it.

```bash
cstack prompt compile recipes/cup-hero.prompt-recipe.yaml --seed 7 --set light="overcast north light"
cstack prompt diff recipes/cup-hero-v3.yaml recipes/cup-hero-v4.yaml    # component-level diff
```

`prompt compile` fails loudly on a missing required slot, an undeclared placeholder, or a value for an unknown slot. `prompt diff` warns when more than one component changed.

## Stale artifacts

`brand_refs` maps the brand fields an artifact used to a hash of each value at the time: the first 16 hex characters of the sha256 of the sorted-key JSON value, which is `fieldHash` in `scripts/lib/brand.mjs`. Skills declare the fields they pin in `skill.meta.json → depends_on_fields`. When a field changes, every artifact that pinned it becomes stale:

```bash
cstack brand stale
# tile-card v1: brand inputs changed (color.clay)
```

`cstack brand set` also prints `now stale: ...` right after a change. Stale artifacts are candidates for regeneration or re-review. Nothing is deleted.

v0.1 has no CLI to compute a field hash. Skills compute it with `fieldHash`, and lineage written automatically by `generate` is planned (v0.2, see [backlog-v0.2.md](backlog-v0.2.md)).
