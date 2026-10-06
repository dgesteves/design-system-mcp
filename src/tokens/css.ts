import postcss, { type AtRule, type Container, type Declaration, type Rule } from 'postcss';

import type { Token, TokenCategory } from '../types.js';
import { parseColor } from './color.js';
import { usageFor } from './usage.js';

interface RawVar {
  name: string;
  value: string;
  line: number;
  comment?: string;
}

interface ThemeVar extends RawVar {
  inline: boolean;
}

/** Tailwind v4 theme namespaces → token category. Longest prefixes first. */
const NAMESPACES: [prefix: string, category: TokenCategory][] = [
  ['--color-', 'color'],
  ['--spacing-', 'spacing'],
  ['--radius-', 'radius'],
  ['--font-weight-', 'typography'],
  ['--font-', 'typography'],
  ['--text-', 'typography'],
  ['--tracking-', 'typography'],
  ['--leading-', 'typography'],
  ['--inset-shadow-', 'shadow'],
  ['--drop-shadow-', 'shadow'],
  ['--text-shadow-', 'shadow'],
  ['--shadow-', 'shadow'],
];

const TAILWIND_DEFAULT_SPACING = '0.25rem';

/**
 * Reads design tokens from CSS custom properties, the way shadcn/ui and
 * Tailwind v4 projects define them:
 *
 * - `:root { --primary: oklch(...) }` holds the values,
 * - `.dark { --primary: ... }` (or a dark media query / data attribute) holds modes,
 * - `@theme inline { --color-primary: var(--primary) }` exposes them to Tailwind.
 */
export function parseCssTokens(css: string, file: string): { tokens: Token[]; warnings: string[] } {
  const root = postcss.parse(css, { from: file });
  const base = new Map<string, RawVar>();
  const modes = new Map<string, Map<string, RawVar>>();
  const theme = new Map<string, ThemeVar>();
  const importsTailwind = root.nodes.some(
    (node) =>
      node.type === 'atrule' &&
      node.name === 'import' &&
      /["']tailwindcss(?:\/theme(?:\.css)?)?["']/.test(node.params),
  );

  root.walkDecls(/^--/, (decl) => {
    const raw: RawVar = {
      name: decl.prop,
      value: decl.value.trim(),
      line: decl.source?.start?.line ?? 1,
      ...withComment(decl),
    };
    const themeRule = closestAtRule(decl, 'theme');
    if (themeRule) {
      // `--color-*: initial` style resets clear Tailwind's defaults; they are not tokens.
      if (raw.value === 'initial' || raw.name.includes('*')) return;
      theme.set(raw.name, { ...raw, inline: /\binline\b/.test(themeRule.params) });
      return;
    }
    const mode = modeOf(decl);
    if (mode === undefined) return;
    if (mode === '') base.set(raw.name, raw);
    else {
      const map = modes.get(mode) ?? new Map<string, RawVar>();
      map.set(raw.name, raw);
      modes.set(mode, map);
    }
  });

  const lookup = (name: string): string | undefined =>
    base.get(name)?.value ?? theme.get(name)?.value;

  const tokens: Token[] = [];
  const consumed = new Set<string>();

  for (const variable of theme.values()) {
    const namespace = NAMESPACES.find(([prefix]) => variable.name.startsWith(prefix));
    const isSpacingBase = variable.name === '--spacing';
    if (!namespace && !isSpacingBase) continue;
    // `--text-sm--line-height` and friends are sub-properties of another token.
    if (/--[a-z-]+--/.test(variable.name.slice(2))) continue;
    const category = isSpacingBase ? 'spacing' : (namespace?.[1] ?? 'other');
    const tailwind = isSpacingBase ? '' : variable.name.slice(namespace?.[0].length ?? 0);
    const tailwindNamespace = isSpacingBase ? '--spacing' : (namespace?.[0].slice(0, -1) ?? '');

    const alias = /^var\(\s*(--[\w-]+)\s*\)$/.exec(variable.value)?.[1];
    const target = alias ? base.get(alias) : undefined;
    if (alias && target) {
      consumed.add(alias);
      tokens.push(
        finalize({
          name: alias.slice(2),
          category,
          value: resolveValue(target.value, lookup),
          modes: modeValues(alias, modes, lookup),
          cssVar: alias,
          tailwind,
          tailwindNamespace,
          description: target.comment ?? variable.comment,
          line: target.line,
          file,
        }),
      );
      continue;
    }
    tokens.push(
      finalize({
        name: variable.name.slice(2),
        category,
        value: variable.value,
        modes: modeValues(variable.name, modes, lookup),
        // Inline theme variables are compiled into utilities and never emitted as custom properties.
        cssVar: variable.inline ? undefined : variable.name,
        tailwind,
        tailwindNamespace,
        description: variable.comment,
        line: variable.line,
        file,
      }),
    );
  }

  for (const variable of base.values()) {
    if (consumed.has(variable.name)) continue;
    tokens.push(
      finalize({
        name: variable.name.slice(2),
        category: categorize(variable.name, resolveValue(variable.value, lookup)),
        value: resolveValue(variable.value, lookup),
        modes: modeValues(variable.name, modes, lookup),
        cssVar: variable.name,
        description: variable.comment,
        line: variable.line,
        file,
      }),
    );
  }

  if (importsTailwind && !theme.has('--spacing') && !base.has('--spacing')) {
    tokens.push({
      ...finalize({
        name: 'spacing',
        category: 'spacing',
        value: TAILWIND_DEFAULT_SPACING,
        cssVar: '--spacing',
        tailwind: '',
        tailwindNamespace: '--spacing',
        description: 'Tailwind spacing unit: p-4 = 4 × 0.25rem = 1rem.',
        line: 1,
        file,
      }),
      origin: 'tailwind-default',
    });
  }

  return { tokens, warnings: [] };
}

function finalize(input: {
  name: string;
  category: TokenCategory;
  value: string;
  modes?: Record<string, string> | undefined;
  cssVar?: string | undefined;
  tailwind?: string | undefined;
  tailwindNamespace?: string | undefined;
  description?: string | undefined;
  line: number;
  file: string;
}): Token {
  const token: Token = {
    name: input.name,
    category: input.category,
    value: input.value,
    usage: [],
    source: { file: input.file, line: input.line },
  };
  if (input.modes && Object.keys(input.modes).length) token.modes = input.modes;
  if (input.cssVar) token.cssVar = input.cssVar;
  if (input.tailwind !== undefined) token.tailwind = input.tailwind;
  if (input.description) token.description = input.description;
  token.usage = usageFor(token, input.tailwindNamespace);
  return token;
}

function categorize(name: string, value: string): TokenCategory {
  const n = name.toLowerCase();
  if (/radius|rounded|corner/.test(n)) return 'radius';
  if (/shadow|elevation/.test(n)) return 'shadow';
  if (/spacing|space|gap|gutter|inset|padding|margin/.test(n)) return 'spacing';
  if (/font|text-size|leading|line-height|tracking|letter-spacing|typography/.test(n)) {
    return 'typography';
  }
  if (parseColor(value)) return 'color';
  return 'other';
}

/** Follows plain `var(--x)` aliases so the token shows its concrete value. */
function resolveValue(
  value: string,
  lookup: (name: string) => string | undefined,
  depth = 0,
): string {
  const alias = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value)?.[1];
  if (!alias || depth > 16) return value;
  const next = lookup(alias);
  return next === undefined ? value : resolveValue(next, lookup, depth + 1);
}

