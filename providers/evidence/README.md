# Evidence providers

Providers supply evidence; cstack supplies judgment. Every adapter here ends in the same normalized record (`creative-performance` for the brand's own results), so no skill reads a provider's own shape and cstack is never built around one vendor's API.

Two different questions, two kinds of evidence:

| Kind | Question | Read by | Routes |
|---|---|---|---|
| **Inside** | How did the brand's own ads do? | `creative-intelligence` | `csv.mjs` (ships). Ads managers and creative-analytics tools enter as exports; platform reporting APIs (`meta-marketing-api`, `tiktok-ads-api` in `registry/research-tools.json`) when a key is present. |
| **Outside** | What are other brands and creators doing? | `competitor-intel` (ads lens) | Official MCP or API where one exists (`foreplay`, `meta-ad-library`), a person's browser otherwise (`tiktok-creative-center`). Never scraped. Outside records are `competitor-observation`s: reference only, never generation input. |

## CSV (inside)

```bash
cstack creative import export.csv --channel meta --preset meta-ads-manager --currency GBP --ws <brand>
cstack creative import export.csv --channel tiktok --preset tiktok-ads --ws <brand>
cstack creative import export.csv --channel meta --map '{"spend":"Cost (USD)","ad_name":"Creative"}' --ws <brand>
```

- Presets are lists of header names commonly seen in each tool's export. Exports change between versions and languages; the import prints how it mapped every column, and `--map` fixes any miss.
- Fields: `ad_id`, `ad_name`, `spend`, `impressions`, `clicks`, `purchases`, `revenue`, `views_3s` (hook), `thruplays` (hold), `frequency`, `date_start`, `date_stop`, `audience`. Derived: CTR, CVR, CPA, ROAS, hook rate (`views_3s / impressions`), hold rate (`thruplays / views_3s`).
- A column named after a taxonomy family (`format`, `hook_tactic`, ...) or `tag:<family>` becomes a tag. Creative-analytics tools that tag ads can export their tags this way; cstack keeps its own vocabulary (`registry/creative-taxonomy.json`), so map their labels to its families rather than adopting theirs.
- Summary rows ("Total") are skipped; ids already imported are skipped, so re-running an import is safe.
