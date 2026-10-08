import type { Token } from '../types.js';

/**
 * What a color utility paints, which decides the tokens that fit it: `text-*`
 * wants a foreground, `bg-*` a surface, `border-*` a border color.
 */
export type ColorRole = 'text' | 'surface' | 'line';

/** The role of a Tailwind color prefix (`bg`, `text`, `border-t`); undefined for shadows and the like. */
export function colorRole(prefix: string | undefined): ColorRole | undefined {
  if (!prefix) return undefined;
  if (/^(?:text|fill|stroke|placeholder|caret|decoration)$/.test(prefix)) return 'text';
  if (/^(?:bg|from|via|to|ring-offset)$/.test(prefix)) return 'surface';
  if (/^(?:border(?:-[xytrblse])?|ring|inset-ring|outline|divide)$/.test(prefix)) return 'line';
  return undefined;
}

/**
 * Token families made for one part of the UI. `sidebar-accent` has the value
 * of `accent` and `chart-2` that of `muted-foreground`, but they only belong
 * in a sidebar or a chart.
 */
export type ScopedFamily = 'sidebar' | 'chart';

export function scopedFamily(token: Token): ScopedFamily | undefined {
  const family = /^(sidebar|chart)(?:-|$)/.exec(tokenKey(token))?.[1];
  return family === 'sidebar' || family === 'chart' ? family : undefined;
}

/** The scoped families code mentions: `app-sidebar.tsx`, `<SidebarMenuButton>`, `fill-chart-1`. */
export function scopesIn(...texts: (string | undefined)[]): Set<ScopedFamily> {
  const scopes = new Set<ScopedFamily>();
  for (const text of texts) {
    if (!text) continue;
    if (/sidebar/i.test(text)) scopes.add('sidebar');
    if (/chart/i.test(text)) scopes.add('chart');
  }
  return scopes;
}

type Kind = 'foreground' | 'surface' | 'line' | 'other';

/** `primary` for `--color-primary`, `text-muted` for the DTCG token `color.text.muted`. */
function tokenKey(token: Token): string {
  return (token.tailwind || token.name)
    .toLowerCase()
    .replace(/[.\s_]+/g, '-')
    .replace(/^colou?rs?-/, '');
}

/** Name segments that say what a token is for, checked in this order (`card-border` is a border). */
const KIND_WORDS: [Kind, string[]][] = [
  ['foreground', ['foreground', 'fg', 'text']],
  ['line', ['border', 'input', 'ring', 'outline', 'divider', 'separator']],
  [
    'surface',
    ['background', 'bg', 'surface', 'canvas', 'card', 'popover', 'muted', 'secondary', 'accent'],
  ],
];

/**
 * The name that says what a token is for: a sidebar's own palette mirrors the
 * core one, so `sidebar-accent` is an `accent` and `sidebar-foreground` a
 * `foreground`. shadcn/ui's sidebar surface is `--sidebar` (v4) or
 * `--sidebar-background` (v3).
 */
function roleKey(token: Token): string {
  const key = tokenKey(token);
  return key === 'sidebar' ? 'background' : key.replace(/^sidebar-/, '');
}

/** What a token is for, from its name: shadcn/ui's conventions and common DTCG names. */
function kindOf(key: string): Kind {
  const segments = key.split('-');
  for (const [kind, words] of KIND_WORDS) {
    if (segments.some((s) => words.includes(s))) return kind;
  }
  return 'other';
}

/** Tokens made for each role, in the order to prefer them when their values tie. */
const PREFERRED: Record<ColorRole, string[]> = {
  text: ['foreground', 'muted-foreground'],
  surface: ['background', 'muted', 'secondary', 'accent', 'card', 'popover'],
  line: ['border', 'input', 'ring'],
};

/** Plain text colors, as opposed to the text that goes on one surface (`card-foreground`). */
const GENERIC_TEXT =
  /^(?:muted-foreground|(?:foreground|text|fg)(?:-(?:default|base|primary|secondary|muted|subtle))?)$/;

export interface RoleFit {
  /**
   * 0: made for the role (`foreground` for text, `muted` for a background,
   * `border` for a border). 1: neutral to it (brand and status colors, the
   * text of a surface such as `primary-foreground`). 2: made for another
   * role (`text-border`, `bg-foreground`), never swapped in automatically.
   */
  tier: 0 | 1 | 2;
  /** Position among the role's preferred tokens, for ties. */
  rank: number;
}

export function roleFit(token: Token, role: ColorRole | undefined): RoleFit {
  if (!role) return { tier: 1, rank: 0 };
  const key = roleKey(token);
  const index = PREFERRED[role].indexOf(key);
  const rank = index === -1 ? PREFERRED[role].length : index;
  const kind = kindOf(key);
  switch (role) {
    case 'text':
      if (kind === 'foreground') return { tier: GENERIC_TEXT.test(key) ? 0 : 1, rank };
      return { tier: kind === 'other' ? 1 : 2, rank };
    case 'surface':
      return { tier: kind === 'surface' ? 0 : kind === 'foreground' ? 2 : 1, rank };
    case 'line':
      return { tier: kind === 'line' ? 0 : kind === 'other' ? 1 : 2, rank };
  }
}
