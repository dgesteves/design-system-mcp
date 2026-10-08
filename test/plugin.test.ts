import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { fixture } from './helpers.js';

const REPO = path.resolve(import.meta.dirname, '..');
const PLUGIN = path.join(REPO, 'plugins/design-system');
const HOOK = path.join(PLUGIN, 'hooks/check-ui.mjs');

const readJson = (file: string) =>
  JSON.parse(fs.readFileSync(path.join(REPO, file), 'utf8')) as Record<string, unknown>;

describe('Claude Code plugin manifests', () => {
  it('lists the plugin in the marketplace and points every config at real files', () => {
    const marketplace = readJson('.claude-plugin/marketplace.json') as {
      name: string;
      plugins: { name: string; source: string }[];
    };
    const plugin = readJson('plugins/design-system/.claude-plugin/plugin.json');
    const pkg = readJson('package.json') as { name: string; version: string };
    // Claude Code updates installed plugins when `version` changes: it ships with each release.
    expect(plugin.version).toBe(pkg.version);
    expect(marketplace.name).toBe('dgesteves');
    expect(marketplace.plugins).toEqual([
      expect.objectContaining({ name: plugin.name, source: './plugins/design-system' }),
    ]);

    const mcp = readJson('plugins/design-system/.mcp.json') as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    const [major, minor] = pkg.version.split('.');
    const range = `^${major}.${minor}.0`;
    expect(mcp.mcpServers['design-system']?.args).toContain(`${pkg.name}@${range}`);
    // The hook runs the same release line.
    expect(fs.readFileSync(HOOK, 'utf8')).toContain(`const RANGE = '${range}';`);

    const hooks = readJson('plugins/design-system/hooks/hooks.json') as {
      hooks: { PostToolUse: { matcher: string; hooks: { command: string }[] }[] };
    };
    const [entry] = hooks.hooks.PostToolUse;
    expect(entry?.matcher).toBe('Write|Edit');
    expect(entry?.hooks[0]?.command).toBe('node "${CLAUDE_PLUGIN_ROOT}/hooks/check-ui.mjs"');
    expect(fs.existsSync(HOOK)).toBe(true);

    const skill = fs.readFileSync(path.join(PLUGIN, 'skills/design-system/SKILL.md'), 'utf8');
    expect(skill).toMatch(/^---\nname: design-system\ndescription: .+\n---\n/);
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
if (name === 'broken.tsx') { console.error('Invalid config'); process.exit(2); }
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
  });
  function hook(payload: unknown) {
    const run = spawnSync(process.execPath, [HOOK], {
      input: typeof payload === 'string' ? payload : JSON.stringify(payload),
      encoding: 'utf8',
      env: { ...process.env, DESIGN_SYSTEM_MCP_BIN: path.join(project, 'stub.mjs') },
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
      "app/bad.tsx: this change breaks the project's design system (design-system-mcp check). Fix these errors before moving on; get_component and get_tokens list the valid props, variants and tokens.\n\n" +
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

  it('stays silent for clean files, other files, CLI failures and bad input', () => {
    for (const payload of [
      edit('clean.tsx'),
      edit('broken.tsx'),
      edit('shape.tsx'),
      edit('notes.md'),
      { ...edit('x.tsx'), tool_input: {} },
      'not json',
    ]) {
      expect(hook(payload)).toEqual({ code: 0, stdout: '', stderr: '' });
    }
  });
});
