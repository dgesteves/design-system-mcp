---
'@dgesteves/design-system-mcp': patch
---

Zero config finds a flat `src/` of components that wrap a primitives library, the way React Aria's Tailwind starter ships them (`src/Button.tsx`, `src/Checkbox.tsx`), which used to need a config file. It is conservative: it needs a dependency on React Aria, Radix, Base UI, Headless UI or Ark UI, no app entry or route folder in `src/`, and at least five PascalCase files there, four in five of which import that library. Projects detected another way are unaffected.
