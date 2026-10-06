import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { ConfigError, configJsonSchema, DEFAULT_COMPONENTS, loadConfig } from '../src/config.js';
import { ACME_ROOT, DEMO_ROOT, fixture, load } from './helpers.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsm-config-'));
afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('finds the config file in the root and resolves rule settings', async () => {
    const config = await loadConfig({ root: ACME_ROOT });
    expect(config.configFile).toBe(path.join(ACME_ROOT, 'design-system-mcp.config.json'));
    expect(config.tokens).toEqual([{ path: 'tokens/*.tokens.json', prefix: 'acme' }]);
    expect(config.rules['no-hardcoded-spacing']).toEqual({ severity: 'error', options: {} });
    expect(config.rules['no-hardcoded-radius']).toEqual({
      severity: 'warn',
      options: { allow: ['9999px'] },
    });
    expect(config.rules['no-unknown-prop'].severity).toBe('error');
  });

  it('uses the config file directory as the root when given --config', async () => {
    const config = await loadConfig({
      cwd: '/',
      config: path.join(DEMO_ROOT, 'design-system-mcp.config.json'),
    });
    expect(config.root).toBe(DEMO_ROOT);
  });

  it('falls back to shadcn-friendly defaults without a config', async () => {
    const config = await loadConfig({ cwd: tmp });
    expect(config.root).toBe(tmp);
    expect(config.configFile).toBeUndefined();
    expect(config.components).toEqual(DEFAULT_COMPONENTS);
    expect(config.tokens.map((t) => t.path)).toContain('app/globals.css');
  });

  it('lets CLI flags override the file', async () => {
    const config = await loadConfig({
      root: ACME_ROOT,
      components: ['src/**/*.tsx'],
      tokens: ['a.css'],
    });
    expect(config.components).toEqual(['src/**/*.tsx']);
    expect(config.tokens).toEqual([{ path: 'a.css' }]);
  });

  it('loads TypeScript configs', async () => {
    const dir = fs.mkdtempSync(path.join(tmp, 'ts-'));
    fs.writeFileSync(
      path.join(dir, 'design-system-mcp.config.ts'),
      `const config: { components: string[] } = { components: ["ui/**/*.tsx"] };\nexport default config;\n`,
    );
    expect((await loadConfig({ root: dir })).components).toEqual(['ui/**/*.tsx']);
  });

  it('rejects invalid configs with a readable message', async () => {
    const dir = fs.mkdtempSync(path.join(tmp, 'bad-'));
    fs.writeFileSync(
      path.join(dir, 'design-system-mcp.config.json'),
      JSON.stringify({ components: 3, rules: { 'no-such-rule': 'error' } }),
    );
    const error = await loadConfig({ root: dir }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as Error).message).toMatch(/components/);
    await expect(loadConfig({ config: path.join(dir, 'missing.json') })).rejects.toThrow(
      /not found/,
    );
  });

  it('reads Windows-style paths, keeping glob escapes in slash-separated patterns', async () => {
    const dir = fs.mkdtempSync(path.join(tmp, 'win-'));
    fs.writeFileSync(path.join(dir, 'tsconfig.app.json'), '{}');
    fs.writeFileSync(
      path.join(dir, 'design-system-mcp.config.json'),
      JSON.stringify({
        tsconfig: '.\\tsconfig.app.json',
        components: 'components\\ui\\**\\*.tsx',
        tokens: ['app\\globals.css', { path: 'tokens\\*.tokens.json', prefix: 'acme' }],
        docs: ['docs\\**\\*.md'],
        exclude: ['**\\*.stories.tsx', 'app/\\(marketing\\)/**'],
      }),
    );
    expect(await loadConfig({ root: dir, docs: ['guides\\*.mdx'] })).toMatchObject({
      tsconfig: './tsconfig.app.json',
      components: ['components/ui/**/*.tsx'],
      tokens: [{ path: 'app/globals.css' }, { path: 'tokens/*.tokens.json', prefix: 'acme' }],
      docs: ['guides/*.mdx'],
      exclude: ['**/*.stories.tsx', 'app/\\(marketing\\)/**'],
    });
  });

  it('rejects a tsconfig that does not exist instead of ignoring it', async () => {
    const dir = fs.mkdtempSync(path.join(tmp, 'tsconfig-'));
    fs.writeFileSync(
      path.join(dir, 'design-system-mcp.config.json'),
      JSON.stringify({ tsconfig: 'tsconfig.app.json' }),
    );
    const error = await loadConfig({ root: dir }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as Error).message).toContain(
      `tsconfig not found: ${path.join(dir, 'tsconfig.app.json')}`,
    );
  });

  it('resolves path aliases through a Windows-style tsconfig path', async () => {
    const root = fixture({
      'design-system-mcp.config.json': JSON.stringify({
        tsconfig: '.\\tsconfig.app.json',
        components: 'components\\ui\\*.tsx',
        tokens: [],
      }),
      'tsconfig.app.json': JSON.stringify({
        compilerOptions: { jsx: 'react-jsx', paths: { '@/*': ['./*'] } },
      }),
      'components/ui/button.tsx': `export function Button(props: { variant?: "default" | "ghost" }) {
  return <button data-variant={props.variant} />
}`,
    });
    const ds = await load(root);
    expect(ds.getComponent('Button')?.importPath).toBe('@/components/ui/button');
    const { diagnostics } = ds.check(
      `import { Button } from "@/components/ui/button"\n<Button variant="danger" />`,
    );
    expect(diagnostics.map((d) => d.ruleId)).toEqual(['no-unknown-variant']);
  });

  it('exports a JSON Schema for editors', () => {
    const schema = configJsonSchema() as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining(['components', 'tokens', 'docs', 'rules', 'importPath']),
    );
  });
});
