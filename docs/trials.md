# Brand trials: does the brand replicate?

A brand system is only replicable if people who did not build it can use it. `cstack trial` tests that. Several agent
teams get only the brand's files. Each team answers simulated real-world problems it has never seen. A control team
answers the same problems knowing only the brand's name and one line about it. The owner then looks at all the work
mixed together, blind, and says which pieces are the brand's.

## What it measures

| Measure | Evidence | What it shows |
| --- | --- | --- |
| Attribution rate, brand teams against control | the owner's blind taps on `score/attribution.html` | the brand is recognisable, against a baseline |
| Cross-team agreement | the owner's taps on `score/pairs.html` (two brand teams' answers to one scenario) | two teams that never met converge |
| Reviewer pass rate and agreement with the owner | each team's `trial/review.json` against the taps | how far the AI reviewers can be trusted (calibration) |
| Spend against the plan | each workspace's ledger | what replicating the brand costs |

## Run one

```bash
cstack trial list                                   # the scenarios in trials/scenarios/
cstack trial plan --brand ~/brands/acme --out ~/trials/acme-r1 \
  --scenarios retail-endcap,price-change,city-poster,sold-out \
  --teams 2 --positioning "one line on what the brand is" --floor 5 --cap 8
cstack trial run ~/trials/acme-r1 --agent "claude -p --setting-sources project --strict-mcp-config --mcp-config '{\"mcpServers\":{}}'"
cstack trial score ~/trials/acme-r1                 # prints the two sheets' links
cstack trial import ~/trials/acme-r1 ~/Downloads/acme-r1-attribution.taps.json ~/Downloads/acme-r1-pairs.taps.json
```

- **Floor and cap.** The plan prices every picture of every application, for every team, at `--per-picture`.
  A round under the floor is refused: raise `--pictures-scale` to spend on quality, or add scenarios. A round over the
  cap is refused too. Each workspace's budget is its share of the cap, so the normal spend gate stops a team that
  overspends.
- **Isolation.** A brand team's workspace holds `cstack.config.yaml`, `brand/`, `assets/`, `references/`, `recipes/` and
  `briefs/`. It never holds `state/`, `work/`, `.env` files or keys. The control workspace holds a budget and
  `trial/brand.md`.
- **Roles.** Strategist, art director, challenger (argues for a braver version), the art director again as decider, copywriter, producer, makers and reviewer each run as their own agent session,
  in that order. Each one hands its work on in a file under `trial/`, and every transcript is kept. A stopped run
  (for example at a usage limit) resumes from the next role that has not run.
- **Blind.** The sheets show shuffled codes only; `score/key.json` maps them back. Tap before reading the reviews.

## Scenarios

Each scenario is a request a brand gets on a bad day: who asks, the deadline, the catch that makes it hard, and two
to four applications. Schema: `schemas/scenario.schema.json`. Library scenarios name no real brand. Add one by writing
`trials/scenarios/<id>.scenario.yaml`; `cstack validate` checks it.

A trial's numbers come from that run only. A claim built on them names the run, the date and the brand.
