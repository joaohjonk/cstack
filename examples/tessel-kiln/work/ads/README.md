# Ads export (fictional)

`2026-09-meta-export.csv` is invented data in the shape of an ads-manager export, with taxonomy tags added as columns (`format`, `talent`, `hook_tactic`, `mechanic`, `angle`, `visual_world`). It was imported with:

```bash
node bin/cstack.mjs creative import examples/tessel-kiln/work/ads/2026-09-meta-export.csv --channel meta --preset meta-ads-manager --currency GBP --ws examples/tessel-kiln
```

It plants three things for `cstack creative report` to find: most spend sits in one format shot in the platform's default grammar, that format always comes with the same person on screen (a confound), and one ad's CTR falls across three weeks (fatigue). The bets, the family and the production plan in this folder answer that report.
