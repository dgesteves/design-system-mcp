import { readme, tools } from '@/lib/data';

export const SITE_URL = 'https://design-system-mcp-demo.vercel.app';
export const REPO = 'https://github.com/dgesteves/design-system-mcp';
export const NPM = 'https://www.npmjs.com/package/@dgesteves/design-system-mcp';
export const REGISTRY =
  'https://registry.modelcontextprotocol.io/?q=io.github.dgesteves%2Fdesign-system-mcp';
export const AUTHOR = { name: 'Diogo Esteves', url: 'https://github.com/dgesteves' };

export const VERSION = tools.version;
export const NPX = 'npx -y @dgesteves/design-system-mcp';
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

/** Where the rules are documented. */
export const RULES_HREF = readmeLink('rules');
