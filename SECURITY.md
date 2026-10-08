# Security

## Reporting a vulnerability

Report it privately through [GitHub's private vulnerability reporting](https://github.com/dgesteves/design-system-mcp/security/advisories/new), not in a public issue. Include the version, how the server or CLI was run, and the smallest project or input that shows the problem. Fixes ship as a patch release of the latest version, with an advisory once users can upgrade.

## What the tool trusts

- The server runs locally over stdio, opens no ports and makes no network requests of its own. `npx` downloads the package from npm when the client starts it.
- It reads files under the project root (components, tokens, docs, `tsconfig`, `tailwind.config`) and the workspace packages they point at, and writes only its cache, in `node_modules/.cache/design-system-mcp` or the system temp folder, and the baseline file when you run `check --update-baseline`.
- `check_ui` with a `path` reads only files inside the project root, symlinks resolved, and limits input size.
- A `design-system-mcp.config.ts`, `.mjs` or `.js` file is imported, so it runs as code, like an ESLint config. A `tailwind.config` is parsed, never run. Treat the config file like any other code in the repository.
- The Claude Code plugin's hook runs the project's own install of the CLI when there is one, else `npx`.

Reports about any of these boundaries are welcome.
