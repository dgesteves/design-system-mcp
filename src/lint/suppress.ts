import ts from 'typescript';

import { RULE_IDS } from '../config.js';
import type { Diagnostic } from '../types.js';
import { closest } from '../util/strings.js';

/**
 * The prefix of suppression comments, the one place it is spelled:
 * `// onsystem-disable-next-line <rule>[, <rule>]`, `// onsystem-disable-line
 * <rule>` at the end of a line, and `/* onsystem-disable [<rule>] *\/` for the
 * rest of the file. In JSX, `{/* onsystem-disable-next-line <rule> *\/}`.
 */
export const DIRECTIVE_PREFIX = 'onsystem';

type Scope = 'next-line' | 'line' | 'file';

interface Directive {
  scope: Scope;
  /** 1-based line the directive covers (`next-line`, `line`), or the line it starts from (`file`). */
  line: number;
  /** The rules it turns off; undefined for all. */
  rules?: Set<string>;
}

export interface Directives {
  directives: Directive[];
  /** Rule names that do not exist, as warnings to report. */
  problems: Diagnostic[];
}

const DIRECTIVE = new RegExp(
  `(?:\\/\\/|\\/\\*)[ \\t*]*${DIRECTIVE_PREFIX}-disable(-next-line|-line)?(?=[\\s*,]|$)`,
  'g',
);

/** The suppression comments in a file, read from the source as written. */
export function readDirectives(sourceFile: ts.SourceFile): Directives {
  const text = sourceFile.text;
  const directives: Directive[] = [];
  const problems: Diagnostic[] = [];
  for (const match of text.matchAll(DIRECTIVE)) {
    const start = match.index;
    if (insideLiteral(sourceFile, start)) continue;
    const block = text.startsWith('/*', start);
    const bodyEnd = block ? text.indexOf('*/', start + 2) : lineEnd(text, start);
    const end = bodyEnd === -1 ? text.length : bodyEnd;
    // `-- reason` after the rules explains the suppression.
    const body = text.slice(start + match[0].length, end).split(/\s--\s|\s--$/)[0] ?? '';
    const names = body
      .split(/[\s,*]+/)
      .map((n) => n.trim())
      .filter(Boolean);
    const known = names.filter((n) => (RULE_IDS as readonly string[]).includes(n));
    const position = (offset: number) => sourceFile.getLineAndCharacterOfPosition(offset);
    for (const name of names) {
      if (known.includes(name)) continue;
      const at = text.indexOf(name, start + match[0].length);
      const { line, character } = position(at);
      const guess = closest(name, [...RULE_IDS], 0.5);
      problems.push({
        ruleId: 'suppression',
        severity: 'warning',
        message: `Unknown rule "${name}" in ${DIRECTIVE_PREFIX}-disable${match[1] ?? ''}, so nothing is suppressed for it.${guess ? ` Did you mean "${guess}"?` : ''}`,
        line: line + 1,
        column: character + 1,
        endLine: line + 1,
        endColumn: character + 1 + name.length,
        source: name,
      });
    }
    // Only unknown names: it suppresses nothing, rather than everything.
    if (names.length && !known.length) continue;
    const rules = known.length ? new Set(known) : undefined;
    const scope: Scope =
      match[1] === '-next-line' ? 'next-line' : match[1] === '-line' ? 'line' : 'file';
    const startLine = position(start).line + 1;
    const endLine = position(end).line + 1;
    directives.push({
      scope,
      line: scope === 'next-line' ? endLine + 1 : startLine,
      ...(rules ? { rules } : {}),
    });
  }
  return { directives, problems };
}

/** Whether a directive turns the diagnostic off. Syntax errors are never suppressed. */
export function isSuppressed(diagnostic: Diagnostic, directives: readonly Directive[]): boolean {
  if (diagnostic.ruleId === 'syntax' || diagnostic.ruleId === 'suppression') return false;
  return directives.some(
    (d) =>
      (!d.rules || d.rules.has(diagnostic.ruleId)) &&
      (d.scope === 'file' ? diagnostic.line >= d.line : diagnostic.line === d.line),
  );
}

function lineEnd(text: string, from: number): number {
  const end = text.indexOf('\n', from);
  return end === -1 ? text.length : end;
}

/** Whether an offset falls inside a string, template or JSX text, where `//` is not a comment. */
function insideLiteral(sourceFile: ts.SourceFile, offset: number): boolean {
  let node: ts.Node = sourceFile;
  for (;;) {
    let next: ts.Node | undefined;
    ts.forEachChild(node, (child) => {
      if (!next && child.getStart(sourceFile) <= offset && offset < child.end) next = child;
    });
    if (!next) break;
    node = next;
  }
  return (
    ts.isStringLiteralLike(node) ||
    ts.isTemplateLiteralToken(node) ||
    ts.isJsxText(node) ||
    ts.isRegularExpressionLiteral(node)
  );
}
