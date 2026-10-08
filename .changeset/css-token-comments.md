---
'@dgesteves/design-system-mcp': patch
---

Attach a CSS comment to the variable it describes. A comment after a declaration on the same line (`--background: 0 0% 100%; /* white */`) was read as the description of the next variable, so `foreground` was described as "white".
