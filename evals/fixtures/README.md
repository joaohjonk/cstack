# Skill behavior fixtures

Each YAML is one behavior case: setup, `expected.must` / `must_not`, graders (`command`, `tool_used`, `regex`, `llm`), `runs` (repeat to beat noise) and `cannot_isolate` (what the case can't measure, so nobody over-reads a pass).

`cstack evals plan` selects fixtures whose `depends_on` files changed. No harness runs T2 cases yet ([evals.md](../../docs/evals.md)); a person or an agent follows the fixture and records the result with `cstack eval --file`.
