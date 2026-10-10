import path from 'node:path';

import type { ResolvedConfig } from '../config.js';
import type { ModuleResolver } from '../modules.js';
import { TokenIndex } from '../tokens/index.js';
import { tokenFamily } from '../tokens/roles.js';
import type { ComponentInfo, DesignSystemModel, Token } from '../types.js';
import { toPosix } from '../util/paths.js';
import { unique } from '../util/strings.js';
import { COLOR_UTILITY, parseUtility } from './tailwind.js';

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

/**
 * Component names that say what a native element is: `Button` is a `<button>`,
 * `Link` an `<a>`. Matched whole; a longer name ending in one (`IconButton`,
 * `SearchInput`, `DataTable`) is related more loosely.
 */
const ELEMENT_NAMES: Record<string, string[]> = {
  a: ['Link', 'A'],
  button: ['Button'],
  dialog: ['Dialog', 'Modal'],
  details: ['Details', 'Disclosure'],
  hr: ['Separator', 'Divider', 'Hr'],
  img: ['Img', 'Image'],
  input: ['Input', 'TextInput', 'TextField'],
  label: ['Label'],
  meter: ['Meter'],
  progress: ['Progress', 'ProgressBar'],
  select: ['Select', 'NativeSelect'],
  table: ['Table'],
  textarea: ['Textarea', 'TextArea'],
};

/**
 * Names that may mean the element or something else: Radix's popover `Anchor`,
 * shadcn/ui's `Field` (a layout around a control). Related loosely, like a suffix.
 */
const LOOSE_NAMES: Record<string, string[]> = {
  a: ['Anchor'],
  input: ['Field'],
};

/**
 * How a component's name relates to a native element: `exact` for `Button` and
 * `<button>`, `suffix` for `IconButton` (and the ambiguous `Anchor` or `Field`), or none.
 */
export function nameRelation(name: string, element: string): 'exact' | 'suffix' | undefined {
  const words = ELEMENT_NAMES[element];
  if (!words) return undefined;
  if (words.includes(name)) return 'exact';
  if (LOOSE_NAMES[element]?.includes(name)) return 'suffix';
  return words.some((word) => word.length > 1 && name.length > word.length && name.endsWith(word))
    ? 'suffix'
    : undefined;
}

/** The replaceable element a component is named for, if any: `select` for `Select` and `NativeSelect`. */
function namedFor(name: string): string | undefined {
  return Object.keys(ELEMENT_NAMES).find((element) => nameRelation(name, element) !== undefined);
}

/** What the lint rules need to know about the design system. */
export class LintTarget {
  readonly components = new Map<string, ComponentInfo>();
  /** Every component under each name and alias, when two design systems share one (`Button`). */
  private readonly named = new Map<string, ComponentInfo[]>();
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
  private readonly componentModules = new Set<string>();
  private readonly moduleDirs = new Set<string>();

