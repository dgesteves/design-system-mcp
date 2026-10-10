import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport as LegacyInMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';

import { serveStdio } from '../src/server/stdio.js';
import { silentLogger } from '../src/util/log.js';
import { DEMO_ROOT } from './helpers.js';

const TOOLS = ['list_components', 'get_component', 'search_components', 'get_tokens', 'check_ui'];
const MODERN = '2026-07-28';

/** A server on the demo, as `onsystem --root examples/shadcn-demo` serves it, over a linked in-memory pair. */
async function serve() {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const server = await serveStdio({
    cwd: DEMO_ROOT,
    root: DEMO_ROOT,
    cache: false,
    watch: false,
    logger: silentLogger,
    transport: serverSide,
  });
  return { clientSide, server };
}

function text(result: { content?: unknown }): string {
  const content = (result.content as { type: string; text?: string }[] | undefined)?.[0];
  return content?.type === 'text' ? (content.text ?? '') : '';
}

describe('the official client, in both protocol eras', () => {
  it('serves a 2025-era client through the initialize handshake', async () => {
    const { clientSide, server } = await serve();
    const client = new Client(
      { name: 'legacy-host', version: '1.0.0' },
      { versionNegotiation: { mode: 'legacy' } },
    );
    await client.connect(clientSide);
    expect(client.getProtocolEra()).toBe('legacy');
    expect(client.getNegotiatedProtocolVersion()).toBe('2025-11-25');
    expect(client.getServerVersion()).toMatchObject({ name: 'onsystem', title: 'onsystem' });
    expect(client.getInstructions()).toContain('Run check_ui on every snippet');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(TOOLS);
    const result = await client.callTool({
      name: 'check_ui',
      arguments: { code: '<Button variant="danger">Delete</Button>' },
    });
    expect(result.structuredContent).toMatchObject({ ok: false, errorCount: 1 });
    await client.close();
    await server.close();
  });

  it('serves a 2026-07-28 client statelessly, found through server/discover', async () => {
    const { clientSide, server } = await serve();
    const client = new Client(
      { name: 'modern-host', version: '1.0.0' },
      { versionNegotiation: { mode: { pin: MODERN } } },
    );
    await client.connect(clientSide);
    expect(client.getProtocolEra()).toBe('modern');
    expect(client.getNegotiatedProtocolVersion()).toBe(MODERN);
    const discovered = client.getDiscoverResult();
    expect(discovered?.supportedVersions).toContain(MODERN);
    expect(discovered?.capabilities).toMatchObject({ tools: {}, resources: {}, prompts: {} });
    expect(discovered?.instructions).toContain('Run check_ui on every snippet');
    const first = await client.listTools();
    const second = await client.listTools();
    // A deterministic order, so clients can cache the list and hit their prompt cache.
    expect(first.tools.map((t) => t.name)).toEqual(TOOLS);
    expect(second.tools.map((t) => t.name)).toEqual(TOOLS);
    const result = await client.callTool({
      name: 'get_component',
      arguments: { name: 'Button' },
    });
    expect(text(result)).toContain('import { Button } from "@/components/ui/button"');
    const read = await client.readResource({ uri: 'ds://components/Badge' });
    expect(read.contents[0]).toMatchObject({ mimeType: 'text/markdown' });
    await client.close();
    await server.close();
  });

  it('negotiates the modern era when asked to, and falls back for a client that does not', async () => {
    const { clientSide, server } = await serve();
    const client = new Client(
      { name: 'auto-host', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } },
    );
    await client.connect(clientSide);
    expect(client.getProtocolEra()).toBe('modern');
    await client.close();
    await server.close();
  });

  it('serves the v1 SDK client that hosts on the 2025 protocol embed', async () => {
    const [clientSide, serverSide] = LegacyInMemoryTransport.createLinkedPair();
    const server = await serveStdio({
      cwd: DEMO_ROOT,
      root: DEMO_ROOT,
      cache: false,
      watch: false,
      logger: silentLogger,
      transport: serverSide,
    });
    const client = new LegacyClient({ name: 'v1-host', version: '1.0.0' });
    await client.connect(clientSide);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(TOOLS);
    // Its validator reads output schemas as draft-07: check_ui's fixes must pass it.
    const result = await client.callTool({
      name: 'check_ui',
      arguments: { code: '<Button className="bg-[#ef4444]">Go</Button>' },
    });
    expect(result.isError).toBeFalsy();
    await client.close();
    await server.close();
  });
});

