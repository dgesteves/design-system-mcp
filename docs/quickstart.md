# Quickstart

No config is needed in a shadcn/ui project (Tailwind v3 or v4), an app whose components live in a workspace package, or the design-system package itself ([how it finds them](configuration.md#zero-config)). Other layouts take a [config file](configuration.md#config-file). It needs Node.js 20.19 or later. Run it from the app's folder, or from a [monorepo root](configuration.md#monorepo-roots), where it finds every app and design-system package and checks each file against its own project.

**1. See what it found**, from the app's folder or the monorepo root:

```sh
npx -y onsystem inspect
```

It lists the components with their props, variants and parts, and the tokens by category. `inspect --explain` adds every place it looked and why each was taken or not, the config it resolved to, tokens that did not resolve and components whose props did not. If the list is empty, see [troubleshooting](troubleshooting.md#inspect-found-nothing).

To keep what it found in a file you can edit, run `npx -y onsystem init`: it writes `onsystem.config.json` from it (or asks where the components and tokens are when it found nothing), checks the project once and offers to record the findings as a baseline. `--yes` answers for you.

**2. Hold your agent to it.** Pick one:

- **Claude Code**: install the [plugin](plugin.md). Its hook checks every UI file Claude writes and hands the errors back before Claude moves on; it also brings the MCP server and a skill that has Claude look components up first.

  ```text
  /plugin marketplace add dgesteves/onsystem
  /plugin install onsystem@dgesteves
  ```

- **Cursor or VS Code**: use the [one-click install links](clients.md#cursor-and-vs-code), or commit the config there to the repository.
- **Any other MCP client**: run `npx -y onsystem` as a stdio server. There are [configs for Claude Desktop, Codex CLI, GitHub Copilot CLI, Windsurf, JetBrains IDEs, Zed, Gemini CLI and Grok Build](clients.md#other-clients).

**3. Try it.** Ask your agent for some UI, such as _"Add a danger-zone card to the settings page."_ It looks the components, variants and tokens up before writing and runs `check_ui` on the result. In Claude Code the skill loads by itself for UI work (or run `/onsystem:onsystem`), and the hook checks each file as it is written.

**4. Gate your pull requests.** Install it as a dev dependency, record the findings the codebase already has, and fail CI only on new ones:

```sh
npm install --save-dev onsystem
npx onsystem check . --update-baseline   # writes onsystem.baseline.json: commit it
```

```yaml
- run: npx onsystem check . --format github --require-design-system
```

`check .` lints every `.tsx` and `.jsx` file under the folder, whatever the layout, and leaves out the design system's own components, tests and stories, and what git ignores. [CI and baselines](ci.md) has the whole workflow.
