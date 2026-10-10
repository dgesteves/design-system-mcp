import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { main, type Io } from '../src/cli.js';
import { fixture, TSCONFIG } from './helpers.js';

const json = (value: unknown) => JSON.stringify(value, null, 2);

async function run(args: string[], cwd: string, answers?: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  const io: Io = {
    cwd,
    color: false,
    stdout: (t) => out.push(t),
    stderr: (t) => err.push(t),
    prompt: answers
      ? (question) => {
          asked.push(question);
          return Promise.resolve(answers.shift() ?? '');
        }
      : undefined,
  };
  const code = await main(args, io);
  return { code, stdout: out.join('\n'), stderr: err.join('\n'), asked };
}

/** A shadcn/ui app: two components with hardcoded colors in a page, a theme with one unresolved token. */
const SHADCN = {
  'tsconfig.json': TSCONFIG,
  'package.json': json({ name: 'app' }),
  'components.json': json({
    tailwind: { css: 'app/globals.css' },
    aliases: { ui: '@/components/ui' },
  }),
  'components/ui/button.tsx':
    'export function Button(props: { variant?: "default" | "outline"; className?: string; children?: unknown }) { return <button /> }\n',
  // Wraps a library that is not installed: its props cannot be read.
  'components/ui/dialog.tsx':
    'import * as DialogPrimitive from "@radix-ui/react-dialog"\nexport const Dialog = DialogPrimitive.Root\n',
  'app/globals.css': `:root { --primary: oklch(0.2 0 0); --brand: var(--brand-500); }
@theme inline { --color-primary: var(--primary); }
`,
  'app/page.tsx':
    'import { Button } from "@/components/ui/button"\nexport default () => <Button className="bg-[#ef4444]">Go</Button>\n',
};

describe('onsystem inspect --explain', () => {
  it('says what zero config looked at and why, and what it could not resolve', async () => {
    const root = fixture(SHADCN);
    const { code, stdout } = await run(['inspect', '--explain', '--no-cache'], root);
    expect(code).toBe(0);
    expect(stdout).toContain(
      'How the design system was found\n  found  components.json: ui: @/components/ui → components/ui, 2 component files\n  no     package.json exports of app: not read: components.json found the components',
    );
    expect(stdout).toContain(
      'no     workspace design-system packages: no dependency is named like one (@acme/ui, acme-ui, @acme/design-system) among 0 dependencies',
    );
    expect(stdout).toContain('Resolved config');
    expect(stdout).toContain('  components   components/ui/**/*.{tsx,jsx}');
    expect(stdout).toContain('  tokens       app/globals.css, **/*.tokens.json');
    expect(stdout).toMatch(
      / {2}rules {8}no-hardcoded-color error, .*icon-button-accessible-name error/,
    );
    expect(stdout).toContain(
      '1 unresolved, reading a custom property no token file defines: --brand: var(--brand-500)',
    );
    expect(stdout).toContain('1 component has 0 props: Dialog.');
    expect(stdout).toContain('The dependencies are not installed: no node_modules in');
  });

  it('names each rejected candidate when nothing is found', async () => {
    const root = fixture({
      'package.json': json({
        name: 'shop',
        exports: { './a': './src/a.tsx' },
        dependencies: { '@acme/ui': '1.0.0', 'react-aria-components': '1.0.0' },
      }),
      'components.json': json({ aliases: { ui: '~/ui' } }),
      'src/a.tsx': 'export const A = () => null',
      'src/main.tsx': '',
    });
    const { stdout } = await run(['inspect', '--explain', '--no-cache'], root);
    expect(stdout).toContain(
      'no     components.json: the ui alias ~/ui resolves through neither tsconfig paths nor a workspace package',
    );
    expect(stdout).toContain(
      'no     package.json exports of shop: its exports lead to 1 component file; a design system exports at least 3',
    );
    expect(stdout).toContain(
      'no     workspace package @acme/ui: not a workspace package: an installed package is compiled, and only sources are read',
    );
    expect(stdout).toContain('no     a flat src/ of components: src/main.tsx makes src/ an app');
    expect(stdout).toContain(
      'So the defaults apply: components/ui/**/*.{tsx,jsx}, src/components/ui/**/*.{tsx,jsx}, which match nothing.',
    );
  });

  it('says when a config sets the components, and explains a monorepo root', async () => {
    const configured = fixture({
      ...SHADCN,
      'onsystem.config.json': json({ components: ['components/ui/**/*.tsx'] }),
    });
    expect((await run(['inspect', '--explain', '--no-cache'], configured)).stdout).toContain(
      'components come from onsystem.config.json, so zero config did not look',
    );
    const monorepo = fixture({
      'pnpm-workspace.yaml': 'packages:\n  - apps/*\n',
      'package.json': json({ name: 'root' }),
      ...Object.fromEntries(
        Object.entries(SHADCN).map(([file, text]) => [`apps/web/${file}`, text]),
      ),
    });
    const { stdout } = await run(['inspect', '--explain', '--no-cache'], monorepo);
    expect(stdout).toContain(
      'Why this is read as a monorepo root: it declares workspace packages (pnpm-workspace.yaml), no config there sets components, and zero config finds no design system in the root itself:',
    );
    expect(stdout).toContain(
      'apps/web (app)\n  How the design system was found\n    found  components.json',
    );
  });
});

