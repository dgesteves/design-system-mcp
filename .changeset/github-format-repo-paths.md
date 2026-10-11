---
'onsystem': patch
---

`check --format github` names files relative to the repository root, so annotations land on the right files when `check` runs in a folder of the repository (`working-directory: apps/web`, or `cd apps/web && npx onsystem check`); before, the paths were relative to that folder and GitHub could not place them. The root is `GITHUB_WORKSPACE` or the git top-level, whichever is the innermost folder holding the file, so a repository checked out in a folder of the workspace (`actions/checkout` with `path:`) works too; a file under neither keeps its path relative to the working directory. `--format sarif`, which already used the git top-level, now falls back to `GITHUB_WORKSPACE` where git is missing or refuses the checkout, and so does the GitHub Action's annotation path outside pull requests.
