# Mockup template package (`cstack mockup`)

A template package is a directory with a `template.json` and the PNG layers it names. `cstack mockup render` composites official art onto it with deterministic math (no model calls), and `cstack mockup verify` proves afterwards that the art pixels in a render were not changed. This directory is a working example: a 3:4 poster on a wall, with a leaf in front of its lower-left corner (mask), paper ripples (displacement), wall light (multiply from the base) and a glare streak (screen). Every pixel in it is synthetic (CC0).

```bash
cstack mockup check  --template tests/fixtures/mockup/poster-wall
cstack mockup render --template tests/fixtures/mockup/poster-wall --art poster-art.png --out work/mockups/poster.png
cstack mockup verify --template tests/fixtures/mockup/poster-wall --art poster-art.png --render work/mockups/poster.png
```

`poster-art.png` is any approved art file (PNG in pure Node; SVG, JPEG and WebP need the optional Chromium). The JSDoc typedef `MockupTemplate` in `scripts/lib/mockup/template.mjs` and its `TEMPLATE_SCHEMA` are the normative reference.

## Layout

| File | Role |
|---|---|
| `template.json` | Base image, placements, licence (below) |
| `base.png` | The scene. PNG; JPEG or WebP also work when Chromium is available |
| `mask.png`, `displace.png`, `glare.png` | Optional layers, each **exactly the base's size**; any names |

Paths in `template.json` are relative to the package and may not leave it.

## `template.json`

```json
{
  "id": "poster-wall",
  "base": "base.png",
  "placements": [
    {
      "id": "poster",
      "kind": "quad",
      "quad": [[24, 10], [70, 14], [68, 62], [26, 60]],
      "aspect": 0.75,
      "fit": "contain",
      "feather": 0.5,
      "mask": "mask.png",
      "displacement": { "map": "displace.png", "strength": 1.5 },
      "shading": [
        { "mode": "multiply", "from": "base", "opacity": 0.85 },
        { "mode": "screen", "map": "glare.png", "opacity": 0.6 }
      ]
    }
  ],
  "licence": { "source": "synthetic cstack test fixture", "terms": "CC0-1.0", "client_use_allowed": true }
}
```

Top level: `base` (required), `placements` (required, composited in order), `licence` (required), optional `id`, `version`, `notes`, `meta` (free-form). Unknown keys are errors, so typos fail loudly.

| Placement field | Meaning |
|---|---|
| `id` | Unique name; `--placement <id>` renders or verifies one |
| `kind` | `quad`, `cylinder` or `mesh`, with the matching geometry object below. All geometry is in base pixels (continuous coordinates; pixel centres at +0.5) |
| `region` | Optional `{x, y, w, h}` in integer base px that this placement may change (a hard clip). Either way only the geometry's bounding box plus a margin for the edge, feather and displacement is touched; the sidecar records that effective region. Pixels outside it stay byte-identical to the base |
| `art_region` | Optional `{x, y, w, h}` as fractions 0..1 of the art. Default: the whole art. One flat dieline can feed one quad per carton panel |
| `aspect` | Optional physical width/height of the print area. When set, `fit` keeps the art's proportions; without it the art fills the surface |
| `fit` | `contain` (default, letterbox), `cover` (crop, warns) or `stretch` (warns past 3% distortion) |
| `feather` | Extra edge softness in px on top of the always-on 1 px antialiased edge (default 0) |
| `mask` | PNG: where the art may show. Alpha when the PNG has any transparency, otherwise luminance (white = shows). Use it for occluders and print areas |
| `displacement` | `{map | from: "base", strength, strength_x?, strength_y?, neutral?}`: offset = (luminance − neutral) / 255 × strength px on both axes (Photoshop Displace). `neutral` defaults to 128. `from: "base"` uses the base photo's luminance stretched over the placement footprint (fabric folds) |
| `shading` | Layers applied to the art in order, before it is laid over the base. `multiply` darkens (white = no change); `screen` lightens (black = no change). `map` RGB is used and its alpha scales `opacity` (default 1). `from: "base"`: multiply uses base luminance ÷ its 98th percentile in the footprint (the lit surface = no change); screen uses base luminance above `threshold` (default 0.8) |
| `notes` | Free text |

### Geometry

**quad**: the art's corners TL, TR, BR, BL, as seen in the base. It must be convex; a mirrored order is refused because it would flip the art. Mapped by a 4-point homography.

**cylinder**: cans, bottles and jars seen side-on, axis vertical, orthographic approximation. Screen x maps to angle θ = asin((x − axis_x)/radius), so the label's arc length u = radius·θ compresses toward the edges.

