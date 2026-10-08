---
'@dgesteves/design-system-mcp': minor
---

Support Tailwind v3 color tokens, the format of every shadcn/ui project before Tailwind v4. Bare HSL channels such as `--border: 214.3 31.8% 91.4%` are now read as colors; they used to be filed under `other`, which turned color checks off or pointed every finding at the few tokens in another format. Class names come from the `colors` in `tailwind.config.*` (the one `components.json` names, else the root's) and the presets it imports from the project, read without running it, or from shadcn/ui's names when those cannot be read. Fixes are `bg-border` rather than `bg-[var(--border)]`, which is invalid CSS when the variable holds bare channels, and `hsl(var(--x))` where no class exists.
