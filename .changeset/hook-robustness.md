---
'@dgesteves/design-system-mcp': minor
---

The Claude Code hook speaks up when it can't check, and stays quiet where there is nothing to check against.

- When the CLI can't run (npx can't fetch it because of a min-release-age policy, a private registry or no network, or the config is broken), the hook says so once per session and project, on stderr and as a message shown to you, with the reason and what to do. It never blocks the edit, and Claude is not asked to fix it. It used to exit silently, so edits looked checked when they weren't.
- `check --quiet-without-design-system`, which the hook uses, now stays quiet in any project without design-system components or a config. A few custom properties are not a design system: in an app styled with CSS-in-JS, such as Twenty, three stray tokens made the hook block Claude on findings with nothing to compare against.
