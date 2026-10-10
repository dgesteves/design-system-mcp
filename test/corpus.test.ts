import { describe, expect, it } from 'vitest';

import {
  compare,
  falsePositiveRate,
  findings,
  fingerprint,
  invalidLabels,
  labelKey,
  ruleCounts,
  type CheckFileResult,
  type Label,
  type RunSnapshot,
  type Snapshot,
} from '../scripts/corpus-lib.js';

const results = (...diagnostics: [string, string, number, string?][]): CheckFileResult[] => [
  {
    file: 'app/page.tsx',
    diagnostics: diagnostics.map(([ruleId, source, line, suggestion]) => ({
      ruleId,
      severity: 'error',
      message: `${source} is wrong`,
      line,
      source,
      ...(suggestion ? { suggestion, fix: [{}] } : {}),
    })),
  },
];

function label(
  run: string,
  source: string,
  verdict: Label['verdict'],
  extra: Partial<Label> = {},
): Label {
  const rule = extra.rule ?? 'no-hardcoded-color';
  const occurrence = extra.occurrence ?? 1;
  return {
    fingerprint: fingerprint(run, 'app/page.tsx', rule, source, occurrence),
    run,
    file: 'app/page.tsx',
    line: 1,
    rule,
    source,
    occurrence,
    verdict,
    reason: `${source} reason.`,
    sample: 'random',
    ...extra,
  };
}

function snapshotOf(run: string, found: CheckFileResult[], labels: Label[]): Snapshot {
  const runFindings = findings(run, found);
  const current: Record<string, RunSnapshot> = {
    [run]: { inspect: {}, files: found.length, rules: ruleCounts(runFindings) },
  };
  const { present } = compare({ runs: {}, labels: {} }, current, runFindings, labels);
  return {
    runs: current,
    labels: Object.fromEntries(labels.map((l) => [labelKey(l), present.has(l)])),
  };
}

function check(snapshot: Snapshot, run: string, found: CheckFileResult[], labels: Label[]) {
  const runFindings = findings(run, found);
  return compare(
    snapshot,
    { [run]: { inspect: {}, files: found.length, rules: ruleCounts(runFindings) } },
    runFindings,
    labels,
  );
}