  /**
   * `resolver` finds the module an import points at and what it exports
   * (`@calcom/ui/components/icon` → `components/icon/index.ts`), so a name from
   * a module the model left out is not taken for an invented one. Without it,
   * every missing name is invented.
   */
  constructor(
    readonly model: DesignSystemModel,
    readonly config: Pick<ResolvedConfig, 'elements' | 'importPath'>,
    private readonly resolver?: Pick<ModuleResolver, 'locate' | 'exportsOf'>,
  ) {
    for (const component of model.components) {
      for (const name of [component.name, ...component.aliases]) {
        this.components.set(name, component);
        this.named.set(name, [...(this.named.get(name) ?? []), component]);
      }
    }
    // Without components there is no usage to tell a scoped family by.
    this.tokens = new TokenIndex(model.tokens, {
      filesUsing: model.components.length ? familyUsage(model) : undefined,
    });
    this.componentFiles = new Set(model.components.map((c) => c.source.file));
    this.exports = new Set(model.exports);

    // Root components only: `BreadcrumbLink` is an `a`, but `<a>` should not become a breadcrumb part.
    // A component replaces an element it is named for (`Button`, `Link`, `Input`). One that only
    // renders the element, or whose name merely ends like it (`IconButton`), replaces it only when
    // it needs nothing the element does not: `<button>` never becomes `<DataTableColumnHeader>`
    // (it needs `column` and `title`), nor `<label>` a `<FileUpload>` that takes no `htmlFor`.
    for (const component of model.components) {
      if (component.parent) continue;
      const named = namedFor(component.name);
      for (const element of REPLACEABLE_ELEMENTS) {
        const relation = nameRelation(component.name, element);
        if (!relation && component.element !== element) continue;
        // `Select` renders a <button> trigger, but it is a select, not a button.
        if (!relation && named) continue;
        if (relation !== 'exact' && !this.plainFor(component, element)) continue;
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
    // module: `@acme/ui` says nothing about `@acme/icons`. A pattern
    // (`@acme/ui/{path}`) covers what comes before `{path}`.
    const pattern = config.importPath?.indexOf('{path}') ?? -1;
    this.importPrefixes = config.importPath
      ? [pattern === -1 ? `${config.importPath}/` : config.importPath.slice(0, pattern)]
      : unique(
          [...this.importPaths]
            .filter((p) => !p.startsWith('.'))
            .map((p) => p.slice(0, p.lastIndexOf('/') + 1))
            .filter(Boolean),
        );
    for (const file of this.componentFiles) {
      for (const module of modulePaths(file)) this.componentModules.add(module);
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
        this.componentModules.has(resolved) ||
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
   * Whether `name`, imported from the design system, may be a real export the
   * model left out rather than an invented one: its module exists outside the
   * folders extraction read and exports `name`, or re-exports from such a
   * module (an excluded `icons/` folder, a barrel's `export * from "./icons"`).
   * A module declared in a package's `exports` but not on disk counts too,
   * except the design system's own import path.
   */
  outsideModel(specifier: string, name: string, fromFile = 'snippet.tsx'): boolean {
    const location = this.resolver?.locate(specifier, fromFile);
    if (!location) return false;
    if (!location.file) {
      return !this.importPaths.has(specifier) && specifier !== this.config.importPath;
    }
    return this.mayExport(location.file, name, 0);
  }

  /**
   * The component a JSX tag means when `name` is imported from `specifier`, among the
   * model's components of that name: the one declared where the import leads, through
   * barrels (`export { Button } from "./Button"`, `export *`). `undefined` when it leads to
   * a declaration the model does not have (another package's `Button`, or a file of the
   * same name outside the component folders), which is not ours to check. Where the import
   * cannot be followed, the component of that name, as before.
   */
  componentFor(name: string, specifier: string, fromFile: string): ComponentInfo | undefined {
    const fallback = this.components.get(name);
    const { resolver } = this;
    const file = resolver?.locate(specifier, fromFile)?.file;
    if (!resolver || !file) return fallback;
    const candidates = this.named.get(name) ?? (fallback ? [fallback] : []);
    const at = (target: string) => {
      const modules = modulePaths(target);
      return candidates.find((c) =>
        modulePaths(c.source.file).some((module) => modules.includes(module)),
      );
    };
    const direct = at(file);
    if (direct) return direct;
    // An import of a component file the model has, under another name (`export { X as Y }`).
    if (modulePaths(file).some((module) => this.componentModules.has(module))) return fallback;
    const origin = this.originOf(name, file, 0);
    // Not followed to the end, or not exported there: the model's component of that name.
    if (origin === null || origin === undefined) return fallback;
    const declared = at(origin);
    if (declared) return declared;
    if (modulePaths(origin).some((module) => this.componentModules.has(module))) return fallback;
    return undefined;
  }

  /**
   * The file that declares what `file` exports as `name`, following re-exports: a path
   * relative to the root, `undefined` when it does not export it, `null` when a step of the
   * way does not resolve or cannot be read.
   */
  private originOf(name: string, file: string, depth: number): string | undefined | null {
    if (depth > 8) return null;
    const exports = this.resolver?.exportsOf(file);
    if (!exports) return null;
    if (exports.declared.includes(name)) return file;
    const reexport = exports.reexports.get(name);
    if (reexport) {
      return reexport.from === undefined
        ? null
        : this.originOf(reexport.name, reexport.from, depth + 1);
    }
    let unknown = false;
    for (const from of exports.starFrom) {
      if (from === undefined) {
        unknown = true;
        continue;
      }
      const found = this.originOf(name, from, depth + 1);
      if (typeof found === 'string') return found;
      if (found === null) unknown = true;
    }
    return unknown ? null : undefined;
  }

  private mayExport(file: string, name: string, depth: number): boolean {
    if (modulePaths(file).some((module) => this.componentModules.has(module))) return false;
    const exports = this.resolver?.exportsOf(file);
    if (!exports) return depth > 0;
    // Declared in a folder extraction read (an icon map next to the components), it was seen
    // and is no component; declared anywhere else, the model never looked.
    if (exports.names.includes(name)) return !this.moduleDirs.has(path.posix.dirname(file));
    return exports.starFrom.some(
      (from) => from === undefined || depth >= 3 || this.mayExport(from, name, depth + 1),
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

  /**
   * Whether a component asks for nothing beyond what the element takes: no
   * required prop of its own, and the element's own attributes (`htmlFor` for a
   * label). Unknown when its props do not fully resolve, so false.
   */
  private plainFor(component: ComponentInfo, element: string): boolean {
    if (component.openProps) return false;
    const accepted = new Set<string>();
    for (const inherited of component.inherits) {
      for (const name of this.model.propSets[inherited.set] ?? []) accepted.add(name);
    }
    if (component.props.some((p) => p.required && !accepted.has(p.name))) return false;
    for (const prop of component.props) accepted.add(prop.name);
    return (ELEMENT_ATTRIBUTES[element] ?? []).every((name) => accepted.has(name));
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
            (!this.config.importPath || this.config.importPath.includes('{path}')) &&
            c.importPath === specifier
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
 * Token family → the design-system files whose classes or CSS variables use
 * one of its colors (`bg-sidebar-accent`, `var(--sh-class)`).
 */
function familyUsage(model: DesignSystemModel): Map<string, Set<string>> {
  const byKey = new Map<string, Token>();
  const byVar = new Map<string, Token>();
  for (const token of model.tokens) {
    if (token.category !== 'color') continue;
    if (token.tailwind) byKey.set(token.tailwind, token);
    if (token.cssVar) byVar.set(token.cssVar, token);
  }
  const usage = new Map<string, Set<string>>();
  const use = (token: Token | undefined, file: string) => {
    if (!token) return;
    const family = tokenFamily(token);
    const files = usage.get(family) ?? new Set<string>();
    files.add(file);
    usage.set(family, files);
  };
  for (const component of model.components) {
    const file = component.source.file;
    for (const cls of component.classNames) {
      const key = COLOR_UTILITY.exec(parseUtility(cls).base)?.[1];
      if (key) use(byKey.get(key), file);
    }
    for (const cssVar of component.cssVars) use(byVar.get(cssVar), file);
  }
  return usage;
}

/**
 * How well a component replaces a native element: rendering it counts most
 * (`NativeSelect` over Radix's `Select` for <select>), then being named after
 * it (`Button` over `IconButton` for <button>).
 */
function fit(component: ComponentInfo, element: string): number {
  const relation = nameRelation(component.name, element);
  return (
    (component.element === element ? 2 : 0) +
    (relation === 'exact' ? 1 : relation === 'suffix' ? 0.5 : 0)
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
