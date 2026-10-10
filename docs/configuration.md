# Configuration

Most projects need no config: onsystem finds the design system the way your app imports it. Other layouts take a few globs.

## Zero config

Without a config file (or with one that leaves `components` unset), the server looks for the design system in this order, and `inspect` prints what it found on its `detected` line:

1. **`components.json`** (shadcn/ui): the `ui` alias, resolved through tsconfig `paths` (`@/registry/new-york-v4/ui`) or a workspace package's `exports` (`@workspace/ui/components` in shadcn's monorepo templates), and `tailwind.css` for tokens.
2. **The root is a design-system package**: its `package.json` `exports` point at three or more component files (`"./button": "./src/components/button.tsx"` or `"./components/*": "./src/components/*.tsx"`). Exported stylesheets that exist are read as tokens, else `src/globals.css` and the like.
3. **A dependency named like a design system** (`@acme/ui`, `@acme/ui-kit`, `@acme/design-system`, `acme-ui`) that resolves to workspace sources, through a `node_modules` link or the workspace's package globs (pnpm, npm, Yarn and Bun). It is read the same way, or through its own `components.json`, and the app's own `components/ui` is kept alongside it. A package without `exports` that apps import by path, as Documenso imports `@documenso/ui/primitives/button`, is read from the files the app's code imports, each suggested with the specifier it uses, with a stylesheet imported from it as the theme.
4. **A flat `src/` of components** that wrap a primitives library, the way React Aria's Tailwind starter ships them (`src/Button.tsx`, `src/Checkbox.tsx`). It takes all of: a dependency on `react-aria-components`, `react-aria`, Radix, Base UI, Headless UI or Ark UI; no app entry (`main.tsx`, `App.tsx`, `index.tsx`) or `app`, `pages` or `routes` folder in `src/`; and at least five PascalCase `.tsx` files at its top level, four in five of which import that library. An app's `src/` of pages and features does not qualify. A stylesheet such as `src/index.css` is read as the theme.

A candidate whose files cannot be found is skipped. Components found through `exports` are suggested with the specifier apps use (`import { Button } from "@acme/ui/button"`, or `@acme/ui` for a package that exports a barrel). Detected stylesheets replace the stylesheet guesses below, while `*.tokens.json` files are still read, and Markdown next to detected components counts as docs. While serving, edits to `components.json`, `package.json` or the tsconfig re-run detection, and workspace packages outside the root are watched like local folders.

## Config file

`onsystem.config.json` (or `.mjs`, `.js`, or `.ts` on Node.js 22.18 or later) in the project root. Every field is optional; the [JSON Schema](../schema.json) gives editor completion.

```json
{
  "$schema": "https://unpkg.com/onsystem/schema.json",
  "components": ["src/components/**/*.tsx"],
  "exclude": ["**/*.stories.tsx", "**/*.test.tsx"],
  "tokens": ["src/styles/globals.css", { "path": "tokens/*.tokens.json", "prefix": "acme" }],
  "docs": ["docs/components/**/*.mdx"],
  "importPath": "@acme/ui",
  "elements": { "a": "Link" },
  "rules": {
    "no-hardcoded-spacing": "error",
    "no-hardcoded-color": ["error", { "allow": ["#fff"] }],
    "icon-button-accessible-name": "off"
  },
  "overrides": [
    { "files": ["app/legacy/**", "**/*.generated.tsx"], "rules": { "no-hardcoded-color": "warn" } }
  ]
}
```

| Field                 | Default                                                                                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components`          | [Detected](#zero-config), else `components/ui/**/*.{tsx,jsx}`, `src/components/ui/**/*.{tsx,jsx}`                                                                                        |
| `tokens`              | Detected, else `app/globals.css`, `src/app/globals.css`, `styles/globals.css`, `src/styles/globals.css`, `src/index.css`, `app/app.css`, `**/*.tokens.json`                              |
| `docs`                | `docs/components/**/*.{md,mdx}` and `.md`/`.mdx` files next to the components                                                                                                            |
| `importPath`          | Inferred from package `exports` (`@acme/ui/button`), then `tsconfig` `paths` (`@/components/ui/button`). `@acme/ui/{path}` suggests each file by its path in its package                 |
| `includeDesignSystem` | `false`: `check` skips the component files themselves ([CI](ci.md))                                                                                                                      |
| `tsconfig`            | `tsconfig.json` in the root                                                                                                                                                              |
| `overrides`           | None. Each entry's `rules` apply over `rules` to the files its `files` globs match, relative to the root; later entries win. Unknown keys and rules are named with the closest valid one |

Paths and globs are relative to the root and use forward slashes. Windows-style backslashes (`components\ui\**\*.tsx`, `.\tsconfig.app.json`) are read as separators, except in a pattern that already uses `/`, where `\` escapes glob syntax (`app/\(marketing\)/**`). A `tsconfig` that does not exist is a config error rather than a silent fallback.

Tokens can be [W3C DTCG](https://www.designtokens.org/) JSON (`$type` inheritance, aliases, object color and dimension values, `$deprecated`, modes under `$extensions.modes`) or CSS custom properties: `:root` values, `.dark` / `[data-theme]` / `prefers-color-scheme` / `@variant dark` modes, and Tailwind v4 `@theme` mappings, with `calc()` evaluated and Tailwind's own palette resolved where a token builds on it (`--primary: var(--color-neutral-800)`). Tailwind v3 works too: bare HSL channels (`--border: 214.3 31.8% 91.4%`) are colors, and class names come from the `colors` in `tailwind.config.*` (the one `components.json` names, else the root's) and the presets it imports from the project, read without running it. When those colors cannot be read, shadcn/ui's names are used (`--sidebar-background` is `bg-sidebar`). Token stylesheets are read as one theme, so `.dark` can live in its own file; without a `:root` block the `light` mode is the base, and a dark mode never is. A DTCG file and the CSS generated from it are merged by custom property.

`elements` maps a native element to the component that replaces it (`{ "a": "Link" }`, or a key such as `input[type=checkbox]` for a non-text input type); a mapped component is treated as a drop-in, so the rename is auto-fixed.

Docs are Markdown or MDX, one file per component, matched by `component:` frontmatter, the first heading or the file name. Fenced `tsx`/`jsx` blocks become examples (`title="..."` in the fence names them); JSDoc `@example` tags work too.

CLI flags override the file: `--root`, `--config`, `--components`, `--tokens`, `--docs` (repeatable), `--no-cache`, `--no-watch`. Run `onsystem --help` for the rest.
