import fs from 'node:fs';
import path from 'node:path';

import { escapePath, globSync } from 'tinyglobby';

import { readProjectConfig, type ProjectConfig } from './extract/program.js';
import { buildEntries, exportedFiles, moduleFile, sourceTarget } from './package-source.js';
import { relativePath, toPosix } from './util/paths.js';
import { unique } from './util/strings.js';

/**
 * How apps import a design-system module, from a package's `exports`:
 * `@midday/ui/button` → `../../packages/ui/src/components/button.tsx`, or a
 * pattern (`@workspace/ui/components/*` → `…/src/components/*.tsx`). A
 * specifier without `*` and a pattern target map every matching file to one
 * module: a package that exports its components from a barrel.
 */
export interface ImportMapping {
  specifier: string;
  /** File or pattern relative to the root, with forward slashes. */
  target: string;
}

/** What zero-config detection found, used where the config leaves a field unset. */
export interface Detection {
  components: string[];
  tokens: string[];
  docs: string[];
  imports: ImportMapping[];
  /**
   * Keep the default globs as well: an app that imports a workspace package
   * may still have its own `components/ui`.
   */
  withDefaults: boolean;
  /** Where it came from, for `inspect` and the server log. */
  source: string;
  /**
   * With more than one design system (a `components.json` and a workspace package, or
   * two packages): each one's component globs, the one the code imports most first. Its
   * components win where two share a name, and are the ones suggested for native elements.
   */
  designSystems?: DesignSystemSource[] | undefined;
}

/** One of several design systems an app uses, and how often its code imports it. */
export interface DesignSystemSource {
  source: string;
  components: string[];
  imports: number;
}

interface Found {
  components: string[];
  tokens: string[];
  imports: ImportMapping[];
  /** Absolute directories the components live in, for docs. */
  dirs: string[];
  source: string;
  /** The workspace package the components come from, when they come from one. */
  package?: string | undefined;
  /** Specifiers the app imports them by: a package name, a `components.json` alias. */
  prefixes?: string[] | undefined;
}

const COMPONENT_FILE = /\.[jt]sx$/;
/** A module a barrel can lead to: TypeScript or JavaScript, not a declaration file. */
const SCRIPT_FILE = /(?<!\.d)\.[cm]?[jt]sx?$/;
const STYLESHEETS = [
  'src/styles/globals.css',
  'src/globals.css',
  'styles/globals.css',
  'globals.css',
  'src/index.css',
];

/**
 * Finds the design system without a config:
 *
 * 1. `components.json` (shadcn/ui): the `ui` alias, resolved through tsconfig
 *    `paths` or a workspace package, and `tailwind.css`.
 * 2. Without one, the root may be a design-system package: its `exports` map to
 *    component files, through barrels and from `dist/` back to the sources.
 * 3. Dependencies named like a design system (`@acme/ui`) that resolve to
 *    workspace sources, read the same way or through their own `components.json`,
 *    or, for a package without `exports` that apps import by path
 *    (`@acme/ui/primitives/button`), from the files the root's code imports. They
 *    are added to what `components.json` found, not skipped for it.
 * 4. A flat folder of components that wrap a primitives library, the way React
 *    Aria's Tailwind starter ships them (`src/Button.tsx`, `src/Checkbox.tsx`).
 *
 * With more than one design system, the one the root's code imports most comes first
 * (`designSystems`). A candidate whose globs match no file is skipped. Returns undefined
 * when nothing applies, so the shadcn defaults stay in force.
 */
