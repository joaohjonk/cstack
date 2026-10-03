# Final requests for the two picks from the review (seedream v5 pro held Klein blue; flux drifted navy).
import json, pathlib
NO_TEXT = " No text, no letters, no numbers, no logos, no signage anywhere in the image."
F = {
 "F1-studio": "Editorial photograph, wide 2:1 frame, camera low and nearly frontal. A calm, empty photo studio with warm white plaster walls and a warm white floor; the whole frame is warm white #F6F4EF, never grey. In the right five twelfths of the frame, a grid of large flat squares painted International Klein Blue, deep ultramarine #002FA7, inlaid in the floor, reading as true squares, bleeding off the bottom right edge. One solid cube of matte pressed Klein blue pigment, the size of a floor square, is lifted onto one edge mid-tip from one square to the next, a thin gap of light under it, as if stepping deliberately: deadpan, alive, unhurried. The left seven twelfths of the frame are empty warm plaster wall and floor, completely clear. Soft north window light from the left, one long soft shadow. Medium format film photograph, natural colour, quiet and happy." + NO_TEXT,
 "F2-poster": "Photograph composed like a strict modernist poster, wide 2:1 frame. A warm white seamless studio, warm white #F6F4EF throughout, never grey. The floor line sits at about sixty percent of the height. Inlaid flush in the floor, one sparse row of flat International Klein Blue squares, deep ultramarine #002FA7, runs from the right edge toward the centre, cropped by the frame. One solid cube of matte pressed Klein blue pigment is mid-tumble above the last square in the right third, tipped on one corner, its soft shadow just detached beneath it. The left seven twelfths of the frame are completely empty warm white, reserved for typography. One soft window light from the left. Calm, deadpan, a hint of humour." + NO_TEXT,
}
W, H = map(int, __import__('sys').argv[1].split('x'))
for name, prompt in F.items():
  for seed in (41, 42):
    r = {"provider": "fal", "model": "bytedance/seedream/v5/pro/text-to-image", "operation": "generate", "skill": "generate-media",
         "experiment_id": "self-imagery-2026-10-03", "inputs": {"prompt": prompt, "params": {"image_size": {"width": W, "height": H}, "num_images": 1, "seed": seed}},
         "out_dir": "work/imagery/2026-10-03/finals", "out_prefix": f"{name}_seedream5pro_s{seed}", "expected_size": {"aspect": "2:1"},
         "estimated_cost": {"amount": 0.1, "currency": "USD"}}
    pathlib.Path(f"requests/final_{name}_s{seed}.json").write_text(json.dumps(r, indent=1))
pathlib.Path("prompts-finals.json").write_text(json.dumps(F, indent=1))
