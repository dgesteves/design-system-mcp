import path from 'node:path';

import { loadConfig, type ResolvedConfig, type RuleId, type RuleSeverity } from '../src/config.js';
import { DesignSystem, loadDesignSystem } from '../src/design-system.js';

export const DEMO_ROOT = path.resolve(import.meta.dirname, '../examples/shadcn-demo');
export const ACME_ROOT = path.resolve(import.meta.dirname, 'fixtures/acme-ui');

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
