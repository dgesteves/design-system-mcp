import fs from 'node:fs';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { main, type Io } from '../src/cli.js';
import { loadDesignSystem } from '../src/design-system.js';
import { workspacePackageDirs } from '../src/detect.js';
import { createServer } from '../src/server/index.js';
import { WorkspaceProjects } from '../src/server/projects.js';
import { serveStdio } from '../src/server/stdio.js';
import { silentLogger } from '../src/util/log.js';
import { loadTarget, PROJECT_MARKERS, projectDirOf } from '../src/workspace.js';
import { fixture } from './helpers.js';

const json = (value: unknown) => JSON.stringify(value, null, 2);

/** A pnpm monorepo: an app on a workspace design-system package, an app with its own shadcn/ui components, and a package without either. */
const MONOREPO = {
  'pnpm-workspace.yaml': 'packages:\n  - apps/*\n  - packages/*\n  - "!packages/ignored"\n',
  'package.json': json({ name: 'acme', private: true }),
  'packages/ui/package.json': json({
    name: '@acme/ui',
    exports: {
      './button': './src/button.tsx',
      './card': './src/card.tsx',
      './input': './src/input.tsx',
    },
  }),
  'packages/ui/src/button.tsx':
    'export function Button(props: { variant?: "default" | "outline"; children?: unknown }) { return <button className="p-[3px]" /> }\n',
  'packages/ui/src/card.tsx':
    'export function Card(props: { children?: unknown }) { return <div /> }\n',
  'packages/ui/src/input.tsx':
    'export function Input(props: { value?: string }) { return <input /> }\n',
  'packages/ui/src/field.tsx':
    'import { Input } from "./input";\nexport const Field = () => <div><Input value="x" /></div>;\n',
  'apps/web/package.json': json({ name: '@acme/web', dependencies: { '@acme/ui': 'workspace:*' } }),
  'apps/web/app/page.tsx':
    'import { Button } from "@acme/ui/button";\nexport default () => <Button variant="danger">Go</Button>;\n',
  'apps/admin/package.json': json({ name: '@acme/admin' }),
  'apps/admin/components.json': json({ aliases: { ui: '@/components/ui' } }),
  'apps/admin/tsconfig.json': json({
    compilerOptions: { jsx: 'react-jsx', paths: { '@/*': ['./*'] } },
  }),
  'apps/admin/components/ui/button.tsx':
    'export function Button(props: { variant?: "default" | "ghost"; children?: unknown }) { return <button /> }\n',
  'apps/admin/app/page.tsx':
    'import { Button } from "@/components/ui/button";\nexport default () => <Button variant="outline">Go</Button>;\n',
  'packages/utils/package.json': json({ name: '@acme/utils' }),
  'packages/utils/src/x.tsx': 'export const X = () => <button><svg /></button>;\n',
  'packages/ignored/package.json': json({ name: 'ignored' }),
  'packages/ignored/components/ui/button.tsx': 'export function Button() { return <button /> }\n',
};

async function run(args: string[], cwd: string) {
  const out: string[] = [];
  const err: string[] = [];
  const io: Io = { cwd, color: false, stdout: (t) => out.push(t), stderr: (t) => err.push(t) };
  const code = await main(args, io);
  return { code, stdout: out.join('\n'), stderr: err.join('\n') };
}

type Results = { file: string; diagnostics: { ruleId: string; message: string }[] }[];

