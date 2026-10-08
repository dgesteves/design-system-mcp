import { colorsNamed, converter, differenceEuclidean, formatHex, parse, type Oklch } from 'culori';

const toOklch = converter('oklch');
/**
 * Euclidean distance in OKLCH with hue handled as an angle, which is ΔE in
 * OKLab: perceptually uniform, so "nearest token" means nearest to the eye.
 */
const okDistance = differenceEuclidean('oklch');

const KEYWORDS = new Set([
  'transparent',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer',
  'none',
]);

export type { Oklch };

/**
 * HSL channels without the function, `214.3 31.8% 91.4%` (commas, `deg` and
 * `/ alpha` allowed): how Tailwind v3 projects, and shadcn/ui before v4, store
 * colors, to be used as `hsl(var(--border))`.
 */
const BARE_HSL =
  /^(-?\d*\.?\d+)(deg)?(?:\s*,\s*|\s+)(\d*\.?\d+)%(?:\s*,\s*|\s+)(\d*\.?\d+)%(?:\s*\/\s*(\d*\.?\d+%?))?$/;

export function isBareHsl(value: string): boolean {
  return BARE_HSL.test(value.trim());
}

/**
 * Parses any CSS color (hex, rgb(), hsl(), oklch(), named, ...) into OKLCH.
 * With `bareHsl`, for token values, HSL channels count too: in a stylesheet
 * they can only be a color, while in a class or style they are not one.
 */
export function parseColor(value: string, options: { bareHsl?: boolean } = {}): Oklch | undefined {
  const text = value.trim();
  if (!text || KEYWORDS.has(text.toLowerCase()) || text.includes('var(')) return undefined;
  let parsed = parse(text);
  const hsl = !parsed && options.bareHsl ? BARE_HSL.exec(text) : null;
  if (hsl) {
    const [, h, deg = '', s, l, alpha] = hsl;
    parsed = parse(`hsl(${h}${deg} ${s}% ${l}%${alpha ? ` / ${alpha}` : ''})`);
  }
  return parsed ? toOklch(parsed) : undefined;
}

export function colorDistance(a: Oklch, b: Oklch): number {
  return okDistance(a, b);
}

export function toHex(color: Oklch): string {
  return formatHex(color);
}

export function isNamedColor(value: string): boolean {
  return Object.hasOwn(colorsNamed, value.toLowerCase());
}

/** Color literals inside arbitrary CSS text: hex (not `url(#id)` references) and color functions. */
const COLOR_LITERAL =
  /(?<!url\(\s*["']?)#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z_-])|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*(?:\([^()]*\)[^()]*)*\)/g;

export interface ColorMatch {
  text: string;
  index: number;
  color: Oklch;
}

/** Finds hex and functional color literals in `text` (named colors are not matched). */
export function findColorLiterals(text: string): ColorMatch[] {
  const matches: ColorMatch[] = [];
  for (const match of text.matchAll(COLOR_LITERAL)) {
    const color = parseColor(match[0]);
    if (color) matches.push({ text: match[0], index: match.index, color });
  }
  return matches;
}

/** Below this ΔE two colors are indistinguishable in practice. */
export const SAME_COLOR = 0.02;
/** Above this ΔE the nearest token is a different color, so no mechanical fix is offered. */
export const CLOSE_COLOR = 0.1;
/**
 * Chroma from which a color reads as a hue rather than a gray. Tailwind's
 * grays, slate to taupe, stay below 0.046; its colors pass 0.05 by shade 200.
 */
const TINT_CHROMA = 0.05;
/** Hues further apart than this are different colors: red and orange are 22° apart, red and amber 45°. */
const HUE_TOLERANCE = 30;

export function isTinted(color: Oklch): boolean {
  return color.c >= TINT_CHROMA;
}

/**
 * Whether `token` can stand in for `color` without changing what it is: both
 * grays, or both hues within HUE_TOLERANCE. ΔE alone does not say it: a pale
 * yellow is 0.07 from a light gray. `tinted` overrides the chroma test for the
 * source, so a pale `bg-sky-50` still counts as blue.
 */
export function sameHue(color: Oklch, token: Oklch, tinted = isTinted(color)): boolean {
  if (tinted !== isTinted(token)) return false;
  if (!tinted || color.h === undefined || token.h === undefined) return true;
  const diff = Math.abs(color.h - token.h) % 360;
  return Math.min(diff, 360 - diff) <= HUE_TOLERANCE;
}

/** Formats a ΔE value the way it reads best in a diagnostic. */
export function formatDeltaE(deltaE: number): string {
  return deltaE < 0.0005 ? 'exact match' : `ΔE ${deltaE.toFixed(3)}`;
}
