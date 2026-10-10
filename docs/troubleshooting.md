# Troubleshooting

Most problems show up in `npx onsystem inspect`, run from the app's folder: it prints the root, the config it read, how it found the design system (`detected`), and every component and token category it extracted. Start there.

## inspect found nothing

`inspect` prints `Components (0 + 0 parts)`, or `check` says `No design system found (no components or color tokens)`.

1. **Run it from the app's folder**, the one with the app's `package.json` and, in a shadcn/ui project, `components.json`. At a monorepo root it finds nothing: see the [next section](#a-monorepo-root-finds-nothing).
2. **Read the `detected` line.** It says how the components were found. With no `detected` line, none of the [zero-config layouts](configuration.md#zero-config) matched: a `components.json`, a design-system package's `exports`, a workspace dependency named like a design system (`@acme/ui`), or a flat `src/` of components that wrap a primitives library.
3. **Point at them with a config file.** An `onsystem.config.json` in the app's folder with a `components` glob is enough; add `tokens` when the stylesheet is not one of the default paths:

   ```json
   {
     "$schema": "https://unpkg.com/onsystem/schema.json",
     "components": ["src/ui/**/*.tsx"],
     "tokens": ["src/styles/theme.css"]
   }
   ```

4. **`Tokens (0)`, or `No color tokens found`,** means no stylesheet or `*.tokens.json` defined any. Set `tokens` in the config to the file with the custom properties or the Tailwind `@theme`.

In CI, `check --require-design-system` turns "nothing found" into a failure (exit code 2), so a moved design system cannot pass by checking nothing.

## A monorepo root finds nothing

Zero config looks for the design system from the folder it starts in. At a workspace root there is usually no `components.json`, and the root package is not a design system, so `inspect` lists no components, `check .` has nothing to compare against, and `list_components` answers `No components found`. On Documenso, Dub and openstatus, `inspect` at the root finds 0 components; from `apps/remix`, Documenso's `@documenso/ui` comes back with 99.

Monorepo root mode is not supported yet. Run from the app's folder instead:

```sh
cd apps/web
npx onsystem inspect
npx onsystem check .
```

- **CI:** set `working-directory: apps/web` on the step, or `cd` into it.
- **MCP clients:** pass the app's folder as `--root` (`"args": ["-y", "onsystem", "--root", "/absolute/path/to/apps/web"]`), or open the app's folder in the editor.
- **Claude Code:** the hook already works from the root, since it finds the project from each edited file. The plugin's MCP server starts in the folder Claude Code was started in, so start Claude Code in the app's folder for the tools to find the components.

## Components show 0 props

`inspect` lists components that wrap a library, such as a Radix `Dialog` or `DropdownMenu`, with `0 props`, and `no-unknown-prop` never reports on them.

Their props come from the types of the packages they wrap, so they resolve only when the project's dependencies are installed. Without `node_modules`, extraction marks those props as open rather than guess, and `no-unknown-prop` skips the component. `inspect` does not warn about it yet. On a checkout of Vercel's chatbot without its dependencies, `Dialog`, `DropdownMenu` and `Popover` show 0 props; in the demo, with them, `Dialog` has 5.

Install the dependencies (`npm install`, `pnpm install`, …) before running `inspect`, `check` or the server, and in CI before `check` (`npm ci`). If the counts still show 0, run once with `--no-cache`.

## A min-release-age policy blocks npx

The Claude Code hook says once that `onsystem could not check …: npm found no version of onsystem@<version> it may install (ENOVERSIONS)`, or `npx onsystem` fails with `ENOVERSIONS`.

npm's `min-release-age` (a number of days, usually in `.npmrc`) makes npm and npx install only versions published longer ago than that. pnpm's `minimumReleaseAge` does the same for pnpm, in minutes, and defaults to a day from pnpm 11. The plugin runs the exact version it was released with, so for the first days after a release that version can be too new for the policy; `npx onsystem` without a version takes the newest version that is old enough.

- **Install it in the project** as a dev dependency. The hook and CI then run that copy, which your lockfile pins, instead of npx: `npm install --save-dev onsystem`.
- **With pnpm,** exempt it: `minimumReleaseAgeExclude: [onsystem]` in `pnpm-workspace.yaml` (pnpm 10.16 or later).
- **For one command,** override the setting: `npx --min-release-age=0 onsystem check .`.
- **Or wait** until the release is older than the policy's limit.

## Still stuck

Open an [issue](https://github.com/dgesteves/onsystem/issues/new/choose) with the output of `npx onsystem inspect`, the smallest snippet that shows the problem, and the version (`npx onsystem --version`). False positives are the reports that help most.