describe('onsystem init', () => {
  it('writes the detected config, checks once without failing, and records the baseline with --yes', async () => {
    const root = fixture(SHADCN);
    const { code, stdout } = await run(['init', '--yes', '--no-cache'], root);
    expect(code).toBe(0);
    const written = JSON.parse(
      fs.readFileSync(path.join(root, 'onsystem.config.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(written).toEqual({
      $schema: 'https://unpkg.com/onsystem/schema.json',
      components: ['components/ui/**/*.{tsx,jsx}'],
      tokens: ['app/globals.css'],
    });
    expect(stdout).toContain(
      'Found the design system through components.json (ui: @/components/ui → components/ui).',
    );
    expect(stdout).toContain('Wrote onsystem.config.json.');
    expect(stdout).toContain(
      'Dry run of `onsystem check .`: 1 error and 0 warnings in 1 of 1 file. By rule: no-hardcoded-color 1.',
    );
    expect(stdout).toContain('Baseline: 1 finding in 1 file → onsystem.baseline.json');
    expect(fs.existsSync(path.join(root, 'onsystem.baseline.json'))).toBe(true);
    // The written config finds what zero config found.
    expect((await run(['check', '.', '--no-cache'], root)).code).toBe(0);

    // A second run leaves the file alone.
    const again = await run(['init', '--yes'], root);
    expect(again.code).toBe(2);
    expect(again.stderr).toContain('onsystem.config.json already exists');
  });

  it('asks where the design system is when nothing is found, and before writing a baseline', async () => {
    const root = fixture({
      'package.json': json({ name: 'shop' }),
      'src/ui/button.tsx':
        'export function Button(props: { variant?: "solid" }) { return <button /> }\n',
      'src/theme.css': ':root { --brand: #ff6b00; }\n',
      'src/page.tsx':
        'import { Button } from "../src/ui/button"\nexport default () => <Button variant="ghost" />\n',
    });
    const { code, stdout, asked } = await run(['init', '--no-cache'], root, [
      'src/nothing/**/*.tsx',
      'src/ui/**/*.tsx',
      'src/theme.css',
      '@shop/ui',
      'n',
    ]);
    expect(code).toBe(0);
    expect(asked).toHaveLength(5);
    expect(stdout).toContain('No file matches src/nothing/**/*.tsx.');
    expect(JSON.parse(fs.readFileSync(path.join(root, 'onsystem.config.json'), 'utf8'))).toEqual({
      $schema: 'https://unpkg.com/onsystem/schema.json',
      components: ['src/ui/**/*.tsx'],
      tokens: ['src/theme.css'],
      importPath: '@shop/ui',
    });
    expect(stdout).toContain('No baseline written');
    expect(fs.existsSync(path.join(root, 'onsystem.baseline.json'))).toBe(false);
  });

  it('needs --components without a terminal when nothing is found, and takes them', async () => {
    const root = fixture({
      'package.json': json({ name: 'shop' }),
      'src/ui/button.tsx': 'export function Button() { return <button /> }\n',
    });
    const blind = await run(['init', '--yes'], root);
    expect(blind.code).toBe(2);
    expect(blind.stderr).toContain('zero config found no design system');
    expect(fs.existsSync(path.join(root, 'onsystem.config.json'))).toBe(false);
    const given = await run(
      ['init', '--yes', '--components', 'src/ui/**/*.tsx', '--no-cache'],
      root,
    );
    expect(given.code).toBe(0);
    expect(
      JSON.parse(fs.readFileSync(path.join(root, 'onsystem.config.json'), 'utf8')),
    ).toMatchObject({
      components: ['src/ui/**/*.tsx'],
    });
    expect(given.stdout).toContain('Dry run of `onsystem check .`: no problems');
  });

  it('keeps zero config for a package found through its exports, and at a monorepo root', async () => {
    const files: Record<string, string> = {
      'pnpm-workspace.yaml': 'packages:\n  - apps/*\n  - packages/*\n',
      'package.json': json({ name: 'root' }),
      'packages/ui/package.json': json({
        name: '@acme/ui',
        exports: {
          './button': './src/button.tsx',
          './card': './src/card.tsx',
          './input': './src/input.tsx',
        },
      }),
      'packages/ui/src/button.tsx': 'export function Button() { return <button /> }\n',
      'packages/ui/src/card.tsx': 'export function Card() { return <div /> }\n',
      'packages/ui/src/input.tsx': 'export function Input() { return <input /> }\n',
      'apps/web/package.json': json({ name: 'web', dependencies: { '@acme/ui': 'workspace:*' } }),
      'apps/web/page.tsx': 'export default () => <div />\n',
    };
    const root = fixture(files);
    const app = await run(['init', '--yes', '--no-cache'], path.join(root, 'apps/web'));
    expect(app.stdout).toContain(
      '"components" is left to zero config: apps import them by 3 specifiers from the package\'s exports (@acme/ui/button, @acme/ui/card, …), which a config cannot spell.',
    );
    expect(
      JSON.parse(fs.readFileSync(path.join(root, 'apps/web/onsystem.config.json'), 'utf8')),
    ).toEqual({
      $schema: 'https://unpkg.com/onsystem/schema.json',
    });

    const monorepo = fixture(files);
    const atRoot = await run(['init', '--yes', '--no-cache'], monorepo);
    expect(atRoot.code).toBe(0);
    expect(atRoot.stdout).toContain(
      'This is a monorepo root: 2 of 2 workspace packages have a design system (apps/web, packages/ui). Each keeps zero config',
    );
    expect(
      JSON.parse(fs.readFileSync(path.join(monorepo, 'onsystem.config.json'), 'utf8')),
    ).toEqual({
      $schema: 'https://unpkg.com/onsystem/schema.json',
    });
    // The config at the root, without components, keeps it a monorepo root.
    expect((await run(['inspect', '--no-cache'], monorepo)).stdout).toContain(
      'workspace 2 packages',
    );
  });
});
