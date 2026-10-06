import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { ConfigError, configJsonSchema, DEFAULT_COMPONENTS, loadConfig } from '../src/config.js';
import { ACME_ROOT, DEMO_ROOT } from './helpers.js';

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

  it('exports a JSON Schema for editors', () => {
    const schema = configJsonSchema() as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining(['components', 'tokens', 'docs', 'rules', 'importPath']),
    );
  });
});
