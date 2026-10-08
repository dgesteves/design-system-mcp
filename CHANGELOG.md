# @dgesteves/design-system-mcp

## 0.2.0

### Minor Changes

- [#6](https://github.com/dgesteves/design-system-mcp/pull/6) [`4ba6b76`](https://github.com/dgesteves/design-system-mcp/commit/4ba6b76eaab928e0a6b535d47da02f90d2e7ee51) Thanks [@dgesteves](https://github.com/dgesteves)! - Add a baseline to `check`, so an existing codebase can adopt the rules without fixing every finding first. `check --update-baseline` records the current findings in `design-system-mcp.baseline.json`, keyed by file, rule and the offending source text with a count rather than by line. While that file exists, `check` reports and fails only on new findings, says how many the baseline accepted, and points out baseline entries that no longer occur. `--ignore-baseline` reports everything, and `--baseline <file>` reads another path.

- [#9](https://github.com/dgesteves/design-system-mcp/pull/9) [`348538d`](https://github.com/dgesteves/design-system-mcp/commit/348538de0794e8d0c20ee25a3482c5a13c5f7f6d) Thanks [@dgesteves](https://github.com/dgesteves)! - Add `check --quiet-without-design-system`: print nothing and exit 0 when the project has no design system (no components, no tokens beyond Tailwind's defaults, no config file). It is meant for hooks installed across many projects, such as the Claude Code plugin's lint-on-edit hook, so a plain React or Tailwind app is not linted against a design system it does not have.

- [#5](https://github.com/dgesteves/design-system-mcp/pull/5) [`bb6a966`](https://github.com/dgesteves/design-system-mcp/commit/bb6a966f14a316ac2f3d6dd6c39bfe3c8a92d417) Thanks [@dgesteves](https://github.com/dgesteves)! - Find the design system without a config. When `components` is not set, the server reads shadcn's `components.json` (the `ui` alias, resolved through tsconfig `paths` or a workspace package's `exports`, and `tailwind.css` for tokens), then a design-system package's own `exports`, then dependencies named like one (`@acme/ui`) that resolve to workspace sources in pnpm, npm, Yarn or Bun workspaces. Components found through `exports` are suggested with the specifier apps import (`import { Button } from "@acme/ui/button"`), `inspect` prints what was detected, and the server re-runs detection when `components.json`, `package.json` or the tsconfig changes. This makes the shadcn website's custom registry path, shadcn's monorepo templates and packaged design systems such as midday's work with no config.
  
  Also: excludes (stories, tests, `node_modules`) now apply to component globs outside the root, those folders are watched while serving, and tsconfig `paths` declared in an extended tsconfig without `baseUrl` resolve against that tsconfig's folder, as TypeScript does.

### Patch Changes

- [#4](https://github.com/dgesteves/design-system-mcp/pull/4) [`44156d6`](https://github.com/dgesteves/design-system-mcp/commit/44156d6d310e96ed20a36ed038b708a9cdc8bd60) Thanks [@dgesteves](https://github.com/dgesteves)! - Fix two false positives found by running `check` on real projects.
  
  - `no-unknown-component` no longer reports members of values that a design-system file exports but that are not components, such as `<Icons.Add />` from an icon map. Names that no design-system file exports, and a bare `<Icons />`, are still reported.
  - `no-unknown-prop` no longer fires when part of a component's props type does not resolve (for example with `node_modules` not installed) behind an imported interface (`& ButtonProps`), a type argument (`Omit<ButtonProps, "type">`), a type alias from another file, or a long chain of interfaces. The props are marked open instead, as they already were for an interface in the same file.

## 0.1.1

### Patch Changes

- [#3](https://github.com/dgesteves/design-system-mcp/pull/3) [`486c30f`](https://github.com/dgesteves/design-system-mcp/commit/486c30fe78af19cb82474f14bafba3e66a548a8d) Thanks [@dgesteves](https://github.com/dgesteves)! - Add `mcpName` to `package.json` so the server can be published to the official MCP Registry as `io.github.dgesteves/design-system-mcp`.
