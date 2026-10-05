# Founding mode: interview the founder first

For a brand from zero. A good studio does not open with directions. It takes a brief from the founder: why the brand should exist, who it is for, what it is like as a person, and what the founder already brings. Directions come later, from that brief and from references the founder has reacted to. This order comes from the owner's verdict on a field-test run that offered territories to a founder nobody had interviewed (findings F23 and F24).

## The interview

Ask in rounds, one theme per round, and write down the founder's words. The three-question cap in request mode does not apply here. Stop when every section below has an answer or an honest UNKNOWN. Never fill a gap with a guess.

1. **Why it exists.** Why should this brand exist? What is the founder's story, instinct or problem behind it? Which cultural space does it step into? What do they believe the world will want more of?
2. **The customer, first.** Who is it for, and when and where do they meet it? What do they use instead today? Does the founder know this from watching or from being told, or is it assumed?
3. **The brand as a person.** A brand acts like a person. Does it have a name yet? What is its personality? What colours, marks, type and materials does the founder already see? How does it sound? Where does it hang out, whose company does it keep, and where is it sold? What would it never do?
4. **Assets and inspirations.** What exists already (a name, a mark, photos, a recipe, a supplier, packaging)? Which brands, objects, places or schools of design inspire the founder, and what exactly draws them: the mechanism, not the look? These inspirations are the first references to bring back to them.

Push back where an answer is an adjective ("premium", "clean"). Ask what it would look like on a shelf, or which thing they own already does it.

## What it writes

`briefs/<date>-founding.founder-brief.yaml` (schema `founder-brief`), with `owner_approval.status: draft` until the founder says yes. Then write the identity's creative brief from it.

## What waits for it

The `mood-probes` flow lists `founder_brief` and `reference_reactions` under `requires`, so `cstack flows gate <plan> --stage make` refuses territory probes until an approved founder brief exists and the founder has reacted to a reference packet (feedback on `references/` or `work/references/` items). If the owner chooses to skip a step, record it in the plan's `waivers` with the date and why. The gate then passes with a warning that has to travel with the work.
