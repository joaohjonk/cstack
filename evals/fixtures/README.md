# Skill behavior fixtures (section 31)

Each YAML is one behavior case: setup, `expected.must` / `must_not`, graders (`command`, `tool_used`, `regex`, `llm`), `runs` (repeat to beat noise) and `cannot_isolate` (what the case can't measure, so nobody over-reads a pass).

`cstack evals plan` selects fixtures whose `depends_on` files changed. T2 cases need a cheap model run by a harness (v0.2 backlog: a runner); until then they are executed by hand or by an agent following the fixture and recording the result with `cstack eval --file`.
