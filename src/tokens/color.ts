import {
  clampChroma,
  colorsNamed,
  converter,
  differenceEuclidean,
  formatHex,
  parse,
  type Oklch,
} from 'culori';

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
 * Chroma from which a color reads as a hue at any lightness. Tailwind's grays,
 * slate to taupe, stay below 0.046; its colors pass 0.05 by shade 200.
 */
const TINT_CHROMA = 0.05;
/**
 * Pale colors have little chroma to give, so below TINT_CHROMA a light color's
 * hue is told by its chroma relative to the most sRGB allows at that lightness
 * and hue. `#fef2f2` (red-50) has 0.013 of a possible 0.014; Tailwind's light
 * grays reach at most 0.44 of theirs (slate-100), its palest hues start at
 * 0.64 (teal-50). Near black the measure says little (slate-950 and shadcn's
 * v3 dark background would read as blue), so it applies from TINT_LIGHTNESS up.
 */
const TINT_RELATIVE = 0.55;
const TINT_LIGHTNESS = 0.7;
/** Below this chroma the hue angle is rounding noise. */
const MIN_CHROMA = 0.005;
/**
 * Hues further apart than this are different colors. Within a Tailwind family
 * the hue drifts by up to 15° from shade to shade; neighbouring families at the
 * same shade are 12–25° apart (red-500 and orange-500 by 22°).
 */
export const HUE_TOLERANCE = 15;
/**
 * Status colors (destructive, warning, success, info) say what happened, so they
 * replace a color only of nearly the same hue: red-400 to red-950 for a
 * red-600 `destructive`, but not orange-600, 14° away.
 */
export const STATUS_HUE_TOLERANCE = 8;

const maxChromas = new Map<string, number>();

/** The highest chroma sRGB can show at this lightness and hue. */
function maxChroma(l: number, h: number): number {
  const key = `${l.toFixed(3)}:${h.toFixed(1)}`;
  let max = maxChromas.get(key);
  if (max === undefined) {
    max = clampChroma({ mode: 'oklch', l: Math.min(1, Math.max(0, l)), c: 0.4, h }, 'oklch').c;
    maxChromas.set(key, max);
  }
  return max;
}

/** Whether a color reads as a hue rather than a gray, however pale or dark it is. */
export function isTinted(color: Oklch): boolean {
  if (color.c >= TINT_CHROMA) return true;
  if (color.c < MIN_CHROMA || color.h === undefined || color.l < TINT_LIGHTNESS) return false;
  const max = maxChroma(color.l, color.h);
  return max > 0 && color.c / max >= TINT_RELATIVE;
}

/** The angle between two hues, 0–180°; 0 when either is a gray. */
export function hueDistance(a: Oklch, b: Oklch): number {
  if (a.h === undefined || b.h === undefined) return 0;
  const diff = Math.abs(a.h - b.h) % 360;
  return Math.min(diff, 360 - diff);
}

/**
 * Whether `token` can stand in for `color` without changing what it is: both
 * grays, or both hues within `tolerance`. ΔE alone does not say it: a pale
 * yellow is 0.07 from a light gray. `tinted` overrides the test for the source,
 * so a pale `bg-sky-50` counts as blue whatever its chroma.
 */
export function sameHue(
  color: Oklch,
  token: Oklch,
  tinted = isTinted(color),
  tolerance = HUE_TOLERANCE,
): boolean {
  if (tinted !== isTinted(token)) return false;
  return !tinted || hueDistance(color, token) <= tolerance;
}

/** Formats a ΔE value the way it reads best in a diagnostic. */
export function formatDeltaE(deltaE: number): string {
  return deltaE < 0.0005 ? 'exact match' : `ΔE ${deltaE.toFixed(3)}`;
}
