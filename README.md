# design-system-mcp

An MCP server that gives coding agents ground truth about your React design system, and a linter they can run on their own UI.

[![CI](https://img.shields.io/github/actions/workflow/status/dgesteves/design-system-mcp/ci.yml?branch=main&style=flat-square&label=CI&labelColor=0d0f12)](https://github.com/dgesteves/design-system-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@dgesteves/design-system-mcp?style=flat-square&labelColor=0d0f12&color=22d3ee)](https://www.npmjs.com/package/@dgesteves/design-system-mcp)
[![License: MIT](https://img.shields.io/github/license/dgesteves/design-system-mcp?style=flat-square&labelColor=0d0f12&color=22d3ee)](LICENSE)

<p align="center">
  <img src=".github/assets/hero.svg" width="100%" alt="An agent writes app/settings/danger-zone.tsx, calls check_ui, gets 8 errors and 3 warnings with fixes such as border-[#ef4444] to border-destructive and variant=danger to variant=destructive, applies them, and check_ui reports no problems.">
</p>

## The problem

Coding agents write UI from their training data, not from your design system. Ask for a settings card in a shadcn/ui project and you get `bg-[#ef4444]`, `p-[13px]`, a native `<button>` with hand-rolled classes, `variant="danger"` on a `Button` that only knows `destructive`, `<Card.Header>` in a system that exports `CardHeader`, and an icon button nobody can name with a screen reader.

The agent cannot see your Storybook or docs site, and TypeScript only catches part of it after the fact. On the demo draft above, `tsc` reports 3 of the 11 problems (the invalid variant, the unknown prop and the missing member) and has no opinion on hex colors, off-scale spacing, native elements or accessible names.

`design-system-mcp` reads your components, tokens and docs, and serves them to the agent over [MCP](https://modelcontextprotocol.io): what exists, which props and variant values are valid, which token to use. It also gives the agent `check_ui`, a linter it calls on its own output. Every finding has a rule id, a location and a concrete fix, so the agent can correct itself before you review anything.

## Quickstart

In a shadcn/ui-style project (`components/ui/*.tsx`, `app/globals.css`) no config is needed. Give your agent the tools, check what was extracted, and run the same rules from the terminal:

```sh
claude mcp add design-system -- npx -y @dgesteves/design-system-mcp
npx @dgesteves/design-system-mcp inspect
npx @dgesteves/design-system-mcp check "app/**/*.tsx"
```

Other layouts take a [config file](#configuration). Requires Node.js 22.18 or later.

## Setup

The server speaks MCP over stdio. It finds the project from `--root`, a config file in the working directory, or the workspace roots the client reports.

<details open>
<summary><strong>Claude Code</strong></summary>

```sh
claude mcp add design-system -- npx -y @dgesteves/design-system-mcp
```

To share it with your team, add `--scope project`, which writes `.mcp.json` at the repository root:

```json
{
  "mcpServers": {
    "design-system": {
      "command": "npx",
      "args": ["-y", "@dgesteves/design-system-mcp"]
    }
  }
}
```

</details>

<details open>
<summary><strong>Cursor</strong></summary>

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "design-system": {
      "command": "npx",
      "args": ["-y", "@dgesteves/design-system-mcp", "--root", "${workspaceFolder}"]
    }
  }
}
```

</details>

<details open>
<summary><strong>VS Code (Copilot agent mode)</strong></summary>

`.vscode/mcp.json`:

```json
{
  "servers": {
    "design-system": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@dgesteves/design-system-mcp", "--root", "${workspaceFolder}"]
    }
  }
}
```

</details>

Any other MCP client: run `npx -y @dgesteves/design-system-mcp --root /path/to/app` as a stdio server. On native Windows, wrap it as `cmd /c npx ...`.

The server sends usage instructions during the MCP handshake. Clients that ignore them benefit from one line in `CLAUDE.md`, `AGENTS.md` or `.cursor/rules`: _"Before writing UI, use the design-system tools. Run check_ui on every file you change and fix all errors."_

## Tools

All tools are read-only, have zod-validated input schemas, and return compact Markdown for the model plus JSON `structuredContent` (with an output schema) for programs.

| Tool                | Input                                           | Returns                                                                                                                  |
| ------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `list_components`   | none                                            | Every component with a one-line description, the element it renders, variant values, parts and its import                |
| `get_component`     | `name`: `Button`, `CardHeader` or `Card.Header` | Import, props (types, defaults, JSDoc), cva variants and the classes each applies, parts, tokens used, docs and examples |
| `search_components` | `query`, `limit`                                | Components ranked for an intent such as "confirm a destructive action"                                                   |
| `get_tokens`        | `category?`, `query?`                           | Tokens with resolved values, dark-mode values and usages (`bg-primary`, `var(--primary)`)                                |
| `check_ui`          | `code` or `path`, `filename?`                   | Diagnostics with rule id, 1-based range, message, suggestion and edit-based fix                                          |

Resources: `ds://components/{name}` (Markdown, with name completion) and `ds://tokens` (JSON). Prompt: `build-with-design-system`, which takes a `task` and walks the agent through search, contract, tokens and `check_ui`. Claude Code exposes it as `/mcp__design-system__build-with-design-system`.

What the agent sees, from the [demo](examples/shadcn-demo):

```text
> get_component { "name": "Badge" }

# Badge
A small status label: counts, states ("Active", "Overdue") or categories.

import { Badge } from "@/components/ui/badge"
Renders <span> · components/ui/badge.tsx:29 · docs: docs/badge.md

## Props
- variant?: "default" | "secondary" | "destructive" | "success" | "outline" = "default"
- asChild?: boolean = false — Render the child element with badge styles instead of a `<span>`.
- …plus 280 props from React.ComponentProps<"span"> (onClick, id, role, children, aria-*, data-*, …)

## Variants
variant (default "default")
  default      border-transparent bg-primary text-primary-foreground
  destructive  border-transparent bg-destructive text-white
  success      border-transparent bg-success text-success-foreground
  …
```

```text
> check_ui { "code": "<Button variant=\"primary\" className=\"bg-blue-600 px-[18px]\">Save</Button>" }

snippet.tsx: 2 errors, 1 warning

1:17 error [no-unknown-variant] "primary" is not a valid variant for <Button>.
     Allowed: default, destructive, outline, secondary, ghost, link. Did you mean "default"?
1:38 error [no-hardcoded-color] `bg-blue-600` is Tailwind's default palette, not a design-system
     color. No close token; nearest is muted-foreground (ΔE 0.245). Pick the semantic token that
     fits. <Button> already sets bg-* through `variant`; prefer a variant over overriding it.
1:50 warning [no-hardcoded-spacing] Hardcoded spacing `px-[18px]` (18px) is off the scale.
     Nearest: `px-4` (16px).
```

## Rules

| Rule                             | Default | Catches                                                                                                                               | Suggests                                                                                                              |
| -------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `no-hardcoded-color`             | error   | Hex/rgb/hsl/oklch literals in classes (`bg-[#ef4444]`), styles and color attributes; Tailwind default-palette classes (`bg-gray-100`) | Nearest token by OKLCH distance (`bg-destructive`, `var(--muted-foreground)`), or the variant that already applies it |
| `no-hardcoded-spacing`           | warn    | Arbitrary padding, margin and gap (`p-[13px]`, `style={{ marginTop: 6 }}`)                                                            | Nearest step on the spacing scale (`p-3`)                                                                             |
| `no-hardcoded-radius`            | warn    | Arbitrary radius (`rounded-[7px]`, `borderRadius: 14`)                                                                                | Nearest radius token (`rounded-sm`)                                                                                   |
| `prefer-design-system-component` | error   | Native elements a component wraps (`<button>`, `<input>`, `<dialog>`), inferred from each component's props and markup                | The component and its import                                                                                          |
| `no-unknown-component`           | error   | Invented components, dot-notation members that do not exist (`<Card.Header>`), typos                                                  | The flat part (`<CardHeader>`) or closest name                                                                        |
| `no-unknown-prop`                | error   | Props a component does not accept, own or inherited (`tone`, `isDisabled`)                                                            | Closest prop, with cross-library synonyms (`tone` → `variant`)                                                        |
| `no-unknown-variant`             | error   | Values outside a cva variant or literal union (`variant="danger"`)                                                                    | Allowed values and a synonym match (`danger` → `destructive`, `small` → `sm`)                                         |
| `icon-button-accessible-name`    | error   | Buttons whose only content is an icon, with no `aria-label`, `aria-labelledby`, `title` or visually hidden text                       | `aria-label`, guessed from the icon (`Trash2` → "Delete")                                                             |

Color matches under ΔE 0.02 count as the same color; under 0.1 the fix is offered; beyond that the message names the nearest token but leaves the choice to the agent. Rules that need tokens are skipped when the design system defines none of that category. Syntax errors are reported as `syntax`.

## Configuration

`design-system-mcp.config.json` (or `.ts`, `.mjs`, `.js`) in the project root. Every field is optional; the [JSON Schema](schema.json) gives editor completion.

```json
{
  "$schema": "https://unpkg.com/@dgesteves/design-system-mcp/schema.json",
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
  }
}
```

| Field        | Default                                                                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `components` | `components/ui/**/*.{tsx,jsx}`, `src/components/ui/**/*.{tsx,jsx}`                                                                           |
| `tokens`     | `app/globals.css`, `src/app/globals.css`, `styles/globals.css`, `src/styles/globals.css`, `src/index.css`, `app/app.css`, `**/*.tokens.json` |
| `docs`       | `docs/components/**/*.{md,mdx}` and `.md`/`.mdx` files next to the components                                                                |
| `importPath` | Inferred from `tsconfig` `paths` (`@/components/ui/button`)                                                                                  |
| `tsconfig`   | `tsconfig.json` in the root                                                                                                                  |

Tokens can be [W3C DTCG](https://www.designtokens.org/) JSON (`$type` inheritance, aliases, object color and dimension values, `$deprecated`, modes under `$extensions.modes`) or CSS custom properties: `:root` values, `.dark` / `[data-theme]` / `prefers-color-scheme` modes, and Tailwind v4 `@theme` mappings, with `calc()` evaluated. A DTCG file and the CSS generated from it are merged by custom property.

Docs are Markdown or MDX, one file per component, matched by `component:` frontmatter, the first heading or the file name. Fenced `tsx`/`jsx` blocks become examples (`title="..."` in the fence names them); JSDoc `@example` tags work too.

CLI flags override the file: `--root`, `--config`, `--components`, `--tokens`, `--docs` (repeatable), `--no-cache`, `--no-watch`. Run `design-system-mcp --help` for the rest.

## CI

`check` runs the same rules as `check_ui` and exits 1 on errors (or on more than `--max-warnings` warnings):

```yaml
- run: npx @dgesteves/design-system-mcp check "app/**/*.tsx" "src/**/*.tsx" --format github
```

`--format github` prints workflow commands, so findings show up as annotations on the pull request. `--format json` prints the raw results.

## How it works

<p align="center">
  <img src=".github/assets/architecture.svg" width="100%" alt="Sources (components, tokens, docs, config) flow through the TypeScript checker, a cva parser, token parsers and a docs parser into a cached design-system model with a BM25 index, an OKLCH token index and the lint rules, served by an MCP server over stdio and by the check CLI.">
</p>

1. **Components.** One TypeScript program over the component files, with the project's `tsconfig` (so path aliases and dependency types resolve). For each exported PascalCase function, `forwardRef`, `memo` or class component, and each alias of a library component (`const Dialog = DialogPrimitive.Root`), the checker gives the props type. Props declared in the project, or by packages such as Radix, are listed with types, required flags, defaults (from destructuring, `@default` or `defaultVariants`) and JSDoc. React's DOM attributes are summarised as "…plus 290 props from `React.ComponentProps<"button">`" but kept in full for linting. When dependency types are missing, extraction falls back to what resolves and marks the props as open, so the linter does not guess.
2. **Variants.** `cva()` and `tv()` calls are read from the AST: values in declaration order, defaults, per-value classes and compound variants. They are linked to a component through `VariantProps<typeof x>` or a call in its body.
3. **Composition.** Flat parts (`CardHeader` next to `Card` in `card.tsx`), static members (`Card.Header = CardHeader`) and `Object.assign(Root, { List })` become parent/part relationships. The wrapped native element comes from `ComponentProps<"button">`, `ButtonHTMLAttributes<HTMLButtonElement>`, the `forwardRef` element type, or the rendered JSX (including `const Comp = asChild ? Slot : "button"`).
4. **Model.** Components, tokens and docs form one JSON model, cached in `node_modules/.cache/design-system-mcp` and keyed on file sizes and mtimes, the lockfile, the config and the package version. The server answers the MCP handshake immediately and loads in the background; requests wait for the load. File changes trigger a rebuild that reuses the previous TypeScript program, and clients are notified that resources changed.
5. **Lint.** `check_ui` parses the snippet on its own (no type-checking), resolves each JSX tag through its imports to a design-system component, and runs the rules against the model. Fixes are text edits with offsets, so an agent or a tool can apply them mechanically.

## Design decisions

**Static analysis, not another model.** The agent is already the LLM; what it lacks is ground truth. Everything here is deterministic, takes milliseconds, runs offline, needs no API key, and can be unit-tested rule by rule. The cost: it cannot judge intent, such as whether a `Dialog` was the right call. That stays with the agent and the reviewer.

**The TypeScript checker over `react-docgen-typescript`.** react-docgen-typescript wraps the same API but hides the AST, and `cva()` parsing, composition and element inference all need it. One program serves all four. The runtime dependency is TypeScript 6, the last release with the JavaScript compiler API; TypeScript 7 (the Go port) does not expose a stable one yet.

**Syntactic linting.** Agents check fragments they have not saved, often without imports. Type-checking those would need the whole program and would fail on the fragment's missing context. `check_ui` complements `tsc`: it catches what types cannot express (tokens, native elements, accessible names) and says what to write instead.

**BM25, not embeddings.** A design system is tens to a few hundred documents whose vocabulary already lives in names, docs and variant values. Field-weighted BM25 with Porter stemming and a small synonym map ("modal" → Dialog, "delete" → destructive) ranks them well, deterministically, with no model download or API key. It does not understand paraphrases the synonym map does not cover.

**OKLCH for nearest colors.** Distance in OKLCH (ΔE in OKLab) tracks perceived difference, so the suggested token is the one that looks closest, not the one with the closest hex digits. It also matches how Tailwind v4 and shadcn/ui define colors.

**Markdown for the model, JSON for programs.** Tool results put compact Markdown in `content`, which costs fewer tokens than JSON and reads well to a model, and the full JSON in `structuredContent` for clients and scripts.

### Limits

- React only. Fix suggestions are Tailwind classes when the tokens come from a Tailwind theme, otherwise `var(--token)`.
- Linting is per file and syntactic. Class names built at runtime (`` `bg-${color}-500` ``) are not checked, and spread props are trusted.
- `no-unknown-prop` is skipped for components whose props type does not fully resolve (dependencies not installed).
- Composition is inferred from naming and static members; other patterns need explicit exports.
- No typography or shadow rules yet, and stdio is the only transport.

## Roadmap

- **Angular and Web Components extraction**: signal and decorator inputs, and the Custom Elements Manifest.
- **Storybook import**: stories as examples, `argTypes` as prop docs, CSF as a docs source.
- **Figma variables**: import variables and modes as tokens, through the REST API or a DTCG export.
- Typography and shadow rules, an ESLint plugin that wraps the same rules, and a Streamable HTTP transport for remote agents.

## Development

```sh
pnpm install
pnpm test          # Vitest: extraction, tokens, every rule, search, CLI, MCP client end to end
pnpm build         # tsdown, then schema.json
pnpm smoke         # spawns dist/cli.js over stdio against the demo and calls every tool
pnpm demo:check    # the CLI on examples/shadcn-demo (exits 1: the draft has errors)
pnpm assets        # regenerates the images in .github/assets from real check output
```

Releases use [Changesets](https://github.com/changesets/changesets): add one with `pnpm changeset`.

## License

[MIT](LICENSE) © Diogo Esteves
