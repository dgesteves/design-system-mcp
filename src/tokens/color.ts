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

/** Parses any CSS color (hex, rgb(), hsl(), oklch(), named, ...) into OKLCH. */
export function parseColor(value: string): Oklch | undefined {
  const text = value.trim();
  if (!text || KEYWORDS.has(text.toLowerCase()) || text.includes('var(')) return undefined;
  const parsed = parse(text);
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

/** Formats a ΔE value the way it reads best in a diagnostic. */
export function formatDeltaE(deltaE: number): string {
  return deltaE < 0.0005 ? 'exact match' : `ΔE ${deltaE.toFixed(3)}`;
}
