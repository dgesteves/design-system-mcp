/** The docs pages, in reading order. Titles double as sidebar labels. */
export const DOCS_PAGES = [
  {
    href: '/docs',
    title: 'Quickstart',
    description: 'Give your agent the tools, see what the server found, and check the codebase.',
  },
  {
    href: '/docs/clients',
    title: 'Set up your agent',
    description:
      'Configs for Cursor, VS Code, Claude Desktop, Codex CLI, Zed, Gemini CLI and Claude Code without the plugin.',
  },
  {
    href: '/docs/plugin',
    title: 'Claude Code plugin',
    description:
      'The server, a skill that looks components up first, and a hook that checks every UI file Claude writes.',
  },
  {
    href: '/docs/configuration',
    title: 'Configuration',
    description:
      'How the design system is found with zero config, and the config file for other layouts.',
  },
  {
    href: '/docs/tools',
    title: 'Tools',
    description: 'The five MCP tools, the resources and the prompt, with real responses.',
  },
  {
    href: '/docs/ci',
    title: 'CI and baselines',
    description:
      'Run check in CI with annotations, and adopt it in a codebase that already has findings.',
  },
  {
    href: '/docs/faq',
    title: 'FAQ',
    description: 'Privacy, how it compares, other frameworks, false positives, and the limits.',
  },
] as const;

export type DocsHref = (typeof DOCS_PAGES)[number]['href'];

export function docsPage(href: DocsHref) {
  const index = DOCS_PAGES.findIndex((p) => p.href === href);
  return {
    page: DOCS_PAGES[index] ?? DOCS_PAGES[0],
    previous: index > 0 ? DOCS_PAGES[index - 1] : undefined,
    next: DOCS_PAGES[index + 1],
  };
}
