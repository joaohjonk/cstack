# Web and AR delivery rules for 3D

Loaded on demand by `/three-d`. Sources and dates: `docs/research/3d.md` (sections 4, 5, 8); defaults marked inferred are to be benchmarked.

## Choose the runtime

| Need | Use | Why |
|---|---|---|
| Product viewer on a PDP, AR button, zero custom code | `<model-viewer>` (Apache-2.0): `poster`, `loading="lazy"`, `reveal`, `camera-controls`, `auto-rotate`, `environment-image`, `exposure`, `shadow-intensity`, `ar`, `ar-modes="webxr scene-viewer quick-look"`, `ios-src` | Lowest effort; AR built in |
| Custom scroll-linked hero, shaders, full control | three.js (WebGPURenderer with WebGL fallback) + a scroll library | Most control; most effort |
| Same inside React or Next | React Three Fiber + drei (`useGLTF`, `Environment`, `ScrollControls`, `PresentationControls`, `ContactShadows`) | Ecosystem covers most product heroes |
| Designer-authored scene | Spline, exported to three.js or R3F code (not an iframe) | Designer and agent edit the same scene |
| Fixed choreography at render quality | Image-sequence scrub on a canvas (WebP frames) or video scrub (`currentTime`) | Exact frames from true renders; tiny runtime |
| Flat 2.5D motion for symbols or UI | Rive or Lottie | No real perspective needed |

## Budgets (defaults; inferred unless noted)

| Item | Budget |
|---|---|
| Hero GLB | ≤ 2.5 MB transferred, ≤ 100k triangles, textures ≤ 2048 px (KTX2 or WebP) |
| AR asset | about 4 MB total, textures ≤ 2048 px, real-world scale, origin at the centre of the base (documented: Shopify 3D model checklist) |
| Image sequence | ≤ 150 frames, ≤ 8 MB, canvas ≤ about 1080 px wide; lock the background colour so it does not seam |
| Poster | static AVIF or WebP; it is the largest paint; 3D loads after first paint or on intersection |

`cstack 3d inspect --budget web-hero|ar` and `cstack 3d frames` check these.

## Pipeline

1. Inspect (`cstack 3d inspect`, or `gltf-transform inspect` when installed).
2. Clean: weld, dedup, prune, simplify to the triangle budget.
3. Compress geometry: Meshopt (faster decode) or Draco (often smaller).
4. Compress textures: KTX2 (ETC1S for colour, UASTC for normals) or WebP; resize to ≤ 2048.
5. Validate with the Khronos glTF validator; for commerce, the Khronos 3D Commerce asset guidelines.
6. AR: export GLB (Android Scene Viewer, WebXR) and USDZ (iOS Quick Look) from the same source; test on a real iPhone and a real Android phone (owner step).

## Page behaviour

- Poster first; load 3D on intersection or after first paint; fall back to the poster (or the sequence) on low-tier devices and when WebGL/WebGPU fails.
- `prefers-reduced-motion`: show the poster or a static angle; no auto-rotate, no scroll-driven motion.
- Never hijack scrolling; scroll-linked motion follows the page's own scroll.
- Lighting: a CC0 HDRI or a procedural room environment; keep the environment lighter than the model.
- Check with `browse qa` at 375/768/1440 and a performance run before calling it done.

## Supporting motion (named options, each needs reduced-motion and a poster state)

- **Looping render hero**: a seamless offline turntable as muted autoplay video; often what a "3D product" hero really is.
- **Particle logo**: a 2D canvas samples the SVG mark into dots of about 3 px that assemble, twinkle and scatter from the cursor; the SVG is the fallback.
- **Sticky scroll-highlight list** beside a sticky product photo: each item highlights as it passes the photo.
- **Review marquee**: a slow horizontal loop of short quotes; pauses on hover and under reduced motion.
- **Hero card with progress bars**: a few product facts drawn as bars that fill once on view (facts go through claims-proof).

## Capture protocol (when the owner scans the real product)

Even, diffuse light; matte surroundings; 40–200 photos around the object at two or three heights on a turntable; include the base; avoid reflective and transparent parts or treat them separately; export USDZ or GLB from the capture app into `assets/capture/`.
