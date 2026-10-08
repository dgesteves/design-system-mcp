# Agent benchmark

Does an agent write UI that fits the design system more often with design-system-mcp than without it? This runs Claude Code on the same UI tasks twice, once as it ships and once with the [Claude Code plugin](../../README.md#claude-code-plugin), and scores what it wrote with `design-system-mcp check`.

## Setup

- **Project:** [vercel/ai-chatbot](https://github.com/vercel/ai-chatbot) at `c2f8235`, a real shadcn/ui app with 23 components and 52 tokens. Dependencies are not installed.
- **Tasks:** ten components a chat product needs ([tasks.json](tasks.json)), for example a usage banner with a dismiss button, a delete-all-chats confirmation dialog, a settings card with a green "Connected" label, and a message toolbar of icon buttons. Each prompt ends with the same instruction: use the project's existing UI components and design tokens, create only that file, and do not run commands.
- **Conditions:**
  - `base`: `claude -p` with no plugin.
  - `plugin`: the same, plus `--plugin-dir` with the design-system plugin (MCP server, skill and hook) and the MCP tools allowed.
  - Both use `--permission-mode acceptEdits` and a fresh copy of the project per run.
- **Models:** Claude Haiku 4.5 and Claude Opus 5, one run per task, condition and model, so 40 runs in all.
- **Scoring:** `design-system-mcp check` on every file the run created or changed, against a baseline of the untouched project, so only findings the run introduced count. A task is clean when it has no errors.

## Results

| Model            | Condition | Clean tasks | Errors |  Cost | Avg. time | Avg. turns |
| ---------------- | --------- | ----------: | -----: | ----: | --------: | ---------: |
| Claude Haiku 4.5 | base      |      6 / 10 |     13 | $1.31 |      46 s |       13.8 |
| Claude Haiku 4.5 | plugin    | **10 / 10** |  **0** | $1.17 |      42 s |       16.0 |
| Claude Opus 5    | base      |      8 / 10 |      5 | $7.74 |     108 s |       15.8 |
| Claude Opus 5    | plugin    | **10 / 10** |  **0** | $8.31 |     141 s |       21.1 |

No run produced a warning.

What the base runs got wrong:

| Task             | Haiku 4.5                                                                        | Opus 5                                                                |
| ---------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| rate-limit-alert | 9 × `no-hardcoded-color` (Tailwind's red palette)                                | none                                                                  |
| settings-card    | 2 × `no-hardcoded-color`                                                         | 4 × `no-hardcoded-color` (`emerald` for "Connected")                  |
| profile-card     | none                                                                             | 1 × `no-hardcoded-color` (an `oklch()` literal for the avatar circle) |
| share-dialog     | 1 × `prefer-design-system-component` (native `<label>`; the project has `Label`) | none                                                                  |
| usage-banner     | 1 × `icon-button-accessible-name`                                                | none                                                                  |

With the plugin, the agents called the design-system tools 5.6 (Haiku) and 7.3 (Opus) times per task on average: `search_components`, `get_component`, `get_tokens` and `check_ui`. The lint-on-edit hook never had to report an error back. Looking the design system up before writing was enough, so the hook acted as a safety net that was never needed in these runs. A [separate run](../../README.md#claude-code-plugin), where Claude was asked to write hardcoded values on purpose, shows the hook catching them and Claude fixing them.

## Reading it honestly

- **Frontier models already do well here.** Opus 5 reads the codebase and copies its patterns. Its misses were colors the prompt named ("green", "colored circle") that the project has no token for. Smaller, faster models miss more, and they gained the most: on Haiku the plugin also cost less and finished sooner.
- **The sample is small.** It's one project and ten tasks, with one run per cell. Treat the numbers as a direction, not a rate.
- **The score is the tool's own.** It only counts what `check` can see: hardcoded values, invented components, props and variants, native elements, and icon buttons without names. It does not judge whether the UI is good.

The files each run produced are in [output/](output/), and the per-run results, with every finding, cost and turn count, are in [results/](results/).

## Reproduce

```sh
git clone https://github.com/vercel/ai-chatbot && git -C ai-chatbot checkout c2f8235
pnpm build   # in this repository
node bench/agents/run.mjs ./ai-chatbot . ./bench-out --concurrency 5 --model haiku
```

Each run calls Claude Code headless and is billed to your account: about $0.06 to $0.25 per run with Haiku 4.5 and $0.45 to $1.30 with Opus 5.
