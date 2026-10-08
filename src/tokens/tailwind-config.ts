import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import { propertyName } from '../extract/cva.js';
import type { Token } from '../types.js';
import { usageFor } from './usage.js';

/** Resolves an import specifier from a file to a project file, or undefined (installed packages). */
export type ModuleResolver = (specifier: string, fromFile: string) => string | undefined;

export interface TailwindColors {
  /** Custom property → color key: `--primary` → `primary`, `--sidebar-background` → `sidebar`. */
  colors: Map<string, string>;
  /** The files read: the config and the project modules it imports. */
  files: string[];
}

/** A preset chain is a few files deep; anything beyond is not a Tailwind config. */
const MAX_FILES = 12;

/**
 * Reads which custom property backs which color class from a Tailwind v3
 * config, without running it: every `colors` object in the file
 * (`primary: { DEFAULT: "hsl(var(--primary))" }`), then in the project modules
 * it imports, such as a shared preset. The config's own entries win.
 */
export function readTailwindColors(file: string, resolve: ModuleResolver): TailwindColors {
  const colors = new Map<string, string>();
  const files: string[] = [];
  const queue = [file];
  while (queue.length && files.length < MAX_FILES) {
    const current = queue.shift() ?? '';
    if (files.includes(current)) continue;
    let text: string;
    try {
      text = fs.readFileSync(current, 'utf8');
    } catch {
      continue;
    }
    files.push(current);
    const source = ts.createSourceFile(
      current,
      text,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(current),
    );
    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyAssignment(node) &&
        propertyName(node.name) === 'colors' &&
        ts.isObjectLiteralExpression(node.initializer)
      ) {
        collect(node.initializer, [], colors);
        return;
      }
      const specifier = importedSpecifier(node);
      const target = specifier === undefined ? undefined : resolve(specifier, current);
      if (target && /\.[cm]?[jt]s$/.test(target)) queue.push(target);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { colors, files };
}

/** `primary: { DEFAULT: "hsl(var(--primary))", foreground: … }` → `--primary` → `primary`, `--primary-foreground` → `primary-foreground`. */
function collect(
  object: ts.ObjectLiteralExpression,
  keys: string[],
  colors: Map<string, string>,
): void {
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const key = propertyName(property.name);
    if (key === undefined) continue;
    const value = property.initializer;
    const nested = [...keys, key];
    if (ts.isObjectLiteralExpression(value)) {
      collect(value, nested, colors);
      continue;
    }
    if (!ts.isStringLiteralLike(value)) continue;
    const variable = /var\(\s*(--[\w-]+)/.exec(value.text)?.[1];
    const name = nested.filter((k) => k !== 'DEFAULT').join('-');
    if (variable && name && !colors.has(variable)) colors.set(variable, name);
  }
}

/** The specifier of `require("x")`, `import x from "x"` or `import("x")`. */
function importedSpecifier(node: ts.Node): string | undefined {
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
    return node.moduleSpecifier.text;
  }
  if (
    ts.isCallExpression(node) &&
    (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
    node.arguments[0] &&
    ts.isStringLiteralLike(node.arguments[0])
  ) {
    return node.arguments[0].text;
  }
  return undefined;
}

function scriptKind(file: string): ts.ScriptKind {
  return /\.[cm]?ts$/.test(file) ? ts.ScriptKind.TS : ts.ScriptKind.JS;
}

/**
 * shadcn/ui's Tailwind v3 color names, as its `tailwind.config` maps them,
 * used when the project's config cannot be read: `--sidebar-background` is
 * `bg-sidebar`, every other variable is the class of the same name.
 */
const SHADCN_COLORS = new Set([
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'sidebar-background',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-border',
  'sidebar-ring',
]);

/**
 * Gives color tokens their Tailwind v3 class names: the key the config maps
 * the custom property to, or, when the config has no colors we can read,
 * shadcn/ui's convention. Tokens that already have a key (`@theme`) keep it.
 */
export function applyTailwindColors(tokens: Token[], colors: Map<string, string>): void {
  for (const token of tokens) {
    if (token.category !== 'color' || token.tailwind !== undefined || !token.cssVar) continue;
    const name = token.cssVar.slice(2);
    const key = colors.size
      ? colors.get(token.cssVar)
      : SHADCN_COLORS.has(name)
        ? name.replace(/^sidebar-background$/, 'sidebar')
        : undefined;
    if (key === undefined) continue;
    token.tailwind = key;
    token.usage = usageFor(token, '--color');
  }
}

/** The project's Tailwind v3 config: `tailwind.config` in components.json, else `tailwind.config.*` in the root. */
export function findTailwindConfig(root: string): string | undefined {
  try {
    const json = JSON.parse(fs.readFileSync(path.join(root, 'components.json'), 'utf8')) as {
      tailwind?: { config?: unknown };
    };
    const config = json.tailwind?.config;
    if (typeof config === 'string' && config && fs.existsSync(path.join(root, config))) {
      return path.join(root, config);
    }
  } catch {
    // No components.json, or not one we can read.
  }
  return ['ts', 'js', 'cjs', 'mjs', 'cts', 'mts']
    .map((ext) => path.join(root, `tailwind.config.${ext}`))
    .find((file) => fs.existsSync(file));
}
