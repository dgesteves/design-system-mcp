import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { annotation, cli, onChangedLines, parseDiff, run } from '../action/check.mjs';
import { fixture } from './helpers.js';

// The GitHub Action (action.yml, action/check.mjs) against real git repositories, with a stand-in
// for the CLI that reports `bg-[#…]` as an error and `p-[13px]` as a warning on whatever line has
// them. CI runs the action itself, with the built CLI, on the pull request (the `action` job).

const STUB = `import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
if (process.env.STUB_ARGS) fs.writeFileSync(process.env.STUB_ARGS, JSON.stringify(args));
if (process.env.STUB_FAIL) {
  console.error('check --require-design-system: no components were found.');
  process.exit(2);
}
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
const results = [];
for (const file of walk(args[1]).filter((f) => f.endsWith('.tsx')).sort()) {
  const diagnostics = [];
  fs.readFileSync(file, 'utf8').split('\\n').forEach((text, i) => {
    for (const [needle, ruleId, severity] of [
      ['bg-[#', 'no-hardcoded-color', 'error'],
      ['p-[13px]', 'no-hardcoded-spacing', 'warning'],
    ]) {
      const at = text.indexOf(needle);
      if (at === -1) continue;
      diagnostics.push({ ruleId, severity, message: 'Hardcoded value in <div>, use a token.', line: i + 1,
        column: at + 1, endLine: i + 1, endColumn: at + 1 + needle.length, source: needle });
    }
  });
  results.push({ file: path.relative(process.cwd(), file).split(path.sep).join('/'), diagnostics,
    errorCount: diagnostics.filter((d) => d.severity === 'error').length,
    warningCount: diagnostics.filter((d) => d.severity === 'warning').length });
}
console.log(JSON.stringify(results));
process.exit(results.some((r) => r.errorCount) ? 1 : 0);
`;
const tools = fixture({ 'stub.mjs': STUB });
const BIN = path.join(tools, 'stub.mjs');

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync(
    'git',
    [
      '-c',
      'user.name=onsystem test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'init.defaultBranch=main',
      ...args,
    ],
    { cwd, encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

const PAGE = [
  'export const Page = () => (',
  '  <div className="bg-[#111111]">', // there before the pull request
  '    <p>Hello</p>',
  '  </div>',
  ')',
  '',
].join('\n');

/**
 * A repository with an app in apps/web: main has a page with one finding, and the `feature`
 * branch adds a line with another. Returns the commits.
 */
function repository() {
  const root = fixture({ 'apps/web/app/page.tsx': PAGE, 'README.md': '# app\n' });
  git(root, 'init', '--quiet');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '--no-verify', '-m', 'base');
  const base = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', '--quiet', '-b', 'feature');
  const lines = PAGE.split('\n');
  lines.splice(3, 0, '    <p className="bg-[#222222]">New</p>');
  fs.writeFileSync(path.join(root, 'apps/web/app/page.tsx'), lines.join('\n'));
  git(root, 'commit', '--quiet', '--no-verify', '-am', 'feature');
  const head = git(root, 'rev-parse', 'HEAD');
  return { root, base, head };
}

function action(
  cwd: string,
  options: { event?: string; payload?: unknown; inputs?: Record<string, string> } = {},
  env: Record<string, string> = {},
) {
  const dir = fixture({});
  const eventPath = path.join(dir, 'event.json');
  fs.writeFileSync(eventPath, JSON.stringify(options.payload ?? {}));
  const files = { output: path.join(dir, 'output'), summary: path.join(dir, 'summary') };
  const out: string[] = [];
  const err: string[] = [];
  const inputs = Object.entries(options.inputs ?? {}).map(([name, value]): [string, string] => [
    `INPUT_${name.toUpperCase().replace(/-/g, '_')}`,
    value,
  ]);
  const code = run({
    cwd,
    env: {
      GITHUB_EVENT_NAME: options.event ?? 'pull_request',
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_OUTPUT: files.output,
      GITHUB_STEP_SUMMARY: files.summary,
      ONSYSTEM_BIN: BIN,
      INPUT_PATHS: 'app',
      ...Object.fromEntries(inputs),
      ...env,
    },
    stdout: (text: string) => out.push(text),
    stderr: (text: string) => err.push(text),
  });
  const read = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
  const outputs = read(files.output)
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('='));
  return {
    code,
    stdout: out.join('\n'),
    stderr: err.join('\n'),
    outputs: Object.fromEntries(outputs) as Record<string, string>,
    summary: read(files.summary),
  };
}

