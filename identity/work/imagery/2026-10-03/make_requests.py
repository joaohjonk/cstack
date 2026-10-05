# Writes one cstack generate request per probe. Prompts carry no names, no "style of", no lettering.
import json, pathlib
NO_TEXT = " No text, no letters, no numbers, no logos, no signage anywhere in the image."
P = {
 "A-cube": "Editorial photograph, wide 2:1 frame. A calm, empty photo studio with warm white plaster walls and a warm white floor. On the floor lies a grid of flat squares painted International Klein Blue, deep ultramarine #002FA7, evenly spaced, receding in gentle perspective. One solid Klein blue cube, exactly the size of a floor square, is caught mid-tip, balanced on one edge between two squares as if deliberately stepping to the next one: deadpan, alive, unhurried. Soft north window light from the left, a long soft shadow, fine plaster texture, vast empty wall filling the upper half and the left third. Medium format film photograph, natural colour, quiet and happy." + NO_TEXT,
 "A-person": "Editorial photograph, wide 2:1 frame. A calm, empty photo studio with warm white plaster walls and a warm white floor. On the floor lies a grid of flat squares painted International Klein Blue, deep ultramarine #002FA7, evenly spaced. One fictional dancer in plain warm white clothes is caught mid-move across the squares in an impossibly long, deadpan stretch: one foot planted on a near blue square, one hand touching a far blue square, body level and calm, expression neutral. Soft north window light, long soft shadow, vast empty wall filling the upper half. Medium format film photograph, natural colour, quiet and happy, a small dry joke." + NO_TEXT,
 "B-pigment": "Museum macro photograph, wide 2:1 frame. Three solid cubes of pressed dry pigment in International Klein Blue, deep ultramarine #002FA7, with velvety matte powder surfaces, resting on a warm white plaster plinth. One cube is mid-roll, tipped up on one edge, leaving a fine trail of blue dust on the plaster where it stood. Soft raking daylight, shallow depth of field, crisp texture of powder and plaster. The cubes sit in the lower right third; generous empty warm white space above and to the left. Calm, deadpan, quietly joyful." + NO_TEXT,
 "C-poster": "Photograph composed like a strict modernist poster, wide 2:1 frame. A single solid International Klein Blue cube, deep ultramarine #002FA7, stands on a warm white seamless studio backdrop, small in the frame, placed exactly in the right third, lifted on one corner as though about to take a step. Orthogonal camera, perfectly level floor line at the lower third, soft even studio light, one crisp soft-edged shadow. The rest of the frame is clean empty warm white, precisely balanced, reserved for typography. Calm, deadpan, a hint of humour." + NO_TEXT,
}
M = {  # model -> (endpoint, params, estimated cost USD)
 "flux2pro": ("fal-ai/flux-2-pro", lambda s: {"image_size": {"width": 1536, "height": 768}, "seed": s, "output_format": "jpeg", "safety_tolerance": "2"}, None),
 "seedream5pro": ("bytedance/seedream/v5/pro/text-to-image", lambda s: {"image_size": {"width": 2048, "height": 1024}, "num_images": 1, "seed": s}, 0.08),
 "gptimage2": ("openai/gpt-image-2", lambda s: {"image_size": {"width": 1536, "height": 768}, "quality": "medium", "num_images": 1, "output_format": "jpeg"}, 0.17),
}
PLAN = [("A-cube","flux2pro",11),("A-cube","seedream5pro",11),("A-person","flux2pro",12),("A-person","gptimage2",12),
        ("B-pigment","flux2pro",21),("B-pigment","flux2pro",22),("B-pigment","seedream5pro",21),("B-pigment","gptimage2",21),
        ("C-poster","flux2pro",31),("C-poster","flux2pro",32),("C-poster","seedream5pro",31),("C-poster","gptimage2",31)]
items = []
for terr, mk, seed in PLAN:
  ep, params, est = M[mk]
  r = {"provider": "fal", "model": ep, "operation": "generate", "skill": "generate-media", "experiment_id": "self-imagery-2026-10-03",
       "inputs": {"prompt": P[terr], "params": params(seed)},
       "out_dir": "work/imagery/2026-10-03/probes", "out_prefix": f"{terr}_{mk}_s{seed}", "expected_size": {"aspect": "2:1"}}
  if est: r["estimated_cost"] = {"amount": est, "currency": "USD"}
  pathlib.Path(f"requests/{terr}_{mk}_s{seed}.json").write_text(json.dumps(r, indent=1))
  items.append({"provider": "fal", "model": ep, "operation": "generate", "inputs": {"params": params(seed)}, **({"est": r["estimated_cost"]} if est else {})})
pathlib.Path("probes.spend.json").write_text(json.dumps(items, indent=1))
pathlib.Path("prompts.json").write_text(json.dumps(P, indent=1))
print(len(items), "requests")
