import ts from 'typescript';

import { propertyName } from '../../extract/cva.js';
import {
  findColorLiterals,
  formatDeltaE,
  isNamedColor,
  parseColor,
  type Oklch,
} from '../../tokens/color.js';
import type { Token } from '../../types.js';
import { formatPx, lengthToPx } from '../../tokens/units.js';
import { attributeName, literalValues, type JsxNode } from '../analyze.js';
import type { Rule, RuleContext } from '../context.js';
import {
  COLOR_PREFIXES,
  RADIUS_PREFIXES,
  SPACING_PREFIXES,
  STYLE_COLOR_PROPERTIES,
  STYLE_RADIUS_PROPERTIES,
  STYLE_SPACING_PROPERTIES,
  isColorAttribute,
  paletteColor,
  parseUtility,
  splitClasses,
  withBase,
  type Utility,
} from '../tailwind.js';

/** Below this ΔE two colors are indistinguishable in practice. */
const SAME_COLOR = 0.02;
/** Above this ΔE the nearest token is a different color, so no mechanical fix is offered. */
const CLOSE_COLOR = 0.1;

// ─── Colors ─────────────────────────────────────────────────────────────────

export const noHardcodedColor: Rule = {
  id: 'no-hardcoded-color',
  description:
    'Colors must come from design tokens: no hex/rgb/oklch literals, arbitrary Tailwind colors or default-palette classes.',
  run(context) {
    const { tokens } = context.target;
    if (!tokens.has('color')) return;
    const allow = new Set((context.options.allow ?? []).map((v) => v.toLowerCase()));

    for (const classString of context.analysis.classStrings) {
      for (const token of splitClasses(classString.text, classString.start)) {
        if (allow.has(token.value.toLowerCase())) continue;
        const utility = parseUtility(token.value);
        const element = classString.element;

        if (
          utility.arbitrary !== undefined &&
          utility.prefix &&
          COLOR_PREFIXES.includes(utility.prefix)
        ) {
          const value = utility.arbitrary.replace(/^color:/, '').trim();
          const whole = parseColor(value);
          // `shadow-[0_1px_2px_#000]`: report the color inside, but no class can replace it 1:1.
          const literal = whole ? { text: value, color: whole } : findColorLiterals(value)[0];
          if (!literal || allow.has(literal.text.toLowerCase())) continue;
          reportColor(context, {
            start: token.start,
            end: token.end,
            what: `Hardcoded color \`${token.value}\``,
            color: literal.color,
            prefix: whole ? utility.prefix : undefined,
            place: 'class',
            utility,
            element,
          });
          continue;
        }

        const palette = paletteColor(utility.base);
        if (palette && !tokens.colorKeys.has(palette.key)) {
          const color = parseColor(palette.value);
          if (!color) continue;
          reportColor(context, {
            start: token.start,
            end: token.end,
            what: `\`${token.value}\` is Tailwind's default palette, not a design-system color`,
            color,
            prefix: palette.prefix,
            place: 'class',
            utility,
            element,
          });
        }
      }
    }

    for (const { object } of context.analysis.styles) {
      for (const prop of object.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const name = propertyName(prop.name);
        if (name === undefined || !(name in STYLE_COLOR_PROPERTIES)) continue;
        if (!ts.isStringLiteralLike(prop.initializer)) continue;
        reportLiteralColors(
          context,
          prop.initializer,
          `style.${name}`,
          STYLE_COLOR_PROPERTIES[name],
          'style',
          allow,
        );
      }
    }

    for (const element of context.analysis.elements) {
      for (const attribute of element.attributes) {
        const name = attributeName(attribute);
        if (!isColorAttribute(name)) continue;
        const prefix = name === 'fill' || name === 'stroke' ? name : 'text';
        for (const literal of literalValues(attribute)) {
          reportLiteralColors(context, literal, `${name}="…"`, prefix, 'attribute', allow);
        }
      }
    }
  },
};

function reportLiteralColors(
  context: RuleContext,
  literal: ts.StringLiteralLike,
  where: string,
  prefix: string | undefined,
  place: 'style' | 'attribute',
  allow: Set<string>,
): void {
  const start = literal.getStart(context.sourceFile) + 1;
  const text = literal.text;
  const matches = findColorLiterals(text);
  const trimmed = text.trim();
  if (!matches.length && isNamedColor(trimmed)) {
    const color = parseColor(trimmed);
    if (color) matches.push({ text: trimmed, index: text.indexOf(trimmed), color });
  }
  for (const match of matches) {
    if (allow.has(match.text.toLowerCase())) continue;
    reportColor(context, {
      start: start + match.index,
      end: start + match.index + match.text.length,
      what: `Hardcoded color \`${match.text}\` in ${where}`,
      color: match.color,
      prefix,
      place,
    });
  }
}

