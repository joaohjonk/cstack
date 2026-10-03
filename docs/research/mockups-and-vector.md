# Mockups and vector / symbol craft (snapshot 2026-10-03)

Scope: what cstack needs to make **mockups** (packaging, apparel, print, signage, device, OOH, social placements) and to handle **marks, symbols, icons and SVG** with studio discipline. All sources were accessed on 2026-10-03 unless a date is given. Evidence labels:

- **observed**: I saw it directly (tool names in this session, local repo code, a page's own content read today).
- **documented**: a vendor's docs, API reference, changelog or a primary paper.
- **marketing**: vendor product copy, launch posts, or third-party listicles. Not verified.
- **inferred**: my reasoning from the above. Treat it as a hypothesis to test on a run.

WebFetch returns a model summary of each page, not raw HTML, so figures from it are `confidence: medium` unless confirmed twice.

---

## 0. The one truth that governs both halves

A model may invent light, folds and context. It may not invent the mark, the label, the type or the legal copy. That is already a cstack rule (PREAMBLE §5, `product-fidelity`, `image-edit`). This note turns it into methods.

- Vendors say the same thing. Krea's packaging guide says to ask for no readable text while exploring and to add real typography later (marketing/guide, 2026-05-29, https://www.krea.ai/blog/ai-tools-product-mockups-packaging-renders). A GPT Image 2 mockup guide says fine-linework logos get "approximated, not reproduced" and that label copy drifts in small ways (https://crepal.ai/blog/aiimage/image-how-to-use-gpt-image-2-for-product-mockups/, marketing).
- **inferred:** the winning pattern is **generate the world, composite the truth, then harmonize light without touching the truth**. A generative pass can relight a composite. Any pixels it changes inside the protected label region are then replaced from the deterministic composite, and the result is verified by an inverse-warp diff.

---

## A. Mockups

### A1. Two families of method

| Family | How it works | Exact marks? | Cost / scale | Where it breaks |
|---|---|---|---|---|
| **Template compositing** (PSD smart object, displacement + shading maps) | A photographed or rendered scene with a placement area. The design is warped into the area (perspective or mesh), displaced by a grayscale map, then multiplied by a shading layer and screened with a highlight layer | Yes, pixel-exact before the warp | Near-free per render once a template exists | Template licensing; one fixed angle; extreme curvature and wraps |
| **3D template** (dieline → folded box; Blender UV scene) | Artwork is UV-mapped onto real geometry and rendered | Yes | Render time; needs a model or dieline | Material realism takes skill; soft goods are hard |
| **Generative edit with references** (Gemini image, GPT Image, FLUX, Seedream, Ideogram, Recraft) | A model gets the product photo plus references and a scene prompt | No: text and logos drift | ~$0.04–0.15 per image (see `model-landscape.md`) | Label drift, geometry drift, inconsistency across a set |
| **Hybrid** (cstack default, inferred) | Generate the scene plate → composite the official art with template math → harmonize light with a masked edit → paste the protected region back → verify | Yes | One paid plate plus local compute | Needs a placement mask and quad/mesh for the generated plate |

### A2. How the template method works (documented and observed)

- **Smart object replacement.** The Photoshop API has `/smartObject` and `/documentOperations` endpoints (`image.adobe.io/pie/psdService/`). They are async jobs on signed URLs, and the replacement "will adjust to fit within the original bounding box while preserving its aspect ratio" (documented, https://developer.adobe.com/firefly-services/docs/photoshop/guides/smart_objects_and_the_api). A competitor says it is Enterprise-only (marketing, https://dynamicmockups.com/?p=1813). Hand scripting (JSX "batch replace smart objects") is still the common DIY route (observed in forum threads, https://community.adobe.com/t5/photoshop-ecosystem-discussions/batch-replace-of-smart-objects/td-p/12415435).
- **Displacement maps.** Photoshop's Displace filter pushes pixels by the gray value of a map. Adobe's guidance is to then blend with Multiply, Overlay or Soft Light (documented, https://www.adobe.com/products/photoshop/displacement-map.html). A 2026-01-28 canvas write-up gives the full browser recipe (documented/practitioner, https://dev.to/javedblch/realistic-fabric-wrinkles-in-real-time-building-displacement-maps-with-fabricjs-nch):
  - Build the map from base-photo luminance (BT.601 `0.299R+0.587G+0.114B`), stretched to 0–255, with neutral 128 outside the garment.
  - Offset = `(d-0.5)*strength`, rotated with the design, with bilinear sampling.
  - Shade = `1-(1-shadeMap)*blendFactor` (about 0.6), multiplied in.
- **Layer stack that reads as real** (inferred from the above plus standard practice): `base photo` → `art warped + displaced, clipped by mask` → `multiply: shading map` (base luminance, levels-adjusted, mid-gray = no change) → `screen: highlight map` (specular only) → `optional: texture overlay` (paper grain, fabric weave at low opacity) → `edge: 0.5–1px feather + slight blur to match lens softness`.
- **Curved surfaces.** For a cylinder (can, bottle, jar), screen x across the visible width maps to label arc length `u = R·asin(x/R)` for a visible radius R. Edges compress, and about 1/3 to 1/2 of the circumference is visible. Add a vertical-ellipse correction for camera pitch. Cones (cups, tapered jars) use a fan-shaped (annular-sector) unwrap. Folded cartons are separate planar quads per panel, each with its own homography and a shading value per face (inferred geometry; standard).
- **3D from dieline.** Pacdora folds a dieline uploaded as SVG or DXF containing only cut and crease lines, one color each, into an interactive 3D box in the browser (documented, https://www.pacdora.com/tools/dieline-to-3d-mockup). Its Editor API is for embedding and quoting, sold to packaging firms by contact (documented press, 2025-07-09, https://technode.global/prnasia/pacdora-empowers-packaging-industry-with-advanced-3d-api-and-dieline-generator/). Pacdora Canvas (2026-06-26) claims the AI concept "is the same file the factory receives" (marketing, https://www.accessnewswire.com/newsroom/en/paper-and-packaging/pacdora-launches-canvas-an-ai-workspace-for-multi-sku-packaging-design-1182175). No public MCP was found.
- **Blender** is reachable from Claude through the official Blender connector, a natural-language interface to the Python API, launched 2026-04-28 (documented by third party, https://mcpplaygroundonline.com/blog/claude-creative-connectors-adobe-blender-ableton). **inferred:** a UV-mapped `.blend` template plus a headless render is the deterministic route for angles that 2D templates cannot do.

### A3. Mockup platforms and MCPs (benchmarks)

| Product | Surface | Evidence | Notes for cstack |
|---|---|---|---|
| **Dynamic Mockups** | REST API plus official MCP `https://mcp.dynamicmockups.com` with env `DYNAMIC_MOCKUPS_API_KEY`. About 20 tools: catalogs, PSD upload, render and batch render, print files, "MockAnything" AI, "MotionMockups" video | documented, https://docs.dynamicmockups.com/ai-assisted-development/mcp | Free tier: 50 credits, watermarked API renders. Pro $15/mo annual ≈ $0.051/credit. Render = 1 credit; MockAnything = 5–15; MotionMockups = 40–160 (documented, https://dynamicmockups.com/pricing/). Claims ~12.5 renders/s (marketing). The best MCP-first mockup benchmark found |
| **Photoshop API** (Firefly Services) | REST, async | documented (link above) | Use your own PSD templates; enterprise access |
| **Adobe for creativity** connector | Remote MCP `adobe-creativity.adobe.io/mcp`, "50+ tools" across Photoshop, Illustrator, Firefly, Express, InDesign and Stock | Third-party documented (https://www.usecarly.com/blog/adobe-mcp/, launch 2026-04-28); Adobe's blog confirms the connector and an export from Claude Design into editable Express (https://www.adobe.com/express/learn/blog/adobe-creativity-connector, 2026-06-17) | Exact tool list unverified. Detect it, do not assume it |
| **Canva MCP** | Generate, edit, search designs; brand kits and templates; export PDF/PNG/JPG/PPTX/MP4 | documented, https://canva.dev/docs/mcp/ | Smartmockups lives inside Canva. Use it for placement mockups the owner already has templates for |
| **Affinity by Canva** connector | Batch adjustments, layer renaming, exports | third party (link above) | Vector/raster production automation |
| **Figma MCP** | `use_figma` (Plugin API JS), `upload_assets`, `get_screenshot`, `html_to_figma`, `weave_*` model runs | observed: tool names in this session | Device and social placement mockups from frames; `figma.createNodeFromSvg` imports SVG (documented, https://developers.figma.com/docs/plugins/api/figma/) |
| Placeit, Mockey, Artboard Studio | Web apps; Mockey also a Shopify app | marketing (https://apps.shopify.com/mockey-ai) | No public API found for Placeit (competitor claim: https://dynamicmockups.com/?p=58401). Human-only route |
| Pacdora | Web, Editor API (sales) | above | Dieline → 3D; the human exports renders |

### A4. Placement families: what to use

| Placement | Deterministic default | Generative role | Gate |
|---|---|---|---|
| Device / screen | Figma frame or HTML → screenshot → homography into a device photo; or a CSS `matrix3d` page screenshot | Background/scene only | Screen pixels match source (inverse-warp diff) |
| Social placement (feed, story, ad preview) | HTML template of the platform chrome with the real asset, rendered in Chromium at the true size | None | Safe zones, size audit (`cstack audit`) |
| Print (poster, card, book) | Planar quad + shading + paper texture | Scene plate | Inverse-warp diff, crop-safe |
| Signage / OOH | Quad or mesh onto a photo of the site; scale check for viewing distance | Plate, weather and light | Legibility at simulated distance (downsample test) |
| Apparel | Displacement + shading from the garment photo, print-area mask | Model/garment plate (see Bezel-type tools) | Print area in bounds; art not stretched beyond ~2–3% (inferred tolerance) |
| Packaging (box) | Dieline → per-panel quads or 3D (Pacdora, Blender) | Environment plate | Panel art = dieline art; barcode readable |
| Packaging (can/bottle) | Cylindrical unwrap + specular screen layer | Plate, condensation | Label OCR or diff after unwarp |
| Product in context | Hybrid (A1) | Plate + light harmonization | `product-fidelity` audits |

### A5. What cstack can do deterministically today and next (Node + Chromium)

Observed: `providers/local/region_paste.mjs` has a pure-Node PNG codec, feathered paste, and a Chromium canvas path through optional `playwright-core` (in `package.json` `optionalDependencies`). It writes new files and never touches inputs.

Inferred, buildable without new dependencies:

1. **Homography warp** (4-point) in pure Node using the existing PNG codec: inverse-map each output pixel with bilinear sampling. Or in Chromium, with CSS `matrix3d` from the 4 corners, or canvas triangle subdivision.
2. **Mesh / cylinder warp**: a grid mesh in pure Node, with the `asin` mapping for cylinders and per-panel quads for cartons.
3. **Displacement**: either SVG `<feDisplacementMap>` in Chromium, or the JS per-pixel recipe above.
4. **Shading / highlight**: canvas `globalCompositeOperation = 'multiply' | 'screen' | 'overlay'` or CSS `mix-blend-mode`. All are native in Chromium.
5. **Template package format** (a decomposed smart object): `base.png`, `mask.png`, `displace.png`, `shade.png`, `highlight.png`, `placement.json` (quad, mesh or cylinder params, print DPI, safe area), plus `LICENSE.txt` / `source` (template licence is a gate).
6. **Verify**: inverse-warp the rendered region back to flat, then compare it to the source art with an edge/SSIM-style diff. This reuses `region_paste`'s outside-region diff idea.
7. **Out of reach without new deps**: SVG → raster at print resolution is fine in Chromium. PSD parsing, DXF folding and true 3D are not; route those to Photoshop API, Pacdora or Blender, or to the owner.

---

## B. Vector and symbol knowledge

### B1. Mark types and when each fits

| Type | Definition | Fits when | Watch |
|---|---|---|---|
| Wordmark | The name set as a custom logotype | The name is short and distinctive; new brands need name recall | Kerning at small sizes; a licensed font is not a logo |
| Lettermark / monogram | Initials; monogram = interlocked letters | Long names; heritage or luxury; app icons | Many look alike; needs a distinctive construction |
| Pictorial | A recognisable object | A memorable, ownable object exists | Literalness; category clichés |
| Abstract | A non-representational form | Diverse portfolio; meaning to be built over time | Needs media budget to gain meaning (Rand: meaning comes from the thing symbolised; principle widely cited, primary page unreachable) |
| Emblem / badge | Name inside a container | Institutions, craft, heritage | Fails reduction; needs a simplified secondary mark |
| Combination + system | Symbol + wordmark lockups | Almost everyone eventually | Define lockups, ratios and clear space |

### B2. Craft checks every master mark must pass (cstack gates)

- **Construction**: a stated grid or geometry (circles, angles, module). Optical corrections are recorded: overshoot of round forms past the baseline and cap height, thinned joins, horizontal strokes thinner than vertical. Whether to center by geometry or by visual mass is noted (inferred practice; Lucide asks for centering "by center of gravity", documented, https://lucide.dev/guide/design/icon-design-guide).
- **Reduction test**: render at 16, 24, 32 and 48 px and at print minimum (e.g. 10–15 mm). Counters must stay open and details must not merge.
- **Single-color test**: one flat color on light and on dark; reversed. Mon are monochrome by definition: "the color does not constitute part of the design" (documented, https://en.wikipedia.org/wiki/Mon_(emblem)).
- **Clear space and minimum size** are defined in units of the mark (for example x-height or symbol width), not in px.
- **Favicon / app icon**: the minimal 2026 set is `favicon.ico` 32, `icon.svg` (can carry `@media (prefers-color-scheme: dark)`), `apple-touch-icon` 180, manifest 192 and 512, and a maskable 512 with a safe zone of a central 409 px circle (documented, Evil Martians, updated 2026-01-21, https://evilmartians.com/chronicles/how-to-favicon-in-six-files-that-fit-most-needs). The safe zone is a circle with radius 40% of icon width (documented, https://web.dev/articles/maskable-icon).
- **Distinctiveness**: compare the silhouette against category competitors and common icon sets. Owner and lawyer handle trademark; cstack never asserts clearance.

### B3. Canon for marks and symbols (mechanisms, not looks)

| Source | Mechanism to transfer | Evidence |
|---|---|---|
| Paul Rand | A mark is a vessel; meaning accrues from the organisation. Simplicity serves survival across media | Primary essay page unreachable (TLS error); book refs |
| Chermayeff & Geismar (& Haviv) | Marks as a portfolio of simple, appropriate, distinctive solutions; test across hundreds of applications | Book *Identify* (2011); studio page needed approval, not read |
| Otl Aicher | Pictograms drawn on a strict grid with limited angles and a palette; a system for an event | documented, https://en.wikipedia.org/wiki/Otl_Aicher (grid; influenced US DOT 1974 symbols) |
| Isotype (Otto Neurath, Gerd Arntz, Marie Neurath) | Quantity by repetition, not scale; flat standardized pictograms; a "transformer" role that edits data into image | documented, https://en.wikipedia.org/wiki/Isotype_(picture_language) |
| Lance Wyman | Icons as wayfinding systems (Mexico 68, Mexico City Metro); a logo as one part of a program | documented, https://en.wikipedia.org/wiki/Lance_Wyman |
| Saul Bass | A reductive mark plus motion/film thinking; marks designed to animate | inferred from well-known work; no source fetched |
| Massimo Vignelli | Already in `canon/vignelli.canon-entry.yaml` | repo |
| Japanese mon | Monochrome, enclosed, family variation through small modification (no cadency) | documented (mon page above). Compass construction is common practitioner lore, not verified |
| Heraldry | Tinctures, the rule of tincture (contrast), blazon as a text spec that regenerates the image | inferred; worth adding as "a mark specified by text" |

### B4. Icon systems: conventions to encode as lint rules

| System | Rules (documented) |
|---|---|
| Lucide | 24×24 canvas, ≥1 px padding, 2 px centered stroke, round caps and joins, radius 2 px (≥8 px shapes) or 1 px, 2 px gap between elements (https://lucide.dev/guide/design/icon-design-guide) |
| Material Symbols | Variable font with axes FILL 0–1, wght 100–700, GRAD −50–200, opsz 20–48; Apache-2.0 (https://developers.google.com/fonts/docs/material_symbols) |
| Phosphor | 6 weights (thin, light, regular, bold, fill, duotone), 16 px design grid per repo, MIT (https://github.com/phosphor-icons/homepage) |
| SF Symbols | Weights, scales, rendering modes, custom-symbol margins and baseline alignment. The HIG page needs JS; the exact counts were not read today (https://developer.apple.com/design/human-interface-guidelines/sf-symbols) |

**inferred rule:** an icon set is a token set. Declare `grid`, `padding`, `stroke`, `caps`, `joins`, `radius`, `min_gap` and `optical_sizes` once, then lint every SVG against them.

### B5. SVG engineering

- **SVGO v4**: `removeViewBox` and `removeTitle` are no longer in `preset-default`, to keep scalability and accessibility (documented, https://svgo.dev/docs/migrations/migration-from-v3-to-v4/). `cleanupIds` can break external references, and `removeDesc` strips a11y text (https://svgo.dev/docs/preset-default/). cstack already avoids new deps, so SVGO is optional (`npx svgo` with the owner's OK).
- **Rules for masters** (inferred practice): keep a `viewBox`; outline all text; no `<image>` rasters inside; no transforms left on paths (flatten); integer or 0.5 px coordinates for icons; `fill="currentColor"` for UI icons; `role="img"` plus `<title>` for standalone; `aria-hidden="true"` for decorative inline; one file per color variant for logos (full color, one-color, reversed).
- **Figma**: the Plugin API has `createNodeFromSvg`, `createVector`, `flatten` and boolean `union`/`subtract`; no `outlineStroke` was found on the global (documented, https://developers.figma.com/docs/plugins/api/figma/). So an SVG master can be pushed into Figma for the owner to edit, while git stays the source.

### B6. AI vector tools: what each really does

| Tool | Output | Evidence | Use for | Limit |
|---|---|---|---|---|
| Recraft V4.1 Vector / Vector Pro (+ Utility variants) | Native SVG | documented: $0.08 / $0.30, ~12–17 s, released 2026-05-14 (https://www.recraft.ai/docs/recraft-models/recraft-v4-1) | Exploration of marks and illustrations in vector | Layer/path quality not specified; generated marks still need human redraw for a master |
| Recraft MCP | Remote `https://mcp.recraft.ai/mcp`, OAuth; raster and vector gen, transforms, styles, vectorize, bg removal, upscale; bills **subscription credits, not API units** | documented, https://www.recraft.ai/docs/mcp-reference/getting-started | Agent access without an API key | The old npm server is deprecated (see `startup-landscape.md`) |
| Recraft vectorize | Raster → SVG, $0.01 | documented (seed registry) | Cheap first trace | Generic tracing artifacts |
| vectorizer.ai | SVG/PDF/EPS/DXF; API $0.20 → $0.05 per image by volume; free test mode | documented, https://vectorizer.ai/pricing | High-quality trace of a raster mark | Paid; still needs node cleanup |
| VTracer | Color tracing, spline/polygon/pixel modes; MIT; Rust with npm and pip bindings (alpha) | documented, https://github.com/visioncortex/vtracer | Local free color trace | Install needed (ask first) |
| Potrace 1.16 (2019) | B/W tracing; SVG/PDF/EPS/DXF; **GPL-2+** | documented, https://potrace.sourceforge.net/ | Best-in-class B/W trace through the CLI if the owner has it | GPL: call as an external binary, never vendor it into MIT cstack |
| StarVector 1B/8B | Image→SVG and text→SVG code; Apache-2.0; CVPR 2025 | documented, https://github.com/joanrod/star-vector | Icons, logotypes, diagrams (its stated strength) | "Will not work for natural images or illustrations" (quoted from repo); self-host GPU |
| Illustrator generative (Text to Vector, Generative Shape Fill, raster→vector) | Native AI vector | documented feature list, https://helpx.adobe.com/fi/illustrator/desktop/use-generative-ai/generate-shape-fills.html | Owner-side exploration | Model version and credits not stated on the page; reach through the Adobe connector is unverified |
| LLM-written SVG | Code | documented: SVGenius found that "all models exhibit systematic performance degradation with increasing complexity", and that style transfer is hardest (https://arxiv.org/abs/2506.03139v1) | Geometric icons, diagrams, construction grids, lockup layouts, edits to existing SVG | Organic marks and complex illustration: no |

---

## C. Benchmarks: companies and practitioners

**MCP-first (verified surfaces):** Recraft (vector gen + vectorize, OAuth), Dynamic Mockups (mockup render, key), Canva (design gen + export), Figma (write to canvas; observed), Adobe for creativity (50+ tools, third-party documented), Affinity by Canva and Blender connectors (third-party documented). Bloom (YC S26) exposes a brand-scoped API/MCP that includes vectorize and remove-bg derivatives with lineage (see `startup-landscape.md`; YC page read today: "the brand layer for agents", https://www.ycombinator.com/companies/trybloom). No Pacdora MCP or public Placeit API was found.

**YC (verified pages only):** the directory search is blocked by robots.txt for agents. Individual pages read today:

| Company | Batch / status | Relevance |
|---|---|---|
| Bloom | S26, active | Brand as callable infra; vectorize derivative |
| Bezel | W25, active: "Digital AI humans that model clothes" (https://www.ycombinator.com/companies/bezel) | Apparel-on-model plates for apparel mockups |
| Booth AI | W23, acquired (https://www.ycombinator.com/companies/booth-ai) | Generative product photography: a category that consolidated |
| Unfaze AI | S20, inactive (served at https://www.ycombinator.com/companies/latent-studio) | Same category, a cautionary tale |
| Magic Patterns | W23, active (https://www.ycombinator.com/companies/magic-patterns) | UI prototyping (device-mockup source frames) |
| Parade | S20; Launch HN 2021: "Launch your company without hiring a designer" (via HN Algolia API) | Early logo/brand-kit automation |

**inferred:** No YC company was found whose core is deterministic, label-exact mockups or vector-master craft. The funded pattern is generative photography plus brand context, and that category is consolidating (Booth acquired, Unfaze inactive). That gap is cstack's opening: exactness and verification.

**Practitioner workflows (what people post and teach in 2026):**
- *"Recraft V4 concepts → narrow to 3 → Recraft Pro SVG → Illustrator refine (1 h vs 8 h)"*: blog, 2026-03-21, updated 2026-10-03 (marketing/practitioner, https://ropewalk.ai/blog/best-ai-tools-graphic-designers-2026).
- *"Explore with no readable text → integrate real art in design software → validate against dieline or proof"* (Krea guide, above).
- *Nano Banana product-mockup pipelines* on Segmind/muapi take a base product image plus a prompt with no separate label channel (documented workflow page, https://www.segmind.com/pixelflows/ai-driven-product-mockup-creation-nano-banana-pro). **inferred:** this is why label drift is common in what people post.
- Mockup aesthetics in 2026: minimal device frames, slight 3D tilt and real shadows, motion/video mockups for social. Out: isometric scenes and neon (marketing, https://screenhance.com/blog/mockup-trends-2026, updated 2026-08-31). Dynamic Mockups' MotionMockups and the Instagram "reel mockup" templates (https://harshitfx.gumroad.com/l/reel-mockup) point the same way: **motion mockups are now table stakes on social**.

---

## D. Best flows by outcome (decision trees)

Notation: **D** = deterministic, **G** = generative, ▣ = gate. Costs are snapshots from the sources above.

### D1. Packaging mockup from a real dieline
1. ▣ The dieline is official (SVG/PDF/DXF with cut, crease and bleed layers named); the art is placed on it; the barcode is real. Missing → stop and ask (`product-fidelity` rule).
2. **D** Split panels from the dieline into flat panel PNGs at print DPI (Chromium renders the SVG).
3. Choose the render route: (a) box/carton → per-panel quads onto a template or a generated plate, or Pacdora/Blender for 3D (human or connector); (b) cylinder → `asin` unwrap; (c) pouch or soft → displacement + shading template.
4. **G (optional)** Environment plate via `generate-media` with an empty pack silhouette or a placeholder block (cheap model, 2–4 probes).
5. **D** Composite, shade, highlight. **G** masked harmonize pass outside the label region only. **D** paste the label region back.
6. ▣ Inverse-warp diff vs. panel art; barcode decode where possible; `creative-review` PRODUCTION lens; owner.
- Fallbacks: no Chromium → pure-Node quads; no plate budget → studio seamless gradient (D).
- Failure modes: art placed on a stale dieline; bleed visible; the harmonize pass bleeds into the label; perspective mismatch between panels.

### D2. Product-in-context mockup preserving the label
1. ▣ Product entity locked (`product-fidelity`); official packshot cut out (or 3D) and label art available.
2. **G** Plate with an empty hand pose or surface, matching camera height and lens to the packshot (best edit-arena models: `gpt-image-2.5-sunburst`, `gemini-3.1-flash-image`, `seedream-5.0-pro`, `flux-3-image`; ~$0.05–0.15).
3. **D** Place the packshot (homography), contact shadow (multiply blurred ellipse), color match.
4. **G** Masked relight/integration with the label region excluded; **D** paste back the label region from the composite.
5. ▣ Silhouette diff, label diff, color delta vs token; two failures → switch to a 3D or photo shoot.

### D3. Logo / symbol: exploration → refinement → vector master → system
1. `brief` skill: name, attributes as *mechanisms*, applications list (favicon to signage), competitors. ▣ owner.
2. **Research**: `competitor-intel` silhouettes of category marks; canon mechanisms (B3); `flow-research` if no fresh flow exists.
3. **Explore (cheap, wide)**: hand-sketch prompts → Recraft V4.1 Vector ($0.08) or raster models for form; LLM-SVG only for geometric constructions. 20–40 thumbnails, judged in **monochrome at 32 px first**. ▣ owner picks 2–3 directions.
4. **Refine (human-led)**: redraw on a construction grid in Illustrator, Figma or Inkscape. The agent can generate the grid, measure, and propose optical corrections as SVG overlays. Generated SVGs are *references*, never masters.
5. **Master**: clean SVG (B5), one-color, reversed, and full-color files; lint (§E). ▣ The owner approves; the mark is never self-approved (PREAMBLE §4).
6. **System**: lockups (horizontal, stacked, symbol-only), clear space, minimum sizes, favicon and app-icon set, misuse sheet; encoded through `identity-system` into `brand-system.json logo_marks`.
- Failure modes: approving a generated raster as the logo; a mark that dies at 16 px; similarity to a known mark; font licence on a wordmark.

### D4. Icon set with consistency
1. Declare the grid tokens (B4 table: e.g. 24 grid, 2 px stroke, round caps, radius 2/1, 2 px gaps) or adopt an open set (Lucide ISC, Material Apache-2.0, Phosphor MIT) and **extend** it instead of inventing.
2. Draft: LLM-written SVG within the grammar (geometric icons are where LLM-SVG works); Recraft vector with a style for illustrative sets; StarVector if self-hosted.
3. **D** Lint every icon (stroke, caps, padding, coordinates, currentColor); normalize; render a 16/20/24 contact sheet on light and dark.
4. ▣ `creative-review` (consistency lens) plus owner. Metaphor clarity is a judge call, not code.

### D5. Vectorize a raster mark
1. ▣ Provenance: is this the official mark? Is a vector already in `assets/official/`, the website's SVG, or the brand guidelines PDF (often embedded vector)? Retrieval beats tracing.
2. Upscale and clean the raster (D: threshold/levels; G optional: crisp upscale $0.004 on Recraft).
3. Trace: B/W → Potrace if installed; color → VTracer locally, or vectorizer.ai ($0.05–0.20) / Recraft vectorize ($0.01).
4. **D** Lint: node count vs. a simplified baseline, colors snapped to tokens, overlay diff against the raster at 512 px.
5. ▣ Human cleanup for anything that will be a master (curves, symmetry, optical fixes). Mark it `provisional` until the owner signs off.

---

## E. Deterministic checks cstack can run (no new deps: Node + optional Chromium)

| Check | Method | Fail when |
|---|---|---|
| `svg.structure` | Parse in Chromium DOM (or a regex pre-pass) | No `viewBox`; `<image>`, `<text>`, `<script>`, `foreignObject` present in a master; external hrefs |
| `svg.complexity` | Count paths and nodes (path command tokens) | Above budget for the type (e.g. icon > 300 nodes; mark > 1,500), or a 5× jump vs. the previous version |
| `svg.palette` | Collect fills and strokes | Colors not in brand tokens; > N colors; gradients in a one-color variant |
| `svg.stroke` | Collect stroke-width, linecap, linejoin | Mixed values inside an icon set's declared grammar |
| `svg.grid` | Coordinates mod grid; padding from bbox via `getBBox()` | Off-grid coordinates beyond tolerance; padding < declared |
| `svg.reduction` | Rasterize at 16/24/32/48 and at 512 downsampled; compare ink maps | Closed counters fill (enclosed-hole count drops); details merge (connected components change) |
| `svg.onecolor` | Force every fill to black, render on white and reversed | Silhouette loses distinguishing holes vs. full color |
| `svg.centering` | Geometric bbox center vs. ink centroid | Offset > declared tolerance (report both; the owner decides optical intent) |
| `svg.contrast` | WCAG contrast of mark colors vs. allowed backgrounds | Below 3:1 for graphical objects |
| `icon.maskable` | Ink outside a 40%-radius circle at 512 | Any important ink outside |
| `favicon.set` | Files present at the 6 sizes; SVG dark-mode media query optional | Missing file |
| `mockup.label_diff` | Inverse-warp the region, diff against the source art | Edge/SSIM diff over threshold |
| `mockup.template_licence` | `placement.json` licence field present | Missing or "unknown" for client-facing use |

---

## Unreachable sources
- ycombinator.com/companies search: robots.txt disallowed. Only individual company pages were read. HN Algolia API via curl was blocked by the proxy; WebFetch worked.
- paul-rand.com: TLS certificate failure. cghnyc.com/books: permission request timed out.
- pacdora.com/api: HTTP 502. Apple HIG and Material design pages: JS-rendered, details not readable.
- X and Instagram posts could not be read directly (search engines returned blogs instead). Practitioner evidence above is therefore blogs and vendor guides, labelled as such.

---

## cstack implications

### Proposed skills (contract summaries)
| Skill | Contract summary |
|---|---|
| `mockup` | **In:** approved art (SVG/PNG from `assets/official/` or approved work), placement type, template package or a plate request. **Process:** pick a route via the A4 table → D1/D2 → composite → masked harmonize → paste back the protected region. **Out:** `work/mockups/<id>/` with `placement.json`, renders, `.gen.json`, diff report. **Gates:** label diff, template licence, `product-fidelity` when product is present. **Missing input:** no official art → stop. |
| `symbol-design` | **In:** brief, applications list, competitors. **Process:** D3 steps 2–4: research, wide cheap exploration judged mono-at-32px, construction-grid overlays, optical-correction proposals. **Out:** exploration sheets, direction docs. Never writes a master; never self-approves. Hands off to `vector-master`. |
| `vector-master` | **In:** a human-refined or traced SVG. **Process:** clean (B5), lint (§E), export the kit: color variants, lockups, favicon/app-icon set, PDF/EPS through an external tool if present. **Out:** `work/marks/<id>/kit/`, lint report; on approval, `cstack brand set logo_marks`. Owns D5 (vectorize). |
| `icon-system` | **In:** grammar tokens or a base open set. **Process:** D4. **Out:** `brand/icons/*.svg`, `icons.tokens.json`, contact sheet, lint report. |

`identity-system` keeps logo *usage rules*. Change its "drawing a logo" line to point to `symbol-design` → `vector-master`. The `packaging` workflow's `mockups` step should call `mockup` instead of `image-edit`.

### CLI and workflows (proposed; none of these commands exist yet)
- `cstack mockup render --template <dir> --art <svg|png> --out <png>` (homography, mesh, cylinder, displacement, multiply/screen; pure Node with a Chromium fallback); `cstack mockup verify` (inverse-warp diff).
- `cstack svg lint <file|dir> [--grammar icons.tokens.json]`, `cstack svg reduce-test`, `cstack svg kit` (variants + favicon set).
- Workflows: `logo-system` (D3 with owner gates at brief, directions and master), `icon-set` (D4), `mockup-set` (D1/D2 across placements, `spend plan` for plates).

### research-tools.json entries (proposed)
| id | access | detect | fallback |
|---|---|---|---|
| `dynamic-mockups` | mcp `https://mcp.dynamicmockups.com`, env `DYNAMIC_MOCKUPS_API_KEY` (vendor); REST API; free tier watermarked | `mcp__*dynamic*mockups*__*`, env | Local `cstack mockup render` with an owner template |
| `recraft` | mcp `https://mcp.recraft.ai/mcp` OAuth (subscription credits); REST API env `RECRAFT_API_TOKEN` (cstack-proposed name; vendor name unverified) | `mcp__*recraft*__*`, fingerprints `vectorize_image`, env | Hand sketches + LLM-SVG for geometric marks; local VTracer/Potrace for tracing |
| `adobe-creativity` | mcp `https://adobe-creativity.adobe.io/mcp` (Claude connector) | `mcp__*adobe*__*` | Owner works in Adobe apps; export SVG/PSD into the project |
| `canva` | mcp (canva.dev/docs/mcp) | `mcp__*canva*__*` | Owner exports placements |
| `pacdora` | browser (human); Editor API by sales | files `references/pacdora/**` | Per-panel quads, or Blender |
| `blender` | Claude connector / local Blender Python | `mcp__*blender*__*`, cli `blender` | 2D template route |
| `vectorizer-ai` | API (paid credits; free test mode), env `VECTORIZER_AI_API_ID`/`_SECRET` (cstack-proposed) | env | VTracer, Potrace, Recraft vectorize |
| `vtracer` / `potrace` | local CLI (MIT / GPL-2+, external binary only) | cli `vtracer`, `potrace` | Cloud vectorizers (ask before spend) |
| `figma` (update) | existing | existing | Add `cstack_skills`: `mockup`, `vector-master`, `icon-system` |

### Model registry entries (proposed; verify before merge)
| model_id | provider | modality | capabilities | price snapshot (source, date) |
|---|---|---|---|---|
| `recraft-v4.1-utility-vector` / `-utility-pro-vector` | recraft | vector | text-to-vector-svg, icon, illustration | $0.08 / $0.30, 14 s / 17 s (recraft.ai/docs/recraft-models/recraft-v4-1, 2026-10-03) |
| `vectorizer-ai` | vectorizer.ai | vector | image-to-vector (SVG/PDF/EPS/DXF) | $0.20 → $0.05 per image by plan (vectorizer.ai/pricing, 2026-10-03) |
| `starvector-8b` / `-1b` | open weights (self-host) | vector | image-to-svg, text-to-svg (icons, logotypes, diagrams) | $0 licence, GPU cost (github.com/joanrod/star-vector, 2026-10-03), `access: self_host`, confidence medium |
| `dynamic-mockups-render` | dynamic-mockups | image | template-mockup (deterministic PSD), batch | 1 credit ≈ $0.051 on Pro (dynamicmockups.com/pricing, 2026-10-03) |
| `dynamic-mockups-mockanything` | dynamic-mockups | image | generative-mockup | 5–15 credits (same) |
| `dynamic-mockups-motionmockups` | dynamic-mockups | video | motion-mockup | 40–160 credits (same) |
| `photoshop-api-smartobject` | adobe | image | smart-object replace, actions | Enterprise contract; price unverified (developer.adobe.com, 2026-10-03), confidence low |

### Canon entries to add (format of `canon/*.canon-entry.yaml`)
```yaml
id: isotype
name: Isotype (Otto Neurath, Gerd Arntz, Marie Neurath)
kind: movement
domains: [information design, pictograms, symbols]
mental_model: 'a picture language is a system: standardized flat signs, quantity by repetition, an editor who transforms data into image'
mechanisms:
- show more by repeating the same sign, never by enlarging it
- flat, perspective-free pictograms drawn to one grammar
- a named transformer role between data and drawing
representative_works: [Gesellschaft und Wirtschaft atlas (1930), Gerd Arntz pictogram archive]
when_useful: [icon systems, data-led campaigns, wayfinding]
when_not_useful: [expressive one-off marks, luxury contexts that rely on ambiguity]
tensions: ['universality claims vs. culturally specific signs']
sources:
- kind: external_reference
  ref: https://en.wikipedia.org/wiki/Isotype_(picture_language)
added: '2026-10-03'
added_by: cstack research
status: current
---
id: otl-aicher
name: Otl Aicher
kind: person
domains: [pictograms, identity, systems]
mental_model: 'an identity is a rule set (grid, angles, palette) that generates every sign consistently'
mechanisms: [strict construction grid with limited angles, one palette across an event, pictograms as a family]
representative_works: [Munich 1972 Olympic pictograms, Lufthansa identity, Rotis]
when_useful: [icon sets, event and wayfinding systems]
when_not_useful: [warm, handmade or vernacular brands]
tensions: ['system rigor vs. character']
sources: [{kind: external_reference, ref: 'https://en.wikipedia.org/wiki/Otl_Aicher'}]
added: '2026-10-03'
added_by: cstack research
status: current
---
id: paul-rand
name: Paul Rand
kind: person
domains: [identity, logos]
mental_model: 'a mark is a vessel; meaning accrues from the organization it stands for, so simplicity and durability beat explanation'
mechanisms: [reduce to the fewest distinctive forms, test in every medium, present one strong answer with its rationale]
representative_works: [IBM, Westinghouse, UPS (1961) marks]
when_useful: [mark exploration critique, resisting literal briefs]
when_not_useful: [brands whose value is complexity or narrative illustration]
tensions: ['one-answer presentation vs. owner sovereignty in cstack']
sources: [{kind: external_reference, ref: 'Paul Rand, Design, Form, and Chaos (book)'}]
added: '2026-10-03'
added_by: cstack research
status: current
```
Also propose `chermayeff-geismar-haviv` (book *Identify*, 2011: portfolio of simple, appropriate, distinctive marks), `lance-wyman` (icons as wayfinding programs) and `japanese-mon` (monochrome, enclosed, variation by small modification). Mark `saul-bass` and `heraldry` `status: provisional` until sources are fetched.

### Eval fixtures (proposed, in `evals/fixtures/`)
- `mockup-logo-must-composite.yaml`: the brief asks for a can mockup; expect a composite of the official label with cylindrical unwrap, never a generated label.
- `mockup-harmonize-leaks-label.yaml`: the relight pass altered label pixels; expect paste-back of the region and a re-run of the diff.
- `mockup-template-licence-unknown.yaml`: expect the client-facing render to be blocked until the licence is recorded.
- `logo-generated-raster-as-master.yaml`: expect refusal to approve; route to `vector-master` with human refinement.
- `mark-fails-16px.yaml`: an SVG whose counters close at 16 px; expect `svg.reduction` fail and a proposed simplified small-size variant.
- `icon-set-mixed-strokes.yaml`: expect `svg.stroke` fail with the offending files listed.
- `vectorize-when-vector-exists.yaml`: an official SVG exists in the guidelines PDF; expect retrieval, not tracing.
- `llm-svg-organic-mark.yaml`: an owner asks the agent to "just write the SVG" for an organic mascot; expect the SVGenius limit to be cited and a vector-model route plus human refinement.
