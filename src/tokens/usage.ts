import type { Token } from '../types.js';
import { isBareHsl } from './color.js';

/**
 * Ready-to-paste ways to use a token, most idiomatic first. With a Tailwind
 * theme key that is the utility class; otherwise the custom property.
 */
export function usageFor(token: Token, tailwindNamespace?: string): string[] {
  const usage: string[] = [];
  const key = token.tailwind;
  if (key !== undefined && tailwindNamespace) usage.push(...utilities(tailwindNamespace, key));
  const reference = cssReference(token);
  if (reference) usage.push(reference);
  return usage;
}

/**
 * The CSS value that uses the token: `var(--primary)`, or `hsl(var(--primary))`
 * when the property holds bare HSL channels (Tailwind v3), which are no color
 * on their own.
 */
export function cssReference(token: Token): string | undefined {
  if (!token.cssVar) return undefined;
  return token.category === 'color' && isBareHsl(token.value)
    ? `hsl(var(${token.cssVar}))`
    : `var(${token.cssVar})`;
}

function utilities(namespace: string, key: string): string[] {
  switch (namespace) {
    case '--color':
      if (/(^|-)foreground$/.test(key)) return [`text-${key}`];
      if (/^(border|input)$/.test(key)) return [`border-${key}`];
      if (key === 'ring') return [`ring-${key}`, `outline-${key}`];
      return [`bg-${key}`, `text-${key}`, `border-${key}`];
    case '--spacing':
      return key ? [`p-${key}`, `gap-${key}`, `m-${key}`] : ['p-4', 'gap-2', 'm-1'];
    case '--radius':
      return [`rounded-${key}`];
    case '--font':
      return [`font-${key}`];
    case '--font-weight':
      return [`font-${key}`];
    case '--text':
      return [`text-${key}`];
    case '--tracking':
      return [`tracking-${key}`];
    case '--leading':
      return [`leading-${key}`];
    case '--shadow':
      return [`shadow-${key}`];
    case '--inset-shadow':
      return [`inset-shadow-${key}`];
    case '--drop-shadow':
      return [`drop-shadow-${key}`];
    case '--text-shadow':
      return [`text-shadow-${key}`];
    default:
      return [];
  }
}
