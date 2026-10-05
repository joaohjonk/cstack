# Grid → Pick → Polish

Explore wide and cheap, pick the winner, and spend detail only on it. Most generated images fail in part, not in full: one frame of nine has the right composition, light or moment. The method makes that frame easy to see, then rebuilds it on its own. It is the contact-sheet and storyboard habit of photographers and directors, applied to generation; the flow is `grid-pick-polish` (`cstack flows show grid-pick-polish`).

## 1. Explore: one anchor, one grid

- Start from one anchor: an approved still, a product lock, or the territory's idea in words. The grid varies around it.
- Ask for one image that holds several frames. 2x2 gives four larger, better frames; 3x3 gives more range; 4x4 only for very broad scouting, since each cell gets small and soft. When detail matters, choose fewer panels.
- Say what stays fixed and what varies, in two separate slots. A grid with no fixed list is random, not a comparison.
  - fixed: the subject or character, outfit, product, setting, time of day, light logic, art direction
  - varies: camera angle, distance, framing, action, expression, crop, lens feel, intensity
- No lettering or logos in any frame (`cstack image text` still runs on the grid).
- Make the sheet with `cstack sheet make <grids> --grid 3x3 --out work/sheets/<name>.html`, so each frame can be picked by its number.

## 2. Decide: one to three winners, and why

- The owner opens the sheet (`cstack sheet open <sheet>`), clicks up to three frames, and ticks why each won: composition, mood, light, product read, casting and styling, idea. `cstack sheet import` records each winner as an `approve` with its `reason_codes` and the frame's `region`.
- Pick before any reviewer's opinion reaches the owner. Pairs on the same sheet are optional and feed calibration.

## 3. Polish: rebuild the winner alone

- Re-render each winner as a single image: same subject, world and style, the chosen frame's composition, at delivery size. Stop asking one generation to solve nine things.
- Then edit locally, one change per pass (`image-edit`): describe only the change and protect the rest. "Keep the composition; change only the background light." `cstack prompt diff` should show one component.
- Upscale last, and only the finalists. A preserving upscale keeps the picked image; a creative one may add detail the owner never saw, so the owner sees it again.

## 4. Expand to film (optional)

- The winner becomes the anchor: a storyboard grid in the same world (establishing, medium, insert, reaction, reveal), two to four key frames picked the same way, each polished as a still.
- For image-to-video the still already carries composition, subject, light and style. The prompt describes motion: what moves, the camera move, pace and duration. Over-describing the still and under-describing the motion is the common failure (`video-direction`).

## Templates (slots for a prompt recipe)

- Contact sheet: "A {cols}x{rows} contact sheet of one subject in one world, {n} frames. Fixed in every frame: {fixed}. Varies across frames: {varies}. A mix of wide, medium, close and detail frames. Thin gutters, no text, no numbers, no logos."
- Storyboard: "A {cols}x{rows} storyboard read left to right, top to bottom: {n} connected moments of one scene. Fixed: {fixed}. Coverage: {shots}. Continuity holds from frame to frame. No text."
- Rebuild the winner: "The attached frame, as one standalone image. Keep its subject, styling, setting and composition. Improve {fixes}. {delivery_size}."
- Motion: "Use this image as the first frame; keep its composition and mood. {camera_move}. {subject_motion}. {ambient_motion}. {duration}, restrained, realistic motion."
