# Contributing

Bug reports with a minimal snippet and the `inspect` output are the most useful contribution: most fixes start from one. For a change in behaviour, open an issue first so we can agree on it before you write it.

## Setup

Node.js 22.18 or later (24 in `.nvmrc`) and pnpm, which Corepack provides at the version `package.json` names:

```sh
corepack enable
pnpm install
```

## Checks

CI runs these on every pull request, in this order:

```sh
pnpm lint            # ESLint
pnpm format:check    # Prettier (pnpm format writes)
pnpm typecheck       # tsc --noEmit
pnpm build           # tsdown, then schema.json from the config schema
pnpm smoke           # the built server over stdio, every tool, against examples/shadcn-demo
pnpm test            # Vitest, on Node 22 and 24
```

`pnpm smoke` spawns `dist/cli.js` the way an MCP client does, so it catches what unit tests cannot: a broken build, a tool that fails over stdio, output that no longer parses. Run it after `pnpm build`; add `--verbose` to see every response. CI also runs `check` on the demo's clean page (it must pass) and the Claude Code hook on its draft (it must block).

Commit `schema.json` when `pnpm build` changes it, and `.github/assets/*.svg` when `pnpm assets` does: the hero image is rendered from real `check` output on the demo, so a changed message changes the picture.

## Adding a lint rule

1. Add the rule id to `RULE_IDS` and its default severity to `DEFAULT_SEVERITY` in `src/config.ts`.
2. Write the rule in `src/lint/rules/`: a `Rule` whose `run(context)` walks `context.analysis` (JSX elements, class strings, style objects) and calls `context.report()` with source offsets, a message that says what to write instead, and, when the change is mechanical, a `fix` of text edits. Resolve tags with `context.resolve(element)`; read tokens from `context.target.tokens`.
3. Register it in `RULES` in `src/lint/index.ts`.
4. Test it in `test/lint.test.ts` against code an agent would actually write. Use the demo (`check(code, rule)`), or a throwaway project built from realistic files with `fixture({ 'components/ui/button.tsx': …, 'app/globals.css': … })`; pass `{ nodeModules: true }` when the components need React or Radix types. Cover what it reports, the fix (`applyFixes`), and what it must leave alone. Files that must stay byte-for-byte, such as a stock shadcn/ui `globals.css`, go in `test/fixtures/`, which Prettier skips.
5. Add a row to the Rules table in the README, and run `pnpm build` so `schema.json` lists the new id.

The same pattern holds for a false positive: reproduce it as a failing test from the real code that triggered it, then fix it.

## Releasing

Releases use [Changesets](https://github.com/changesets/changesets). For any user-facing change, run `pnpm changeset`, pick patch or minor, and describe the change for someone upgrading. Docs-only and internal changes need none.

On merge to `main`, the release workflow opens a "chore: release" pull request: `changeset version` bumps `package.json` and writes `CHANGELOG.md`, and `scripts/sync-server-json.mjs` copies the version into `server.json` (MCP Registry), the Claude Code plugin's `plugin.json`, and the npm range the plugin runs. Merging that pull request publishes to npm with provenance. Do not edit `CHANGELOG.md` or those versions by hand.

## Pull requests

One change per pull request, with tests, a changeset when users will notice it, and the README updated when behaviour changes. Keep messages, docs and README in the same plain voice: say what happens and what to do, without filler.
