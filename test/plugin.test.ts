import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { fixture } from './helpers.js';

const REPO = path.resolve(import.meta.dirname, '..');
const PLUGIN = path.join(REPO, 'plugins/onsystem');
const HOOK = path.join(PLUGIN, 'hooks/check-ui.mjs');
const SYNC = path.join(REPO, 'scripts/sync-versions.mjs');

const readJson = (file: string) =>
  JSON.parse(fs.readFileSync(path.join(REPO, file), 'utf8')) as Record<string, unknown>;
const { version: VERSION } = readJson('package.json') as { version: string };
/** The environment without the variables that point the hook at a CLI. */
const withoutBin = ({
  ONSYSTEM_BIN: _bin,
  DESIGN_SYSTEM_MCP_BIN: _legacy,
  ...env
}: NodeJS.ProcessEnv) => env;

describe('Claude Code plugin manifests', () => {
  it('lists the plugin in the marketplace and points every config at real files', () => {
    const marketplace = readJson('.claude-plugin/marketplace.json') as {
      name: string;
      plugins: { name: string; source: string }[];
    };
    const plugin = readJson('plugins/onsystem/.claude-plugin/plugin.json');
    const pkg = readJson('package.json') as { name: string; version: string };
    expect(pkg.name).toBe('onsystem');
    expect(plugin.name).toBe('onsystem');
    // Claude Code updates installed plugins when `version` changes: it ships with each release.
    expect(plugin.version).toBe(pkg.version);
    expect(marketplace.name).toBe('dgesteves');
    expect(marketplace.plugins).toEqual([
      expect.objectContaining({ name: plugin.name, source: './plugins/onsystem' }),
    ]);

    // The server and the hook run exactly this release: the plugin directory refuses ranges.
    const mcp = readJson('plugins/onsystem/.mcp.json') as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    expect(Object.keys(mcp.mcpServers)).toEqual(['onsystem']);
    expect(mcp.mcpServers.onsystem).toEqual({
      command: 'npx',
      args: ['-y', `${pkg.name}@${pkg.version}`],
    });
    const hookSource = fs.readFileSync(HOOK, 'utf8');
    expect(hookSource).toContain(`const PACKAGE = '${pkg.name}';`);
    expect(hookSource).toContain(`const VERSION = '${pkg.version}';`);
    expect(hookSource).not.toMatch(/@\^|@~|@latest/);

    const hooks = readJson('plugins/onsystem/hooks/hooks.json') as {
      hooks: { PostToolUse: { matcher: string; hooks: { command: string }[] }[] };
    };
    const [entry] = hooks.hooks.PostToolUse;
    expect(entry?.matcher).toBe('Write|Edit');
    expect(entry?.hooks[0]?.command).toBe('node "${CLAUDE_PLUGIN_ROOT}/hooks/check-ui.mjs"');
    expect(fs.existsSync(HOOK)).toBe(true);

    const skill = fs.readFileSync(path.join(PLUGIN, 'skills/onsystem/SKILL.md'), 'utf8');
    expect(skill).toMatch(/^---\nname: onsystem\ndescription: .+\n---\n/);

    // The MCP Registry entry names the same package and version.
    const server = readJson('server.json') as {
      name: string;
      version: string;
      packages: { identifier: string; version: string }[];
    };
    expect(server.name).toBe((readJson('package.json') as { mcpName: string }).mcpName);
    expect(server.version).toBe(pkg.version);
    expect(server.packages).toEqual([
      expect.objectContaining({ identifier: pkg.name, version: pkg.version }),
    ]);
  });

  it('meets the Claude plugin directory checks that a test can make', () => {
    const plugin = readJson('plugins/onsystem/.claude-plugin/plugin.json');
    expect(plugin).toMatchObject({
      description: expect.any(String) as string,
      author: { name: 'Diogo Esteves' },
      license: 'MIT',
      icon: './icon.svg',
    });
    expect(plugin.name).toMatch(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/);
    // The icon is the site's.
    expect(fs.readFileSync(path.join(PLUGIN, 'icon.svg'), 'utf8')).toBe(
      fs.readFileSync(path.join(REPO, 'site/app/icon.svg'), 'utf8'),
    );

    // A README of at least 40 words outside code blocks, which says what the hook runs and touches.
    const readme = fs.readFileSync(path.join(PLUGIN, 'README.md'), 'utf8');
    const prose = readme.replace(/```[\s\S]*?```/g, '');
    expect(prose.split(/\s+/).filter((w) => /\w/.test(w)).length).toBeGreaterThanOrEqual(40);
    expect(prose).toContain('## What it runs');
    expect(prose).toContain('## What data it touches');

    // Small text files only, no system files, no package-manager config, no lockfile install.
    const files = fs.readdirSync(PLUGIN, { recursive: true, withFileTypes: true });
    for (const entry of files.filter((f) => f.isFile())) {
      const file = path.join(entry.parentPath, entry.name);
      expect(fs.statSync(file).size, file).toBeLessThan(256 * 1024);
      expect(entry.name).not.toMatch(
        /^(?:\.DS_Store|Thumbs\.db|desktop\.ini|\.npmrc|package(?:-lock)?\.json)$/,
      );
    }
  });

  it('keeps the version pins in sync with package.json, and says when they drift', () => {
    const sync = (...args: string[]) =>
      spawnSync(process.execPath, [SYNC, ...args], { encoding: 'utf8' });
    expect(sync('--check').status).toBe(0);

    // A copy of the files it writes, at another version, as `changeset version` leaves them.
    const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'onsystem-sync-'));
    try {
      for (const file of [
        'package.json',
        '.prettierrc.json',
        'server.json',
        'plugins/onsystem/.claude-plugin/plugin.json',
        'plugins/onsystem/.mcp.json',
        'plugins/onsystem/hooks/check-ui.mjs',
      ]) {
        fs.mkdirSync(path.dirname(path.join(copy, file)), { recursive: true });
        fs.copyFileSync(path.join(REPO, file), path.join(copy, file));
      }
      const manifest = path.join(copy, 'package.json');
      fs.writeFileSync(
        manifest,
        fs.readFileSync(manifest, 'utf8').replace(/"version": "[^"]+"/, '"version": "9.8.7"'),
      );
      const drift = sync('--check', '--root', copy);
      expect(drift.status).toBe(1);
      expect(drift.stderr).toContain('Not at onsystem@9.8.7: server.json, ');

      expect(sync('--root', copy).status).toBe(0);
      expect(sync('--check', '--root', copy).status).toBe(0);
      const read = (file: string) => fs.readFileSync(path.join(copy, file), 'utf8');
      expect(read('plugins/onsystem/.mcp.json')).toContain('"onsystem@9.8.7"');
      expect(read('plugins/onsystem/hooks/check-ui.mjs')).toContain("const VERSION = '9.8.7';");
      expect(JSON.parse(read('plugins/onsystem/.claude-plugin/plugin.json'))).toMatchObject({
        version: '9.8.7',
      });
      expect(JSON.parse(read('server.json'))).toMatchObject({
        version: '9.8.7',
        packages: [{ identifier: 'onsystem', version: '9.8.7' }],
      });
    } finally {
      fs.rmSync(copy, { recursive: true, force: true });
    }
  });
});

