# @dgesteves/design-system-mcp

## 0.3.1

### Patch Changes

- [#27](https://github.com/dgesteves/design-system-mcp/pull/27) [`4f5d1e6`](https://github.com/dgesteves/design-system-mcp/commit/4f5d1e639c639ab733da166fc880e3808f0b9d61) Thanks [@dgesteves](https://github.com/dgesteves)! - `check`, `check_ui` and `checkSource` no longer throw on code nested thousands of levels deep. The analysis walks the syntax tree with an explicit stack, so deep chains are still checked, and code too deep for TypeScript's parser comes back as a single `syntax` error ("nested too deeply to parse") instead of failing the run or the tool call.

- [#32](https://github.com/dgesteves/design-system-mcp/pull/32) [`08b02e8`](https://github.com/dgesteves/design-system-mcp/commit/08b02e88a7437c22cf024237e9c083a84a8ba17a) Thanks [@dgesteves](https://github.com/dgesteves)! - Zero config finds a flat `src/` of components that wrap a primitives library, the way React Aria's Tailwind starter ships them (`src/Button.tsx`, `src/Checkbox.tsx`), which used to need a config file. It is conservative: it needs a dependency on React Aria, Radix, Base UI, Headless UI or Ark UI, no app entry or route folder in `src/`, and at least five PascalCase files there, four in five of which import that library. Projects detected another way are unaffected.

- [#31](https://github.com/dgesteves/design-system-mcp/pull/31) [`403f4a7`](https://github.com/dgesteves/design-system-mcp/commit/403f4a72abe89c35af326a11bf3b1b1c75fc6c3f) Thanks [@dgesteves](https://github.com/dgesteves)! - Accurate `get_component` contracts for React Aria Components design systems. Boolean `tv()` keys that style a render state (`isDisabled`, `isPending`, `isSelected`) are no longer listed as variants, so those props keep their own type and JSDoc, and a variant declared by two linked definitions is listed once. The inherited-props summary of a React Aria component names `onPress`, `onChange`, `isDisabled`, `isRequired` and the like instead of `onClick`, and leaves out props marked `@deprecated`. A container defined next to its item (`CheckboxGroup` beside `Checkbox`) is no longer listed as one of its parts.

- [#29](https://github.com/dgesteves/design-system-mcp/pull/29) [`507ba5e`](https://github.com/dgesteves/design-system-mcp/commit/507ba5e3c0bc0660c1babc139715869deb27a2e1) Thanks [@dgesteves](https://github.com/dgesteves)! - Render props and style functions are checked. `icon-button-accessible-name` judges a function child (`<Button>{({ isPending }) => <Trash2 />}</Button>`, as in React Aria Components) by what it returns, across every `return` and branch. The color, spacing and radius rules read `style={({ isPressed }) => ({ ... })}` like a style object, and check each branch of a conditional style value (`isPressed ? "#ef4444" : undefined`).

- [#30](https://github.com/dgesteves/design-system-mcp/pull/30) [`e59ef9f`](https://github.com/dgesteves/design-system-mcp/commit/e59ef9f85f55d42e2031030a23850f6e6317479d) Thanks [@dgesteves](https://github.com/dgesteves)! - Better suggestions. `no-unknown-prop` maps equivalent props in either direction to the one the component takes: `checked` → `isSelected`, `open` → `isOpen` and `disabled` → `isDisabled` on React Aria Components, and the reverse on Radix and native elements. In a project without a path alias, the import in a finding is relative to the checked file (`../ui/Button` from `src/pages/`) rather than to the project root.

## 0.3.0

### Minor Changes

- [#13](https://github.com/dgesteves/design-system-mcp/pull/13) [`a7b5a90`](https://github.com/dgesteves/design-system-mcp/commit/a7b5a906a13ea57abb21eef8bfa2572b530fa4b0) Thanks [@dgesteves](https://github.com/dgesteves)! - Say when there is no design system to check against. When no components or no color tokens are found, `check` and `check_ui` now say which rules could not run and link to the configuration docs ("No design system found (no components or color tokens): only the accessibility rule ran."), so a clean result is not mistaken for a checked one. The notice goes after the summary in the terminal, to stderr with `--format json`, as a workflow warning with `--format github`, and into `check_ui`'s text and a `notice` field. `check --require-design-system` exits 2 in that case, for CI. `--quiet-without-design-system` still prints nothing; passing both is a usage error.

- [#13](https://github.com/dgesteves/design-system-mcp/pull/13) [`80f9a79`](https://github.com/dgesteves/design-system-mcp/commit/80f9a79930207df55ea7f0c0fdcccc48fa7a4c98) Thanks [@dgesteves](https://github.com/dgesteves)! - Find a workspace UI package that apps import by path. A dependency named like a design system with no `exports`, such as Documenso's `@documenso/ui` (`main: ./index.ts` with `export {}`, imported as `@documenso/ui/primitives/button`), used to be skipped. Its components are now the files the app's code imports, each suggested with the specifier the app uses, a folder imported through its index counts as a barrel, and a stylesheet the app imports from the package is read as its theme. `importPath` also takes a pattern for such packages: `"@acme/ui/{path}"` suggests `primitives/button.tsx` as `@acme/ui/primitives/button`.

- [#15](https://github.com/dgesteves/design-system-mcp/pull/15) [`323aaa2`](https://github.com/dgesteves/design-system-mcp/commit/323aaa28034b7c6d8c3c08921c29ea55009d14bf) Thanks [@dgesteves](https://github.com/dgesteves)! - `check` skips the design system's own component files, the ones `components` matches. They implement the scale and the primitives the rules enforce, so a fresh shadcn/ui project failed its first CI run on shadcn's own `p-[3px]`, `rounded-[2px]` and combobox buttons. The summary says how many were skipped, and a run that matches only design-system files exits 0 with "Nothing to check". `--include-design-system`, or `"includeDesignSystem": true` in the config, lints them too. The Claude Code hook follows suit: an edit to `components/ui/button.tsx` is not linted.

- [#11](https://github.com/dgesteves/design-system-mcp/pull/11) [`99bc8f4`](https://github.com/dgesteves/design-system-mcp/commit/99bc8f4beef7592c5d7b882ba5758c1bb9c97690) Thanks [@dgesteves](https://github.com/dgesteves)! - Support Tailwind v3 color tokens, the format of every shadcn/ui project before Tailwind v4. Bare HSL channels such as `--border: 214.3 31.8% 91.4%` are now read as colors; they used to be filed under `other`, which turned color checks off or pointed every finding at the few tokens in another format. Class names come from the `colors` in `tailwind.config.*` (the one `components.json` names, else the root's) and the presets it imports from the project, read without running it, or from shadcn/ui's names when those cannot be read. Fixes are `bg-border` rather than `bg-[var(--border)]`, which is invalid CSS when the variable holds bare channels, and `hsl(var(--x))` where no class exists.

### Patch Changes

- [#13](https://github.com/dgesteves/design-system-mcp/pull/13) [`8eb2fb8`](https://github.com/dgesteves/design-system-mcp/commit/8eb2fb8abca231659d35935fc118efed5241783a) Thanks [@dgesteves](https://github.com/dgesteves)! - Clearer CLI errors and output.
  
  - A `--root` that does not exist is a one-line error with exit code 2 for `check` and `inspect`, instead of a stack trace with exit code 1 (or a successful `inspect` of nothing).
  - A `--root` holding a variable the client did not expand, such as `${workspaceFolder}`, is reported and ignored: the server falls back to the client's workspace roots or the working directory.
  - Config errors name what is wrong and the closest valid value: `Unknown rule "no-hardcoded-colors". Did you mean "no-hardcoded-color"?`, `Invalid severity "warning": use "off", "warn" or "error"`, and unknown keys and rule options likewise.
  - A token file named outright (in `--tokens` or the config's `tokens`, not a glob) that does not exist is an error that names it, instead of silently disabling the color rules.
  - `design-system-mcp help` works like `--help`, whose text now describes the detected `--components` default.
  - The summary counts the files with findings: `8 errors, 3 warnings in 1 of 2 files checked`.

- [#11](https://github.com/dgesteves/design-system-mcp/pull/11) [`0f35c3d`](https://github.com/dgesteves/design-system-mcp/commit/0f35c3dfae27d33cbef3552ca1ab7fb95d7c9c3c) Thanks [@dgesteves](https://github.com/dgesteves)! - Attach a CSS comment to the variable it describes. A comment after a declaration on the same line (`--background: 0 0% 100%; /* white */`) was read as the description of the next variable, so `foreground` was described as "white".

- [#15](https://github.com/dgesteves/design-system-mcp/pull/15) [`fcc24f4`](https://github.com/dgesteves/design-system-mcp/commit/fcc24f4d904198939d4e6eb7711d6f3c9ebf7468) Thanks [@dgesteves](https://github.com/dgesteves)! - Fix false positives and missing hints found on fresh shadcn/ui projects and Inbox Zero.
  
  - `icon-button-accessible-name` judges a button passed as Base UI's `render` (`<Dialog.Close render={<Button size="icon" />}>`) by its host's children and label, and skips buttons that are `hidden` or `aria-hidden`, or inside hidden content.
  - `no-hardcoded-color` reads `color` and similar attributes as colors on native and SVG elements. On components it skips props with known values and only reads hex and color functions, so `<Badge color="green">`, a cva variant, is no longer a hardcoded color.
  - `no-unknown-prop` explains `asChild` on a Base UI component (compose with `render={<Link />}`) and `render` on a Radix one (compose with `asChild`), instead of a bare "no prop" or a rename that would not work.
  - `prefer-design-system-component` prefers the component that renders the element, so `<select>` suggests `NativeSelect` rather than Radix's `Select` when the project has both.

- [#11](https://github.com/dgesteves/design-system-mcp/pull/11) [`0f68acb`](https://github.com/dgesteves/design-system-mcp/commit/0f68acb033506a12796822d08044ba4115298057) Thanks [@dgesteves](https://github.com/dgesteves)! - Suggest the color token that fits, not just the nearest one. On a fresh shadcn/ui project, where many tokens share a value, `no-hardcoded-color` used to pick whichever came first: `text-gray-500` became `text-chart-2`, `bg-gray-100` became `bg-sidebar-accent`, and `bg-yellow-100` became a gray because it is 0.07 away.
  
  - Among the tokens close enough to swap in, the one made for the utility wins: `foreground` and `muted-foreground` for `text-*`, `fill-*` and `stroke-*`, surfaces such as `muted` for `bg-*`, and `border`, `input` and `ring` for `border-*` and `ring-*`.
  - A fix is only offered for a token of the same hue, or a gray for a gray. Otherwise the message says no token has that hue and names the nearest one.
  - `sidebar-*` and `chart-*` tokens are only suggested in a sidebar or a chart (by file name, enclosing component or classes), where they win ties.
  - `dark:` classes are compared with the tokens' dark-mode values, so `dark:bg-zinc-900` becomes `dark:bg-card` rather than a token that is light in dark mode.
  - `get_tokens` and `ds://tokens` list core tokens before `sidebar-*` and `chart-*`.

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
