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
  important: boolean;
  negative: boolean;
  /** Utility without variants, `!`, `-` and `/modifier`: `bg-[#fff]`, `p-4`. */
  base: string;
  /** `/50` opacity or line-height modifier, including the slash. */
  modifier: string;
  /** For arbitrary values: the part before `-[`, e.g. `bg`, `px`, `rounded-t`. */
  prefix?: string;
  /** For arbitrary values: the content of `[...]` with `_` turned into spaces. */
  arbitrary?: string;
}

/** Parses `md:hover:!-mt-[3px]/50` style utilities. */
export function parseUtility(cls: string): Utility {
  const parts = splitTopLevel(cls, ':');
  let base = parts.pop() ?? '';
  const variants = parts;
  let important = false;
  if (base.startsWith('!')) {
    important = true;
    base = base.slice(1);
  } else if (base.endsWith('!')) {
    important = true;
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
  return utility;
}

/** Rebuilds a class from a parsed utility with a new base: keeps variants, `!`, `-` and modifier. */
export function withBase(utility: Utility, base: string): string {
  const variants = utility.variants.length ? `${utility.variants.join(':')}:` : '';
  return `${variants}${utility.important ? '!' : ''}${utility.negative ? '-' : ''}${base}${utility.modifier}`;
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

/** `bg-blue-500` → `{ prefix: 'bg', key: 'blue-500', value: 'oklch(...)' }`. */
export function paletteColor(
  base: string,
): { prefix: string; key: string; value: string } | undefined {
  const match = PALETTE_CLASS.exec(base);
  if (!match?.[1] || !match[2]) return undefined;
  const [name = '', shade = ''] = match[2].split('-');
  const value = TAILWIND_PALETTE[name]?.[shade];
  return value ? { prefix: match[1], key: match[2], value } : undefined;
}

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
