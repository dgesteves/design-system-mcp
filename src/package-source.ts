import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import { isInside, toPosix } from './util/paths.js';

/**
 * A package's sources behind its build output: `exports` that point at `dist/` mapped
 * back to `src/`, and barrels (`index.ts` files that re-export) followed to the files
 * that declare what they export. Everything is read as text, and nothing is run: a
 * build config is parsed for its `entry`, never imported.
 */

const MODULE_EXTENSIONS = ['.ts', '.js', '.cjs', '.mjs', '.cts', '.mts', '.tsx', '.jsx'];
const SOURCE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.mts', '.cts', '.js', '.mjs', '.cjs'];

/** Folders bundlers write to. */
const BUILD_DIR = /^(?:dist|build|lib|out|esm|cjs|es|module|types)\//;
/** `index.mjs`, `index.d.ts`, `button.cjs`: an output file, by its extension. */
const OUTPUT_EXTENSION = /(?:\.d)?\.[cm]?[jt]sx?$/;

/** `base` as a file, with an extension added, or as a directory's index. */
export function moduleFile(base: string, extensions = MODULE_EXTENSIONS): string | undefined {
  const candidates = [
    base,
    ...extensions.map((ext) => `${base}${ext}`),
    ...extensions.map((ext) => path.join(base, `index${ext}`)),
  ];
  return candidates.find((file) => isFile(file) && !/[\\/]node_modules[\\/]/.test(file));
}

/** Where a build tool's config says each output comes from: `icons/index` → `src/icons/index.tsx`. */
export interface BuildEntries {
  /** Output name without extension, relative to the output folder → source file, relative to the package. */
  byOutput: Map<string, string>;
  /** The only entry, when there is one: what a single-entry library builds `.` from. */
  single?: string | undefined;
  /** The config file it came from, relative to the package. */
  from?: string | undefined;
}

const BUILD_CONFIGS = ['tsup', 'tsdown', 'vite'].flatMap((tool) =>
  ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'].map((ext) => `${tool}.config.${ext}`),
);

/**
 * The `entry` of a tsup, tsdown or Vite (`build.lib.entry`) config in `dir`, read without
 * running it: string, array and object entries, with paths given as literals or through
 * `path.resolve(__dirname, "src/index.ts")` and `new URL("./src/index.ts", import.meta.url)`.
 * Entries computed in code are not seen.
 */
export function buildEntries(dir: string): BuildEntries {
  const byOutput = new Map<string, string>();
  for (const name of BUILD_CONFIGS) {
    const file = path.join(dir, name);
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false);
    const entries: { name?: string; file: string }[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyAssignment(node) &&
        (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
        node.name.text === 'entry'
      ) {
        entries.push(...entryValues(node.initializer));
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    const files = entries.map((e) => ({ ...e, file: normalize(e.file) })).filter((e) => e.file);
    if (!files.length) continue;
    // Named entries keep their names; a list is named by each file's path below the
    // folder all of them share, as tsup and Vite name their outputs.
    const unnamed = files.filter((e) => e.name === undefined).map((e) => e.file);
    const shared = commonDir(unnamed);
    for (const entry of files) {
      const output =
        entry.name ?? path.posix.relative(shared, entry.file).replace(/\.[cm]?[jt]sx?$/, '');
      if (!byOutput.has(output)) byOutput.set(output, entry.file);
    }
    return {
      byOutput,
      single: files.length === 1 ? files[0]?.file : undefined,
      from: name,
    };
  }
  return { byOutput };
}

function entryValues(node: ts.Expression): { name?: string; file: string }[] {
  const value = pathValue(node);
  if (value !== undefined) return [{ file: value }];
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.flatMap((element) => {
      const file = ts.isExpression(element) ? pathValue(element) : undefined;
      return file === undefined ? [] : [{ file }];
    });
  }
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.flatMap((property) => {
      if (!ts.isPropertyAssignment(property)) return [];
      const name =
        ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
          ? property.name.text
          : undefined;
      const file = pathValue(property.initializer);
      return name === undefined || file === undefined ? [] : [{ name, file }];
    });
  }
  return [];
}

