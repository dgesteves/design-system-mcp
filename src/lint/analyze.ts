import ts from 'typescript';

import { propertyName } from '../extract/cva.js';

export interface ImportBinding {
  source: string;
  /** Imported name, `default`, or `*` for namespace imports. */
  imported: string;
}

export interface JsxNode {
  node: ts.JsxElement | ts.JsxSelfClosingElement;
  opening: ts.JsxOpeningElement | ts.JsxSelfClosingElement;
  closing?: ts.JsxClosingElement | undefined;
  tagName: ts.JsxTagNameExpression;
  /** Tag as written: `button`, `Button`, `Card.Header`. */
  tag: string;
  attributes: ts.JsxAttribute[];
  hasSpread: boolean;
  children: readonly ts.JsxChild[];
}

/** A run of literal class text with its absolute offset in the source. */
export interface ClassString {
  text: string;
  start: number;
  /** The JSX element whose `className` this is, if any. */
  element?: JsxNode | undefined;
}

export interface StyleObject {
  element: JsxNode;
  object: ts.ObjectLiteralExpression;
}

export interface Analysis {
  imports: Map<string, ImportBinding>;
  declared: Set<string>;
  elements: JsxNode[];
  classStrings: ClassString[];
  styles: StyleObject[];
}

const CLASS_FUNCTIONS = /^(cn|clsx|cx|twMerge|twJoin|classNames|classnames|cva|tv)$/;

/** The node's children in source order. */
function childrenOf(node: ts.Node): ts.Node[] {
  const children: ts.Node[] = [];
  ts.forEachChild(node, (child) => {
    children.push(child);
  });
  return children;
}

/**
 * Visits `root` and its descendants depth-first, in source order, with an explicit stack:
 * generated or adversarial code can nest thousands of levels deep, more than recursion allows.
 * `enter` returns false to skip a node's children.
 */
function walk(root: ts.Node, enter: (node: ts.Node) => boolean): void {
  const stack: ts.Node[] = [root];
  for (let node = stack.pop(); node; node = stack.pop()) {
    if (!enter(node)) continue;
    const children = childrenOf(node);
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i] as ts.Node);
  }
}
const VARIANT_FUNCTIONS = /^(cva|tv)$/;

