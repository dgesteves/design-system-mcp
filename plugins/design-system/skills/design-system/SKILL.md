---
name: design-system
description: Build or change React UI with this project's own design system. Use when writing or editing components, pages or styles in .tsx/.jsx files, choosing colors, spacing or radius, or reviewing UI code. Look components, props, variants and tokens up with the design-system MCP tools instead of guessing, and fix every check_ui finding.
---

# Building UI with the project's design system

The `design-system` MCP server reads this project's components (props, `cva` variants, parts), design tokens and component docs. Use it as ground truth: training data does not know this project's `Button` variants or color tokens.

## Before writing UI

1. Find what exists: `search_components` with the intent ("confirm a destructive action", "status label"), or `list_components`.
2. Read `get_component` for every component you use. Use only the props and variant values it lists, the import it shows, and its parts (`CardHeader`, not `Card.Header`, unless it lists the member).
3. Style with tokens from `get_tokens`: semantic classes such as `bg-destructive` or `text-muted-foreground`, never hex or rgb values, arbitrary pixel values (`p-[13px]`) or Tailwind's default palette (`bg-red-500`).
4. Prefer a variant over overriding a component's classes, and a design-system component over a native element (`<Button>`, not `<button>`).
5. Give icon-only buttons an accessible name (`aria-label`).

## After writing UI

Run `check_ui` on every file you changed and fix every error. Each finding has a rule id, a location and usually the exact fix. The plugin's hook also runs the same check after each edit and reports errors back to you; fix them before moving on rather than working around them.

If the project has a `design-system-mcp.baseline.json`, the command-line `check` (and the hook) report only findings the baseline does not already accept. `check_ui` shows everything in the file; fix what you introduced, and leave unrelated pre-existing findings alone unless asked.
