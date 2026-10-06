import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ListRootsRequestSchema, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createServer } from '../src/server/index.js';
import { serveStdio } from '../src/server/stdio.js';
import { silentLogger } from '../src/util/log.js';
import { DEMO_ROOT, loadOnce } from './helpers.js';

function text(result: unknown): string {
  const content = (result as CallToolResult).content[0];
  return content?.type === 'text' ? content.text : '';
}

describe('MCP server over the in-memory transport', () => {
  const client = new Client({ name: 'test-client', version: '1.0.0' });

  beforeAll(async () => {
    const ds = await loadOnce(DEMO_ROOT);
    const server = createServer({ getDesignSystem: () => Promise.resolve(ds) });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });

  afterAll(async () => {
    await client.close();
  });

  it('advertises instructions and five read-only tools with schemas', async () => {
    expect(client.getInstructions()).toContain('Run check_ui on every snippet');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'check_ui',
      'get_component',
      'get_tokens',
      'list_components',
      'search_components',
    ]);
    for (const tool of tools) {
      expect(tool.description?.length).toBeGreaterThan(80);
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
      expect(tool.inputSchema.type).toBe('object');
    }
    const check = tools.find((t) => t.name === 'check_ui');
    expect(Object.keys(check?.inputSchema.properties ?? {})).toEqual(['code', 'path', 'filename']);
    expect(check?.outputSchema?.properties).toHaveProperty('diagnostics');
  });

  it('list_components', async () => {
    const result = await client.callTool({ name: 'list_components', arguments: {} });
    expect(text(result)).toContain('Button <button> — Triggers an action or event');
    expect(text(result)).toContain(
      'variant: default | destructive | outline | secondary | ghost | link (default default)',
    );
    const { components } = result.structuredContent as {
      components: { name: string; variants: object }[];
    };
    expect(components.map((c) => c.name)).toEqual(['Badge', 'Button', 'Card', 'Dialog', 'Input']);
    expect(components[1]?.variants).toEqual({
      variant: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
      size: ['default', 'sm', 'lg', 'icon'],
    });
  });

  it('get_component', async () => {
    const result = await client.callTool({ name: 'get_component', arguments: { name: 'button' } });
    const body = text(result);
    expect(body).toContain('import { Button } from "@/components/ui/button"');
    expect(body).toContain('- asChild?: boolean = false — Render the child element');
    expect(body).toMatch(
      /…plus \d+ props from React\.ComponentProps<"button"> \(onClick, type, disabled, form, aria-\*/,
    );
    expect(body).toContain(
      '- variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" = "default"',
    );
    expect(body).toContain('## Variants');
    expect(body).toContain('## Docs (docs/button.md)');
    expect(body).toContain('### Destructive action');
    expect(result.structuredContent).toMatchObject({ name: 'Button', element: 'button' });

    const part = await client.callTool({
      name: 'get_component',
      arguments: { name: 'Card.Header' },
    });
    expect(text(part)).toContain('# CardHeader');
    expect(text(part)).toContain('Part of Card');
  });

  it('get_component with an unknown name returns an error with a suggestion', async () => {
    const result = await client.callTool({ name: 'get_component', arguments: { name: 'Buton' } });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Did you mean "Button"?');
  });

  it('search_components', async () => {
    const result = await client.callTool({
      name: 'search_components',
      arguments: { query: 'confirm a destructive action', limit: 3 },
    });
    expect(text(result)).toMatch(
      /^Components for "confirm a destructive action", best first:\n\n1\. Dialog/,
    );
    const { results } = result.structuredContent as { results: { name: string }[] };
    expect(results[0]?.name).toBe('Dialog');
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('get_tokens', async () => {
    const result = await client.callTool({ name: 'get_tokens', arguments: { category: 'radius' } });
    expect(text(result)).toContain('- radius-md: calc(var(--radius) - 2px) = 8px → rounded-md');
    const all = await client.callTool({ name: 'get_tokens', arguments: {} });
    expect(text(all)).toContain(
      '- destructive: oklch(0.577 0.245 27.325) (dark: oklch(0.704 0.191 22.216)) → bg-destructive',
    );
    const { tokens } = all.structuredContent as { tokens: unknown[] };
    expect(tokens).toHaveLength(27);
  });

  it('check_ui on code and on a project file', async () => {
    const result = await client.callTool({
      name: 'check_ui',
      arguments: { code: '<Button variant="danger">Delete</Button>' },
    });
    expect(text(result)).toContain(
      '1:17 error [no-unknown-variant] "danger" is not a valid variant',
    );
    expect(result.structuredContent).toMatchObject({
      ok: false,
      errorCount: 1,
      file: 'snippet.tsx',
    });

    const file = await client.callTool({
      name: 'check_ui',
      arguments: { path: 'app/settings/danger-zone.tsx' },
    });
    expect(file.structuredContent).toMatchObject({
      file: 'app/settings/danger-zone.tsx',
      errorCount: 8,
      warningCount: 3,
    });

    const clean = await client.callTool({
      name: 'check_ui',
      arguments: { path: 'app/settings/members.tsx' },
    });
    expect(text(clean)).toBe('app/settings/members.tsx: no design-system problems found.');
    expect(clean.structuredContent).toMatchObject({ ok: true });
  });

  it('check_ui refuses paths outside the project and missing input', async () => {
    const outside = await client.callTool({
      name: 'check_ui',
      arguments: { path: '../../package.json' },
    });
    expect(outside.isError).toBe(true);
    expect(text(outside)).toContain('outside the project root');
    const empty = await client.callTool({ name: 'check_ui', arguments: {} });
    expect(empty.isError).toBe(true);
  });

  it('serves component and token resources, with completion', async () => {
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toEqual(
      expect.arrayContaining(['ds://tokens', 'ds://components/Button']),
    );
    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates[0]?.uriTemplate).toBe('ds://components/{name}');

    const component = await client.readResource({ uri: 'ds://components/Dialog' });
    expect(component.contents[0]).toMatchObject({ mimeType: 'text/markdown' });
    expect((component.contents[0] as { text: string }).text).toContain('# Dialog');

    const tokens = await client.readResource({ uri: 'ds://tokens' });
    expect(JSON.parse((tokens.contents[0] as { text: string }).text)).toHaveLength(27);

    const completion = await client.complete({
      ref: { type: 'ref/resource', uri: 'ds://components/{name}' },
      argument: { name: 'name', value: 'Dia' },
    });
    expect(completion.completion.values).toContain('DialogContent');
  });

  it('provides the build-with-design-system prompt', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual(['build-with-design-system']);
    const prompt = await client.getPrompt({
      name: 'build-with-design-system',
      arguments: { task: 'a delete-account card' },
    });
    const message = prompt.messages[0]?.content;
    expect(message?.type).toBe('text');
    const body = message?.type === 'text' ? message.text : '';
    expect(body).toContain('a delete-account card');
    expect(body).toContain('Button (variant, size)');
    expect(body).toContain('20 color');
  });
});

