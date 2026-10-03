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
05 SYSTEM       tokens, type, marks, grid, voice, photography      brand/tokens, /identity-system, /type-director, /symbol-design
06 GENERATION   researched flows first, then models, people, code  /flow-research, /prompt-director, /generate-media, /three-d, /video-direction
07 JUDGMENT     gates, independent review, your picks             /brand-verify, /creative-review, /claims-proof
08 MEMORY       every decision and failure is recorded            state/*.jsonl, /learn
09 COMPOUNDING TASTE   repeated evidence becomes rules, rules become tokens
```

Work flows down the layers (truth and culture shape references, references shape the system, the system constrains generation). Judgment flows back up (what you approve and reject becomes memory, memory becomes rules).

## Five ideas that make it different

1. **Every brand fact knows where it came from.** Each field carries its source, confidence and status (locked, current, testing, provisional, inferred, conflict, unknown, deprecated, killed, historical). Your instruction beats approved state, which beats official assets, which beat whatever the website shows, which beats anything a model guessed. When two sources disagree, cstack shows you both. It never averages.
2. **Taste is the objective, distance is the search radius.** References are stored as *Source → Mechanism → Transfer*: what it is, why it works, how that lands in your brand. Searches deliberately mix near (your category), middle (adjacent fields) and far (architecture, ritual, transport, interfaces) so the work is not the category average. "Collect models, not looks."
3. **Cheap and certain before expensive and generative.** Reuse, then retrieve, then a deterministic transform (crop, composite, token), then a cheap probe, then a premium render. Every paid call is estimated, budgeted, deduplicated and logged; a new brand starts with a budget of zero.
4. **Nobody grades their own homework.** The thing that made an image never certifies it. Code checks what code can (sizes, colors, contrast, claims lists), an independent reviewer judges brand fit, craft, culture and product truth *separately*, and you decide. Your picks outrank any AI judge.
5. **Method before making.** No outcome is one-shot. Before anything is made, the agent states what "as close as possible" means, finds or researches the best current flow for that outcome (what tools, models and practitioners actually do now), compares at least two ways of getting there, and writes a step-by-step plan with a gate and a stop condition on every step. `cstack flows check` refuses a plan that skips any of that.

## What you actually use

- **30 skills** your agent loads on demand.
  - Framing and truth: office-hours, brand-import, product-fidelity, claims-proof.
  - References and culture: taste-search, cultural-scan, competitor-intel, shot-dna, browse.
  - System: identity-system, type-director, symbol-design, vector-master.
  - Direction and making: flow-research, creative-direction, campaign-sequence, prompt-director, model-router, generate-media, image-edit, mockup, three-d, video-direction, video-assembly, copywriting.
  - Judgment and memory: creative-review, brand-verify, learn, creative-autoresearch, workflow.
- **11 workflows** that chain them: create-brand, import-brand, campaign, product-photoshoot, paid-social, landing-page, packaging, deck, logo-system, product-3d, product-video. They stop at your gates and resume where they left off.
- **14 researched flows**, the best current way to reach an outcome: type system, logo system, icon set, mockup set, 3D web hero, 3D packshot, social turntable, AR view, product hero video, brand mood film, paid-social cut-downs, UGC-style ad, logo sting, voice-first explainer. Each is dated and goes stale on purpose.
- **One CLI** for everything that should be exact: brand checks, routing, budgets, lineage, tokens, browsing, eval selection, and the craft checkers (`cstack type`, `svg`, `mockup`, `3d`, `video`) that measure what models get wrong.
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

Workflows and flows are templates until proven on real runs. Several provider adapters are stubs. No paid generation has run yet, so the 3D, mockup and video thresholds are researched defaults, not calibrated ones. Live performance ingestion is thin. The honest list is in [retro.md](retro.md) and [backlog-v0.2.md](backlog-v0.2.md).
