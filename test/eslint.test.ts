import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { ESLint, type Linter } from 'eslint';
import { ESLint as ESLint9 } from 'eslint-v9';
import { build } from 'tsdown';
import tseslint from 'typescript-eslint';
import { beforeAll, describe, expect, it } from 'vitest';

import { main } from '../src/cli.js';
import { RULE_IDS } from '../src/config.js';
import { DEMO_ROOT, fixture } from './helpers.js';

// The ESLint plugin (`onsystem/eslint`) as it ships: built from src/eslint into a folder inside
// the repository, so its worker is a real file and its imports resolve as they do from dist.
const REPO = path.resolve(import.meta.dirname, '..');
const OUT = path.join(REPO, 'node_modules/.cache/onsystem-eslint-test');

interface Plugin {
  rules: Record<string, unknown>;
  configs: { recommended: Linter.Config };
}
let onsystem: Plugin;

beforeAll(async () => {
  await build({
    cwd: REPO,
    config: false,
    entry: { eslint: 'src/eslint/index.ts', 'eslint-worker': 'src/eslint/worker.ts' },
    outDir: OUT,
    format: 'esm',
    platform: 'node',
    target: 'node22.18',
    fixedExtension: false,
    dts: false,
    publint: false,
    clean: true,
    logLevel: 'silent',
  });
  ({ default: onsystem } = (await import(pathToFileURL(path.join(OUT, 'eslint.js')).href)) as {
    default: Plugin;
  });
});

/** The recommended config, with typescript-eslint's parser for the files it lints. */
function config(extra: Linter.Config = {}): Linter.Config[] {
  return [
    {
      files: ['**/*.{ts,tsx,js,jsx}'],
      languageOptions: { parser: tseslint.parser },
    },
    { ...onsystem.configs.recommended, ...extra },
  ];
}

function lint(
  cwd: string,
  files: string[],
  options: { extra?: Linter.Config; fix?: boolean } = {},
) {
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: config(options.extra),
    fix: options.fix ?? false,
  });
  return eslint.lintFiles(files);
}

/** `file:line:column rule` for each finding, as ESLint and `check --format json` give them. */
function keys(results: ESLint.LintResult[], cwd: string): string[] {
  return results.flatMap((r) =>
    r.messages.map(
      (m) =>
        `${path.relative(cwd, r.filePath).split(path.sep).join('/')}:${m.line}:${m.column} ${m.ruleId ?? 'fatal'} ${m.severity === 2 ? 'error' : 'warning'}`,
    ),
  );
}

async function checkJson(cwd: string, args: string[]) {
  const out: string[] = [];
  await main(['check', ...args, '--format', 'json', '--no-cache'], {
    cwd,
    color: false,
    stdout: (t) => out.push(t),
    stderr: () => undefined,
  });
  const results = JSON.parse(out.join('\n')) as {
    file: string;
    diagnostics: { ruleId: string; line: number; column: number; severity: string }[];
  }[];
  return results.flatMap((r) =>
    r.diagnostics.map((d) => `${r.file}:${d.line}:${d.column} onsystem/${d.ruleId} ${d.severity}`),
  );
}

const BUTTON =
  'export function Button(props: React.ComponentProps<"button">) { return <button {...props} /> }';
const RED = 'export default () => <div className="bg-[#ff0000]">Hi</div>\n';
/** Color tokens, so no-hardcoded-color has something to compare against. */
const TOKENS = ':root {\n  --primary: oklch(0.55 0.2 260);\n}\n';

