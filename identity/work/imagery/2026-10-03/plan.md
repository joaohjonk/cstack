# cstack self-imagery, round 2 (2026-10-03)

PR #11's hand-drawn SVG was rejected. This round uses real image generation on fal, follows cstack's own method, and gives Joao two options to pick from. `docs/images/cstack-hero.svg` and the README are unchanged until he picks.

## Files

| file | what |
|---|---|
| `cstack-hero-poster.jpg` | **recommended.** Seedream 5.0 pro, a cube mid-tumble over a row of inlaid Klein squares, type composited on top |
| `cstack-hero-studio.jpg` | Seedream 5.0 pro, a cube tipping across a tiled Klein floor in north light, type composited on top |
| `cstack-hero-*.svg` | the type layer alone as FreeSans outlines, used for `cstack svg legibility` |
| `contact-sheet.jpg`, `sheet-A-studio.jpg`, `sheet-B-pigment.jpg`, `sheet-C-poster.jpg` | all 12 probes, labelled by territory, model and seed |
| `gold-side-by-side.jpg` | both finals beside the gold reference `ref-nine-stop-line` |
| `brand-hero-photo.flow.yaml` | the method: candidates compared, gates and the stop rule (QA thread: promote to `flows/`) |
| `make_requests.py`, `make_finals.py`, `prompts*.json` | every prompt and request, so the round can be rerun |
| `make_sheets.py`, `../../figures/compose-imagery.py` | the contact sheets and the type composite (FreeSans outlines reused from make-figures.py, the smallest line is 84 px on 2400, so 42 px at 1200) |

The raw probes and finals (`probes/`, `finals/`), their `.gen.json` sidecars, the logs and the local budget change are not committed.

## Method

1. `cstack flows search "brand hero image poster key visual"` found no flow. I wrote a short flow-research note (`brand-hero-photo.flow.yaml`) comparing four approaches:
   - photographic studio generation plus composited type: chosen
   - sculptural generation plus type: chosen, run as territory B
   - a hand-built Blender render: the fallback
   - type set by the model: rejected
2. `cstack spend plan` estimated the 12 probes at $1.02. Every call went through `cstack generate`. The rights check passed: no names, no "style of", no lettering, no reference images, any person fictional.
3. I probed three territories with four images each: A Studio (a cube or a fictional dancer on Klein squares), B Pigment, and C Poster photo. The models were FLUX.2 pro, Seedream 5.0 pro and gpt-image-2. gpt-image-2.5 is not on fal (404).
4. An independent review (ART DIRECTOR and BRAND DIRECTOR lenses) judged the sheets:
   - FLUX.2 pro drifted to navy or slate every time, so it was rejected.
   - gpt-image-2 got the Klein blue right, but the dancer's pose read as a dog and the C cube looked like CGI.
   - The pigment territory (B) had good material but no field, so it was rejected and kept only as a material note.
   - Picks: A-cube on Seedream and C-poster on Seedream, the only model that held Klein blue in both.
5. Finals: two seeds of each pick at 2400x1200 on Seedream 5.0 pro, with the review's fixes (frame mirrored so the left 7 of 12 columns are empty, warm white ground, matte pigment, true squares). I chose seed 42 for both.
6. Composite: `compose-imagery.py` puts the wordmark "cstack." and the lines "Taste, made repeatable." / "Before use: step outside." on the left columns.
7. Checks:
   - `cstack svg legibility --width 1200 --min-px 41`: PASS
   - `cstack audit --size 2400x1200`: PASS on both
   - `cstack flows gate` at make, decide and final: PASS

## Cost (ledger estimates; fal bills later)

| model (fal) | calls ok | booked USD |
|---|---|---|
| fal-ai/flux-2-pro | 6 | 0.27 |
| openai/gpt-image-2 (medium) | 3 | 0.51 |
| bytedance/seedream/v5/pro/text-to-image | 7 (3 probes + 4 finals) | 0.64 |
| **paid total** | 16 | **1.42** |

The ledger shows $1.66. The difference is $0.24 booked for three Seedream submits that returned 404 because the endpoint id carried the wrong `fal-ai/` prefix. Nothing ran, so nothing should be billed. The cap for the round was $10.

## Verdicts

- **Poster (recommended).** One cube, one row of squares, a lot of empty warm white. It is the photographic twin of the nine-stop line: even stops, one move out of rhythm. It reads first as a Swiss poster, the type owns the left side, and it stays calm at 324 px.
- **Studio.** Warmer and more physical, with real north light and a long shadow. The grid is stronger, but there is more going on, so the wordmark has to fight a little harder.
- Both are true Klein blue. The ground is a little cooler than #F6F4EF; a light warm grade is optional, Joao's call.

## Findings for cstack (from this run)

1. There is no flow for a brand hero or key visual. `brand-hero-photo.flow.yaml` is a candidate.
2. The registry's Seedream 5.0 pro fal route is unpriced, and the endpoint id people reach for (`fal-ai/bytedance/...`) 404s. The real id is `bytedance/seedream/v5/pro/text-to-image`, and fal prices it per compute second.
3. A submit that fails before a job exists (HTTP 404) still books its estimate against the day's spend.
4. `flows gate --stage decide|final` fails without FAL_KEY even after the work is made.
5. `npm ci` leaves playwright-core out (it is optional), and the cached Chromium does not match it. The composite uses PIL instead of a browser.