/** A path written as a literal, or through `resolve(__dirname, ...)` or `new URL(..., import.meta.url)`. */
function pathValue(node: ts.Expression): string | undefined {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isCallExpression(node)) {
    // `fileURLToPath(new URL(...))` and `path.resolve(__dirname, "src", "index.ts")`.
    const args = node.arguments.map((arg) => pathValue(arg));
    if (node.arguments.length === 1 && args[0] !== undefined) return args[0];
    const literals = node.arguments.filter(ts.isStringLiteralLike).map((arg) => arg.text);
    return literals.length ? path.posix.join(...literals) : undefined;
  }
  if (
    ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'URL'
  ) {
    const first = node.arguments?.[0];
    return first && ts.isStringLiteralLike(first) ? first.text : undefined;
  }
  return undefined;
}

function normalize(file: string): string {
  return path.posix.normalize(toPosix(file)).replace(/^\.\//, '');
}

function commonDir(files: readonly string[]): string {
  if (!files.length) return '.';
  let parts = path.posix.dirname(files[0] ?? '.').split('/');
  for (const file of files.slice(1)) {
    const other = path.posix.dirname(file).split('/');
    let i = 0;
    while (i < parts.length && parts[i] === other[i]) i++;
    parts = parts.slice(0, i);
  }
  return parts.join('/') || '.';
}

/**
 * The source file behind an `exports` target in package `dir`, relative to it. A target
 * in a build folder (`./dist/icons/index.mjs`) maps back through the build config's
 * entries, then to the same path under `src/` (`src/icons/index.tsx`), and the `.`
 * export to `src/index.*`. A target that is already source comes back as it is.
 * Undefined when no source is on disk.
 */
export function sourceTarget(
  dir: string,
  key: string,
  target: string,
  entries: BuildEntries,
): string | undefined {
  const relative = normalize(target);
  if (!BUILD_DIR.test(relative)) return relative;
  const output = relative.replace(BUILD_DIR, '').replace(OUTPUT_EXTENSION, '');
  const candidates = [
    entries.byOutput.get(output),
    key === '.' ? entries.single : undefined,
    `src/${output}`,
    key === '.' ? 'src/index' : undefined,
  ];
  for (const candidate of candidates) {
    if (candidate === undefined) continue;
    const file = moduleFile(path.join(dir, candidate), SOURCE_EXTENSIONS);
    if (file && isInside(dir, file)) return toPosix(path.relative(dir, file));
  }
  return undefined;
}

/** How deep a chain of barrels is followed. */
const MAX_BARREL_DEPTH = 6;

/**
 * The files a module's exports come from: the module itself, and through its
 * re-exports (`export * from`, `export { A } from`, an imported binding exported again)
 * the files they lead to, inside `packageDir`. A file that only re-exports is a barrel
 * and is left out; what it leads to is kept.
 */
export function exportedFiles(file: string, packageDir: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const visit = (current: string, depth: number): void => {
    if (seen.has(current) || depth > MAX_BARREL_DEPTH) return;
    seen.add(current);
    let text: string;
    try {
      text = fs.readFileSync(current, 'utf8');
    } catch {
      return;
    }
    const source = ts.createSourceFile(current, text, ts.ScriptTarget.Latest, false);
    const { from, barrel } = reexports(source);
    if (!barrel) found.push(current);
    for (const specifier of from) {
      if (!specifier.startsWith('.')) continue;
      const next = moduleFile(path.resolve(path.dirname(current), specifier));
      if (next && isInside(packageDir, next)) visit(next, depth + 1);
    }
  };
  visit(file, 0);
  return found;
}

/** The relative modules a file re-exports from, and whether it does nothing else. */
function reexports(source: ts.SourceFile): { from: string[]; barrel: boolean } {
  const from: string[] = [];
  const imported = new Map<string, string>();
  let barrel = true;
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause;
      const specifier = statement.moduleSpecifier.text;
      if (clause?.name) imported.set(clause.name.text, specifier);
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) imported.set(element.name.text, specifier);
      } else if (bindings && ts.isNamespaceImport(bindings)) {
        imported.set(bindings.name.text, specifier);
      }
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
        if (!statement.isTypeOnly) from.push(statement.moduleSpecifier.text);
      } else if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          const local = (element.propertyName ?? element.name).text;
          const specifier = imported.get(local);
          if (specifier === undefined) barrel = false;
          else from.push(specifier);
        }
      }
      continue;
    }
    if (
      ts.isExportAssignment(statement) &&
      ts.isIdentifier(statement.expression) &&
      imported.has(statement.expression.text)
    ) {
      from.push(imported.get(statement.expression.text) ?? '');
      continue;
    }
    // Type-only declarations add nothing to render.
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) continue;
    barrel = false;
  }
  return { from: [...new Set(from)], barrel };
}

function isFile(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}
