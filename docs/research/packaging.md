# Packaging: design method, shelf, print proof, food still life (snapshot 2026-10-03)

Research behind `flows/packaging-system`, `flows/shelf-test`, `flows/print-proof-loop`, `flows/food-still-life` and the `workflows/packaging` steps. It came out of a field run on a packaged-food brand; only general rules are kept here. All sources were checked on 2026-10-03. WebFetch returns a model summary of each page, so a figure read once is `confidence: medium`. Labels: **documented** (standard body, regulator, vendor docs), **practitioner** (people who do the work, posted with method), **marketing**, **inferred** (my reasoning; test it on a run).

## Answer first

1. **Get the converter spec before designing.** Process (flexo, offset, gravure, digital), substrate, ink count, white underlay, colour targets and minimum order decide what the design can be. Standards differ per process, so "the colour" is a target per substrate, not one hex value.
2. **Test on a shelf, not on white.** Findability (a buyer looking for you) and standout (catching a buyer who isn't) are measured against the real competitor set, at distance and for a short exposure. A redesign that slows the find task loses loyal buyers.
3. **A proof is a measurement, not a picture.** Colour passes or fails on spectro readings against the agreed targets, viewed under ISO 3664 light. A photo of the proof is the record and the content check (copy, barcode, registration, dieline fit). It is never the colour verdict.
4. **Edible texture is product truth.** Images on food packs must not mislead about what is inside (EU 1169/2011 Art. 7; US FD&C Act 403(a)). Shoot the real product with hero selection. Generate only plates and mood, never the food the pack sells.
5. **A label change is a stock decision too.** Over-sticker, run-out or write-off is an owner call, made from the regulator's transition rules and counsel. Don't assume a transition period exists.

## 1. Print standards and colour targets per substrate

| Fact | Source | Kind |
|---|---|---|
| ISO 12647-6:2020 covers process control for **flexographic** printing of packaging (labels, boxes, flexible packages) and publication. It defines how aims for four-colour flexo are exchanged, and gives guidance on spot colour definitions | https://ccn-scc.ca/standardsdb/standards/8174467 | documented |
| ISO 12647-2:2013 (offset) brought new aims. FOGRA51 = PSO Coated v3, premium coated paper (PC1). FOGRA52 = wood-free uncoated white paper (PC5). Both handle optically brightened papers better | https://www.intergraf.eu/communications/latest-news/item/114-new-printing-conditions-for-iso-12647-2 (2015-11-12) | documented |
| G7 is a calibration method: grey balance to a Neutral Print Density Curve, "regardless of substrate, line count, ink type or printing condition". Used on offset, flexo, gravure, inkjet and more. It is not an ISO standard and not an ICC system | https://www.printing.org/detail/resource/G7-Methodology | documented |
| G7 has three levels. **Grayscale**: neutrals on the G7 curve. **Targeted**: also solids for CMY and RGB plus substrate colour within spec. **Colorspace**: matches a whole reference print condition | https://www.labelandnarrowweb.com/contents/view_breaking-news/2018-01-30/idealliance-introduces-three-tier-g7-master-qualification-program/ | documented (trade press) |
| ISO/DIS 15339-2 (characterized reference printing conditions, CRPCs, independent of process) is a draft. Its DIS ballot closes 2026-09-01. It replaces the withdrawn ISO/PAS 15339-2:2015 | https://committee.iso.org/standard/89376.html | documented |
| A brand-owner colour schema asks for: ISO 3664 viewing, ISO 13655 measurement, PDF/X-4 with GWG 2015 Pack Spec, ISO 12647-6 aims for flexo, mid-tone and min-dot verified on plates, and **brand/spot colours at ΔE00 < 2**. The converter delivers certificates (rub, lightfastness, coefficient of friction) | https://printtechnologies.org/standards/files/aptech-brand-owner-council-schema-v2020.pdf | practitioner (industry body) |
| FTA FIRST 7.0 is the flexo process-control manual: specifications, not standards. It covers design, prepress (including proofing for expanded gamut) and print | https://www.flexography.org/first/ | documented |
| Digital (e.g. HP Indigo) competes with flexo on flexible packaging "in runs up to about 25,000" because it has no plate costs. It suits many SKUs and versions. Flexo carried about 75% of flexible packaging volume (2017) | https://www.piworld.com/article/flexing-muscle-digital-printing-makes-inroads-flexible-packaging-production/ (2017-04-10) | practitioner (trade press, dated) |

**Inferred rules for cstack:**
- The converter spec names: process, press or proofing condition (a FOGRA dataset, G7 level or the converter's own fingerprint), substrate (paperboard, coated or uncoated paper, PET/BOPP/PE film, metallised, kraft), whether white underlay is used on film, ink count and spot colours with their targets, varnishes, minimum order and price breaks, lead time, proof type and tolerance. One spec per substrate and process. If a brand colour is printed on two substrates, it gets two targets.
- Digital first runs keep plate and minimum-order risk low while the design is new. Flexo or gravure take over at volume. The converter's quote decides; this is not a design rule.
- FIRST 7 Design Guide numbers (minimum type, reverse line widths, trapping) are **unverified here**: the PDF was too large to fetch (https://www.flexography.org/wp-content/uploads/2022/09/FIRST-7-Design-Guide-v2.pdf). Take those minimums from the converter.

## 2. Barcodes (GS1)

| Fact | Source | Kind |
|---|---|---|
| EAN-13 at 100%: X-dimension 0.330 mm, about 37.29 × 22.85 mm including quiet zones. Common magnifications run 80–150%. Don't truncate the height unless unavoidable. Resize in proportion | https://www.gs1uk.org/knowledge-hub/barcodes/how-big-should-a-point-of-sale-barcode-be | documented |
| EAN-13 on consumer items: X min 0.264, recommended 0.330, max 0.660 mm. Height min 18.28, recommended 22.85 mm. Quiet zones: **left ≥ 11X, right ≥ 7X** | https://gs1.se/en/guides/how-to-guides/size-guide/ | documented |
| Placement: lower right quadrant of the back, near an edge, **8–100 mm from the nearest edge**. Keep it off perforations, folds, seams, ridges and shrink-wrap creases. Curved surfaces can lose the symbol ends. Picket-fence orientation is preferred | https://www.gs1.org/docs/barcodes/GSCN-23-169-BarcodePlacement.pdf | documented |
| Print quality: turn the bars parallel to the print direction, increase bar width reduction to widen spaces, and put a white underlay under the barcode on transparent or coloured substrates | https://www.gs1uk.org/sites/default/files/how_to_improve_barcode_image_quality.pdf | documented |

**Inferred:** a barcode passes only on a verifier grade from the printed proof (the converter or a GS1 member organisation runs the verifier), never on screen. In cstack the barcode is placed from the official number and settings, and it is never generated or redrawn by an image model.

## 3. Dielines

- The 3M dieline requirements say each line type (cut, crease or fold, perforation, outside bleed, copy limit) is a **unique named spot colour** with a 1 pt stroke. The dieline marks no-copy zones (hidden when erected), no-print zones (glue areas: no ink or varnish), barcode restrictions and coding areas (lot and date), and carries a creation date (https://multimedia.3m.com/mws/media/2619412O/global-packaging-dieline-requirements.pdf). Kind: practitioner (a brand owner's spec).
- **Inferred:** the dieline comes from the converter, never from a template site, and carries a version and date. Artwork placed on an old dieline is the most expensive failure in the workflow.

## 4. Proofs and viewing

| Fact | Source | Kind |
|---|---|---|
| A contract proof is "the visual reference with colour fidelity" for printer and buyer and the "reference in case of dispute". ISO 12647-7 sets proofing criteria, checked with the Fogra MediaWedge CMYK V3 | https://fogra.org/en/certification/prepress-technology/contract-proof-creation | documented |
| "There is no proof without an Ugra/Fogra Media Wedge, it's just a pretty picture" | https://www.colourmanagement.hosting9.idnet.net/advice/proof-printing/ | practitioner |
| ISO 3664 viewing: D50, 2000 lux at the viewing surface, CRI ≥ 90 | https://www.fespa.com/en/news-media/standard-lighting-conditions-for-wide-format-printers-and-their-many-markets/ | practitioner (summary of the standard) |
| One printer's proof tolerances, as an example (not ISO): average ΔE00 < 1.5, max < 6.0 for 95% of patches, solids < 5.0, grey balance avg 2.0 / max 3.0 | https://www.quad.com/wp-content/uploads/2023/11/quad-proof-report-user-guide.pdf | practitioner |
| Camera profiling with a colour chart (ICC or DNG) gives usable but lower-quality colour correction than measurement workflows | https://www.jpmtr.org/index.php/journal/article/view/97 (Ahtik) | documented (paper; numbers not read) |

**Unverified:** the exact ISO 12647-7 tolerance numbers. No fetched page gave them. Use the tolerance written in the converter spec.

**Inferred proof loop:** (1) the approved file is frozen with a hash. (2) The converter supplies a proof on the real substrate (a press proof, or a digital proof on that substrate) with a control strip and its measurement report. (3) The owner views it under D50 next to the contract proof. (4) A photo is taken under a fixed light with a colour chart in frame, for the record and for a content check against the file: copy, barcode, dieline fit, registration, missing or extra elements. (5) Sign-off names the proof, the file hash and the measurements. cstack has no command that compares a photographed proof to a file. `cstack mockup verify` is tuned for pixel-exact renders and will fail on real light, so this check is human, side by side.

## 5. Shelf impact and findability

| Fact | Source | Kind |
|---|---|---|
| Find task: respondents find the current and the new pack on a simulated shelf "with relevant competitors". If the new one takes clearly longer, keep more of the old pack's elements | https://www.blauw.com/en/method/package-check | practitioner |
| Metrics: time to first fixation, first-fixation share, total fixation duration, and areas of interest (brand, descriptor, claim, flavour cue, size). The shelf should reflect width, facings, brand blocking, competitor colours and price labels. The set includes leaders, the closest substitutes, likely look-alikes and the brand's own neighbouring variants | https://insights.realeye.io/packaging-shelf-test-research (2026-07-22) | practitioner (vendor) |
| Standout and findability are different measures. Loyal buyers find a pack by colour block, silhouette or logo position. "A design tested on a white background hasn't been tested for standout at all." Three-second hierarchy test: show, remove, ask what it is, who it's for, the main claim. Test at shelf distance and at e-commerce thumbnail size. Monadic cells of about 200 completes | https://www.surveymonkey.com/learn/market-research/packaging-design-testing/ (2026-09-01) | practitioner |
| Simulated aisles measure time at shelf, time to cart and pick-up | https://aytm.com/post/is-your-packaging-leaving-money-on-the-shelf (2025-10-02) | marketing |
| Eye-tracking within a shelf set; flash exposure (tachistoscope-style) for impact and findability; sequential-monadic options | https://packagingstrategies.com/articles/92095-assessing-what-consumers-see (2004) | practitioner (old, method still used) |
| "First moment of truth": 3–7 s; UK fieldwork suggests under one second to earn attention | https://www.ecolean.com/news/shoppers-insight-why-packaging-is-your-most-reliable-advantage (2026-02-23) | marketing (secondary) |

**Inferred method for cstack:** capture the competitor set as front-panel photos at known scale (`competitor-intel`, store visit or retail listings). Lay out a planogram at true millimetre scale as a local HTML page in the workspace, and screenshot it with `cstack browse shot`. Make variants: candidate vs current, candidate in two shelf positions, and a blur/downscale version for distance. For distance, assume about 1 arcminute of visual acuity: a 1.2 m bay subtends about 23° at 3 m, which is about 1,400 resolvable pixels across. Rendering the bay about 1,400 px wide therefore approximates a far view; that is an inferred proxy, not a perception model. The find test itself is human. Show each person one shelf image for a fixed time (e.g. 2 s), ask them to point to the product, and log time to find and hit or miss. Five to eight people per variant catch gross failures; a launch decision needs a commissioned monadic study. AI attention heatmaps are advisory only.

## 6. Food still life and ingredient texture

| Fact | Source | Kind |
|---|---|---|
| Food information must not mislead "by means of the appearance, the description or pictorial representations" about the presence of a food or ingredient (Art. 7(1)(d)) | https://www.legislation.gov.uk/eur/2011/1169/article/7 | documented (regulation) |
| A pictured food should generally be present in the food as an ingredient. Flavourings and extracts generally shouldn't be shown front of pack. "Serving suggestion" applies where items are shown for decoration or the food needs preparation. Emphasis should be proportional to presence | https://www.culinaria-europe.eu/download/culinaria-europe-guidance-on-pictorial-representations-names-or-allusions-of-ingredients.pdf (2018-12-24) | practitioner (industry guidance) |
| US: no rule requires "serving suggestion", but FD&C Act 403(a)(1) bans labeling "false or misleading in any particular". Staging is allowed; showing foods not in the pack can mislead | https://www.packaginglaw.com/index.php/ask-an-attorney/what-are-labeling-rules-governing-principle-display-panel-pdp-photos (2007-08-20) | practitioner (law firm; old) |
| AI food images alter label text, portion, ingredients and pieces, and mishandle "colour, crumb, marbling, browning, texture, doneness" and melt, drip or steam cues | https://nightjar.so/help-desk/what-are-the-technical-limitations-of-using-ai-for-food-product-photography (2025-12-13, reviewed 2026-08-19) | marketing (vendor, candid) |
| Ask for many units of the real product and shoot only hero pieces. Fill the pack with perfect pieces rather than fixing in post. Agree with the client what the hero looks like | https://fstoppers.com/hero-food-in-recipes-and-products (2013-11-25) | practitioner |
| Stylist kit and timing: tweezers, swabs for crumbs and smudges. Plan around components that degrade fast. One light change or one turn of the product changes the result | https://www.americastestkitchen.com/articles/765-photo-shoot-tips-from-a-professional-food-stylist (2017-10-05) | practitioner |
| Texture: side light makes shadows and highlights, back light gives a glowing edge, macro lens at small apertures, tripod and tethered capture | https://www.nikon.pl/pl_PL/learn-and-explore/magazine/tips-and-tricks/9-macro-food-photography-styles-and-how-to-achieve-them | practitioner (manufacturer) |

**Inferred rules:** (1) The edible product in a pack or product image is shot from real units or composited from real photos; a model never draws it. (2) Every pictured ingredient is checked against the ingredient list (`claims-proof`) before the shot list is final. (3) A neutral "as-is" reference capture (same light, colour chart, ruler) of an average unit is taken before styling. The final image is compared with it for colour, inclusion density, size and crumb, so styling selects without inventing. (4) Generated plates (surface, backdrop, props) are fine when the food is real; generated food is allowed only on mood boards marked not for pack.

## 7. Label changes with existing stock

| Fact | Source | Kind |
|---|---|---|
| USDA FSIS (meat and poultry): pressure-sensitive stickers may correct labeling if the whole label is then truthful. Stickers must destroy the label or package if removed, or be self-destructive. Stickers with special claims or nutrition changes need sketch approval | https://www.usda.gov/sites/default/files/guidance-documents/FSIS.%20Pressure%20Sensitive%20Stickers.pdf | documented (guidance, undated) |
| FDA 2020: temporary flexibility for minor formulation changes, encouraging stickers, digital disclosure and point-of-sale labeling. It excluded allergens and characterizing ingredients and was explicitly temporary | https://www.thefdalawblog.com/2020/05/fda-provides-additional-temporary-flexibility-concerning-labeling-of-foods-for-humans/ | practitioner (law blog on FDA guidance) |
| Brazil: RDC 429/2020 and IN 75/2020 deadline 2024-04-22. RDC 819/2023 allowed using up old packaging stock until October 2024; a federal court blocked that extension | https://idec.org.br/release/lupa-nos-alimentos-prazo-para-adequacao-de-rotulos-e-embalagens-termina-em-22-de-abril | practitioner (consumer body; check ANVISA primary text per run) |

**Inferred decision frame (the owner decides, with counsel for anything legal):** count stock (printed packs, packed units, units at retail), its cost, and the weeks to run out at current velocity. Then check what the regulator allows: is an over-sticker permitted, must it be tamper-evident, may stock be sold through, and until when? A transition period can be withdrawn, as Brazil's was. Options: **run-out** (allowed and the date holds), **over-sticker** (allowed; the sticker spec goes to the converter, gets proofed and is checked on a sample), **write-off** (neither allowed, or stickers would mislead or cover mandatory information). Record the decision with its sources and dates.

## 8. Field observations (anonymized, observed 2026-10-03)

- **Design-tool file drift.** The type gate passed on the approved artwork, but the design-tool file the printer opens had live text that overflowed: the wordmark wrapped and the hero number fell onto the claims row. Rule: export every panel at the gated artwork's size and compare text bounds and line breaks; any difference fails. Size check with `cstack audit`. Diff with `cstack mockup verify` through a flat template (one quad over the whole canvas, no shading), plus a human check of line breaks. There is no dedicated command for this.
- **Renders that redraw the pack.** Generated renders that repaint the label were used to compare routes. Rule: any generated render that redraws the pack is labelled illustrative and decides nothing until `cstack mockup verify` (or the 3D label pixel diff) passes.

## Sources not verified

- FTA FIRST 7 Design Guide PDF: fetch failed (response too large). Design minimums are not quoted.
- X-Rite "Standard Viewing" PDF: redirected to the home page. ISO 3664 values come from FESPA's summary.
- Kantar/Toluna PACT suite guide: redirected. Not used.
- ISO 12647-7 tolerance values and the full ISO 12647-2 paper-type list: no fetched page stated them.