describe('check-ui hook', () => {
  // Stands in for the CLI: answers `check <file> --format json …` by file name.
  const STUB = `const file = process.argv[3];
const result = (diagnostics) => JSON.stringify([{ file, diagnostics, errorCount: 0, warningCount: 0 }]);
const d = (severity, line, column = 2) => ({ ruleId: 'no-hardcoded-color', severity, message: 'Hardcoded color \`bg-[#ef4444]\` → \`bg-destructive\`.', line, column });
const name = file.split(/[\\\\/]/).pop();
if (name === 'bad.tsx') { console.log(result([d('error', 1), d('warning', 1, 9)])); process.exit(1); }
if (name === 'many.tsx') { console.log(result(Array.from({ length: 40 }, (_, i) => d('error', i + 1)))); process.exit(1); }
if (name === 'mixed.tsx') { console.log(result([...Array.from({ length: 35 }, (_, i) => d('warning', i + 1)), d('error', 36)])); process.exit(1); }
if (name === 'scoped.tsx') { console.log(result([d('error', 2), d('error', 8)])); process.exit(1); }
if (name === 'warn.tsx') { console.log(result([d('warning', 4)])); process.exit(0); }
if (name === 'where.tsx') { console.log(result([{ ...d('error', 1), message: 'cwd=' + process.cwd() }])); process.exit(1); }
if (name === 'shape.tsx') { console.log(JSON.stringify({ results: [] })); process.exit(0); }
if (name === 'broken.tsx') { console.error('Invalid config in /app/onsystem.config.json:'); process.exit(2); }
if (name === 'policy.tsx') { console.error('npm error code ENOVERSIONS\\nnpm error No versions available for onsystem'); process.exit(1); }
if (name === 'teapot.tsx') { console.error('npm error 418 I am a teapot: https://bot:s3cret@registry.acme.dev/pkg'); process.exit(1); }
if (!process.argv.includes('--quiet-without-design-system')) process.exit(3);
console.log(result([]));
`;

  const project = fixture({
    'stub.mjs': STUB,
    'package.json': '{"name":"app"}',
    'app/scoped.tsx': Array.from({ length: 10 }, (_, i) => `const line${i + 1} = ${i + 1}`).join(
      '\n',
    ),
    'packages/web/package.json': '{"name":"web"}',
    'libs/ui/project.json': '{"name":"ui"}',
  });
  function hook(payload: unknown, env: Record<string, string> = {}) {
    const run = spawnSync(process.execPath, [HOOK], {
      input: typeof payload === 'string' ? payload : JSON.stringify(payload),
      encoding: 'utf8',
      env: {
        ...withoutBin(process.env),
        ...(Object.keys(env).length ? env : { ONSYSTEM_BIN: path.join(project, 'stub.mjs') }),
      },
    });
    return { code: run.status, stdout: run.stdout, stderr: run.stderr };
  }
  const edit = (file: string, input: Record<string, unknown> = {}) => ({
    hook_event_name: 'PostToolUse',
    tool_name: 'Edit',
    cwd: project,
    tool_input: { file_path: path.join(project, 'app', file), ...input },
  });

  it('hands errors back to Claude with exit code 2', () => {
    const { code, stdout, stderr } = hook(edit('bad.tsx'));
    expect(code).toBe(2);
    expect(stdout).toBe('');
    expect(stderr).toBe(
      "app/bad.tsx: this change breaks the project's design system (onsystem check). Fix these errors before moving on; get_component and get_tokens list the valid props, variants and tokens.\n\n" +
        '1:2 error [no-hardcoded-color] Hardcoded color `bg-[#ef4444]` → `bg-destructive`.\n' +
        '1:9 warning [no-hardcoded-color] Hardcoded color `bg-[#ef4444]` → `bg-destructive`.\n',
    );
  });

  it('lists errors first and caps a long list', () => {
    const mixed = hook(edit('mixed.tsx')).stderr.split('\n');
    expect(mixed[2]).toMatch(/^36:2 error /);
    expect(mixed.at(-2)).toBe('…and 6 more. Run check_ui on the file to see them all.');
    expect(hook(edit('many.tsx')).stderr.trim().split('\n').at(-1)).toBe(
      '…and 10 more. Run check_ui on the file to see them all.',
    );
  });

  it('holds an Edit to the lines it changed', () => {
    const touching = hook(edit('scoped.tsx', { old_string: 'x', new_string: 'const line8 = 8' }));
    expect(touching.code).toBe(2);
    expect(touching.stderr).toContain('8:2 error');
    expect(touching.stderr).not.toContain('2:2 error');
    expect(touching.stderr).toContain(
      '(1 other finding elsewhere in the file predate this edit; leave them unless asked.)',
    );
    // An edit on a clean line says nothing about older findings.
    expect(hook(edit('scoped.tsx', { new_string: 'const line5 = 5' }))).toEqual({
      code: 0,
      stdout: '',
      stderr: '',
    });
    // A Write is the whole file.
    expect(hook({ ...edit('scoped.tsx'), tool_name: 'Write' }).stderr).toContain('2:2 error');
  });

  it('runs from the nearest project folder and resolves relative paths', () => {
    const nested = {
      ...edit('x'),
      tool_input: { file_path: 'packages/web/src/where.tsx' },
    };
    expect(hook(nested).stderr).toContain(
      `cwd=${fs.realpathSync(path.join(project, 'packages/web'))}`,
    );
    // An Nx project marks its folder with project.json alone, as `check` from the root reads it.
    const nx = { ...edit('x'), tool_input: { file_path: 'libs/ui/src/where.tsx' } };
    expect(hook(nx).stderr).toContain(`cwd=${fs.realpathSync(path.join(project, 'libs/ui'))}`);
  });

  it('passes warnings on as context without blocking', () => {
    const { code, stdout } = hook(edit('warn.tsx'));
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: expect.stringContaining('4:2 warning [no-hardcoded-color]') as string,
      },
    });
  });

  it('tells the user once when the CLI cannot run, and never blocks the edit', () => {
    // documenso's min-release-age policy: npx exits 1 with npm's error.
    const session = { session_id: randomUUID() };
    const first = hook({ ...edit('policy.tsx'), ...session });
    expect(first.code).toBe(0);
    const notice = `onsystem could not check app/policy.tsx, so edits are not being checked against the design system: npm found no version of onsystem@${VERSION} it may install (ENOVERSIONS), as with a min-release-age policy. Run \`onsystem check app/policy.tsx\` to see why.`;
    expect(JSON.parse(first.stdout)).toEqual({ systemMessage: notice });
    expect(first.stderr).toBe(`${notice}\n`);
    // Once per session and project.
    expect(hook({ ...edit('policy.tsx'), ...session })).toEqual({
      code: 0,
      stdout: '',
      stderr: '',
    });
    // A broken config, in another session.
    const config = hook({ ...edit('broken.tsx'), session_id: randomUUID() });
    expect(config.code).toBe(0);
    expect(config.stderr).toContain(': Invalid config in /app/onsystem.config.json:');
    expect(config.stderr).toContain('Fix the config, or run `onsystem inspect`');
    // Other npm errors pass on their first line, without credentials.
    const teapot = hook({ ...edit('teapot.tsx'), session_id: randomUUID() });
    expect(teapot.stderr).toContain('npm error 418 I am a teapot: https://registry.acme.dev/pkg.');
    expect(teapot.stderr).not.toContain('s3cret');
  });

  it('still reads DESIGN_SYSTEM_MCP_BIN, and says once that it was renamed', () => {
    const session = { session_id: randomUUID() };
    const legacy = { DESIGN_SYSTEM_MCP_BIN: path.join(project, 'stub.mjs') };
    // It runs the CLI that one names. A blocked edit's stderr is for Claude: no notice there.
    const blocked = hook({ ...edit('bad.tsx'), ...session }, legacy);
    expect(blocked.code).toBe(2);
    expect(blocked.stderr).toContain('1:2 error [no-hardcoded-color]');
    expect(blocked.stderr).not.toContain('DESIGN_SYSTEM_MCP_BIN');
    // On the debug log when the hook passes, once per session and project.
    expect(hook({ ...edit('clean.tsx'), ...session }, legacy)).toEqual({
      code: 0,
      stdout: '',
      stderr: 'DESIGN_SYSTEM_MCP_BIN is the name ONSYSTEM_BIN had before the rename: rename it.\n',
    });
    expect(hook({ ...edit('clean.tsx'), ...session }, legacy)).toEqual({
      code: 0,
      stdout: '',
      stderr: '',
    });
  });

  it('stays silent for clean files, other files, unexpected output and bad input', () => {
    for (const payload of [
      edit('clean.tsx'),
      edit('shape.tsx'),
      edit('notes.md'),
      { ...edit('x.tsx'), tool_input: {} },
      'not json',
    ]) {
      expect(hook(payload)).toEqual({ code: 0, stdout: '', stderr: '' });
    }
  });
});
