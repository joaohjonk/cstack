# Typography primer

Loaded on demand by `/type-director` (and by the TYPE DIRECTOR lens in `/creative-review`). Each entry is a **principle**, the **mechanism** that makes it true, a **default** to start from, **when it breaks**, and its **source**. Defaults are starting points, never laws: a rule may override one when it states why. Sources are listed in section 10 and checked in [docs/research/typography.md](../../../docs/research/typography.md).

Contents: 1 Choosing · 2 Pairing · 3 The system · 4 Measure, grid, rhythm · 5 Details · 6 Delivery · 7 Accessibility and regulation · 8 Dogma vs principle · 9 Review rubric · 10 Sources · 11 Practice lessons

---

## 1. Choosing type: the job first

**Principle.** Choose a face for the task as well as the subject: what it must do (reading situation) before what it must say (voice). Write the type brief by the job first. [Lupton, *Letter*; Spiekermann; Bringhurst ch. 6, unverified]

**Write the job spec before looking at fonts.** For each surface:

| Question | Why it decides |
|---|---|
| Reading distance and size range (7 pt care card, 17 px body, 120 px hero, 3 m sign, phone caption) | Small sizes need large x-height, open apertures, sturdy strokes, generous spacing; display sizes reward tighter spacing and finer detail |
| Text length (labels, paragraphs, long stories, tables) | Long reading needs a calm, even texture; labels tolerate personality |
| Medium and rendering (high-density screens, low-density screens, offset, flexo on film, embroidery, video) | Thin hairlines vanish in flexo and video compression; ink spread fills small counters |
| Languages and scripts | Missing glyphs force fallbacks mid-word; check with `cstack type font --languages` |
| Voice (from brand beliefs and voice, not adjectives) | Type carries tone before a word is read |
| Licence and budget (web pageviews or domains, apps, print and packaging, video/broadcast, logo use) | Scope varies by foundry; cost scales with use |
| Performance (files above the fold, bytes) | Each family and weight costs load time; variable fonts can replace many files |
| Existing equity (what customers already recognize) | Changing a known face spends recognition |

**Anatomy that matters at the real size** (describe candidates by these, not by mood words):

- **x-height** relative to cap height: larger reads bigger and survives small sizes; too large flattens word shapes.
- **Apertures** (openings of c, e, a, s): open apertures stay legible small and on screens.
- **Contrast and stress** (thick-thin modulation): high contrast is elegant at display size and fragile small.
- **Width and spacing**: condensed saves space and costs legibility in long text; loose spacing helps small sizes.
- **Terminals and details**: carry voice at display size; disappear at text size.
- **Family depth**: weights, widths, true italics, small caps, figure styles (lining, oldstyle, tabular, proportional), optical sizes or an `opsz` axis.
- **Optical sizes**: separate cuts or a variable axis tuned per size (sturdier and looser small, finer and tighter large). Prefer faces that have them for systems spanning captions to heroes.

**Process.** Longlist 6–10 from category conventions (use, invert, ignore) plus far references; specimen each at real sizes with real copy; shortlist 2–3; owner chooses pairwise. Lorem ipsum is banned in specimens: it hides rhythm, word length and coverage problems.

**When it breaks.** A bespoke typeface (designed for the brand) bypasses the market longlist; it is a multi-month investment justified by scale, equity or a gap no retail face fills.

## 2. Pairing: roles first, then contrast

