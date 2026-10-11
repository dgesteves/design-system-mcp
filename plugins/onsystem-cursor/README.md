# onsystem for Cursor

The Cursor plugin of onsystem. It keeps Cursor's agent on your React design system: it reads the project's real components, props, `cva` variants and design tokens, gives them to the agent before it writes UI, and checks what it writes against them.

## What it adds

- **An MCP server,** `onsystem` (`mcp.json`), with five read-only tools: `list_components`, `get_component`, `search_components`, `get_tokens` and `check_ui`.
- **A skill** (`skills/onsystem`) that tells the agent to look components and tokens up before writing UI and to fix every `check_ui` finding.

The [Claude Code plugin](../onsystem) also checks each edit with a hook; in Cursor, add the [CI check](https://onsystem.vercel.app/docs/ci) so what the agent skips still gets caught.

## What it runs

`npx -y onsystem@<version>`, the npm package pinned to this plugin's version. The server finds the project from its working directory, or from the workspace roots Cursor reports.

## What data it touches

Everything runs on your machine. The server reads the project's component files, stylesheets, token files, docs, `package.json`, `tsconfig` and config file, and writes only its cache. It makes no network requests and no model calls, needs no API key, and sends nothing anywhere; npx downloads the package from the npm registry the first time.

## Install

Until it is listed in the Cursor Marketplace, copy this folder to `~/.cursor/plugins/local/onsystem` and run **Developer: Reload Window**. The repository root has the marketplace file (`.cursor-plugin/marketplace.json`) for a listing.

The skill and the icon here are copies of [the Claude Code plugin's](../onsystem), made by `scripts/sync-plugins.mjs`: edit those.
