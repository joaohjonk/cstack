# Typography: studio practice, durable principles, current practice and tools (snapshot 2026-10-03)

**Answer first.** cstack now covers choosing, pairing and building type systems in three layers: the type-director primer (`skills/type-director/references/primer.md`, the procedure), ten canon entries (the mental models, each with its counterweight), and this note (the evidence). The studio lessons that survive checking are few and mechanical:

- **Pentagram.** Paula Scher shows that type can *be* the identity. At The Public Theater (from 1994), wood type and street typography carried the voice. When imitators copied the style, she kept the logo and changed the typography every season. Michael Bierut treats a new mark as an empty vessel: build a flexible system around a simple form and let use fill it. At MIT Media Lab (2014) that meant one grid, a monogram, 23 related glyphs and Helvetica brought back. At Mastercard it meant the symbol alone by 2019.
- **COLLINS.** Identity is behaviour. One treatment makes content the brand does not control cohere (Spotify's duotones, applied by a tool). Type is chosen for range, and motion is part of the mark. The credit is shared: the Spotify and Dropbox identities were built with in-house teams and partner studios.
- **Vignelli.** Few faces, few sizes, one grid, and a three-part review (semantics, syntactics, pragmatics). His lists of faces changed over time, and his 1972 subway diagram failed many riders. The lesson is the discipline, not the names or the look.

The books give defaults with reasons: Bringhurst's 45–75 characters, Butterick's ranges, Gerstner's programmes, Müller-Brockmann's grids. Section 4 keeps each rule next to the reason it exists and the case that breaks it. Screen standards change several "rules". WCAG asks layouts to survive the reader's own spacing settings; it does not ask authors to set 1.5 line height. Fluid type must still zoom to 200 percent.

What changed by 2026:
- Thinking with Type has a 3rd edition (2024) that covers variable fonts and writing systems.
- About 40 percent of sites use variable fonts, and most self-host at least some of their fonts.
- `text-wrap: balance` and `pretty` became Baseline in 2024.
- Licence costs steer brands toward custom typefaces, and the US Copyright Office has started rejecting font-software registrations.
- Google's Design MCP offers font search, and Figma's MCP returns typography variables and styles.

Section 6 proposes seven registry entries.

**Method.** I used WebSearch to find primary URLs, then WebFetch on publisher, studio, standards, vendor and press pages. WebFetch returns a summary written by a model, not raw HTML. So a sentence appears in quotation marks here only when one of two things happened: a second fetch asked for an exact copy and returned the same words, or two sources gave identical wording. Every quote is under 25 words. Numbers from long pages (the Web Almanac) come from summaries and are flagged for re-checking.

Every claim carries a label:
- **documented**: a publisher, studio, standards body, vendor's documentation, research paper or named press report ("press").
- **practitioner**: a named designer's or developer's own writing, talk or interview.
- **marketing**: a vendor's claim about its own product.
- **inferred**: my own reasoning.
- **contested**: sources disagree.

Every URL was accessed on 2026-10-03. This session could not read X or Instagram (section 8), so current practice comes from secondary sources: HTTP Archive, Typewolf, the design press, foundry posts and vendor announcements. I fetched seven Fonts In Use pages one at a time for citation: three use pages and four policy pages. Its terms prohibit robots and data-gathering tools, so nothing in cstack should crawl it.

---

## 1. Corrections to common beliefs (what a 2025-era agent would get wrong)

| Common belief | What the sources say | Label | Source (accessed 2026-10-03) |
|---|---|---|---|
| Vignelli's New York subway signs were Helvetica from the start | The 1970 NYCTA Graphics Standards Manual (Unimark) specified Standard Medium. Sign shops lacked Helvetica in the sizes needed. Helvetica Medium became the NYCTA standard only with the 1989 MTA Sign Manual | documented (historian; Paul Shaw, AIGA, 18 Nov 2008, archived copy) | https://gwern.net/doc/www/www.aiga.org/ee9fbb05bc37c056a78b174381125586cae4b7c7.html |
| *Thinking with Type* covers variable fonts | Only the 3rd edition does (12 March 2024; 256 pp; 32 new pages). It adds variable fonts and optical sizes, writing systems, accessibility and responsive layout. The 2nd edition (22 Sept 2010; 48 new pages) added style sheets, numerals, small caps, mixing typefaces and font licensing. Cite the edition you mean | documented (publisher) | https://papress.com/products/thinking-with-type-3-edition ; https://papress.com/products/thinking-with-type-second-revised-expanded-edition-a-critical-guide-for-designers-writers-editors-students |
| Vignelli used six typefaces | The count depends on the source. His 1991 SVA exhibition poster shows four (Garamond, Bodoni, Century Expanded, Helvetica). The Canon adds Optima, Futura, Univers, Caslon, Baskerville and "a few other modern cuts". A six-face list with Futura and Times Roman circulates in retellings. Stephen Coles notes that some favourite Vignelli work used none of the six | documented (Canon); practitioner (forum) | https://www.rit.edu/vignellicenter/sites/rit.edu.vignellicenter/files/documents/The%20Vignelli%20Canon.pdf ; https://www.fontsinuse.com/uses/14164/massimo-vignelli-s-a-few-basic-typefaces ; https://typedrawers.com/discussion/comment/60116 |
| Goudy said that anyone who letterspaces lowercase would steal sheep | Bringhurst (§2.1.7) prints the lowercase version. Wikipedia's *Letter spacing* article cites a 2005 Typophile comment, attributed to Spiekermann, giving "blackletter". John D. Berry also says the original was about blackletter, though Goudy disliked both | contested | https://webtypography.net.clagnut.com/2.1.7 ; https://en.wikipedia.org/wiki/Letter_spacing ; https://creativepro.com/?p=118415 |
| Serif for print, sans for screen, because of legibility | Richardson's open-access review (Springer, 2022) finds no difference in legibility between serif and sans serif, on paper or on screen. Poole's review of more than 50 studies (2008, updated 2012) reaches the same view: argue on aesthetic grounds, not legibility | documented (research) | https://link.springer.com/chapter/10.1007/978-3-030-90984-0_16 ; https://oro.open.ac.uk/82534 ; https://alexpoole.info/blog/which-are-more-legible-serif-or-sans-serif-typefaces/ |
| 45–75 characters per line is the scientific optimum | It is Bringhurst's comfort range for single-column serifed text in print (about 66 ideal; 40–50 in multiple columns). On screen, Dyson and Kipping (1998) found 100-character lines read faster than 25-character lines with no loss of comprehension, while readers judged about 55 easiest. Butterick gives 45–90. WCAG 1.4.8 (AAA) asks for a way to get lines of 80 or fewer | documented | https://webtypography.net/2.1.2 ; https://journals.uc.edu/index.php/vl/article/view/5671 ; https://practicaltypography.com/line-length.html ; https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation |
| WCAG requires 1.5 line height | SC 1.4.12 (AA) requires layouts to survive user overrides: line height 1.5, paragraph spacing 2, letter spacing 0.12 and word spacing 0.16 times the size. "Content is not required to use these text spacing values." 1.4.8 (AAA) asks only for a *mechanism* that gives 1.5 spacing | documented (standard) | https://www.w3.org/WAI/WCAG22/Understanding/text-spacing ; https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation |
| Dyslexia fonts make text accessible | Kuster et al. (*Annals of Dyslexia*, 2017; 170, then 147 students) found no better performance with Dyslexie than with Arial, and no preference for it. Shanahan's review of eight studies found no gain in rate or accuracy. The one speed gain came from wider word spacing, which helped non-dyslexic readers too | documented (research summaries) | https://dyslexiahelp.umich.edu/latest/does-dyslexie-font-help-dyslexic-readers/ ; https://www.shanahanonliteracy.com/blog/what-about-special-fonts-for-kids-with-dyslexia-or-other-reading-problems |
| Fluid type with `vw` is accessible by default | Browsers do not scale viewport units when the page is zoomed. A `clamp()` whose maximum is more than 2.5 times its minimum can fail WCAG 1.4.4 at some widths. Keep a `rem` term, keep max ≤ 2.5 × min, and test at 200 and 500 percent zoom | practitioner (Maxwell Barvian, Smashing, 7 Nov 2023) | https://smashingmagazine.com/2023/11/addressing-accessibility-concerns-fluid-type |
| Golden-ratio scales look best | Mathematicians Keith Devlin and Eve Torrence call the golden-ratio beauty claims myth: people prefer the proportions they are used to. Tim Brown, who popularised modular scales on the web, calls them a tool and steps off his own scale when it looks better | documented (press); practitioner | https://www.sciencealert.com/mathematicians-argue-that-the-golden-ratio-is-not-the-formula-for-beauty ; https://www.alistapart.com/article/more-meaningful-typography |
| Helvetica is neutral | Neutrality was the design aim (Miedinger; Wim Crouwel). Scher read it as "the establishment typeface". Collins says ubiquity makes it invisible. Spiekermann says it has no specific character, which suits few tasks that need a voice | documented; practitioner | https://en.wikipedia.org/wiki/Helvetica ; https://2001.aigany.org/ideas/features/scher.html ; https://www.frontify.com/en/blog/brian-collins-on-rocket-ships-helvetica-and-grace-jones ; https://spiekermann.com/en/interview/ |
| A distinctive typeface stays distinctive | FF Meta was drawn as a counter to Helvetica, then became so common that Spiekermann and Ginger report it being called the Helvetica of the 1990s | documented (encyclopedia citing the book) | https://en.wikipedia.org/wiki/FF_Meta |
| Fonts are protected by copyright, so the licence is a formality | In the US, typeface designs are not copyrightable. Monotype (30 Jan 2026) reports that the US Copyright Office has started rejecting registrations for font software. Butterick (21 Dec 2025) argues most font registrations are open to challenge. Canada differs (Bennett Jones, Nov 2025). The licence contract does the real work | documented (vendor, an interested party); practitioner | https://www.monotype.com/resources/update-application-copyright-law-typeface-design-and-font-software ; https://matthewbutterick.com/chron/the-copyrightability-of-fonts-revisited.html ; https://bennettjones.com/Insights/Blogs/Understanding-IP-Infringement-Risk-in-Typeface-Use-in-AI-Generated-Content |
| Variable fonts are always smaller | web.dev says one variable file will *probably* be smaller than *several* static files. With one or two weights, statics can win (inferred). Use on sites reached 39.4 percent (desktop) and 41.3 percent (mobile) in the 2025 crawl | documented; inferred | https://web.dev/learn/design/typography ; https://almanac.httparchive.org/en/2025/fonts |
| Most sites get their fonts from Google Fonts | About 72 percent of sites self-host at least some fonts. Google Fonts' share was 47–54 percent in the 2025 crawl, down from 57 percent on desktop in earlier crawls | documented (summary of the chapter; re-check) | https://almanac.httparchive.org/en/2025/fonts |
| Adobe Fonts on a website are yours once published | Web fonts stop working on your sites if the Creative Cloud subscription is cancelled. Self-hosting is not offered. There is no pageview cap | documented (vendor) | https://helpx.adobe.com/uk/fonts/web/font-licensing/webfont-licensing.html |
| Spotify's identity is COLLINS's work, end to end | 2015: COLLINS with Spotify's brand team (its global brand director was quoted at launch), with Circular customised by Lineto. 2024: Spotify Mix replaced Circular, made by Spotify's in-house team with Dinamo. Dropbox 2017: the in-house brand studio with COLLINS, Xxix, Instrument and Animade | documented (press; studio; foundry) | https://www.designweek.co.uk/spotify-undergoes-colourful-brand-refresh/ ; https://lineto.com/bespoke/spotify ; https://www.itsnicethat.com/articles/spotify-dinamo-new-typeface-spotify-mix-project-230524 ; https://www.designweek.co.uk/issues/2-8-october-2017/dropbox-rebrands-show-just-file-storage/ |
| MIT Media Lab's algorithmic identity is Pentagram's | The algorithmic identity (40,000 logos in 12 colour schemes) is TheGreenEyl's (Richard The and E Roon Kang), designed in 2010. Pentagram's 2014 system (Bierut with Aron Fay) took the seven-by-seven grid of Richard The's 25th-anniversary logo. From it came an ML monogram and 23 research-group glyphs, set with Helvetica | documented | https://www.creativeapplications.net/project/mit-media-lab-identity-processing/ ; https://www.pentagram.com/work/mit-media-lab/story ; https://www.dezeen.com/?p=579622 |
| *Stop Stealing Sheep*, 3rd edition, is a 2014 book | Peachpit lists 13 December 2013 (216 pp), so 2014 citations reflect the copyright year or later printings | documented (publisher) | https://www.peachpit.com/store/stop-stealing-sheep-find-out-how-type-works-third-edition-9780321934284 |

## 2. Studio practice, verified

### 2.1 Pentagram (Paula Scher, Michael Bierut and the partner model)

| Lesson (mechanism) | Evidence | Label | Source |
|---|---|---|---|
| Read any "Pentagram lesson" as one partner's method, not a house style | Pentagram is independently owned. Its partners are working designers and the primary contact for every client. Partners share income and profits equally within an office, whoever brought the work in. A new partner needs every existing partner's vote: Abbott Miller told Eye on Design that one vote against ends it | documented; press; inferred (the reading) | https://www.pentagram.com/about ; https://en.wikipedia.org/wiki/Pentagram_(design_firm) ; https://eyeondesign.aiga.org/epically-long-how-pentagram-chooses-its-new-partners/ |
| Scher: let type carry the identity, rooted in the subject's place and history | The Public Theater, from 1994: wood typefaces in capitals and a language drawn from street typography. Akzidenz Grotesk followed for the 50th anniversary in 2005, and Knockout (Hoefler & Frere-Jones) in 2008. Pentagram notes that theatre advertising at large moved to blocky wood type afterwards | documented (studio) | https://www.pentagram.com/work/the-public-theater ; https://www.typeroom.eu/war-lust-type-paula-scher-the-public-theater-pentagram |
| Scher: when others copy the style, keep the logo and renew the typography | "Because if everybody uses it, The Public Theater has no identity." Then: "So I started changing the typography, leaving the Public logo, and I did that for a period of time." | practitioner (interview, The Interval, 10 Oct 2017) | https://www.theintervalny.com/?p=2781 |
| Scher: choose letterforms with a distinctive repeated character | On the Pasadena Playhouse mark: "If the As become distinctive, you have three opportunities to be recognized" | practitioner (same interview) | https://www.theintervalny.com/?p=2781 |
| Scher: a stated reaction against Helvetica-on-a-grid modernism | "Also I viewed Helvetica, the visual language of corporations, as the establishment typeface and therefore somehow responsible for the Vietnam War." (*Make It Bigger*, 2002) | practitioner | https://2001.aigany.org/ideas/features/scher.html |
| Scher: a custom typeface that varies by rule | The New School (2015). Its face, Neue, is a customised version of Peter Biľak's Irma. A custom algorithm mixes regular, extended and very extended widths | documented (press, 30 Mar 2015) | https://www.designweek.co.uk/paula-scher-uses-revolutionary-typeface-in-rebrand-of-the-new-school/ |
| Bierut: a new mark is a vessel; shape it for what it must hold and let use fill it | "It is an empty vessel awaiting the meaning that will be poured into it by history and experience." (*How to*, excerpted 28 Sept 2015) | practitioner | https://www.itsnicethat.com/features/michael-bierut-logo-design |
| Bierut: one grid generates a monogram for the whole and a glyph for every sub-unit, with one typeface | MIT Media Lab (October 2014, with Aron Fay). The grid came from Richard The's seven-by-seven 25th-anniversary logo, and all 23 research groups got glyphs. "Helvetica, so central to MIT's communications when the Media Lab was new, has been reinstated to support the overall system." | documented (studio; press) | https://www.pentagram.com/work/mit-media-lab/story ; https://www.dezeen.com/?p=579622 |
| Bierut: reduce once recognition is earned | Mastercard (July 2016, with Luke Hayman) kept the interlocking circles and set a lowercase FF Mark wordmark beside them. In January 2019 the symbol ran without the name, after Mastercard reported that more than 80 percent of people recognise it unprompted | documented (press) | https://www.creativereview.co.uk/new-mastercard-logo-pentagram/ ; https://fontsinuse.com/uses/13945/mastercard-identity-2016 ; https://www.dezeen.com/2019/01/10/mastercard-rebrand-pentagram-design/ |
| Bierut: state the reason behind every typeface choice | His essay gives thirteen reasons, from "it works", its history, its name and its designer to "it was there", "they made you", beauty, ugliness, blandness, specialness, belief and necessity (*Now You See It and Other Essays on Design*, 2017) | practitioner | https://itsnicethat.com/articles/michael-bierut-now-you-see-it-and-other-essays-on-design-publication-061117 |
| Commission, adapt or complete a typeface when the system needs range | For Hillary for America (2016), Pentagram brought in Sharp Sans. Sharp Type then completed it into a superfamily for the campaign ("Sharp Unity") | documented (foundry) | https://sharptype.co/news/hillary-clinton-sharp-sans |
| Lineage | Bierut worked ten years at Vignelli Associates, ending as vice president of graphic design, and joined Pentagram as a partner in 1990 | documented | https://www.rit.edu/events/vignelli-center-lecture-michael-bierut |

Contested or dated:
- Scher rejected Helvetica as the establishment face, yet Pentagram brought Helvetica back at MIT because of MIT's own history. Context decides, not doctrine. (documented)
- The Public Theater look was copied widely. Its success wore away its distinctiveness and forced the seasonal renewal. (practitioner; documented)
- Generative variety and recognition pull against each other. MIT Media Lab moved from an algorithmic identity with 40,000 variants (2011) to one fixed grid system (2014). (documented)

### 2.2 COLLINS (Brian Collins, Leland Maschmeyer and team)

| Lesson (mechanism) | Evidence | Label | Source |
|---|---|---|---|
| Define the brand as behaviour, then design assets that perform it | "A brand is a promise performed consistently over time." The same guest post, written by Collins himself and undated, goes on to call a brand behaviour measured against what it believes | practitioner | https://www.frontify.com/en/blog/brian-collins-on-rocket-ships-helvetica-and-grace-jones |
| Make content the brand does not control cohere with one treatment, and automate it | Spotify (2015): a duotone treatment ("Lens"), drawn from the duotone screen printing of music history, brands third-party artist photography. Brett Renfer, COLLINS's director of experience design, built "the Colorizer" to apply it at scale | documented (studio; press) | https://www.wearecollins.com/work/spotify ; https://www.brandknewmag.com/?p=26223 |
| Choose type for range, widths and scripts | Spotify moved from Proxima Nova to Circular. Lineto's bespoke work added six matched typefaces in other scripts and a large set of custom-spaced fonts, drawn by native-speaking type designers | documented (press; foundry) | https://staging2.phaidon.com/agenda/design/articles/2015/march/23/what-do-you-think-of-spotifys-new-look ; https://lineto.com/bespoke/spotify |
| Make pairing a grammar | Dropbox (2017) "paired up" contrasting colours, type and imagery to show collaboration. Sharp Grotesk (Sharp Type) ran across a very large style range: 259 styles per Design Week, 250 per Dezeen | documented (press) | https://www.designweek.co.uk/issues/2-8-october-2017/dropbox-rebrands-show-just-file-storage/ ; https://www.dezeen.com/2017/10/11/dropbox-rebrand-logo-visual-identity-graphic-design/amp/ |
| Give static elements a signature motion | COLLINS describes a signature animation style that turns static Dropbox brand elements into recognisable motion | documented (studio) | https://www.wearecollins.com/work/dropbox |
| Watch category defaults | On Helvetica across luxury fashion: "Worse, its ubiquity leads to invisibility." | practitioner | https://www.frontify.com/en/blog/brian-collins-on-rocket-ships-helvetica-and-grace-jones |
| Widen the problem before solving it | Collins frames problem-seeking as the counterpart of problem-solving (Eye, "Reputations", Autumn 2023) | practitioner | https://www.eyemagazine.com/feature/article/reputations-brian-collins |
| Move to a custom face when the licensed one limits the voice | Mailchimp (2018; COLLINS with Mailchimp's in-house team) launched with Cooper BT Light. Means, a custom serif by Greg Gazdowicz at Commercial Type, followed about a year later | documented | https://www.fontsinuse.com/uses/39539/mailchimp-identity-2018-redesign |
| Process: talks and teaching | Collins led Ogilvy & Mather's Brand Integration Group, then founded COLLINS in 2008 with Leland Maschmeyer. He has taught at SVA since 2001. Talks include "The Convergence Era" (Brand New Conference, Amsterdam, June 2016) and a Design Matters episode (17 Sept 2018). He chaired the D&AD Branding jury in 2024 | documented | https://www.eyemagazine.com/feature/article/reputations-brian-collins ; https://underconsideration.com/brandnieuweconference/speakers_A8_BrianCollins.php ; https://en.wikipedia.org/wiki/Brian_Collins_(designer) ; https://dandad.org/en/d-ad-designers-we-underestimate-how-powerful-we-are-features-opinions |

Who did what:
- **Spotify 2015.** COLLINS was appointed in April 2014. It worked with Spotify's brand team; Global Brand Director Alexandra Tanguay was quoted at launch (Design Week, 13 March 2015). The palette grew from green and black to 31 colours, and Lineto customised Circular. (documented)
- **Spotify Mix, 2024.** It replaced Circular. Spotify's in-house team made it with Dinamo over 18 months. Spotify's global head of brand design, Rasmus Wängelin, said Circular had felt limiting and that widths from condensed to extended widen the emotional range. COLLINS was not named. (documented, press)
- **Dropbox 2017.** Dropbox's in-house brand studio worked with COLLINS, Xxix, Instrument and Animade (Design Week). COLLINS's own page also lists Sharp Type and 72andSunny. (documented)

Contested or dated:
- The 2017 Dropbox colours and pairings drew public criticism at launch: expression can cost legibility and goodwill. (documented, press: Dezeen)
- Range needs governance. A high-range system in the hands of a small team turns into noise. (inferred)
- The studio pages' impact figures (valuation growth, IPO performance) are the studio's own claims. (marketing)

### 2.3 Massimo Vignelli

| Lesson (mechanism) | Evidence | Label | Source |
|---|---|---|---|
| Where to read it | *The Vignelli Canon* is free as a PDF; RIT's Vignelli Center hosts a copy, and the vignelli.com link returned 404. Lars Müller Publishers has printed it since 2010 (112 pp). Part one covers intangibles: semantics, syntactics, pragmatics, discipline, appropriateness, ambiguity and more. Part two covers tangibles: grids, typefaces, type size relationships, contrasting sizes, layout, sequence and more | documented | https://www.rit.edu/vignellicenter/sites/rit.edu.vignellicenter/files/documents/The%20Vignelli%20Canon.pdf ; https://www.lars-mueller-publishers.com/vignelli-canon ; https://courses.dubberly.com/systems_2019_fall/CANON-7-2018.pdf |
| Keep a small, fixed palette of faces and spend the effort on use | "Personally, I can get along well with a half a dozen, to which I can add another half a dozen, but probably no more." He names Garamond, Bodoni, Century Expanded and Helvetica first, then Optima, Futura, Univers, Caslon and Baskerville | documented | https://www.rit.edu/vignellicenter/sites/rit.edu.vignellicenter/files/documents/The%20Vignelli%20Canon.pdf ; https://www.fontsinuse.com/uses/14164/massimo-vignelli-s-a-few-basic-typefaces |
| Use very few sizes per page | The Canon says his office kept to no more than two type sizes on a printed page, with exceptions | documented | (Canon PDF, "Type Size Relationship") |
| Default alignment | Flush left most of the time. Centred for short formal text such as invitations and business cards. Justified rarely, because he finds it contrived | documented | (Canon PDF, "Flush Left, Centered, Justified") |
| Review every piece three ways | Semantics asks what it means for this subject. Syntactics asks whether the grid, typefaces, text and headlines follow one grammar. Pragmatics: "Whatever we do, if not understood, fails to communicate and is wasted effort." | documented | Canon PDF ; https://courses.dubberly.com/systems_2019_fall/CANON-7-2018.pdf |
| Standardise formats to remove routine decisions | Unigrid (1977), the US National Park Service publication system. Publications Chief Vincent Gleason enlisted Vignelli. Panels are 4 by 8¼ inches, one or two wide and up to six long, cut from a 25 by 38 inch press sheet, under a black band. "The original typefaces were Helvetica and Times Roman." Today they are Frutiger and NPS Rawlinson. The 1985 Presidential Design Award praised it for "reducing routine decisions so that effort can be concentrated on quality" | documented | https://www.nps.gov/subjects/hfc/a-brief-history-of-the-unigrid.htm |
| System elegance is not usability (the subway map) | The 1972 diagram used 45- and 90-degree lines, grey parks and beige water. Vignelli debated John Tauranac at Cooper Union on 20 April 1978, and the Tauranac–Hertz geographic map replaced the diagram in 1979. In April 2025 the MTA's in-house mapping department released a diagrammatic map. Bierut called it faithful to Vignelli's geometric logic | documented (press) | https://www.dezeen.com/2021/05/20/gary-hustwit-new-york-subway-interview/amp/ ; https://www.vitalcitynyc.org/new-yorks-new-subway-map.md ; https://www.dezeen.com/2025/04/04/new-york-city-new-subway-map-mta/ |
| Signage face, for the record | The 1970 Graphics Standards Manual (Unimark) specified Standard Medium. Helvetica Medium became the standard in 1989 | documented (historian) | https://gwern.net/doc/www/www.aiga.org/ee9fbb05bc37c056a78b174381125586cae4b7c7.html |

Contested or dated:
- The lists of "basic" faces vary by source and year: four, about a dozen, or six. On TypeDrawers, Chris Lozos and Nick Shinn tie the list to what was practical and available in his time, and Stephen Coles notes work of his that used none of them. Treat the small number as the lesson, not the names. (practitioner)
- Modernist neutrality is a period style that later designers rejected (Scher, section 2.1). (practitioner)
- Reduction can erase information people rely on: geography on a map, detail on a pack. (documented: the subway map; inferred: packs)

## 3. Books and references: mechanisms, and what is contested or dated

### 3.1 Ellen Lupton, *Thinking with Type*
- Three sections: Letter, Text, Grid. Each opens with an essay on cultural and theoretical issues, followed by example pages that show how and why typography is structured. (documented: https://www.bookshare.org/browse/book/246326)
- The book teaches the rules together with how to break them, and how to be inventive within systems of typographic form. (documented: 2nd-edition publisher page, linked in section 1)
- Editions: Princeton Architectural Press, 2004. The 2nd edition (2010) added material on styles, figures, small caps, mixing faces and font licensing. The 3rd edition (2024) adds variable fonts, accessibility, more writing systems and responsive layout (summarised from the publisher pages). (documented: publisher pages in section 1; https://bookshop.org/p/books/thinking-with-type-a-critical-guide-for-designers-writers-editors-and-students-3rd-edition-revised-updated-ellen-lupton/20227322)
- What agents should do with it: decide at the letter, text and grid scales and check that they agree. Use a family's own figures and small caps before adding a family. Set type through named styles, never by hand. (inferred from the structure and topics)
- Contested or dated: the companion site could not be read (section 8), so this note attributes no pairing rule to Lupton. Cite the 3rd edition for anything about variable fonts, scripts or accessibility.

### 3.2 Robert Bringhurst, *The Elements of Typographic Style*
- Versions: 1992 (Hartley & Marks), 2.0 (1996), 3.0 (2004), 3.1 (2005), 3.2 (2008), 4.0 (2012). (documented: https://en.wikipedia.org/wiki/The_Elements_of_Typographic_Style)
- Measure (§2.1.2): 45–75 characters for single-column serifed text, 66 ideal, 40–50 in multiple columns. (documented: https://webtypography.net/2.1.2)
- Letterspacing (§2.1.6, §2.1.7): letterspace strings of capitals, small caps and long digit strings, normally 5–10 percent of the size. Don't letterspace lowercase without a reason. (documented: https://webtypography.net.clagnut.com/2.1.6 ; https://webtypography.net.clagnut.com/2.1.7)
- Rhythm (§2.1.3, §2.1.10, §2.2.1, §2.2.2): set ragged if ragged suits the text and page. Don't stretch the word space until it breaks. Leading follows the face, the text and the measure, and vertical space moves in steps of a fixed unit (paraphrased). (documented: https://webtypography.net/toc)
- Scale and details (§3.1.1, §3.2.1, §3.2.2, §2.4.1, §2.4.3): compose with a modest set of distinct, related sizes. Use titling figures with full caps and text figures elsewhere, and spaced small caps for abbreviations in running text. Hyphenation minimums: 2 letters before the break, 3 after, at most 3 consecutive hyphenated lines (numbers from §2.4, paraphrased). (documented: https://webtypography.net/3.1.1 ; toc)
- Contested or dated: the book is grounded in print. Maurice Meilleur's review of 4.0 (Typographica, 8 Feb 2013) counts two pages and five paragraphs on screen typography and finds no index entries for web fonts, CSS or HTML; display type is barely covered. 45–75 is a print comfort default (section 4), and the Goudy line is contested (section 1). Chapter 6 on choosing and combining type was not checked this session. (practitioner: https://typographica.org/typography-books/the-elements-of-typographic-style-4th-edition/)

### 3.3 Richard Rutter
- *The Elements of Typographic Style Applied to the Web* (webtypography.net, CC BY-NC 4.0) maps Bringhurst's rule numbers to CSS. Elastic (em) boxes keep the measure when readers resize text. Abbreviations get `letter-spacing: 0.1em`. Sizes are set in em from a 100 percent body. (documented: https://webtypography.net/2.1.2 ; https://webtypography.net.clagnut.com/2.1.6 ; https://webtypography.net/3.1.1)
- *Web Typography* (Ampersand Type, 2017, 333 pp) has three parts: Setting Type to be Read, Typographic Detail, and Choosing and Using Fonts. It covers screen rendering and responsive paragraphs. (documented: https://book.webtypography.net/ ; https://www.abebooks.com/9780995664203/Web-Typography-handbook-designing-beautiful-099566420X/plp)
- Use `text-wrap: balance` for headings and captions. Body text still has no direct control over widows and orphans. (practitioner: https://clagnut.com/blog/2424, 7 Mar 2023)
- Contested: he prefers elastic em layouts, yet his own site uses liquid widths to respect reader choice. Measure control and reader control trade off. (documented: https://webtypography.net/2.1.2)

### 3.4 Josef Müller-Brockmann, *Grid Systems in Graphic Design*
- Niggli, 1981; 10th revised edition 2016. It gives instructions for grids of 8 to 32 fields, and for three-dimensional grids. (documented: https://draw-down.com/products/grid-systems-in-graphic-design)
- The grid is an ordering system that expresses an attitude: objectivity over subjectivity, and rationalised production. Study each job to find the grid it needs. (documented: "Grid and Design Philosophy", reprinted in *Texts on Type*, 2001: https://neugraphic.com/muller-brockmann/muller-brockmann-text2.html)
- "The grid system is an aid, not a guarantee." The same passage says that using it well is an art that takes practice. (documented: draw-down page above; https://www.goodreads.com/work/quotes/341206)
- Contested or dated: "objective" typography was a cultural position that later designers rebelled against (Scher). Strict baseline grids sit badly with browser zoom and user spacing overrides (section 4). (practitioner; inferred)

### 3.5 Karl Gerstner, *Designing Programmes*
- Editions: Niggli 1964; expanded 1968; Lars Müller redesign 2007; 2019 facsimile of the original design. (documented: https://lars-mueller-publishers.com/designing-programmes-0 ; https://en.wikipedia.org/wiki/Karl_Gerstner)
- "Instead of solutions for problems, programmes for solutions". The passage adds that no problem has an absolute solution. (documented: excerpt PDF, https://openlab.citytech.cuny.edu/langecomd3504fa2019/files/2018/10/Gerstner_DesigningProgrammes.pdf)
- The "morphological box of the typogram" puts parameters on one axis and options on the other, and combines them to explore marks systematically. (documented: same excerpt)
- The Capital grid (1962–63) has a base unit of 10 points: the body type including its leading. It is 58 units wide and divides into one to six columns with two-unit gutters: 2×28+2, 3×18+2×2, 4×13+3×2, 5×10+4×2, 6×8+5×2. (documented: same excerpt; https://ms-studio.net/notes/karl-gerstners-layout-grid/)
- Describing the problem is part of the solution. The designer's freedom lies at the centre of the task, not at its margin. (documented, paraphrased: https://artequalswork.com/posts/designing-programmes/ ; Wikipedia)
- Gerstner-Programm (1964–67) was a type system with 16 versions on Berthold Diatype, digitally restored in 2017. (documented: Wikipedia)
- Contested: a programme can produce correct but lifeless work, and explicit rules still encode a taste. (inferred)

### 3.6 Erik Spiekermann
- *Stop Stealing Sheep & Find Out How Type Works*, with E. M. Ginger. 1st edition 1993; 3rd edition 13 Dec 2013 (216 pp). Its chapters include "Type with a purpose", "Type builds character", "Type on screen" and "There is no bad type". (documented: Peachpit, section 1)
- Brief by the job. In a January 2014 interview he lists the criteria for choosing a face: tone of voice, languages, technical constraints, readership, cultural reading habits, media and budget. (practitioner: https://spiekermann.com/en/interview/)
- Character over neutrality: "Helvetica was designed to have no specific character and the designers achieved that." He adds that this suits few tasks that need a voice. (practitioner: same interview)
- Design for the worst real conditions. FF Meta began as a 1985 Deutsche Bundespost commission for a legible, space-saving face with unmistakable characters, for small sizes on poor paper. The Bundespost declined it and kept Helvetica, and FontFont released it in 1991. (documented: https://en.wikipedia.org/wiki/FF_Meta)
- Understand how people read before setting type (the book's argument, quoted in John D. Berry's review). (practitioner: https://creativepro.com/?p=118415)
- Corporate type is infrastructure. He founded MetaDesign (1979) and FontShop (1989), and made faces for Deutsche Bahn, Bosch, Mozilla, Autodesk and others. (documented: https://spiekermann.com/media/pages/downloads/7e422d64eb-1780918052/erik_biodownload.pdf)
- Contested or dated: the anti-Helvetica FF Meta became a default itself (section 1). The Goudy line behind the title is contested.

### 3.7 Matthew Butterick, *Practical Typography*
- Body text first. Point size, line spacing, line length and font are the four decisions: 10–12 pt in print or 15–25 px on the web, line spacing at 120–145 percent, and an average line of 45–90 characters including spaces (two to three alphabets). (documented: https://practicaltypography.com/summary-of-key-rules.html ; https://practicaltypography.com/line-length.html)
- Mixing fonts is optional. A second font is usually tolerable, a third rarely, four almost never. Mix only fonts that are clearly different, give each a consistent role, and avoid several fonts in one paragraph. Fonts by the same designer combine reliably, and a serif–sans pair is not required. (documented: https://practicaltypography.com/mixing-fonts.html)
- Details, paraphrased in cstack's words (the numbers are his; read his summary page for his wording):
  - Caps and small caps get 5–12 percent letterspacing (`0.05em`–`0.12em`); lowercase at text sizes gets none.
  - Emphasis is rare and one device at a time; all caps only for short runs.
  - Paragraphs are marked one way, indent or space.
  - Justification needs hyphenation.

  (documented: https://practicaltypography.com/letterspacing.html ; https://practicaltypography.com/summary-of-key-rules.html)
- His 21 Dec 2025 essay argues that US copyright protects digital fonts far less than the industry assumes. (practitioner: https://matthewbutterick.com/chron/the-copyrightability-of-fonts-revisited.html)
- Contested or dated: his advice to avoid most free fonts and system fonts targets documents that default to Times New Roman or Arial. It is too broad for product UI, where platform fonts are engineered for screens, and for the open-licence fonts most sites use (section 5.2). (inferred)

### 3.8 Tim Brown
- *More Meaningful Typography* (A List Apart, 3 May 2011). Build a modular scale from a ratio with a reason and from important numbers: the body size, plus a second number for a double-stranded scale. Use it for sizes, line height, measure, margins and columns, and step off it when the result looks better; he set sidebar text at 15px, off his own scale. (practitioner: https://www.alistapart.com/article/more-meaningful-typography)
- *Flexible Typesetting* (A Book Apart, 24 July 2018): "We no longer decide; we suggest." On devices nobody can predict, the typesetter prepares the text to make its own choices. (practitioner: https://abookapart.com/products/flexible-typesetting)
- Contested: his golden-ratio choice rested on meaning (Minion's Renaissance roots), not on evidence that the ratio looks better (section 1).

### 3.9 Utopia (fluid type and space)
- James Gilyead and Trys Mudford (Smashing Magazine, 1 April 2021). Define a type scale at a small and a large viewport, each with its own base size and ratio, and interpolate between them with `clamp()`. Derive the space scale from the type base. Designers and developers work from the same calculator. (practitioner: https://smashingmagazine.com/2021/04/designing-developing-fluid-type-space-scales/)
- Calculator defaults read today: 18px at a 360px viewport with ratio 1.2, rising to 20px at 1240px with ratio 1.25, five steps up and two down. Step 0 is `clamp(1.125rem, 1.0739rem + 0.2273vw, 1.25rem)`. The calculator supports Figma variables. (documented: https://utopia.fyi/type/calculator/ ; https://utopia.fyi/blog)
- Pair it with the zoom rule from section 1: keep a rem term, and keep each maximum within 2.5 times its minimum. (practitioner: Barvian)

### 3.10 Jason Santa Maria, *On Web Typography* (A Book Apart, 4 Aug 2014)
- Chapters: How We Read, How Type Works, Evaluating Typefaces, Choosing and Pairing Typefaces, Typographic Systems, Composition. (documented: https://abookapart.com/products/on-web-typography)
- Only the publisher's description was read, so this note attributes no specific pairing rule to him.

### 3.11 Google Fonts Knowledge
- Launched 7 December 2021. Erik Spiekermann, Jessica Hische, Elliot Jay Stocks and Gerry Leonidas reviewed and contributed to the content. (documented, press: https://designtaxi.com/news/416945/Google-Debuts-Fonts-Knowledge-Platform-Teaching-A-To-Z-Of-Choosing-Typography/)
- The "Choosing type" lessons include *Pairing typefaces*, *Pairing typefaces within a family & superfamily* (its summary: a family gives consistency across every variation), *Pairing typefaces using the font matrix* and *A checklist for choosing type*. (documented, titles and meta descriptions only: https://fonts.google.com/knowledge/choosing_type/pairing_typefaces_within_a_family_superfamily)
- The article bodies render with JavaScript and could not be read, and the source repository could not be fetched (section 8).

### 3.12 Platform and standards guidance
- **Apple**, *The details of UI typography* (WWDC20). SF Text was drawn for sizes below 20 points and SF Display for 20 and above; as a variable font, SF Pro moves from Text to Display between 17 and 28 points. Tracking must be size-specific. Support Dynamic Type, and override system text behaviour only in exceptional cases. The platforms add leading for Arabic and other tall scripts. (documented: https://developer.apple.com/videos/play/wwdc2020/10175/)
- **Material 3** defines 15 baseline text roles (display, headline, title, body and label, each in large, medium and small), each with an emphasised variant. These come from the Compose documentation, because the Material blog did not render. (documented: https://composables.com/jetpack-compose/androidx.compose.material3/material3/classes/Typography)
- **web.dev** *Learn Design*: cap text with `max-inline-size: 66ch`. Never size text in viewport units alone, or users cannot resize it. Use unitless line height, around 1.5 for body text. (documented: https://web.dev/learn/design/typography)
- **WCAG 2.2**:
  - **1.4.8 (AAA)** asks for a mechanism that gives lines of at most 80 characters (40 for CJK), unjustified text, 1.5 line spacing, paragraph spacing 1.5 times the line spacing, and 200 percent resizing without horizontal scrolling.
  - **1.4.12 (AA)** requires that nothing is lost when users set line height to 1.5, paragraph spacing to 2, letter spacing to 0.12 and word spacing to 0.16 times the size.

  (documented: section 1 links)
- **WCAG 3 draft method (APCA).** Contrast depends on weight and size together, and thin weights at small sizes need far more contrast. The page itself says it is a draft, not mature and not authoritative. (documented, draft: https://www.w3.org/WAI/GL/WCAG3/2020/methods/font-characteristics-contrast)

### 3.13 Robin Williams, *The Non-Designer's Design Book* (partial)
- A review quotes the book on two type relationships: *conflict*, where two faces are similar but not really different, and *contrast*, which should be strong. The third relationship the primer cites, *concord*, was not verified. (practitioner, via review: https://www.ybrikman.com/blog/2015/01/27/the-non-designers-design-book/)

## 4. Dogma vs durable principle

| Rule as usually stated | Durable principle (the reason) | When it breaks | Sources |
|---|---|---|---|
| Never use more than two typefaces | Each face needs a distinct, consistent role; mixing is optional, a second face is usually tolerable and a third rarely | Systems with separate voice, text, UI and data roles; a superfamily counts as one voice. Vignelli's "half a dozen" was a whole career's palette, not a per-page limit | Butterick, *mixing fonts*; Vignelli Canon |
| Serif for print, sans for screen | Choose by size, rendering, x-height, apertures, spacing and voice. Serifs themselves make no legibility difference | Very small or low-resolution text still favours sturdy, open forms (inferred) | Richardson 2022; Poole 2012 |
| Body text is 16px | Start from the reader's default size (rem) and the face's x-height. Butterick suggests 15–25 px; Apple's body style is 17 pt; text must resize to 200 percent | Dense data tables, kiosks and TV distances need their own sizes | Butterick; WWDC20; WCAG 1.4.4 and 1.4.8 |
| Always 45–75 characters per line | Lines short enough to find the next line and long enough to avoid choppy reading; measure in characters (`ch`), not pixels | Screen readers went faster at 100 characters with equal comprehension, though they preferred about 55. Captions, labels, display lines and tables differ; 40–50 in multiple columns | Bringhurst §2.1.2; Dyson and Kipping 1998; Butterick; WCAG 1.4.8 |
| Never justify text on the web | Word spacing must stay even. Justify only with hyphenation and a measure wide enough to absorb the stretch | Wide columns in languages the browser hyphenates well can justify. For AAA, offer a way to get unjustified text | Bringhurst §2.1.3, §2.1.10; Butterick; WCAG 1.4.8 |
| Helvetica (or any neo-grotesque) is neutral | Every face carries associations, and they shift with use | Pentagram brought Helvetica back at MIT precisely because it carried MIT's history | Helvetica (Wikipedia); Scher; Collins; Spiekermann; Pentagram MIT |
| A modernist system needs Helvetica | The system is the rules (few faces, a grid, a hierarchy), not the face | The Unigrid started with Helvetica and Times Roman and now uses Frutiger and NPS Rawlinson; the subway signs specified Standard Medium | NPS; Shaw |
| Build the scale on the golden ratio (or any one ratio) | A scale gives a modest set of related sizes; the ratio is a tool | Small screens need smaller ratios, and fluid scales interpolate between two (Utopia: 1.2 to 1.25). Adjust the extremes by eye | Bringhurst §3.1.1; Brown 2011; Utopia; Devlin |
| Always track all caps; never letterspace lowercase | Spacing follows size and case. Caps and small caps get about 5–12 percent; lowercase at text sizes gets none | Tracking is size-specific: looser for small text, tighter for display (Apple). Lowercase below about 9 pt can take a little space (Butterick) | Bringhurst §2.1.6–2.1.7; Butterick; WWDC20 |
| Line height 1.5 everywhere, because WCAG says so | Leading suits the face, size and measure (body text about 120–145 percent). WCAG requires the layout to survive a 1.5 override, not to use it | Display type needs tighter leading; Arabic and other tall scripts need more (Apple) | Bringhurst §2.2.1; Butterick; WCAG 1.4.12; WWDC20 |
| Dyslexia fonts make text accessible | Spacing, size, contrast and user control help; specialised fonts show no benefit | Reader choice is still worth offering: the fastest font differs by person, with a 35 percent speed gap between a reader's fastest and slowest fonts and no loss of comprehension (Wallace et al., ACM TOCHI 2022) | Kuster et al. 2017; Shanahan 2019; https://research.adobe.com/publication/towards-individuated-reading-experiences-different-fonts-increase-reading-speed-for-different-individuals |
| `vw` fluid type is best practice | Fluid scales are fine when they include a rem term and bounded ratios (max ≤ 2.5 × min) | Any step that grows more than 2.5 times can fail 200 percent zoom at some widths. Test at 200 and 500 percent | Barvian 2023; web.dev |
| Variable fonts are always smaller and better | One variable file replaces several static ones; an optical-size axis improves small and large text | With one or two weights, static files can be smaller (inferred) | web.dev; WWDC20; Almanac 2025 |
| Two type sizes per page | Vignelli's print default: hierarchy from position, weight and space | Interfaces define many more roles (15 in Material 3, plus Apple's text styles), and data-dense screens need more steps | Vignelli Canon; Material 3; WWDC20 |
| Thin weights look premium | Contrast depends on weight and size together | Thin weights at small sizes need much higher contrast; the WCAG 3 APCA table is a draft, not authoritative | W3C APCA draft |
| Free and system fonts look amateur | Licence, quality and fit matter, not price. OFL fonts are on 64 percent of websites, and platform fonts are engineered for screens | Butterick's warning is about documents that default to Times New Roman or Arial | Butterick; Almanac 2025; WWDC20 |
| A custom typeface is vanity | Custom type buys distinctiveness, range and licensing stability | It costs time and money and needs governance, and a quick custom font can be a one-gimmick disposable | Netflix Sans (2018); Goodspeed 2025; Creative Boom 2025 |
| Widows cannot be controlled on the web | `text-wrap: balance` (headings) and `pretty` (paragraphs) are Baseline since October 2024 | balance works only on short blocks (six lines or fewer in Chromium, ten in Firefox), and body text still lacks direct widow and orphan control | MDN; Rutter 2023 |
| Pair a serif with a sans | Pair faces that are clearly different and give each a role. One family or superfamily, or one designer, is a reliable route | Two sans of different structure, or one superfamily, often pair better than a forced serif–sans match | Butterick; Google Fonts Knowledge (lesson titles only) |

## 5. Current practice, 2025–26

### 5.1 What could and could not be observed
X and Instagram could not be read from this session (section 8). This section therefore relies on:
- HTTP Archive's Web Almanac, which measures the web.
- Typewolf, one curator's sample of design-led sites.
- The design press and foundry posts.
- Vendor announcements, labelled marketing.

Fonts In Use's homepage could not be fetched, and its terms bar automated extraction, so it supplies precedent here, not trend data.

### 5.2 What the web uses (HTTP Archive Web Almanac)
Both chapters were read through WebFetch summaries. Re-check any number before quoting it publicly.

| Measure | 2024 crawl (Bram Stein and Charles Berret; published 11 Nov 2024) | 2025 crawl (Charles Berret; published 15 Jan 2026) |
|---|---|---|
| Sites using web fonts | about 87% | 88%; about 12% use system fonts only |
| Hosting | self-hosting alongside services is common | about 72% self-host at least some fonts |
| Google Fonts share | 57% desktop, 48% mobile | 47–54% |
| Adobe Fonts share | 4.1% | 3.5–4.2% |
| Variable fonts | 33% desktop, 34% mobile; the weight axis is in 99% of them, optical size in 2–3% | 39.4% desktop, 41.3% mobile; top families Noto Sans JP, Roboto, Open Sans, Montserrat |
| Most-used families | Roboto, Font Awesome, Noto Sans JP, Open Sans, Poppins | Font Awesome, Roboto, Poppins, Open Sans |
| Licences | not reported in the summary | SIL Open Font License on 64% of websites; about half of fonts carry no clear licence |
| `font-display: swap` | 44–45% | about 50% |

Labels: documented. Sources: https://almanac.httparchive.org/en/2024/fonts ; https://almanac.httparchive.org/en/2025/fonts

### 5.3 What design-led sites use (Typewolf)
- **Typewolf's 2025 top ten:** Söhne, Feature, Neue Montreal, Founders Grotesk, Cardinal, Editorial Old, Signifier, Monument Grotesk, GT Super, Suisse Int'l.
- **2024:** Lausanne, Reckless, Monument Grotesk, Tiempos Headline, GT America, Neue Montreal, Self Modern, Suisse Int'l, Editorial New, Roboto Mono.
- **All-time, from more than 3,000 featured sites since 2013:** Apercu, GT America, Futura, Founders Grotesk, Neue Haas Grotesk.

(documented, curator's sample: https://www.typewolf.com/all-fonts ; https://www.typewolf.com/recommendations)

Recent site-of-the-day combinations, December 2025 unless noted:

| Display or text serif | Sans | Mono accent |
|---|---|---|
| Grenette | Styrene | |
| Cardinal (with Baskerville) | Sweet Sans | |
| Swear | | DM Mono |
| DaVinci | Suisse Int'l | |
| Kabel (geometric sans) | Neue Haas Grotesk | |
| Editorial Old | Neue Montreal | |
| Tobias | Diatype | Diatype Mono |
| Signifier (Sept 2025) | Switzer | |

(documented: https://www.typewolf.com/)

The common pattern pairs a contemporary grotesque with an editorial or display serif, often with a monospaced accent. (inferred)

This is fashion in one design-led niche, and the web as a whole still runs on Roboto, Open Sans and Poppins (section 5.2). For a brand that wants to stand out, the current Typewolf top ten is the category default to use, invert or avoid, on purpose; Collins's ubiquity point applies. (inferred)

### 5.4 Foundry and trend reports
- **Blaze Type** (blog, 15 Jan 2026). Sans serifs dominated its 2025 releases, and serifs returned in a controlled way as cultural counterpoints. The foundry's work moved toward large systems: one family with 243 styles, and a slab released in three versions of 81 styles each. (practitioner, foundry: https://blazetype.eu/blog/2025-font-reviews-tendencies)
- **Monotype's Type Trends 2025, "Re:Vision".** It has six themes, including "Human Types" on AI and design. Monotype also pledged not to use partner foundries' fonts to train AI for new font designs. Its trends page lists no 2026 report as of today. (marketing: https://monotype.com/type-trends/about-revision-2025 ; https://creativebloq.com/design/fonts-typography/ai-will-help-mainstream-type-says-monotypes-typography-trends-report ; https://monotype.com/type-trends)

### 5.5 Variable fonts and optical sizes
- Adoption rose to about 40 percent of sites in 2025 (section 5.2). Weight is the dominant axis. In 2025, optical-size and fill axes appear on roughly a third of variable-font pages, likely driven by icon fonts such as Material Symbols (documented number; inferred cause).
- Apple's system face is variable, and its optical size moves continuously between 17 and 28 points (WWDC20). Lupton's 3rd edition treats variable fonts and optical sizes as core topics. Spotify Mix uses width as an expressive axis, from condensed to extended. (documented)

### 5.6 Custom brand typefaces
Elizabeth Goodspeed (It's Nice That, 23 Oct 2025) explains why studios now make typefaces:
- Licences have grown expensive and complex; she cites Monotype's Standard plan at $20,500 a year.
- Tools are cheap (Glyphs at €299).
- A custom face lets a brand sound like itself.

Her examples are Order Type Foundry, &Walsh's Type of Feeling, R&M's Triad and Koto's Faculty Glyphic. Her caveats: rushed, one-gimmick fonts, and fewer independent type designers paid to work full time. (practitioner: https://www.itsnicethat.com/articles/elizabeth-goodspeed-on-why-design-studios-are-making-fonts-graphic-design-231025)

Creative Boom (8 Oct 2025) gives four reasons brands commission type: distinctiveness, licence cost at scale, recognition without a logo, and scale across touchpoints. Its examples include Coca-Cola (TCCC Unity), Airbnb (Cereal), Heinz and Mozilla. (documented, press, quoting type studios: https://www.creativeboom.com/insight/why-brands-are-going-custom-with-type/)

Earlier markers:
- Netflix Sans (2018) was expected to save Netflix millions of dollars a year in licensing, compared with Gotham. (documented, press: https://www.marketing-interactive.com/netflix-creates-new-font-to-save-millions-from-licensing-costs)
- Mailchimp's Means (2019). (section 2.2)
- Spotify Mix (2024). (section 2.2)

### 5.7 Fluid type, line breaking and contrast
- Fluid scales are mainstream: the Utopia method and calculator (section 3.9). The accessibility caveat is the 2.5× rule and zoom testing (Barvian). `cstack type scale --fluid` already emits a rem intercept and a vw slope. It does not yet check the 2.5× bound (inferred from reading `scripts/lib/type/scale.mjs`).
- `text-wrap-style` became Baseline in October 2024. `balance` suits headings, captions and blockquotes, and is limited to short blocks. `pretty` suits body copy, trading speed for fewer short last lines. (documented: https://developer.mozilla.org/docs/Web/CSS/text-wrap-style)
- The draft APCA contrast method ties the contrast needed to font size and weight. Its draft status means it cannot replace WCAG 2.2 contrast requirements yet. (documented, draft)

### 5.8 Licensing shifts
- **Japan, games.** After acquiring Fontworks, Monotype ended the LETS plan (about $380 a year) in favour of enterprise plans quoted at $20,500 a year. Following backlash in December 2025, an April 2026 revision set a ¥49,500 base fee plus ¥33,000 for game use, with a distribution cap whose size was not disclosed. (documented, press: https://automaton-media.com/en/news/following-backlash-from-japanese-developers-monotype-announces-revised-game-font-licensing-plan-but-a-new-vaguely-worded-limitation-raises-concerns/)
- **Klim** (October 2021). Desktop licences count users instead of installs. Web licences count page views or unique users, and one web licence also covers email and dynamic ads. (documented, foundry: https://klim.co.nz/blog/changes-to-eulas-new-pricing/)
- **Fontspring.** Pageview tiers start at half a million a month, and overages work on an honour system: contact them and upgrade. (documented: https://support.fontspring.com/hc/en-us/articles/10244205972891-Pageview-FAQs)
- **Adobe Fonts.**
  - No pageview cap, but fonts stop when the subscription stops, and there is no self-hosting.
  - The Additional Terms (2020) forbid distributing, converting or modifying the fonts.
  - Adobe's general terms forbid data mining and extraction, "including data scraping for machine learning". This was read through a third-party terms tracker, not on adobe.com.

  (documented: https://helpx.adobe.com/uk/fonts/web/font-licensing/webfont-licensing.html ; https://wwwimages2.adobe.com/content/dam/cc/en/legal/servicetou/Adobe_Fonts_Additional_Terms_en_US_20200416.pdf ; documented, third-party tracker: https://conductatlas.com/platform/adobe/adobe-terms-of-use/prohibition-on-data-mining-or-scraping-services/)
- **Copyright** (section 1): the US Copyright Office now rejects font-software registrations (Monotype, Jan 2026), and Butterick argues fonts carry little US protection. Licences and contracts carry the weight.
- **Trial fonts.**
  - Grilli Type's trial EULA (March 2019) allows testing and paid or unpaid pitches, but no final files.
  - Zetafonts allows pitches and design tests if unpublished, removes the numerals 0–9 from trial files, and forbids sharing them with clients.
  - Pangram Pangram's free fonts are for personal use, and commercial projects need a licence.
  - Klim's FAQ answers could not be read.

  (documented: https://www.grillitype.com/api/v1/download/eula_trials/Grilli-Type-Trial-Fonts-EULA.pdf ; https://www.zetafonts.com/licensing/trial-license ; https://pangrampangram.com/pages/about)

### 5.9 AI type tools
- **Pairing.**
  - Fontjoy (Jack Qiao, July 2018; a neural-net pairing experiment built with TensorFlow, documented: https://experiments.withgoogle.com/fontjoy).
  - Monotype's AI font pairing in Monotype Fonts (Sept 2024; trained on pairings curated by its studio and refined by users' likes; marketing, reported by press: https://creativebloq.com/design/fonts-typography/monotypes-new-ai-powered-feature-takes-the-stress-out-of-font-pairing).
  - An earlier Monotype "Font Pairing Generator" (Product Hunt, 18 April 2023; marketing: https://www.hunted.space/product/monotype/launches/font-pairing-generator).
- **Search.** Monotype AI Search (25 Feb 2026) offers natural-language font search on MyFonts and Monotype Fonts across more than 250,000 fonts. Its announcement mentions no agent or MCP access. (marketing: https://cms-prod.monotype.com/company/press-release/monotype-launches-ai-search-transforming-font-search-and-discovery-conversational-ai)
- **Generation.** Mixfont describes "a frontier AI model trained to create fonts from text prompts or images". Licensing of its output was not stated on the page read. (marketing: https://www.producthunt.com/p/mixfont/ai-font-generator)
- **Legal risk.** AI tools can extract a typeface from an image or document and make it usable, which may breach licences or copyright (Bennett Jones, Canada, Nov 2025). (practitioner, law firm)

### 5.10 MCP servers that touch type
- **Google Design MCP** (`https://design.googleapis.com/mcp`) offers five tools: `search_fonts`, `describe_font`, `generate_color_scheme`, `search_icons` and `icons_instructions`. The overview says developers need no API key or OAuth credentials. The reference page says to enable MCP servers and set up authentication. Probe it before depending on it. Pages last updated 2026-04-08 (overview) and 2026-05-20 (reference). (documented: https://developers.google.com/design-mcp/overview ; https://developers.google.com/design-mcp/reference/mcp)
- **Figma MCP.** `get_variable_defs` returns the variables and styles used in a selection, typography included. This is the route for reading a design file's type tokens. (documented: https://developers.figma.com/docs/figma-mcp-server/trigger-specific-tools/)
- No MCP or API was found for Fonts In Use, Typewolf or Adobe Fonts. Adobe has only the legacy Typekit API, whose changelog stops in September 2011. (documented: https://fonts.adobe.com/docs/api/changelog)

### 5.11 Y Combinator companies
No type-focused YC company was found. Searches turned up Hacker News threads, not company pages, and the YC directory was not fetched. This is "not found", not "none exists". (inferred from searches)

## 6. Tools cstack could detect or use (proposed `registry/research-tools.json` entries)

| Tool | How cstack reaches it | Auth | Automated access | Use in cstack | Label |
|---|---|---|---|---|---|
| Fonts In Use | browser (human); RSS feeds for new uses | none | prohibited by its terms (robots, data mining); cite single pages | precedent for type choices and pairings | documented |
| Typewolf | browser (human) | none | no terms found; browse at human pace | what design-led sites use; pairing ideas | documented (terms unverified) |
| Google Fonts | Design MCP; Developer API; google/fonts repository | Design MCP: none claimed (probe it); Developer API: API key | allowed under the Google APIs Terms of Service | open-licence catalogue, font descriptions, files and licences | documented |
| Adobe Fonts | browser (owner's account); legacy Typekit API | Creative Cloud account; API token | general terms forbid data mining and ML scraping | check availability; keep choices provisional until the licence scope is known | documented |
| Foundry trial fonts | files the user downloads | none | not applicable; local files | specimens and pitches only | documented |
| Wakamai Fondue | browser (local processing) | none | human tool | inspect features, axes and character set | documented (third-party review) |
| fontTools | CLI (Python; installing needs approval) | none | not applicable; local | inspect, subset, instance; bounded by the font's EULA | documented |

Proposed entries, in the exact shape of `registry/research-tools.json` (skills and workflows checked against `skills/` and `workflows/`; no id clashes with the 41 existing entries):

```json
[
  {
    "id": "fonts-in-use",
    "name": "Fonts In Use",
    "layer": "type_references",
    "roles": [
      "typefaces in real-world use, indexed by typeface, format, industry and period",
      "in-use evidence for type choices, pairings and identity precedents"
    ],
    "priority": 4,
    "access": [
      {
        "mode": "browser",
        "official": true,
        "endpoint_or_package": "https://fontsinuse.com (public archive; a human browses and shares links to individual use pages)",
        "auth_env": [],
        "auth_env_origin": "vendor",
        "plan": "free",
        "source": "https://www.fontsinuse.com/about",
        "confidence": "high"
      },
      {
        "mode": "export",
        "official": true,
        "endpoint_or_package": "RSS feeds listed on the FAQ (https://fontsinuse.com/main.rss, /staff-picks.rss, /blog.rss) for new-use alerts; titles and links only",
        "auth_env": [],
        "auth_env_origin": "vendor",
        "plan": "free",
        "source": "https://fontsinuse.com/faq",
        "confidence": "medium"
      }
    ],
    "mcp": {
      "official": false,
      "notes": "No API or MCP found; the FAQ lists RSS feeds only.",
      "source": "https://fontsinuse.com/faq",
      "confidence": "medium"
    },
    "detect": {
      "mcp_tool_patterns": [
        "mcp__fonts_in_use__*",
        "mcp__fontsinuse__*"
      ],
      "env": [],
      "cli": [],
      "files": [
        "references/fonts-in-use"
      ]
    },
    "returns": [
      "use pages naming typefaces, designers, format, industry and year (through links a human shares)",
      "new-use alerts from the RSS feeds"
    ],
    "tos_notes": "Terms of use prohibit data mining, robots, spiders and similar data-gathering or extraction tools, and commercial reproduction without written consent; site content is reproduced under fair use. Never let an agent crawl or bulk-fetch the site; cite individual use pages by URL. Operator: Fonts In Use LLC.",
    "fallback": "Ask the user for links to specific use pages or screenshots; otherwise cite foundry in-use pages and the brand's own competitor captures, labelled as such, and say Fonts In Use was not queried.",
    "cstack_skills": [
      "type-director",
      "identity-system",
      "competitor-intel",
      "taste-search"
    ],
    "cstack_workflows": [
      "create-brand",
      "logo-system"
    ],
    "last_verified": "2026-10-03"
  },
  {
    "id": "typewolf",
    "name": "Typewolf",
    "layer": "type_references",
    "roles": [
      "curated site of the day with the fonts each site uses",
      "font popularity across its featured sites (yearly and all-time, 2013 onwards)",
      "pairing ideas and alternatives"
    ],
    "priority": 3,
    "access": [
      {
        "mode": "browser",
        "official": true,
        "endpoint_or_package": "https://www.typewolf.com (site of the day; /all-fonts usage data; /recommendations lists)",
        "auth_env": [],
        "auth_env_origin": "vendor",
        "plan": "free public pages",
        "source": "https://www.typewolf.com/all-fonts",
        "confidence": "high"
      }
    ],
    "mcp": {
      "official": false,
      "notes": "No API or MCP found.",
      "source": "unverified (searches on 2026-10-03 found none)",
      "confidence": "low"
    },
    "detect": {
      "mcp_tool_patterns": [
        "mcp__typewolf__*"
      ],
      "env": [],
      "cli": [],
      "files": [
        "references/typewolf"
      ]
    },
    "returns": [
      "fonts used by featured sites, with dates",
      "usage counts drawn from about 3,000 featured sites",
      "curated pairing and alternative lists"
    ],
    "tos_notes": "unverified: no terms of use found (the homepage footer links a privacy policy). Browse at human pace; no crawling or bulk extraction. Popularity reflects a curated sample of design-led sites, not the web.",
    "fallback": "HTTP Archive Web Almanac fonts chapter for measured web-wide usage; Fonts In Use pages the user shares; foundry in-use pages.",
    "cstack_skills": [
      "type-director",
      "taste-search",
      "cultural-scan"
    ],
    "cstack_workflows": [
      "landing-page"
    ],
    "last_verified": "2026-10-03"
  },
  {
    "id": "google-fonts",
    "name": "Google Fonts (Developer API, Google Design MCP, google/fonts repository)",
    "layer": "type_sources",
    "roles": [
      "open-licence font catalogue metadata (families, variants, axes, subsets, categories)",
      "font search and description for agents",
      "font files and licences for self-hosting"
    ],
    "priority": 4,
    "access": [
      {
        "mode": "mcp",
        "official": true,
        "endpoint_or_package": "https://design.googleapis.com/mcp (Google Design MCP; tools search_fonts, describe_font, generate_color_scheme, search_icons, icons_instructions)",
        "auth_env": [],
        "auth_env_origin": "vendor",
        "plan": "free; the overview says no API key or OAuth 2.0 credentials are needed, while the reference page mentions enabling MCP servers and setting up authentication, so probe before relying on it",
        "source": "https://developers.google.com/design-mcp/overview",
        "confidence": "high"
      },
      {
        "mode": "api",
        "official": true,
        "endpoint_or_package": "https://www.googleapis.com/webfonts/v1/webfonts?key=<key> (sort alpha|date|popularity|style|trending; filters family, subset, category, capability WOFF2|VF)",
        "auth_env": [
          "GOOGLE_FONTS_API_KEY"
        ],
        "auth_env_origin": "cstack",
        "plan": "free Google Cloud API key; use is bound by the Google APIs Terms of Service",
        "source": "https://developers.google.com/fonts/docs/developer_api",
        "confidence": "high"
      },
      {
        "mode": "export",
        "official": true,
        "endpoint_or_package": "github.com/google/fonts (families in ofl/, apache/ and ufl/ directories, each with METADATA.pb and its licence file); fetch only the families needed",
        "auth_env": [],
        "auth_env_origin": "vendor",
        "plan": "free; per-family OFL, Apache or UFL licence",
        "source": "https://googlefonts.github.io/gf-guide/googlefonts.html",
        "confidence": "high"
      }
    ],
    "mcp": {
      "official": true,
      "notes": "Google Design MCP covers font discovery and description (plus Material colour and icons). The JSON at fonts.google.com/metadata/fonts that some community tools read is not a documented API; cstack does not depend on it.",
      "source": "https://developers.google.com/design-mcp/reference/mcp",
      "confidence": "high"
    },
    "detect": {
      "mcp_tool_patterns": [
        "mcp__google-design__*",
        "mcp__google_design_mcp__*",
        "mcp__design-mcp__*"
      ],
      "mcp_tool_fingerprints": [
        "search_fonts",
        "describe_font",
        "generate_color_scheme"
      ],
      "env": [
        "GOOGLE_FONTS_API_KEY"
      ],
      "cli": []
    },
    "returns": [
      "families with variants, subsets, axes, category, version, lastModified and file URLs (Developer API)",
      "font descriptions: look and feel, styles, weights, usage, languages (Design MCP)",
      "font files, METADATA.pb and licence files (repository)"
    ],
    "tos_notes": "Developer API use is bound by the Google APIs Terms of Service (Google Fonts API terms page last updated 2021-11-09). Each font carries its own open licence (OFL, Apache or UFL); keep the licence file with any self-hosted copy. Design MCP documentation is CC BY 4.0, code samples Apache 2.0.",
    "fallback": "Browse fonts.google.com by hand and record family names, or download specific families from the google/fonts repository and inspect them with `cstack type font`.",
    "cstack_skills": [
      "type-director",
      "identity-system"
    ],
    "cstack_workflows": [
      "create-brand",
      "landing-page"
    ],
    "last_verified": "2026-10-03"
  },
  {
    "id": "adobe-fonts",
    "name": "Adobe Fonts",
    "layer": "type_sources",
    "roles": [
      "subscription font library for desktop and web projects",
      "library metadata (families, foundries, classification, CSS stacks) through the legacy Typekit API"
    ],
    "priority": 2,
    "access": [
      {
        "mode": "browser",
        "official": true,
        "endpoint_or_package": "https://fonts.adobe.com (Creative Cloud account; web projects served only through Adobe's embed code)",
        "auth_env": [],
        "auth_env_origin": "vendor",
        "plan": "Creative Cloud subscription; no monthly pageview limit for web projects; web fonts stop working on sites if the subscription is cancelled; no self-hosting",
        "source": "https://helpx.adobe.com/uk/fonts/web/font-licensing/webfont-licensing.html",
        "confidence": "high"
      },
      {
        "mode": "api",
        "official": true,
        "endpoint_or_package": "https://typekit.com/api/v1/json/ (kits, libraries, families/:family; changelog last updated September 2011)",
        "auth_env": [
          "ADOBE_FONTS_API_TOKEN"
        ],
        "auth_env_origin": "cstack",
        "plan": "Adobe account API token; the auth header was not confirmed this pass, and the changelog's last entry is September 2011, so the API may be unmaintained",
        "source": "https://fonts.adobe.com/docs/api/requests",
        "confidence": "medium"
      }
    ],
    "mcp": {
      "official": false,
      "notes": "No Adobe Fonts MCP found. The adobe-creativity connector entry does not document font licensing tools.",
      "source": "unverified (searches on 2026-10-03 found none)",
      "confidence": "low"
    },
    "detect": {
      "mcp_tool_patterns": [
        "mcp__adobe_fonts__*",
        "mcp__adobefonts__*",
        "mcp__typekit__*"
      ],
      "env": [
        "ADOBE_FONTS_API_TOKEN"
      ],
      "cli": []
    },
    "returns": [
      "library and family metadata (browse info, foundry, variations, CSS stack) via the legacy API",
      "availability of a family in the user's account (human check)"
    ],
    "tos_notes": "Adobe Fonts Additional Terms (2020): use fonts only through the service; no distributing, converting, modifying or reverse engineering font files; documents and sites stay viewable only while the subscription continues. Adobe's general terms prohibit data mining and extraction, including data scraping for machine learning (quoted via a third-party terms tracker; Adobe's page not fetched). Never scrape fonts.adobe.com or extract font files from kits.",
    "fallback": "The user checks availability in their Adobe account and shares family names; type-director keeps Adobe Fonts choices provisional until the licence scope (web project, desktop, app, broadcast, logo) is confirmed.",
    "cstack_skills": [
      "type-director",
      "identity-system"
    ],
    "last_verified": "2026-10-03"
  },
  {
    "id": "foundry-trial-fonts",
    "name": "Foundry trial and test fonts",
    "layer": "type_sources",
    "roles": [
      "test retail typefaces in specimens and pitches before licensing"
    ],
    "priority": 3,
    "access": [
      {
        "mode": "export",
        "official": true,
        "endpoint_or_package": "trial files the user downloads from a foundry (examples: Grilli Type trials, Zetafonts trial licence, Pangram Pangram free personal-use fonts) and places in the brand workspace under assets/fonts/trial",
        "auth_env": [],
        "auth_env_origin": "cstack",
        "plan": "free; terms differ per foundry",
        "source": "https://www.grillitype.com/api/v1/download/eula_trials/Grilli-Type-Trial-Fonts-EULA.pdf",
        "confidence": "medium"
      }
    ],
    "detect": {
      "mcp_tool_patterns": [],
      "env": [],
      "cli": [],
      "files": [
        "assets/fonts/trial",
        "fonts/trial"
      ]
    },
    "returns": [
      "font files for `cstack type font` inspection and specimen rendering, for testing only"
    ],
    "tos_notes": "Trial licences are for testing. Grilli Type (trial EULA, March 2019) allows testing and paid or unpaid pitches but no final files; Zetafonts allows unpublished pitches and design tests, leaves numerals 0-9 out of trial files and forbids passing files to clients; Pangram Pangram's free fonts are for personal use, and commercial projects need a licence. Read each foundry's EULA; never publish, deploy or hand over trial files; record trial status in the font's provenance.",
    "fallback": "Use the foundry's own web type tester by hand, or explore with open-licence fonts; keep every trial-based choice provisional until it is licensed.",
    "cstack_skills": [
      "type-director",
      "identity-system",
      "mockup"
    ],
    "cstack_workflows": [
      "create-brand",
      "packaging"
    ],
    "last_verified": "2026-10-03"
  },
  {
    "id": "wakamai-fondue",
    "name": "Wakamai Fondue",
    "layer": "type_inspection",
    "roles": [
      "what a font file can do: OpenType features, variable axes, character set, metadata and licence fields, generated CSS"
    ],
    "priority": 2,
    "access": [
      {
        "mode": "browser",
        "official": true,
        "endpoint_or_package": "https://wakamaifondue.com (drop a font file; processed locally in the browser, not uploaded)",
        "auth_env": [],
        "auth_env_origin": "vendor",
        "plan": "free; open source",
        "source": "https://creativepro.com/reveal-your-fonts-hidden-secrets-with-wakamai-fondue/",
        "confidence": "medium"
      }
    ],
    "detect": {
      "mcp_tool_patterns": [],
      "env": [],
      "cli": []
    },
    "returns": [
      "OpenType feature list with previews",
      "variable axes and named instances",
      "character set by category or Unicode block",
      "CSS for features and axes"
    ],
    "tos_notes": "Runs locally, so font files are not uploaded (per a February 2021 CreativePro review); the tool's own terms were not reviewed. A human tool; `cstack type font` covers the same checks from the CLI.",
    "fallback": "`cstack type font <file> --languages <codes>` for names, fsType, metrics, axes, features and coverage; fontTools ttx for raw tables.",
    "cstack_skills": [
      "type-director"
    ],
    "last_verified": "2026-10-03"
  },
  {
    "id": "fonttools",
    "name": "fontTools",
    "layer": "type_inspection",
    "roles": [
      "inspect, convert, subset, merge and instance font files from the command line"
    ],
    "priority": 3,
    "access": [
      {
        "mode": "cli",
        "official": true,
        "endpoint_or_package": "Python package fonttools (current docs require Python 3.11+): fonttools, ttx, pyftsubset, pyftmerge; subcommands subset, merge, varLib, varLib.instancer, feaLib, cu2qu (installing needs the owner's approval)",
        "auth_env": [],
        "auth_env_origin": "vendor",
        "plan": "free, MIT",
        "source": "https://fonttools.readthedocs.io/en/latest/",
        "confidence": "high"
      }
    ],
    "detect": {
      "mcp_tool_patterns": [],
      "env": [],
      "cli": [
        "fonttools",
        "ttx",
        "pyftsubset"
      ],
      "files": []
    },
    "returns": [
      "XML dump of font tables (ttx)",
      "WOFF2 subsets per script or page (pyftsubset)",
      "static or partial instances of variable fonts (varLib.instancer)",
      "merged fonts (pyftmerge)"
    ],
    "tos_notes": "The software is MIT; the font's licence still governs what may be done to the font. Many commercial EULAs forbid modifying or converting fonts, and subsetting, instancing or format conversion may count as modification. Check the EULA first; open licences such as the OFL allow modification under their own conditions.",
    "fallback": "`cstack type font` for read-only inspection; leave subsetting to the foundry's web kit or the font service.",
    "cstack_skills": [
      "type-director"
    ],
    "cstack_workflows": [
      "landing-page"
    ],
    "last_verified": "2026-10-03"
  }
]
```

One change to an existing entry: add `"type-director"` to the `figma` entry's `cstack_skills`, because `get_variable_defs` returns typography variables and text styles (section 5.10).

## 7. Canon changes in this pass
- **Upgraded, same ids:** `thinking-with-type` (editions, 3rd-edition scope), `vignelli` (Canon, Unigrid, subway map, signage myth, varying lists), `swiss-grid-systems` (Müller-Brockmann's method; the grid as an aid, not a guarantee).
- **New:** `bringhurst`, `gerstner-designing-programmes`, `spiekermann`, `pentagram`, `collins`, `practical-typography`, `web-typography`.
- Every entry fills `distance_from` with work categories (identity, editorial, web-product-ui, packaging, campaign-advertising, motion, wayfinding).
- Every entry's `tensions` links its counterweights as `canon:<id>`.
- Sources are `external_reference` entries with URLs or book references, and quotes are only those verified as above.
- `canon/README.md` now lists the typography cluster and these conventions.

## 8. Unreachable sources

| Source | What was tried | Result |
|---|---|---|
| X search (`x.com/search?q=%23typography`) | WebFetch | The permission request was not answered in time; no API was available without paid access. Current practice uses the secondary sources in section 5 |
| Instagram tag page (`instagram.com/explore/tags/typography/`) | WebFetch | Same: permission not answered in time |
| thinkingwithtype.com | WebFetch | Permission not answered in time; the publisher and catalogue pages were used instead |
| fontsinuse.com homepage | WebFetch | Permission not answered in time; individual use and policy pages were fetched instead |
| en.wikipedia.org/wiki/Erik_Spiekermann | WebFetch | Permission not answered in time; Spiekermann's bio PDF and the FF Meta article were used instead |
| github.com/google/fonts `cc-by-sa/knowledge`; github.com/elliotjaystocks/typography | WebFetch | The first: permission not answered; the second: HTTP 404. The Google Fonts Knowledge article bodies are JavaScript-rendered (meta descriptions only) |
| fonts.google.com/knowledge/choosing_type | WebFetch | Permission not answered in time; the individual lesson URLs returned metadata only |
| m3.material.io blog (type scale) | WebFetch | JavaScript-only page; roles were taken from Compose documentation |
| fonts.google.com/faq (redirected from developers.google.com/fonts/faq) | WebFetch | The redirect was not followed |
| pmc.ncbi.nlm.nih.gov PMC5629233 (dyslexia font study) | WebFetch | reCAPTCHA page; a university summary of Kuster et al. was used instead |
| news.ycombinator.com item 18535681 | WebFetch | HTTP 419 |
| vignelli.com/canon.pdf | WebFetch | HTTP 404; the RIT-hosted copy was used |
| nysun.com review of the film *Helvetica* | WebFetch | Paywall |
| klim.co.nz/faqs | WebFetch | Answers collapsed; only the questions were visible |
| Adobe general Terms of Use | WebSearch | Read through the ConductAtlas tracker, not adobe.com |
| github.com and frontify.com through `curl` | curl via the session proxy | Proxy returned 403; not routed around. WebFetch and WebSearch were used instead |
| Y Combinator company directory | WebSearch | Not fetched; searches returned only Hacker News threads |

## 9. Open questions
- What Bringhurst's chapter 6 says about choosing and combining type (not checked this session).
- Whether Williams's book uses "concord" for the third type relationship (not verified).
- The grid of the 2011 MIT Media Lab identity. CreativeApplications describes a 4×4 grid, while Pentagram and Dezeen describe Richard The's anniversary logo as seven-by-seven. They may be different artefacts.
- Who designed Twitch's 2019 identity. Searches surfaced a later refresh by Porto Rocha; the 2019 credit was not checked, so attribute nothing.
- Whether Google Design MCP needs authentication: the overview says no, the reference page says set it up.
- How many styles Sharp Grotesk had at the Dropbox launch: 259 per Design Week, 250 per Dezeen.
- The exact Web Almanac numbers, which came from summaries. Re-read the chapters before publishing them.
- Typewolf's terms of use (none found), and whether Adobe's legacy Typekit API still issues tokens.

## 10. cstack implications
1. **Fix the primer citations** (`skills/type-director/references/primer.md`):
   - The letterspacing line cites "Bringhurst §3.2"; it should be §2.1.6 (capitals, small caps, digit strings) and §2.1.7 (lowercase).
   - In the Sources list, cite Lupton's 3rd edition (2024) for variable fonts, optical sizes, writing systems and accessibility.
   - Change Bringhurst's "§3.2 letterspacing and figures" to "§2.1.6–2.1.7 letterspacing; §3.2.1 figures; §3.2.2 small caps", and mark "ch. 6 choosing and combining type" as unverified.
   - Date *Stop Stealing Sheep* 3rd edition to 13 December 2013.
   - Mark Williams's "concord" as unverified. Conflict and contrast are supported.
   - Mark the "Bringhurst ch. 6" citation in section 1 of the primer as unverified.
2. **Keep the dogma table's evidence beside the rules.** The primer's section 8 should carry the counter-evidence from section 4: Richardson; Dyson and Kipping; the WCAG 1.4.12 note; Barvian's 2.5× rule; `text-wrap`. Its review rubric should flag any rule applied without its reason.
3. **Add a zoom check to `cstack type scale --fluid`.** It should warn when a step's maximum exceeds 2.5 times its minimum, and its notes should tell users to test at 200 and 500 percent zoom. It already emits a rem intercept. (inferred from Barvian and `scale.mjs`)
4. **Record licence state in every type decision:**
   - the licence model (open licence; subscription; perpetual desktop, web or app; trial);
   - whether a subscription keeps the fonts alive (Adobe Fonts);
   - what the EULA says about modification before any subsetting or instancing (fontTools);
   - any clauses on AI and data mining.

   Trial-based choices stay provisional and trial files never reach final artwork.
5. **Use the studio mechanisms as procedure, not style:**
   - Write the type brief by the job (Spiekermann).
   - State the reason for each face (Bierut's thirteen).
   - Test range in widths, weights and scripts against the system's jobs (Lineto for Spotify; Spotify Mix).
   - Decide renewal against constancy up front (The Public Theater kept its logo and changed the type).
   - Reduce once recognition is earned (Mastercard).
   - Review by meaning, grammar and use (Vignelli).
6. **Retrieve canon in pairs:** `vignelli` with `pentagram` and `collins`; `bringhurst` with `web-typography`. Generation prompts carry mechanisms, never names, as the canon README requires.
7. **Tools, honestly:**
   - Fonts In Use and Typewolf are human-paced references: cite single pages and never crawl.
   - Google Fonts is the default machine-readable catalogue (Design MCP after a probe; Developer API with a key; the google/fonts repository for licence files); never depend on undocumented endpoints.
   - fontTools needs the owner's approval before install.
   - Detect Google Design MCP by its tool names (`search_fonts`, `describe_font`), and add `type-director` to the Figma entry so type tokens can be read from design files.
8. **Treat trend lists as defaults to choose against.** Typewolf's top ten and the grotesque + editorial serif + mono accent pattern are a design-led fashion signal. type-director should name them as category defaults when the brief asks for distinctiveness. (inferred; Collins on ubiquity)
