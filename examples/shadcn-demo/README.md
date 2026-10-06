# shadcn-demo

A small shadcn/ui-style design system used to exercise `design-system-mcp`:

| Path                            | What it is                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `components/ui/*.tsx`           | `Button`, `Badge`, `Card`, `Dialog`, `Input`, built with `cva` and Radix (adapted from [shadcn/ui](https://ui.shadcn.com), MIT) |
| `app/globals.css`               | Tailwind v4 tokens: `:root` / `.dark` custom properties mapped through `@theme inline`                                          |
| `docs/*.md`                     | Usage guidelines and examples, one file per component                                                                           |
| `app/settings/members.tsx`      | UI written against the design system. `check` reports nothing.                                                                  |
| `app/settings/danger-zone.tsx`  | UI written without it. `check` reports one problem per rule.                                                                    |
| `design-system-mcp.config.json` | The config that ties it together                                                                                                |

From the repository root:

```sh
pnpm install && pnpm build
pnpm demo:inspect   # what the server extracted
pnpm demo:check     # lint app/**/*.tsx (exits 1: danger-zone.tsx has errors)
```

To use it from an agent, point the server at this folder:

```sh
claude mcp add design-system -- node /absolute/path/to/dist/cli.js --root /absolute/path/to/examples/shadcn-demo
```