export function detectProject(root: string, tsconfig?: string): Detection | undefined {
  const packages = new PackageFinder(root);
  const found: Found[] = [];

  const shadcn = readJson(path.join(root, 'components.json'));
  const fromShadcn = shadcn
    ? fromComponentsJson(root, root, shadcn, readProjectConfig(root, tsconfig), packages)
    : undefined;
  if (fromShadcn && matchesAny(root, fromShadcn)) {
    found.push({ ...fromShadcn, source: `components.json (ui: ${fromShadcn.source})` });
  }
  // The app's own components/ui stays in unless components.json names its folder.
  const withDefaults = !found.length;

  const own = readJson(path.join(root, 'package.json'));
  if (!found.length) {
    const self = own ? fromPackage(root, root, own) : undefined;
    if (self && matchesAny(root, self)) {
      return detection(root, [self], false, `package.json exports of ${self.source}`);
    }
  }

  const names = Object.keys({
    ...asRecord(own?.dependencies),
    ...asRecord(own?.devDependencies),
  }).filter(isDesignSystemName);
  let imported: Map<string, Set<string>> | undefined;
  for (const name of names) {
    // What components.json already points into.
    if (found.some((f) => f.package === name)) continue;
    // Only workspace sources: a package installed from the registry is compiled.
    const dir = packages.find(name);
    const pkg = dir ? readJson(path.join(dir, 'package.json')) : undefined;
    if (!dir || !pkg) continue;
    const candidate =
      fromPackage(root, dir, pkg) ??
      fromPackageComponentsJson(root, dir, pkg, packages) ??
      fromImports(root, dir, name, (imported ??= importedSubpaths(root, names)).get(name));
    if (candidate && matchesAny(root, candidate)) {
      found.push({
        ...candidate,
        source: `workspace package ${candidate.source}`,
        package: name,
        prefixes: [name],
      });
    }
  }
  if (found.length) {
    if (found.length === 1) {
      const [only] = found;
      return detection(root, found, withDefaults, only?.source ?? '');
    }
    // Several design systems: the most imported first, the rest after it.
    const counts = importCounts(
      root,
      found.map((f) => f.prefixes ?? []),
    );
    const ranked = found
      .map((f, i) => ({ f, imports: counts[i] ?? 0, i }))
      .sort((a, b) => b.imports - a.imports || a.i - b.i);
    const [primary, ...rest] = ranked;
    const describe = (r: { f: Found; imports: number }) =>
      `${r.f.source} (${r.imports.toLocaleString('en-US')} ${r.imports === 1 ? 'import' : 'imports'})`;
    return {
      ...detection(
        root,
        ranked.map((r) => r.f),
        withDefaults,
        `primary: ${primary ? describe(primary) : ''}; also: ${rest.map(describe).join(', ')}`,
      ),
      designSystems: ranked.map((r) => ({
        source: r.f.source,
        components: r.f.components,
        imports: r.imports,
      })),
    };
  }

  const flat = own ? fromFlatFolder(root, own) : undefined;
  if (flat && matchesAny(root, flat)) return detection(root, [flat], false, flat.source);
  return undefined;
}

/** Libraries of unstyled primitives that design systems wrap. */
const PRIMITIVES =
  /^(?:react-aria-components|react-aria|radix-ui|@radix-ui\/react-[\w-]+|@base-ui-components\/react|@base-ui\/react|@headlessui\/react|@ark-ui\/react)(?:\/|$)/;

/** Files that make `src/` an app rather than a library: entries and route folders. */
const APP_ENTRIES = /^(?:main|index|App|app|root|entry-client|entry-server)\.[jt]sx?$/;
const APP_FOLDERS = new Set(['app', 'pages', 'routes']);

/** Fewer PascalCase files than this in `src/` are an app's, not a component library. */
const MIN_FLAT_COMPONENTS = 5;

/**
 * A flat `src/` of components, as React Aria's Tailwind starter has it. It needs all of:
 * a dependency on a primitives library, no app entry (`main.tsx`, `App.tsx`) or route
 * folder in `src/`, and at least five PascalCase `.tsx`/`.jsx` files at its top level, four
 * in five of which import the primitives library. An app whose `src/` holds pages or
 * features imports its own components, not primitives, so it does not qualify.
 */
function fromFlatFolder(root: string, pkg: Record<string, unknown>): Found | undefined {
  const dependencies = Object.keys({
    ...asRecord(pkg.dependencies),
    ...asRecord(pkg.devDependencies),
    ...asRecord(pkg.peerDependencies),
  }).filter((name) => PRIMITIVES.test(name));
  if (!dependencies.length) return undefined;

  const dir = path.join(root, 'src');
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return undefined;
  }
  if (
    entries.some(
      (e) =>
        (e.isFile() && APP_ENTRIES.test(e.name)) || (e.isDirectory() && APP_FOLDERS.has(e.name)),
    )
  ) {
    return undefined;
  }
  const files = entries
    .filter((e) => e.isFile() && /^[A-Z][A-Za-z0-9]*\.[jt]sx$/.test(e.name))
    .map((e) => e.name);
  if (files.length < MIN_FLAT_COMPONENTS) return undefined;

  const libraries = new Map<string, number>();
  let wrapping = 0;
  for (const file of files) {
    let text: string;
    try {
      text = fs.readFileSync(path.join(dir, file), 'utf8');
    } catch {
      continue;
    }
    const used = new Set<string>();
    for (const match of text.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)) {
      const library = PRIMITIVES.exec(match[1] ?? '')?.[0].replace(/\/$/, '');
      if (library) used.add(library);
    }
    if (used.size) wrapping++;
    for (const library of used) libraries.set(library, (libraries.get(library) ?? 0) + 1);
  }
  if (wrapping * 5 < files.length * 4) return undefined;

  const library = [...libraries].sort((a, b) => b[1] - a[1])[0]?.[0] ?? dependencies[0] ?? '';
  const stylesheet = STYLESHEETS.map((f) => path.join(root, f)).find((f) => fs.existsSync(f));
  return {
    components: ['src/*.{tsx,jsx}'],
    tokens: stylesheet ? [escapePath(relativePath(root, stylesheet))] : [],
    imports: [],
    dirs: [dir],
    source: `src/ (${String(files.length)} components wrapping ${library})`,
  };
}

