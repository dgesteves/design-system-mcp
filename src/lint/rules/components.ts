import ts from 'typescript';

import type { ComponentInfo, PropInfo, TextEdit } from '../../types.js';
import { closest } from '../../util/strings.js';
import {
  attributeLiterals,
  attributeName,
  findAttribute,
  literalValues,
  type JsxNode,
} from '../analyze.js';
import type { Rule, RuleContext } from '../context.js';
import { NON_TEXT_INPUT_TYPES } from '../target.js';

function renameTag(context: RuleContext, element: JsxNode, name: string): TextEdit[] {
  const edits: TextEdit[] = [
    { range: [element.tagName.getStart(context.sourceFile), element.tagName.end], text: name },
  ];
  if (element.closing) {
    edits.push({
      range: [element.closing.tagName.getStart(context.sourceFile), element.closing.tagName.end],
      text: name,
    });
  }
  return edits;
}

function tagRange(context: RuleContext, element: JsxNode): { start: number; end: number } {
  return { start: element.tagName.getStart(context.sourceFile), end: element.tagName.end };
}

function importLine(component: ComponentInfo): string {
  const binding = component.exportName.split('.')[0] ?? component.name;
  return `import { ${binding} } from "${component.importPath}"`;
}

// ─── prefer-design-system-component ─────────────────────────────────────────

export const preferDesignSystemComponent: Rule = {
  id: 'prefer-design-system-component',
  description:
    'Use the design-system component instead of the native element it wraps (<Button> over <button>).',
  run(context) {
    if (context.isDesignSystemSource) return;
    const allow = new Set(context.options.allow ?? []);
    for (const element of context.analysis.elements) {
      const resolution = context.resolve(element);
      if (resolution.kind !== 'intrinsic' || allow.has(resolution.tag)) continue;
      let key = resolution.tag;
      if (key === 'input') {
        const type = attributeLiterals(element, 'type')[0]?.text;
        if (type && NON_TEXT_INPUT_TYPES.has(type)) key = `input[type=${type}]`;
      }
      const component = context.target.elements.get(key);
      if (!component) continue;
      // Renaming the tag is only safe when the component renders that element
      // and so takes its attributes; a match by name (Radix `Dialog` for
      // `<dialog>`, `Select` for `<select>`) needs a rewrite.
      const dropIn = component.element === resolution.tag;
      const styled = Boolean(findAttribute(element, 'className'));
      context.report({
        ...tagRange(context, element),
        message:
          `Native <${resolution.tag}> where the design system has <${component.name}>. ` +
          `Use <${component.name}> (${importLine(component)})` +
          (!dropIn
            ? `; it does not render a <${resolution.tag}>, so check its props and parts with get_component.`
            : styled
              ? '; its variants replace the custom classes.'
              : '.'),
        suggestion: `<${component.name}>`,
        fix: dropIn ? renameTag(context, element, component.name) : undefined,
      });
    }
  },
};

// ─── no-unknown-component ───────────────────────────────────────────────────

export const noUnknownComponent: Rule = {
  id: 'no-unknown-component',
  description:
    'Components must exist in the design system: no invented components or dot-notation members.',
  run(context) {
    const { target } = context;
    for (const element of context.analysis.elements) {
      const resolution = context.resolve(element);
      const range = tagRange(context, element);

      if (resolution.kind === 'missing-member') {
        const { owner, member } = resolution;
        const flat = target.components.get(`${owner.name}${member}`);
        if (flat) {
          context.report({
            ...range,
            message: `<${element.tag}> does not exist: ${owner.name} is composed from flat parts. Use <${flat.name}> (${importLine(flat)}).`,
            suggestion: `<${flat.name}>`,
            fix: renameTag(context, element, flat.name),
          });
        } else {
          const parts = owner.subcomponents.length
            ? ` Its parts are ${owner.subcomponents.join(', ')}.`
            : '';
          context.report({ ...range, message: `${owner.name} has no member "${member}".${parts}` });
        }
        continue;
      }

      if (resolution.kind === 'missing-export') {
        const guess = closest(resolution.name, target.names());
        context.report({
          ...range,
          message:
            `"${resolution.name}" is not a design-system component (imported from "${resolution.source}").` +
            (guess
              ? ` Did you mean <${guess}>?`
              : ' Use search_components to find an existing one.'),
          suggestion: guess ? `<${guess}>` : undefined,
        });
        continue;
      }

      if (resolution.kind === 'unresolved') {
        const guess = closest(resolution.name, target.names());
        if (guess) {
          context.report({
            ...range,
            message: `Unknown component <${resolution.name}>. Did you mean <${guess}>?`,
            suggestion: `<${guess}>`,
            fix: renameTag(context, element, guess),
          });
        } else if (context.analysis.imports.size > 0) {
          // Only for whole modules: fragments without imports routinely use
          // icons and app components the agent has not imported yet.
          context.report({
            ...range,
            severity: 'warning',
            message: `<${resolution.name}> is not a design-system component and is not imported or declared here.`,
          });
        }
      }
    }
  },
};

