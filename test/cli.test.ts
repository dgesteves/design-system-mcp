import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { main, type Io } from '../src/cli.js';
import { VERSION } from '../src/version.js';
import { DEMO_ROOT } from './helpers.js';

async function run(args: string[], cwd = DEMO_ROOT) {
  const out: string[] = [];
  const err: string[] = [];
  const io: Io = { cwd, color: false, stdout: (t) => out.push(t), stderr: (t) => err.push(t) };
  const code = await main(args, io);
  return { code, stdout: out.join('\n'), stderr: err.join('\n') };
}

describe('design-system-mcp check', () => {
  it('exits 1 and prints grouped diagnostics when there are errors', async () => {
    const { code, stdout } = await run(['check', 'app/**/*.tsx', '--no-cache']);
    expect(code).toBe(1);
    expect(stdout).toContain('app/settings/danger-zone.tsx');
    expect(stdout).toContain('18:25  error  "danger" is not a valid variant for <Button>.');
    expect(stdout).toContain('8 errors, 3 warnings in 2 files');
    expect(stdout).not.toContain('members.tsx');
  });

  it('exits 0 on clean files', async () => {
    const { code, stdout } = await run(['check', 'app/settings/members.tsx', '--no-cache']);
    expect(code).toBe(0);
    expect(stdout).toBe('No problems in 1 file.');
  });

  it('emits GitHub Actions annotations', async () => {
    const { stdout } = await run([
      'check',
      'app/settings/danger-zone.tsx',
      '--format',
      'github',
      '--no-cache',
    ]);
    expect(stdout.split('\n')[0]).toBe(
      '::error file=app/settings/danger-zone.tsx,line=11,col=22,endLine=11,endColumn=38,title=no-hardcoded-color::Hardcoded color `border-[#ef4444]`. Nearest token destructive (ΔE 0.071) → `border-destructive`.',
    );
  });

  it('emits JSON and enforces --max-warnings', async () => {
    const json = await run([
      'check',
      'app/settings/danger-zone.tsx',
      '--format',
      'json',
      '--no-cache',
    ]);
    const results = JSON.parse(json.stdout) as { errorCount: number }[];
    expect(results[0]?.errorCount).toBe(8);

    const warnOnly = await run([
      'check',
      'app/settings/danger-zone.tsx',
      '--no-cache',
      '--config',
      path.join(import.meta.dirname, 'fixtures/warn-only.config.json'),
      '--root',
      DEMO_ROOT,
      '--max-warnings',
      '0',
    ]);
    expect(warnOnly.code).toBe(1);
    expect(warnOnly.stderr).toContain('Too many warnings');
  });

  it('reports usage errors with exit code 2', async () => {
    expect((await run(['check'])).code).toBe(2);
    expect((await run(['check', 'nope/**/*.tsx'])).stderr).toContain('no files match');
    expect((await run(['check', 'x.tsx', '--format', 'xml'])).code).toBe(2);
    expect((await run(['frobnicate'])).code).toBe(2);
    expect((await run(['--bogus'])).code).toBe(2);
  });
});

describe('design-system-mcp inspect, --help, --version', () => {
  it('summarises what was extracted', async () => {
    const { code, stdout } = await run(['inspect', '--no-cache']);
    expect(code).toBe(0);
    expect(stdout).toMatch(/Components \(5 \+ 15 parts\)/);
    expect(stdout).toMatch(
      /Button\s+<button> · 3 props · variant\[6\] size\[4\] · docs · 4 examples/,
    );
    expect(stdout).toMatch(/color\s+20/);
  });

  it('prints help and version', async () => {
    expect((await run(['--help'])).stdout).toContain('design-system-mcp check <files...>');
    expect((await run(['-v'])).stdout).toBe(VERSION);
  });
});
