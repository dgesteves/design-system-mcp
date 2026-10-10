---
'onsystem': patch
---

Checked on Windows and macOS, and as an installed package.

- On Windows, `check` linted files git ignores: the paths `git check-ignore` returned never matched the ones it globbed (backslashes against forward slashes). They are left out now, as on Linux and macOS.
- The Claude Code hook names files with forward slashes on Windows too, as the CLI does (`app/page.tsx`, not `app\page.tsx`).
- CI runs the test suite on Windows and macOS as well as Linux, and on all three packs the package, installs the tarball into a new project, and runs the installed CLI (`inspect`, `check`), the MCP server over stdio in both protocol eras, and the hook against it.