// ─── no-unknown-prop ────────────────────────────────────────────────────────

/** Prop names from other libraries → the conventional name in shadcn-style systems. */
const PROP_SYNONYMS: Record<string, string[]> = {
  variant: [
    'tone',
    'intent',
    'kind',
    'appearance',
    'color',
    'colorScheme',
    'colorPalette',
    'look',
    'theme',
    'severity',
    'status',
    'type',
  ],
  size: ['sz', 'scale', 'dimension'],
  disabled: ['isDisabled'],
  required: ['isRequired'],
  open: ['isOpen', 'opened', 'visible', 'show', 'shown'],
  onOpenChange: ['onClose', 'onDismiss', 'onToggle', 'onOpen', 'onVisibleChange'],
  asChild: ['as', 'component', 'render'],
};

export const noUnknownProp: Rule = {
  id: 'no-unknown-prop',
  description: 'Props must exist on the component (own props or the HTML attributes it forwards).',
  run(context) {
    const { propSets } = context.target.model;
    for (const element of context.analysis.elements) {
      const resolution = context.resolve(element);
      if (resolution.kind !== 'component' || resolution.component.openProps) continue;
      const component = resolution.component;
      const own = component.props.map((p) => p.name);
      const known = new Set(own);
      for (const inherited of component.inherits) {
        for (const name of propSets[inherited.set] ?? []) known.add(name);
      }
      for (const attribute of element.attributes) {
        const name = attributeName(attribute);
        if (
          known.has(name) ||
          name === 'key' ||
          name === 'ref' ||
          name.includes('-') ||
          name.includes(':')
        ) {
          continue;
        }
        const synonym = Object.entries(PROP_SYNONYMS).find(
          ([target, aliases]) => known.has(target) && aliases.includes(name),
        )?.[0];
        const guess = synonym ?? closest(name, own) ?? closest(name, known, 0.25);
        const prop = guess ? component.props.find((p) => p.name === guess) : undefined;
        const values = prop?.values?.length
          ? ` (${prop.values.map((v) => `"${v}"`).join(' | ')})`
          : '';
        const valueOk =
          !prop?.values || literalValues(attribute).every((l) => prop.values?.includes(l.text));
        // Renaming `isOpen` to `open` next to an existing `open` would duplicate it.
        const taken = guess !== undefined && findAttribute(element, guess) !== undefined;
        context.report({
          start: attribute.name.getStart(context.sourceFile),
          end: attribute.name.end,
          message:
            `<${element.tag}> has no prop "${name}".` +
            (guess ? ` Did you mean "${guess}"${values}?` : ''),
          suggestion: guess,
          fix:
            guess && valueOk && !taken
              ? [
                  {
                    range: [attribute.name.getStart(context.sourceFile), attribute.name.end],
                    text: guess,
                  },
                ]
              : undefined,
        });
      }
    }
  },
};

// ─── no-unknown-variant ─────────────────────────────────────────────────────

/**
 * Variant values that mean the same thing across libraries. A value in a
 * group maps to whichever member the component actually accepts, so "error"
 * becomes "destructive" for shadcn/ui and "danger" for a system that uses that.
 */