function modeValues(
  name: string,
  modes: Map<string, Map<string, RawVar>>,
  lookup: (name: string) => string | undefined,
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [mode, vars] of modes) {
    const variable = vars.get(name);
    if (variable) out[mode] = resolveValue(variable.value, (n) => vars.get(n)?.value ?? lookup(n));
  }
  return Object.keys(out).length ? out : undefined;
}

function closestAtRule(node: Declaration, name: string): AtRule | undefined {
  let parent: Container | undefined = node.parent;
  while (parent) {
    if (parent.type === 'atrule' && (parent as AtRule).name === name) return parent as AtRule;
    parent = parent.parent as Container | undefined;
  }
  return undefined;
}

/**
 * The theme mode a declaration belongs to: `''` for the base theme, `"dark"`
 * for `.dark`, `[data-theme="dark"]` or `prefers-color-scheme: dark`, and
 * undefined for selectors that are not theme scopes (component-level vars).
 */
function modeOf(decl: Declaration): string | undefined {
  let media: string | undefined;
  let selector: string | undefined;
  let parent: Container | undefined = decl.parent;
  while (parent) {
    if (parent.type === 'rule' && selector === undefined) selector = (parent as Rule).selector;
    if (parent.type === 'atrule' && (parent as AtRule).name === 'media') {
      media = /prefers-color-scheme:\s*(\w+)/.exec((parent as AtRule).params)?.[1];
    }
    parent = parent.parent as Container | undefined;
  }
  if (selector === undefined) return undefined;
  const parts = selector.split(',').map((s) => s.trim());
  if (parts.every((s) => s === ':root' || s === 'html' || s === ':host')) {
    return media === 'dark' ? 'dark' : '';
  }
  for (const part of parts) {
    const attr = /\[data-(?:theme|mode|color-scheme)\s*=\s*["']?([\w-]+)["']?\]/.exec(part)?.[1];
    if (attr) return attr;
    const cls = /^(?::root|html)?\.([\w-]+)$/.exec(part)?.[1];
    if (cls) return cls;
  }
  return undefined;
}

function withComment(decl: Declaration): { comment?: string } {
  const prev = decl.prev();
  if (prev?.type === 'comment') {
    const text = prev.text.trim();
    if (text) return { comment: text };
  }
  return {};
}