describe('corpus comparison', () => {
  it('fingerprints findings by file, rule, text and occurrence, not by line or message', () => {
    const before = findings('demo', results(['no-hardcoded-color', 'bg-red-500', 3]));
    const after = findings('demo', results(['no-hardcoded-color', 'bg-red-500', 30]));
    expect(before[0]?.fingerprint).toBe(after[0]?.fingerprint);
    const twice = findings(
      'demo',
      results(['no-hardcoded-color', 'bg-red-500', 3], ['no-hardcoded-color', 'bg-red-500', 9]),
    );
    expect(twice.map((f) => f.occurrence)).toEqual([1, 2]);
    expect(twice[0]?.fingerprint).not.toBe(twice[1]?.fingerprint);
  });

  it('reports count changes until the snapshot is updated', () => {
    const snapshot = snapshotOf('demo', results(['no-hardcoded-color', 'bg-red-500', 1]), []);
    expect(
      check(snapshot, 'demo', results(['no-hardcoded-color', 'bg-red-500', 1]), []).changes,
    ).toEqual([]);
    const changed = check(
      snapshot,
      'demo',
      results(['no-hardcoded-color', 'bg-red-500', 1], ['no-hardcoded-spacing', 'p-[3px]', 2]),
      [],
    );
    expect(changed.changes).toMatchObject([
      { run: 'demo', rule: 'no-hardcoded-spacing', before: undefined, after: { errors: 1 } },
    ]);
    expect(changed.labelFailures).toEqual([]);
  });

  it('fails when a true positive disappears or a fixed false positive comes back', () => {
    const tp = label('demo', 'bg-red-500', 'TP');
    const fp = label('demo', 'bg-orange-600', 'FP');
    const both = results(
      ['no-hardcoded-color', 'bg-red-500', 1],
      ['no-hardcoded-color', 'bg-orange-600', 2],
    );
    // The baseline: the FP is still reported, which is no failure.
    const baseline = snapshotOf('demo', both, [tp, fp]);
    expect(check(baseline, 'demo', both, [tp, fp]).labelFailures).toEqual([]);

    const lostTp = check(baseline, 'demo', results(['no-hardcoded-color', 'bg-orange-600', 2]), [
      tp,
      fp,
    ]);
    expect(lostTp.labelFailures).toEqual([
      expect.stringContaining('true positive is no longer reported'),
    ]);

    // The FP gets fixed and the snapshot records it; it must not come back.
    const fixed = snapshotOf('demo', results(['no-hardcoded-color', 'bg-red-500', 1]), [tp, fp]);
    expect(fixed.labels[labelKey(fp)]).toBe(false);
    expect(check(fixed, 'demo', both, [tp, fp]).labelFailures).toEqual([
      expect.stringContaining('fixed false positive is back'),
    ]);
  });

  it('applies a label with a suggestion only while that is the suggestion', () => {
    const harmful = label('demo', 'bg-orange-600', 'FP', { suggestion: 'bg-destructive' });
    const withFix = results(['no-hardcoded-color', 'bg-orange-600', 1, 'bg-destructive']);
    const withoutFix = results(['no-hardcoded-color', 'bg-orange-600', 1]);
    const baseline = snapshotOf('demo', withFix, [harmful]);
    expect(baseline.labels[labelKey(harmful)]).toBe(true);
    // The finding stays but the harmful fix is gone: the FP no longer applies.
    expect(check(baseline, 'demo', withoutFix, [harmful]).present.size).toBe(0);
    const fixed = snapshotOf('demo', withoutFix, [harmful]);
    expect(check(fixed, 'demo', withFix, [harmful]).labelFailures).toHaveLength(1);
  });

  it('keeps the record of a label that is narrowed to a suggestion', () => {
    // Labelled FP while the finding pointed at the wrong component; the fix points at the right one.
    const broad = label('demo', 'label', 'FP', { rule: 'prefer-design-system-component' });
    const before = results(['prefer-design-system-component', 'label', 1, '<FileUpload>']);
    const baseline = snapshotOf('demo', before, [broad]);
    const narrowed = { ...broad, suggestion: '<FileUpload>' };
    const right = { ...broad, verdict: 'TP' as const, suggestion: '<Label>' };
    const after = results(['prefer-design-system-component', 'label', 1, '<Label>']);
    const result = check(baseline, 'demo', after, [narrowed, right]);
    // The FP is gone (not "matches no finding"), and the TP for the right suggestion holds.
    expect(result.labelFailures).toEqual([]);
    expect(result.labelChanges).toMatchObject([{ label: narrowed, present: false }]);
    expect(result.present.has(right)).toBe(true);
  });

  it('rejects a new label that matches nothing, and labels whose fingerprint is wrong', () => {
    const stray = label('demo', 'bg-blue-500', 'TP');
    const result = check(
      { runs: {}, labels: {} },
      'demo',
      results(['no-hardcoded-color', 'bg-red-500', 1]),
      [stray],
    );
    expect(result.labelFailures).toEqual([expect.stringContaining('matches no finding')]);
    expect(invalidLabels([{ ...stray, source: 'bg-red-500' }])).toEqual([
      expect.stringContaining(
        `is ${fingerprint('demo', 'app/page.tsx', 'no-hardcoded-color', 'bg-red-500', 1)}`,
      ),
    ]);
    expect(invalidLabels([stray, stray])).toEqual([expect.stringContaining('labelled twice')]);
  });

  it('estimates the false-positive rate per run and rule, weighted by findings', () => {
    // Four color findings, two labelled (one FP); one icon finding, labelled TP.
    const found = results(
      ['no-hardcoded-color', 'a', 1],
      ['no-hardcoded-color', 'b', 2],
      ['no-hardcoded-color', 'c', 3],
      ['no-hardcoded-color', 'd', 4],
      ['icon-button-accessible-name', 'button', 5],
    );
    const labels = [
      label('demo', 'a', 'FP'),
      label('demo', 'b', 'TP'),
      label('demo', 'button', 'TP', { rule: 'icon-button-accessible-name' }),
    ];
    const runFindings = findings('demo', found);
    const current = { demo: { inspect: {}, files: 1, rules: ruleCounts(runFindings) } };
    const { present } = compare({ runs: {}, labels: {} }, current, runFindings, labels);
    const rate = falsePositiveRate(present, current);
    expect(rate.sample).toMatchObject({ tp: 2, fp: 1, d: 0 });
    expect(rate.sample.rate).toBeCloseTo(1 / 3);
    // Colors: 4 findings at 50%; icons: 1 finding at 0%.
    expect(rate.estimate).toBeCloseTo(2 / 5);
    expect(rate.coverage).toBe(1);
  });
});