export function analyze(sourceFile: ts.SourceFile): Analysis {
  const analysis: Analysis = {
    imports: new Map(),
    declared: new Set(),
    elements: [],
    classStrings: [],
    styles: [],
  };
  const seenStrings = new Set<ts.Node>();
  const text = sourceFile.text;

  const collectStrings = (node: ts.Node, element?: JsxNode): void => {
    // Depth-first in source order, with an explicit stack, like `walk`.
    const stack: ts.Node[] = [node];
    for (let n = stack.pop(); n; n = stack.pop()) {
      if (seenStrings.has(n)) continue;
      // Conditions like `size === "icon"` are not class names.
      if (ts.isBinaryExpression(n) && isComparison(n.operatorToken.kind)) continue;
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
        seenStrings.add(n);
        const start = n.getStart(sourceFile) + 1;
        analysis.classStrings.push({ text: text.slice(start, n.end - 1), start, element });
        continue;
      }
      if (ts.isTemplateExpression(n)) {
        seenStrings.add(n);
        const parts: ts.TemplateLiteralLikeNode[] = [
          n.head,
          ...n.templateSpans.map((s) => s.literal),
        ];
        for (const part of parts) {
          const start = part.getStart(sourceFile) + 1;
          const end = ts.isTemplateTail(part) ? part.end - 1 : part.end - 2;
          analysis.classStrings.push({ text: text.slice(start, end), start, element });
        }
        for (let i = n.templateSpans.length - 1; i >= 0; i--) {
          stack.push((n.templateSpans[i] as ts.TemplateSpan).expression);
        }
        continue;
      }
      // Object keys in clsx({ "bg-red-500": cond }) are classes; values are conditions.
      if (ts.isPropertyAssignment(n)) {
        stack.push(n.name);
        continue;
      }
      const children = childrenOf(n);
      for (let i = children.length - 1; i >= 0; i--) stack.push(children[i] as ts.Node);
    }
  };

  /** A class value, or an object of them: tv slots, and variant options that style slots. */
  const collectClassValues = (node: ts.Expression): void => {
    if (!ts.isObjectLiteralExpression(node)) {
      collectStrings(node);
      return;
    }
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) collectClassValues(prop.initializer);
    }
  };

  /**
   * The classes in a cva()/tv() config: `base`, `slots`, every variant option
   * and compound `class`/`className`. Variant names, conditions and
   * `defaultVariants` are not classes.
   */
  const collectVariantConfig = (config: ts.ObjectLiteralExpression): void => {
    for (const prop of config.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const key = propertyName(prop.name);
      const value = prop.initializer;
      if (key === 'base' || key === 'slots') {
        collectClassValues(value);
      } else if (key === 'variants' && ts.isObjectLiteralExpression(value)) {
        for (const variant of value.properties) {
          if (ts.isPropertyAssignment(variant)) collectClassValues(variant.initializer);
        }
      } else if (
        (key === 'compoundVariants' || key === 'compoundSlots') &&
        ts.isArrayLiteralExpression(value)
      ) {
        for (const entry of value.elements) {
          if (!ts.isObjectLiteralExpression(entry)) continue;
          for (const option of entry.properties) {
            const name = ts.isPropertyAssignment(option) ? propertyName(option.name) : undefined;
            if (ts.isPropertyAssignment(option) && (name === 'class' || name === 'className')) {
              collectClassValues(option.initializer);
            }
          }
        }
      }
    }
  };

  const enter = (node: ts.Node): boolean => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const source = node.moduleSpecifier.text;
      const clause = node.importClause;
      if (clause?.name) analysis.imports.set(clause.name.text, { source, imported: 'default' });
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) {
        analysis.imports.set(bindings.name.text, { source, imported: '*' });
      } else if (bindings) {
        for (const element of bindings.elements) {
          analysis.imports.set(element.name.text, {
            source,
            imported: (element.propertyName ?? element.name).text,
          });
        }
      }
      return false;
    }

    if (
      (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) &&
      ts.isIdentifier(node.name)
    ) {
      analysis.declared.add(node.name.text);
    }
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isEnumDeclaration(node)) &&
      node.name
    ) {
      analysis.declared.add(node.name.text);
    }

    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const element: JsxNode = {
        node,
        opening,
        closing: ts.isJsxElement(node) ? node.closingElement : undefined,
        tagName: opening.tagName,
        tag: opening.tagName.getText(sourceFile),
        attributes: opening.attributes.properties.filter(ts.isJsxAttribute),
        hasSpread: opening.attributes.properties.some(ts.isJsxSpreadAttribute),
        children: ts.isJsxElement(node) ? node.children : [],
      };
      analysis.elements.push(element);
      for (const attribute of element.attributes) {
        const name = attribute.name.getText(sourceFile);
        const init = attribute.initializer;
        if (!init) continue;
        if (name === 'className' || name === 'class') collectStrings(init, element);
        if (name === 'style' && ts.isJsxExpression(init) && init.expression) {
          for (const object of styleObjects(init.expression)) {
            analysis.styles.push({ element, object });
          }
        }
      }
    }

    if (ts.isCallExpression(node) && CLASS_FUNCTIONS.test(node.expression.getText(sourceFile))) {
      const variants = VARIANT_FUNCTIONS.test(node.expression.getText(sourceFile));
      node.arguments.forEach((arg) => {
        if (variants && ts.isObjectLiteralExpression(arg)) collectVariantConfig(arg);
        else collectStrings(arg);
      });
    }
    return true;
  };

  walk(sourceFile, enter);
  return analysis;
}

function isComparison(kind: ts.SyntaxKind): boolean {
  return (
    kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
    kind === ts.SyntaxKind.EqualsEqualsToken ||
    kind === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
    kind === ts.SyntaxKind.ExclamationEqualsToken
  );
}

export function attributeName(attribute: ts.JsxAttribute): string {
  return ts.isIdentifier(attribute.name)
    ? attribute.name.text
    : `${attribute.name.namespace.text}:${attribute.name.name.text}`;
}

