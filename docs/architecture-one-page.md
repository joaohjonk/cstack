# cstack on one page

**For a creative founder who wants to know what this is before reading anything else.**

## The idea

Your brand already contains most of the answers: what it believes, how it looks, what it refuses, which photographs were right and why. AI tools ignore all of that and start from the average of the internet. cstack makes your brand's judgment *executable*: written down as files an agent must read, checked by code before a model is paid, and improved every time you pick, kill or correct something.

It is not a prompt library. It is a small studio turned into software: a brief before work, references before invention, a shot plan before a render, an independent review before you see it, and a retro after.

## Nine layers

```text
01 REALITY      what is true about the product and company        brand state, product entities, claims + proof
02 CULTURE      what people are doing now, observed and dated     /cultural-scan
03 CANON        mental models from great practitioners            canon/ (Vignelli, Albers, Rams, Ogilvy, ...)
04 REFERENCES   near, middle and far; mechanisms, not looks       /taste-search, /shot-dna
05 SYSTEM       tokens, type, grid, components, voice, photography  brand/tokens, brand/rules, /identity-system
06 GENERATION   models, people, Figma, code                       /prompt-director, /model-router, /generate-media
07 JUDGMENT     gates, independent review, your picks             /brand-verify, /creative-review, /claims-proof
08 MEMORY       every decision and failure is recorded            state/*.jsonl, /learn
09 COMPOUNDING TASTE   repeated evidence becomes rules, rules become tokens
```

Work flows down the layers (truth and culture shape references, references shape the system, the system constrains generation). Judgment flows back up (what you approve and reject becomes memory, memory becomes rules).

## Four ideas that make it different

1. **Every brand fact knows where it came from.** Each field carries its source, confidence and status (locked, current, testing, provisional, inferred, conflict, unknown, deprecated, killed, historical). Your instruction beats approved state, which beats official assets, which beat whatever the website shows, which beats anything a model guessed. When two sources disagree, cstack shows you both. It never averages.
2. **Taste is the objective, distance is the search radius.** References are stored as *Source → Mechanism → Transfer*: what it is, why it works, how that lands in your brand. Searches deliberately mix near (your category), middle (adjacent fields) and far (architecture, ritual, transport, interfaces) so the work is not the category average. "Collect models, not looks."
3. **Cheap and certain before expensive and generative.** Reuse, then retrieve, then a deterministic transform (crop, composite, token), then a cheap probe, then a premium render. Every paid call is estimated, budgeted, deduplicated and logged; a new brand starts with a budget of zero.
4. **Nobody grades their own homework.** The thing that made an image never certifies it. Code checks what code can (sizes, colors, contrast, claims lists), an independent reviewer judges brand fit, craft, culture and product truth *separately*, and you decide. Your picks outrank any AI judge.

## What you actually use

- **22 skills** your agent loads on demand: office-hours, brand-import, identity-system, taste-search, cultural-scan, competitor-intel, creative-direction, shot-dna, campaign-sequence, product-fidelity, prompt-director, model-router, generate-media, image-edit, copywriting, creative-review, brand-verify, claims-proof, learn, creative-autoresearch, browse, workflow.
- **8 workflows** that chain them: create-brand, import-brand, campaign, product-photoshoot, paid-social, landing-page, packaging, deck. They stop at your gates and resume where they left off.
- **One CLI** for everything that should be exact: brand checks, routing, budgets, lineage, tokens, browsing, eval selection.
- **Your research tools**, detected not assumed: Taste Labs, Refero, Mobbin, Foreplay, Figma and others when you have them; a fallback when you don't.

## Where things live

```text
cstack (this repo, public, brand-agnostic)      your brand's repo (private, one per brand)
  skills/  workflows/  schemas/  registry/        brand/       brand state, tokens, rules, world
  canon/   providers/  bin/  evals/               references/  gold, anti, culture, competitors
  templates/brand-workspace  ─── brand init ───▶  briefs/ recipes/ work/ campaigns/
                                                  state/       ledgers: cost, feedback, failures, learnings
```

cstack holds no brand's data. It is installed once and used for every brand, the way gstack is used for every codebase.

## A session looks like

> "Product shoot for the new tin, six finals."

`/workflow product-photoshoot` → office-hours writes the brief (you approve) → product-fidelity locks the real product → taste-search and shot-dna plan the shots from references → model-router picks models from a dated registry and proposes cheap probes (you approve the spend) → generate-media renders probes, then finals → image-edit repairs locally → brand-verify and creative-review judge independently → you pick → learn records what worked.

## What it is not (yet)

Workflows are templates until proven on real runs. Several provider adapters are stubs. Video, motion and live performance ingestion are thin. The honest list is in [retro.md](retro.md) and [backlog-v0.2.md](backlog-v0.2.md).
