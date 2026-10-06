import type ts from 'typescript';

import type { RuleId, RuleOptions } from '../config.js';
import type { ComponentInfo, Severity, TextEdit } from '../types.js';
import type { Analysis, JsxNode } from './analyze.js';
import type { LintTarget } from './target.js';

export interface Report {
  start: number;
  end: number;
  message: string;
  suggestion?: string | undefined;
  fix?: TextEdit[] | undefined;
  /** Rules may downgrade (never upgrade) their configured severity for low-confidence findings. */
  severity?: Severity;
}

export interface RuleContext {
  file: string;
  text: string;
  sourceFile: ts.SourceFile;
  target: LintTarget;
  analysis: Analysis;
  options: RuleOptions;
  /** True when the checked file is one of the design system's own component sources. */
  isDesignSystemSource: boolean;
  resolve(element: JsxNode): Resolution;
  report(report: Report): void;
}

export interface Rule {
  id: RuleId;
  description: string;
  run(context: RuleContext): void;
}

export type Resolution =
  /** A design-system component. */
  | { kind: 'component'; component: ComponentInfo }
  /** A lowercase JSX tag. */
  | { kind: 'intrinsic'; tag: string }
  /** Imported from the design system's path, but the design system has no such component. */
  | { kind: 'missing-export'; name: string; source: string }
  /** `Card.Header` where `Card` is a design-system component without that member. */
  | { kind: 'missing-member'; owner: ComponentInfo; member: string }
  /** Not imported, not declared and not a design-system component. */
  | { kind: 'unresolved'; name: string }
  /** Imported from elsewhere or declared locally: not our business. */
  | { kind: 'external' };

/**
 * Resolves a JSX tag to a design-system component, following imports and
 * aliases. `file` is the checked file relative to the root, for relative imports.
 */
export function resolveElement(
  element: JsxNode,
  analysis: Analysis,
  target: LintTarget,
  file: string,
): Resolution {
  const tag = element.tag;
  if (/^[a-z]/.test(tag) && !tag.includes('.')) return { kind: 'intrinsic', tag };
  const [head = '', ...rest] = tag.split('.');
  const binding = analysis.imports.get(head);

  // `UI.Button` with `import * as UI from "@/components/ui"`.
  if (binding?.imported === '*' && rest.length) {
    if (!target.isDesignSystemImport(binding.source, file)) return { kind: 'external' };
    const name = rest.join('.');
    const component = target.components.get(name);
    return component
      ? { kind: 'component', component }
      : { kind: 'missing-export', name, source: binding.source };
  }

  let owner: ComponentInfo | undefined;
  if (binding) {
    if (!target.isDesignSystemImport(binding.source, file)) return { kind: 'external' };
    const imported =
      binding.imported === 'default'
        ? (target.defaultExport(binding.source, file)?.name ?? head)
        : binding.imported;
    owner = target.components.get(imported);
    if (!owner) return { kind: 'missing-export', name: imported, source: binding.source };
  } else if (analysis.declared.has(head)) {
    return { kind: 'external' };
  } else {
    owner = target.components.get(head);
    if (!owner) return { kind: 'unresolved', name: tag };
  }

  if (!rest.length) return { kind: 'component', component: owner };
  const member = target.components.get(`${owner.name}.${rest.join('.')}`);
  return member
    ? { kind: 'component', component: member }
    : { kind: 'missing-member', owner, member: rest.join('.') };
}