describe('project root from MCP client roots', () => {
  it('uses the first file:// root when started without --root or a config', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dsm-roots-'));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = await serveStdio({
      cwd,
      cache: false,
      watch: false,
      logger: silentLogger,
      transport: serverTransport,
    });
    const client = new Client(
      { name: 'roots-client', version: '1.0.0' },
      { capabilities: { roots: {} } },
    );
    client.setRequestHandler(ListRootsRequestSchema, () => ({
      roots: [{ uri: pathToFileURL(DEMO_ROOT).href, name: 'demo' }],
    }));
    await client.connect(clientTransport);
    const result = await client.callTool({ name: 'list_components', arguments: {} });
    expect(text(result)).toContain('Button <button>');
    await client.close();
    await server.close();
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('reports config errors through tool results', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dsm-bad-'));
    fs.writeFileSync(path.join(cwd, 'design-system-mcp.config.json'), '{"components": 1}');
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = await serveStdio({
      cwd,
      cache: false,
      watch: false,
      logger: silentLogger,
      transport: serverTransport,
    });
    const client = new Client({ name: 'c', version: '1.0.0' });
    await client.connect(clientTransport);
    const result = await client.callTool({ name: 'list_components', arguments: {} });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Invalid config');
    await client.close();
    await server.close();
    fs.rmSync(cwd, { recursive: true, force: true });
  });
});
