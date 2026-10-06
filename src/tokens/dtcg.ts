import type { Token, TokenCategory } from '../types.js';
import { usageFor } from './usage.js';

/**
 * Parser for the W3C Design Tokens Community Group format
 * (https://www.designtokens.org/tr/drafts/format/). Supports both the stable
 * object values (`{ colorSpace, components }`, `{ value, unit }`) and the
 * older string values (`"#ff0000"`, `"16px"`), `$type` inheritance from
 * groups, `{alias.references}`, `$ref` pointers, and `$deprecated`.
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

interface RawToken {
  path: string[];
  value: Json;
  type?: string;
  description?: string;
  deprecated?: string | true;
  modes?: Record<string, Json>;
  line: number;
}

export interface DtcgOptions {
  /** Prefix for generated custom property names: `ds` → `--ds-color-primary`. */
  prefix?: string;
}

export function parseDtcgTokens(
  text: string,
  file: string,
  options: DtcgOptions = {},
): { tokens: Token[]; warnings: string[] } {
  const warnings: string[] = [];
  let json: Json;
  try {
    json = JSON.parse(text) as Json;
  } catch (error) {
    return { tokens: [], warnings: [`${file}: invalid JSON (${(error as Error).message})`] };
  }
  if (!isObject(json)) return { tokens: [], warnings: [`${file}: expected a JSON object`] };

  const lines = lineIndex(text);
  const raw: RawToken[] = [];
  walk(json, [], undefined, raw, lines);
  const byPath = new Map(raw.map((t) => [t.path.join('.'), t]));

  const resolve = (value: Json, seen: Set<string>): Json => {
    if (typeof value === 'string') {
      const alias = /^\{([^{}]+)\}$/.exec(value)?.[1];
      if (alias) {
        const target = byPath.get(alias);
        if (!target) {
          warnings.push(`${file}: unresolved alias {${alias}}`);
          return value;
        }
        if (seen.has(alias)) {
          warnings.push(`${file}: circular alias {${alias}}`);
          return value;
        }
        return resolve(target.value, new Set([...seen, alias]));
      }
      return value;
    }
    if (Array.isArray(value)) return value.map((v) => resolve(v, seen));
    if (isObject(value)) {
      const ref = value.$ref;
      if (typeof ref === 'string' && Object.keys(value).length === 1) {
        const pointer = ref
          .replace(/^#\//, '')
          .split('/')
          .filter((p) => p !== '$value');
        return resolve(`{${pointer.join('.')}}`, seen);
      }
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, seen)]));
    }
    return value;
  };

  const tokens = raw.map((t): Token => {
    const name = t.path.join('.');
    const aliasOf = typeof t.value === 'string' ? /^\{([^{}]+)\}$/.exec(t.value)?.[1] : undefined;
    const type = t.type ?? (aliasOf ? byPath.get(aliasOf)?.type : undefined);
    const value = formatValue(resolve(t.value, new Set([name])), type);
    const token: Token = {
      name,
      category: categorize(type, t.path),
      value,
      cssVar: `--${[options.prefix, ...t.path]
        .filter(Boolean)
        .join('-')
        .replace(/[^\w-]+/g, '-')}`,
      usage: [],
      source: { file, line: t.line },
    };
    if (aliasOf) token.aliasOf = aliasOf;
    if (t.description) token.description = t.description;
    if (t.deprecated) token.deprecated = t.deprecated;
    if (t.modes) {
      token.modes = Object.fromEntries(
        Object.entries(t.modes).map(([mode, v]) => [
          mode,
          formatValue(resolve(v, new Set([name])), type),
        ]),
      );
    }
    token.usage = usageFor(token);
    return token;
  });

  return { tokens, warnings };
}

function walk(
  node: JsonObject,
  path: string[],
  inheritedType: string | undefined,
  out: RawToken[],
  lines: (path: string[]) => number,
): void {
  const type = typeof node.$type === 'string' ? node.$type : inheritedType;
  if ('$value' in node) {
    const token: RawToken = { path, value: node.$value ?? null, line: lines(path) };
    if (type) token.type = type;
    if (typeof node.$description === 'string') token.description = node.$description;
    if (node.$deprecated === true) token.deprecated = true;
    else if (typeof node.$deprecated === 'string') token.deprecated = node.$deprecated;
    const modes = modesOf(node.$extensions);
    if (modes) token.modes = modes;
    out.push(token);
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$') || !isObject(child)) continue;
    walk(child, [...path, key], type, out, lines);
  }
}

