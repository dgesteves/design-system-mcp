---
'@dgesteves/design-system-mcp': patch
---

Suggest the color token that fits, not just the nearest one. On a fresh shadcn/ui project, where many tokens share a value, `no-hardcoded-color` used to pick whichever came first: `text-gray-500` became `text-chart-2`, `bg-gray-100` became `bg-sidebar-accent`, and `bg-yellow-100` became a gray because it is 0.07 away.

- Among the tokens close enough to swap in, the one made for the utility wins: `foreground` and `muted-foreground` for `text-*`, `fill-*` and `stroke-*`, surfaces such as `muted` for `bg-*`, and `border`, `input` and `ring` for `border-*` and `ring-*`.
- A fix is only offered for a token of the same hue, or a gray for a gray. Otherwise the message says no token has that hue and names the nearest one.
- `sidebar-*` and `chart-*` tokens are only suggested in a sidebar or a chart (by file name, enclosing component or classes), where they win ties.
- `dark:` classes are compared with the tokens' dark-mode values, so `dark:bg-zinc-900` becomes `dark:bg-card` rather than a token that is light in dark mode.
- `get_tokens` and `ds://tokens` list core tokens before `sidebar-*` and `chart-*`.