describe('workspace roots', () => {
  it('finds every app and design-system package, and leaves out negated folders', async () => {
    const root = fixture(MONOREPO);
    const { workspace } = await loadTarget({ cwd: root });
    expect(workspace?.source).toBe('pnpm-workspace.yaml');
    expect(workspace?.projects.map((p) => [p.dir, p.name, p.config.detected])).toEqual([
      ['apps/admin', '@acme/admin', 'components.json (ui: @/components/ui → components/ui)'],
      ['apps/web', '@acme/web', 'workspace package @acme/ui'],
      ['packages/ui', '@acme/ui', 'package.json exports of @acme/ui'],
    ]);
    expect(workspace?.others).toEqual(['packages/utils']);
  });

  it('routes each file to the nearest folder with a package.json, as the hook does', async () => {
    const root = fixture(MONOREPO);
    const { workspace } = await loadTarget({ cwd: root });
    const dirOf = async (file: string) => (await workspace?.projectFor(file))?.dir;
    expect(await dirOf('apps/web/app/page.tsx')).toBe('apps/web');
    expect(await dirOf(path.join(root, 'packages/ui/src/button.tsx'))).toBe('packages/ui');
    // A package without a design system still gets its own config, so its files are
    // checked as they would be from there.
    expect(await dirOf('packages/utils/src/x.tsx')).toBe('packages/utils');
    expect(await dirOf('README.md')).toBe('.');
    expect(projectDirOf(path.join(root, 'apps/web'), root)).toBe(path.join(root, 'apps/web'));
  });

  it('marks projects with the same files as the Claude Code hook', () => {
    const hook = fs.readFileSync(
      path.resolve(import.meta.dirname, '../plugins/onsystem/hooks/check-ui.mjs'),
      'utf8',
    );
    const list = /const PROJECT_FILES = \[([\s\S]*?)\];/.exec(hook)?.[1] ?? '';
    const names = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(new Set(names)).toEqual(new Set(PROJECT_MARKERS));
  });

  it('keeps one project where the root has a design system or a config sets components', async () => {
    const shadcn = fixture({
      ...MONOREPO,
      'components.json': json({ aliases: { ui: '@/components/ui' } }),
      'tsconfig.json': json({ compilerOptions: { paths: { '@/*': ['./*'] } } }),
      'components/ui/badge.tsx': 'export function Badge() { return <span /> }\n',
    });
    expect((await loadTarget({ cwd: shadcn })).workspace).toBeUndefined();
    const configured = fixture({
      ...MONOREPO,
      'onsystem.config.json': json({ components: ['packages/ui/src/**/*.tsx'] }),
    });
    expect((await loadTarget({ cwd: configured })).workspace).toBeUndefined();
    const flags = fixture({ ...MONOREPO, 'theme.css': ':root { --primary: #000; }\n' });
    expect((await loadTarget({ cwd: flags, tokens: ['theme.css'] })).workspace).toBeUndefined();
  });

  it('reads Nx project.json folders and lerna.json packages', () => {
    const nx = fixture({
      'nx.json': '{}',
      'package.json': json({ name: 'nx-root' }),
      'libs/ui/project.json': json({ name: 'ui' }),
      'apps/site/project.json': json({ name: 'site' }),
      'dist/libs/ui/project.json': json({ name: 'copy' }),
    });
    expect(workspacePackageDirs(nx).map((d) => path.relative(nx, d))).toEqual([
      path.join('apps', 'site'),
      path.join('libs', 'ui'),
    ]);
    const lerna = fixture({
      'lerna.json': json({ packages: ['modules/*'] }),
      'package.json': json({ name: 'lerna-root' }),
      'modules/a/package.json': json({ name: 'a' }),
    });
    expect(workspacePackageDirs(lerna).map((d) => path.relative(lerna, d))).toEqual([
      path.join('modules', 'a'),
    ]);
  });
});

