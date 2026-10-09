---
'@dgesteves/design-system-mcp': patch
---

`check`, `check_ui` and `checkSource` no longer throw on code nested thousands of levels deep. The analysis walks the syntax tree with an explicit stack, so deep chains are still checked, and code too deep for TypeScript's parser comes back as a single `syntax` error ("nested too deeply to parse") instead of failing the run or the tool call.
