# Set up your agent

The server speaks MCP over stdio, in both protocol eras: the 2026-07-28 revision (stateless, with `server/discover`) and the 2025 one (the `initialize` handshake), the era chosen by the client's first message. It finds the project from `--root`, a config file in the working directory, or the working directory itself when it holds a project (a `package.json` or `components.json`). MCP roots, which 2026-07-28 deprecates, are the fallback: when the working directory is none of those (Claude Desktop starts servers in `/`), a 2025-era client that reports roots has its first `file://` root used; otherwise it is the working directory. Started at a [monorepo root](configuration.md#monorepo-roots), it serves every app and design-system package in it: the tools take the `path` of the file the agent is editing and answer for that file's project.

Every client gets the same five tools, including `check_ui`, which the agent runs on its own output. Only Claude Code has a hook that checks each edit as it happens, so there use the [plugin](plugin.md) instead; with other agents, add the [CI check](ci.md) so what the agent skips still gets caught.

## Cursor and VS Code

One click installs it: [Install in Cursor](https://cursor.com/en/install-mcp?name=onsystem&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm9uc3lzdGVtIiwiLS1yb290IiwiJHt3b3Jrc3BhY2VGb2xkZXJ9Il19) or [Install in VS Code](https://insiders.vscode.dev/redirect/mcp/install?name=onsystem&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22onsystem%22%5D%7D). To share it with the team, commit the config instead:

<details open>
<summary><strong>Cursor</strong></summary>

`.cursor/mcp.json`:

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

</details>

<details open>
<summary><strong>VS Code (Copilot agent mode)</strong></summary>

`.vscode/mcp.json`:

```json
{
  "servers": {
    "onsystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "onsystem", "--root", "${workspaceFolder}"]
    }
  }
}
```

</details>

A client that passes `${workspaceFolder}` through unexpanded gets a warning on stderr, and the server falls back to its working directory, or the roots the client reports when that holds no project.

## Other clients

Every client runs the same stdio command. Replace `/absolute/path/to/app` with the app's folder; the server also finds the project without `--root` when the client starts it in the project folder, or reports the folder as a root.

<details>
<summary><strong>Claude Desktop</strong></summary>

Settings → Developer → Edit Config opens `claude_desktop_config.json` (`~/Library/Application Support/Claude/` on macOS, `%APPDATA%\Claude\` on Windows):

```json
{
  "mcpServers": {
    "onsystem": {
      "command": "npx",
      "args": ["-y", "onsystem", "--root", "/absolute/path/to/app"]
    }
  }
}
```

Restart Claude Desktop after saving.

</details>

<details>
<summary><strong>Codex CLI</strong></summary>

```sh
codex mcp add onsystem -- npx -y onsystem --root /absolute/path/to/app
```

or in `~/.codex/config.toml`:

```toml
[mcp_servers.onsystem]
command = "npx"
args = ["-y", "onsystem", "--root", "/absolute/path/to/app"]
```

</details>

<details>
<summary><strong>GitHub Copilot CLI</strong></summary>

```sh
copilot mcp add onsystem -- npx -y onsystem --root /absolute/path/to/app
```

That writes `~/.copilot/mcp-config.json`:

```json
{
  "mcpServers": {
    "onsystem": {
      "type": "local",
      "command": "npx",
      "args": ["-y", "onsystem", "--root", "/absolute/path/to/app"],
      "tools": ["*"]
    }
  }
}
```

In a session, `/mcp show onsystem` lists its tools.

</details>

<details>
<summary><strong>Windsurf (Devin Desktop)</strong></summary>

Windsurf is now Devin Desktop, and its agent reads the Devin CLI's MCP config: `~/.config/devin/mcp_config.json` (`%APPDATA%\devin\mcp_config.json` on Windows), or `.devin/mcp_config.json` in the repository to share it with the team:

```json
{
  "mcpServers": {
    "onsystem": {
      "command": "npx",
      "args": ["-y", "onsystem", "--root", "/absolute/path/to/app"]
    }
  }
}
```

From the terminal, `devin mcp add onsystem -- npx -y onsystem --root /absolute/path/to/app` adds the same entry.

</details>

<details>
<summary><strong>JetBrains IDEs (AI Assistant and Junie)</strong></summary>

For AI Assistant, open Settings → Tools → AI Assistant → Model Context Protocol (MCP), click Add, choose STDIO and paste:

```json
{
  "mcpServers": {
    "onsystem": {
      "command": "npx",
      "args": ["-y", "onsystem", "--root", "/absolute/path/to/app"]
    }
  }
}
```

Set the server level to the project to run it only there. Junie reads the same format from `.junie/mcp/mcp.json` in the project, or `~/.junie/mcp/mcp.json` for every project.

</details>

<details>
<summary><strong>Zed</strong></summary>

In Zed's `settings.json`:

```json
{
  "context_servers": {
    "onsystem": {
      "command": "npx",
      "args": ["-y", "onsystem", "--root", "/absolute/path/to/app"],
      "env": {}
    }
  }
}
```

</details>

<details>
<summary><strong>Gemini CLI</strong></summary>

`.gemini/settings.json` in the project, or `~/.gemini/settings.json` for every project:

```json
{
  "mcpServers": {
    "onsystem": {
      "command": "npx",
      "args": ["-y", "onsystem", "--root", "/absolute/path/to/app"]
    }
  }
}
```

</details>

<details>
<summary><strong>Grok Build</strong></summary>

```sh
grok mcp add onsystem -- npx -y onsystem --root /absolute/path/to/app
```

or in `~/.grok/config.toml` (`--scope project` writes `.grok/config.toml` in the repository instead):

```toml
[mcp_servers.onsystem]
command = "npx"
args = ["-y", "onsystem", "--root", "/absolute/path/to/app"]
```

`grok mcp doctor onsystem` starts it and lists its tools. Grok Build also reads a project's `.mcp.json` once you trust the folder.

</details>

<details>
<summary><strong>Claude Code without the plugin</strong></summary>

Use this instead of the plugin, not next to it: both register the same tools.

```sh
claude mcp add onsystem -- npx -y onsystem
```

To share it with your team, add `--scope project`, which writes `.mcp.json` at the repository root:

```json
{
  "mcpServers": {
    "onsystem": {
      "command": "npx",
      "args": ["-y", "onsystem"]
    }
  }
}
```

</details>

Any other MCP client: run `npx -y onsystem --root /absolute/path/to/app` as a stdio server. On native Windows, wrap it as `cmd /c npx ...`.

The server sends usage instructions in its `initialize` result and in `server/discover`. Clients that ignore them benefit from one line in `CLAUDE.md`, `AGENTS.md` or `.cursor/rules`: _"Before writing UI, use the onsystem tools. Run check_ui on every file you change and fix all errors."_