describe('onsystem check from a workspace root', () => {
  it("checks each file against its own project's design system, as from that folder", async () => {
    const root = fixture(MONOREPO);
    const fromRoot = await run(['check', '.', '--no-cache'], root);
    expect(fromRoot.code).toBe(1);
    expect(fromRoot.stdout).toContain(
      'apps/web/app/page.tsx\n  2:38  error  "danger" is not a valid variant for <Button>. Allowed: default, outline.',
    );
    expect(fromRoot.stdout).toContain(
      'apps/admin/app/page.tsx\n  2:38  error  "outline" is not a valid variant for <Button>. Allowed: default, ghost.',
    );
    // Each folder's own component files are skipped (packages/ignored is no workspace
    // package, but has a package.json and components/ui of its own); packages/ui's
    // field.tsx uses them, so it is checked.
    expect(fromRoot.stdout).toContain(
      '3 errors, 0 warnings in 3 of 4 files checked (4 projects; 5 design-system files skipped)',
    );
    expect(fromRoot.stdout).toContain(
      'No color tokens found in apps/admin, apps/web and packages/ui: no-hardcoded-color did not run.',
    );
    expect(fromRoot.stdout).toContain(
      'No design system found in packages/utils (no components or color tokens)',
    );

    const json = await run(['check', '.', '--no-cache', '--format', 'json'], root);
    const results = JSON.parse(json.stdout) as Results;
    const fromApp = JSON.parse(
      (await run(['check', '.', '--no-cache', '--format', 'json'], path.join(root, 'apps/web')))
        .stdout,
    ) as Results;
    const web = results.filter((r) => r.file.startsWith('apps/web/'));
    expect(web.map((r) => ({ ...r, file: r.file.slice('apps/web/'.length) }))).toEqual(fromApp);
  });

  it('records one baseline at the root, and gates on any project having a design system', async () => {
    const root = fixture(MONOREPO);
    const update = await run(['check', '.', '--no-cache', '--update-baseline'], root);
    expect(update.stdout).toBe('Baseline: 3 findings in 3 files → onsystem.baseline.json');
    const again = await run(['check', '.', '--no-cache'], root);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain('No new problems in 4 files (3 in the baseline; 4 projects');

    const required = await run(['check', '.', '--no-cache', '--require-design-system'], root);
    // No project has color tokens.
    expect(required.code).toBe(2);
    expect(required.stderr).toContain(
      'check --require-design-system: no workspace package has a design system with components and color tokens (4 packages looked at)',
    );
    const themed = fixture({
      ...MONOREPO,
      'apps/web/app/globals.css': ':root { --primary: oklch(0.2 0 0); }\n',
    });
    expect((await run(['check', '.', '--no-cache', '--require-design-system'], themed)).code).toBe(
      1,
    );
  });

  it('applies a root config without components to every project without its own', async () => {
    const root = fixture({
      ...MONOREPO,
      'onsystem.config.json': json({
        rules: { 'no-unknown-variant': 'warn' },
        overrides: [{ files: ['apps/admin/**'], rules: { 'no-unknown-variant': 'off' } }],
      }),
      'apps/web/onsystem.config.json': json({ rules: { 'icon-button-accessible-name': 'off' } }),
    });
    const { workspace } = await loadTarget({ cwd: root });
    expect(workspace?.configFile).toBe(path.join(root, 'onsystem.config.json'));
    const { stdout } = await run(['check', '.', '--no-cache'], root);
    // apps/web has its own config: its error stays an error. apps/admin takes the root's
    // override, matched from the root; packages/utils takes the root's rules.
    expect(stdout).toContain('"danger" is not a valid variant');
    expect(stdout).not.toContain('"outline" is not a valid variant');
    // packages/utils keeps its icon-button error under the root's rules.
    expect(stdout).toContain('2 errors, 0 warnings in 2 of 4 files checked');
  });

  it('lists every project with what it found in inspect', async () => {
    const root = fixture(MONOREPO);
    const { code, stdout } = await run(['inspect', '--no-cache'], root);
    expect(code).toBe(0);
    expect(stdout).toContain(
      'workspace 4 packages (pnpm-workspace.yaml), 3 projects with a design system',
    );
    expect(stdout).toContain(
      'apps/web (@acme/web)\n  detected   workspace package @acme/ui\n  files      3 component files, 0 token files, 0 docs\n  components 3 + 0 parts: Button, Card, Input',
    );
    expect(stdout).toContain('Without a design system (1): packages/utils');
    const parsed = JSON.parse(
      (await run(['inspect', '--no-cache', '--format', 'json'], root)).stdout,
    ) as { projects: { dir: string; model: { components: unknown[] } }[]; others: string[] };
    expect(parsed.projects.map((p) => [p.dir, p.model.components.length])).toEqual([
      ['apps/admin', 1],
      ['apps/web', 3],
      ['packages/ui', 3],
    ]);
    expect(parsed.others).toEqual(['packages/utils']);
  });
});

function text(result: unknown): string {
  const content = (result as CallToolResult).content[0];
  return content?.type === 'text' ? content.text : '';
}

