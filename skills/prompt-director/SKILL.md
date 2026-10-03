---
name: prompt-director
description: "Compile generation prompts from structured decisions (brief, Shot DNA, entities, reference roles, brand constraints) into versioned prompt recipes with named slots, deterministic variants, model-specific syntax and a stable cacheable prefix; diff recipes by component. Use before any image, edit, video or vector generation, when prompts have grown into long unmaintainable text, or when outputs drift between runs. Not for choosing the model (use model-router) or judging outputs (use creative-review)."
license: MIT
metadata:
  cstack-version: "0.1.0"
  cstack-meta: "skill.meta.json"
---

# /prompt-director

A prompt is the compiled result of decisions, not a magic spell (section 12). [Shared preamble](../cstack-shared/PREAMBLE.md) applies.

## When to use

- Every generation or edit that matters.
- Prompts copied between models, or 4,000-character prompts nobody can diff.
- Outputs drift and nobody knows which words changed.

## When not to use

- Model choice: `model-router`. Running the call: `generate-media`. Judging: `creative-review`.

## Inputs

- Shot DNA, brief, bound entities, reference records (with roles: composition, light, material, product, cast, style-mechanism), `cstack brand context --sections photography,lighting,camera_language,product_representation,banned_language`.
- Target model from `model-router` (syntax and reference limits differ).

## Missing-input behavior

- No Shot DNA for a hero image: write it first (`shot-dna`).
- A required slot has no value: compilation fails by design. Fill it or remove the slot; never ship an unfilled placeholder.

## Source precedence

Locked entities and hard constraints are non-negotiable modules; Shot DNA decisions next; reference mechanisms next; stylistic text last. Retired rules must be removed from templates when the brand changes (a stale "no logos" line erasing real marks is a known failure).

## Tools / providers

`cstack prompt compile <recipe.yaml> [--seed N] [--set slot=value]` (fails on missing or undeclared slots, picks variants deterministically, outputs the recipe hash) and `cstack prompt diff a.yaml b.yaml` (component-level diff). No paid calls.

## Process

1. **Modules** (only those that matter): objective, subject, product lock, scene, behavior/action, composition, camera, lighting, materials, surface, color logic, imperfection, post, brand constraints, reference mapping, negative constraints, model-specific syntax.
2. **Template + slots**: the long stable instruction lives in one template; variables are named slots (`{shot}`, `{pose}`, `{product_spec}`, `{lighting}`, `{motion}`); variant pools are addressed by index or seed.
3. **Stable prefix**: brand rules and shared instructions first and identical across a batch; volatile task data last (provider caching where supported; measure, do not assume).
4. **Less text, stronger references** when the model handles references well: map each reference image to a role; keep words for what images cannot say.
5. **Specialized compilers**: text-to-image, image edit (describe only the change; protect everything else), image-to-video (motion, camera move, duration; start from an approved still), vector (geometry and constraints, no photo words), typography-aware (prefer composited type), product placement (product lock + integration notes).
6. **Compile and store**: recipe file with slot values, compiled prompt, hash, target model, parameters, references.
7. **Refinement**: change one component; `cstack prompt diff` must show one meaningful change (more than one = warning).

## Decision rules

- No adjective soup. Every adjective must map to a decision in a module or be deleted.
- No names of photographers, artists or studios in prompts; use the mechanism from the reference record.
- Do not translate one verbose prompt to every model; recompile per target syntax.
- Negative constraints come from the brand's anti library and banned elements, not generic negative lists.

## Outputs, files written, state updated

- `recipes/<shot>-v<N>.prompt-recipe.yaml` (validated), compiled text in `compiled`.
- Lineage: the recipe hash travels into `cstack generate` and the `.gen.json` sidecar.

## Evals required

- T0: `cstack prompt compile` on every recipe in `recipes/` (missing/unused slots fail).
- T1: fixtures for variant determinism and diff (tests/core.test.mjs), `retired-rule-in-template.yaml`.

## Handoff

`model-router` (if not chosen), `generate-media`, `image-edit`, `creative-autoresearch` (recipe as the mutable surface).

## Failure modes

- Prompt archaeology: old lines nobody remembers adding.
- Same recipe across models with different reference semantics.
- Changing prompt, model and references together, then not knowing what helped.

## Examples

`recipes/shot-04-v3.prompt-recipe.yaml` differs from v2 only in `lighting` (soft north window → flash + underexposed ambient). `cstack prompt diff` prints one component; the lineage entry says "changed: lighting; kept: cast, pose, crop, product placement, color logic".
