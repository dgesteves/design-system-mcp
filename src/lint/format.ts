import type { CheckResult } from '../types.js';
import { plural } from '../util/strings.js';
import { formatSarif } from './sarif.js';

export type OutputFormat = 'pretty' | 'json' | 'github' | 'sarif';

const color = (code: number) => (text: string, enabled: boolean) =>
  enabled ? `\u001b[${code}m${text}\u001b[39m` : text;
const red = color(31);
const yellow = color(33);
const dim = (text: string, enabled: boolean) => (enabled ? `\u001b[2m${text}\u001b[22m` : text);
const bold = (text: string, enabled: boolean) => (enabled ? `\u001b[1m${text}\u001b[22m` : text);

/**
 * Renders check results:
 * - `pretty`: grouped by file, for terminals and agents,
 * - `json`: the raw results,
 * - `github`: workflow commands that GitHub Actions turns into PR annotations,
 * - `sarif`: a SARIF 2.1.0 log, for GitHub code scanning and other SARIF consumers.
 */
export function formatDiagnostics(
  results: CheckResult[],
  format: OutputFormat,
  options: {
    color?: boolean;
    /** Findings a baseline accepted; set when a baseline was applied. */
    baselined?: number | undefined;
    /** Says that baseline entries no longer occur, and how to drop them. */
    fixedHint?: string | undefined;
    /** What the run left out: `5 design-system files skipped`, `12 tests and stories left out`. */
    notes?: readonly string[] | undefined;
    /** `sarif`: a result's file as a path relative to the repository root. */
    uri?: ((file: string) => string) | undefined;
  } = {},
): string {
  const { fixedHint } = options;
  if (format === 'json') return JSON.stringify(results, null, 2);
  if (format === 'sarif') return formatSarif(results, options.uri);
  if (format === 'github') {
    const lines = results.flatMap((result) =>
      result.diagnostics.map((d) => {
        const level = d.severity === 'error' ? 'error' : 'warning';
        const props = `file=${escapeProperty(result.file)},line=${d.line},col=${d.column},endLine=${d.endLine},endColumn=${d.endColumn},title=${escapeProperty(d.ruleId)}`;
        return `::${level} ${props}::${escapeData(d.message)}`;
      }),
    );
    if (fixedHint) lines.push(`::notice title=onsystem baseline::${escapeData(fixedHint)}`);
    return lines.join('\n');
  }

  const useColor = options.color ?? false;
  const lines: string[] = [];
  let errors = 0;
  let warnings = 0;
  for (const result of results) {
    errors += result.errorCount;
    warnings += result.warningCount;
    if (!result.diagnostics.length) continue;
    lines.push(bold(result.file, useColor));
    const width = Math.max(...result.diagnostics.map((d) => `${d.line}:${d.column}`.length));
    for (const d of result.diagnostics) {
      const mark = d.severity === 'error' ? red('error', useColor) : yellow('warn ', useColor);
      lines.push(
        `  ${dim(`${d.line}:${d.column}`.padEnd(width), useColor)}  ${mark}  ${d.message}  ${dim(d.ruleId, useColor)}`,
      );
    }
    lines.push('');
  }
  const total = errors + warnings;
  const notes = [
    options.baselined === undefined
      ? ''
      : `${options.baselined.toLocaleString('en-US')} in the baseline`,
    ...(options.notes ?? []),
  ].filter(Boolean);
  const aside = notes.length ? ` (${notes.join('; ')})` : '';
  // "in 1 of 3 files checked", not "in 3 files", when the findings are in fewer.
  const flagged = results.filter((r) => r.diagnostics.length).length;
  const where =
    flagged === results.length
      ? plural(results.length, 'file')
      : `${flagged} of ${plural(results.length, 'file')} checked`;
  lines.push(
    total
      ? `${errors ? red(plural(errors, 'error'), useColor) : '0 errors'}, ${warnings ? yellow(plural(warnings, 'warning'), useColor) : '0 warnings'} in ${where}${aside}`
      : `${options.baselined === undefined ? 'No problems' : 'No new problems'} in ${plural(results.length, 'file')}${aside}.`,
  );
  if (fixedHint) lines.push(dim(fixedHint, useColor));
  return lines.join('\n');
}

function escapeData(value: string): string {
  return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function escapeProperty(value: string): string {
  return escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');
}
