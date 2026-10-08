---
'@dgesteves/design-system-mcp': minor
---

Add `check --quiet-without-design-system`: print nothing and exit 0 when the project has no design system (no components, no tokens beyond Tailwind's defaults, no config file). It is meant for hooks installed across many projects, such as the Claude Code plugin's lint-on-edit hook, so a plain React or Tailwind app is not linted against a design system it does not have.