/** Raw JSON-RPC over the transport: what the 2026-07-28 wire carries, without a client's normalising. */
async function rawSession() {
  const { clientSide, server } = await serve();
  const replies = new Map<number | string, Record<string, unknown>>();
  const waiting = new Map<number | string, (reply: Record<string, unknown>) => void>();
  clientSide.onmessage = (message) => {
    const reply = message as unknown as Record<string, unknown> & { id?: number | string };
    if (reply.id === undefined) return;
    const resolve = waiting.get(reply.id);
    if (resolve) resolve(reply);
    else replies.set(reply.id, reply);
  };
  await clientSide.start();
  let next = 1;
  const meta = {
    'io.modelcontextprotocol/protocolVersion': MODERN,
    'io.modelcontextprotocol/clientInfo': { name: 'raw', version: '1.0.0' },
    'io.modelcontextprotocol/clientCapabilities': {},
  };
  const request = async (
    method: string,
    params: Record<string, unknown> = {},
    metaOverride: Record<string, unknown> = {},
  ) => {
    const id = next++;
    const reply = new Promise<Record<string, unknown>>((resolve) => {
      const early = replies.get(id);
      if (early) resolve(early);
      else waiting.set(id, resolve);
    });
    await clientSide.send({
      jsonrpc: '2.0',
      id,
      method,
      params: { ...params, _meta: { ...meta, ...metaOverride } },
    } as never);
    return reply;
  };
  return { request, close: () => server.close() };
}

describe('the 2026-07-28 wire', () => {
  it('answers server/discover with versions, capabilities, identity and cache hints', async () => {
    const session = await rawSession();
    const reply = await session.request('server/discover');
    expect(reply.result).toMatchObject({
      resultType: 'complete',
      supportedVersions: expect.arrayContaining([MODERN]) as unknown,
      capabilities: { tools: {}, resources: { listChanged: true }, prompts: {} },
      instructions: expect.stringContaining('check_ui') as unknown,
      ttlMs: 3_600_000,
      cacheScope: 'private',
      _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'onsystem' } },
    });
    await session.close();
  });

  it('marks every result complete, with cache hints on the cacheable ones', async () => {
    const session = await rawSession();
    const tools = (await session.request('tools/list')).result as Record<string, unknown>;
    expect(tools).toMatchObject({
      resultType: 'complete',
      ttlMs: 3_600_000,
      cacheScope: 'private',
    });
    expect((tools.tools as { name: string }[]).map((t) => t.name)).toEqual(TOOLS);
    const resources = (await session.request('resources/list')).result;
    // The component list follows the code: not to be reused.
    expect(resources).toMatchObject({ resultType: 'complete', ttlMs: 0, cacheScope: 'private' });
    const prompts = (await session.request('prompts/list')).result;
    expect(prompts).toMatchObject({ resultType: 'complete', ttlMs: 3_600_000 });
    const call = (
      await session.request('tools/call', {
        name: 'check_ui',
        arguments: { code: '<button>Go</button>' },
      })
    ).result;
    expect(call).toMatchObject({ resultType: 'complete', structuredContent: { errorCount: 1 } });
    await session.close();
  });

  it('rejects a protocol version it does not speak, naming the ones it does', async () => {
    const session = await rawSession();
    const reply = await session.request(
      'tools/list',
      {},
      { 'io.modelcontextprotocol/protocolVersion': '1900-01-01' },
    );
    expect(reply.error).toMatchObject({
      code: -32022,
      data: { supported: expect.arrayContaining([MODERN]) as unknown, requested: '1900-01-01' },
    });
    await session.close();
  });
});
