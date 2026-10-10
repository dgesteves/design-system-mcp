import { bench, docs, readme, ruleCatalog, tools } from '@/lib/data';
import { DOCS_PAGES } from '@/lib/docs';
import {
  docsHref,
  NPM,
  NPX,
  PLUGIN_COMMANDS,
  REGISTRY,
  REPO,
  SITE_URL,
  repoLink,
} from '@/lib/site';

/** Links in README Markdown, made absolute: site pages where they exist, GitHub otherwise. */
function absolute(markdown: string): string {
  return markdown.replace(/\]\(([^)]+)\)/g, (_, href: string) => {
    if (/^https?:\/\//.test(href)) return `](${href})`;
    if (href.startsWith('#')) {
      const target = docsHref(href.slice(1));
      return `](${target.startsWith('/') ? `${SITE_URL}${target}` : target})`;
    }
    if (href.startsWith('/')) return `](${SITE_URL}${href})`;
    const file = href.replace(/^\.\//, '');
    return `](${repoLink(file, /\.[a-z]+$/i.test(file) ? 'blob' : 'tree')})`;
  });
}

const summary =
  'An MCP server and Claude Code plugin that gives coding agents ground truth about a React design system (components, props, cva variants, parts, tokens and docs, read from source with the TypeScript compiler) and check_ui, a linter they run on their own UI. Every finding has a rule id, a location and a fix. Static analysis: no model calls, no API key.';

/** llms.txt (https://llmstxt.org): what this is, how to install it, and where everything is. */
export function llmsTxt(): string {
  const [model] = bench.models;
  const lines = [
    '# onsystem',
    '',
    `> ${summary}`,
    '',
    `Version ${tools.version}, MIT. React (.tsx/.jsx), shadcn/ui or any design system, Tailwind v3 or v4, Node.js ${readme.engines.node.replace('>=', '')}+.`,
    '',
    'Install:',
    '',
    `- Claude Code: \`${PLUGIN_COMMANDS.split('\n').join('` then `')}\``,
    `- Any MCP client, over stdio: \`${NPX}\``,
    '- CI: `npx onsystem check . --format github --require-design-system`',
    '',
    model
      ? `Benchmark: Claude Code built the same ten components for vercel/ai-chatbot with and without the plugin. ${bench.models.map((m) => `${m.name}: ${String(m.base.clean)}/${String(m.base.runs)} → ${String(m.plugin.clean)}/${String(m.plugin.runs)} clean, ${String(m.base.errors)} → ${String(m.plugin.errors)} errors`).join('; ')}.`
      : '',
    '',
    '## Docs',
    '',
    ...DOCS_PAGES.map((page) => `- [${page.title}](${SITE_URL}${page.href}): ${page.description}`),
    `- [Rules](${SITE_URL}/rules): every rule with what it catches, why it matters, an example and its fix`,
    `- [Playground](${SITE_URL}/playground): run check_ui on code in the browser, against a demo design system`,
    '',
    '## Tools',
    '',
    ...tools.tools.map((tool) => `- \`${tool.name}\`: ${tool.description}`),
    '',
    '## Rules',
    '',
    ...ruleCatalog.rules.map(
      (rule) =>
        `- [\`${rule.id}\`](${SITE_URL}/rules#${rule.id}) (${rule.severity}): ${rule.description}`,
    ),
    '',
    '## Optional',
    '',
    `- [All the docs in one file](${SITE_URL}/llms-full.txt)`,
    `- [README](${REPO}#readme)`,
    `- [Benchmark method and per-run results](${repoLink('bench/agents', 'tree')})`,
    `- [npm](${NPM})`,
    `- [MCP Registry](${REGISTRY})`,
    `- [Changelog](${repoLink('CHANGELOG.md')})`,
  ];
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

/** Every docs page and the rules, as one Markdown file. */
export function llmsFullTxt(): string {
  const sections: [string, string][] = [
    ['Quickstart', docs.quickstart],
    [
      'Set up your agent',
      `${docs.setup}\n\n### Cursor and VS Code\n\n${docs.cursorVsCode}\n\n### Other clients\n\n${docs.otherClients}`,
    ],
    ['Claude Code plugin', docs.plugin],
    ['Tools', docs.tools],
    [
      'Rules',
      [
        ...ruleCatalog.rules.map(
          (rule) =>
            `### ${rule.id} (${rule.severity} by default)\n\n${rule.description}\n\nCatches: ${rule.catches}\n\nSuggests: ${rule.suggests}\n\nWhy it matters: ${rule.why}\n\nExample:\n\n\`\`\`tsx\n${rule.bad.trimEnd()}\n\`\`\`\n\n${rule.findings.map((f) => `- ${String(f.line)}:${String(f.column)} ${f.severity}: ${f.message}`).join('\n')}\n\nFixed:\n\n\`\`\`tsx\n${rule.good.trimEnd()}\n\`\`\``,
        ),
        ruleCatalog.details,
      ].join('\n\n'),
    ],
    [
      'Configuration',
      `### Zero config\n\n${docs.zeroConfig}\n\n### Config file\n\n${docs.configFile}`,
    ],
    ['CI', `${docs.ci}\n\n### Adopting it in an existing codebase\n\n${docs.baseline}`],
    ['Limits', docs.limits],
    ['Migrating from @dgesteves/design-system-mcp', docs.migrating],
  ];
  return `# onsystem\n\n> ${summary}\n\n${sections
    .map(([title, body]) => `## ${title}\n\n${absolute(body)}`)
    .join('\n\n')}\n`;
}
