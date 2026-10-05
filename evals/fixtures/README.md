# Skill behavior fixtures

Each YAML is one behavior case: setup, `expected.must` / `must_not`, graders (`command`, `tool_used`, `regex`, `llm`), `runs` (repeat to beat noise) and `cannot_isolate` (what the case can't measure, so nobody over-reads a pass).

`cstack evals plan` selects fixtures whose `depends_on` files changed; `cstack evals run` runs and grades them ([evals.md](../../docs/evals.md#running-fixtures)). Every T2 fixture says where its case starts, so a live run never fails on a file the setup names but nobody provided: `workspace` (an `examples/` brand), `setup_files` (`{path: text}`), `setup_props` (`{path: spec}`, generated at build: GLB, PNG, MP4, PDF, SVG, copies, flow plans, mockup renders) or `fresh_workspace: true` (the empty starter on purpose). `props/` holds text a prop copies (a long page and its figures). Kinds and specs: [docs/evals.md](../../docs/evals.md#where-a-case-starts).
