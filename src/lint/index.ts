import ts from 'typescript';

import type { RuleId, ResolvedRule } from '../config.js';
import type { CheckResult, Diagnostic } from '../types.js';
import { analyze } from './analyze.js';
import { resolveElement, type Resolution, type Rule, type RuleContext } from './context.js';
import {
  iconButtonAccessibleName,
  noUnknownComponent,
  noUnknownProp,
  noUnknownVariant,
  preferDesignSystemComponent,
} from './rules/components.js';
import { noHardcodedColor, noHardcodedRadius, noHardcodedSpacing } from './rules/hardcoded.js';
import type { LintTarget } from './target.js';

export { LintTarget } from './target.js';
export { formatDiagnostics, type OutputFormat } from './format.js';

export const RULES: readonly Rule[] = [
  noHardcodedColor,
  noHardcodedSpacing,
  noHardcodedRadius,
  preferDesignSystemComponent,
  noUnknownComponent,
  noUnknownProp,
  noUnknownVariant,
  iconButtonAccessibleName,
];

export interface CheckOptions {
  /** File name used in results and to pick TSX vs JSX parsing. Default `snippet.tsx`. */
  filename?: string | undefined;
  rules: Record<RuleId, ResolvedRule>;
}

/**
 * Lints a TSX/JSX snippet or file against the design system. Purely
 * syntactic: no type-checking of the snippet, so it works on fragments an
 * agent has not saved yet.
 */
export function checkSource(code: string, target: LintTarget, options: CheckOptions): CheckResult {
  const file = options.filename ?? 'snippet.tsx';
  // `.ts` files must not be parsed as TSX: `<T>(x: T) => x` would read as a JSX tag.
  const kind = /\.[cm]?jsx?$/.test(file)
    ? ts.ScriptKind.JSX
    : /\.[cm]?ts$/.test(file)
      ? ts.ScriptKind.TS
      : ts.ScriptKind.TSX;
  const sourceFile = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, kind);
  const analysis = analyze(sourceFile);
  const diagnostics: Diagnostic[] = [];
  const cache = new Map<unknown, Resolution>();
  // A byte-order mark is a character to TypeScript but not a column to editors.
  // Offsets (fix ranges) stay on the text as given.
  const bom = code.charCodeAt(0) === 0xfeff ? 1 : 0;
  const position = (offset: number) => {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(offset);
    return { line: line + 1, column: Math.max(1, character + 1 - (line === 0 ? bom : 0)) };
  };

  for (const rule of RULES) {
    const setting = options.rules[rule.id];
    if (setting.severity === 'off') continue;
    const severity = setting.severity === 'error' ? 'error' : 'warning';
    const context: RuleContext = {
      file,
      text: code,
      sourceFile,
      target,
      analysis,
      options: setting.options,
      isDesignSystemSource: target.componentFiles.has(file),
      resolve(element) {
        let resolution = cache.get(element.node);
        if (!resolution) {
          resolution = resolveElement(element, analysis, target, file);
          cache.set(element.node, resolution);
        }
        return resolution;
      },
      report(report) {
        const start = position(report.start);
        const end = position(report.end);
        const diagnostic: Diagnostic = {
          ruleId: rule.id,
          severity: report.severity === 'warning' ? 'warning' : severity,
          message: report.message,
          line: start.line,
          column: start.column,
          endLine: end.line,
          endColumn: end.column,
          source: code.slice(report.start, report.end),
        };
        if (report.suggestion) diagnostic.suggestion = report.suggestion;
        if (report.fix?.length) diagnostic.fix = report.fix;
        diagnostics.push(diagnostic);
      },
    };
    rule.run(context);
  }

  // Syntax errors make every other finding suspect; surface them first.
  for (const error of syntaxErrors(sourceFile)) {
    const start = position(error.start);
    diagnostics.push({
      ruleId: 'syntax',
      severity: 'error',
      message: `Syntax error: ${ts.flattenDiagnosticMessageText(error.messageText, ' ')}`,
      line: start.line,
      column: start.column,
      endLine: start.line,
      endColumn: start.column + error.length,
      source: code.slice(error.start, error.start + error.length),
    });
  }

  diagnostics.sort(
    (a, b) => a.line - b.line || a.column - b.column || a.ruleId.localeCompare(b.ruleId),
  );
  return {
    file,
    diagnostics,
    errorCount: diagnostics.filter((d) => d.severity === 'error').length,
    warningCount: diagnostics.filter((d) => d.severity === 'warning').length,
  };
}

/** Syntax errors through the public API: a one-file program with no libs or resolution. */
function syntaxErrors(sourceFile: ts.SourceFile): readonly ts.DiagnosticWithLocation[] {
  const host: ts.CompilerHost = {
    getSourceFile: (name) => (name === sourceFile.fileName ? sourceFile : undefined),
    getDefaultLibFileName: () => 'lib.d.ts',
    writeFile: () => undefined,
    getCurrentDirectory: () => '/',
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: (name) => name === sourceFile.fileName,
    readFile: () => undefined,
  };
  const program = ts.createProgram({
    rootNames: [sourceFile.fileName],
    options: { noLib: true, noResolve: true, allowJs: true, jsx: ts.JsxEmit.Preserve },
    host,
  });
  return program.getSyntacticDiagnostics(sourceFile);
}

/** Applies non-overlapping fixes from the end of the file backwards. */
export function applyFixes(code: string, diagnostics: Diagnostic[]): string {
  const edits = diagnostics.flatMap((d) => d.fix ?? []).sort((a, b) => b.range[0] - a.range[0]);
  let out = code;
  let floor = Infinity;
  for (const edit of edits) {
    if (edit.range[1] > floor) continue;
    out = out.slice(0, edit.range[0]) + edit.text + out.slice(edit.range[1]);
    floor = edit.range[0];
  }
  return out;
}
