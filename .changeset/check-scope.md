---
'@dgesteves/design-system-mcp': minor
---

`check` lints what you ship, and `check_ui` answers in a size an agent can read.

- In folders and globs, `check` leaves out tests and stories (`*.test.tsx`, `*.spec.tsx`, `*.stories.tsx`; `--include-tests` checks them), what the config's `exclude` lists, and what git ignores. A file named outright is always checked. The summary line counts what was left out.
- Files that render an image or an email are not checked, since design tokens and classes don't apply there: those importing `next/og`, `@vercel/og`, `satori` or `@react-email/*`, Next.js `opengraph-image`, `twitter-image`, `icon` and `apple-icon` routes, and files in an `og` folder. `--format json` marks them `skipped`, and `check_ui` says why.
- `check_ui` returns at most 50 diagnostics, errors first (`limit` sets another number, up to 1,000), with the total per rule and how many were left out, in both the text and `structuredContent` (`omitted`, `byRule`). A 3,000-line file used to come back as about 500,000 tokens.
