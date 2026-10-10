---
'onsystem': minor
---

`inspect --explain` says why, and `init` writes the config.

- **`inspect --explain`** prints every candidate zero config looked at (`components.json`, the package's `exports`, each dependency named like a design system, a flat `src/`) and why it was taken or turned down (`the ui alias ~/ui resolves through neither tsconfig paths nor a workspace package`, `not a workspace package: an installed package is compiled`), the resolved config (globs, tokens, docs, import paths, rules and overrides), tokens whose value reads a custom property no token file defines, and components whose props did not resolve, saying when that is because the dependencies are not installed. At a monorepo root it says why the root is read as one, then explains each project.
- **`onsystem init`** writes `onsystem.config.json` from what zero config found, or from the answers to up to three questions (where the components are, where the tokens are, how apps import them) when it found nothing. It then runs `check .` once without failing, prints the findings by rule, and offers to record them in `onsystem.baseline.json` for an existing codebase. `--yes` writes without asking and records the baseline; `--components` and `--tokens` answer for it in a script; an existing config is left alone without `--force`.
