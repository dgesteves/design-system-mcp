import type { ResolvedConfig } from '../config.js';
import { TokenIndex } from '../tokens/index.js';
import type { ComponentInfo, DesignSystemModel } from '../types.js';

/**
 * Elements a design system typically replaces. Containers (`div`, `span`,
 * `p`) are deliberately absent: `Card` renders a `div`, but not every `div`
 * should be a `Card`.
 */
const REPLACEABLE_ELEMENTS = new Set([
  'a',
  'button',
  'dialog',
  'details',
  'hr',
  'img',
  'input',
  'label',
  'meter',
  'progress',
  'select',
  'table',
  'textarea',
]);

/** `<input type>` values that are not text fields; an `Input` component does not cover them. */
export const NON_TEXT_INPUT_TYPES = new Set([
  'checkbox',
  'radio',
  'range',
  'file',
  'hidden',
  'color',
  'submit',
  'reset',
  'button',
  'image',
]);

/** What the lint rules need to know about the design system. */
export class LintTarget {
  readonly components = new Map<string, ComponentInfo>();
  readonly tokens: TokenIndex;
  /** Native element → the component that replaces it. */
  readonly elements = new Map<string, ComponentInfo>();
  readonly componentFiles: Set<string>;
  private readonly importPaths: Set<string>;
  private readonly importPrefixes: string[];
  private readonly componentDirs: Set<string>;

  constructor(
    readonly model: DesignSystemModel,
    readonly config: Pick<ResolvedConfig, 'elements' | 'importPath'>,
  ) {
    for (const component of model.components) {
      this.components.set(component.name, component);
      for (const alias of component.aliases) this.components.set(alias, component);
    }
    this.tokens = new TokenIndex(model.tokens);
    this.componentFiles = new Set(model.components.map((c) => c.source.file));

    // Root components only: `CardHeader` is a `div` but `<div>` should not become `<CardHeader>`.
    for (const component of model.components) {
      if (component.name.includes('.')) continue;
      const fromElement =
        component.element && REPLACEABLE_ELEMENTS.has(component.element)
          ? component.element
          : undefined;
      const fromName = REPLACEABLE_ELEMENTS.has(component.name.toLowerCase())
        ? component.name.toLowerCase()
        : undefined;
      for (const element of [fromName, fromElement]) {
        if (!element) continue;
        const existing = this.elements.get(element);
        // Prefer the component named after the element (`Button` over `IconButton` for <button>).
        if (!existing || component.name.toLowerCase() === element)
          this.elements.set(element, component);
      }
    }
    for (const [element, name] of Object.entries(config.elements)) {
      const component = this.components.get(name);
      if (component) this.elements.set(element, component);
    }

    this.importPaths = new Set(model.components.map((c) => c.importPath));
    const dirs = [...this.importPaths]
      .map((p) => p.slice(0, p.lastIndexOf('/') + 1))
      .filter(Boolean);
    this.importPrefixes = [...new Set(dirs.filter((d) => !d.startsWith('.')))];
    if (config.importPath) this.importPrefixes.push(`${config.importPath}/`);
    this.componentDirs = new Set(
      dirs.map((d) => d.split('/').filter(Boolean).pop() ?? '').filter(Boolean),
    );
  }

  /** Whether an import specifier points at the design system. */
  isDesignSystemImport(specifier: string): boolean {
    if (this.importPaths.has(specifier) || specifier === this.config.importPath) return true;
    if (this.importPrefixes.some((prefix) => specifier.startsWith(prefix))) return true;
    if (specifier.startsWith('.')) {
      const segments = specifier.split('/');
      return segments.length >= 2 && this.componentDirs.has(segments.at(-2) ?? '');
    }
    return false;
  }

  /** Component names for "did you mean" suggestions. */
  names(): string[] {
    return [...this.components.keys()];
  }
}
