# Third-party notices

cstack is MIT licensed (see `package.json`). Some files derive from third-party MIT-licensed work.
Each derived file starts with a header naming its source files.

## gstack

- Source: https://github.com/garrytan/gstack (browse layer, v1.91.x)
- License: MIT License, Copyright (c) 2026 Garry Tan. Full text: [`licenses/gstack-MIT.txt`](licenses/gstack-MIT.txt)
- Modified for cstack: one-shot Node ESM modules on playwright-core, no daemon, no telemetry,
  no cookie import, no tunnels, no stealth.

| cstack file | Derived from (gstack) |
|---|---|
| `scripts/lib/browser/launch.mjs` | `browse/src/browser-manager.ts` (launch path, concept), `browse/src/find-browse.ts`, `scripts/resolvers/aside.ts` |
| `scripts/lib/browser/url-guard.mjs` | `browse/src/url-validation.ts` |
| `scripts/lib/browser/safety.mjs` | `browse/src/commands.ts`, `browse/src/content-security.ts`, `browse/src/read-commands.ts`, `scripts/resolvers/aside.ts` |
| `scripts/lib/browser/snapshot.mjs` | `browse/src/snapshot.ts` |
| `scripts/lib/browser/capture.mjs` | `browse/src/meta-commands.ts`, `browse/src/screenshot-size-guard.ts` |
| `scripts/lib/browser/media.mjs` | `browse/src/media-extract.ts`, `browse/src/write-commands.ts` |
| `scripts/lib/browser/qa.mjs` | `scripts/resolvers/aside.ts` (QA cookbook shapes), `BROWSER.md` (console/network buffers) |
| `scripts/lib/browser/skills.mjs` | `browse/src/browser-skills.ts`, `browser-skills/` layout, `scripts/resolvers/aside.ts` |
| `scripts/lib/browser/cli.mjs` | command layout and safety rules of `browse/` (no code copied verbatim) |

`scripts/lib/browser/tokens.mjs` is original cstack work, inspired by gstack's design-review
computed-style sketch; no gstack code is copied.