**Principle.** Faces in a system either contrast clearly or conflict; the safe alternative to contrast is agreement inside one family. Conflict, two faces similar but not the same, reads as a mistake. [Williams, *The Non-Designer's Design Book* (conflict and contrast; the word "concord" is unverified); Google Fonts Knowledge, *Choosing type*]

**Decide roles before pairs.** Which roles need a different voice? Typical roles: display/voice, text (long reading), UI (labels, buttons, forms), data (tables, prices), legal/fine print. Many systems need one family; editorial or product systems often need two or three. The number follows the roles.

**Three reliable strategies, in order of risk:**

1. **One family or superfamily with range** (weights, widths, optical sizes; or serif, sans and mono drawn on one skeleton, such as IBM Plex or Source Serif/Sans). Hierarchy comes from weight, size and case. Lowest risk, least voice.
2. **Voice plus workhorse.** A distinctive face for display and a quiet, robust face for text and UI. Match proportions (x-height ratio, width, weight at the same size) so they sit together; contrast on one or two axes only.
3. **Shared origin.** Faces from one designer, foundry lineage or historical model (for example a humanist sans with an old-style serif): built-in kinship, real difference.

**Contrast axes** (pick one or two): structure (serif/sans, geometric/humanist/grotesque, modulation), weight, width, case, size, colour, space. A pair that differs on every axis fights; a pair that differs on none conflicts.

**Tests before a pair is proposed:**

- Set both at the same size: do x-heights and weight look related? Adjust sizes per family (`font-size-adjust` on the web) when the faces must share a line.
- Set a heading over two paragraphs, a price table, a button and a caption. Does each face stay in its role?
- Check both families have the figures, italics and languages the roles need.

**When it breaks.** Expressive identities may intentionally clash (vernacular, collage, protest). That is a decision recorded in the brand system with its limits, not an accident.

## 3. Building the type system

**Principle.** Design the programme, not each page: a small set of rules that generates every layout. [Gerstner, *Designing Programmes*; Vignelli, *The Vignelli Canon*]

**Roles table** (one row per role; this becomes tokens and rules):

| Role | Family / weight | Size step | Line height | Tracking | Case | Figures | Max measure | Max lines | Space before/after |
|---|---|---|---|---|---|---|---|---|---|

**Scale.**

- Start from a ratio (`cstack type scale --base 17 --ratio 1.25`): smaller ratios (1.125–1.2) for dense UI and small screens, larger (1.25–1.414+) for editorial and large screens. [Brown, *More Meaningful Typography*]
- Adjust the extremes by eye; a ratio is a tool, not a truth. Fewer steps beat more: most surfaces need 5–7 sizes.
- **Fluid type**: interpolate between a small-screen scale and a large-screen scale with CSS `clamp()` so the ratio itself grows with the viewport (`cstack type scale --fluid`). [utopia.fyi]

**Leading (line height) and tracking change with size.**

- Leading falls as size rises: body about 1.4–1.6, large display about 1.0–1.15. Longer measures need more leading. [Butterick, *Line spacing*: 120–145% of size]
- Tracking tightens as size rises (display often slightly negative) and opens at small sizes. Strings of capitals, small caps and long digit strings get positive letterspacing; lowercase body text is not letterspaced. [Bringhurst §2.1.6 capitals, small caps and digits; §2.1.7 lowercase]

**Emphasis and hierarchy.** One method of emphasis per role (italic in running text, weight in UI). A new hierarchy level changes one or two properties, not five. Reading order must equal visual order. [Lupton, *Text*]

**Responsive.** Sizes, measure and leading are set per breakpoint or fluidly; headings must not break into single-word lines on phones (`text-wrap: balance` helps).

## 4. Measure, grid and rhythm

**Measure.** For continuous reading, 45–75 characters per line (spaces included), about 66 ideal; in multi-column settings about 40–50. [Bringhurst §2.1.2] Butterick gives a wider practical web range of 45–90. Set text column widths in `ch`/`em` from the measure, not in pixels.

**Grid.** The grid derives from content: measure, gutters and image ratios define columns, not the other way round. Modules and column spans are rules agents can apply. [Müller-Brockmann, *Grid Systems in Graphic Design*; Lupton, *Grid*]

**Vertical rhythm.** Spacing tokens in multiples of the body line height (or a 4 px sub-grid on screens) keep blocks related. Strict baseline grids are rarely worth enforcing on the web; consistent spacing tokens are.

**When it breaks.** Captions, pull quotes, data tables and UI labels have their own measures; display lines are composed, not measured.

## 5. Details (microtypography)

- **Punctuation**: true quotes and apostrophes, en dash for ranges, em dash (or spaced en dash) for breaks, real ellipsis; language-specific spacing (for example French spaces before `: ; ! ?`, set non-breaking).
- **Figures**: tabular lining for tables, prices and changing numbers; oldstyle in running text when the face has them; lining with capitals and in UI. Use `font-variant-numeric`, never fake figures. [Bringhurst §3.2.1, with the UI tension noted]
- **Small caps** for acronyms in running text when the face has true small caps (`smcp`, `c2sc`); never synthesized.
- **Case-sensitive forms** (`case`) when setting capitals with punctuation.
- **Line breaks**: avoid single-word last lines (runts) in headings and short paragraphs; `text-wrap: balance` for headings, `text-wrap: pretty` for paragraphs where supported; non-breaking spaces between numbers and units and after short words where the language expects it.
- **Hyphenation** only with a correct `lang` attribute, and needed for justified or narrow columns.
- **Hanging punctuation** in display settings for optical alignment (CSS `hanging-punctuation` where supported, otherwise optical margin adjustments by hand at display size).
- **Optical alignment**: round letters and punctuation overshoot; at display sizes align by eye, not by box.
- **No synthesized styles**: load the real bold and italic; block faux bold/italic (`font-synthesis: none`).

## 6. Delivery (web, apps, print)

- **Formats and subsets**: WOFF2, subset per script with `unicode-range`; variable fonts when you need several weights or widths or optical sizes from one file.
- **Loading**: preload only the fonts above the fold; choose `font-display` deliberately (`swap` shows text early with a fallback; `optional` avoids late swaps on slow connections).
- **Fallbacks without layout shift**: tune the fallback with `@font-face` metric overrides (`size-adjust`, `ascent-override`, `descent-override`, `line-gap-override`) so swapping does not move the layout; support differs by browser.
- **Apps**: embedding rights differ from web rights; check the EULA. `fsType` flags in the font are technical hints, not the licence.
- **Print and packaging**: check minimum sizes for the process (flexo and small reversed type need sturdier weights and larger sizes), outline or embed fonts per the printer's spec, keep editable masters.
- **Video and captions**: sizes for the smallest phone in the target platform's safe zone; avoid hairlines that compression destroys.

## 7. Accessibility and regulation

- **Contrast**: at least 4.5:1 for normal text and 3:1 for large text (at least 18 pt, or 14 pt bold). [WCAG 2.2, 1.4.3]
- **Resize**: text can scale to 200% without loss of content or function. [WCAG 1.4.4]
- **Text spacing resilience**: layouts must survive users setting line height to 1.5×, paragraph spacing to 2×, letter spacing to 0.12× and word spacing to 0.16× the font size. [WCAG 1.4.12]
- **Enhanced presentation (AAA)**: lines no wider than 80 characters, no justification, line spacing at least 1.5 within paragraphs. Useful targets for long-form reading. [WCAG 1.4.8]
- **Packaging minimums** are law in many markets, for example the EU requires mandatory food information in an x-height of at least 1.2 mm (0.9 mm on packs whose largest surface is under 80 cm²) [Regulation (EU) No 1169/2011, Art. 13]; US nutrition labelling sets minimum point sizes [21 CFR 101.9(d)]. Jurisdictional rules go through `/claims-proof`, which checks current primary sources.

## 8. Dogma vs principle

| Rule people repeat | Principle underneath | When the rule breaks |
|---|---|---|
| Never use more than two typefaces | Each face needs a distinct role | Editorial and product systems with separate voice, text, UI and data roles |
| Serif for print, sans for screen | Studies find no legibility difference between serif and sans as such; low-resolution screens once punished fine serifs, so choose by size, rendering, x-height, apertures | High-density screens render text serifs well; tiny UI still favours sturdy, open faces |
| Body text is 16 px | 16 px is the browser default; size depends on x-height and viewing distance | Many text faces read best at 17–20 px on desktop; small-x-height faces need more |
| 45–75 characters per line | A print comfort range for continuous reading; on screen, longer lines can read faster while readers still prefer about 55 (Dyson and Kipping 1998) | Captions, UI labels, display lines, data tables, multi-column grids |
| Never justify on the web | Justification without hyphenation makes rivers and uneven spacing | Wide-enough measure plus `hyphens: auto` and correct `lang` can justify cleanly; ragged right remains the safe default |
| Helvetica (any grotesk) is neutral | Every face has a voice; "neutral" is a cultural reading that shifts over time | Never; choose it for what it says now in this category |
| Use the golden ratio (or any one ratio) | A ratio gives consistent steps | Extremes need hand adjustment; small screens need smaller ratios; fluid scales change the ratio |
| All caps is unreadable | Long passages in capitals slow reading; short tracked labels are fine | Labels, navigation, short display lines with positive tracking |
| Light weights look premium | Thin strokes at small sizes on low contrast fail legibility | Large display sizes on high contrast backgrounds |
| Pair a serif with a sans | A shortcut for structural contrast | One superfamily, or two sans of different structure, can pair better; near-misses fail either way |
| Do what the category leader does | Conventions make a category legible | Ownership needs at least one distinct, defensible move; treat the most-used faces in the category as the default to choose against on purpose |
| A modernist system needs Helvetica | The system is the rules, not the face | The 1970 New York subway standard specified Standard Medium; Helvetica became official only in 1989 |
| Line height 1.5 because WCAG says so | WCAG 1.4.12 asks layouts to survive a user override to 1.5; it sets no line height | Choose leading by face, size and measure, then test the override |
| Dyslexia fonts make text accessible | No measured benefit; spacing, size and user control help | Never as a brand accessibility claim |
| Fluid type in vw | Type that scales with the viewport | Without a rem term, or with a maximum above 2.5 × the minimum, text can fail 200 % zoom (WCAG 1.4.4) |
| Variable fonts are always smaller | One file replaces several | Only when it replaces several static files; one or two weights are often lighter as static files |
| Two type sizes per page | A print office default (Vignelli) | Interfaces need more roles; keep each step distinct |
| Free and system fonts look amateur | Quality, coverage, licence and fit decide | Never by price alone |
| Custom type is vanity | It buys distinctiveness, range and licence stability | It costs governance; justify it by scale and equity |
| Widows can't be controlled on the web | `text-wrap: balance` and `pretty` are Baseline since October 2024 | Limits on line counts and engines; check in `type qa` |

## 9. Review rubric

Run deterministic checks first, then judge what tools cannot measure. Report each axis with evidence; never judge typography by font choice alone.

| Axis | Measure (tool) | Judge (what a person or independent reviewer checks) |
|---|---|---|
| Typeface correctness | families and weights rendered, fallbacks, licence flags (`cstack type qa`, `cstack type font`) | right face for each role; licence covers the use |
| Hierarchy | distinct sizes and weights per breakpoint (`type qa`) | levels are few and clear; reading order equals visual order |
| Line length | characters per line by block (`type qa`) | exceptions are intentional (captions, display) |
| Tracking and leading | line-height ratio, letter-spacing, caps tracking (`type qa`) | texture is even; display spacing is composed |
| Optical balance | (none reliable) | optical alignment, overshoot, weights of paired faces balanced, optical sizes used |
| Widows and orphans | single-word last lines (`type qa`) | print page breaks and orphaned headings |
| Grid alignment | screenshots at breakpoints (`browse shot`) | text edges align to columns; deviations are deliberate |
| Responsive behavior | sizes, measure and overflow at 375/768/1440 (`type qa`, `browse qa`) | hierarchy survives on the smallest screen |

## 10. Sources

- Ellen Lupton, *Thinking with Type* (2nd ed., Princeton Architectural Press, 2010): *Letter*, *Text*, *Grid*. The 3rd edition (2024) adds variable fonts, optical sizes, writing systems and accessibility. thinkingwithtype.com
- Robert Bringhurst, *The Elements of Typographic Style* (v4.0, Hartley & Marks, 2012): §2.1.2 measure; §2.1.6–2.1.7 letterspacing; §3.2.1 figures; §3.2.2 small caps; §2.4 hyphenation; ch. 6 on choosing and combining type (unverified).
- Josef Müller-Brockmann, *Grid Systems in Graphic Design* (Niggli, 1981).
- Karl Gerstner, *Designing Programmes* (1964; Lars Müller reissue).
- Massimo Vignelli, *The Vignelli Canon* (Lars Müller, 2010).
- Erik Spiekermann and E. M. Ginger, *Stop Stealing Sheep & Find Out How Type Works* (3rd ed., Adobe Press, 13 December 2013).
- Robin Williams, *The Non-Designer's Design Book* (4th ed., Peachpit, 2014): conflict and contrast ("concord" unverified).
- Matthew Butterick, *Practical Typography*, practicaltypography.com (line length, line spacing, point size).
- Tim Brown, "More Meaningful Typography", *A List Apart* (2011); *Flexible Typesetting* (A Book Apart, 2018).
- Richard Rutter, *Web Typography* (Ampersand Type, 2017). Jason Santa Maria, *On Web Typography* (A Book Apart, 2014).
- Utopia fluid type scales, utopia.fyi.
- Google Fonts Knowledge, fonts.google.com/knowledge (*Introducing type*, *Choosing type*, *Using type*).
- W3C, WCAG 2.2 Understanding documents for 1.4.3, 1.4.4, 1.4.8, 1.4.12. w3.org/WAI/WCAG22/Understanding/
- MDN Web Docs: `font-display`, `size-adjust`, `font-variant-numeric`, `text-wrap`, `font-optical-sizing`, `hanging-punctuation`.
- Regulation (EU) No 1169/2011, Art. 13; US 21 CFR 101.9.

## 11. Practice lessons from studios

Lessons are mechanisms to borrow, never looks to copy. Verified details and citations: [docs/research/typography.md](../../../docs/research/typography.md).

- **Reduction as a system** (Vignelli): a small, fixed palette of faces, flush left by default, applied through a grid with discipline (Unigrid standardised formats so effort goes into quality). Review by semantics (does it mean the right thing), syntactics (are the parts consistent) and pragmatics (does it work for the user). His office allowed about two sizes on a printed page; interfaces need more roles. Tension: the 1972 subway diagram shows that an elegant system is not automatically usable.
- **Design the programme** (Gerstner): specify the rules that generate solutions rather than one solution, with a morphological box of options and a grid that divides several ways (his 58-unit grid gives one to six columns). The direct ancestor of tokens and brand rules.
- **A "Pentagram lesson" is one partner's method**, not a house style: partners run their own teams.
- **Type as the identity** (Paula Scher): at The Public Theater, wood type and street lettering carried the voice; when others copied the look, the logo stayed and the typography changed each season. Repeat a distinctive letter so it becomes recognisable ("If the As become distinctive, you have three opportunities to be recognized."). A custom face can vary by rule (The New School's Neue mixes widths by algorithm).
- **The mark is an empty vessel** (Michael Bierut): keep it simple, build a flexible system around it, let use fill it with meaning; reduce over time once recognition is earned (Mastercard dropped the name in 2019 after more than 80 percent recognised the symbol unprompted). A face can be completed into a superfamily to give a system range.
- **Identity as behaviour** (COLLINS): one treatment, applied by a tool, makes content the brand does not control cohere (Spotify's duotones); type chosen for range and scripts (Circular, extended for other scripts); pairing as a grammar (Dropbox 2017); signature motion for static elements; move to a custom face when the licensed one limits the voice (Mailchimp). Credit for these identities is shared with in-house teams and other studios.
- **Brief by the job** (Spiekermann): the reading situation and the scripts come before the voice.
- **The licence carries the weight.** Subscription fonts can stop working on sites when the plan ends (Adobe Fonts), EULAs may forbid subsetting or conversion, and US registrations for font software are being refused (Monotype, January 2026), so the licence record matters more than the file.
- **Category defaults are a baseline to choose against.** The most-used faces among design-led sites (Typewolf's lists) show the category average; pick one on purpose or move away from it on purpose.

Read canon entries in their counterweight pairs: `vignelli` with `pentagram` and `collins`, `bringhurst` with `web-typography` (see `canon/README.md`).
