// End-to-end smoke test of the built package: spawns `dist/cli.js` as a stdio
// MCP server against examples/shadcn-demo, calls every tool through the v1 SDK's
// stdio client (the 2025 protocol, as hosts embed it today), then connects again
// with the v2 client on the 2026-07-28 protocol, and fails loudly if anything is
// off. Run after `pnpm build`.
import assert from 'node:assert/strict';
import path from 'node:path';

import { Client as ModernClient } from '@modelcontextprotocol/client';
import { StdioClientTransport as ModernStdioTransport } from '@modelcontextprotocol/client/stdio';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(import.meta.dirname, '..');
const verbose = process.argv.includes('--verbose');
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [
    path.join(root, 'dist/cli.js'),
    '--root',
    path.join(root, 'examples/shadcn-demo'),
    '--no-watch',
    '--no-cache',
  ],
  stderr: verbose ? 'inherit' : 'pipe',
});
const client = new Client({ name: 'smoke', version: '1.0.0' });
await client.connect(transport);

const text = (result) => result.content.find((c) => c.type === 'text')?.text ?? '';
const call = async (name, args = {}) => {
  const started = performance.now();
  const result = await client.callTool({ name, arguments: args });
  const ms = Math.round(performance.now() - started);
  console.log(`\n── ${name} ${JSON.stringify(args)} (${ms}ms)`);
  console.log(verbose ? text(result) : text(result).split('\n').slice(0, 8).join('\n'));
  assert.ok(!result.isError, `${name} returned an error: ${text(result)}`);
  return result;
};

const serverInfo = client.getServerVersion();
console.log(`connected to ${serverInfo.name}@${serverInfo.version}`);
const { tools } = await client.listTools();
assert.deepEqual(tools.map((t) => t.name).sort(), [
  'check_ui',
  'get_component',
  'get_tokens',
  'list_components',
  'search_components',
]);

const list = await call('list_components');
assert.equal(list.structuredContent.components.length, 5);

const button = await call('get_component', { name: 'Button' });
assert.match(text(button), /variant\?: "default" \| "destructive"/);

const search = await call('search_components', { query: 'confirm a destructive action' });
assert.equal(search.structuredContent.results[0].name, 'Dialog');

const tokens = await call('get_tokens', { category: 'color' });
assert.equal(tokens.structuredContent.tokens.length, 20);

const check = await call('check_ui', { path: 'app/settings/danger-zone.tsx' });
assert.equal(check.structuredContent.errorCount, 8);
assert.equal(check.structuredContent.warningCount, 3);

const snippet = await call('check_ui', {
  code: '<Button variant="destructive" size="icon" aria-label="Delete"><Trash2 /></Button>',
});
assert.equal(snippet.structuredContent.ok, true);

const resource = await client.readResource({ uri: 'ds://components/Badge' });
assert.match(resource.contents[0].text, /^# Badge/);
const prompt = await client.getPrompt({
  name: 'build-with-design-system',
  arguments: { task: 'a settings card' },
});
assert.match(prompt.messages[0].content.text, /check_ui/);

await client.close();

// The same server, to a client on the 2026-07-28 protocol: stateless, found through server/discover.
const args = [
  path.join(root, 'dist/cli.js'),
  '--root',
  path.join(root, 'examples/shadcn-demo'),
  '--no-watch',
  '--no-cache',
];
const modern = new ModernClient(
  { name: 'smoke-2026', version: '1.0.0' },
  { versionNegotiation: { mode: { pin: '2026-07-28' } } },
);
await modern.connect(
  new ModernStdioTransport({
    command: process.execPath,
    args,
    stderr: verbose ? 'inherit' : 'pipe',
  }),
);
assert.equal(modern.getProtocolEra(), 'modern');
assert.equal(modern.getNegotiatedProtocolVersion(), '2026-07-28');
const discovered = modern.getDiscoverResult();
assert.ok(discovered?.supportedVersions.includes('2026-07-28'));
const modernTools = await modern.listTools();
assert.deepEqual(
  modernTools.tools.map((t) => t.name),
  tools.map((t) => t.name),
  'tools/list has the same order in both eras',
);
const modernCheck = await modern.callTool({
  name: 'check_ui',
  arguments: { path: 'app/settings/danger-zone.tsx' },
});
assert.equal(modernCheck.structuredContent.errorCount, 8);
console.log(
  `\n── 2026-07-28: server/discover offers ${discovered.supportedVersions.join(', ')}; check_ui found 8 errors`,
);
await modern.close();

console.log('\nsmoke test passed');
