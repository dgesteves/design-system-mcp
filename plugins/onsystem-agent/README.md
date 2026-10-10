# onsystem as an Agent Plugin

The [Agent Plugins 1.0](https://github.com/agentplugins/agent-plugins-spec) package of onsystem, for GitHub Copilot CLI and any other client of the standard. It keeps your agent on your React design system: it reads the project's real components, props, `cva` variants and design tokens, gives them to the agent before it writes UI, and checks what it writes against them.

## What it adds

- **An MCP server,** `onsystem` (`mcp.json`), with five read-only tools: `list_components`, `get_component`, `search_components`, `get_tokens` and `check_ui`.
- **A skill** (`skills/onsystem`) that tells the agent to look components and tokens up before writing UI and to fix every `check_ui` finding.

There is no hook: the format has none. The [Claude Code plugin](../onsystem) checks each edit as it happens; with other agents, add the [CI check](https://design-system-mcp-demo.vercel.app/docs/ci).

## What it runs

`npx -y onsystem@<version>`, the npm package pinned to this plugin's version. The format starts the server in the plugin's folder, not your project, so the server finds the project through the workspace roots the client reports. If your client reports none, add the server with the [MCP config for your client](https://design-system-mcp-demo.vercel.app/docs/clients) instead.

## What data it touches

Everything runs on your machine. The server reads the project's component files, stylesheets, token files, docs, `package.json`, `tsconfig` and config file, and writes only its cache. It makes no network requests and no model calls, needs no API key, and sends nothing anywhere; npx downloads the package from the npm registry the first time.

## Install

GitHub Copilot CLI:

```sh
copilot plugin install dgesteves/onsystem:plugins/onsystem-agent
```

Other clients: [Set up your agent](https://design-system-mcp-demo.vercel.app/docs/clients#plugins-for-other-agents).

The skill here is a copy of [the Claude Code plugin's](../onsystem/skills/onsystem/SKILL.md), made by `scripts/sync-plugins.mjs`: edit that one.