describe('MCP server at a workspace root', () => {
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  let projects: WorkspaceProjects;

  beforeAll(async () => {
    const root = fixture(MONOREPO);
    const { workspace } = await loadTarget({ cwd: root });
    if (!workspace) throw new Error('expected a workspace');
    projects = new WorkspaceProjects(workspace, {
      cache: false,
      watch: false,
      logger: silentLogger,
    });
    const server = createServer({
      getDesignSystem: () => Promise.reject(new Error('not used')),
      getProjects: () => Promise.resolve(projects),
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });

  afterAll(async () => {
    projects.close();
    await client.close();
  });

  it('lists every project together, each component tagged with its package', async () => {
    const result = await client.callTool({ name: 'list_components', arguments: {} });
    expect(text(result)).toContain('4 components from 2 packages, used by 3 projects.');
    expect(text(result)).toContain('## @acme/ui (used by apps/web and packages/ui)');
    expect(text(result)).toContain('Button <button> (also in @acme/admin) — No description.');
    const { components } = result.structuredContent as {
      components: { name: string; package: string; projects: string[]; importPath: string }[];
    };
    expect(components.map((c) => [c.name, c.package, c.projects, c.importPath])).toEqual([
      ['Button', '@acme/admin', ['apps/admin'], '@/components/ui/button'],
      ['Button', '@acme/ui', ['apps/web', 'packages/ui'], '@acme/ui/button'],
      ['Card', '@acme/ui', ['apps/web', 'packages/ui'], '@acme/ui/card'],
      ['Input', '@acme/ui', ['apps/web', 'packages/ui'], '@acme/ui/input'],
    ]);
    const scoped = await client.callTool({
      name: 'list_components',
      arguments: { path: 'apps/admin/app/page.tsx' },
    });
    expect(text(scoped)).toMatch(/^1 component in apps\/admin\./);
  });

  it('asks for a path when a name means two components, and answers for the project it picks', async () => {
    const ambiguous = await client.callTool({
      name: 'get_component',
      arguments: { name: 'Button' },
    });
    expect(ambiguous.isError).toBe(true);
    expect(text(ambiguous)).toContain('"Button" is the name of 2 components in this monorepo:');
    expect(text(ambiguous)).toContain(
      '- @acme/ui: packages/ui/src/button.tsx, used by apps/web and packages/ui (import { Button } from "@acme/ui/button")',
    );
    expect(text(ambiguous)).toContain('(apps/admin, apps/web, packages/ui)');

    const picked = await client.callTool({
      name: 'get_component',
      arguments: { name: 'Button', path: 'apps/web/app/page.tsx' },
    });
    expect(text(picked)).toContain('import { Button } from "@acme/ui/button"');
    // Paths are relative to the root the client knows.
    expect(text(picked)).toContain('packages/ui/src/button.tsx:1');
    expect(picked.structuredContent).toMatchObject({
      name: 'Button',
      source: { file: 'packages/ui/src/button.tsx' },
    });

    const unique = await client.callTool({ name: 'get_component', arguments: { name: 'Card' } });
    expect(text(unique)).toContain('From @acme/ui, used by apps/web and packages/ui.');
    expect(unique.structuredContent).toMatchObject({ package: '@acme/ui' });

    const outside = await client.callTool({
      name: 'get_component',
      arguments: { name: 'Card', path: '../elsewhere' },
    });
    expect(outside.isError).toBe(true);
    expect(text(outside)).toContain('is outside the workspace root');
  });

  it("checks code by the project of the file it names, and asks for one when it can't tell", async () => {
    const code =
      'import { Button } from "@acme/ui/button";\nexport const A = () => <Button variant="ghost" />;\n';
    const web = await client.callTool({
      name: 'check_ui',
      arguments: { code, filename: 'apps/web/components/a.tsx' },
    });
    expect(text(web)).toContain('apps/web/components/a.tsx: 1 error');
    expect(text(web)).toContain(
      '"ghost" is not a valid variant for <Button>. Allowed: default, outline.',
    );

    const file = await client.callTool({
      name: 'check_ui',
      arguments: { path: 'apps/admin/app/page.tsx' },
    });
    expect(text(file)).toContain('apps/admin/app/page.tsx: 1 error');
    expect(text(file)).toContain('Allowed: default, ghost.');

    const unknown = await client.callTool({ name: 'check_ui', arguments: { code } });
    expect(unknown.isError).toBe(true);
    expect(text(unknown)).toContain(
      'This is a monorepo root with 3 projects (apps/admin, apps/web and packages/ui). Pass `filename`',
    );
  });

  it('searches, lists tokens and reads resources across projects', async () => {
    const search = await client.callTool({
      name: 'search_components',
      arguments: { query: 'card' },
    });
    expect(text(search)).toContain('1. Card from @acme/ui');
    const resources = await client.listResources();
    expect(resources.resources.map((r) => r.uri)).toEqual(
      expect.arrayContaining([
        'ds://components/Button?path=apps%2Fadmin',
        'ds://components/Button?path=apps%2Fweb',
        'ds://components/Card',
      ]),
    );
    const read = await client.readResource({ uri: 'ds://components/Button?path=apps%2Fadmin' });
    const [content] = read.contents;
    expect(content && 'text' in content ? content.text : '').toContain(
      'import { Button } from "@/components/ui/button"',
    );
    const tokens = await client.callTool({ name: 'get_tokens', arguments: {} });
    expect(text(tokens)).toContain('No design tokens found in any project of this monorepo');
  });

  it('serves a workspace root over stdio when started there', async () => {
    const root = fixture(MONOREPO);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = await serveStdio({
      cwd: root,
      cache: false,
      watch: false,
      logger: silentLogger,
      transport: serverTransport,
    });
    const stdioClient = new Client({ name: 'stdio-test', version: '1.0.0' });
    await stdioClient.connect(clientTransport);
    const result = await stdioClient.callTool({
      name: 'get_component',
      arguments: { name: 'Button', path: 'apps/admin' },
    });
    expect(text(result)).toContain('variant?: "default" | "ghost"');
    await stdioClient.close();
    await server.close();
  });
});

describe('workspace projects load their design systems lazily', () => {
  it('loads a project only when a path needs it', async () => {
    const root = fixture(MONOREPO);
    const { workspace } = await loadTarget({ cwd: root });
    if (!workspace) throw new Error('expected a workspace');
    const set = new WorkspaceProjects(workspace, {
      cache: false,
      watch: false,
      logger: silentLogger,
    });
    const { ds, dir } = await set.forPath('packages/utils/src/x.tsx');
    expect(dir).toBe('packages/utils');
    expect(ds.components).toHaveLength(0);
    const direct = await loadDesignSystem(ds.config, { cache: false });
    expect(direct.components).toHaveLength(0);
    set.close();
  });
});
