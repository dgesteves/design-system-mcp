import { readme, tools } from '@/lib/data';

export const SITE_URL = 'https://design-system-mcp-demo.vercel.app';
export const REPO = 'https://github.com/dgesteves/onsystem';
export const NPM = 'https://www.npmjs.com/package/onsystem';
export const REGISTRY =
  'https://registry.modelcontextprotocol.io/?q=io.github.dgesteves%2Fonsystem';
export const AUTHOR = { name: 'Diogo Esteves', url: 'https://github.com/dgesteves' };

export const VERSION = tools.version;
export const NPX = 'npx -y onsystem';
export const PLUGIN_COMMANDS = readme.install.plugin;
export const CURSOR_INSTALL = readme.install.cursor;
export const VSCODE_INSTALL = readme.install.vscode;

/** A file or folder in the repository on GitHub. */
export function repoLink(file: string, kind: 'blob' | 'tree' = 'blob'): string {
  return `${REPO}/${kind}/main/${file}`;
}

/** A section of the README on GitHub. */
export function readmeLink(anchor: string): string {
  return `${REPO}#${anchor}`;
}

export const MORE = [
  {
    name: 'ask-my-site',
    url: 'https://ask-my-site-demo.vercel.app',
    description: 'A drop-in ⌘K ask agent for any website, with a build-time index.',
  },
  {
    name: 'agent-ui-kit',
    url: 'https://agent-ui-kit-demo.vercel.app',
    description: 'React components for agent runs: tool timelines, approvals, diff review.',
  },
];

/** A rule's entry in the catalog. */
export function ruleHref(id: string): string {
  return `/rules#${id}`;
}

/**
 * README anchors that have a page on this site. Links in README text shown here go to the
 * site's page; other anchors go to the README on GitHub.
 */
export const README_ANCHORS: Record<string, string> = {
  quickstart: '/docs',
  setup: '/docs/clients',
  'cursor-and-vs-code': '/docs/clients#cursor-and-vs-code',
  'other-clients': '/docs/clients#other-clients',
  'claude-code-plugin': '/docs/plugin',
  tools: '/docs/tools',
  rules: '/rules',
  configuration: '/docs/configuration',
  'zero-config': '/docs/configuration#zero-config',
  'config-file': '/docs/configuration#config-file',
  ci: '/docs/ci',
  'adopting-it-in-an-existing-codebase': '/docs/ci#adopting-it-in-an-existing-codebase',
  limits: '/docs/faq#limits',
};

/** Where a README anchor points from the site. */
export function docsHref(anchor: string): string {
  return README_ANCHORS[anchor] ?? readmeLink(anchor);
}
