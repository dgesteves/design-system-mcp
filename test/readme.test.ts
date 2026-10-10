import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { labelKey, type Label, type Snapshot } from '../scripts/corpus-lib.js';
import { loadConfig, RULE_IDS } from '../src/config.js';

// Every number the README quotes comes from a file in the repository; these tests fail when
// the README and the file disagree, so a new snapshot or benchmark run means a README update.
const root = path.resolve(import.meta.dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const readme = read('README.md');

describe('the README', () => {
  it('lists every rule with its default severity', async () => {
    const { rules } = await loadConfig({ cwd: fs.mkdtempSync(path.join(os.tmpdir(), 'readme-')) });
    const rows = readme.split('\n').filter((line) => /^\| `[\w-]+` +\|/.test(line));
    expect(rows.map((row) => /^\| `([\w-]+)`/.exec(row)?.[1]).sort()).toEqual([...RULE_IDS].sort());
    for (const id of RULE_IDS) {
      const row = rows.find((r) => r.startsWith(`| \`${id}\``));
      expect(row?.split('|')[2]?.trim(), id).toBe(rules[id].severity);
    }
  });

  it('quotes the false-positive rate the corpus snapshot and labels give', () => {
    const labels = JSON.parse(read('corpus/labels.json')) as Label[];
    const snapshot = JSON.parse(read('corpus/snapshot.json')) as Snapshot;
    const repos = JSON.parse(read('corpus/repos.json')) as { repos: unknown[] };
    // The random sample, among the findings the snapshot says are still reported.
    const sample = labels.filter((l) => l.sample === 'random' && snapshot.labels[labelKey(l)]);
    const fp = sample.filter((l) => l.verdict === 'FP').length;
    const debatable = sample.filter((l) => l.verdict === 'D').length;
    // Weighted by each run's and rule's share of the findings, as scripts/corpus.mjs reports it.
    let findings = 0;
    let covered = 0;
    let weighted = 0;
    let unknown = 0;
    // A run from a monorepo root counts only the findings it adds to the runs from its projects.
    for (const [run, { rules, added }] of Object.entries(snapshot.runs)) {
      for (const [rule, counts] of Object.entries(added ?? rules)) {
        const n = counts.errors + counts.warnings;
        findings += n;
        if (/^no-unknown-(component|prop|variant)$/.test(rule)) unknown += n;
        const stratum = sample.filter((l) => l.run === run && l.rule === rule);
        if (!stratum.length) continue;
        covered += n;
        weighted += (n * stratum.filter((l) => l.verdict === 'FP').length) / stratum.length;
      }
    }
    const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
    const text = readme.replace(/\s+/g, ' ');
    expect(text).toContain(`on ${String(repos.repos.length)} public repositories pinned by commit`);
    expect(text).toContain(
      `${String(Object.keys(snapshot.runs).length)} runs, ${findings.toLocaleString('en-US')} findings`,
    );
    expect(text).toContain(
      `In a random sample of ${String(sample.length)} findings, ${String(fp)} are false positives (${pct(fp / sample.length)}) and ${String(debatable)} are debatable`,
    );
    expect(text).toContain(`about ${pct(weighted / covered)} are false positives`);
    expect(text).toContain(`those three rules have ${String(unknown)} findings in the corpus`);
    expect(sample.some((l) => /^no-unknown-/.test(l.rule))).toBe(false);
  });

  it('quotes the benchmark results in bench/agents', () => {
    const names: Record<string, string> = {
      'haiku-4-5': 'Claude Haiku 4.5',
      'opus-5': 'Claude Opus 5',
    };
    const dir = path.join(root, 'bench/agents/results');
    let runs = 0;
    for (const model of fs.readdirSync(dir).sort()) {
      const results = fs.readdirSync(path.join(dir, model)).map(
        (file) =>
          JSON.parse(fs.readFileSync(path.join(dir, model, file), 'utf8')) as {
            condition: string;
            errors: number;
            cost: number;
          },
      );
      runs += results.length;
      const of = (condition: string) => {
        const list = results.filter((r) => r.condition === condition);
        return {
          clean: list.filter((r) => r.errors === 0).length,
          runs: list.length,
          errors: list.reduce((n, r) => n + r.errors, 0),
          cost: Math.round(list.reduce((n, r) => n + r.cost, 0) * 100) / 100,
        };
      };
      const [base, plugin] = [of('base'), of('plugin')];
      const delta = Math.round(((plugin.cost - base.cost) / base.cost) * 100);
      const row = readme.split('\n').find((line) => line.startsWith(`| ${String(names[model])} `));
      expect(row, model).toBeDefined();
      expect(
        row
          ?.split('|')
          .slice(2, -1)
          .map((cell) => cell.trim()),
      ).toEqual([
        `${String(base.clean)} / ${String(base.runs)}`,
        `**${String(plugin.clean)} / ${String(plugin.runs)}**`,
        `${String(base.errors)} → ${String(plugin.errors)}`,
        `${delta < 0 ? '−' : '+'}${String(Math.abs(delta))}%`,
      ]);
    }
    expect(readme).toContain(`${String(runs)} runs (one per task, model and condition)`);
  });
});
