import { TAILWIND_PALETTE } from './tailwind-palette.js';

/** One class in a class string, with absolute offsets into the checked source. */
export interface ClassToken {
  value: string;
  start: number;
  end: number;
}

export function splitClasses(text: string, offset: number): ClassToken[] {
  const tokens: ClassToken[] = [];
  for (const match of text.matchAll(/\S+/g)) {
    tokens.push({
      value: match[0],
      start: offset + match.index,
      end: offset + match.index + match[0].length,
    });
  }
  return tokens;
}

export interface Utility {
  /** `hover`, `md`, `dark`... */
  variants: string[];
  /** Where the `!` important modifier sits: `!p-4` (Tailwind v3 style) or `p-4!` (v4). */
  important: 'leading' | 'trailing' | undefined;
  negative: boolean;
  /** Utility without variants, `!`, `-` and `/modifier`: `bg-[#fff]`, `p-4`. */
  base: string;
  /** `/50` opacity or line-height modifier, including the slash. */
  modifier: string;
  /** For arbitrary values: the part before `-[`, e.g. `bg`, `px`, `rounded-t`. */
  prefix?: string;
  /** For arbitrary properties (`[background-color:#f00]`): the CSS property. */
  property?: string;
  /** For arbitrary values and properties: the value in `[...]` with `_` turned into spaces. */
  arbitrary?: string;
}

/** Parses `md:hover:!-mt-[3px]/50` style utilities. */
export function parseUtility(cls: string): Utility {
  const parts = splitTopLevel(cls, ':');
  let base = parts.pop() ?? '';
  const variants = parts;
  let important: Utility['important'];
  if (base.startsWith('!')) {
    important = 'leading';
    base = base.slice(1);
  } else if (base.endsWith('!')) {
    important = 'trailing';
    base = base.slice(0, -1);
  }
  let negative = false;
  if (base.startsWith('-')) {
    negative = true;
    base = base.slice(1);
  }
  let modifier = '';
  const slash = lastTopLevelIndex(base, '/');
  if (slash > 0) {
    modifier = base.slice(slash);
    base = base.slice(0, slash);
  }
  const utility: Utility = { variants, important, negative, base, modifier };
  const arbitrary = /^([a-z][\w-]*?)-\[(.+)\]$/.exec(base);
  if (arbitrary?.[1] && arbitrary[2]) {
    utility.prefix = arbitrary[1];
    utility.arbitrary = arbitrary[2].replace(/_/g, ' ');
  }
  // `[color:red]`; custom properties (`[--brand:...]`) define values rather than use them.
  const property = /^\[([a-z][a-z-]*):(.+)\]$/.exec(base);
  if (property?.[1] && property[2]) {
    utility.property = property[1];
    utility.arbitrary = property[2].replace(/_/g, ' ');
  }
  return utility;
}

/** Rebuilds a class from a parsed utility with a new base: keeps variants, `!` (where it was), `-` and modifier. */
export function withBase(utility: Utility, base: string): string {
  const variants = utility.variants.length ? `${utility.variants.join(':')}:` : '';
  const leading = utility.important === 'leading' ? '!' : '';
  const trailing = utility.important === 'trailing' ? '!' : '';
  return `${variants}${leading}${utility.negative ? '-' : ''}${base}${utility.modifier}${trailing}`;
}

function splitTopLevel(text: string, separator: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '[' || ch === '(') depth++;
    else if (ch === ']' || ch === ')') depth--;
    if (ch === separator && depth === 0) {
      out.push(current);
      current = '';
    } else current += ch;
  }
  out.push(current);
  return out;
}

function lastTopLevelIndex(text: string, ch: string): number {
  let depth = 0;
  let found = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '[' || c === '(') depth++;
    else if (c === ']' || c === ')') depth--;
    else if (c === ch && depth === 0) found = i;
  }
  return found;
}

/** Utilities that take a color, longest first so `border-t` wins over `border`. */
export const COLOR_PREFIXES = [
  'ring-offset',
  'inset-ring',
  'inset-shadow',
  'drop-shadow',
  'text-shadow',
  'border-x',
  'border-y',
  'border-t',
  'border-r',
  'border-b',
  'border-l',
  'border-s',
  'border-e',
  'decoration',
  'placeholder',
  'outline',
  'divide',
  'accent',
  'stroke',
  'shadow',
  'caret',
  'fill',
  'ring',
  'from',
  'via',
  'to',
  'border',
  'text',
  'bg',
];

export const SPACING_PREFIXES = new Set([
  'p',
  'px',
  'py',
  'pt',
  'pr',
  'pb',
  'pl',
  'ps',
  'pe',
  'm',
  'mx',
  'my',
  'mt',
  'mr',
  'mb',
  'ml',
  'ms',
  'me',
  'gap',
  'gap-x',
  'gap-y',
  'space-x',
  'space-y',
]);

/** Spacing utilities that can be negated (`-mt-2`); negative padding or gap is invalid CSS. */
export const NEGATIVE_PREFIXES = new Set([
  'm',
  'mx',
  'my',
  'mt',
  'mr',
  'mb',
  'ml',
  'ms',
  'me',
  'space-x',
  'space-y',
]);

