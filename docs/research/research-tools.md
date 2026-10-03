# Research tools: how an agent can reach each one (as of 2026-10-03)

Machine-readable twin: `registry/research-tools.json`.

This note answers three questions for each tool:
- How can an agent reach it today?
- How does cstack detect whether the user has it?
- What does cstack do when it is missing?

Every fact cites a source and a confidence level:
- **high**: read on a vendor-owned page today.
- **medium**: partly confirmed, or the only source is a third party.
- **low**: inferred.
- **unverified**: no source found.

Env var names marked *(cstack)* are names cstack proposes because the vendor documents none. Names marked *(vendor)* come from vendor docs.

## Summary matrix

| # | Tool | Layer | Best agent route today | Official MCP? | Gate |
|---|---|---|---|---|---|
| 1 | Cosmos | taste/culture | **none**: user export only | No (no API either) | n/a |
| 2 | Refero | UX/UI | MCP `https://api.refero.design/mcp` | Yes | Paid (Pro/Team/Lifetime) |
| 3 | Mobbin | UX/UI | MCP `https://api.mobbin.com/mcp` | Yes | Plan unverified |
| 4 | Ecomm.Design | ecom refs | browser (public gallery) | No | n/a |
| 5 | Baymard | UX research | **human only**: no automation allowed | No | Premium seat |
| 6 | Particl | market intel | MCP `https://mcp.particl.com/mcp` | Yes | Paid credits |
| 7a | BuiltWith | stack ID | MCP `https://api.builtwith.com/mcp`, REST | Yes (GitHub `builtwith/builtwith-mcp`) | API credits |
| 7b | Store Leads | stack ID | REST `storeleads.app/json/api/v1/all/` | Listed, URL unverified | Paid |
| 8a | Helium 10 | Amazon | MCP via connectors | Yes | Diamond+ |
| 8b | SmartScout | Amazon | MCP `https://mcp.smartscout.com/` (early access) | Yes | Enterprise (per vendor) |
| 9 | Nexscope | Amazon (experimental) | REST (credits); MCP unverified | Unverified | Credits |
| 10 | Foreplay | ad refs | MCP `https://public.api.foreplay.co/mcp`, REST | Yes | Plan credits |
| 11 | Shortimize | short video | REST and MCP `https://api.shortimize.com/mcp` | Yes | All paid plans |
| 12 | Really Good Emails | email refs | browser | No API found | unverified |
| 13 | Figma | own design system | MCP `https://mcp.figma.com/mcp` (remote) or desktop | Yes | Dev/Full seat for real use |
| 14 | Shopify | own commerce | UCP MCP `https://{shop}/api/ucp/mcp`; Dev MCP `@shopify/dev-mcp` | Yes | Public storefront / free |
| + | Taste Labs | taste/brand | MCP `https://mcp.tastelabs.com/mcp`, REST | Yes | Credits |
| + | Are.na | taste/culture | REST v3 (token) | "MCP server" mentioned, unverified | unverified |
| + | Meta Ad Library | ad refs | Graph API `/ads_archive` | No | Free; dev app token |
| + | TikTok Creative Center / CCA | ad refs, trends | Commercial Content API (approved apps); CC is UI-only | No | Application approval |

---

## 1. Cosmos (cosmos.so): taste/culture

