---
'@dgesteves/design-system-mcp': patch
---

Fix false positives and missing hints found on fresh shadcn/ui projects and Inbox Zero.

- `icon-button-accessible-name` judges a button passed as Base UI's `render` (`<Dialog.Close render={<Button size="icon" />}>`) by its host's children and label, and skips buttons that are `hidden` or `aria-hidden`, or inside hidden content.
- `no-hardcoded-color` reads `color` and similar attributes as colors on native and SVG elements. On components it skips props with known values and only reads hex and color functions, so `<Badge color="green">`, a cva variant, is no longer a hardcoded color.
- `no-unknown-prop` explains `asChild` on a Base UI component (compose with `render={<Link />}`) and `render` on a Radix one (compose with `asChild`), instead of a bare "no prop" or a rename that would not work.
- `prefer-design-system-component` prefers the component that renders the element, so `<select>` suggests `NativeSelect` rather than Radix's `Select` when the project has both.