describe('the ESLint plugin', () => {
  it('has every rule, and a recommended config at their default severities', () => {
    expect(Object.keys(onsystem.rules).sort()).toEqual([...RULE_IDS].sort());
    const { recommended } = onsystem.configs;
    expect(recommended.files).toEqual(['**/*.{tsx,jsx}']);
    expect(recommended.rules).toMatchObject({
      'onsystem/no-unknown-variant': 'error',
      'onsystem/no-hardcoded-spacing': 'warn',
    });
  });

  it('reports what check reports, with the same fixes', async () => {
    const results = await lint(DEMO_ROOT, ['app']);
    expect(keys(results, DEMO_ROOT).sort()).toEqual((await checkJson(DEMO_ROOT, ['app'])).sort());
    expect(keys(results, DEMO_ROOT)).toHaveLength(11);
    const draft = results.find((r) => r.filePath.endsWith('danger-zone.tsx'));
    expect(draft?.messages[0]).toMatchObject({
      ruleId: 'onsystem/no-hardcoded-color',
      line: 11,
      column: 22,
      endLine: 11,
      endColumn: 38,
      message:
        'Hardcoded color `border-[#ef4444]`. Nearest token destructive (ΔE 0.071) → `border-destructive`.',
    });

    const [fixed] = await lint(DEMO_ROOT, ['app/settings/danger-zone.tsx'], { fix: true });
    expect(fixed?.output).toContain('border-destructive');
    expect(fixed?.output).not.toContain('border-[#ef4444]');
  });

  it('leaves out what check leaves out', async () => {
    // The design system's own components, as `check .` skips them.
    expect(keys(await lint(DEMO_ROOT, ['components']), DEMO_ROOT)).toEqual([]);
    const root = fixture({
      'components/ui/button.tsx': BUTTON,
      'app/globals.css': TOKENS,
      'onsystem.config.json': JSON.stringify({ exclude: ['legacy/**'] }),
      'app/page.tsx': RED,
      'app/page.stories.tsx': RED,
      'legacy/old.tsx': RED,
      'app/opengraph-image.tsx': RED,
    });
    const results = await lint(root, ['app', 'legacy']);
    // Only the page: the story (ignored by the recommended config), the config's `exclude`
    // and an image route are not checked.
    expect(keys(results, root)).toEqual(['app/page.tsx:1:38 onsystem/no-hardcoded-color error']);
  });

  it("applies the project's config and suppression comments", async () => {
    const root = fixture({
      'components/ui/button.tsx': BUTTON,
      'app/globals.css': TOKENS,
      'onsystem.config.json': JSON.stringify({
        overrides: [{ files: 'app/marketing/**', rules: { 'no-hardcoded-color': 'off' } }],
      }),
      'app/page.tsx': RED,
      'app/marketing/hero.tsx': RED,
      'app/quiet.tsx': `// onsystem-disable-next-line no-hardcoded-color -- the brand's red\n${RED}`,
    });
    expect(keys(await lint(root, ['app']), root)).toEqual([
      'app/page.tsx:1:38 onsystem/no-hardcoded-color error',
    ]);
  });

  it("checks each file against its own project's design system from a monorepo root", async () => {
    const root = fixture({
      'package.json': JSON.stringify({ name: 'repo', private: true, workspaces: ['apps/*'] }),
      'apps/web/package.json': JSON.stringify({ name: 'web' }),
      'apps/web/components/ui/button.tsx': BUTTON,
      'apps/web/app/page.tsx': 'export default () => <button>Go</button>\n',
      'apps/docs/package.json': JSON.stringify({ name: 'docs' }),
      'apps/docs/app/page.tsx': 'export default () => <button>Go</button>\n',
    });
    // Only web has a Button to prefer over <button>.
    expect(keys(await lint(root, ['apps']), root)).toEqual(
      (await checkJson(root, ['apps'])).filter((k) => !k.includes(' onsystem/syntax ')),
    );
    expect(keys(await lint(root, ['apps']), root)).toEqual([
      'apps/web/app/page.tsx:1:23 onsystem/prefer-design-system-component error',
    ]);
  });

  it('takes the project root and config from settings.onsystem', async () => {
    const root = fixture({
      'ui/kit/button.tsx': BUTTON,
      'configs/onsystem.json': JSON.stringify({ components: ['ui/kit/*.tsx'] }),
      'app/page.tsx': 'export default () => <button>Go</button>\n',
    });
    const settings = { onsystem: { root: '.', config: 'configs/onsystem.json' } };
    expect(keys(await lint(root, ['app'], { extra: { settings } }), root)).toEqual([
      'app/page.tsx:1:23 onsystem/prefer-design-system-component error',
    ]);
  });

  it('says once per file when the design system cannot be loaded', async () => {
    const root = fixture({
      'onsystem.config.json': '{ "components": 42 }',
      'app/page.tsx': RED,
    });
    const [result] = await lint(root, ['app/page.tsx']);
    expect(result?.messages).toHaveLength(1);
    expect(result?.messages[0]?.message).toMatch(/^onsystem could not check this file: /);
  });

  it('runs on ESLint 9', async () => {
    const eslint = new ESLint9({
      cwd: DEMO_ROOT,
      overrideConfigFile: true,
      overrideConfig: config() as never,
    });
    const results = (await eslint.lintFiles(['app'])) as unknown as ESLint.LintResult[];
    expect(keys(results, DEMO_ROOT).sort()).toEqual((await checkJson(DEMO_ROOT, ['app'])).sort());
  });
});

// The plugin is built where its imports resolve: keep the folder out of the package.
it('builds into a folder npm does not pack', () => {
  expect(fs.existsSync(path.join(OUT, 'eslint-worker.js'))).toBe(true);
  expect(path.relative(REPO, OUT).startsWith('node_modules')).toBe(true);
});
