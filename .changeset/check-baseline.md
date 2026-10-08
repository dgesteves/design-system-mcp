---
'@dgesteves/design-system-mcp': minor
---

Add a baseline to `check`, so an existing codebase can adopt the rules without fixing every finding first. `check --update-baseline` records the current findings in `design-system-mcp.baseline.json`, keyed by file, rule and the offending source text with a count rather than by line. While that file exists, `check` reports and fails only on new findings, says how many the baseline accepted, and points out baseline entries that no longer occur. `--ignore-baseline` reports everything, and `--baseline <file>` reads another path.
