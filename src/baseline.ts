import fs from 'node:fs';
import path from 'node:path';

import { ConfigError } from './config.js';
import type { CheckResult, Diagnostic } from './types.js';

export const BASELINE_FILE = 'onsystem.baseline.json';
/** The baseline's name from before the rename to onsystem: still read when the new one is absent. */
export const LEGACY_BASELINE_FILE = 'design-system-mcp.baseline.json';

/**
 * Findings a project accepts for now, so `check` fails only on new ones.
 * Keyed by file (relative to the root), rule and the offending source text,
 * with a count: line numbers would go stale on every edit above a finding.
 */
export interface Baseline {
  version: 1;
  files: Record<string, Record<string, Record<string, number>>>;
}

/** file → rule → source → count. Maps, so `constructor` or `__proto__` are ordinary keys. */
type Entries = Map<string, Map<string, Map<string, number>>>;

/**
 * A finding's identity within its file and rule: the offending text with
 * whitespace collapsed, and without the quotes of a string literal, so a
 * formatter switching quote style does not make every finding look new.
 * SARIF fingerprints use it too, so code scanning tracks a finding as a baseline does.
 */
export function findingKey(diagnostic: Diagnostic): string {
  const text = diagnostic.source.replace(/\s+/g, ' ').trim();
  return (/^(['"`])(.*)\1$/.exec(text)?.[2] ?? text).slice(0, 200);
}

/** The baseline's entries, or undefined when the file does not exist. */
export function readBaseline(file: string): Entries | undefined {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new ConfigError(`Could not read baseline ${file}: ${(error as Error).message}`);
  }
  const invalid = (why: string) =>
    new ConfigError(
      `${file} is not a valid onsystem baseline (${why}). Fix it, or delete it and run check --update-baseline.`,
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw invalid((error as Error).message);
  }
  if (!isObject(parsed) || parsed.version !== 1) throw invalid('expected "version": 1');
  if (!isObject(parsed.files)) throw invalid('"files" must be an object');

  const entries: Entries = new Map();
  for (const [name, rules] of Object.entries(parsed.files)) {
    if (!isObject(rules)) throw invalid(`"${name}" must map rules to findings`);
    const byRule = new Map<string, Map<string, number>>();
    for (const [rule, sources] of Object.entries(rules)) {
      if (!isObject(sources)) throw invalid(`"${name}" › "${rule}" must map findings to counts`);
      const counts = new Map<string, number>();
      for (const [source, count] of Object.entries(sources)) {
        if (!Number.isInteger(count) || (count as number) < 1) {
          throw invalid(`"${name}" › "${rule}" › "${source}" must be a positive whole number`);
        }
        counts.set(source, count as number);
      }
      byRule.set(rule, counts);
    }
    entries.set(name, byRule);
  }
  return entries;
}

export interface BaselineMatch {
  /** The result without the findings the baseline accepts. */
  result: CheckResult;
  /** Findings the baseline accepted. */
  baselined: number;
  /** Baseline entries for this file that no longer occur. */
  fixed: number;
}

/**
 * Removes the findings the baseline accepts for `file`. Within a file and
 * rule, each entry accepts that many findings with the same source text, in
 * order; any beyond the count are new. Entries of `disabled` rules are not
 * counted as fixed: the rule is off, not satisfied.
 */
export function applyBaseline(
  baseline: Entries,
  file: string,
  result: CheckResult,
  disabled: ReadonlySet<string> = new Set(),
): BaselineMatch {
  const remaining = new Map<string, number>();
  for (const [rule, sources] of baseline.get(file) ?? []) {
    if (disabled.has(rule)) continue;
    for (const [source, count] of sources) remaining.set(`${rule}\0${source}`, count);
  }
  const diagnostics: Diagnostic[] = [];
  let baselined = 0;
  for (const diagnostic of result.diagnostics) {
    const id = `${diagnostic.ruleId}\0${findingKey(diagnostic)}`;
    const left = remaining.get(id) ?? 0;
    if (left > 0) {
      remaining.set(id, left - 1);
      baselined++;
    } else {
      diagnostics.push(diagnostic);
    }
  }
  let fixed = 0;
  for (const count of remaining.values()) fixed += count;
  return {
    result: {
      ...result,
      diagnostics,
      errorCount: diagnostics.filter((d) => d.severity === 'error').length,
      warningCount: diagnostics.filter((d) => d.severity === 'warning').length,
    },
    baselined,
    fixed,
  };
}

/**
 * The baseline after a run over `checked` (file → its findings): those files
 * get exactly their current findings, plus their previous entries for
 * `disabled` rules; other files keep their entries while they still exist
 * under `root`.
 */
export function updateBaseline(
  previous: Entries | undefined,
  checked: ReadonlyMap<string, Diagnostic[]>,
  root: string,
  disabled: ReadonlySet<string> | ((file: string) => ReadonlySet<string>) = new Set(),
): Entries {
  const disabledIn = typeof disabled === 'function' ? disabled : () => disabled;
  const next: Entries = new Map();
  for (const [file, rules] of previous ?? []) {
    if (!checked.has(file) && fs.existsSync(path.resolve(root, file))) next.set(file, rules);
  }
  for (const [file, diagnostics] of checked) {
    const rules = new Map<string, Map<string, number>>();
    const off = disabledIn(file);
    for (const [rule, sources] of previous?.get(file) ?? []) {
      if (off.has(rule)) rules.set(rule, sources);
    }
    for (const diagnostic of diagnostics) {
      let sources = rules.get(diagnostic.ruleId);
      if (!sources) rules.set(diagnostic.ruleId, (sources = new Map<string, number>()));
      const id = findingKey(diagnostic);
      sources.set(id, (sources.get(id) ?? 0) + 1);
    }
    if (rules.size) next.set(file, rules);
  }
  return next;
}

export function countBaseline(entries: Entries): { findings: number; files: number } {
  let findings = 0;
  for (const rules of entries.values()) {
    for (const sources of rules.values()) {
      for (const count of sources.values()) findings += count;
    }
  }
  return { findings, files: entries.size };
}

/** Writes the baseline sorted at every level, so it diffs cleanly in review. */
export function writeBaseline(file: string, entries: Entries): void {
  const sorted = <T>(map: Map<string, T>) =>
    [...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const files: Baseline['files'] = {};
  for (const [name, rules] of sorted(entries)) {
    const byRule: Record<string, Record<string, number>> = {};
    for (const [rule, sources] of sorted(rules)) {
      byRule[rule] = Object.fromEntries(sorted(sources));
    }
    // defineProperty: a file named `__proto__` must stay an ordinary key.
    Object.defineProperty(files, name, { value: byRule, enumerable: true, writable: true });
  }
  const baseline: Baseline = { version: 1, files };
  try {
    fs.writeFileSync(file, `${JSON.stringify(baseline, null, 2)}\n`);
  } catch (error) {
    throw new ConfigError(`Could not write baseline ${file}: ${(error as Error).message}`);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
