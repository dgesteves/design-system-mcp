import fs from 'node:fs/promises';
import path from 'node:path';

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod';

import type { DesignSystem } from '../design-system.js';
import { uncheckedNotice } from '../lint/index.js';
import { TOKEN_CATEGORIES } from '../types.js';
import { isInside, relativePath } from '../util/paths.js';
import { NAME, VERSION } from '../version.js';
import {
  capDiagnostics,
  importStatement,
  renderCheck,
  renderComponent,
  renderComponentList,
  renderSearch,
  renderTokens,
} from './render.js';

export const INSTRUCTIONS = `This server describes the project's design system: its React components (props, variants, parts), design tokens and usage docs, and lints UI code against it.
When writing or changing UI in this project:
1. Find components with search_components (by intent) or list_components.
2. Read get_component before using a component: use only the props and variant values it lists.
3. Style with tokens from get_tokens, never with hex/rgb colors, arbitrary px values or Tailwind's default palette.
4. Run check_ui on every snippet or file you write and fix all errors before you finish.`;

const READ_ONLY = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;

/** Input limits, so one oversized request cannot stall the server. */
const MAX_NAME = 256;
const MAX_QUERY = 1000;
const MAX_PATH = 4096;
/** Larger than any hand-written source file; generated bundles are not UI to check. */
const MAX_CODE = 1_000_000;
/** Diagnostics check_ui returns by default: a 3,000-line file can have thousands, more than a context holds. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1000;

/**
 * An integer, without the ±9007199254740991 bounds zod adds to the JSON Schema,
 * which every client would otherwise read in each tool definition.
 */
const int = () => z.number().int().meta({ minimum: undefined, maximum: undefined });

const diagnosticSchema = z.object({
  ruleId: z.string(),
  severity: z.enum(['error', 'warning']),
  message: z.string(),
  line: int(),
  column: int(),
  endLine: int(),
  endColumn: int(),
  source: z.string(),
  suggestion: z.string().optional(),
  fix: z
    .array(z.object({ range: z.tuple([int(), int()]), text: z.string() }))
    .optional()
    .describe('Edits (0-based offsets into the checked code) that apply the suggestion.'),
});

const deprecatedSchema = z.union([z.string(), z.literal(true)]).optional();
const componentSchema = {
  name: z.string().describe('How the component is written in JSX: Button, CardHeader, Tabs.List.'),
  aliases: z.array(z.string()),
  description: z.string().optional(),
  deprecated: deprecatedSchema,
  importPath: z.string(),
  exportName: z.string(),
  source: z.object({ file: z.string(), line: int() }),
  parent: z.string().optional(),
  subcomponents: z.array(z.string()),
  element: z.string().optional().describe('The native element it renders or wraps.'),
  props: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      required: z.boolean(),
      default: z.string().optional(),
      description: z.string().optional(),
      values: z.array(z.string()).optional(),
      deprecated: deprecatedSchema,
      kind: z.enum(['prop', 'variant']),
    }),
  ),
  inherits: z.array(
    z.object({
      from: z.string(),
      count: int(),
      set: z.string(),
      deprecated: z.array(z.string()).optional(),
    }),
  ),
  openProps: z
    .boolean()
    .describe('Part of the props type did not resolve; extra props may be accepted.'),
  variants: z.array(
    z.object({
      name: z.string(),
      values: z.array(z.string()),
      default: z.string().optional(),
      classes: z.record(z.string(), z.string()),
    }),
  ),
  compoundVariants: z.array(
    z.object({
      when: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
      classes: z.string(),
    }),
  ),
  examples: z.array(
    z.object({
      title: z.string().optional(),
      code: z.string(),
      lang: z.string(),
      source: z.enum(['docs', 'jsdoc']),
    }),
  ),
  docs: z
    .object({
      file: z.string(),
      description: z.string().optional(),
      sections: z.array(z.object({ heading: z.string(), body: z.string() })),
      frontmatter: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
    })
    .optional(),
  classNames: z.array(z.string()),
  cssVars: z.array(z.string()),
  import: z.string().describe('The import statement to use.'),
  tokens: z.array(z.string()).describe('Names of the design tokens its classes use.'),
};

const componentSummarySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  importPath: z.string(),
  element: z.string().optional(),
  variants: z.record(z.string(), z.array(z.string())),
  subcomponents: z.array(z.string()),
});

