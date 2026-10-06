import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';
import { buildModel, DesignSystemHost, type DesignSystem } from '../src/design-system.js';
import type { DesignSystemModel } from '../src/types.js';
import { ACME_ROOT, fixture, load } from './helpers.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsm-host-'));
afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** A copy of the fixture we can edit. */
function copyFixture(): string {
  const dir = fs.mkdtempSync(path.join(tmp, 'acme-'));
  fs.cpSync(ACME_ROOT, dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'node_modules'));
  return dir;
}

describe('extraction cache', () => {
  it('reuses the cached model until a source file changes', async () => {
    const root = copyFixture();
    const config = await loadConfig({ root });
    const first = await buildModel(config);
    expect(first.model.stats.fromCache).toBe(false);
    expect(fs.existsSync(path.join(root, 'node_modules/.cache/design-system-mcp/model.json'))).toBe(
      true,
    );

    const second = await buildModel(config);
    expect(second.model.stats.fromCache).toBe(true);
    expect(second.model.components.length).toBe(first.model.components.length);

    const file = path.join(root, 'components/alert.tsx');
    fs.writeFileSync(
      file,
      `${fs.readFileSync(file, 'utf8')}\nexport function Banner() { return <div /> }\n`,
    );
    const third = await buildModel(config);
    expect(third.model.stats.fromCache).toBe(false);
    expect(third.model.components.map((c) => c.name)).toContain('Banner');
  });

  it('tracks files the components import and the tsconfig chain', async () => {
    const root = copyFixture();
    fs.writeFileSync(
      path.join(root, 'components/tag.tsx'),
      'import type { TagProps } from "./tag-types"\nexport function Tag({ tone }: TagProps) { return <span>{tone}</span> }\n',
    );
    fs.writeFileSync(
      path.join(root, 'components/tag-types.ts'),
      'export interface TagProps { tone?: "info" | "warn" }\n',
    );
    fs.writeFileSync(
      path.join(root, 'tsconfig.base.json'),
      fs.readFileSync(path.join(root, 'tsconfig.json')),
    );
    fs.writeFileSync(path.join(root, 'tsconfig.app.json'), '{ "extends": "./tsconfig.base.json" }');
    const config = { ...(await loadConfig({ root })), tsconfig: 'tsconfig.app.json' };
    const tone = (model: DesignSystemModel) =>
      model.components.find((c) => c.name === 'Tag')?.props.find((p) => p.name === 'tone')?.values;
    const first = await buildModel(config);
    expect(tone(first.model)).toEqual(['info', 'warn']);

    fs.writeFileSync(
      path.join(root, 'components/tag-types.ts'),
      'export interface TagProps { tone?: "info" | "warn" | "error" }\n',
    );
    const second = await buildModel(config);
    expect(second.model.stats.fromCache).toBe(false);
    expect(tone(second.model)).toEqual(['info', 'warn', 'error']);
    expect((await buildModel(config)).model.stats.fromCache).toBe(true);

    const base = path.join(root, 'tsconfig.base.json');
    fs.writeFileSync(base, fs.readFileSync(base, 'utf8').replace('"@acme/*"', '"~/*"'));
    const third = await buildModel(config);
    expect(third.model.stats.fromCache).toBe(false);
    expect(third.model.components.find((c) => c.name === 'Tag')?.importPath).toBe('~/tag');
  });

  it('skips node_modules even with a custom exclude, unless a pattern names it', async () => {
    const files = {
      'components/ui/chip.tsx': 'export function Chip() { return <span /> }\n',
      'tokens/brand.tokens.json': '{ "brand": { "$type": "color", "$value": "#3366ff" } }',
      'node_modules/kit/theme.tokens.json': '{ "kit": { "$type": "color", "$value": "#ff0000" } }',
    };
    const names = async (config: object) => {
      const root = fixture({ ...files, 'design-system-mcp.config.json': JSON.stringify(config) });
      return (await load(root)).tokens.map((t) => t.name);
    };
    expect(await names({ exclude: ['**/*.stories.tsx'] })).toEqual(['brand']);
    // Tokens published as a package.
    const kit = { tokens: ['node_modules/kit/theme.tokens.json'] };
    expect(await names(kit)).toEqual(['kit']);
    expect(await names({ ...kit, exclude: ['**/*.stories.tsx'] })).toEqual(['kit']);
  });

  it('can be disabled', async () => {
    const root = copyFixture();
    const config = await loadConfig({ root });
    await buildModel(config, { cache: false });
    expect(fs.existsSync(path.join(root, 'node_modules/.cache'))).toBe(false);
  });
});

