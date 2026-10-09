---
'@dgesteves/design-system-mcp': patch
---

Better suggestions. `no-unknown-prop` maps equivalent props in either direction to the one the component takes: `checked` → `isSelected`, `open` → `isOpen` and `disabled` → `isDisabled` on React Aria Components, and the reverse on Radix and native elements. In a project without a path alias, the import in a finding is relative to the checked file (`../ui/Button` from `src/pages/`) rather than to the project root.
