import path from 'node:path';

import type { ResolvedConfig } from '../config.js';
import { TokenIndex } from '../tokens/index.js';
import type { ComponentInfo, DesignSystemModel } from '../types.js';
import { toPosix } from '../util/paths.js';
import { unique } from '../util/strings.js';

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

/**
 * Attributes only some replaceable elements take. A component that accepts
 * all of an element's (Radix `Label` takes `htmlFor`) takes that element's
 * attributes, whatever it renders at the top.
 */
const ELEMENT_ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'target', 'download'],
  button: ['formAction', 'formNoValidate'],
  img: ['src', 'srcSet', 'alt'],
  input: ['accept', 'checked', 'step'],
  label: ['htmlFor'],
  select: ['multiple', 'size'],
  table: ['cellPadding', 'cellSpacing'],
  textarea: ['rows', 'cols'],
};

/** What the lint rules need to know about the design system. */
export class LintTarget {
  readonly components = new Map<string, ComponentInfo>();
  readonly tokens: TokenIndex;
  /** Native element → the component that replaces it. */
  readonly elements = new Map<string, ComponentInfo>();
  /** The `elements` entries the config sets explicitly. */
  private readonly configured = new Map<string, ComponentInfo>();
  readonly componentFiles: Set<string>;
  /** Every value the component files export, components or not (`Icons`, `buttonVariants`). */
  readonly exports: Set<string>;
  private readonly importPaths: Set<string>;
  private readonly importPrefixes: string[];
  /** Component files relative to the root, without extension (`components/ui/button`). */
  private readonly modules = new Set<string>();
  private readonly moduleDirs = new Set<string>();

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
    this.exports = new Set(model.exports);

    // Root components only: `BreadcrumbLink` is an `a`, but `<a>` should not become a breadcrumb part.
    for (const component of model.components) {
      if (component.parent) continue;
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
        if (!existing || fit(component, element) > fit(existing, element)) {
          this.elements.set(element, component);
        }
      }
    }
    for (const [element, name] of Object.entries(config.elements)) {
      const component = this.components.get(name);
      if (!component) continue;
      this.elements.set(element, component);
      this.configured.set(element, component);
    }

    this.importPaths = new Set(model.components.map((c) => c.importPath));
    // A path alias names a directory (`@/components/ui/`), so any module under it
    // belongs to the design system. A configured package name is a single
    // module: `@acme/ui` says nothing about `@acme/icons`.
    this.importPrefixes = config.importPath
      ? [`${config.importPath}/`]
      : unique(
          [...this.importPaths]
            .filter((p) => !p.startsWith('.'))
            .map((p) => p.slice(0, p.lastIndexOf('/') + 1))
            .filter(Boolean),
        );
    for (const file of this.componentFiles) {
      for (const module of modulePaths(file)) this.modules.add(module);
      this.moduleDirs.add(path.posix.dirname(file));
    }
  }

  /**
   * Whether an import specifier points at the design system. Relative
   * specifiers are resolved against `fromFile` (relative to the root) and
   * must land on a component file, in a directory that holds one, or on that
   * directory itself (a barrel: `../components/ui` and its index).
   */
  isDesignSystemImport(specifier: string, fromFile = 'snippet.tsx'): boolean {
    if (specifier.startsWith('.')) {
      const resolved = this.resolveRelative(specifier, fromFile);
      return (
        this.modules.has(resolved) ||
        this.moduleDirs.has(resolved) ||
        this.moduleDirs.has(path.posix.dirname(resolved))
      );
    }
    if (this.importPaths.has(specifier) || specifier === this.config.importPath) return true;
    // `@/components/ui/button`, or the barrel `@/components/ui` itself.
    return this.importPrefixes.some(
      (prefix) => specifier.startsWith(prefix) || specifier === prefix.slice(0, -1),
    );
  }

  /**
   * Whether `<Component>` can replace the native element `key` (`a`,
   * `input[type=checkbox]`) by renaming the tag: the config maps it, it
   * renders that element, or it takes the element's own attributes.
   */
  isDropIn(component: ComponentInfo, key: string): boolean {
    if (this.configured.get(key) === component || component.element === key) return true;
    const needed = ELEMENT_ATTRIBUTES[key];
    if (!needed || component.openProps) return false;
    const accepted = new Set(component.props.map((p) => p.name));
    for (const inherited of component.inherits) {
      for (const name of this.model.propSets[inherited.set] ?? []) accepted.add(name);
    }
    return needed.every((name) => accepted.has(name));
  }

  /** The component a module exports as `default`, for `import Anything from "..."`. */
  defaultExport(specifier: string, fromFile = 'snippet.tsx'): ComponentInfo | undefined {
    const resolved = specifier.startsWith('.')
      ? this.resolveRelative(specifier, fromFile)
      : undefined;
    const matches = this.model.components.filter(
      (c) =>
        c.exportName === 'default' &&
        (resolved === undefined
          ? // With a package name every component shares it, so it says nothing about the file.
            !this.config.importPath && c.importPath === specifier
          : modulePaths(c.source.file).includes(resolved)),
    );
    return matches.length === 1 ? matches[0] : undefined;
  }

  private resolveRelative(specifier: string, fromFile: string): string {
    const from = path.isAbsolute(fromFile) ? path.relative(this.model.root, fromFile) : fromFile;
    return path.posix.join(path.posix.dirname(toPosix(from)), stripExtension(specifier));
  }

  /** Component names for "did you mean" suggestions. */
  names(): string[] {
    return [...this.components.keys()];
  }
}

/**
 * How well a component replaces a native element: rendering it counts most
 * (`NativeSelect` over Radix's `Select` for <select>), then being named after
 * it (`Button` over `IconButton` for <button>).
 */
function fit(component: ComponentInfo, element: string): number {
  return (
    (component.element === element ? 2 : 0) + (component.name.toLowerCase() === element ? 1 : 0)
  );
}

function stripExtension(file: string): string {
  return file.replace(/\.(?:[cm]?[jt]sx?)$/, '');
}

/** `components/ui/button.tsx` → `components/ui/button`; an index file is also its directory. */
function modulePaths(file: string): string[] {
  const module = stripExtension(file);
  return module.endsWith('/index') ? [module, module.slice(0, -'/index'.length)] : [module];
}