function detection(root: string, found: Found[], withDefaults: boolean, source: string): Detection {
  return {
    components: found.flatMap((f) => f.components),
    tokens: found.flatMap((f) => f.tokens),
    docs: unique(found.flatMap((f) => f.dirs)).map(
      (dir) => `${escapePath(relativePath(root, dir) || '.')}/**/*.{md,mdx}`,
    ),
    imports: found.flatMap((f) => f.imports),
    withDefaults,
    source,
  };
}

function matchesAny(root: string, found: Found): boolean {
  return (
    globSync(found.components, {
      cwd: root,
      ignore: ['**/node_modules/**'],
      expandDirectories: false,
    }).length > 0
  );
}

/** `components.json` read from `dir` (the root, or a workspace package's directory). */
function fromComponentsJson(
  root: string,
  dir: string,
  json: Record<string, unknown>,
  project: ProjectConfig,
  packages: PackageFinder,
): Found | undefined {
  const aliases = asRecord(json.aliases);
  const ui =
    typeof aliases.ui === 'string'
      ? aliases.ui
      : typeof aliases.components === 'string'
        ? `${aliases.components}/ui`
        : undefined;
  if (!ui) return undefined;

  let uiDir = resolveThroughPaths(ui, project);
  let imports: ImportMapping[] = [];
  if (!uiDir) {
    const name = packageName(ui);
    const pkgDir = name ? packages.find(name) : undefined;
    const pkg = pkgDir ? readJson(path.join(pkgDir, 'package.json')) : undefined;
    if (!name || !pkgDir || !pkg) return undefined;
    imports = exportMappings(root, pkgDir, pkg);
    uiDir = resolveThroughExports(ui, imports, root) ?? subpathDir(pkgDir, ui.slice(name.length));
    if (!uiDir) return undefined;
  }

  const tailwind = asRecord(json.tailwind);
  const css =
    typeof tailwind.css === 'string' && tailwind.css ? path.resolve(dir, tailwind.css) : undefined;
  return {
    components: [`${escapePath(relativePath(root, uiDir) || '.')}/**/*.{tsx,jsx}`],
    tokens: css && fs.existsSync(css) ? [escapePath(relativePath(root, css))] : [],
    imports,
    dirs: [uiDir],
    source: `${ui} → ${relativePath(root, uiDir) || '.'}`,
    ...ownerPackage(root, uiDir, ui),
  };
}

/**
 * The workspace package a `components.json` folder belongs to, when it is not the root
 * itself (`@coss/ui/components`, through tsconfig `paths` or the package), and the
 * specifiers the root's code imports it by: the alias, and that package's name.
 */
function ownerPackage(
  root: string,
  dir: string,
  alias: string,
): { package?: string | undefined; prefixes: string[] } {
  for (let current = dir; ; current = path.dirname(current)) {
    const name = readJson(path.join(current, 'package.json'))?.name;
    if (typeof name === 'string') {
      return path.resolve(current) === path.resolve(root)
        ? { prefixes: [alias] }
        : { package: name, prefixes: [alias, name] };
    }
    if (current === path.dirname(current) || path.resolve(current) === path.resolve(root)) {
      return { prefixes: [alias] };
    }
  }
}

/**
 * A workspace package set up with its own `components.json` and a barrel
 * (`"exports": { ".": "./src/index.ts" }`): its components are imported from
 * the package name, not through the package's internal `@/` alias.
 */
