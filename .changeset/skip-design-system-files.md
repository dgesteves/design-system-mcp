---
'@dgesteves/design-system-mcp': minor
---

`check` skips the design system's own component files, the ones `components` matches. They implement the scale and the primitives the rules enforce, so a fresh shadcn/ui project failed its first CI run on shadcn's own `p-[3px]`, `rounded-[2px]` and combobox buttons. The summary says how many were skipped, and a run that matches only design-system files exits 0 with "Nothing to check". `--include-design-system`, or `"includeDesignSystem": true` in the config, lints them too. The Claude Code hook follows suit: an edit to `components/ui/button.tsx` is not linted.