export const RADIUS_PREFIXES = new Set([
  'rounded',
  'rounded-t',
  'rounded-r',
  'rounded-b',
  'rounded-l',
  'rounded-s',
  'rounded-e',
  'rounded-tl',
  'rounded-tr',
  'rounded-br',
  'rounded-bl',
  'rounded-ss',
  'rounded-se',
  'rounded-es',
  'rounded-ee',
]);

const PALETTE_NAMES = Object.keys(TAILWIND_PALETTE).join('|');
const PALETTE_CLASS = new RegExp(
  `^(${COLOR_PREFIXES.join('|')})-((?:${PALETTE_NAMES})-(?:50|[1-9]00|950))$`,
);

/** Tailwind's gray families; every other family is a hue, however pale its lightest shade. */
const GRAY_FAMILIES = new Set([
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'mauve',
  'olive',
  'mist',
  'taupe',
]);

/** `bg-blue-500` → `{ prefix: 'bg', key: 'blue-500', value: 'oklch(...)', gray: false }`. */
export function paletteColor(
  base: string,
): { prefix: string; key: string; value: string; gray: boolean } | undefined {
  const match = PALETTE_CLASS.exec(base);
  if (!match?.[1] || !match[2]) return undefined;
  const [name = '', shade = ''] = match[2].split('-');
  const value = TAILWIND_PALETTE[name]?.[shade];
  return value
    ? { prefix: match[1], key: match[2], value, gray: GRAY_FAMILIES.has(name) }
    : undefined;
}

/** A color utility and its theme key: `border-ring` → `ring`, `bg-primary` → `primary`. */
export const COLOR_UTILITY =
  /^(?:bg|text|border(?:-[xytrblse])?|ring|ring-offset|outline|fill|stroke|from|via|to|divide|accent|caret|decoration|placeholder|shadow)-(.+)$/;

/** `style` properties that take colors → the Tailwind prefix to use instead. */
export const STYLE_COLOR_PROPERTIES: Record<string, string | undefined> = {
  color: 'text',
  background: 'bg',
  backgroundColor: 'bg',
  borderColor: 'border',
  borderTopColor: 'border-t',
  borderRightColor: 'border-r',
  borderBottomColor: 'border-b',
  borderLeftColor: 'border-l',
  border: 'border',
  borderTop: 'border-t',
  borderRight: 'border-r',
  borderBottom: 'border-b',
  borderLeft: 'border-l',
  outline: 'outline',
  outlineColor: 'outline',
  fill: 'fill',
  stroke: 'stroke',
  caretColor: 'caret',
  accentColor: 'accent',
  textDecorationColor: 'decoration',
  boxShadow: undefined,
  textShadow: undefined,
  backgroundImage: undefined,
};

/**
 * The `STYLE_COLOR_PROPERTIES` entry for a CSS property in an arbitrary
 * property class (`background-color` → `backgroundColor`), or for any other
 * `*-color` property; undefined when the property takes no color.
 */
export function cssColorProperty(property: string): { prefix: string | undefined } | undefined {
  const name = property.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  if (name in STYLE_COLOR_PROPERTIES) return { prefix: STYLE_COLOR_PROPERTIES[name] };
  return property.endsWith('-color') ? { prefix: undefined } : undefined;
}

/** `style` spacing properties → Tailwind prefix. */
export const STYLE_SPACING_PROPERTIES: Record<string, string> = {
  padding: 'p',
  paddingTop: 'pt',
  paddingRight: 'pr',
  paddingBottom: 'pb',
  paddingLeft: 'pl',
  paddingInline: 'px',
  paddingBlock: 'py',
  paddingInlineStart: 'ps',
  paddingInlineEnd: 'pe',
  margin: 'm',
  marginTop: 'mt',
  marginRight: 'mr',
  marginBottom: 'mb',
  marginLeft: 'ml',
  marginInline: 'mx',
  marginBlock: 'my',
  marginInlineStart: 'ms',
  marginInlineEnd: 'me',
  gap: 'gap',
  rowGap: 'gap-y',
  columnGap: 'gap-x',
};

export const STYLE_RADIUS_PROPERTIES: Record<string, string> = {
  borderRadius: 'rounded',
  borderTopLeftRadius: 'rounded-tl',
  borderTopRightRadius: 'rounded-tr',
  borderBottomRightRadius: 'rounded-br',
  borderBottomLeftRadius: 'rounded-bl',
  borderStartStartRadius: 'rounded-ss',
  borderStartEndRadius: 'rounded-se',
  borderEndStartRadius: 'rounded-es',
  borderEndEndRadius: 'rounded-ee',
};

/** JSX attributes that take a color (`<svg fill>`, `<Icon color>`). */
export function isColorAttribute(name: string): boolean {
  return /^(color|fill|stroke|stopColor|stop-color|floodColor|flood-color|lightingColor|bgcolor)$|Color$/.test(
    name,
  );
}
