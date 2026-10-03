# Canon: a lattice of mental models

Each entry records the **mental model** a person, studio, work or framework contributes, its transferable mechanisms, when it helps, when it misleads, and its tensions (schema: `schemas/canon-entry.schema.json`). It is retrievable reasoning, not authority worship.

Rules:
- Names never go into generation prompts; mechanisms do.
- Never imitate a living person's voice. Use the mechanism.
- Keep counterexamples next to the canon so it does not ossify (e.g. maximalism beside restraint).
- A brand's own canon (its photographers, foundries, practitioners) lives in the brand's workspace, not here. This folder holds only broadly useful, public entries.

Conventions:
- `tensions` may point at another entry as `canon:<id>`, so a lesson travels with its counterweight.
- `distance_from` keys are work categories, not entry ids. Reuse the existing keys (identity, editorial, web-product-ui, packaging, campaign-advertising, motion, wayfinding, icon-design, fashion, hospitality) before adding one.
- Sources use `kind: external_reference` with a URL, or a book with title, edition and year, plus `captured_at` for anything read online. A `quote` is verbatim, under 25 words and copied from the source itself, never from a summary of it.

Typography cluster (evidence and corrections: `docs/research/typography.md`):
- `thinking-with-type`: letter, text and grid as three scales; rules taught with their reasons.
- `bringhurst`: measure, scale, spacing, figures and hyphenation (print-rooted defaults).
- `practical-typography`: numeric ranges for body text in documents and on the web.
- `web-typography`: flexible typesetting, fluid scales, zoom and user overrides.
- `swiss-grid-systems`: a grid derived from the type; the grid as an aid, not a guarantee.
- `gerstner-designing-programmes`: programmes, morphological tables, grids that serve several column counts.
- `vignelli`: reduction, few faces and sizes, semantics, syntactics and pragmatics.
- `spiekermann`: type briefs written by the job; faces that survive real conditions.
- `pentagram`: vernacular type as the identity (Scher); a simple mark in a flexible system (Bierut).
- `collins`: identity as behaviour, with range in type and motion.

Counterweights in this cluster: `vignelli` against `pentagram` and `collins` (reduction against expression); `bringhurst` against `web-typography` (composed print against reader-controlled screens).

Add one: copy an entry, run `cstack validate`. Retrieve: `grep -l "mechanisms" canon/ | xargs grep -il procession`.
