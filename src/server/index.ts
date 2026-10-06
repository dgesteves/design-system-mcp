import fs from 'node:fs/promises';
import path from 'node:path';

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod';

import type { DesignSystem } from '../design-system.js';
import { TOKEN_CATEGORIES } from '../types.js';
import { isInside, relativePath } from '../util/paths.js';
import { NAME, VERSION } from '../version.js';
import {
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

const diagnosticSchema = z.object({
  ruleId: z.string(),
  severity: z.enum(['error', 'warning']),
  message: z.string(),
  line: z.number().int(),
  column: z.number().int(),
  endLine: z.number().int(),
  endColumn: z.number().int(),
  source: z.string(),
  suggestion: z.string().optional(),
  fix: z
    .array(z.object({ range: z.tuple([z.number().int(), z.number().int()]), text: z.string() }))
    .optional()
    .describe('Edits (0-based offsets into the checked code) that apply the suggestion.'),
});

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
        name: z.string().min(1).describe('Component name, e.g. "Button" or "CardHeader".'),
      },
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
        query: z.string().min(1).describe('What the UI should do, in plain words.'),
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
        content: [{ type: 'text', text: renderTokens(ds, tokens) }],
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
        code: z.string().optional().describe('TSX/JSX source to check.'),
        path: z
          .string()
          .optional()
          .describe('Path of a file to check, relative to the project root.'),
        filename: z
          .string()
          .optional()
          .describe('Name to report `code` under; a .jsx extension parses it as JSX.'),
      },
      outputSchema: {
        file: z.string(),
        ok: z.boolean().describe('True when there are no errors.'),
        errorCount: z.number().int(),
        warningCount: z.number().int(),
        diagnostics: z.array(diagnosticSchema),
      },
      annotations: READ_ONLY,
    },
    async ({ code, path: filePath, filename }): Promise<CallToolResult> => {
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
        if (!isInside(ds.root, absolute)) {
          return {
            isError: true,
            content: [
              { type: 'text', text: `${filePath} is outside the project root (${ds.root}).` },
            ],
          };
        }
        try {
          source = await fs.readFile(absolute, 'utf8');
        } catch {
          return { isError: true, content: [{ type: 'text', text: `Cannot read ${filePath}.` }] };
        }
        file = relativePath(ds.root, absolute);
      }
      const result = ds.check(source, file);
      return {
        content: [{ type: 'text', text: renderCheck(result) }],
        structuredContent: { ...result, ok: result.errorCount === 0 },
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
          { uri: uri.href, mimeType: 'application/json', text: JSON.stringify(ds.tokens, null, 2) },
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
