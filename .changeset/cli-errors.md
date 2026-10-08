---
'@dgesteves/design-system-mcp': patch
---

Clearer CLI errors and output.

- A `--root` that does not exist is a one-line error with exit code 2 for `check` and `inspect`, instead of a stack trace with exit code 1 (or a successful `inspect` of nothing).
- A `--root` holding a variable the client did not expand, such as `${workspaceFolder}`, is reported and ignored: the server falls back to the client's workspace roots or the working directory.
- Config errors name what is wrong and the closest valid value: `Unknown rule "no-hardcoded-colors". Did you mean "no-hardcoded-color"?`, `Invalid severity "warning": use "off", "warn" or "error"`, and unknown keys and rule options likewise.
- A token file named outright (in `--tokens` or the config's `tokens`, not a glob) that does not exist is an error that names it, instead of silently disabling the color rules.
- `design-system-mcp help` works like `--help`, whose text now describes the detected `--components` default.
- The summary counts the files with findings: `8 errors, 3 warnings in 1 of 2 files checked`.