```json
{ "id": "label", "kind": "cylinder",
  "cylinder": { "axis_x": 80, "top": 30, "bottom": 90, "radius": 40,
                "visible_arc": 170, "art_arc": 200, "rotation": 0, "ellipse_top": 4, "ellipse_bottom": 7 } }
```

| Field | Meaning |
|---|---|
| `axis_x`, `top`, `bottom`, `radius` | Axis x; y of the art's top and bottom edges where they face the camera; half the visible width (px) |
| `visible_arc` | Degrees of the face that can show art, at most 180 (default 180). Art past it is clipped with an antialiased edge |
| `art_arc` | Degrees of circumference the art's width covers, at most 360 (default `visible_arc`). Larger than `visible_arc` = part of the wrap is hidden behind |
| `rotation` | Degrees the art's centre is turned away from the camera (default 0) |
| `ellipse_top`, `ellipse_bottom` | Vertical-ellipse correction for camera pitch: px an edge sags at the front relative to its ends (positive = seen from above). y = y_front − e·(1 − cos θ) |

**mesh**: free-form surfaces (flags, pouches, bent signage). Rows of `[x, y]` control points, top to bottom, each row left to right, at least 2×2. Each cell is a bilinear patch and must be convex; a denser grid gives a smoother bend. A 2×2 mesh with parallelogram corners renders the same pixels as the equivalent quad.

```json
{ "id": "flag", "kind": "mesh",
  "mesh": [[[20, 20], [80, 14], [140, 20]],
           [[20, 60], [80, 66], [140, 60]],
           [[20, 100], [80, 94], [140, 100]]] }
```

## Pixel pipeline

For every base pixel in a placement's region: displace → inverse-map to art coordinates → sample the art (premultiplied mip pyramid, trilinear, up to 8 taps along the footprint's long axis so foreshortened areas stay sharp across it) → alpha = art alpha × antialiased edge × mask → shading layers in order → "over" the base. Placements apply in order. Renders are deterministic: the same inputs give the same bytes.

## Licence gate

`licence.client_use_allowed` is a gate, like a model licence:

- `false`: `render` refuses (non-zero exit, `BLOCKED: ...`) and writes nothing.
- `"unknown"`: `render` works but warns loudly, and the sidecar records `status: "unknown", client_facing: false`. `--internal` labels the render `internal` and drops the warning (internal comps only).
- `true`: `status: "cleared"`.

Record `source` (where the photo and layers came from) and `terms` (licence name or summary) even for your own photos.

## Outputs

`render` writes the PNG (an existing `--out` needs `--force`; template files and art are never written) and `<out>.mockup.json`: template id, hash (template.json plus every layer's sha256) and file hashes; art sha256, format, intrinsic and raster size; each placement's kind, region, aspect, fit and art region; licence status; decoders; timings; warnings (licence, art enlarged past 1.5×, stretch or crop, SVG `<text>`). Paths in it are relative to the sidecar.

`verify` re-renders the art deterministically through the same template, inverse-warps each placement of the render and of that reference back to flat art space (on a grid the size of the placement's screen footprint, 2×2 samples per cell, displacement inverted), and compares them. An untouched render scores exactly 0; label pixels that a later pass changed (a generative "harmonize", a retouch, a lossy re-encode) show up. Cells where the art is hidden (mask, crop, back of a cylinder) are not judged. It writes `<render-stem>.verify.json` and `<render-stem>.verify-<placement>.png` (expected | observed | heat) and exits 1 on FAIL.

| Metric | PASS needs | FAIL when |
|---|---|---|
| Mean absolute difference (0..255) | ≤ 2 | > 8 |
| Edge difference, Sobel (0 same, 1 disjoint) | ≤ 0.03 | > 0.10 |
| Worst 8×8 luminance-tile SSIM | ≥ 0.97 | < 0.90 |
| Cells changed by more than 10% | ≤ 0.2% | > 1% |

Anything between the two columns is WARN. The thresholds live in `THRESHOLDS` in `scripts/lib/mockup/verify.mjs`.

## Limits

- Cylinders are orthographic with a vertical axis; tilted or strongly perspective bottles, and cones (fan unwrap), need a dense `mesh`.
- Placements that share an edge (carton panels) each antialias their edge, so a faint seam can show where they meet; overlap the quads by half a pixel if it matters.
- No PSD parsing, dieline folding or true 3D: export layers to PNG, or use a 3D route.
