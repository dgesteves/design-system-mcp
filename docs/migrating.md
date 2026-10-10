# Migrating from @dgesteves/design-system-mcp

`@dgesteves/design-system-mcp` is now `onsystem`. Version 0.4.0 is the first release under the new name; the old package stays at 0.3.3 and gets no new releases. The rules, their ids and defaults, the CLI flags and the output formats are the same, and the files you already have keep working until you rename them: each old name is still read, with a notice that says what to rename.

## What changed

| What                 | Before                                                         | Now                                                   |
| -------------------- | -------------------------------------------------------------- | ----------------------------------------------------- |
| npm package          | `@dgesteves/design-system-mcp`                                 | `onsystem`                                            |
| Command              | `design-system-mcp`                                            | `onsystem`                                            |
| Config file          | `design-system-mcp.config.json` (`.ts`, `.mts`, `.js`, `.mjs`) | `onsystem.config.json` (`.ts`, `.mts`, `.js`, `.mjs`) |
| Config schema        | `https://unpkg.com/@dgesteves/design-system-mcp/schema.json`   | `https://unpkg.com/onsystem/schema.json`              |
| Typed config import  | `import { defineConfig } from "@dgesteves/design-system-mcp"`  | `import { defineConfig } from "onsystem"`             |
| Baseline file        | `design-system-mcp.baseline.json`                              | `onsystem.baseline.json`                              |
| MCP server key       | `design-system`                                                | `onsystem`                                            |
| MCP Registry entry   | `io.github.dgesteves/design-system-mcp`                        | `io.github.dgesteves/onsystem`                        |
| Claude Code plugin   | `design-system@dgesteves`                                      | `onsystem@dgesteves`                                  |
| Plugin skill         | `/design-system:design-system`                                 | `/onsystem:onsystem`                                  |
| Repository           | `github.com/dgesteves/design-system-mcp`                       | `github.com/dgesteves/onsystem` (old links redirect)  |
| Cache folder         | `node_modules/.cache/design-system-mcp`                        | `node_modules/.cache/onsystem`                        |
| Hook's test override | `DESIGN_SYSTEM_MCP_BIN`                                        | `ONSYSTEM_BIN` (the old name still works)             |

## The package and CI

Swap the dev dependency, and use the new command in scripts and CI:

```sh
npm uninstall @dgesteves/design-system-mcp
npm install --save-dev onsystem
```

```yaml
- run: npx onsystem check . --format github --require-design-system
```

With pnpm, Yarn or Bun, use `pnpm remove` and `pnpm add -D`, `yarn remove` and `yarn add -D`, or `bun remove` and `bun add -d`.

## Config and baseline files

Rename them, and point `$schema` at the new URL:

```sh
git mv design-system-mcp.config.json onsystem.config.json
git mv design-system-mcp.baseline.json onsystem.baseline.json
```

Until you do, `check`, `inspect` and the server read the old names and print a notice once per run (a warning annotation with `--format github`). `check --update-baseline` updates an old-name baseline where it is rather than writing a second file. When both names exist, the new one is read and the notice says to delete the old one.

A `.ts`, `.mts`, `.js` or `.mjs` config that imports `defineConfig` from `@dgesteves/design-system-mcp` needs the import changed to `onsystem`; if the old package is no longer installed, the error says so.

## The Claude Code plugin

The plugin moved from `design-system` to `onsystem` in the same `dgesteves` marketplace. Remove the old one, refresh the marketplace, and install the new one:

```text
/plugin uninstall design-system@dgesteves
/plugin marketplace update dgesteves
/plugin install onsystem@dgesteves
```

New installs add the marketplace with `/plugin marketplace add dgesteves/onsystem`; a marketplace added from the old repository name keeps working, since GitHub redirects it. The plugin now runs an exact version of the package (`onsystem@0.4.0` for 0.4.0) instead of a range, and moves to each new release with the plugin.

## Other MCP clients

Rename the server's key and the package in its entry. For example, in `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "onsystem": {
      "command": "npx",
      "args": ["-y", "onsystem", "--root", "${workspaceFolder}"]
    }
  }
}
```

The key is part of each tool's name in most clients, so `mcp__design-system__check_ui` becomes `mcp__onsystem__check_ui`. Update any permission allowlists that name the old tools, and any line in `CLAUDE.md`, `AGENTS.md` or `.cursor/rules` that mentions the design-system tools. The [setup guide](https://design-system-mcp-demo.vercel.app/docs/clients) has the entry for every client.

## Clean up

The old cache folder is no longer used and can be deleted:

```sh
rm -rf node_modules/.cache/design-system-mcp
```
