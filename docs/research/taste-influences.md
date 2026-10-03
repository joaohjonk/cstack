# Taste influences: the intellectual foundation cstack encodes

Date: 2026-10-03. Sources: two working notes the owner supplied privately (*Taste / Associative Distance / AI*, Sept 2026, 6 pp.; *Encoding Design Taste for AI-Driven Design Systems*, a research report) plus the owner's written summary of the frameworks behind them. Nothing brand-specific is reproduced here: the frameworks are generalized, and examples in cstack use a fictional brand.

## 1. The thesis: make taste and brand judgment executable

> Do not ask the model to remember the brand. Make the brand executable.

Encode each decision at the **lowest level that represents it reliably** (Encoding report, "How taste can actually be encoded"):

| Level | Encodes | cstack home |
|---|---|---|
| A tokens | color, type, spacing, radius, motion | `brand/tokens/*.tokens.json` (W3C DTCG 2025.10), `cstack tokens check/build/lint` |
| B component contracts | proportions, ratios, patterns | `brand-system.components`, brand-world entities |
| C composition rules | grids, spans, hierarchy, measure, density | `brand/rules/brand-rules.yaml` (relationships, each with a checker or `judge`) |
| D agent rules | when to use what, what never to invent, exceptions | skills + shared preamble + brand-system `approved_exceptions` |
| E exemplars | approved and rejected work | `references/gold`, `references/anti` with rights |
| F learned preference | pairwise data, rankers, adapters | `state/feedback.jsonl` pairs → learnings → (later) a private evaluator |

Order matters: training a model to learn a 4px radius is expensive and nondeterministic when one token solves it. The roadmap is description → structure → enforcement → learning, i.e. tokens → components → machine-readable rules → agent retrieval → deterministic QA → preference data → learned taste. A team with five unofficial grays "does not have a model problem; it has an information-architecture problem."

Evaluation follows the same split: **deterministic rules are checked by code, an LLM judge only handles ambiguity**, hard failures (logo violation, unlicensed asset, raw brand color, required accessibility state) block publication whatever a composite score says, and subjective taste is collected as **pairwise** choices with a reason, not invented absolute scores. Brand intelligence lives in portable tokens, contracts, rules, examples and evals, so the model stays replaceable.

Rights: study a studio's body of work as mechanisms; never train on or imitate a specific portfolio without rights. Distil a "rights-cleared style contract" (grid behavior, type ratios, palette constraints, density, image treatment, cropping, negative space) plus licensed exemplars.

## 2. Taste, distance, AI

| | Role | Question |
|---|---|---|
| **Taste** | the objective function | what deserves to survive? |
| **Associative distance** | the search radius | how far can we look? |
| **AI** | the accelerator | how many paths can we test? |

- **Gold-standard counterfactual.** Before asking what AI can do, write what an exceptional human team would do with ample time, then automate pieces of that process. "Do not automate the first idea."
- **The taste loop:** OBSERVE → COMPARE → ARTICULATE → DECIDE → ENCODE. Taste sharpens through contrast; selection (killing options) is the core act; every decision is saved as a principle, example, rubric, token or checklist so it compounds. Albers: perception is relational, trained by situated comparison, not memorized rules.
- **Source → Mechanism → Transfer.** Do not ask for a look; extract the mechanism and transfer it. Test: *if you can remove the source image and still explain the principle, it is a mechanism, not a costume.*
- **The reference graph, not a moodboard.** Every reference carries Source / Mechanism / Transfer and is searchable by mechanism (ritual, compression, modularity, reveal, scarcity, wayfinding, restraint ...).
- **Distance mix.** Near references (the category) improve fluency; middle (adjacent fields: fashion, sport, hospitality, publishing, furniture, beauty) widen it; far (architecture, art, industrial systems, transport, institutional graphics, ritual, interfaces, vernacular culture) create leverage. **Collect models, not looks.**
- **Give the model a world, not an adjective.** Objective, constraints, evidence, examples, anti-examples and the mechanisms behind references.
- **Compact prompt pattern** (used by `/brief` and `/creative-direction`): objective → gold standard → evidence → reference graph (S/M/T) → divergence (3 distinct hypotheses, never averaged) → critique (name generic moves) → mutation (push the strongest with one far-domain mechanism) → decision-ready output plus what enters the canon.

