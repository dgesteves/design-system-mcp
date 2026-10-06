import ts from 'typescript';

import type { CompoundVariantInfo, VariantInfo } from '../types.js';

/** A `cva()` (class-variance-authority) or `tv()` (tailwind-variants) definition. */
export interface VariantDefinition {
  /** The variable it is assigned to, e.g. `buttonVariants`. */
  name: string;
  base: string;
  variants: VariantInfo[];
  compoundVariants: CompoundVariantInfo[];
  node: ts.CallExpression;
}

const FACTORIES = new Set(['cva', 'tv']);

/** Finds every `const x = cva(base, { variants, defaultVariants })` in a file. */
export function findVariantDefinitions(sourceFile: ts.SourceFile): Map<string, VariantDefinition> {
  const found = new Map<string, VariantDefinition>();
  const factories = factoryNames(sourceFile);

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer)
    ) {
      const call = node.initializer;
      const callee = call.expression;
      if (ts.isIdentifier(callee) && factories.has(callee.text)) {
        const definition = parseDefinition(node.name.text, call);
        if (definition) found.set(definition.name, definition);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

/** `cva`/`tv` plus any local aliases (`import { cva as variants } from ...`). */
function factoryNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set(FACTORIES);
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const imported = (element.propertyName ?? element.name).text;
      if (FACTORIES.has(imported)) names.add(element.name.text);
    }
  }
  return names;
}

function parseDefinition(name: string, call: ts.CallExpression): VariantDefinition | undefined {
  const [first, second] = call.arguments;
  // cva(base, config) or tv({ base, variants, ... })
  let base = '';
  let config: ts.ObjectLiteralExpression | undefined;
  if (first && ts.isObjectLiteralExpression(first) && !second) {
    config = first;
    const baseProp = property(first, 'base');
    if (baseProp) base = classText(baseProp);
  } else {
    if (first) base = classText(first);
    if (second && ts.isObjectLiteralExpression(second)) config = second;
  }

  const variants: VariantInfo[] = [];
  const compoundVariants: CompoundVariantInfo[] = [];
  if (config) {
    const defaults = new Map<string, string>();
    const defaultsNode = property(config, 'defaultVariants');
    if (defaultsNode && ts.isObjectLiteralExpression(defaultsNode)) {
      for (const prop of defaultsNode.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const key = propertyName(prop.name);
        const value = literalText(prop.initializer);
        if (key !== undefined && value !== undefined) defaults.set(key, value);
      }
    }

    const variantsNode = property(config, 'variants');
    if (variantsNode && ts.isObjectLiteralExpression(variantsNode)) {
      for (const prop of variantsNode.properties) {
        if (!ts.isPropertyAssignment(prop) || !ts.isObjectLiteralExpression(prop.initializer))
          continue;
        const variantName = propertyName(prop.name);
        if (variantName === undefined) continue;
        const classes: Record<string, string> = {};
        for (const option of prop.initializer.properties) {
          if (!ts.isPropertyAssignment(option)) continue;
          const value = propertyName(option.name);
          if (value !== undefined) classes[value] = classText(option.initializer);
        }
        const variant: VariantInfo = { name: variantName, values: Object.keys(classes), classes };
        const fallback = defaults.get(variantName);
        if (fallback !== undefined) variant.default = fallback;
        variants.push(variant);
      }
    }

    const compoundNode = property(config, 'compoundVariants');
    if (compoundNode && ts.isArrayLiteralExpression(compoundNode)) {
      for (const element of compoundNode.elements) {
        if (!ts.isObjectLiteralExpression(element)) continue;
        const when: Record<string, string | string[]> = {};
        let classes = '';
        for (const prop of element.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          const key = propertyName(prop.name);
          if (key === undefined) continue;
          if (key === 'class' || key === 'className') {
            classes = classText(prop.initializer);
          } else if (ts.isArrayLiteralExpression(prop.initializer)) {
            when[key] = prop.initializer.elements
              .map(literalText)
              .filter((v): v is string => v !== undefined);
          } else {
            const value = literalText(prop.initializer);
            if (value !== undefined) when[key] = value;
          }
        }
        compoundVariants.push({ when, classes });
      }
    }
  }

  return { name, base, variants, compoundVariants, node: call };
}

function property(object: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const prop of object.properties) {
    if (ts.isPropertyAssignment(prop) && propertyName(prop.name) === name) return prop.initializer;
  }
  return undefined;
}

export function propertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) {
    return name.expression.text;
  }
  return undefined;
}

/** `"sm"`, `'sm'`, `` `sm` ``, `true`, `1` → string. */
export function literalText(node: ts.Expression): string | undefined {
  if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return node.text;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return 'true';
  if (node.kind === ts.SyntaxKind.FalseKeyword) return 'false';
  return undefined;
}

/** Class strings from a string, template, array of strings or nested call such as `cn(...)`. */
export function classText(node: ts.Node): string {
  const parts: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isStringLiteralLike(n)) parts.push(n.text);
    else if (ts.isTemplateExpression(n)) {
      parts.push(n.head.text, ...n.templateSpans.map((span) => span.literal.text));
    } else ts.forEachChild(n, visit);
  };
  visit(node);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
