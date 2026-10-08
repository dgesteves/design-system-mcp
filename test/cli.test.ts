import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { main, type Io } from '../src/cli.js';
import { VERSION } from '../src/version.js';
import { DEMO_ROOT, fixture } from './helpers.js';

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

  it('expands directories to the TSX/JSX files under them', async () => {
    const { code, stdout } = await run(['check', 'app', '--no-cache']);
    expect(code).toBe(1);
    expect(stdout).toContain('in 2 files');
  });

  it('takes paths with glob characters literally (Next.js route groups and segments)', async () => {
    const button = '<button className="px-3">Go</button>';
    const root = fixture({
      'components/ui/button.tsx':
        'export function Button(props: React.ComponentProps<"button">) { return <button {...props} /> }',
      'app/(marketing)/page.tsx': `export default () => ${button}`,
      'app/blog/[slug]/page.tsx': `export default () => ${button}`,
    });
    const { stdout } = await run(
      ['check', 'app/(marketing)', 'app/blog/[slug]/page.tsx', '--no-cache'],
      root,
    );
    expect(stdout).toContain('app/(marketing)/page.tsx');
    expect(stdout).toContain('app/blog/[slug]/page.tsx');
    expect(stdout).toContain('in 2 files');
  });

  it('reports editor columns for files with a byte-order mark', async () => {
    const root = fixture({
      'components/ui/button.tsx':
        'export function Button(props: React.ComponentProps<"button">) { return <button {...props} /> }',
      'app/page.tsx': '\uFEFF<button>Go</button>',
    });
    const { stdout } = await run(['check', 'app/page.tsx', '--no-cache'], root);
    expect(stdout).toMatch(/^\s+1:2\s+error\s+Native <button>/m);
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

describe("design-system-mcp check and the design system's own files", () => {
  it('skips them unless asked, and says so', async () => {
    const all = await run(['check', '.', '--no-cache']);
    expect(all.stdout.split('\n').at(-1)).toBe(
      '8 errors, 3 warnings in 2 files (5 design-system files skipped)',
    );
    const included = await run(['check', '.', '--include-design-system', '--no-cache']);
    expect(included.stdout).toContain('in 7 files');
  });

  it('exits 0 when only design-system files match, with [] for the hook', async () => {
    expect(await run(['check', 'components/ui/button.tsx', '--no-cache'])).toEqual({
      code: 0,
      stdout:
        'Nothing to check: 1 design-system file skipped. Pass --include-design-system to check it.',
      stderr: '',
    });
    // The Claude Code hook's call: an edit to the design system itself is not linted.
    const hook = await run([
      'check',
      'components/ui/button.tsx',
      '--format',
      'json',
      '--quiet-without-design-system',
      '--no-cache',
    ]);
    expect(hook).toMatchObject({ code: 0, stdout: '[]' });
  });

  it('reads includeDesignSystem from the config', async () => {
    const root = fixture({
      'design-system-mcp.config.json': '{ "includeDesignSystem": true }',
      'app/globals.css': '@import "tailwindcss";',
      'components/ui/button.tsx':
        'export function Button(props: React.ComponentProps<"button">) { return <button className="p-[3px]" {...props} /> }',
    });
    const { stdout } = await run(['check', '.', '--no-cache'], root);
    expect(stdout).toContain('components/ui/button.tsx');
    expect(stdout).toContain('`p-[3px]`');
  });
});

describe('design-system-mcp check with a baseline', () => {
  const BUTTON =
    'export function Button(props: React.ComponentProps<"button">) { return <button {...props} /> }';
  const project = () =>
    fixture({
      'components/ui/button.tsx': BUTTON,
      'components/ui/input.tsx':
        'export function Input(props: React.ComponentProps<"input">) { return <input {...props} /> }',
      'app/a.tsx': 'export const A = () => <><button>One</button><button>Two</button></>',
      'app/b.tsx': 'export const B = () => <input />',
      'app/c.tsx': 'export const C = () => <p>Fine</p>',
    });
  const baselineOf = (root: string) =>
    JSON.parse(fs.readFileSync(path.join(root, 'design-system-mcp.baseline.json'), 'utf8')) as {
      files: Record<string, Record<string, Record<string, number>>>;
    };

  it('records the current findings, keyed from the root, and then reports only new ones', async () => {
    const root = project();
    // Run from a subdirectory: keys stay relative to the root.
    const recorded = await run(
      ['check', '.', '--update-baseline', '--root', '..', '--no-cache'],
      path.join(root, 'app'),
    );
    expect(recorded.code).toBe(0);
    expect(recorded.stdout).toBe(
      `Baseline: 3 findings in 2 files → ${path.join(root, 'design-system-mcp.baseline.json')}`,
    );
    expect(baselineOf(root).files).toEqual({
      'app/a.tsx': { 'prefer-design-system-component': { button: 2 } },
      'app/b.tsx': { 'prefer-design-system-component': { input: 1 } },
    });

    const clean = await run(['check', 'app', '--no-cache'], root);
    expect(clean).toMatchObject({
      code: 0,
      stdout: 'No new problems in 3 files (3 in the baseline).',
    });

    // A third <button> exceeds the count for that source; the rest still match after moving lines.
    fs.writeFileSync(
      path.join(root, 'app/a.tsx'),
      'export const A = () => (\n  <>\n    <button>One</button><button>Two</button><button>Three</button>\n  </>\n)',
    );
    const added = await run(['check', 'app', '--no-cache'], root);
    expect(added.code).toBe(1);
    expect(added.stdout).toMatch(/app\/a\.tsx\n\s+3:46\s+error\s+Native <button>/);
    expect(added.stdout).toContain('1 error, 0 warnings in 3 files (3 in the baseline)');

    const all = await run(['check', 'app', '--no-cache', '--ignore-baseline'], root);
    expect(all.stdout).toContain('4 errors, 0 warnings in 3 files\n'.trim());
    expect(all.stdout).not.toContain('baseline');
  });

  it('points out fixed findings and drops them, and deleted files, on update', async () => {
    const root = project();
    await run(['check', 'app', '--update-baseline', '--no-cache'], root);
    fs.writeFileSync(path.join(root, 'app/a.tsx'), 'export const A = () => <button>One</button>');
    fs.rmSync(path.join(root, 'app/b.tsx'));

    const { code, stdout } = await run(['check', 'app/a.tsx', '--no-cache'], root);
    expect(code).toBe(0);
    expect(stdout.split('\n')).toEqual([
      'No new problems in 1 file (1 in the baseline).',
      '1 baseline finding no longer occurs: run `check app/a.tsx --update-baseline` to drop it.',
    ]);
    const github = await run(['check', 'app/a.tsx', '--no-cache', '--format', 'github'], root);
    expect(github.stdout).toBe(
      '::notice title=design-system-mcp baseline::1 baseline finding no longer occurs: run `check app/a.tsx --update-baseline` to drop it.',
    );

    // Only a.tsx is checked: its entry shrinks, b.tsx is gone from disk and is dropped.
    await run(['check', 'app/a.tsx', '--update-baseline', '--no-cache'], root);
    expect(baselineOf(root).files).toEqual({
      'app/a.tsx': { 'prefer-design-system-component': { button: 1 } },
    });
  });

  it('keeps entries of files a partial update does not check, and filters JSON output', async () => {
    const root = project();
    await run(['check', 'app', '--update-baseline', '--no-cache'], root);
    await run(['check', 'app/c.tsx', '--update-baseline', '--no-cache'], root);
    expect(Object.keys(baselineOf(root).files)).toEqual(['app/a.tsx', 'app/b.tsx']);

    const { stdout } = await run(['check', 'app', '--no-cache', '--format', 'json'], root);
    const results = JSON.parse(stdout) as {
      file: string;
      diagnostics: unknown[];
      baselined: number;
    }[];
    expect(results.map((r) => [r.file, r.diagnostics.length, r.baselined])).toEqual([
      ['app/a.tsx', 0, 2],
      ['app/b.tsx', 0, 1],
      ['app/c.tsx', 0, 0],
    ]);
  });

  it('rejects a missing or malformed baseline file', async () => {
    const root = project();
    const missing = await run(['check', 'app', '--baseline', 'nope.json', '--no-cache'], root);
    expect(missing).toMatchObject({ code: 2, stderr: 'check: baseline not found: nope.json' });
    fs.writeFileSync(path.join(root, 'design-system-mcp.baseline.json'), '{"files": []}');
    const malformed = await run(['check', 'app', '--no-cache'], root);
    expect(malformed.code).toBe(2);
    expect(malformed.stderr).toContain('is not a valid design-system-mcp baseline');

    // Every level is checked, and an update refuses to overwrite what it cannot read.
    for (const files of [
      { 'app/a.tsx': { 'prefer-design-system-component': null } },
      { 'app/a.tsx': { 'prefer-design-system-component': { button: '1' } } },
      { 'app/a.tsx': { 'prefer-design-system-component': { button: 0.5 } } },
    ]) {
      fs.writeFileSync(
        path.join(root, 'design-system-mcp.baseline.json'),
        JSON.stringify({ version: 1, files }),
      );
      for (const extra of [[], ['--update-baseline']]) {
        const run_ = await run(['check', 'app', '--no-cache', ...extra], root);
        expect(run_.code).toBe(2);
        expect(run_.stderr).toContain('is not a valid design-system-mcp baseline');
      }
    }

    const unwritable = await run(
      ['check', 'app', '--no-cache', '--update-baseline', '--baseline', 'missing/dir/b.json'],
      root,
    );
    expect(unwritable.code).toBe(2);
    expect(unwritable.stderr).toContain('Could not write baseline');
  });

  it('keeps keys that look like Object.prototype members as plain entries', async () => {
    const root = fixture({
      'components/ui/badge.tsx':
        'export function Badge(props: { variant?: "default" | "outline" }) { return <span /> }',
      'app/p.tsx':
        'export const P = () => <><Badge toString constructor valueOf="x" hasOwnProperty __proto__ /></>\nimport { Badge } from "../components/ui/badge"',
    });
    const recorded = await run(['check', 'app', '--update-baseline', '--no-cache'], root);
    expect(recorded.stdout).toMatch(/^Baseline: 5 findings in 1 file → /);
    expect(baselineOf(root).files['app/p.tsx']?.['no-unknown-prop']).toEqual(
      JSON.parse('{"__proto__":1,"constructor":1,"hasOwnProperty":1,"toString":1,"valueOf":1}'),
    );
    expect(await run(['check', 'app', '--no-cache'], root)).toMatchObject({
      code: 0,
      stdout: 'No new problems in 1 file (5 in the baseline).',
    });
  });

  it('matches through a linked root, keeps entries of disabled rules, and ignores quote style', async () => {
    const root = fixture({
      'components/ui/button.tsx':
        'export function Button(props: { variant?: "default" | "destructive" } & React.ComponentProps<"button">) { return <button {...props} /> }',
      'app/a.tsx':
        'import { Button } from "../components/ui/button"\nexport const A = () => <><button>x</button><Button variant="danger" /></>',
    });
    const link = `${root}-link`;
    fs.symlinkSync(root, link);
    try {
      await run(['check', 'app', '--update-baseline', '--no-cache'], root);
      // Through the link, from a cwd elsewhere: the same keys.
      const linked = await run(
        ['check', path.join(link, 'app'), '--root', link, '--no-cache'],
        '/',
      );
      expect(linked).toMatchObject({
        code: 0,
        stdout: 'No new problems in 1 file (2 in the baseline).',
      });

      fs.writeFileSync(
        path.join(root, 'app/a.tsx'),
        fs.readFileSync(path.join(root, 'app/a.tsx'), 'utf8').replace('"danger"', "'danger'"),
      );
      expect((await run(['check', 'app', '--no-cache'], root)).code).toBe(0);

      fs.writeFileSync(
        path.join(root, 'design-system-mcp.config.json'),
        JSON.stringify({ rules: { 'prefer-design-system-component': 'off' } }),
      );
      // Off is not fixed: no hint, and an update keeps the entry for when the rule returns.
      expect((await run(['check', 'app', '--no-cache'], root)).stdout).toBe(
        'No new problems in 1 file (1 in the baseline).',
      );
      await run(['check', 'app', '--update-baseline', '--no-cache'], root);
      expect(baselineOf(root).files['app/a.tsx']).toEqual({
        'no-unknown-variant': { danger: 1 },
        'prefer-design-system-component': { button: 1 },
      });
    } finally {
      fs.rmSync(link);
    }
  });
});

describe('design-system-mcp check --quiet-without-design-system', () => {
  const page =
    'export default () => <div className="p-[13px] rounded-[7px] bg-[#ef4444]"><button>Go</button></div>';

  it('stays quiet in a React app with no design system, even with Tailwind', async () => {
    const root = fixture({ 'app/globals.css': '@import "tailwindcss";\n', 'app/page.tsx': page });
    // Without the flag, Tailwind's default scale alone still produces findings.
    expect((await run(['check', 'app', '--no-cache'], root)).stdout).toContain(
      'no-hardcoded-spacing',
    );
    expect(
      await run(['check', 'app', '--no-cache', '--quiet-without-design-system'], root),
    ).toEqual({
      code: 0,
      stdout: '',
      stderr: '',
    });
    expect(
      (
        await run(
          ['check', 'app', '--no-cache', '--quiet-without-design-system', '--format', 'json'],
          root,
        )
      ).stdout,
    ).toBe('[]');
  });

  it('still checks projects with components, their own tokens, or a config', async () => {
    const withComponents = fixture({
      'components/ui/button.tsx':
        'export function Button(props: React.ComponentProps<"button">) { return <button {...props} /> }',
      'app/page.tsx': page,
    });
    const withTokens = fixture({
      'app/globals.css':
        '@import "tailwindcss";\n:root { --primary: oklch(0.6 0.2 25); }\n@theme inline { --color-primary: var(--primary); }\n',
      'app/page.tsx': page,
    });
    const withConfig = fixture({
      'design-system-mcp.config.json': JSON.stringify({ tokens: ['app/globals.css'] }),
      'app/globals.css': '@import "tailwindcss";\n',
      'app/page.tsx': page,
    });
    for (const root of [withComponents, withTokens, withConfig]) {
      const { stdout } = await run(
        ['check', 'app', '--no-cache', '--quiet-without-design-system'],
        root,
      );
      // The config only names Tailwind's defaults: warnings, but still reported.
      expect(stdout).toMatch(/\d+ errors?, \d+ warnings? in 1 file/);
    }
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