/** Modes are not standardised yet; accept the common `$extensions.mode(s)` shape. */
function modesOf(extensions: Json | undefined): Record<string, Json> | undefined {
  if (!isObject(extensions)) return undefined;
  for (const key of ['modes', 'mode']) {
    const value = extensions[key];
    if (isObject(value)) return value;
  }
  return undefined;
}

function categorize(type: string | undefined, path: string[]): TokenCategory {
  const p = path.join('.').toLowerCase();
  switch (type) {
    case 'color':
      return 'color';
    case 'shadow':
      return 'shadow';
    case 'fontFamily':
    case 'fontWeight':
    case 'typography':
    case 'letterSpacing':
    case 'lineHeight':
      return 'typography';
    case 'dimension':
    case 'number':
      if (/radius|radii|rounded|corner/.test(p)) return 'radius';
      if (/font|text|typography|line-?height|letter-?spacing|leading|tracking/.test(p)) {
        return 'typography';
      }
      if (/spac|gap|padding|margin|inset|gutter|space/.test(p)) return 'spacing';
      return 'other';
    default:
      if (/colou?r/.test(p)) return 'color';
      return 'other';
  }
}

function formatValue(value: Json, type: string | undefined): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return '';
  if (Array.isArray(value)) {
    if (type === 'cubicBezier') {
      return `cubic-bezier(${value.map((v) => formatValue(v, undefined)).join(', ')})`;
    }
    if (type === 'fontFamily') return value.map((v) => formatValue(v, undefined)).join(', ');
    return value.map((v) => formatValue(v, type)).join(', ');
  }
  if (type === 'color' || ('colorSpace' in value && 'components' in value)) {
    return formatColor(value);
  }
  if ('value' in value && 'unit' in value) {
    return `${formatValue(value.value ?? '', undefined)}${formatValue(value.unit ?? '', undefined)}`;
  }
  if (type === 'shadow') {
    const s = value;
    return [s.offsetX, s.offsetY, s.blur, s.spread, s.color]
      .filter((v) => v !== undefined)
      .map((v) => formatValue(v ?? '', undefined))
      .join(' ');
  }
  return Object.entries(value)
    .map(([k, v]) => `${k}: ${formatValue(v, undefined)}`)
    .join('; ');
}

const COLOR_SPACES: Record<string, (c: string[]) => string> = {
  srgb: ([r, g, b]) => `rgb(${pct255(r)} ${pct255(g)} ${pct255(b)}`,
  hsl: ([h, s, l]) => `hsl(${h} ${s}% ${l}%`,
  hwb: ([h, w, b]) => `hwb(${h} ${w}% ${b}%`,
  lab: ([l, a, b]) => `lab(${l} ${a} ${b}`,
  lch: ([l, c, h]) => `lch(${l} ${c} ${h}`,
  oklab: ([l, a, b]) => `oklab(${l} ${a} ${b}`,
  oklch: ([l, c, h]) => `oklch(${l} ${c} ${h}`,
};

function formatColor(value: JsonObject): string {
  const alpha = typeof value.alpha === 'number' && value.alpha < 1 ? value.alpha : undefined;
  if (typeof value.hex === 'string' && alpha === undefined) return value.hex;
  const space = typeof value.colorSpace === 'string' ? value.colorSpace : 'srgb';
  const components = Array.isArray(value.components)
    ? value.components.map((c) => formatValue(c, undefined))
    : [];
  const make = COLOR_SPACES[space];
  const body = make ? make(components) : `color(${space} ${components.join(' ')}`;
  return `${body}${alpha === undefined ? '' : ` / ${alpha}`})`;
}

function pct255(component: string | undefined): string {
  if (component === undefined || component === 'none') return 'none';
  return String(Math.round(Number(component) * 255));
}

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Best-effort line numbers for token paths: finds each key in order, scoped to
 * where its parent key was found. Good enough for `file:line` references.
 */
function lineIndex(text: string): (path: string[]) => number {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
  const lineAt = (offset: number) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((lineStarts[mid] ?? 0) <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  return (path) => {
    let offset = 0;
    for (const key of path) {
      const found = text.indexOf(JSON.stringify(key), offset);
      if (found === -1) break;
      offset = found;
    }
    return lineAt(offset);
  };
}
