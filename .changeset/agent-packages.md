---
'onsystem': minor
---

onsystem is packaged for more agents, each pinned to the same release: `npx skills add dgesteves/onsystem` installs the skill in any agent with Agent Skills; an Agent Plugins 1.0 package (`plugins/onsystem-agent`, for GitHub Copilot CLI and other clients of the standard) and a Cursor plugin (`plugins/onsystem-cursor`) carry the MCP server and the skill; and Codex and VS Code install the plugin from the same marketplace as Claude Code. The skill has one source, copied into each package by `scripts/sync-plugins.mjs`, and a test fails when a copy drifts. The skill no longer says every agent has the Claude Code hook.