| Field | Value | Source | Conf. |
|---|---|---|---|
| Access modes | Browser only, used by a person. No public API and no official MCP found. | search 2026-10-03; [ToS mirror](https://tostracker.app/document/cosmosso-tos) | medium |
| Name collision | `@polarity-lab/cosmos-mcp` (env `COSMOS_TOKEN`) is an **unrelated** personal knowledge-graph server. Never treat it as Cosmos. | [getdrio listing](https://www.getdrio.com/mcp/io-github-teampolarity-cosmos-mcp/md) | medium |
| ToS | §8(F) bans access, search or download via "any engine, software, tool, agent, device, or mechanism (including spiders, robots, crawlers, data mining tools...)" other than Cosmos software or standard browsers. **So agent-driven browsing is not allowed.** | [ToS mirror](https://tostracker.app/document/cosmosso-tos) | medium (mirror, not cosmos.so itself) |
| Detection | No signal exists today. Patterns are reserved in case an official server appears: `mcp__cosmos_so__*`. Also look for user exports in `refs/cosmos/`. | n/a | n/a |
| Returns | Only what the user exports: images and public cluster links. | n/a | n/a |
| Fallback | Ask the user to paste public cluster URLs or drop exported images into the project. For open-ended search, use Are.na or Taste Labs and **say that Cosmos was not queried**. | n/a | n/a |

## 2. Refero: UX/UI screens, flows, styles

| Field | Value | Source | Conf. |
|---|---|---|---|
| MCP (official) | `https://api.refero.design/mcp`, HTTP transport | [Refero MCP docs](https://doc.refero.design/mcp/getting-started.md) | high |
| Auth | OAuth (preferred), or `Authorization: Bearer <token>`. Env var: `REFERO_API_KEY` *(cstack)* | same | high |
| Plan | Requires a paid plan (Pro, Team or Lifetime). Limit is 8,000 MCP tool calls per licensed user per month, with no rollover. | same | high |
| Returns | Sites/apps (web, iOS), styles, screens, flows | same | high |
| ToS | Limits exist "to protect the service from automated abuse". The full ToS was not reviewed. | same | medium |
| Detection | `mcp__refero__*`, `mcp__Refero__*`; env `REFERO_API_KEY` | n/a | n/a |
| Fallback | Use Mobbin if present. Otherwise ask the user for screenshots, or browse public product pages within their ToS. | n/a | n/a |

## 3. Mobbin: shipped flows and patterns

| Field | Value | Source | Conf. |
|---|---|---|---|
| MCP (official) | `https://api.mobbin.com/mcp`, streamable HTTP, hosted only ("nothing to clone, install, or run locally") | [github.com/mobbin/mobbin-mcp-server](https://github.com/mobbin/mobbin-mcp-server) | high |
| Auth | OAuth in a browser; "no API key to configure" | same | high |
| Tools | `search_screens`, `search_flows`, `search_sections` | [docs.mobbin.com/mcp/features](https://docs.mobbin.com/mcp/features) | high |
| Returns | Low-res previews plus a high-res `image_url`. **Image URLs expire after 30 days.** | same | high |
| Plan | unverified: the docs do not name a tier | same | n/a |
| Detection | `mcp__mobbin__*`; tool-name fingerprints `search_screens` + `search_flows` | n/a | n/a |
| Fallback | Use Refero, or ask the user for screenshots. | n/a | n/a |

## 4. Ecomm.Design: real Shopify/DTC stores

| Field | Value | Source | Conf. |
|---|---|---|---|
| Access | Public gallery browsable by platform, category and tech (e.g. `/platform/shopify-stores`). No API or MCP found. | [ecomm.design](https://ecomm.design/) | medium |
| ToS | unverified (not reviewed) | n/a | n/a |
| Detection | none (patterns reserved: `mcp__ecomm_design__*`) | n/a | n/a |
| Fallback | Browse a few public gallery pages at human pace to collect store URLs, then study the stores directly. Or ask the user for a list of reference stores. | n/a | n/a |

## 5. Baymard Institute: checkout/PDP/search usability rules

| Field | Value | Source | Conf. |
|---|---|---|---|
| Access | Free articles are on the public blog. The full guideline database needs **Baymard Premium**. Baymard's AI products (UX-Ray, an AI search assistant) run inside its own app. No public API or MCP. | [Premium launch](https://baymard.com/blog/baymard-premium-launch), [UX-Ray](https://baymard.com/product/ux-ray) | medium |
| ToS | "It is explicitly prohibited to use any automated extracting, processing, scraping, or reverse-engineering methods." Content may not be copied, paraphrased or redistributed outside the subscribing organization. Accounts are strictly personal. | [Baymard T&C](https://Baymard.com/terms-and-conditions) | high |
| Detection | none | n/a | n/a |
| Fallback | Never automate Baymard. A Premium user may look up specific guidelines and keep the notes **out of public repos**. Otherwise cite only free articles a human opened, or use general heuristics and label them as such. | n/a | n/a |

## 6. Particl: DTC market intelligence

| Field | Value | Source | Conf. |
|---|---|---|---|
| MCP (official) | `https://mcp.particl.com/mcp` | [Particl quickstart](https://www.particl.com/docs/mcp/quickstart) | high |
| Auth | API key generated on the dashboard's "Claude & ChatGPT" page. The header name was not captured ([auth page](https://www.particl.com/docs/mcp/authentication)). Env var: `PARTICL_API_KEY` *(cstack)* | [Particl MCP](https://particl.com/docs/mcp) | high / header unverified |
| Plan | "Most MCP tools require export credits, which are included with paid plans." | same | high |
| Returns | Company search, products, marketing analysis, events/promos, market trends | same | high |
| Detection | `mcp__particl__*`; env `PARTICL_API_KEY` | n/a | n/a |
| Fallback | Use public signals only (brand sites, promo pages, Meta Ad Library). **Report sales figures as unavailable; never estimate them.** | n/a | n/a |

## 7. BuiltWith + Store Leads: store/theme/app/stack ID

| Field | Value | Source | Conf. |
|---|---|---|---|
| BuiltWith MCP (official) | Hosted at `https://api.builtwith.com/mcp`, or self-hosted from GitHub `builtwith/builtwith-mcp` (stdio, or `http://127.0.0.1:8787/mcp`). Exposes 25+ tools: domain lookup, technology detection, company discovery, trends. | [mcpservers.org listing of builtwith/builtwith-mcp](https://mcpservers.org/servers/builtwith/builtwith-mcp) | medium (listing, not the repo itself) |
| BuiltWith auth | `BUILTWITH_API_KEY` *(vendor)*. The hosted header is documented two ways: `Authorization: API <key>` or `?KEY=` on the vendor page, and `Bearer` on the GitHub listing. Probe both. | [api.builtwith.com/mcp-api](https://api.builtwith.com/mcp-api) | high / medium |
| Caveat | The `mcp-api` vendor page describes a **free MCP-registry search endpoint** (1 req/s). It indexes remote MCP servers and is not tech lookup. | same | high |
| Store Leads API | `https://storeleads.app/json/api/v1/all/` with `Authorization: Bearer <key>`. Requires a paid account. Rate limits: Pro/Elite 5 req/s, Enterprise 20 req/s. Endpoints: domains, apps (and reviews), technologies, themes, social accounts, history. Env var: `STORELEADS_API_KEY` *(cstack)* | [storeleads.app/api](https://storeleads.app/api) | high |
| Store Leads MCP | The API page lists an "MCP Server", but no URL was captured. **unverified** | same | low |
| Detection | `mcp__builtwith__*`, `mcp__storeleads__*`; env `BUILTWITH_API_KEY`, `STORELEADS_API_KEY` | n/a | n/a |
| Fallback | Read public page source (e.g. the theme name in Shopify markup) and label the result **heuristic**. | n/a | n/a |

## 8. Helium 10 + SmartScout: Amazon

| Field | Value | Source | Conf. |
|---|---|---|---|
| Helium 10 MCP (official) | Connects through AI connectors (Claude, ChatGPT, Codex) with OAuth 2.0. 118 tools in 22 categories. The page read does not state the server URL. | [H10 KB](https://kb.helium10.com/hc/en-us/articles/51580564409883-Getting-Started-with-Helium-10-MCP) | high |
| Helium 10 plan | **Diamond or higher**. 1,000 calls/month included; top-up is $50 per 500 calls. Covers 13 Amazon marketplaces plus Walmart and TikTok Shop. | same | high |
| SmartScout MCP (official) | `https://mcp.smartscout.com/`, **early access**, login with SmartScout credentials. Tools: `query_analytics`, `analyze_deeply`, `ad_spy_search`, `get_relevant_products`, `get_relevant_search_terms`, `run_query`, `get_account_capabilities` | [smartscout.com/amazon-data-mcp](https://www.smartscout.com/amazon-data-mcp) | high |
| SmartScout plan | Vendor page: Enterprise with API access; a "no-API" connector is coming soon. A third-party guide says Business ($299/mo) gets a "Snapshot MCP". **The two sources conflict.** | vendor page; [RevenueGeeks](https://revenuegeeks.com/software/smartscout/mcp) | medium |
| Detection | `mcp__helium10__*`, `mcp__smartscout__*`; fingerprints `ad_spy_search`, `get_account_capabilities` | n/a | n/a |
| Fallback | A human reads public Amazon product pages. **No sales estimates.** | n/a | n/a |

## 9. Nexscope: Amazon/A+/reviews (experimental)

| Field | Value | Source | Conf. |
|---|---|---|---|
| REST | Data APIs across Amazon, TikTok Shop, Walmart, Shopify and others: 174 data, 88 SEO/marketing and 55 video/image endpoints. API key auth; credit-based, 10 to 313 credits per call. Env var: `NEXSCOPE_API_KEY` *(cstack)* | [nexscope.ai/api-docs](https://www.nexscope.ai/api-docs) | medium |
| MCP | The docs point to `https://www.nexscope.ai/mcp-map`, but no server URL was captured. **unverified.** viaSocket also hosts a third-party connector. | same; [viaSocket](https://viasocket.com/mcp/nexscope) | low / medium |
| Returns | Product, pricing, sales metrics, reviews, keywords, A+/listing content, trends | api-docs | medium |
| Detection | `mcp__nexscope__*`; env `NEXSCOPE_API_KEY` | n/a | n/a |
| Fallback | Use Helium 10 or SmartScout, or ask the user to export reviews from their own seller tools. | n/a | n/a |

## 10. Foreplay: ad references and swipe files

| Field | Value | Source | Conf. |
|---|---|---|---|
| MCP (official) | `https://public.api.foreplay.co/mcp`, OAuth ("sign in with your Foreplay account") | [foreplay.co/mcp](https://foreplay.co/mcp) | high |
| REST | Foreplay Public API; docs at `https://public.api.foreplay.co/docs` (the page rendered empty to the fetcher, so the key header is **unverified**). Env var: `FOREPLAY_API_KEY` *(cstack)* | same | medium |
| Plan | Current (non-legacy) plans include 10,000 credits/month. 1 credit = 1 ad record. Extra tiers: 100k, 250k, 500k. | [Foreplay credits](https://help.foreplay.co/en/articles/9082255-credits-and-pricing) | high |
| Returns | 200M+ ads: creatives, copy, CTAs, landing URLs, live status, run duration, transcripts. Also the user's swipe files and boards. | foreplay.co/mcp | high |
| Detection | `mcp__foreplay__*`; env `FOREPLAY_API_KEY` | n/a | n/a |
| Fallback | Meta Ad Library API, or a human browses TikTok Creative Center. Or the user exports a board. | n/a | n/a |

## 11. Shortimize: TikTok/Reels/Shorts tracking

| Field | Value | Source | Conf. |
|---|---|---|---|
| REST | `https://api.shortimize.com`; check a key with `GET /authenticate`. Endpoints cover accounts, videos, collections, org history, analytics and refresh. Rate limits: 5, 15 or 30 req/min by tier. Env var: `SHORTIMIZE_API_KEY` *(cstack)* | [Shortimize API](https://docs.shortimize.com/docs/integration) | high |
| MCP (official) | `POST https://api.shortimize.com/mcp`, using the same key | same | high |
| Plan | Basic API and MCP on **all paid plans** since 2026-03-24. Premium add-on is $150/mo (higher limits, webhooks). | [changelog](https://features.shortimize.com/changelog/mcp-and-api-add-on-now-available-on-all-plans) | high |
| Detection | `mcp__shortimize__*`; env `SHORTIMIZE_API_KEY` | n/a | n/a |
| Fallback | Use links the user supplies. **Make no outlier claims.** | n/a | n/a |

## 12. Really Good Emails

| Field | Value | Source | Conf. |
|---|---|---|---|
| Access | Public gallery. No API or MCP found in search. | unverified | low |
| ToS | unverified | n/a | n/a |
| Fallback | Browse public pages at human pace, or ask the user to forward reference emails. | n/a | n/a |

## 13. Figma: the user's own components and tokens

| Field | Value | Source | Conf. |
|---|---|---|---|
| MCP (official) | Remote server (recommended) and desktop server. Remote URL: `https://mcp.figma.com/mcp`. Desktop local URL is commonly `http://127.0.0.1:3845/mcp`, **unverified this pass**. | [Figma MCP access](https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/) | high (servers exist) / medium (URLs) |
| Auth | OAuth. Only clients listed in the Figma MCP Catalog can connect. Enterprise auth for Claude via Okta XAA. | same | high |
| Plan | Dev/Full seats: Professional 200/day at 10/min, Organization 200/day at 15/min, Enterprise 600/day at 20/min. View/Collab seats: 6/month (Starter: 20/month). `whoami`, `create_new_file` and `add_code_connect_map` are exempt. | same | high |
| REST | `api.figma.com` with a personal access token. Env var: `FIGMA_ACCESS_TOKEN` *(cstack)* | unverified this pass | medium |
| Detection | `mcp__figma__*`, `mcp__Figma__*` (the claude.ai connector form), `mcp__figma-desktop__*`; fingerprints `get_design_context`, `get_variable_defs`, `whoami` | observed tool naming | high |
| Fallback | Ask the user to export tokens as JSON or frames as PNG. Label any token read from a screenshot as an estimate. | n/a | n/a |

## 14. Shopify: Dev MCP, Storefront MCP / UCP, WebMCP

| Field | Value | Source | Conf. |
|---|---|---|---|
| UCP MCP (official) | `https://{shop}/api/ucp/mcp` provides the Catalog, Cart and Checkout MCP. Requests **must include an agent profile**. | [Shopify Storefront MCP page](https://shopify.dev/apps/build/storefront-mcp/servers/storefront) | high |
| Storefront MCP | `https://{shop}/api/mcp`. Its catalog and cart tools (`search_catalog`, `get_product_details`, `get_cart`, `update_cart`) are **deprecated in favour of UCP**. `search_shop_policies_and_faqs` remains. | same | high |
| Dev MCP (official) | `npx -y @shopify/dev-mcp@latest`: runs locally, **no auth**, serves docs and API schemas only, **no store data** | [Shopify AI Toolkit / Dev MCP](https://shopify-dev.shopifycloud.com/docs/apps/build/devmcp) | high |
| CLI | Shopify CLI (`shopify`) gives authenticated store-management tasks through the AI Toolkit plugin/skills | same | medium |
| UCP standard | Open protocol from Google and Shopify | [Google Developers blog](https://developers.googleblog.com/en/under-the-hood-universal-commerce-protocol-ucp/) | medium |
| WebMCP | Browser-native tool exposure for agents (Chrome early preview). The spec status and API surface were **unverified** this pass. | [specification.website](https://specification.website/spec/agent-readiness/webmcp/) | low |
| Detection | `mcp__shopify*__*`; fingerprints `search_catalog`, `search_shop_policies_and_faqs`; CLI `shopify`; files `shopify.app.toml`. Probe: `tools/list` on `https://{shop}/api/ucp/mcp` | n/a | n/a |
| Fallback | Ask for the store domain and probe the public UCP endpoint. Otherwise ask for a product CSV exported from the Shopify admin. | n/a | n/a |

## Additional tools

| Tool | Facts | Source | Conf. |
|---|---|---|---|
| **Taste Labs** | MCP `https://mcp.tastelabs.com/mcp` (streamable HTTP; OAuth 2.1 or `Bearer taste_...`). REST `https://api.tastelabs.com` with header `X-API-Key`. Env `TASTE_API_KEY`. Detect `mcp__taste-engine__*`, probe `list_brand_extractions`. Full details in `docs/research/taste-labs.md`. | taste-labs.md (vendor docs) | high |
| **Are.na** | v3 REST API with personal access tokens or OAuth apps; the v2 docs at dev.are.na are deprecated. The developer hub lists "MCP server, CLI, and more to come", but no URL was found (**unverified**). Env `ARENA_ACCESS_TOKEN` *(cstack)*. | [are.na/developers](https://www.are.na/developers) | high / low |
| **Meta Ad Library API** | Graph `/ads_archive` with an OAuth token. `ad_reached_countries` is required; other filters: `search_terms`, `search_page_ids`, `ad_type`, `publisher_platforms`. "Ads that did not reach any location in the EU will only return if they are about social issues, elections or politics." Identity-verification steps: **unverified** (facebook.com/ads/library/api was unreachable). Env `META_ACCESS_TOKEN` *(cstack)*. | [ads_archive reference](https://developers.facebook.com/docs/graph-api/reference/ads_archive/) | high |
| **TikTok Creative Center / Commercial Content API** | Creative Center is a UI with no public API found. The Commercial Content API is `POST https://open.tiktokapis.com/v2/research/adlib/ad/query/` with a client-credentials bearer token, for **approved applications only**. Env `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` *(cstack)*. | [CCA getting started](https://developers.tiktok.com/doc/commercial-content-api-getting-started), [Creative Center help](https://ads.tiktok.com/resources/help/article/creative-center) | high / medium |

---

## Detection strategy

Run these checks in order. Each one is cheap, and none of them costs credits.

1. **MCP tools in the current session.** List the available tool names. Claude Code names them `mcp__<server>__<tool>`, and `<server>` is **whatever the user named it**: a claude.ai connector shows up as `mcp__Figma__*`, while a local config might say `figma-desktop`. So:
   - Match the server segment case-insensitively against each tool's `mcp_tool_patterns`, after normalising `-`, `_` and spaces.
   - Then confirm with **tool-name fingerprints** where available: Mobbin `search_screens`; Figma `get_design_context`; SmartScout `ad_spy_search`; Shopify `search_catalog`; Taste Labs `list_brand_extractions`.
   - Treat an `mcp__<name>__*` set as present only when tools are listed. A server configured but failing to connect is a **connection failure**, not absence. Report it that way.
2. **MCP config files** (for hosts where tools are not listed yet). Look for server URLs in `.mcp.json`, `~/.claude.json`, `.cursor/mcp.json` and `~/.codex/config.toml`. Match on host: `api.refero.design`, `api.mobbin.com`, `mcp.particl.com`, `api.builtwith.com`, `mcp.smartscout.com`, `public.api.foreplay.co`, `api.shortimize.com`, `mcp.figma.com`, `/api/ucp/mcp`, `mcp.tastelabs.com`. These host paths are general host conventions, at medium confidence; `registry/hosts.json` is authoritative for skill directories.
3. **Env vars.** Check only whether a variable is *present* and never print its value. Vendor-documented names: `BUILTWITH_API_KEY`, `TASTE_API_KEY`. cstack-proposed names: `REFERO_API_KEY`, `PARTICL_API_KEY`, `STORELEADS_API_KEY`, `SMARTSCOUT_API_KEY`, `NEXSCOPE_API_KEY`, `FOREPLAY_API_KEY`, `SHORTIMIZE_API_KEY`, `FIGMA_ACCESS_TOKEN`, `ARENA_ACCESS_TOKEN`, `META_ACCESS_TOKEN`, `TIKTOK_CLIENT_KEY`/`TIKTOK_CLIENT_SECRET`.
4. **CLI binaries.** `command -v shopify`. No other tool here ships an official CLI that was verified. Are.na says a CLI is coming.
5. **Zero-cost probes**, only when a key exists:
   - Shortimize `GET /authenticate`.
   - Figma `whoami` (exempt from rate limits).
   - SmartScout `get_account_capabilities`.
   - Shopify UCP `tools/list`.
   - Taste Labs `list_brand_extractions(limit=1)`.
   Avoid probes that spend credits (Particl, Foreplay, Helium 10, Nexscope).
6. **Project exports.** Check `refs/<tool>/` folders the user filled by hand (for Cosmos, Baymard notes, email references).

**Routing rule.** For each research need, pick the highest-priority tool that is present. Then put a "sources consulted / not consulted" line in the output that names any preferred tool that was absent. **Never imply a tool was queried when it was not.**

**Hard no-automation list.**
- **Cosmos**: its ToS bans agents and crawlers.
- **Baymard**: its ToS bans automated extraction, and Premium content stays private.

For both, cstack only consumes what a human exported.

## Unreachable / unverified

**Unreachable**
- `https://www.facebook.com/ads/library/api/`: the permission request timed out. The identity-verification requirements for the Meta Ad Library API remain unverified.
- `https://public.api.foreplay.co/docs`: the page rendered empty (JS app). The REST auth header is unverified.
- `developers.figma.com/.../plans-access-and-permissions/` redirected. The `rate-limits-access` page was read instead. It did not state the remote or desktop URLs, so those are medium confidence.

**Unverified**
- **Cosmos**: no API or MCP exists that could be verified; the ToS was read via a third-party mirror.
- **Mobbin**: the required plan tier.
- **Particl**: the auth header name.
- **BuiltWith**: the hosted auth scheme (vendor page says `API`, listing says `Bearer`). The GitHub repo itself was not opened; the facts come from a registry listing.
- **Store Leads**: the MCP server URL.
- **SmartScout**: the plan gating (vendor and third-party sources conflict) and the developer API details.
- **Helium 10**: the MCP server URL.
- **Nexscope**: whether an official MCP exists and its URL. The "experimental" label is the owner's; the vendor does not mark it beta.
- **Ecomm.Design and Really Good Emails**: the ToS, and whether any API exists.
- **Are.na**: the MCP availability and URL, rate limits and AI-use terms.
- **WebMCP**: the spec status and the exact browser API.
- **Figma**: the REST token header.
- **TikTok**: the Commercial Content API country list and eligibility criteria.
