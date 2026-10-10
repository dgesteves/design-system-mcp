---
'@dgesteves/design-system-mcp': minor
---

Color fixes keep the color's meaning. A pale arbitrary value or literal is a hue, not a gray: its chroma is judged against its lightness, so `bg-[#fef2f2]` is no longer fixed to `bg-muted`. Hues must be within 15° (was 30°), and status colors (`destructive`, `warning`, `success`, `info` and their foregrounds) are only offered for nearly the same hue and never for a gray, so a brand-orange button is no longer fixed to `bg-destructive` with a hint to use `variant="destructive"`. Token families that at most one design-system file uses (syntax-highlighting colors, a chart palette, one screen's background) are suggested only there, like `sidebar-*` and `chart-*`. Tokens built on Tailwind's palette (`--primary: var(--color-neutral-800)`, as in coss/ui) now resolve, so `no-hardcoded-color` runs on those projects, where it used to report "No color tokens found".
