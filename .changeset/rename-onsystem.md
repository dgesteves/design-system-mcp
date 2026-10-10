---
'onsystem': minor
---

`@dgesteves/design-system-mcp` is now `onsystem`, and this is its first release under that name. Everything that had the old name moves, and what you already have keeps working until you rename it ([migration guide](https://design-system-mcp-demo.vercel.app/docs/migrating)):

- **Package and command:** `npm install --save-dev onsystem`, `npx onsystem check .`. The old package gets no new releases.
- **Config file:** `onsystem.config.json` (or `.ts`, `.mts`, `.js`, `.mjs`). A `design-system-mcp.config.*` is still read, with a notice that says how to rename it; the schema is at `https://unpkg.com/onsystem/schema.json`, and a code config imports `defineConfig` from `onsystem`.
- **Baseline:** `onsystem.baseline.json`. A `design-system-mcp.baseline.json` is still read and updated where it is, with the same notice.
- **MCP:** the server calls itself `onsystem`, and the documented client configs use `onsystem` as the server's key, so tools appear as `mcp__onsystem__check_ui` and the like. The MCP Registry entry is `io.github.dgesteves/onsystem`.
- **Claude Code plugin:** the plugin is `onsystem` in the same `dgesteves` marketplace, and it runs an exact version of the package (`onsystem@<version>`) rather than a range. Replace the old one with `/plugin uninstall design-system@dgesteves`, `/plugin marketplace update dgesteves` and `/plugin install onsystem@dgesteves`. The skill is `/onsystem:onsystem`.
- **Smaller things:** the cache moved to `node_modules/.cache/onsystem`, log lines start with `[onsystem]`, GitHub annotations are titled `onsystem`, and the hook's test override is `ONSYSTEM_BIN` (`DESIGN_SYSTEM_MCP_BIN` still works, with a notice).
