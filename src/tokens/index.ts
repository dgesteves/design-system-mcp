import fs from 'node:fs/promises';
import path from 'node:path';

import type { Token, TokenCategory } from '../types.js';
import { relativePath } from '../util/paths.js';
import { colorDistance, parseColor, type Oklch } from './color.js';
import { cssSheetTokens, readCssSheet, type CssSheet } from './css.js';
import { parseDtcgTokens, type DtcgOptions } from './dtcg.js';
import { evaluateLength, lengthToPx } from './units.js';

export { parseCssTokens } from './css.js';
export { parseDtcgTokens } from './dtcg.js';

export interface TokenSource {
  file: string;
  /** DTCG only: prefix for generated custom property names. */
  prefix?: string | undefined;
}

export async function loadTokens(
  root: string,
  sources: TokenSource[],
): Promise<{ tokens: Token[]; warnings: string[] }> {
  const warnings: string[] = [];
  const all: Token[] = [];
  // Stylesheets form one theme (`.dark` in one file, `:root` in another), so
  // they become tokens together, where the first of them was listed.
  const sheets: CssSheet[] = [];
  let sheetsAt: number | undefined;
  for (const source of sources) {
    const rel = relativePath(root, source.file);
    let text: string;
    try {
      text = await fs.readFile(source.file, 'utf8');
    } catch {
      warnings.push(`${rel}: token file not found`);
      continue;
    }
    const ext = path.extname(source.file).toLowerCase();
    try {
      if (ext === '.json') {
        const options: DtcgOptions = source.prefix ? { prefix: source.prefix } : {};
        const result = parseDtcgTokens(text, rel, options);
        all.push(...result.tokens);
        warnings.push(...result.warnings);
      } else {
        sheets.push(readCssSheet(text, rel));
        sheetsAt ??= all.length;
      }
    } catch (error) {
      warnings.push(`${rel}: could not parse tokens (${(error as Error).message})`);
    }
  }
  if (sheets.length) {
    const result = cssSheetTokens(sheets);
    all.splice(sheetsAt ?? all.length, 0, ...result.tokens);
    warnings.push(...result.warnings);
  }
  return { tokens: mergeTokens(all), warnings };
}

/**
 * DTCG files and the CSS generated from them often describe the same tokens.
 * Merge entries that share a custom property: keep the DTCG name and
 * description, and add the Tailwind mapping from CSS.
 */
export function mergeTokens(tokens: Token[]): Token[] {
  // Tailwind's built-in defaults (`--spacing`) only stand in until the project
  // sets its own value, in whichever file that is.
  const overridden = new Set(
    tokens.filter((t) => t.origin !== 'tailwind-default').map((t) => themeKey(t)),
  );
  const byVar = new Map<string, Token>();
  const out: Token[] = [];
  for (const token of tokens) {
    if (token.origin === 'tailwind-default' && overridden.has(themeKey(token))) continue;
    const existing = token.cssVar ? byVar.get(token.cssVar) : undefined;
    if (!existing) {
      if (token.cssVar) byVar.set(token.cssVar, token);
      out.push(token);
      continue;
    }
    if (existing.tailwind === undefined && token.tailwind !== undefined) {
      existing.tailwind = token.tailwind;
    }
    existing.usage = [...new Set([...token.usage, ...existing.usage])];
    existing.description ??= token.description;
    if (token.modes) existing.modes = { ...token.modes, ...existing.modes };
  }
  return out;
}

/** `spacing:` for `--spacing`, `radius:md` for `--radius-md`: what a Tailwind class resolves to. */
function themeKey(token: Token): string {
  return token.tailwind === undefined ? '' : `${token.category}:${token.tailwind}`;
}

export interface ColorCandidate {
  token: Token;
  color: Oklch;
}

export interface LengthCandidate {
  token: Token;
  px: number;
  /** Tailwind key for the step (`3` for `p-3`, `md` for `rounded-md`), if any. */
  key?: string;
}

export interface Nearest<T> {
  candidate: T;
  distance: number;
}

export interface NearestLength extends Nearest<LengthCandidate> {
  /** A radius so far above the scale that it means "fully rounded" (`rounded-full`). */
  pill?: boolean;
}

/** Radius values from here up are pills (`9999px`, `rounded-full`), not sizes. */
const PILL_PX = 1000;
/**
 * A radius this many times the largest finite step reads as "fully rounded":
 * `rounded-[100px]` or `[999px]` is a pill, not a large `rounded-4xl`.
 */
const PILL_FACTOR = 3;

/**
 * `rounded-full` is a static utility rather than a theme variable. 9999px is
 * the conventional way to write it by hand (and its Tailwind v3 value).
 */
const ROUNDED_FULL: Token = {
  name: 'radius-full',
  category: 'radius',
  value: 'calc(infinity * 1px)',
  tailwind: 'full',
  usage: ['rounded-full'],
  origin: 'tailwind-default',
  source: { file: '', line: 0 },
};

