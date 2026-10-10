# Claude Code plugin

The plugin is the fastest way to keep Claude on your design system. It bundles three things:

- **A hook** that runs `onsystem check` on every `.tsx` or `.jsx` file Claude writes or edits, and hands the errors back so they get fixed in the same turn instead of in review.
- **The MCP server**, so Claude can look components, props, variants and tokens up before it writes.
- **A skill** that tells Claude to do that, and to fix every `check_ui` finding. It loads by itself for UI work, or run `/onsystem:onsystem`.

```text
/plugin marketplace add dgesteves/onsystem
/plugin install onsystem@dgesteves
```

## What Claude sees when it invents something

```text
⏺ Write(app/promo/page.tsx)
  ⎿  PostToolUse hook: app/promo/page.tsx breaks the project's design system
     1:58 error [no-hardcoded-color] Hardcoded color `bg-[#f5f5f5]` → `bg-muted`.
     1:77 error [prefer-design-system-component] Native <button> where the design system has <Button>.
     …
⏺ The hook flagged five issues. Looking up Button and the color tokens before fixing.
⏺ onsystem - get_component (MCP)(name: "Button")
⏺ Write(app/promo/page.tsx)   →   <Button variant="destructive"> on bg-muted, hook passes
```

## What the hook does

- **Errors come back to be fixed.** The hook runs after the file is written. It exits with Claude Code's blocking-error code, and the findings, each with its fix, go to Claude, which corrects the file before moving on.
- **Warnings don't.** They reach Claude as a note, without blocking.
- **Only what Claude just changed.** After an Edit it lists the findings on the edited lines and only counts older ones. It honours a [baseline](ci.md#adopting-it-in-an-existing-codebase).
- **Quiet where there is nothing to check.** It stays silent in projects without design-system components (tokens alone don't count), so installing the plugin for every project is safe.
- **The design system's own files are left alone.** Like `check`, it skips them: an edit to `components/ui/button.tsx` changes the design system, which is a call for you and your reviewers rather than a lint error.
- **It says when it can't check.** When the CLI can't run (npx can't fetch it because of a [min-release-age policy](troubleshooting.md#a-min-release-age-policy-blocks-npx), a private registry or no network, or the config is broken), it says so once per session and project, as a message to you, and never blocks the edit.
- **Monorepos work.** It finds the project from the edited file, not from where Claude started.

## What it runs, and what it touches

The hook and the server run the `onsystem` package at the plugin's exact version: the project's own install when there is one (`npm install --save-dev onsystem`), else `npx`. Both run through Node.js directly, never a shell. They read the project's files and write only the cache (`node_modules/.cache/onsystem`, or the system temp folder) and a marker file in the system temp folder so the hook's notice is shown once. There are no network requests and no model calls; the only network access is npx fetching the package from the npm registry.

## Coming from the design-system plugin

The plugin was called `design-system` before 0.4.0. Replace it:

```text
/plugin uninstall design-system@dgesteves
/plugin marketplace update dgesteves
/plugin install onsystem@dgesteves
```

If you added the server with `claude mcp add` as well, remove that entry (`claude mcp remove onsystem`, or `claude mcp remove design-system` from before the rename) to avoid two copies of the tools. The [migration guide](migrating.md) lists everything else that moved.