function fromPackageComponentsJson(
  root: string,
  dir: string,
  pkg: Record<string, unknown>,
  packages: PackageFinder,
): Found | undefined {
  const json = readJson(path.join(dir, 'components.json'));
  const found = json && fromComponentsJson(root, dir, json, readProjectConfig(dir), packages);
  if (!found) return undefined;
  const name = typeof pkg.name === 'string' ? pkg.name : relativePath(root, dir);
  const barrel = pkg.exports !== undefined || typeof pkg.main === 'string';
  return {
    ...found,
    imports: barrel
      ? found.dirs.map((d) => ({ specifier: name, target: `${relativePath(root, d)}/*` }))
      : found.imports,
    source: `${name} (components.json ui: ${found.source})`,
  };
}

/**
 * A package whose `exports` point at component source files is a design system. An export
 * that leads to a barrel (`./components/button` → `components/button/index.ts`, or `.` →
 * `src/index.tsx` behind `dist/`) stands for the files the barrel re-exports, each
 * suggested with the export's specifier.
 */
function fromPackage(root: string, dir: string, pkg: Record<string, unknown>): Found | undefined {
  const imports: ImportMapping[] = [];
  const components: ImportMapping[] = [];
  const add = (mapping: ImportMapping, component: boolean) => {
    imports.push(mapping);
    if (component && !components.some((m) => m.target === mapping.target)) components.push(mapping);
  };
  for (const mapping of exportMappings(root, dir, pkg)) {
    const file = path.resolve(root, mapping.target);
    if (mapping.target.includes('*') || !SCRIPT_FILE.test(file) || !isFile(file)) {
      add(mapping, COMPONENT_FILE.test(mapping.target));
      continue;
    }
    // The .tsx/.jsx files it leads to, through barrels.
    for (const reached of exportedFiles(file, dir)) {
      if (COMPONENT_FILE.test(reached)) {
        add({ specifier: mapping.specifier, target: relativePath(root, reached) }, true);
      }
    }
  }
  const files = components.filter((m) => !m.target.includes('*'));
  const patterns = components.filter((m) => m.target.includes('*'));
  // One or two .tsx exports are an app or a widget, not a component library.
  if (files.length < 3 && !patterns.length) return undefined;

  const stylesheets = imports
    .filter((m) => m.target.endsWith('.css') && !m.target.includes('*'))
    .map((m) => path.resolve(root, m.target))
    .filter((f) => fs.existsSync(f));
  const fallback = STYLESHEETS.map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
  return {
    components: [
      ...files.map((m) => escapePath(m.target)),
      ...patterns.map((m) => {
        const star = m.target.indexOf('*');
        const before = m.target.slice(0, star);
        const after = m.target.slice(star + 1);
        // `*` in an export spans folders when it is a whole segment
        // (`components/*` covers `components/form/input`); inside a file
        // name (`ui-*.tsx`) it stays in that folder.
        return before.endsWith('/')
          ? `${escapePath(before)}**/*${escapePath(after)}`
          : `${escapePath(before)}*${escapePath(after)}`;
      }),
    ],
    tokens: (stylesheets.length ? stylesheets : fallback ? [fallback] : []).map((f) =>
      escapePath(relativePath(root, f)),
    ),
    imports: components,
    dirs: unique(
      components.map((m) =>
        path.resolve(
          root,
          m.target.includes('*')
            ? m.target.slice(0, m.target.indexOf('*'))
            : path.posix.dirname(m.target),
        ),
      ),
    ),
    source: typeof pkg.name === 'string' ? pkg.name : relativePath(root, dir),
  };
}

/**
 * A package without `exports` that apps import by path, the way Documenso
 * imports `@documenso/ui/primitives/button`: its components are the files the
 * root's code imports, each suggested with the specifier it uses, and a
 * stylesheet imported from it (`@documenso/ui/styles/theme.css`) is the theme.
 * A folder imported through its index is a barrel for the files in it.
 */
