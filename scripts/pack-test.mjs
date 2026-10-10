// Pack, install, run: the package as a user gets it. Packs the repository with `npm pack`
// (the prepack and postpack hooks run, as on publish), installs the tarball into a new project
// outside the repository, and runs what a user runs there: the installed `onsystem` bin
// (`--version`, `inspect`, `check`), an MCP stdio handshake with the installed server in both
// protocol eras, the Claude Code hook, which picks up the project's own install, and the
// ESLint plugin (`onsystem/eslint`) with its loader worker.
// Run after `pnpm build`. Needs the npm registry for the package's dependencies.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Client as ModernClient } from '@modelcontextprotocol/client';
import { StdioClientTransport as ModernStdioTransport } from '@modelcontextprotocol/client/stdio';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repo = path.resolve(import.meta.dirname, '..');
const windows = process.platform === 'win32';
const { version } = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
assert.ok(
  fs.existsSync(path.join(repo, 'dist', 'cli.js')),
  'dist/cli.js is missing: run pnpm build first',
);

/** Runs a command, through the shell on Windows, where npm and the bin shims are .cmd files. */
function run(command, args, cwd, expected = [0]) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: windows,
    env: { ...process.env, NO_COLOR: '1', npm_config_audit: 'false', npm_config_fund: 'false' },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!expected.includes(result.status ?? -1)) {
    throw new Error(
      `${command} ${args.join(' ')} exited ${result.status} in ${cwd}\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result;
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'onsystem-pack-'));
try {
  // 1. Pack, as `npm publish` would.
  const packed = run('npm', ['pack', '--json', '--pack-destination', work], repo);
  const [info] = JSON.parse(packed.stdout.slice(packed.stdout.indexOf('[')));
  const tarball = path.join(work, info.filename);
  const files = info.files.map((f) => f.path);
  for (const file of [
    'package.json',
    'README.md',
    'LICENSE',
    'schema.json',
    'dist/cli.js',
    'dist/index.js',
    'dist/eslint.js',
    'dist/eslint-worker.js',
  ]) {
    assert.ok(files.includes(file), `the tarball has ${file}`);
  }
  assert.ok(
    !files.some((f) => f.startsWith('src/') || f.startsWith('test/')),
    'no sources or tests',
  );
  console.log(
    `packed ${info.filename}: ${files.length} files, ${(info.size / 1024).toFixed(0)} kB`,
  );

  // 2. A shadcn/ui app with one component, a theme, and a page with two problems.
  const app = path.join(work, 'app');
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(app, file)), { recursive: true });
    fs.writeFileSync(path.join(app, file), text);
  };
  write('package.json', JSON.stringify({ name: 'pack-test-app', private: true, type: 'module' }));
  write(
    'tsconfig.json',
    JSON.stringify({ compilerOptions: { jsx: 'react-jsx', paths: { '@/*': ['./*'] } } }),
  );
  write(
    'components.json',
    JSON.stringify({ tailwind: { css: 'app/globals.css' }, aliases: { ui: '@/components/ui' } }),
  );
  write(
    'components/ui/button.tsx',
    'export function Button(props: { variant?: "default" | "destructive"; className?: string; children?: unknown }) { return <button className="bg-primary" /> }\n',
  );
  write(
    'app/globals.css',
    ':root { --primary: oklch(0.2 0 0); --destructive: oklch(0.58 0.22 27); }\n@theme inline { --color-primary: var(--primary); --color-destructive: var(--destructive); }\n',
  );
  write(
    'app/page.tsx',
    'import { Button } from "@/components/ui/button"\nexport default function Page() {\n  return <Button variant="danger" className="bg-[#ef4444]">Delete</Button>\n}\n',
  );

  // 3. Install the tarball, as a dev dependency.
  run('npm', ['install', '--save-dev', '--no-package-lock', tarball], app);
  const bin = (...args) => run('npx', ['--no-install', 'onsystem', ...args], app, [0, 1, 2]);

  const versionRun = bin('--version');
  assert.equal(versionRun.stdout.trim(), version);
  console.log(`onsystem --version: ${versionRun.stdout.trim()}`);

  const inspected = bin('inspect');
  assert.equal(inspected.status, 0, inspected.stderr);
  assert.match(
    inspected.stdout,
    /detected components\.json \(ui: @\/components\/ui → components\/ui\)/,
  );
  assert.match(inspected.stdout, /Components \(1 \+ 0 parts\)/);
  console.log('onsystem inspect: found Button through components.json');

  const checked = bin('check', '.', '--format', 'json');
  assert.equal(checked.status, 1, `check exits 1 on errors\n${checked.stderr}`);
  const results = JSON.parse(checked.stdout);
  const rules = results.flatMap((r) => r.diagnostics.map((d) => d.ruleId)).sort();
  assert.deepEqual(rules, ['no-hardcoded-color', 'no-unknown-variant']);
  assert.equal(results[0].file.replaceAll('\\', '/'), 'app/page.tsx');
  console.log(`onsystem check .: ${rules.join(', ')}`);

  // 4. The installed server over stdio, as an MCP client launches it.
  const cli = createRequire(path.join(app, 'package.json')).resolve('onsystem/package.json');
  const server = path.join(path.dirname(cli), 'dist', 'cli.js');
  const launch = {
    command: process.execPath,
    args: [server, '--no-watch'],
    cwd: app,
    stderr: 'pipe',
  };
  const legacy = new Client({ name: 'pack-test-2025', version: '1.0.0' });
  await legacy.connect(new StdioClientTransport(launch));
  assert.equal(legacy.getServerVersion()?.version, version);
  const listed = await legacy.callTool({ name: 'list_components', arguments: {} });
  assert.equal(listed.structuredContent.components[0].name, 'Button');
  const check = await legacy.callTool({ name: 'check_ui', arguments: { path: 'app/page.tsx' } });
  assert.equal(check.structuredContent.errorCount, 2);
  await legacy.close();
  console.log('MCP 2025-11-25 over stdio: list_components and check_ui');

  const modern = new ModernClient(
    { name: 'pack-test-2026', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  await modern.connect(new ModernStdioTransport(launch));
  assert.equal(modern.getNegotiatedProtocolVersion(), '2026-07-28');
  const modernCheck = await modern.callTool({
    name: 'check_ui',
    arguments: { code: '<Button variant="danger" />', filename: 'app/new.tsx' },
  });
  assert.equal(modernCheck.structuredContent.errorCount, 1);
  await modern.close();
  console.log('MCP 2026-07-28 over stdio: server/discover and check_ui');

  // 5. The Claude Code hook, which runs the project's own install rather than npx.
  const payload = JSON.stringify({
    tool_name: 'Write',
    cwd: app,
    session_id: `pack-test-${Date.now()}`,
    tool_input: { file_path: path.join(app, 'app', 'page.tsx') },
  });
  const env = { ...process.env };
  delete env.ONSYSTEM_BIN;
  delete env.DESIGN_SYSTEM_MCP_BIN;
  const hook = spawnSync(
    process.execPath,
    [path.join(repo, 'plugins/onsystem/hooks/check-ui.mjs')],
    {
      input: payload,
      encoding: 'utf8',
      env,
    },
  );
  assert.equal(hook.status, 2, `the hook blocks on errors\n${hook.stdout}\n${hook.stderr}`);
  assert.match(hook.stderr, /no-unknown-variant/);
  console.log('Claude Code hook: blocked the edit with the installed CLI');

  // 6. The ESLint plugin from the installed package, its rules called as ESLint calls them
  //    (ESLint itself is a peer the app brings), which starts the loader worker.
  const pluginPath = createRequire(path.join(app, 'package.json')).resolve('onsystem/eslint');
  const { default: plugin } = await import(pathToFileURL(pluginPath).href);
  const page = path.join(app, 'app', 'page.tsx');
  const sourceCode = { text: fs.readFileSync(page, 'utf8') };
  const reported = [];
  for (const [id, rule] of Object.entries(plugin.rules)) {
    const context = {
      cwd: app,
      filename: page,
      sourceCode,
      settings: {},
      report: () => reported.push(id),
    };
    rule.create(context)['Program:exit']({ type: 'Program' });
  }
  assert.deepEqual(reported.sort(), ['no-hardcoded-color', 'no-unknown-variant']);
  assert.equal(plugin.configs.recommended.plugins.onsystem, plugin);
  console.log(`ESLint plugin: ${reported.join(', ')}`);

  console.log('\npack test passed');
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
