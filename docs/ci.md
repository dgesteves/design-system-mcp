# CI and baselines

The check that holds an agent's edit in Claude Code also gates every pull request, whoever or whatever wrote it. `onsystem check` runs the same rules as `check_ui` and exits 1 on errors (or on more than `--max-warnings` warnings). It skips the design system's own component files, the ones `components` matches: they implement the scale and the primitives the rules enforce, so a fresh shadcn/ui project's `p-[3px]` is not a finding. `--include-design-system`, or `"includeDesignSystem": true` in the config, lints them too.

In folders and globs, `check` also leaves out tests and stories (`*.test.tsx`, `*.spec.tsx`, `*.stories.tsx`; `--include-tests` checks them), what the config's `exclude` lists, and what git ignores (through `git check-ignore`, so nested `.gitignore` files count); a file named outright is always checked. A file that renders an image or an email is not checked, since tokens and classes don't apply there: one that imports `next/og`, `@vercel/og`, `satori` or `@react-email/*`, a Next.js `opengraph-image`, `twitter-image`, `icon` or `apple-icon` route, or a file in an `og` folder. The summary line counts what was left out.

Pin it as a dev dependency, so CI, the plugin's hook and everyone on the team run the same version:

```sh
npm install --save-dev onsystem
```

A GitHub Actions job, `.github/workflows/onsystem.yml`:

```yaml
name: Design system
on: pull_request
jobs:
  onsystem:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx onsystem check . --format github --require-design-system
```

Install the dependencies first: without them, the props of components that wrap a library (Radix, React Aria) are unknown, and `no-unknown-prop` skips those components ([troubleshooting](troubleshooting.md#components-show-0-props)). `--format github` prints workflow commands, so findings show up as annotations on the pull request. `--format json` prints the raw results. Run it from the app's folder in a monorepo (`working-directory: apps/web`); a workspace root is [not supported yet](troubleshooting.md#a-monorepo-root-finds-nothing).

When no components or no color tokens are found, `check` and `check_ui` say which rules could not run and link to the [configuration docs](configuration.md), so a clean result is not mistaken for a checked one. In CI, `--require-design-system` turns that into a failure (exit code 2), for when the design system moves and the globs stop matching.

## Adopting it in an existing codebase

An established app can start with hundreds of findings (midday's dashboard has about 1,300). Record them once and commit the file:

```sh
npx -y onsystem check "src/**/*.tsx" --update-baseline
# Baseline: 1,307 findings in 275 files → onsystem.baseline.json
```

From then on, `check` reads `onsystem.baseline.json` from the root whenever it exists and fails only on new findings: `No new problems in 504 files (1,307 in the baseline).` Entries are keyed by file, rule and the offending text with a count, not by line, so edits elsewhere in a file do not invalidate them, while a second `bg-[#f7f7f7]` where the baseline accepts one is reported. When findings get fixed, `check` says so and prints the command that drops them, which locks in the progress. Entries of a rule you turn off are kept rather than reported as fixed, a malformed baseline (a bad merge, say) is an error rather than something to overwrite, and paths are matched by their real spelling, so `APP/` on macOS or a linked checkout finds the same entries. `--ignore-baseline` shows everything, and `--baseline <file>` uses another path. The baseline applies to the CLI only: `check_ui` still shows an agent every finding in the file it is editing.
