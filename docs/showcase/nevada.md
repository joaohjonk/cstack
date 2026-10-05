# Nevada: cstack, end to end

How far does cstack get without a marketing expert in the room? Nevada is a fictional sparkling tea, taken in one day (2026-10-05) from a founder's first line to a brief, a pack, a photoshoot, ads with tests, a website and a map of its own process, for about USD 3.91 of image spend. The founder was played by cstack's owner, and every verdict quoted here is his. Each step says whether cstack **led** or **followed**, and what it got wrong.

<p align="center">
  <img src="nevada/pack-lineup.jpg" alt="Five tall Nevada cans: drop 00 plain on bare metal, then yuzu white tea, black cherry lime, tamarind chili and lychee rose, each with a big screen-printed picture, the NEVADA wordmark, a NEVER TOO SWEET sweetness meter and a round $3.99 ALWAYS badge." width="100%">
</p>
<p align="center"><sub>The pack, rendered in 3D straight from the flat artwork, so every letter is exact. Price, origins and sizes are placeholders.</sub></p>

## 0. The map

<p align="center">
  <img src="nevada/fig-a-workflow-map.svg" alt="Figure A, how Nevada was made: a false start, then founder interview, references, territories, explore, craft-first wraps, on the can and the downstream round, each with the gate that had to pass before the next step." width="360">
</p>

cstack drew this from the run's own files: run logs, findings and the spend ledger.

## 1. Founder first (followed)

The first attempt jumped to pictures, and the founder stopped it. Now `/brief` interviews the founder before anything is made, and the make gate stays shut until the founder approves the brief, closing again on every pivot.

> "a better healthier version of the classic value iced tea … a mass hype brand but premium pricing because of premium ingredients"

## 2. Craft first (followed, then fixed)

The first explore round asked an image model for whole cans. The founder's verdict: "kinda ok", then "just ugly craft on the packaging". So the wraps were designed flat, with real type, and the model painted only the poster picture.

<p align="center">
  <img src="nevada/03-explore-yuzu-single1.jpg" alt="An early explore frame: a pale yellow can with a citrus sun over tea leaves, and no name, price or drop on it." width="32%">
  <img src="nevada/04-poster-yuzu-a.jpg" alt="The generated picture alone: a yuzu rising like the sun over rows of tea, in three flat inks." width="32%">
  <img src="nevada/04-flat-wrap-yuzu.jpg" alt="The flat wrap: the same picture with the wordmark, drop number, price badge and flavour lines set in real type." width="32%">
</p>
<p align="center"><sub>Explore, the generated picture, the flat wrap with set type. Verdict on the wraps: "kinda enjoy it".</sub></p>

## 3. Then cstack pushes back (led)

Before making anything downstream, cstack wrote a challenge memo: what it would do better than asked, with evidence.

- **"Never too sweet" becomes a system**, not a sticker: a sweetness meter (NOT SWEET, BARELY, A LITTLE) on every can, ad and page. It never passes "a little".
- **Claims kept legal.** "Low sugar" is not an FDA-defined claim, and "0 g sugar" needs "not a low calorie food" beside it, so both came off the fronts (21 CFR 101.60).
- **Price tested, not assumed:** a fixed price printed on the can, with $3.99 on a tall can tested against $2.99 on 16 oz.
- **Drops with a reason:** each flavour drops in its harvest season.
- **Packaging truth:** the can shape drawn so far holds about 19 to 21 fl oz, not the 23.5 printed on it. The run kept 23.5 fl oz on a taller can.

## 4. Read the category before the ads (founder asked, then led)

A scan of public ad libraries (two leading better-for-you sodas, the best-selling value iced tea, a big tea brand) found the category's conventions: a sugar number as proof, gut and fiber claims, "soda, but better", dessert framing, creator recipes and 25 to 30% discounts. Every Nevada ad cites what it copies, avoids or owns.

| Ad | Bet | Copies, avoids, owns |
|---|---|---|
| "Iced tea was never supposed to be syrup." | B1, myth to correct | owns the meter; its own contrast line; no dessert framing |
| "Even the ants agree." | B1, unexpected object | owns the meter; a joke instead of a health-stat scare |
| "$3.99 ALWAYS" against "$2.99 ALWAYS" | B2, price test | owns the fixed printed price; no discount |
| "Drop 01 is yuzu. Because it's yuzu season." | B3, drop story | copies drops told as stories; owns harvest drops with a reason |

## 5. Identity and packaging, with real craft (led)

Colour and type tokens, a NEVER TOO SWEET seal and the meter as vectors, pack v3 with the key line in the top half, and a shelf test. Only the poster pictures were generated; the type is set, not drawn. Image spend: USD 0.

<p align="center">
  <img src="nevada/pack-marks.jpg" alt="The NEVER TOO SWEET seal and the sweetness meter at sizes down to 32 pixels." width="49%">
  <img src="nevada/pack-shelf.jpg" alt="A shelf mock-up with Nevada cans among neutral placeholder competitors." width="49%">
</p>
<p align="center"><sub>At 3 m the meter can't be read yet. That is logged.</sub></p>

## 6. A 10-shot campaign, with labels kept true (led)

