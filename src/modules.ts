import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import type { ResolvedConfig } from './config.js';
import { workspaceModule } from './detect.js';
import { readProjectConfig } from './extract/program.js';
import { relativePath } from './util/paths.js';

/** Where an import points: a file relative to the root, or `{}` for a declared module not on disk. */
export interface ModuleLocation {
  file?: string;
}

/** What a module exports by name, and the modules it re-exports wholesale (`export * from`). */
export interface ModuleExports {
  /** Every name it exports, its own and re-exported ones. */
  names: string[];
  /** The names it declares itself (`export function Table`), not re-exports. */
  declared: string[];
  /** Files relative to the root; undefined where the specifier does not resolve. */
  starFrom: (string | undefined)[];
  /**
   * Names it re-exports from another module, and under which name that module exports
   * them: `export { Button } from "./Button"`, `export { Root as Dialog } from "./dialog"`,
   * or an imported binding exported again. `from` is undefined where it does not resolve.
   */
  reexports: Map<string, { from: string | undefined; name: string }>;
}

/**
 * Finds the modules a checked file imports from the design system, and what
 * they export, so the linter can tell a name the model left out (an excluded
 * folder, a package built to `dist/`) from an invented one. It resolves through
 * tsconfig `paths`, relative paths and workspace packages, reads files only
 * when asked, and caches both. Where the root is not on disk (the website's
 * playground), it finds nothing, and every missing name counts as invented.
 */
export class ModuleResolver {
  private resolveFn?: (specifier: string, from: string) => ModuleLocation | undefined;
  private readonly locations = new Map<string, ModuleLocation | null>();
  private readonly exported = new Map<string, ModuleExports | null>();

  constructor(private readonly config: Pick<ResolvedConfig, 'root' | 'tsconfig'>) {}

  /** The module `specifier` points at from `fromFile` (relative to the root). */
  locate(specifier: string, fromFile: string): ModuleLocation | undefined {
    const from = path.resolve(this.config.root, fromFile);
    const key = specifier.startsWith('.') ? `${path.dirname(from)}\0${specifier}` : specifier;
    const cached = this.locations.get(key);
    if (cached !== undefined) return cached ?? undefined;
    this.resolveFn ??= this.createResolver();
    const location = this.resolveFn(specifier, from);
    this.locations.set(key, location ?? null);
    return location;
  }

  /** What a module exports, read from its source without type-checking. */
  exportsOf(file: string): ModuleExports | undefined {
    const cached = this.exported.get(file);
    if (cached !== undefined) return cached ?? undefined;
    let result: ModuleExports | undefined;
    try {
      const absolute = path.resolve(this.config.root, file);
      const text = fs.readFileSync(absolute, 'utf8');
      result = readExports(
        ts.createSourceFile(absolute, text, ts.ScriptTarget.Latest, false),
        (s) => this.locate(s, file)?.file,
      );
    } catch {
      result = undefined;
    }
    this.exported.set(file, result ?? null);
    return result;
  }

  private createResolver(): (specifier: string, from: string) => ModuleLocation | undefined {
    const { root } = this.config;
    if (!fs.existsSync(root)) return () => undefined;
    const { options } = readProjectConfig(root, this.config.tsconfig);
    const workspace = workspaceModule(root);
    return (specifier, from) => {
      const found = ts.resolveModuleName(specifier, from, options, ts.sys).resolvedModule;
      if (found && !found.isExternalLibraryImport) {
        return { file: relativePath(root, found.resolvedFileName) };
      }
      const located = workspace(specifier, from);
      return located?.file ? { file: relativePath(root, located.file) } : located;
    };
  }
}

function readExports(
  sourceFile: ts.SourceFile,
  resolve: (specifier: string) => string | undefined,
): ModuleExports {
  const names: string[] = [];
  const declared: string[] = [];
  const starFrom: (string | undefined)[] = [];
  const reexports = new Map<string, { from: string | undefined; name: string }>();
  const own = (name: string) => {
    names.push(name);
    declared.push(name);
  };
  // `import { Button } from "./Button"` then `export { Button }`: a re-export, not a declaration.
  const imported = new Map<string, { specifier: string; name: string }>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      imported.set(element.name.text, {
        specifier: statement.moduleSpecifier.text,
        name: (element.propertyName ?? element.name).text,
      });
    }
  }
  const exported = (node: ts.Node) =>
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement)) {
      const from =
        statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : undefined;
      const clause = statement.exportClause;
      if (!clause) {
        if (from !== undefined) starFrom.push(resolve(from));
      } else if (ts.isNamespaceExport(clause)) {
        names.push(clause.name.text);
      } else {
        for (const element of clause.elements) {
          const name = element.name.text;
          const local = (element.propertyName ?? element.name).text;
          // `export { Table }` exports a local; `export { Table } from "./table"` re-exports.
          const binding = from === undefined ? imported.get(local) : undefined;
          if (from === undefined && !binding) {
            own(name);
            continue;
          }
          names.push(name);
          reexports.set(
            name,
            binding
              ? { from: resolve(binding.specifier), name: binding.name }
              : { from: from === undefined ? undefined : resolve(from), name: local },
          );
        }
      }
    } else if (ts.isVariableStatement(statement) && exported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) own(declaration.name.text);
      }
    } else if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name &&
      exported(statement)
    ) {
      own(statement.name.text);
    }
  }
  return { names, declared, starFrom, reexports };
}