/** Query helpers over the token list: lookups and nearest-token search. */
export class TokenIndex {
  readonly colors: ColorCandidate[] = [];
  readonly spacing: LengthCandidate[] = [];
  readonly radius: LengthCandidate[] = [];
  /** Tailwind color keys the design system defines (`primary`, `muted-foreground`). */
  readonly colorKeys = new Set<string>();
  /** Base unit when spacing follows Tailwind's multiplier model. */
  readonly spacingUnitPx: number | undefined;
  private readonly spacingUnit: Token | undefined;
  private readonly byVar = new Map<string, Token>();

  constructor(readonly tokens: Token[]) {
    for (const token of tokens) if (token.cssVar) this.byVar.set(token.cssVar, token);
    const resolve = (name: string) => this.byVar.get(name)?.value;

    let unit: number | undefined;
    for (const token of tokens) {
      if (token.category === 'color') {
        const color = parseColor(token.value);
        if (color) this.colors.push({ token, color });
        if (token.tailwind) this.colorKeys.add(token.tailwind);
      } else if (token.category === 'spacing' || token.category === 'radius') {
        const px = evaluateLength(token.value, resolve);
        if (px === undefined) continue;
        if (token.category === 'spacing' && token.tailwind === '') {
          unit = px;
          continue;
        }
        const list = token.category === 'spacing' ? this.spacing : this.radius;
        const candidate: LengthCandidate = { token, px };
        if (token.tailwind) candidate.key = token.tailwind;
        list.push(candidate);
      }
    }
    this.spacingUnitPx = unit;
    if (unit !== undefined) {
      this.spacingUnit = tokens.find((t) => t.category === 'spacing' && t.tailwind === '');
    }
    if (this.radius.some((c) => c.key !== undefined)) {
      this.radius.push({ token: ROUNDED_FULL, px: 9999, key: 'full' });
    }
  }

  has(category: TokenCategory): boolean {
    if (category === 'color') return this.colors.length > 0;
    if (category === 'spacing') return this.spacing.length > 0 || this.spacingUnit !== undefined;
    if (category === 'radius') return this.radius.length > 0;
    return this.tokens.some((t) => t.category === category);
  }

  byCssVar(name: string): Token | undefined {
    return this.byVar.get(name);
  }

  nearestColor(color: Oklch, limit = 3): Nearest<ColorCandidate>[] {
    return this.colors
      .map((candidate) => ({ candidate, distance: colorDistance(color, candidate.color) }))
      .sort(
        (a, b) => a.distance - b.distance || preferTailwind(a.candidate.token, b.candidate.token),
      )
      .slice(0, limit);
  }

  /** The step closest to the magnitude of `px`; callers keep the sign. */
  nearestLength(category: 'spacing' | 'radius', px: number): NearestLength | undefined {
    const target = Math.abs(px);
    let list =
      category === 'spacing' ? [...this.spacing, ...this.spacingSteps(target)] : this.radius;
    let pill = false;
    if (category === 'radius') {
      // Far above the largest finite step, a radius means "fully rounded":
      // the pill tokens are the answer, and below that they never are.
      const finite = list.filter((c) => c.px < PILL_PX);
      const pills = list.filter((c) => c.px >= PILL_PX);
      const largest = Math.max(0, ...finite.map((c) => c.px));
      pill =
        pills.length > 0 &&
        finite.length > 0 &&
        (target >= PILL_FACTOR * largest || target >= PILL_PX);
      list = pill || !finite.length ? pills : finite;
    }
    let best: NearestLength | undefined;
    for (const candidate of list) {
      const distance = Math.abs(candidate.px - target);
      if (
        !best ||
        distance < best.distance - 1e-9 ||
        (Math.abs(distance - best.distance) < 1e-9 &&
          preferTailwind(candidate.token, best.candidate.token) < 0)
      ) {
        best = { candidate, distance };
      }
    }
    if (best && pill) best.pill = true;
    return best;
  }

  /**
   * Tailwind v4 derives `p-<n>` from `--spacing` for any n. Whole and half
   * steps (`p-13`, `p-4.5`) count as the scale, plus the static `p-px`;
   * quarter steps are valid but off-grid, like the arbitrary values they replace.
   */
  private spacingSteps(px: number): LengthCandidate[] {
    const unit = this.spacingUnitPx;
    const token = this.spacingUnit;
    if (!unit || !token) return [];
    const lower = Math.floor((px / unit) * 2) / 2;
    const upper = Math.ceil((px / unit) * 2) / 2;
    return [
      { token, px: 1, key: 'px' },
      ...[...new Set([lower, upper])].map((n) => ({ token, px: n * unit, key: String(n) })),
    ];
  }

  /** px value of a token-like length string, resolving `var()` against the token set. */
  toPx(value: string): number | undefined {
    return lengthToPx(value) ?? evaluateLength(value, (name) => this.byVar.get(name)?.value);
  }
}

function preferTailwind(a: Token, b: Token): number {
  return Number(b.tailwind !== undefined) - Number(a.tailwind !== undefined);
}
