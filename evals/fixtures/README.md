# Skill behavior fixtures

Each YAML is one behavior case: setup, `expected.must` / `must_not`, graders (`command`, `tool_used`, `regex`, `llm`), `runs` (repeat to beat noise) and `cannot_isolate` (what the case can't measure, so nobody over-reads a pass).

`cstack evals plan` selects fixtures whose `depends_on` files changed; `cstack evals run` runs and grades them ([evals.md](../../docs/evals.md#running-fixtures)). Optional `workspace` and `setup_files` give the runner what the setup describes.