function reportColor(
  context: RuleContext,
  input: {
    start: number;
    end: number;
    what: string;
    color: Oklch;
    /** Tailwind prefix to build the replacement class with (`bg`, `text`, `border-t`). */
    prefix: string | undefined;
    /**
     * Where the literal sits: a class list (replace the class), a style value
     * (replace with `var(--token)`), or a JSX attribute such as `fill` or an
     * icon's `color` (move it to className; SVG attributes cannot use `var()`).
     */
    place: 'class' | 'style' | 'attribute';
    utility?: Utility;
    element?: JsxNode | undefined;
  },
): void {
  const nearest = context.target.tokens.nearestColor(input.color, 6);
  const best = nearest[0];
  if (!best) return;
  const token = best.candidate.token;
  const sameValue = nearest
    .slice(1)
    .filter((n) => Math.abs(n.distance - best.distance) < 1e-4)
    .map((n) => n.candidate.token.name);

  const cls = input.prefix && token.tailwind ? `${input.prefix}-${token.tailwind}` : undefined;
  const cssVar = token.cssVar ? `var(${token.cssVar})` : undefined;
  const close = best.distance < CLOSE_COLOR;
  const variant = cls && input.element ? variantApplying(context, input.element, cls) : undefined;

  let replacement: string | undefined;
  let advice: string | undefined;
  let edit: string | undefined;
  if (input.place === 'class') {
    replacement = cls ?? (cssVar && input.prefix ? `${input.prefix}-[${cssVar}]` : cssVar);
    if (replacement)
      advice = `\`${input.utility && input.prefix ? withBase(input.utility, replacement) : replacement}\``;
    if (replacement && input.prefix && input.utility) edit = withBase(input.utility, replacement);
  } else if (input.place === 'style') {
    replacement = cls ?? cssVar;
    advice = [cls, cssVar]
      .filter(Boolean)
      .map((v) => `\`${String(v)}\``)
      .join(' or ');
    edit = cssVar;
  } else {
    replacement = cls ? `className="${cls}"` : cssVar;
    advice = cls ? `\`${cls}\` in className` : undefined;
  }

  const label =
    best.distance < SAME_COLOR
      ? 'Matches token'
      : close
        ? 'Nearest token'
        : 'No close token; nearest is';
  const same = sameValue.length ? `, same value as ${sameValue.join(', ')}` : '';
  let message = `${input.what}. ${label} ${token.name} (${formatDeltaE(best.distance)}${same})`;
  if (close && advice) message += ` → ${advice}`;
  if (variant) message += `, or use ${variant}`;
  message += close ? '.' : '. Pick the semantic token that fits.';

  context.report({
    start: input.start,
    end: input.end,
    message,
    suggestion: close ? (variant ?? replacement) : undefined,
    fix: close && edit ? [{ range: [input.start, input.end], text: edit }] : undefined,
  });
}

/** `variant="destructive"` when a variant of the element's component already applies `cls`. */
function variantApplying(context: RuleContext, element: JsxNode, cls: string): string | undefined {
  const resolution = context.resolve(element);
  if (resolution.kind !== 'component') return undefined;
  for (const variant of resolution.component.variants) {
    for (const [value, classes] of Object.entries(variant.classes)) {
      if (classes.split(/\s+/).includes(cls)) return `${variant.name}="${value}"`;
    }
  }
  return undefined;
}

// ─── Spacing and radius ─────────────────────────────────────────────────────

interface LengthRuleSpec {
  category: 'spacing' | 'radius';
  prefixes: Set<string>;
  styleProperties: Record<string, string>;
}