const pr = (base: string) => ({ pull_request: { base: { sha: base } } });

describe('the GitHub Action, in parts', () => {
  it('reads the changed lines of each file from git diff --unified=0', () => {
    const diff = [
      'diff --git a/app/page.tsx b/app/page.tsx',
      'index 1111111..2222222 100644',
      '--- a/app/page.tsx',
      '+++ b/app/page.tsx',
      '@@ -3 +3 @@ export const Page = () => (',
      '-  <p>Old</p>',
      '+  <p>New</p>',
      '@@ -10,0 +11,3 @@',
      '+a',
      '+b',
      '+c',
      '@@ -20,2 +23,0 @@',
      '-gone',
      '-gone',
      'diff --git a/app/new.tsx b/app/new.tsx',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/app/new.tsx',
      '@@ -0,0 +1,2 @@',
      '+x',
      '+y',
      'diff --git a/app/old.tsx b/app/old.tsx',
      'deleted file mode 100644',
      '--- a/app/old.tsx',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-z',
      'diff --git a/app/a.tsx b/app/b.tsx',
      'similarity index 90%',
      'rename from app/a.tsx',
      'rename to app/b.tsx',
      '--- a/app/a.tsx',
      '+++ b/app/b.tsx',
      '@@ -1 +1 @@',
      '-q',
      '+r',
      'diff --git "a/app/tab\\there.tsx" "b/app/tab\\there.tsx"',
      '--- "a/app/tab\\there.tsx"',
      '+++ "b/app/tab\\there.tsx"',
      '@@ -1,0 +2 @@',
      '+s',
      '+++ "b/app/caf\\303\\251.tsx"',
      '@@ -0,0 +1 @@',
      '+t',
    ].join('\n');
    expect(Object.fromEntries(parseDiff(diff))).toEqual({
      // A deletion marks the lines either side of the gap.
      'app/page.tsx': [
        [3, 3],
        [11, 13],
        [23, 24],
      ],
      'app/new.tsx': [[1, 2]],
      'app/b.tsx': [[1, 1]],
      'app/tab\there.tsx': [[2, 2]],
      'app/café.tsx': [[1, 1]],
    });
  });

  it('keeps the findings that overlap a changed range', () => {
    const finding = (line: number, endLine = line) => ({
      file: 'a.tsx',
      ruleId: 'no-hardcoded-color',
      severity: 'error' as const,
      message: 'm',
      line,
      column: 1,
      endLine,
      endColumn: 2,
    });
    const changed = new Map<string, [number, number][]>([['a.tsx', [[5, 6]]]]);
    const { reported, outside } = onChangedLines(
      [finding(4), finding(5), finding(2, 5), finding(7), { ...finding(5), file: 'b.tsx' }],
      changed,
    );
    expect(reported.map((f) => [f.file, f.line])).toEqual([
      ['a.tsx', 5],
      ['a.tsx', 2],
    ]);
    expect(outside).toHaveLength(3);
    expect(onChangedLines([finding(1)], undefined).reported).toHaveLength(1);
  });

  it('writes annotations as GitHub workflow commands, escaped', () => {
    expect(
      annotation({
        file: 'app/a,b.tsx',
        ruleId: 'no-unknown-variant',
        severity: 'warning',
        message: '100% wrong\nreally',
        line: 3,
        column: 4,
        endLine: 3,
        endColumn: 9,
      }),
    ).toBe(
      '::warning file=app/a%2Cb.tsx,line=3,col=4,endLine=3,endColumn=9,title=onsystem%3A no-unknown-variant::100%25 wrong%0Areally',
    );
  });

  it('runs the CLI version in its own package.json, and passes every input to the script', () => {
    const repo = path.join(import.meta.dirname, '..');
    const { version } = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')) as {
      version: string;
    };
    // Without ONSYSTEM_BIN, `npx onsystem@<that version>`; with it, that build.
    expect(cli({}, repo)).toMatchObject({ command: 'npx', args: ['--yes', `onsystem@${version}`] });
    expect(cli({ ONSYSTEM_BIN: '/x/cli.js' }, repo)).toEqual({
      command: process.execPath,
      args: ['/x/cli.js'],
      shell: false,
    });

    const yml = fs.readFileSync(path.join(repo, 'action.yml'), 'utf8');
    expect(yml).toContain('ONSYSTEM_ACTION_PATH: ${{ github.action_path }}');
    expect(yml).toContain('run: node "$ONSYSTEM_ACTION_PATH/action/index.mjs"');
    const inputs = [
      ...yml
        .slice(yml.indexOf('\ninputs:'), yml.indexOf('\noutputs:'))
        .matchAll(/^ {2}([a-z-]+):\n {4}description:/gm),
    ].map((m) => m[1] ?? '');
    expect(inputs).toEqual([
      'paths',
      'working-directory',
      'baseline',
      'fail-on',
      'only-changed-lines',
      'require-design-system',
    ]);
    expect(yml).toContain('working-directory: ${{ inputs.working-directory }}');
    for (const input of inputs.filter((i) => i !== 'working-directory')) {
      const variable = `INPUT_${input.toUpperCase().replace(/-/g, '_')}`;
      expect(yml).toContain(`${variable}: \${{ inputs.${input} }}`);
    }
  });

  it('has a name the GitHub Marketplace can list', () => {
    // A Marketplace action can't be named after a GitHub user or organization it doesn't
    // belong to, and github.com/onsystem is someone else's organization: a bare `onsystem`
    // would be refused when the release is published to the Marketplace.
    const yml = fs.readFileSync(path.join(import.meta.dirname, '..', 'action.yml'), 'utf8');
    const name = /^name: (.+)$/m.exec(yml)?.[1]?.trim() ?? '';
    expect(name).toBe('onsystem design system check');
    expect(name.toLowerCase()).not.toBe('onsystem');
  });
});