const VALUE_GROUPS: string[][] = [
  ['destructive', 'danger', 'error', 'delete', 'remove', 'negative', 'critical', 'red', 'alert'],
  ['default', 'primary', 'main', 'solid', 'filled', 'brand', 'contained'],
  ['ghost', 'tertiary', 'text', 'subtle', 'plain', 'minimal', 'flat', 'transparent', 'quiet'],
  ['outline', 'outlined', 'bordered', 'stroke', 'border', 'hollow'],
  ['secondary', 'neutral', 'muted', 'gray', 'grey', 'soft', 'light'],
  ['success', 'positive', 'ok', 'green', 'active', 'valid', 'done'],
  ['warning', 'caution', 'warn', 'yellow', 'amber', 'pending'],
  ['info', 'information', 'note', 'notice', 'blue'],
  ['link', 'anchor', 'href', 'inline'],
  ['sm', 'small', 's', 'xs', 'compact', 'tiny'],
  ['md', 'medium', 'm', 'default', 'normal', 'regular', 'base'],
  ['lg', 'large', 'l', 'big'],
  ['icon', 'iconOnly', 'icon-only', 'square', 'icon-button'],
];

export function suggestValue(value: string, allowed: readonly string[]): string | undefined {
  const lower = value.toLowerCase();
  for (const group of VALUE_GROUPS) {
    if (!group.includes(lower)) continue;
    const match = group.find((member) => member !== lower && allowed.includes(member));
    if (match) return match;
  }
  return closest(value, allowed, 0.5);
}

export const noUnknownVariant: Rule = {
  id: 'no-unknown-variant',
  description:
    'Variant props (cva variants and string-literal unions) only accept their declared values.',
  run(context) {
    for (const element of context.analysis.elements) {
      const resolution = context.resolve(element);
      if (resolution.kind !== 'component') continue;
      for (const attribute of element.attributes) {
        const name = attributeName(attribute);
        const prop: PropInfo | undefined = resolution.component.props.find(
          (p) => p.name === name && p.values?.length,
        );
        if (!prop?.values) continue;
        for (const literal of literalValues(attribute)) {
          if (prop.values.includes(literal.text)) continue;
          const guess = suggestValue(literal.text, prop.values);
          const start = literal.getStart(context.sourceFile) + 1;
          const end = literal.end - 1;
          context.report({
            start: start - 1,
            end: end + 1,
            message:
              `"${literal.text}" is not a valid ${name} for <${element.tag}>. ` +
              `Allowed: ${prop.values.join(', ')}.` +
              (guess ? ` Did you mean "${guess}"?` : ''),
            suggestion: guess ? `${name}="${guess}"` : undefined,
            fix: guess ? [{ range: [start, end], text: guess }] : undefined,
          });
        }
      }
    }
  },
};

// ─── icon-button-accessible-name ────────────────────────────────────────────

const ICON_LABELS: [RegExp, string][] = [
  [/^(Trash|Delete|Bin)/, 'Delete'],
  [/^(X|Close|Cross)(Icon)?$|^X(Circle|Square)/, 'Close'],
  [/^(Plus|Add)/, 'Add'],
  [/^(Pencil|Edit|PenLine|SquarePen)/, 'Edit'],
  [/^Search/, 'Search'],
  [/^(Menu|Hamburger)/, 'Open menu'],
  [/^(Settings|Cog|Gear)/, 'Settings'],
  [/^(Copy|Clipboard)/, 'Copy'],
  [/^Download/, 'Download'],
  [/^Upload/, 'Upload'],
  [/^(MoreHorizontal|MoreVertical|Ellipsis|DotsHorizontal|DotsVertical)/, 'More options'],
  [/^ChevronLeft|^ArrowLeft/, 'Previous'],
  [/^ChevronRight|^ArrowRight/, 'Next'],
  [/^(UserMinus|UserX)/, 'Remove member'],
  [/^(UserPlus)/, 'Invite member'],
  [/^(RefreshCw|RefreshCcw|RotateCw)/, 'Refresh'],
  [/^(Share)/, 'Share'],
  [/^(Filter)/, 'Filter'],
  [/^(Info)/, 'More information'],
];

type Content = 'text' | 'icon' | 'empty';

