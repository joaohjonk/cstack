# Program for exp-hero-plate-traces (fictional, illustrative)

Human-editable instructions that steer proposals. If the agent keeps making the same bad move, fix THIS file, not the outputs.

- Objective: find the evidence-of-use trace that reads most clearly as "just after a meal" at thumbnail size.
- The one thing you may change: prompt.slot.traces (the variant pool in recipes/autumn-hero-plate.prompt-recipe.yaml)
- Never change: fixture, evaluator, model, reference_set, crop, other prompt slots
- Ideas to try first: bread heel + napkin (baseline); spoon on rim + crumbs; water glass + napkin.
- Ideas already tried (see results.tsv): baseline, spoon-on-rim (discarded).
- Note: provider is the mock. Scores below are placeholders that show the row shape; a real run replaces them with reviewer and owner judgments.
