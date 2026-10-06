import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll } from 'vitest';

import { loadConfig, type ResolvedConfig, type RuleId, type RuleSeverity } from '../src/config.js';
import { DesignSystem, loadDesignSystem } from '../src/design-system.js';

export const DEMO_ROOT = path.resolve(import.meta.dirname, '../examples/shadcn-demo');
export const ACME_ROOT = path.resolve(import.meta.dirname, 'fixtures/acme-ui');

const fixtures: string[] = [];
afterAll(() => {
  for (const dir of fixtures.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * Writes a throwaway project and returns its root. With `nodeModules`, its
 * `node_modules` links each of the demo's installed packages (React, Radix)
 * so types resolve; `files` can add more packages next to them.
 */
export function fixture(
  files: Record<string, string>,
  options: { nodeModules?: boolean } = {},
): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsm-fixture-'));
  fixtures.push(dir);
  if (options.nodeModules) {
    const installed = path.join(DEMO_ROOT, 'node_modules');
    fs.mkdirSync(path.join(dir, 'node_modules'));
    for (const name of fs.readdirSync(installed)) {
      if (name.startsWith('.')) continue;
      fs.symlinkSync(path.join(installed, name), path.join(dir, 'node_modules', name), 'junction');
    }
  }
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
  return dir;
}

export const TSCONFIG = JSON.stringify({
  compilerOptions: {
    jsx: 'react-jsx',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    strict: true,
    paths: { '@/*': ['./*'] },
  },
});

export async function load(root: string): Promise<DesignSystem> {
  const config = await loadConfig({ root });
  return loadDesignSystem(config, { cache: false });
}

const cache = new Map<string, Promise<DesignSystem>>();

/** Loads a design system once per test file. */
export function loadOnce(root: string): Promise<DesignSystem> {
  let ds = cache.get(root);
  if (!ds) {
    ds = load(root);
    cache.set(root, ds);
  }
  return ds;
}

/** The same design system with different rule settings. */
export function withRules(
  ds: DesignSystem,
  rules: Partial<Record<RuleId, RuleSeverity | [RuleSeverity, { allow?: string[] }]>>,
): DesignSystem {
  const config: ResolvedConfig = { ...ds.config, rules: { ...ds.config.rules } };
  for (const [id, setting] of Object.entries(rules) as [
    RuleId,
    RuleSeverity | [RuleSeverity, { allow?: string[] }],
  ][]) {
    config.rules[id] =
      typeof setting === 'string'
        ? { severity: setting, options: {} }
        : { severity: setting[0], options: setting[1] };
  }
  return new DesignSystem(ds.model, config);
}