function fromImports(
  root: string,
  dir: string,
  name: string,
  subpaths: ReadonlySet<string> | undefined,
): Found | undefined {
  const files: ImportMapping[] = [];
  const barrels: ImportMapping[] = [];
  const stylesheets: string[] = [];
  const seen = new Set<string>();
  for (const subpath of [...(subpaths ?? [])].sort()) {
    const file = moduleFile(path.join(dir, subpath));
    if (!file || seen.has(file)) continue;
    seen.add(file);
    const specifier = `${name}/${subpath}`;
    if (/[\\/]index\.[cm]?[jt]sx?$/.test(file)) {
      barrels.push({ specifier, target: `${relativePath(root, path.dirname(file))}/*` });
    } else if (COMPONENT_FILE.test(file)) {
      files.push({ specifier, target: relativePath(root, file) });
    } else if (file.endsWith('.css')) {
      stylesheets.push(relativePath(root, file));
    }
  }
  if (!files.length && !barrels.length) return undefined;
  return {
    components: [
      ...files.map((m) => escapePath(m.target)),
      ...barrels.map((m) => `${escapePath(m.target.slice(0, -1))}**/*.{tsx,jsx}`),
    ],
    tokens: stylesheets.map((f) => escapePath(f)),
    // A file imported directly is suggested with its own path, not its folder's barrel.
    imports: [...files, ...barrels],
    dirs: unique(
      [...files, ...barrels].map((m) => path.resolve(root, path.posix.dirname(m.target))),
    ),
    source: `${name}, imported by path`,
  };
}

/** Enough source to see which modules an app imports, without reading a whole monorepo. */
const MAX_SCANNED_FILES = 5000;

