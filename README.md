<p align="center">
  <img src="docs/images/cstack-drift.svg" alt="Ten tiles of a mark asked for by prompt drift in colour, size and angle; ten tiles made from a brand kept in files stay identical." width="100%">
</p>

# cstack

**Great brands are not made once. They are made again, every day, by people who were not in the room.**

The New York subway still reads as one system half a century later. The reason is not a drawing; it is the 1970 standards manual Massimo Vignelli and Bob Noorda wrote at Unimark, so that someone else could make the next sign right. Otl Aicher did the same for Munich in 1972: a grid, a palette and a set of angles that produced every pictogram, poster and ticket. The craft was the system that let the work be repeated.

Generative AI made making cheap. It did not make judgment cheap. Ask a model for your brand a hundred times and you get a hundred cousins: the orange slides toward pink, the type drifts, the product grows a cap it never had, the copy reaches for the word the founder banned last spring. No single image is wrong. The set is.

**cstack is a way to make taste repeatable.** It turns a brand into files an agent can read, check and keep: the decisions and who made them, the references and *why* they work, what was killed and why. Then it gives the agent the habits of a good studio. Brief before making. Find the method before generating. Never let the maker approve its own work. Write down every correction so it is never needed twice.

It is to brand work what [gstack](https://github.com/garrytan/gstack) is to shipping software: thirty specialist skills, a small CLI and plain files in git, so that Claude Code, Codex, Cursor, Gemini CLI or OpenCode works like a disciplined studio instead of a prompt box. Free, MIT, and holding no brand's data: each brand keeps its own workspace in its own repo.

**Who this is for**

- **Founders who are also their brand's creative director**, and want the hundredth asset to be as considered as the first.
- **Designers, art directors and writers** who want agents to work to their standard, not around it.
- **Small studios running many brands** without a brand team per client.
- **Anyone who has tried to make AI work look like one brand** and watched it drift.

## Quick start

1. Install cstack (one minute, below).
2. Run `/office-hours` and describe what you need made.
3. Run `/creative-direction` on the brief it writes.
4. Run `/creative-review` on something you already made.
5. Stop there. You will know if this is for you.

## Install

Requires [Node.js](https://nodejs.org) 20 or newer and Git. Open your agent and paste:

> Install cstack: run **`git clone --depth 1 https://github.com/joaohjonk/cstack.git ~/cstack && cd ~/cstack && ./setup`**, then run `node ~/cstack/bin/cstack.mjs help` and tell me which skills are installed. For brand work, start with /office-hours.

Or do it yourself:

```bash
git clone --depth 1 https://github.com/joaohjonk/cstack.git ~/cstack
cd ~/cstack && ./setup               # installs the npm dependencies, then links the skills into .agents/skills and .claude/skills
alias cstack="node ~/cstack/bin/cstack.mjs"
cstack help
```

Run `./setup` (or `npm install`) once before the first `cstack` command; on a bare clone the CLI stops and tells you to. `./setup all` also installs for Codex, Cursor, Gemini CLI and OpenCode (`registry/hosts.json`). Setup never installs system software, never asks for keys and makes no paid calls.

**Money and keys.** Provider credentials are read from environment variables by name (`FAL_KEY`, `TASTE_API_KEY`) and never written to disk. A new brand workspace has a budget of zero, so nothing costs money until you say how much it may.

## See it work

An abridged session on **Lumen Field**, a fictional ceramics studio that ships with cstack in [examples/lumen-field](examples/lumen-field). Everything the agent refers to below is a real file in that folder.

```text
You:    We need three autumn photos for the ochre plates.
You:    /office-hours
Claude: Before anything is made: where do these live, and what must
        "autumn" never mean here?
        [reads the brand: 22 sourced facts, 3 unknown, 1 in conflict]
        I'm going to question "three photos". The page needs one hero
        and one honest grid of the batch. And the hero is not autumn;
        it is the moment after breakfast, a plate that has been used.
        [writes the brief: objective, gold standard, musts, must-nots]

You:    (strike "a curated batch to elevate your table". We don't talk like that.)

You:    /creative-direction
Claude: [three territories, never averaged; one recommended;
         rejected: showroom marble and steam, black velvet and gilt]

You:    /shot-dna
Claude: 50-65 mm at seated eye level, 30-40 degrees down. North window
        from frame left, late afternoon, no fill. A cutlery scuff on the
        glaze and crumbs off the edge, on purpose.

You:    /workflow product-photoshoot
Claude: The plate itself will be photographed and composited, never
        generated: its glaze is a locked fact.
        Kiln Ochre is in conflict. The palette spec says #B8742A, the
        swing-tag spec says #C98A3E. I will not average them. Which is right?
        The budget is 0. Two probes would cost $0.08. Raise it, or I
        stay on the free mock provider.

You:    /creative-review
Claude: [strategist, art director, photographer and editor review
         separately from the maker; their disagreement about the crop
         stays visible; you decide]

You:    /learn retro
Claude: You struck "curated" and "elevate". The interview says "never say
        artisanal". Promote these to banned language for every future brief?
```

You asked for three photos. The agent noticed you needed one hero and one proof, refused to guess a colour the brand had not settled, kept the real product real, and asked before spending a cent. That is not a prompt box. That is a studio that remembers.

## The studio

cstack is a process, not a pile of prompts. The skills run in the order good brand work runs:

**Think → Know the brand → Look outward → Direct → Make → Judge → Remember**

Each one writes files the next one reads. `/office-hours` writes the brief that `/creative-direction` answers. `/shot-dna` writes the camera and light that `/prompt-director` compiles. `/creative-review` reads the brief, not the maker's opinion of its own work.

| Skill | Your specialist | What they do |
|---|---|---|
| `/office-hours` | **Creative strategist** | Start here. Interrogates the ask, reframes it, writes the gold-standard version an exceptional team would make with time, then a short brief every other skill reads. |
| `/creative-direction` | **Creative director** | Three distinct territories for identity, words and image. Diverge, critique, mutate; never average. One recommendation, a rationale and a rejection list. |
| `/flow-research` | **Head of production** | Before anything new is made, researches how that outcome is best made today: tools, models, what practitioners actually post. Compares at least two methods and writes the plan with a gate on every step. |
| `/brand-import` | **Brand archivist** | Turns an existing brand (assets, site, decks, repos, Figma) into sourced facts, tokens, entities and seed gold and anti libraries. Says UNKNOWN instead of guessing. |
| `/identity-system` | **Design systems lead** | Turns a chosen direction into tokens, type hierarchy, grids, logo rules and component contracts, each decision at the lowest level that holds it reliably. |
| `/type-director` | **Type director** | Chooses, pairs and systematizes type for the job (languages, voice, licence, performance) and checks it on the rendered page: measure, leading, contrast, fallbacks. |
| `/taste-search` | **Researcher** | References as a graph, not a moodboard: near, middle and far, each with its source, the mechanism that makes it work, and how it transfers. |
| `/cultural-scan` | **Cultural strategist** | Reads live scenes, rituals, language and objects, and scores a brand's cultural assets: can people decode it, repeat it, carry it? |
| `/competitor-intel` | **Category analyst** | A dated corpus of the category: its conventions, its white space, the claims everyone already makes. |
| `/browse` | **Studio assistant with a browser** | Responsive screenshots, PDFs, accessibility snapshots and computed styles from live pages, with an origin lock. Ported from gstack. |
| `/shot-dna` | **Photographer** | Breaks a reference or a planned shot into camera, lens, height, a named lighting recipe, surfaces and deliberate imperfections. Lighting as a recipe, never an adjective. |
| `/campaign-sequence` | **Art director** | Plans a campaign as a sequence of roles (icon, world, ritual, product, proof, closer) and judges the set, not the single frame. |
| `/product-fidelity` | **Product lead** | Locks the real product (silhouette, label, closure, colour) and picks a method that keeps it true. Checks every output for drift. |
| `/video-direction` | **Film director** | Beat sheets for product heroes, brand films, cut-downs and logo stings, with one world, a production path per beat and disclosure gates. |
| `/symbol-design` | **Identity designer** | Logo, symbol and monogram exploration the way a studio does it: wide and cheap, judged in one colour at 32 px, then construction and optical correction. |
| `/vector-master` | **Production artist** | Clean SVG masters, linted structure, reduction tests, one-colour versions, lockups, favicon and app-icon kits. |
| `/copywriting` | **Copywriter** | Writes in a declared mode (conversion, campaign, editorial, product truth) in the brand's voice and vocabulary; banned words stay banned. A separate pass checks it. |
| `/prompt-director` | **Prompt engineer** | Compiles decisions into versioned recipes with named slots and seeded variants, so a good result can be made again and a change can be diffed. |
| `/model-router` | **Technical director** | Picks the model for the job from a dated registry, runs a small probe when unsure, never trusts a stale price. |
| `/generate-media` | **Producer** | Guarded generation: dry run and estimate first, cheap probes before finals, never pays twice, re-attaches to pending jobs. |
| `/image-edit` | **Retoucher** | Repairs one region and keeps every good decision; composites official logos and labels instead of letting a model redraw them. |
| `/mockup` | **Packaging and print artist** | Places approved art on packs, cans, apparel, signage and screens, then proves pixel by pixel that the art survived. |
| `/three-d` | **3D artist** | Web heroes that rotate on scroll, packshots, turntables, AR views, built from the real product with the official label as texture, checked against a size budget. |
| `/video-assembly` | **Editor** | Cuts, reframes per channel, burns captions inside safe zones, normalizes loudness and checks frames for drift. No model spend. |
| `/creative-review` | **The crit** | Independent lenses (strategist, art director, photographer, type, editor, culture, commerce, compliance), run apart from the maker. Disagreement is kept, not averaged. |
| `/brand-verify` | **Brand guardian** | Deterministic gates first (tokens, raw colours, type, clear space, aspect, banned words), then a verifier, then you. |
| `/claims-proof` | **Claims editor** | Every claim tied to its proof and to current primary regulation, with uncertainty marked. |
| `/learn` | **Studio memory** | Observe, compare, articulate, decide, encode. Corrections and picks become rules only when the evidence repeats. |
| `/creative-autoresearch` | **R&D** | A bounded keep-or-discard experiment on one variable against a frozen test, with a budget and a stop. |
| `/workflow` | **Producer of record** | Runs a whole job (brand, campaign, photoshoot, landing page, packaging, deck, 3D, video, logo) as a resumable plan with owner gates. |

Each skill has a fixed contract (inputs, what to do when an input is missing, precedence, process, outputs, evals, handoff, failure modes) and a context budget that CI enforces.

## How it thinks

<p align="center">
  <img src="docs/images/nine-layers.svg" alt="Nine stacked layers from Reality, Culture, Canon and References through System, Generation, Judgment and Memory to Compounding taste, with an arrow from Memory back to Canon." width="100%">
</p>

Six rules hold the whole thing together:

- **A brand is a living entity, not a PDF.** Every fact carries its source, its status (LOCKED, CURRENT, TESTING, PROVISIONAL, UNKNOWN, CONFLICT, KILLED and a few more) and who approved it. A model guess can never overwrite an owner's instruction. Conflicts are surfaced, never averaged.
- **Collect models, not looks.** A reference is stored as source, mechanism and transfer. If you can remove the image and still explain why it works, it is a mechanism; otherwise it is a costume.
- **Method before making.** Nothing is one-shot. Before an outcome is attempted, the agent names the target, looks up how it is best made today, compares at least two ways and works step by step against it. `cstack flows check` refuses a plan that skipped any of that.
- **Deterministic before generative, cheap before premium.** Tokens, lints, crops and measurements before models; probes before finals; a budget and a stop condition before any batch.
- **The maker never certifies its own work.** Beautiful, on-brand, culturally alive, effective and correct are separate judgments made by separate reviewers.
- **The owner's taste is sovereign.** Picks, kills and edits are recorded as preference data; repeated evidence becomes a rule. Don't forget this. Judgement and taste are the most important skill in the age of abundance.

The long version is in [docs/philosophy.md](docs/philosophy.md) and [docs/architecture-one-page.md](docs/architecture-one-page.md).

## First ten minutes

```bash
cstack brand init ~/brands/acme --name "Acme"    # a brand workspace, its own git repo
cd ~/brands/acme
cstack brand check                               # what is known, unknown and in conflict
cstack tools --mcp "Figma,Refero"                # which research tools you actually have
cstack providers                                 # which media providers are usable here
```

Then, in your agent:

```text
/office-hours           reframe the ask, write the brief
/brand-import           an existing brand   (or: /workflow create-brand for a new one)
/creative-direction     three territories, one recommendation, a rejection list
/workflow <name>        campaign, product-photoshoot, landing-page, paid-social, packaging, deck ...
/creative-review        independent lenses, disagreement kept visible
/brand-verify           deterministic gates, then a verifier, fix, re-verify, then you
/learn retro            promote only what has earned it
```

A step-by-step walkthrough with no spend is in [docs/quickstart.md](docs/quickstart.md).

## Workflows

`/workflow <name>` runs a whole job as a resumable plan with owner gates and a tracker in `work/plans/`:

`create-brand` · `import-brand` · `campaign` · `product-photoshoot` · `paid-social` · `landing-page` · `packaging` · `deck` · `product-3d` · `product-video` · `logo-system`

Every step names its skill, inputs, outputs, gate, and what to do when a tool or provider is missing. Definitions live in [workflows/](workflows).

## The CLI

The agent does the judging. The CLI does everything that should never depend on a model's mood.

```bash
cstack search "product photoshoot"                         # find the right skill
cstack flows search "rotating 3d product on the homepage"  # the researched method, before making
cstack flows check work/flows/*.flow.yaml                  # two options compared, a gate on every step, a stop
cstack brand context --sections voice,color                # compact, cache-stable facts for a prompt
cstack taste search "a ritual that feels choreographed"    # Taste Labs, when TASTE_API_KEY is set
cstack route --modality image --needs image-edit,text-rendering
cstack prompt compile recipes/hero.recipe.yaml --seed 7
cstack spend plan batch.json --stop "2 of 4 probes fail fidelity"
cstack generate --file request.json --dry-run
cstack browse qa http://localhost:4173                     # overflow, alt text, contrast at 375/768/1440
cstack tokens check && cstack tokens build
cstack type qa http://localhost:4173                       # measure, leading, caps, contrast, fallbacks
cstack svg reduce mark.svg                                 # does the mark survive at 16 px?
cstack mockup verify --template t/can --art label.svg --render can.png
cstack 3d inspect model.glb --budget web-hero              # bytes, triangles, textures, scale, origin
cstack video qa master.mp4 --product-ref still.png --roi 380,600,320,420
cstack learn candidates                                    # what has earned promotion to a rule
cstack health                                              # skill validity, budgets, staleness
```

`cstack help` lists every command. Video checks need `ffmpeg` on your machine; browser checks need a Chromium and the optional `playwright-core`. cstack never installs either.

## Research tools and providers

cstack knows the tools good studios already pay for and checks which ones you have (`cstack tools`): Taste Labs, Cosmos, Refero, Mobbin, Ecomm.Design, Baymard, Particl, BuiltWith, Store Leads, Helium 10, SmartScout, Nexscope, Foreplay, Shortimize, Really Good Emails, and Figma's and Shopify's MCPs. For making, it knows 3D (Blender, Spline, Needle, Meshy, Tripo, glTF Transform), mockups and vector (Dynamic Mockups, Recraft, Adobe, Canva, Pacdora), video (fal, Higgsfield, HeyGen, Replicate, Runway) and type (Google Fonts, Adobe Fonts, foundry trials, Fonts In Use, fontTools).

None is required; every one has a fallback. Tools whose terms bar automated agents are used only through your own exports or by you. Media generation runs through one guarded call with dedupe, budgets and pending-job recovery: fal and a free mock provider are live, Taste Labs is implemented against its documented API, the rest are stubs. Details: [docs/integrations.md](docs/integrations.md).

## Make it yours

- **Add a brand.** `cstack brand init <dir> --name "Brand"`, then `/brand-import` or `/workflow create-brand`. Official assets go in `assets/official/` and are never overwritten. The workspace is the brand's own repo; nothing in it flows back into cstack.
- **Add a provider.** Write an adapter in `providers/` against `providers/index.mjs`, read keys from env vars only, register it in `registry/providers.json`, and add its models to `registry/models.json` with a dated source and price.
- **Write a skill.** Copy one, keep the contract headings, fill `skill.meta.json`, add a fixture in `evals/fixtures/`, then `cstack index && cstack validate && cstack budget --check`. See [docs/skill-authoring.md](docs/skill-authoring.md).
- **Teach it.** Corrections, pairwise picks, failures and provider quirks go to the workspace's `state/*.jsonl`. `cstack learn promote` moves repeated evidence into a durable home with its provenance. Brand lessons stay in the brand's repo; only general mechanisms come back to cstack. See [docs/learnings.md](docs/learnings.md).

## Where it stands

v0.1, beta. The skills, workflows, flows, checkers and schemas exist and pass their static checks and tests. What has not happened yet is said plainly in [docs/retro.md](docs/retro.md): no model-backed eval runner, no real brand run (that happens in each brand's private repo), checker thresholds not yet calibrated against an owner's verdicts. Workflows stay `template` and flows stay `researched` until a real run proves them. The next steps are in [docs/backlog-v0.2.md](docs/backlog-v0.2.md).

## Thank you

cstack is a machine for remembering what other people figured out. None of it is ours alone. These are the people and studios whose methods we tried to understand, and what we took from each. We took mechanisms, never voices: no name ever goes into a generation prompt, and no one listed here endorses this project.

Where a person has a [canon](canon/) entry, the full reasoning lives there, with when the lesson helps, when it misleads, and its counterweight. The rest are lenses the method draws on that do not yet have an entry of their own.

### Architects and spatial thinkers

| | What cstack took |
|---|---|
| **John Pawson** | Subtraction as the method. Keep removing until only proportion, light and material are left; the detail that disappears is the hardest one. It is the question `/creative-review` asks of every layout: what here has not earned its place? |
| **Tadao Ando** | Light as the event in a still space, one material carried with total consistency, and procession: the route to a thing is part of the thing. A brand is experienced in sequence, so cstack plans campaigns and pages as sequences. [canon](canon/tadao-ando.canon-entry.yaml) |
| **David Chipperfield** | Continuity over novelty. The Neues Museum kept its scars and built carefully around them. cstack does the same with a brand: import what was decided, keep official assets untouched, repair one region rather than regenerate the whole. |
| **Isay Weinfeld** | Rigour with warmth and a little wit. Modernism that is not cold, and the surprise placed where you do not expect it. A counterweight in the canon to reduction for its own sake. |
| **Dieter Rams** | Less, but better: every element earns its place through use. And the reminder, kept next to him, that restraint is a choice and not a law. [canon](canon/rams.canon-entry.yaml) |

### Brand builders, creative directors and culture

| | What cstack took |
|---|---|
| **Ana Andjelic** | Brands as cultural actors. A brand world is made of beliefs, symbols, rituals, objects and places, and a cultural asset works only if people can decode it, repeat it, carry it, add to it and organize around it. Build a few strong primitives that generate hundreds of expressions. `/cultural-scan` scores exactly that. [canon](canon/cultural-capital-strategy.canon-entry.yaml) |
| **Jonathan Anderson** | Worldbuilding through objects and collaboration. A brand becomes a world when the things it makes, the craftspeople it champions and the artists it works with all say the same thing in different materials. It is why cstack keeps a brand world of entities, not just a palette. |
| **David Ogilvy** | Research before persuasion. The consumer is not a moron, specific facts sell, and the headline does most of the work. `/copywriting` and `/claims-proof` start from evidence. [canon](canon/ogilvy.canon-entry.yaml) |
| **The D&AD tradition** | Work judged by peers who make work, for craft and for the idea at once. `/creative-review` is a crit, not a score: separate lenses, separate people, disagreement left on the table. |
| **LoveFrom** | Care in the parts nobody will see. cstack checks favicons, fallbacks, safe zones and loudness for the same reason. |

### Identity, type and the systems that made them repeatable

| | What cstack took |
|---|---|
| **Massimo Vignelli** | Reduction and systems: few typefaces, few sizes, one grid, applied with discipline and judged by meaning, structure and use. And the idea at the heart of cstack: don't only design the artifacts, design the machine that makes them. [canon](canon/vignelli.canon-entry.yaml) |
| **Otl Aicher** | An identity as a rule set (grid, angles, palette) that generates every sign consistently. [canon](canon/otl-aicher.canon-entry.yaml) |
| **Karl Gerstner** | Design the programme, not the solution: named parameters, a table of options to search, a grid that serves many layouts. It is how `/creative-direction` explores. [canon](canon/gerstner-designing-programmes.canon-entry.yaml) |
| **Josef Müller-Brockmann** | The grid derived from the type, as a commitment to clarity that holds while the content changes. [canon](canon/swiss-grid-systems.canon-entry.yaml) |
| **Ellen Lupton** | Letter, text and grid as three scales that must agree, taught as rules with reasons so they can be broken on purpose. *Thinking with Type* is the spine of `/type-director`. [canon](canon/thinking-with-type.canon-entry.yaml) |
| **Robert Bringhurst** | Typography exists to honour content; every rule of measure, scale and spacing carries its reason. [canon](canon/bringhurst.canon-entry.yaml) |
| **Matthew Butterick** | Body text first: four decisions decide most of reading, so fix them with numbers before anything decorative. `cstack type qa` measures them. [canon](canon/practical-typography.canon-entry.yaml) |
| **Erik Spiekermann** | Brief type by the job (languages, readers, media, budget) and choose faces that survive real conditions. [canon](canon/spiekermann.canon-entry.yaml) |
| **Tim Brown, Richard Rutter, Jason Santa Maria and Utopia** | On screens the designer suggests and the reader's device decides: type as rules that hold at any width, zoom and setting. [canon](canon/web-typography.canon-entry.yaml) |
| **Pentagram: Paula Scher and Michael Bierut** | Two durable modes: type as a loud vernacular voice that becomes the identity, and a simple mark in a flexible system that earns meaning through use. [canon](canon/pentagram.canon-entry.yaml) |
| **COLLINS** | A brand is behaviour performed over time: identity with range in type, image and motion, built to flex. [canon](canon/collins.canon-entry.yaml) |
| **Bureau Borsche** | Identity as behaviour and motion rather than a static sheet. |
| **DIA** | Type that moves as a system. Motion is a brand token in cstack (duration, easing, sequence), not decoration. |
| **OK-RM** | Editorial structure as identity, where the system grows out of the content. |
| **Irma Boom** | The publication is an object: format, edge, paper and weight carry the idea. [canon](canon/irma-boom.canon-entry.yaml) |
| **Paul Rand** | A mark is a vessel; meaning accrues from the organization behind it, so simplicity and durability beat explanation. [canon](canon/paul-rand.canon-entry.yaml) |
| **Chermayeff & Geismar & Haviv** | A good mark is simple, appropriate and distinctive, and proves itself across hundreds of applications. `/symbol-design` tests at 32 px for that reason. [canon](canon/chermayeff-geismar-haviv.canon-entry.yaml) |
| **Lance Wyman** | A logo is one part of a programme; icons can carry a city or an event across languages. [canon](canon/lance-wyman.canon-entry.yaml) |
| **Otto Neurath, Marie Neurath and Gerd Arntz (Isotype)** | A picture language is a system: standardized signs, quantity by repetition, and an editor who turns data into image. [canon](canon/isotype.canon-entry.yaml) |
| **The makers of Japanese mon** | A crest is monochrome and enclosed, and families are told apart by small changes to a shared form. The best lesson in symbol systems we know. [canon](canon/japanese-mon.canon-entry.yaml) |

### Perception, research and making

| | What cstack took |
|---|---|
| **Josef Albers** | Perception is relational: a colour means something only next to its neighbours. So cstack judges in context and by comparison, never in isolation. [canon](canon/albers.canon-entry.yaml) |
| **Formafantasma** | Research and material intelligence as the design act. Know where the material comes from before you shape it; it is why `/product-fidelity` locks what the product is really made of. |
| **Sarnoff Mednick and Arthur Koestler** | Good ideas often join things that are not normally linked. It is why every reference search mixes near, middle and far. [canon](canon/associative-creativity.canon-entry.yaml) |
| **Charlie Munger** | A latticework of mental models instead of a list of heroes. The shape of the whole canon. |
| **Bret Victor and Dynamicland** | Interfaces as thinking environments: make the system visible and directly manipulable. `cstack brand check` shows what is known, unknown and in conflict instead of hiding it in a prompt. [canon](canon/bret-victor.canon-entry.yaml) |
| **Ink & Switch** | Local-first: your work lives in files you own. Every brand in cstack is a git repo on its owner's machine. |
| **Andrew Chen** | Growth starts with the smallest network that can sustain itself; density beats reach. [canon](canon/cold-start-networks.canon-entry.yaml) |

### The builders cstack stands on

| | What cstack took |
|---|---|
| **Garry Tan and gstack** | The shape of the whole thing: specialists as slash commands, `/office-hours` before anything, plain Markdown, one-line install, a README that tells you what each skill does. cstack's browser is ported from gstack's under MIT ([NOTICE.md](NOTICE.md)). |
| **Andrej Karpathy** | autoresearch: a frozen test, one variable, keep or discard, a budget and a log of every attempt, failures included. That is `/creative-autoresearch`. ([notes](docs/research/karpathy-patterns.md)) |
| **Taste Labs** | Extract, search, verify: context, creation, verification, correction. And the line we kept: tools provide capability; skills provide judgment. ([notes](docs/research/taste-labs.md)) |
| **The teams whose public repos and products we studied** | Higgsfield, Gooseworks, Bloom, Ad Army, Superside, Rampstack, Wondel and the Lenny skills among them. What we learned and where we disagreed is in [docs/research](docs/research/). |
| **Two working notes on taste** | *Encoding Design Taste for AI-Driven Design Systems* and *Taste / Associative Distance / AI*, the maintainer's own notes and the intellectual floor of this repo: encode taste at the lowest reliable level, treat taste as the objective function and distance as the search radius, and run observe, compare, articulate, decide, encode until it compounds. ([summary](docs/research/taste-influences.md)) |

If we have your method wrong, or you would rather not be here, open an issue and we will fix it.

## Docs

[Architecture on one page](docs/architecture-one-page.md) · [Architecture](docs/architecture.md) · [Philosophy](docs/philosophy.md) · [Quickstart](docs/quickstart.md) · [Provenance](docs/provenance.md) · [Cost and context](docs/cost-and-context.md) · [Evals](docs/evals.md) · [Learnings](docs/learnings.md) · [Skill authoring](docs/skill-authoring.md) · [Research notes](docs/research/) · [Retro](docs/retro.md) · [v0.2 backlog](docs/backlog-v0.2.md)

## License

MIT. Parts of the browser layer derive from [gstack](https://github.com/garrytan/gstack) (MIT, Copyright (c) 2026 Garry Tan); see [NOTICE.md](NOTICE.md).
