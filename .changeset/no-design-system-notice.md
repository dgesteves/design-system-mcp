---
'@dgesteves/design-system-mcp': minor
---

Say when there is no design system to check against. When no components or no color tokens are found, `check` and `check_ui` now say which rules could not run and link to the configuration docs ("No design system found (no components or color tokens): only the accessibility rule ran."), so a clean result is not mistaken for a checked one. The notice goes after the summary in the terminal, to stderr with `--format json`, as a workflow warning with `--format github`, and into `check_ui`'s text and a `notice` field. `check --require-design-system` exits 2 in that case, for CI. `--quiet-without-design-system` still prints nothing; passing both is a usage error.
