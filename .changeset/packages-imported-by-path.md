---
'@dgesteves/design-system-mcp': minor
---

Find a workspace UI package that apps import by path. A dependency named like a design system with no `exports`, such as Documenso's `@documenso/ui` (`main: ./index.ts` with `export {}`, imported as `@documenso/ui/primitives/button`), used to be skipped. Its components are now the files the app's code imports, each suggested with the specifier the app uses, a folder imported through its index counts as a barrel, and a stylesheet the app imports from the package is read as its theme. `importPath` also takes a pattern for such packages: `"@acme/ui/{path}"` suggests `primitives/button.tsx` as `@acme/ui/primitives/button`.