const tokenSchema = z.object({
  name: z.string(),
  category: z.enum(TOKEN_CATEGORIES),
  value: z.string(),
  modes: z.record(z.string(), z.string()).optional(),
  cssVar: z.string().optional(),
  tailwind: z.string().optional(),
  usage: z.array(z.string()),
  description: z.string().optional(),
});

export interface CreateServerOptions {
  /** Resolves the design system to serve. Called per request, so it can be swapped on reload. */
  getDesignSystem: () => Promise<DesignSystem>;
}

/** Builds the MCP server: five tools, two resources and one prompt. Transport-agnostic. */
export function createServer({ getDesignSystem }: CreateServerOptions): McpServer {
  const server = new McpServer(
    { name: NAME, title: 'Design System MCP', version: VERSION },
    { instructions: INSTRUCTIONS, capabilities: { resources: { listChanged: true } } },
  );

  server.registerTool(
    'list_components',
    {
      title: 'List design-system components',
      description:
        'List every component in the project design system with a one-line description, the native element it renders, its variant values, its parts and its import. Call this before writing UI in this project.',
      inputSchema: {},
      outputSchema: { components: z.array(componentSummarySchema) },
      annotations: READ_ONLY,
    },
    async (): Promise<CallToolResult> => {
      const ds = await getDesignSystem();
      return {
        content: [{ type: 'text', text: renderComponentList(ds) }],
        structuredContent: {
          components: ds.roots().map((c) => ({
            name: c.name,
            ...(c.description ? { description: c.description } : {}),
            importPath: c.importPath,
            ...(c.element ? { element: c.element } : {}),
            variants: Object.fromEntries(c.variants.map((v) => [v.name, v.values])),
            subcomponents: c.subcomponents,
          })),
        },
      };
    },
  );

  server.registerTool(
    'get_component',
    {
      title: 'Get a component contract',
      description:
        'Get the full contract of one component: import, props with types and defaults, cva variants and the classes each applies, parts (sub-components), design tokens it uses, usage guidelines and examples from its docs. Call it before using a component. Accepts "Button", "CardHeader" or "Card.Header".',
      inputSchema: {
        name: z
          .string()
          .min(1)
          .max(MAX_NAME)
          .describe('Component name, e.g. "Button" or "CardHeader".'),
      },
      outputSchema: componentSchema,
      annotations: READ_ONLY,
    },
    async ({ name }): Promise<CallToolResult> => {
      const ds = await getDesignSystem();
      const component = ds.getComponent(name);
      if (!component) {
        const guess = ds.suggestComponent(name);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text:
                `No component named "${name}".` +
                (guess ? ` Did you mean "${guess}"?` : '') +
                ` Available: ${ds
                  .roots()
                  .map((c) => c.name)
                  .join(', ')}.`,
            },
          ],
        };
      }
      return {
        content: [{ type: 'text', text: renderComponent(ds, component) }],
        structuredContent: {
          ...component,
          import: importStatement(component),
          tokens: ds.relatedTokens(component).map((t) => t.name),
        },
      };
    },
  );

  server.registerTool(
    'search_components',
    {
      title: 'Search components by intent',
      description:
        'Find components by what you want to build, e.g. "confirm a destructive action", "status label", "text field with validation". Ranks names, descriptions, docs, props and variant values with BM25 (local, no API key). Use it when you do not know which component fits.',
      inputSchema: {
        query: z.string().min(1).max(MAX_QUERY).describe('What the UI should do, in plain words.'),
        limit: z.number().int().min(1).max(20).default(5).describe('Maximum results.'),
      },
      outputSchema: {
        results: z.array(
          z.object({
            name: z.string(),
            parent: z.string().optional(),
            description: z.string().optional(),
            importPath: z.string(),
            score: z.number(),
            matched: z.array(z.string()),
          }),
        ),
      },
      annotations: READ_ONLY,
    },
    async ({ query, limit }): Promise<CallToolResult> => {
      const ds = await getDesignSystem();
      const hits = ds.search(query, limit);
      return {
        content: [{ type: 'text', text: renderSearch(query, hits) }],
        structuredContent: {
          results: hits.map((h) => ({
            name: h.component.name,
            ...(h.component.parent ? { parent: h.component.parent } : {}),
            ...(h.component.description ? { description: h.component.description } : {}),
            importPath: h.component.importPath,
            score: h.score,
            matched: h.matched,
          })),
        },
      };
    },
  );

  server.registerTool(
    'get_tokens',
    {
      title: 'Get design tokens',
      description:
        'List design tokens with resolved values, dark-mode values and how to use each (Tailwind class or CSS variable). Filter by category (color, spacing, radius, typography, shadow, other) or a substring. Use these instead of hex codes, px values or Tailwind default palette classes.',
      inputSchema: {
        category: z.enum(TOKEN_CATEGORIES).optional().describe('Only tokens of this category.'),
        query: z
          .string()
          .max(MAX_QUERY)
          .optional()
          .describe('Substring to match in names, usages or descriptions.'),
      },
      outputSchema: { tokens: z.array(tokenSchema) },
      annotations: READ_ONLY,
    },
    async ({ category, query }): Promise<CallToolResult> => {
      const ds = await getDesignSystem();
      const tokens = ds.getTokens({ category, query });
      return {
        content: [{ type: 'text', text: renderTokens(ds, tokens, { category, query }) }],
        structuredContent: {
          tokens: tokens.map((t) => ({
            name: t.name,
            category: t.category,
            value: t.value,
            ...(t.modes ? { modes: t.modes } : {}),
            ...(t.cssVar ? { cssVar: t.cssVar } : {}),
            ...(t.tailwind !== undefined ? { tailwind: t.tailwind } : {}),
            usage: t.usage,
            ...(t.description ? { description: t.description } : {}),
          })),
        },
      };
    },
  );

  server.registerTool(
    'check_ui',
    {
      title: 'Check UI code against the design system',
      description:
        'Lint TSX/JSX against the design system. Reports hardcoded colors, spacing and radius (with the nearest token), native elements that have a design-system component, unknown components, props and variant values, and icon-only buttons without an accessible name. Each diagnostic has line/column, a rule id, a message and a suggested fix. Run it on every snippet or file you write and fix all errors. Pass `code` for unsaved code, or `path` for a file in the project.',
      inputSchema: {
        code: z
          .string()
          .max(MAX_CODE)
          .optional()
          .describe(`TSX/JSX source to check (up to ${MAX_CODE.toLocaleString('en')} characters).`),
        path: z
          .string()
          .max(MAX_PATH)
          .optional()
          .describe('Path of a file to check, relative to the project root.'),
        filename: z
          .string()
          .max(MAX_PATH)
          .optional()
          .describe('Name to report `code` under; a .jsx extension parses it as JSX.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_LIMIT)
          .default(DEFAULT_LIMIT)
          .describe(
            `Most diagnostics to return, errors first (default ${DEFAULT_LIMIT}). The counts and byRule cover all of them.`,
          ),
      },
      outputSchema: {
        file: z.string(),
        ok: z.boolean().describe('True when there are no errors.'),
        errorCount: int(),
        warningCount: int(),
        diagnostics: z
          .array(diagnosticSchema)
          .describe(
            'Up to `limit` diagnostics, errors first; `omitted` says how many more there are.',
          ),
        omitted: int().describe('Diagnostics left out by `limit`.'),
        byRule: z
          .record(z.string(), z.object({ errors: int(), warnings: int() }))
          .describe('Every finding per rule, shown or not.'),
        skipped: z
          .string()
          .optional()
          .describe('Why the file was not checked: it renders an image (next/og) or an email.'),
        unchecked: z
          .object({ names: z.array(z.string()), modules: z.array(z.string()) })
          .optional()
          .describe('Components imported from modules the model does not include, not checked.'),
        notice: z
          .string()
          .optional()
          .describe(
            'Set when no components or no color tokens were found, so rules did not run, or when components came from modules the model does not include.',
          ),
      },
      annotations: READ_ONLY,
    },
    async ({ code, path: filePath, filename, limit }): Promise<CallToolResult> => {
      const ds = await getDesignSystem();
      let source = code;
      let file = filename ?? 'snippet.tsx';
      if (source === undefined) {
        if (!filePath) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Pass either `code` or `path`.' }],
          };
        }
        const absolute = path.resolve(ds.root, filePath);
        const outside: CallToolResult = {
          isError: true,
          content: [
            { type: 'text', text: `${filePath} is outside the project root (${ds.root}).` },
          ],
        };
        if (!isInside(ds.root, absolute)) return outside;
        try {
          // A symlink inside the root can point anywhere: compare where both really are.
          const [root, real] = await Promise.all([fs.realpath(ds.root), fs.realpath(absolute)]);
          if (!isInside(root, real)) return outside;
          if ((await fs.stat(real)).size > MAX_CODE) {
            return {
              isError: true,
              content: [{ type: 'text', text: `${filePath} is too large to check.` }],
            };
          }
          source = await fs.readFile(real, 'utf8');
        } catch {
          return { isError: true, content: [{ type: 'text', text: `Cannot read ${filePath}.` }] };
        }
        file = relativePath(ds.root, absolute);
      }
      const result = ds.check(source, file);
      const capped = capDiagnostics(result, limit);
      // A clean result without components or color tokens, or with components the model
      // leaves out, says little.
      const notice = result.skipped
        ? undefined
        : [ds.notice(), uncheckedNotice([result])].filter(Boolean).join('\n\n') || undefined;
      return {
        content: [
          { type: 'text', text: renderCheck(result, capped) + (notice ? `\n\n${notice}` : '') },
        ],
        structuredContent: {
          ...result,
          diagnostics: capped.shown,
          omitted: capped.omitted,
          byRule: capped.byRule,
          ok: result.errorCount === 0,
          ...(notice ? { notice } : {}),
        },
      };
    },
  );

  server.registerResource(
    'component',
    new ResourceTemplate('ds://components/{name}', {
      list: async () => {
        const ds = await getDesignSystem();
        return {
          resources: ds.components.map((c) => ({
            uri: `ds://components/${c.name}`,
            name: c.name,
            title: c.name,
            ...(c.description ? { description: c.description } : {}),
            mimeType: 'text/markdown',
          })),
        };
      },
      complete: {
        name: async (value) => {
          const ds = await getDesignSystem();
          const lower = value.toLowerCase();
          return ds.components.map((c) => c.name).filter((n) => n.toLowerCase().startsWith(lower));
        },
      },
    }),
    {
      title: 'Design-system component',
      description: 'Props, variants, parts, tokens, guidelines and examples for one component.',
      mimeType: 'text/markdown',
    },
    async (uri, { name }) => {
      const ds = await getDesignSystem();
      const component = ds.getComponent(decodeURIComponent(String(name)));
      if (!component) throw new Error(`No component named "${String(name)}".`);
      return {
        contents: [
          { uri: uri.href, mimeType: 'text/markdown', text: renderComponent(ds, component) },
        ],
      };
    },
  );

  server.registerResource(
    'tokens',
    'ds://tokens',
    {
      title: 'Design tokens',
      description: 'Every design token with resolved values, modes and usages, as JSON.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const ds = await getDesignSystem();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(ds.getTokens(), null, 2),
          },
        ],
      };
    },
  );

  server.registerPrompt(
    'build-with-design-system',
    {
      title: 'Build UI with the design system',
      description:
        'Build a piece of UI using only design-system components and tokens, then verify it with check_ui.',
      argsSchema: {
        task: z
          .string()
          .max(MAX_QUERY * 4)
          .describe('What to build, e.g. "a settings card that lets owners delete the workspace".'),
      },
    },
    async ({ task }) => {
      const ds = await getDesignSystem();
      const components = ds
        .roots()
        .map((c) => {
          const extras = [
            ...c.variants.map((v) => v.name),
            ...(c.subcomponents.length ? [`+${c.subcomponents.length} parts`] : []),
          ];
          return `${c.name}${extras.length ? ` (${extras.join(', ')})` : ''}`;
        })
        .join(', ');
      const counts = new Map<string, number>();
      for (const token of ds.tokens)
        counts.set(token.category, (counts.get(token.category) ?? 0) + 1);
      const tokens = [...counts].map(([category, n]) => `${n} ${category}`).join(', ');
      return {
        description: 'Build UI with the design system',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Build this UI with the project's design system: ${task}

Work like this:
1. Find components: search_components for each piece of the UI (for example "confirm a destructive action"), or list_components for an overview.
2. Read the contract: get_component for every component you use. Use only the props and variant values it lists, and compose parts the way its examples do.
3. Style with tokens: get_tokens when you need a color, spacing or radius. Never write hex/rgb colors, arbitrary px values or Tailwind default palette classes such as bg-blue-500.
4. Use design-system components instead of native elements (<Button>, not <button>).
5. Verify: run check_ui on the code you wrote, fix every error, and run it again until it reports none.

Design system: ${components || 'no components found'}.
Tokens: ${tokens || 'none'}.`,
            },
          },
        ],
      };
    },
  );

  return server;
}