export function findAttribute(element: JsxNode, name: string): ts.JsxAttribute | undefined {
  return element.attributes.find((a) => attributeName(a) === name);
}

/** Literal values of the named attribute, or none when it is absent. */
export function attributeLiterals(element: JsxNode, name: string): ts.StringLiteralLike[] {
  const attribute = findAttribute(element, name);
  return attribute ? literalValues(attribute) : [];
}

/**
 * String literals an attribute can evaluate to: `"a"`, `{"a"}`, `` {`a`} ``,
 * and both branches of `{cond ? "a" : "b"}`.
 */
export function literalValues(attribute: ts.JsxAttribute): ts.StringLiteralLike[] {
  const init = attribute.initializer;
  if (!init) return [];
  if (ts.isStringLiteral(init)) return [init];
  if (!ts.isJsxExpression(init) || !init.expression) return [];
  const out: ts.StringLiteralLike[] = [];
  const visit = (expr: ts.Expression): void => {
    if (ts.isStringLiteralLike(expr)) out.push(expr);
    else if (ts.isParenthesizedExpression(expr)) visit(expr.expression);
    else if (ts.isConditionalExpression(expr)) {
      visit(expr.whenTrue);
      visit(expr.whenFalse);
    } else if (
      ts.isBinaryExpression(expr) &&
      (expr.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        expr.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    ) {
      visit(expr.right);
    }
  };
  visit(init.expression);
  return out;
}

/** `(x)`, `x as T`, `x satisfies T` and `x!` all evaluate to `x`. */
function unwrap(expr: ts.Expression): ts.Expression {
  let current = expr;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

/**
 * The expressions a value can evaluate to: both branches of `a ? b : c`, both sides of `a ?? b`
 * and `a || b`, and the right of `cond && b`, down to the leaves.
 */
export function valueBranches(expr: ts.Expression): ts.Expression[] {
  const out: ts.Expression[] = [];
  const stack = [expr];
  for (let current = stack.pop(); current; current = stack.pop()) {
    const value = unwrap(current);
    if (ts.isConditionalExpression(value)) {
      stack.push(value.whenFalse, value.whenTrue);
    } else if (
      ts.isBinaryExpression(value) &&
      (value.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        value.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    ) {
      stack.push(value.right, value.left);
    } else if (
      ts.isBinaryExpression(value) &&
      value.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    ) {
      stack.push(value.right);
    } else {
      out.push(value);
    }
  }
  return out;
}

/**
 * What a function returns: its expression body, or the `return` statements of its block,
 * not counting functions nested inside it. Render props (`{({ isPressed }) => <Icon />}`) and
 * style functions (`style={({ isPressed }) => ({ ... })}`) are read through this.
 */
export function returnedExpressions(fn: ts.ArrowFunction | ts.FunctionExpression): ts.Expression[] {
  if (!ts.isBlock(fn.body)) return [fn.body];
  const out: ts.Expression[] = [];
  const stack: ts.Node[] = [fn.body];
  for (let node = stack.pop(); node; node = stack.pop()) {
    if (ts.isReturnStatement(node)) {
      if (node.expression) out.push(node.expression);
      continue;
    }
    if (ts.isFunctionLike(node)) continue;
    const children = childrenOf(node);
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i] as ts.Node);
  }
  return out;
}

/** A function the way JSX passes one: an arrow function or a function expression. */
export function asFunction(
  expr: ts.Expression,
): ts.ArrowFunction | ts.FunctionExpression | undefined {
  const value = unwrap(expr);
  return ts.isArrowFunction(value) || ts.isFunctionExpression(value) ? value : undefined;
}

/** The object literals a `style` value can be: an object, a branch of one, or what a style function returns. */
function styleObjects(expr: ts.Expression): ts.ObjectLiteralExpression[] {
  const fn = asFunction(expr);
  const values = fn ? returnedExpressions(fn).flatMap(valueBranches) : valueBranches(expr);
  return values.filter(ts.isObjectLiteralExpression);
}