The shoot ran as a sequence (icon, world, human, ritual, product, detail, culture, weird, proof, closer) and as Grid → Pick → Polish: cheap grids first, picks with reasons, then polish. The image model got the can's label wrong in 4 of 7 frames ("22.5 FL OZ", "$3.98"), so no model-drawn label was kept: every can wears the exact label from the 3D render, with the scene's light carried over.

<p align="center">
  <img src="nevada/shoot-s01-icon.jpg" alt="Icon shot of a Nevada can." width="32%">
  <img src="nevada/shoot-s03-human.jpg" alt="A laughing person with a hand on a Nevada yuzu can at a table." width="32%">
  <img src="nevada/shoot-s04-ritual.jpg" alt="Ritual shot with a Nevada can." width="32%">
  <img src="nevada/shoot-s06-detail.jpg" alt="Detail shot of the can." width="32%">
  <img src="nevada/shoot-s08-weird.jpg" alt="An unexpected-object shot with a Nevada can." width="32%">
  <img src="nevada/shoot-s10-closer.jpg" alt="Closing shot of the range." width="32%">
</p>
<p align="center"><sub>Six of ten frames. The independent review said "fix first": too much yuzu, a calm wellness look rather than mass hype, a weak product frame.</sub></p>

## 7. Ads: three bets, each with a test (led)

Each bet has a tension, an audience, a hook family and one controlled experiment. Type is set in HTML from the brand tokens, never drawn by a model.

<p align="center">
  <img src="nevada/ad-B1-A-feed.jpg" alt="Ad: ICED TEA WAS NEVER SUPPOSED TO BE SYRUP, a yuzu can on a sunlit wall, a How sweet is it? meter at BARELY, and SHOP DROP 01." width="32%">
  <img src="nevada/ad-B1-B-feed.jpg" alt="Ad from bet B1, cell B." width="32%">
  <img src="nevada/ad-B2-A-feed.jpg" alt="Ad from bet B2: the $3.99 ALWAYS price cell." width="32%">
  <img src="nevada/ad-B2-B-feed.jpg" alt="Ad from bet B2: the $2.99 ALWAYS price cell." width="32%">
  <img src="nevada/ad-B3-A-feed.jpg" alt="Ad from bet B3: a drop story." width="32%">
  <img src="nevada/ad-B3-B-feed.jpg" alt="Ad from bet B3, cell B." width="32%">
</p>

<p align="center">
  <img src="nevada/video-storyboard.jpg" alt="A video storyboard for a short Nevada spot." width="100%">
</p>

No video clip was made. No video route was priced, and a video model would redraw the label, which this brand forbids.

## 8. The website, built from the tokens (led)

A one-page site with the 3D can as the hero (drag to turn, exact artwork), the meter, the drops with a harvest calendar, and where to buy. It passed cstack's type, token and accessibility checks at 375, 768 and 1440 px. The independent review first said fix (dead buy buttons, a false FAQ line), then promote.

<p align="center">
  <img src="nevada/site-1440.jpg" alt="The Nevada site at desktop width: NEVER TOO SWEET in heavy type beside a 3D can, then the sweetness meter for each drop." width="66%">
  <img src="nevada/site-375.jpg" alt="The Nevada site at phone width." width="24%">
</p>

## 9. The process, measured

<p align="center">
  <img src="nevada/fig-b-gates.svg" alt="Figure B: the checks that stopped the run." width="360">
  <img src="nevada/fig-c-verdicts.svg" alt="Figure C: what the founder said at each step, beside the independent reviewer's scores." width="360">
</p>
<p align="center">
  <img src="nevada/fig-d-spend.svg" alt="Figure D: image spend by step." width="360">
  <img src="nevada/fig-e-fixed.svg" alt="Figure E: what cstack got wrong and what is fixed." width="360">
</p>

| Step | Estimated image spend |
|---|---|
| First, wrong-order run (before the founder interview) | USD 0.26 |
| Brand direction: explore, posters, on the can | USD 2.32 |
| Downstream: identity, pack, 3D, site, figures | USD 0.00 |
| Downstream: 10-shot campaign (the ads reuse it) | USD 1.32 |
| **Total** | **USD 3.91** |

Estimates from cstack's ledger at the provider's listed prices. Billed cost could not be reconciled without a billing-scoped key.

## 10. Where it still needs a human

- **Taste and register.** Reviewers rated the campaign "calm premium wellness" while the founder asked for "mass hype". Only the owner can settle that; the next ad round tests one louder cell.
- **Product facts.** Can size, origins, a sensory panel for the meter, and supplier proof for "real yuzu".
- **The test plan.** Two "ALWAYS" prices can't run in public at once; the test needs a regional split.
- **cstack's own gaps,** each logged as a numbered finding: it never challenged the founder until asked, it stopped at craft, it had no naming method, it trusted an eye check on type, and an agent routed around a blocked tool. Several are fixed on main; the rest are queued.

<sub>Fictional brand for demonstration. No real company's artwork, marks or photographs appear. References and competitor ads were used as evidence only and are not reproduced. The images were generated for this field test with GPT Image 2.5 and composited with cstack's own flat artwork and 3D renders.</sub>