describe('DesignSystemHost', () => {
  it('loads lazily, reloads incrementally and notifies listeners', async () => {
    const root = copyFixture();
    const host = new DesignSystemHost(await loadConfig({ root }), { cache: false });
    const first = await host.get();
    expect(await host.get()).toBe(first);

    const changed = new Promise<string[]>((resolve) => {
      host.onChange((ds) => {
        resolve(ds.components.map((c) => c.name));
      });
    });
    fs.writeFileSync(
      path.join(root, 'components/chip.tsx'),
      'export function Chip() { return <span /> }\n',
    );
    await host.reload();
    expect(await changed).toContain('Chip');
    host.close();
  });

  it('picks up file changes when watching', async () => {
    const root = copyFixture();
    const host = new DesignSystemHost(await loadConfig({ root }), { cache: false });
    await host.get();
    const changed = new Promise<boolean>((resolve) => {
      host.onChange((ds) => {
        if (ds.getComponent('Spinner')) resolve(true);
      });
    });
    host.watch();
    // Give the watcher a moment to attach before writing.
    await new Promise((r) => setTimeout(r, 100));
    fs.writeFileSync(
      path.join(root, 'components/spinner.tsx'),
      'export function Spinner() { return <svg /> }\n',
    );
    await expect(changed).resolves.toBe(true);
    host.close();
  }, 15_000);

  it('ignores changes to files it does not track', async () => {
    const root = copyFixture();
    const host = new DesignSystemHost(await loadConfig({ root }), { cache: false });
    await host.get();
    let reloads = 0;
    host.onChange(() => {
      reloads++;
    });
    host.watch();
    await new Promise((r) => setTimeout(r, 100));
    fs.writeFileSync(path.join(root, 'components/notes.txt'), 'not a component');
    await new Promise((r) => setTimeout(r, 600));
    expect(reloads).toBe(0);
    host.close();
  });

  it('reloads the config file when it changes, including atomic saves', async () => {
    const root = copyFixture();
    const configFile = path.join(root, 'design-system-mcp.config.json');
    const host = new DesignSystemHost(await loadConfig({ root }), { cache: false });
    await host.get();
    host.watch();
    await new Promise((r) => setTimeout(r, 100));
    // Editors save by writing a temporary file and renaming it over the original.
    const save = (importPath: string) => {
      const config = JSON.parse(fs.readFileSync(configFile, 'utf8')) as object;
      fs.writeFileSync(`${configFile}.tmp`, JSON.stringify({ ...config, importPath }));
      fs.renameSync(`${configFile}.tmp`, configFile);
    };
    const reloadedWith = (importPath: string) =>
      new Promise<void>((resolve) => {
        const off = host.onChange((ds) => {
          if (ds.getComponent('Button')?.importPath !== importPath) return;
          off();
          resolve();
        });
      });
    for (const importPath of ['@acme/ui', '@acme/kit']) {
      const reloaded = reloadedWith(importPath);
      save(importPath);
      await reloaded;
      expect((await host.get()).config.importPath).toBe(importPath);
    }
    host.close();
  }, 15_000);

  it('ignores an older reload that finishes after a newer one', async () => {
    const root = copyFixture();
    let calls = 0;
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const build: typeof buildModel = async (c, o) => {
      const call = ++calls;
      const result = await buildModel(c, o);
      if (call === 2) await held;
      return result;
    };
    const host = new DesignSystemHost(await loadConfig({ root }), { cache: false, build });
    await host.get();
    const notified: DesignSystem[] = [];
    host.onChange((ds) => notified.push(ds));
    const older = host.reload();
    const newer = await host.reload();
    release();
    await older;
    expect(notified).toEqual([newer]);
    expect(await host.get()).toBe(newer);
  });

  it('keeps serving the previous model when a reload fails', async () => {
    const root = copyFixture();
    const config = await loadConfig({ root });
    const errors: string[] = [];
    const logger = {
      info: () => undefined,
      warn: () => undefined,
      error: (m: string) => errors.push(m),
    };
    let fail = false;
    const build: typeof buildModel = (c, o) =>
      fail ? Promise.reject(new Error('disk on fire')) : buildModel(c, o);
    const host = new DesignSystemHost(config, { cache: false, logger, build });
    const first = await host.get();
    fail = true;
    const next = await host.reload();
    expect(errors).toEqual(['reload failed: disk on fire']);
    expect(next).toBe(first);
  });
});