**Failure modes** (now in the failure taxonomy): moodboard mimicry, reference monoculture, adjective prompting, option addiction, context dumping, taste without reality, canon ossification.

## 3. Knowledge status: facts that survive years

Status vocabulary (already the cstack `approval` enum): LOCKED / CURRENT / TESTING / PROVISIONAL / HISTORICAL / CONFLICT / UNKNOWN / DEPRECATED / KILLED, with INFERRED for model-derived values. Every fact travels FACT → SOURCE → STATUS → CONFLICT → RESOLUTION; conflicts are surfaced and resolved by the owner, never averaged.

## 4. Culture as infrastructure (cultural strategy lens)

A brand world decomposes into: beliefs · symbols · codes · rituals · language · objects · places · behaviors · people · community · mythology · repetition · time. Five mechanisms test whether a cultural asset works:

| Mechanism | Test |
|---|---|
| legibility | can the relevant group decode what this means? |
| repetition | does it recur enough to become recognizable? |
| mobility | can it travel across media, people and contexts? |
| aggregation | do many small assets reinforce one another? |
| organization | are people, objects, rituals and ideas organized into a coherent world? |

**Cultural assets → cultural derivatives:** build a small number of meaningful primitives that can generate hundreds of expressions instead of inventing every campaign from zero. A brand that wants to behave like a cultural institution can be designed along **Belief → Role → Behavior → Symbols → Rituals → Totems → Place → Community → Archive → Time**. These mechanisms are lenses drawn from published cultural-strategy work (notably Ana Andjelic's writing on how brands make culture); cstack uses the mechanisms and never imitates any living person's voice.

## 5. The canon as a lattice of mental models

The value is not the names but **which mental model each contributes**, when it helps, when it misleads, and its tensions (a Munger-style lattice for creative judgment). Examples of the shape: Vignelli → reduction + systems; Albers → relational perception; cultural-capital theory → how meaning accrues; worldbuilding through objects and collaboration; identity as behavior and motion; publication as object; research + material intelligence; interfaces as thinking environments. The canon must keep adding exceptions and contradictions so it does not ossify. "An executable Vignelli manual": don't merely design the artifacts; design the machine capable of making them. Schema: `schemas/canon-entry.schema.json`; seed entries: `canon/`.

Reference-research method for web/UX work: functional reference → formal reference → cultural-quality reference → distant reference, rather than copying one admired site.

## 6. The nine layers (cstack's architecture, top to bottom)

```text
01 REALITY      brand / product / company truth          brand-system.json (business_truth, claims, proof), brand-world
02 CULTURE      people, behaviors, scenes, language      /cultural-scan, state/culture.jsonl
03 CANON        thinkers, practitioners, mental models   canon/*.canon-entry.yaml
04 REFERENCES   near + middle + far, Source→Mechanism→Transfer   references/, /taste-search, /shot-dna
05 SYSTEM       tokens, grids, type, components, motion, photography, voice   brand/tokens, brand/rules, brand-system
06 GENERATION   people + agents + Figma + code + models   /prompt-director, /model-router, providers/
07 JUDGMENT     gold, anti, pairwise, critiques, evals    /creative-review, /brand-verify, state/evals.jsonl
08 MEMORY       every decision feeds back                 state/*.jsonl, /learn-loop, docs/learnings.md
09 COMPOUNDING TASTE
```

## 7. What changed in cstack because of this note

- `reference` schema: `source_domain`, `distance` (near|middle|far), `mechanism_tags`, `transfer`.
- New `canon-entry` schema and a seed `canon/` of mental-model entries.
- DTCG tokens in the brand workspace with deterministic check/build/raw-value lint; `brand/rules/brand-rules.yaml` for relationships.
- Failure taxonomy gained the seven taste failure modes plus `retired_rule_resurfaced` and `self_certified`.
- Skills: `/taste-search` enforces a distance mix and S/M/T on every reference; `/brief` writes the gold-standard counterfactual; `/creative-direction` uses diverge → critique → mutate; `/cultural-scan` scores assets on the five culture mechanisms; `/learn-loop` runs observe → compare → articulate → decide → encode.