function lengthRule(id: Rule['id'], description: string, spec: LengthRuleSpec): Rule {
  return {
    id,
    description,
    run(context) {
      const { tokens } = context.target;
      if (!tokens.has(spec.category)) return;
      const allow = new Set(context.options.allow ?? []);

      for (const classString of context.analysis.classStrings) {
        for (const token of splitClasses(classString.text, classString.start)) {
          const utility = parseUtility(token.value);
          if (
            !utility.prefix ||
            utility.arbitrary === undefined ||
            !spec.prefixes.has(utility.prefix)
          )
            continue;
          if (allow.has(token.value) || allow.has(utility.arbitrary)) continue;
          const px = lengthToPx(utility.arbitrary);
          if (px === undefined || px === 0) continue;
          const replacement = lengthReplacement(context, spec.category, px, utility.prefix);
          if (!replacement) continue;
          const message = replacement.exact
            ? `\`${token.value}\` is ${formatPx(px)}, which is on the ${spec.category} scale: use \`${withBase(utility, replacement.cls)}\`.`
            : `Hardcoded ${spec.category} \`${token.value}\` (${formatPx(px)}) is off the scale. Nearest: \`${withBase(utility, replacement.cls)}\` (${formatPx(replacement.px)}).`;
          context.report({
            start: token.start,
            end: token.end,
            message,
            suggestion: withBase(utility, replacement.cls),
            fix: [{ range: [token.start, token.end], text: withBase(utility, replacement.cls) }],
          });
        }
      }

      for (const { object } of context.analysis.styles) {
        for (const prop of object.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          const name = propertyName(prop.name);
          const prefix = name === undefined ? undefined : spec.styleProperties[name];
          if (!prefix) continue;
          const init = prop.initializer;
          const raw = ts.isNumericLiteral(init)
            ? init.text
            : ts.isStringLiteralLike(init)
              ? init.text
              : undefined;
          if (raw === undefined || allow.has(raw)) continue;
          const values = raw.trim().split(/\s+/);
          const lengths = values.map((v) =>
            ts.isNumericLiteral(init) ? Number(v) : lengthToPx(v),
          );
          if (lengths.some((px) => px === undefined) || lengths.every((px) => px === 0)) continue;
          const px = lengths.find((v) => v !== 0) ?? 0;
          const replacement =
            values.length === 1 ? lengthReplacement(context, spec.category, px, prefix) : undefined;
          const shown = ts.isNumericLiteral(init) ? `${name}: ${raw}` : `${name}: "${raw}"`;
          const advice = replacement
            ? replacement.tailwind
              ? `Use \`${replacement.cls}\` (${formatPx(replacement.px)}) in className instead of an inline style.`
              : `Use \`${replacement.cssVar ?? replacement.cls}\` (${formatPx(replacement.px)}).`
            : `Use ${spec.category} tokens instead.`;
          context.report({
            start: init.getStart(context.sourceFile),
            end: init.end,
            message: `Hardcoded ${spec.category} \`${shown}\` in style. ${advice}`,
            suggestion: replacement
              ? replacement.tailwind
                ? replacement.cls
                : replacement.cssVar
              : undefined,
            fix:
              replacement && !replacement.tailwind && replacement.cssVar && replacement.exact
                ? [
                    {
                      range: [init.getStart(context.sourceFile), init.end],
                      text: `"${replacement.cssVar}"`,
                    },
                  ]
                : undefined,
          });
        }
      }
    },
  };
}

function lengthReplacement(
  context: RuleContext,
  category: 'spacing' | 'radius',
  px: number,
  prefix: string,
):
  | {
      cls: string;
      px: number;
      exact: boolean;
      tailwind: boolean;
      cssVar?: string | undefined;
      token: Token;
    }
  | undefined {
  const nearest = context.target.tokens.nearestLength(category, px);
  if (!nearest) return undefined;
  const { candidate } = nearest;
  const exact = nearest.distance < 0.01;
  const cssVar = candidate.token.cssVar ? `var(${candidate.token.cssVar})` : undefined;
  if (candidate.key !== undefined) {
    const key = candidate.key === 'DEFAULT' ? '' : `-${candidate.key}`;
    return {
      cls: `${prefix}${key}`,
      px: candidate.px,
      exact,
      tailwind: true,
      cssVar,
      token: candidate.token,
    };
  }
  return {
    cls: cssVar ? `${prefix}-[${cssVar}]` : `${prefix}-[${formatPx(candidate.px)}]`,
    px: candidate.px,
    exact,
    tailwind: false,
    cssVar,
    token: candidate.token,
  };
}

export const noHardcodedSpacing = lengthRule(
  'no-hardcoded-spacing',
  'Padding, margin and gap must use the spacing scale, not arbitrary px/rem values.',
  { category: 'spacing', prefixes: SPACING_PREFIXES, styleProperties: STYLE_SPACING_PROPERTIES },
);

export const noHardcodedRadius = lengthRule(
  'no-hardcoded-radius',
  'Border radius must use radius tokens, not arbitrary values.',
  { category: 'radius', prefixes: RADIUS_PREFIXES, styleProperties: STYLE_RADIUS_PROPERTIES },
);