/** The root's source files, as far as `MAX_SCANNED_FILES`. */
function sourceFiles(root: string): string[] {
  return globSync('**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs,css}', {
    cwd: root,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**', '**/*.d.ts'],
  }).slice(0, MAX_SCANNED_FILES);
}

/**
 * How many imports in the root's code name each group of specifiers: `@calcom/ui`
 * counts `@calcom/ui/components/button`, `@/components/ui` counts `@/components/ui/card`.
 */
function importCounts(root: string, groups: readonly string[][]): number[] {
  const counts = groups.map(() => 0);
  const pattern = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["']([^"'\s]+)["']/g;
  for (const file of sourceFiles(root)) {
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const match of text.matchAll(pattern)) {
      const specifier = match[1] ?? '';
      groups.forEach((prefixes, i) => {
        if (prefixes.some((p) => specifier === p || specifier.startsWith(`${p}/`))) {
          counts[i] = (counts[i] ?? 0) + 1;
        }
      });
    }
  }
  return counts;
}

/**
 * The subpaths of each package that the root's code and stylesheets import:
 * `@acme/ui/primitives/button` → `primitives/button` under `@acme/ui`.
 */
function importedSubpaths(root: string, names: string[]): Map<string, Set<string>> {
  const found = new Map(names.map((name) => [name, new Set<string>()]));
  const alternatives = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const specifier = new RegExp(
    `(?:\\bfrom|\\bimport|\\brequire)\\s*\\(?\\s*["'](${alternatives})/([^"'\\s]+)["']`,
    'g',
  );
  for (const file of sourceFiles(root)) {
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (!names.some((name) => text.includes(`${name}/`))) continue;
    for (const match of text.matchAll(specifier)) {
      if (match[1] && match[2]) found.get(match[1])?.add(match[2]);
    }
  }
  return found;
}

/**
 * `exports` subpaths with a source target, as specifiers relative to `root`. A target
 * built to `dist/` maps back to its source (`src/`, through the build config's entries);
 * without an `exports` map, `main` stands for `.`.
 */
function exportMappings(root: string, dir: string, pkg: Record<string, unknown>): ImportMapping[] {
  const name = typeof pkg.name === 'string' ? pkg.name : undefined;
  if (!name) return [];
  const exports =
    pkg.exports ??
    (typeof pkg.main === 'string' && /^\.?\/?(?:dist|build|lib)\//.test(pkg.main)
      ? pkg.main
      : undefined);
  const entries: [string, unknown][] =
    typeof exports === 'string'
      ? [['.', exports]]
      : exports && typeof exports === 'object' && !Array.isArray(exports)
        ? Object.keys(exports).every((k) => k.startsWith('.'))
          ? Object.entries(exports)
          : [['.', exports]]
        : [];
  let build: ReturnType<typeof buildEntries> | undefined;
  const mappings: ImportMapping[] = [];
  for (const [key, value] of entries) {
    const target = exportTarget(value);
    if (!target) continue;
    const source = target.includes('*')
      ? sourcePattern(dir, target)
      : sourceTarget(dir, key, target, (build ??= buildEntries(dir)));
    mappings.push({
      specifier: key === '.' ? name : `${name}/${key.replace(/^\.\//, '')}`,
      target: relativePath(root, path.resolve(dir, source ?? target)),
    });
  }
  return mappings;
}

/** `./dist/*.mjs` → `src/*.tsx` (or `.ts`) when files match it there; anything else as it is. */
function sourcePattern(dir: string, target: string): string {
  const relative = target.replace(/^\.\//, '');
  const built = /^(?:dist|build|lib|out|esm|cjs)\//.exec(relative);
  if (!built) return relative;
  const rest = relative.slice(built[0].length).replace(/(?:\.d)?\.[cm]?[jt]sx?$/, '');
  for (const ext of ['.tsx', '.ts']) {
    const candidate = `src/${rest}${ext}`;
    if (globSync(candidate, { cwd: dir, ignore: ['**/node_modules/**'] }).length) return candidate;
  }
  return relative;
}

/** The source file an export condition map points at: the first string target that is not a declaration file. */
function exportTarget(value: unknown): string | undefined {
  if (typeof value === 'string') return value.endsWith('.d.ts') ? undefined : value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const target = exportTarget(item);
      if (target) return target;
    }
    return undefined;
  }
  if (value && typeof value === 'object') {
    for (const [condition, nested] of Object.entries(value)) {
      if (condition === 'types') continue;
      const target = exportTarget(nested);
      if (target) return target;
    }
  }
  return undefined;
}

/** `@/components/ui` through `"@/*": ["./*"]`, when the directory exists. */
function resolveThroughPaths(specifier: string, project: ProjectConfig): string | undefined {
  for (const [pattern, targets] of Object.entries(project.paths)) {
    const star = pattern.indexOf('*');
    const prefix = star === -1 ? pattern : pattern.slice(0, star);
    const suffix = star === -1 ? '' : pattern.slice(star + 1);
    const matches =
      star === -1
        ? specifier === pattern
        : specifier.startsWith(prefix) &&
          specifier.endsWith(suffix) &&
          specifier.length >= prefix.length + suffix.length;
    if (!matches) continue;
    const middle =
      star === -1 ? '' : specifier.slice(prefix.length, specifier.length - suffix.length);
    for (const target of targets) {
      const dir = path.resolve(project.pathsBase, target.replace('*', middle));
      if (isDirectory(dir)) return dir;
    }
  }
  return undefined;
}

/** `@workspace/ui/components` through `"./components/*": "./src/components/*.tsx"`. */
function resolveThroughExports(
  specifier: string,
  imports: ImportMapping[],
  root: string,
): string | undefined {
  for (const mapping of imports) {
    const star = mapping.specifier.indexOf('*');
    if (star === -1) continue;
    const prefix = mapping.specifier.slice(0, star).replace(/\/$/, '');
    if (specifier !== prefix) continue;
    const dir = path.resolve(root, mapping.target.slice(0, mapping.target.indexOf('*')));
    if (isDirectory(dir)) return dir;
  }
  return undefined;
}

/** `/components` under a package: the folder itself, or under `src`. */
function subpathDir(pkgDir: string, subpath: string): string | undefined {
  const rel = subpath.replace(/^\//, '');
  return [path.join(pkgDir, rel), path.join(pkgDir, 'src', rel)].find(isDirectory);
}

/** `@scope/name/sub` → `@scope/name`; `name/sub` → `name`; aliases such as `@/x` and `~/x` → undefined. */
function packageName(specifier: string): string | undefined {
  const [first = '', second] = specifier.split('/');
  if (first.startsWith('@')) return first.length > 1 && second ? `${first}/${second}` : undefined;
  return /^[a-z0-9]/i.test(first) ? first : undefined;
}

/**
 * Resolves specifiers to project files for the modules we read ourselves (a
 * Tailwind config's presets): relative paths and workspace packages, with or
 * without a subpath. Installed packages resolve to nothing: they are not the
 * project's to describe.
 */
export function moduleResolver(
  root: string,
): (specifier: string, fromFile: string) => string | undefined {
  const packages = new PackageFinder(root);
  return (specifier, fromFile) => {
    if (specifier.startsWith('.'))
      return moduleFile(path.resolve(path.dirname(fromFile), specifier));
    const name = packageName(specifier);
    const dir = name ? packages.find(name) : undefined;
    if (!name || !dir) return undefined;
    const subpath = specifier.slice(name.length + 1);
    if (subpath) return moduleFile(path.join(dir, subpath));
    const main = readJson(path.join(dir, 'package.json'))?.main;
    return moduleFile(path.resolve(dir, typeof main === 'string' ? main : 'index'));
  };
}

/**
 * Where an import from a workspace package points: its file, or `{}` for a
 * subpath the package's `exports` declare but whose target is not on disk
 * (built to `dist/`). Undefined when no such module exists. The linter tells
 * a module the design-system model left out from an invented one with it.
 */
export function workspaceModule(
  root: string,
): (specifier: string, fromFile: string) => { file?: string } | undefined {
  const resolve = moduleResolver(root);
  const packages = new PackageFinder(root);
  return (specifier, fromFile) => {
    const file = resolve(specifier, fromFile);
    if (file) return { file };
    const name = packageName(specifier);
    const dir = name ? packages.find(name) : undefined;
    if (!name || !dir) return undefined;
    // A package built to `dist/` keeps its sources in `src/`, under the same subpath.
    const source = moduleFile(path.join(dir, 'src', specifier.slice(name.length + 1) || 'index'));
    if (source) return { file: source };
    const exports = readJson(path.join(dir, 'package.json'))?.exports;
    if (!exports || typeof exports !== 'object' || Array.isArray(exports)) return undefined;
    const subpath = `.${specifier.slice(name.length)}`;
    const declared = Object.keys(exports).some((key) => {
      const star = key.indexOf('*');
      if (star === -1) return key === subpath;
      return subpath.startsWith(key.slice(0, star)) && subpath.endsWith(key.slice(star + 1));
    });
    return declared ? {} : undefined;
  };
}

/** `@acme/ui`, `@acme/ui-kit`, `@acme/design-system`, `acme-ui`; not `@acme/email-components`. */
export function isDesignSystemName(name: string): boolean {
  const base = name.slice(name.lastIndexOf('/') + 1);
  return (
    /^(?:ui|ui-kit|uikit|ui-react|react-ui|design-system|ds|components|primitives)$/.test(base) ||
    /-(?:ui|ui-kit|design-system)$/.test(base)
  );
}

/**
 * Locates workspace packages by name: through `node_modules` links up to the
 * workspace root, then by scanning the workspace's package globs.
 */
class PackageFinder {
  private byName?: Map<string, string>;

  constructor(private readonly root: string) {}

  find(name: string): string | undefined {
    for (let dir = this.root; ; dir = path.dirname(dir)) {
      const candidate = path.join(dir, 'node_modules', name);
      if (fs.existsSync(path.join(candidate, 'package.json'))) {
        const real = fs.realpathSync(candidate);
        // A package installed from the registry is compiled; only linked workspace sources count.
        if (!/[\\/]node_modules[\\/]/.test(real)) {
          // Express it from the root as given, so paths stay relative when the
          // root itself sits behind a link (`/var` → `/private/var` on macOS).
          return path.resolve(this.root, path.relative(fs.realpathSync(this.root), real));
        }
      }
      if (dir === path.dirname(dir) || isWorkspaceRoot(dir)) break;
    }
    this.byName ??= scanWorkspace(this.root);
    return this.byName.get(name);
  }
}

/**
 * A monorepo root: a pnpm-workspace.yaml, `workspaces` in package.json (npm, Yarn, Bun),
 * a lerna.json with `packages`, or an nx.json. Turborepo runs on the package manager's
 * workspaces, so its roots are among these.
 */
export function isWorkspaceRoot(dir: string): boolean {
  if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return true;
  if (fs.existsSync(path.join(dir, 'nx.json'))) return true;
  const pkg = readJson(path.join(dir, 'package.json'));
  if (pkg !== undefined && pkg.workspaces !== undefined) return true;
  return Array.isArray(readJson(path.join(dir, 'lerna.json'))?.packages);
}

/** Package name → directory for every package the workspace declares. */
function scanWorkspace(start: string): Map<string, string> {
  const packages = new Map<string, string>();
  let workspaceRoot: string | undefined;
  for (let dir = start; ; dir = path.dirname(dir)) {
    if (isWorkspaceRoot(dir)) {
      workspaceRoot = dir;
      break;
    }
    if (dir === path.dirname(dir)) break;
  }
  if (!workspaceRoot) return packages;

  for (const dir of workspacePackageDirs(workspaceRoot)) {
    const name = readJson(path.join(dir, 'package.json'))?.name;
    if (typeof name === 'string' && !packages.has(name)) packages.set(name, dir);
  }
  return packages;
}

/** Folders a workspace root's package globs list, without its `!` exclusions. */
export interface WorkspacePatterns {
  include: string[];
  exclude: string[];
  /** What declares them, for `inspect`: `pnpm-workspace.yaml`, `package.json workspaces`. */
  source: string;
}

/**
 * `packages` from pnpm-workspace.yaml, `workspaces` from package.json (npm, Yarn, Bun), or
 * `packages` from lerna.json, in that order of precedence.
 */
export function workspacePatterns(dir: string): WorkspacePatterns {
  const split = (list: string[], source: string): WorkspacePatterns => ({
    include: list.filter((p) => !p.startsWith('!')).map((p) => toPosix(p).replace(/\/$/, '')),
    exclude: list.filter((p) => p.startsWith('!')).map((p) => toPosix(p.slice(1))),
    source,
  });
  const yaml = path.join(dir, 'pnpm-workspace.yaml');
  if (fs.existsSync(yaml)) {
    return split(pnpmPackages(fs.readFileSync(yaml, 'utf8')), 'pnpm-workspace.yaml');
  }
  const workspaces = readJson(path.join(dir, 'package.json'))?.workspaces;
  const list = Array.isArray(workspaces) ? workspaces : asRecord(workspaces).packages;
  if (Array.isArray(list)) {
    return split(
      list.filter((p): p is string => typeof p === 'string'),
      'package.json workspaces',
    );
  }
  const lerna = readJson(path.join(dir, 'lerna.json'))?.packages;
  if (Array.isArray(lerna)) {
    return split(
      lerna.filter((p): p is string => typeof p === 'string'),
      'lerna.json',
    );
  }
  return { include: [], exclude: [], source: '' };
}

/** Folders never holding a workspace package of the project's own. */
const NOT_PACKAGES = ['**/node_modules/**', '**/.git/**'];

/**
 * Every package folder of the workspace at `root`, absolute and sorted: the folders its
 * package globs match that hold a package.json, and with an nx.json, every folder with an
 * Nx project.json.
 */
export function workspacePackageDirs(root: string): string[] {
  const { include, exclude } = workspacePatterns(root);
  const ignore = [...NOT_PACKAGES, ...exclude];
  const dirs = include.length
    ? globSync(
        include.map((p) => `${p}/package.json`),
        { cwd: root, absolute: true, ignore },
      ).map((manifest) => path.dirname(manifest))
    : [];
  if (fs.existsSync(path.join(root, 'nx.json'))) {
    const projects = globSync('**/project.json', {
      cwd: root,
      absolute: true,
      // Build output can hold copies of a project's files.
      ignore: [...ignore, '**/dist/**'],
    });
    for (const project of projects) {
      dirs.push(path.dirname(project));
    }
  }
  return unique(dirs.map((d) => path.resolve(d)))
    .filter((d) => d !== path.resolve(root))
    .sort();
}

/**
 * The `packages` list of a pnpm-workspace.yaml, block (`- apps/*`, indented or
 * not) or flow (`[apps/*, packages/*]`) style, with comments. Only that key is
 * read, so this stays a few lines rather than a YAML parser.
 */
export function pnpmPackages(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^packages\s*:/.test(line));
  if (start === -1) return [];
  const uncomment = (s: string) => s.replace(/(?:^|\s)#.*$/, '').trim();
  const unquote = (s: string) => s.trim().replace(/^(['"])(.*)\1$/, '$2');

  const inline = uncomment((lines[start] ?? '').slice((lines[start] ?? '').indexOf(':') + 1));
  if (inline.startsWith('[')) {
    let flow = inline;
    for (let i = start + 1; !flow.includes(']') && i < lines.length; i++) {
      flow += ` ${uncomment(lines[i] ?? '')}`;
    }
    const end = flow.indexOf(']');
    return flow
      .slice(1, end === -1 ? undefined : end)
      .split(',')
      .map(unquote)
      .filter(Boolean);
  }
  const items: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const item = /^\s*-\s*(.*)$/.exec(line);
    if (item) items.push(unquote(uncomment(item[1] ?? '')));
    // The next top-level key ends the list.
    else if (/^\S/.test(line)) break;
  }
  return items.filter(Boolean);
}

function readJson(file: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isFile(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function isDirectory(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}