describe('the GitHub Action', () => {
  it('annotates only the lines a pull request changed, and fails on their errors', () => {
    const { root, base } = repository();
    const result = action(path.join(root, 'apps/web'), { payload: pr(base) });
    expect(result.code).toBe(1);
    // Relative to the repository root, though it ran in apps/web.
    expect(result.stdout).toContain(
      '::error file=apps/web/app/page.tsx,line=4,col=19,endLine=4,endColumn=24,title=onsystem%3A no-hardcoded-color::Hardcoded value in <div>, use a token.',
    );
    expect(result.stdout).not.toContain('line=2,');
    expect(result.stdout).toContain(
      'onsystem: 1 error and 0 warnings on lines this pull request changed in 1 file checked (1 finding on other lines not reported).',
    );
    expect(result.outputs).toEqual({ errors: '1', warnings: '0', 'outside-diff': '1' });
    expect(result.summary).toContain(
      '| error | `apps/web/app/page.tsx:4` | `no-hardcoded-color` | Hardcoded value in &lt;div&gt;, use a token. |',
    );
  });

  it('fetches the history it needs from a shallow checkout of the merge commit', () => {
    const origin = repository();
    // What GitHub builds for a pull request, and actions/checkout fetches with depth 1.
    git(origin.root, 'checkout', '--quiet', '-b', 'merge', origin.base);
    git(origin.root, 'merge', '--quiet', '--no-ff', '--no-verify', '-m', 'merge', origin.head);
    git(origin.root, 'update-ref', 'refs/pull/1/merge', 'HEAD');
    git(origin.root, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
    const clone = fixture({});
    git(clone, 'init', '--quiet');
    git(clone, 'remote', 'add', 'origin', pathToFileURL(origin.root).href);
    git(
      clone,
      'fetch',
      '--quiet',
      '--depth=1',
      'origin',
      '+refs/pull/1/merge:refs/remotes/pull/1/merge',
    );
    git(clone, 'checkout', '--quiet', '--detach', 'refs/remotes/pull/1/merge');
    expect(git(clone, 'rev-parse', '--is-shallow-repository')).toBe('true');

    const result = action(path.join(clone, 'apps/web'), { payload: pr(origin.base) });
    expect(result.stdout).toContain('::error file=apps/web/app/page.tsx,line=4,');
    expect(result.outputs).toEqual({ errors: '1', warnings: '0', 'outside-diff': '1' });
    expect(result.code).toBe(1);
  });

  it('says how to fix it when the changed lines cannot be worked out', () => {
    const { root } = repository();
    const result = action(root, { payload: pr('0123456789abcdef0123456789abcdef01234567') });
    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(
      /^::error title=onsystem::Could not work out which lines this pull request changed: .*Check out with fetch-depth: 0, or set only-changed-lines: false/,
    );
  });

  it('reports every line when asked, and outside pull requests and merge queues', () => {
    const { root, base } = repository();
    const web = path.join(root, 'apps/web');
    const all = action(web, { payload: pr(base), inputs: { 'only-changed-lines': 'false' } });
    expect(all.outputs).toEqual({ errors: '2', warnings: '0', 'outside-diff': '0' });
    expect(all.stdout).toContain('onsystem: 2 errors and 0 warnings in 1 file checked.');
    expect(action(web, { event: 'push', payload: { after: base } }).outputs.errors).toBe('2');
    // A merge queue checks what it is about to merge.
    const queue = action(web, {
      event: 'merge_group',
      payload: { merge_group: { base_sha: base } },
    });
    expect(queue.outputs).toEqual({ errors: '1', warnings: '0', 'outside-diff': '1' });
  });

  it('fails on what fail-on names', () => {
    const { root, base } = repository();
    const web = path.join(root, 'apps/web');
    fs.writeFileSync(
      path.join(web, 'app/page.tsx'),
      PAGE.replace('<p>Hello</p>', '<p className="p-[13px]">Hello</p>'),
    );
    const payload = pr(base);
    expect(action(web, { payload }).code).toBe(0);
    expect(action(web, { payload, inputs: { 'fail-on': 'warning' } }).code).toBe(1);
    expect(action(web, { payload, inputs: { 'fail-on': 'none' } }).code).toBe(0);
    const bad = action(web, { payload, inputs: { 'fail-on': 'sometimes' } });
    expect(bad.code).toBe(1);
    expect(bad.stdout).toContain('fail-on must be error, warning or none');
  });

  it('passes the paths, the baseline and require-design-system on to check', () => {
    const { root, base } = repository();
    const argsFile = path.join(fixture({}), 'args.json');
    const args = () => JSON.parse(fs.readFileSync(argsFile, 'utf8')) as string[];
    const web = path.join(root, 'apps/web');
    const payload = pr(base);
    action(web, { payload, inputs: { paths: 'app\n  app/page.tsx' } }, { STUB_ARGS: argsFile });
    expect(args()).toEqual([
      'check',
      'app',
      'app/page.tsx',
      '--format',
      'json',
      '--require-design-system',
    ]);
    const inputs = { baseline: 'ci/accepted.json', 'require-design-system': 'false' };
    action(web, { payload, inputs }, { STUB_ARGS: argsFile });
    expect(args()).toEqual(['check', 'app', '--format', 'json', '--baseline', 'ci/accepted.json']);
  });

  it('fails with what check said when check cannot run', () => {
    const { root, base } = repository();
    const result = action(path.join(root, 'apps/web'), { payload: pr(base) }, { STUB_FAIL: '1' });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('no components were found');
    expect(result.stdout).toBe(
      '::error title=onsystem::onsystem check exited with 2: check --require-design-system: no components were found.',
    );
  });
});
