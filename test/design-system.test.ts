import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';
import { buildModel, DesignSystemHost } from '../src/design-system.js';
import { ACME_ROOT } from './helpers.js';

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
