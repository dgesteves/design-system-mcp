---
'@dgesteves/design-system-mcp': patch
---

Fix two false positives found by running `check` on real projects.

- `no-unknown-component` no longer reports members of values that a design-system file exports but that are not components, such as `<Icons.Add />` from an icon map. Names that no design-system file exports, and a bare `<Icons />`, are still reported.
- `no-unknown-prop` no longer fires when part of a component's props type does not resolve (for example with `node_modules` not installed) behind an imported interface (`& ButtonProps`), a type argument (`Omit<ButtonProps, "type">`), a type alias from another file, or a long chain of interfaces. The props are marked open instead, as they already were for an interface in the same file.
