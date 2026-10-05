# Contact sheets, blind picks and the text check

A visual decision needs the options side by side, and calibration needs the owner's picks recorded before any reviewer's opinion reaches them. `cstack sheet` does both for still images. It never calls a model and never uploads anything.

```bash
cstack sheet make work/probes/territory-a --out work/sheets/territory-a.html --png     # one sheet per territory
cstack sheet make work/probes --out work/sheets/r3-blind.html --blind                    # every probe, codes only
# open r3-blind.html, press "Pick pairs", pick, then "Download picks.json"
cstack sheet import ~/Downloads/r3-blind.picks.json --sheet work/sheets/r3-blind.html --by Joao --ws .
```

## make

`cstack sheet make <images|folders...> --out <sheet.html>` writes a single page that shows the images through relative links, plus `<sheet>.json` with each image's size and sha256. Options:

- `--cols N` (default 4; two columns on a phone), `--title "..."`.
- `--png` renders the page to `<sheet>.png` with Chromium (needs `playwright-core` and a Chromium, as `cstack browse` does). Use the PNG wherever a gate or a message needs an image. A territory's `probe_sheet` in a flow plan can be the HTML or the PNG.
- `--blind` shuffles the images and labels them A, B, C... The page shows copies named by code in `<sheet>.files/`, so neither the page nor "open image in new tab" shows a file name, territory or model. The code-to-file map goes to `<sheet>.key.json` with the shuffle's `--seed` (random unless given). Don't open the key before the picks are in.
- Nothing is overwritten without `--force`.

## Picking pairs

The sheet's "Pick pairs" button shows two random images at a time. For each pair, choose left, right, tie or neither, set the margin (slight, clear, decisive), and add one line on why the winner won if you like. The page avoids repeating a pair, keeps the picks in the browser while you work, and "Download picks.json" saves them. Picks are pairwise because a pair forces a choice that a score can hide, and because pairwise picks are what a reviewer is calibrated against ([evals.md](evals.md#judgment-separation)).

## import

`cstack sheet import <picks.json> --sheet <sheet.html> --by <name>` maps each code back to its source file through the key, and appends one `feedback-event` per pick to `state/feedback.jsonl` (`type: pairwise`, `pair: {a, b, winner, margin}`, `reason`, `context.scope: blind pairwise`). It refuses picks made on another sheet, and codes that are not on this sheet. Paths are recorded relative to the workspace.

## Text in generated images

Probes and heroes must not carry lettering or logos: type and marks are set by identity work, never drawn by a model. `cstack image text <images|folders...>` checks each image and exits 1 when any shows text, so a flow's stop rule can run it after every image and stop the batch on the first failure. In the field test, an eye check alone caught 3 of 6 images with made-up lettering.

- `--engine tesseract` uses local OCR. A word read with confidence counts, and so do three or more glyph-like fragments, which is how garbled lettering reads. These thresholds are researched defaults that are not yet calibrated against the owner's verdicts, and the output says so. cstack never installs tesseract (`brew install tesseract`).
- `--engine judge --judge "<cmd>"` asks any agent CLI that can open an image file, and reads back `{"text", "logo", "where", "confidence"}`. A logo with no text also fails.
- `auto` (the default) uses tesseract when it is on PATH, else the judge. With neither, the command refuses rather than passing.
