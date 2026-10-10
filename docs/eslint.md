# ESLint plugin

The same rules as an ESLint plugin, for ESLint 9 and 10 with a flat config, so the design system is enforced in every editor and CI job that already runs ESLint, and travels with shared configs and presets.

```sh
npm install --save-dev onsystem
```

Add the recommended config at the end of `eslint.config.mjs`:

```js
import onsystem from 'onsystem/eslint';

export default [
  // ...your config, such as eslint-config-next's or typescript-eslint's
  onsystem.configs.recommended,
];
```

The recommended config turns every rule on at its [default severity](rules.md) for `.tsx` and `.jsx` files, leaving out tests and stories as `check` does. It sets no parser: the TypeScript parser your config already uses parses the files (eslint-config-next and typescript-eslint both bring one). A config without one adds it:

```js
import tsParser from '@typescript-eslint/parser';
import onsystem from 'onsystem/eslint';

export default [
  { files: ['**/*.{ts,tsx}'], languageOptions: { parser: tsParser } },
  onsystem.configs.recommended,
];
```

## How it checks

Each file is checked as `onsystem check` checks it, with zero config in a shadcn/ui app:

- against the design system of its project, the nearest folder with a config, a `components.json` or a `package.json`, found from where ESLint runs; from a [monorepo root](configuration.md#monorepo-roots), each file gets its own project's design system,
- with that project's config: rules set to `off` in `rules` or in `overrides` for some files stay off,
- with the `// onsystem-disable-*` [suppression comments](rules.md#suppressing-findings), next to ESLint's own `eslint-disable` comments,
- leaving out what `check .` leaves out: the files the config's `exclude` lists, the design system's own components, and files that render an image or an email.

Findings have the same messages, positions and fixes as `check`, and `eslint --fix` applies the fixes. ESLint's config sets each rule's severity (`'onsystem/no-hardcoded-spacing': 'error'`). The [real-world corpus](how-it-works.md#on-real-codebases) also runs through the plugin (`pnpm corpus eslint`): on every one of its runs, it reports exactly the findings `check` reports.

When the project root or the config is not where it would be found from ESLint's working directory, say where in the settings, as `--root` and `--config` do:

```js
export default [
  onsystem.configs.recommended,
  { settings: { onsystem: { root: 'apps/web', config: 'apps/web/onsystem.config.json' } } },
];
```

The plugin loads each design system once, in a worker thread (ESLint rules run synchronously and extraction does not), and looks at its files again at most every two seconds, so an editor's ESLint server picks up a new component or variant without a restart.

A few things stay with the CLI. The [baseline](ci.md#adopting-it-in-an-existing-codebase) applies to `check` only; with ESLint, use its own suppressions or `--max-warnings`. ESLint reports syntax errors itself. Which files ESLint lints is up to its config (`ignores`), where `check` leaves out what git ignores.

## With @shadcn/lint

[@shadcn/lint](https://github.com/shadcn-ui/lint) checks the Tailwind classes written against a component and the theme: restyling a component (`no-restyle`), classes Tailwind cannot generate (`no-unknown-classes`), class names it cannot read (`require-static-classes`), inline styles, raw colors and arbitrary values. onsystem checks that the components, props and variant values exist, flags native elements the design system has a component for and icon-only buttons without a name, and suggests the nearest token for a hardcoded color, spacing or radius. They overlap on raw colors and arbitrary values, so turn one side off there, or `p-[13px]` is reported twice:

```js
import { plugin as shadcn } from '@shadcn/lint';
import tsParser from '@typescript-eslint/parser';
import { defineConfig } from 'eslint/config';
import onsystem from 'onsystem/eslint';

export default defineConfig([
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { shadcn },
    rules: {
      'shadcn/no-restyle': 'error',
      'shadcn/no-unknown-classes': 'error',
      'shadcn/require-static-classes': 'error',
    },
  },
  // Raw colors and arbitrary values: onsystem's rules, which suggest the nearest token.
  onsystem.configs.recommended,
]);
```

To keep @shadcn/lint's `no-raw-colors` and `no-arbitrary-values` instead, turn off `onsystem/no-hardcoded-color`, `onsystem/no-hardcoded-spacing` and `onsystem/no-hardcoded-radius`. @shadcn/lint needs Tailwind v4; onsystem's rules also run on Tailwind v3.
