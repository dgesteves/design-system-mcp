---
'@dgesteves/design-system-mcp': minor
---

Find the design system without a config. When `components` is not set, the server reads shadcn's `components.json` (the `ui` alias, resolved through tsconfig `paths` or a workspace package's `exports`, and `tailwind.css` for tokens), then a design-system package's own `exports`, then dependencies named like one (`@acme/ui`) that resolve to workspace sources in pnpm, npm, Yarn or Bun workspaces. Components found through `exports` are suggested with the specifier apps import (`import { Button } from "@acme/ui/button"`), `inspect` prints what was detected, and the server re-runs detection when `components.json`, `package.json` or the tsconfig changes. This makes the shadcn website's custom registry path, shadcn's monorepo templates and packaged design systems such as midday's work with no config.

Also: excludes (stories, tests, `node_modules`) now apply to component globs outside the root, those folders are watched while serving, and tsconfig `paths` declared in an extended tsconfig without `baseUrl` resolve against that tsconfig's folder, as TypeScript does.