/** i18n components that render text: react-intl's `Formatted*`, react-i18next's and Lingui's `Trans`. */
const TEXT_COMPONENTS = /^(?:Formatted[A-Z]\w*|Trans|Translate)$/;

/** `<svg><title>Close</title>…</svg>`: the title is the image's accessible name. */
function hasSvgTitle(svg: ts.Node, context: RuleContext): boolean {
  return (
    ts.isJsxElement(svg) &&
    svg.children.some(
      (child) =>
        ts.isJsxElement(child) &&
        child.openingElement.tagName.getText(context.sourceFile) === 'title' &&
        child.children.some((c) =>
          ts.isJsxText(c) ? c.text.trim() !== '' : ts.isJsxExpression(c) && c.expression,
        ),
    )
  );
}

function classify(children: readonly ts.Node[], context: RuleContext, icons: string[]): Content {
  let result: Content = 'empty';
  for (const child of children) {
    let kind: Content = 'empty';
    if (ts.isJsxText(child)) kind = child.text.trim() ? 'text' : 'empty';
    else if (ts.isJsxExpression(child)) kind = child.expression ? 'text' : 'empty';
    else if (ts.isJsxFragment(child)) kind = classify(child.children, context, icons);
    else if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
      const opening = ts.isJsxElement(child) ? child.openingElement : child;
      const tag = opening.tagName.getText(context.sourceFile);
      const hasLabel = opening.attributes.properties.some(
        (a) =>
          ts.isJsxAttribute(a) &&
          /^(aria-label|aria-labelledby|alt|title)$/.test(a.name.getText(context.sourceFile)) &&
          !(a.initializer && ts.isStringLiteral(a.initializer) && !a.initializer.text.trim()),
      );
      if (hasLabel || (tag === 'svg' && hasSvgTitle(child, context))) kind = 'text';
      else if (tag === 'svg' || tag === 'img') kind = 'icon';
      else if (ts.isJsxElement(child) && child.children.length) {
        kind = classify(child.children, context, icons);
      } else if (TEXT_COMPONENTS.test(tag)) {
        kind = 'text';
      } else if (/^[A-Z]/.test(tag)) {
        icons.push(tag);
        kind = 'icon';
      }
    }
    if (kind === 'text') return 'text';
    if (kind === 'icon') result = 'icon';
  }
  return result;
}

export const iconButtonAccessibleName: Rule = {
  id: 'icon-button-accessible-name',
  description:
    'Buttons whose only content is an icon need an aria-label (or visually hidden text).',
  run(context) {
    for (const element of context.analysis.elements) {
      const resolution = context.resolve(element);
      const isButton =
        (resolution.kind === 'intrinsic' && resolution.tag === 'button') ||
        (resolution.kind === 'component' &&
          (resolution.component.element === 'button' || /Button$/.test(resolution.component.name)));
      if (!isButton || element.hasSpread) continue;
      if (findAttribute(element, 'asChild')) continue;
      const labelled = ['aria-label', 'aria-labelledby', 'title'].some((name) => {
        const attribute = findAttribute(element, name);
        if (!attribute) return false;
        const values = literalValues(attribute);
        return !values.length || values.some((v) => v.text.trim());
      });
      if (labelled) continue;
      const icons: string[] = [];
      const content = classify(element.children, context, icons);
      const sizeIcon = attributeLiterals(element, 'size').some((v) => v.text.includes('icon'));
      if (
        content === 'text' ||
        (content === 'empty' && !sizeIcon && resolution.kind !== 'intrinsic')
      )
        continue;

      const icon = icons[0];
      const label = icon ? ICON_LABELS.find(([pattern]) => pattern.test(icon))?.[1] : undefined;
      const attribute = `aria-label="${label ?? '…'}"`;
      context.report({
        ...tagRange(context, element),
        message:
          content === 'icon'
            ? `Icon-only <${element.tag}> has no accessible name. Add ${attribute} describing the action, or visually hidden text.`
            : `<${element.tag}> has no content and no accessible name. Add ${attribute}.`,
        suggestion: attribute,
        fix: label
          ? [{ range: [element.tagName.end, element.tagName.end], text: ` ${attribute}` }]
          : undefined,
      });
    }
  },
};
