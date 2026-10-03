# Design tokens (W3C DTCG 2025.10)

Put `*.tokens.json` files here, e.g. `color.tokens.json`, `type.tokens.json`, `space.tokens.json`, `motion.tokens.json`.
Encode every decision at the lowest level that represents it reliably: a radius is a token, not a prompt.

```json
{ "color": { "$type": "color",
    "ink":   { "$value": { "colorSpace": "srgb", "components": [0.07, 0.07, 0.07], "hex": "#121212" } },
    "text":  { "$value": "{color.ink}", "$description": "semantic alias" } } }
```

`cstack tokens check` validates types and aliases, `cstack tokens build` writes `brand/generated/tokens.css`,
`cstack tokens lint <files>` flags raw colors in built pages. Only official values go here: anything extracted or inferred
stays in brand-system.json with its source until the owner approves it.
