/** Root font size used to convert rem/em to px for comparisons. */
export const ROOT_FONT_SIZE = 16;

const LENGTH = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem|em)?$/i;

/** `"0.5rem"` → 8, `"12px"` → 12, `"4"` → 4. Returns undefined for anything else. */
export function lengthToPx(value: string | number): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const match = LENGTH.exec(value.trim());
  if (!match) return undefined;
  const n = Number(match[1]);
  const unit = (match[2] ?? 'px').toLowerCase();
  return unit === 'px' ? n : n * ROOT_FONT_SIZE;
}

export function formatPx(px: number): string {
  return `${Number(px.toFixed(2))}px`;
}

type Resolve = (name: string) => string | undefined;

/**
 * Evaluates a length that may use `var()` and `calc()` to px:
 * `calc(var(--radius) - 4px)` with `--radius: 0.625rem` → 6.
 */
export function evaluateLength(value: string, resolve: Resolve, depth = 0): number | undefined {
  if (depth > 16) return undefined;
  const expanded = expandVars(value.trim(), resolve, depth);
  if (expanded === undefined) return undefined;
  const direct = lengthToPx(expanded);
  if (direct !== undefined) return direct;
  const calc = /^calc\((.*)\)$/is.exec(expanded);
  return calc?.[1] !== undefined ? evaluateCalc(calc[1]) : undefined;
}

function expandVars(value: string, resolve: Resolve, depth: number): string | undefined {
  let out = '';
  let last = 0;
  for (const match of value.matchAll(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g)) {
    const [whole, name = '', fallback] = match;
    const resolved = resolve(name) ?? fallback;
    const px = resolved === undefined ? undefined : evaluateLength(resolved, resolve, depth + 1);
    if (px === undefined) return undefined;
    out += `${value.slice(last, match.index)}${px}px`;
    last = match.index + whole.length;
  }
  return out + value.slice(last);
}

/** Tiny recursive-descent evaluator for `+ - * /` over px/rem/em/unitless numbers. */
function evaluateCalc(expression: string): number | undefined {
  const tokens = expression.match(/-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em)?|[()+\-*/]|calc/gi);
  if (!tokens) return undefined;
  let i = 0;
  type Value = { n: number; length: boolean };

  const primary = (): Value | undefined => {
    const token = tokens[i++];
    if (token === undefined) return undefined;
    if (token.toLowerCase() === 'calc') return primary();
    if (token === '(') {
      const v = sum();
      i++; // ')'
      return v;
    }
    const px = lengthToPx(token);
    if (px === undefined) return undefined;
    return { n: px, length: /[a-z]$/i.test(token) };
  };
  const product = (): Value | undefined => {
    let left = primary();
    while (left && (tokens[i] === '*' || tokens[i] === '/')) {
      const op = tokens[i++];
      const right = primary();
      if (!right) return undefined;
      left =
        op === '*'
          ? { n: left.n * right.n, length: left.length || right.length }
          : { n: left.n / right.n, length: left.length };
    }
    return left;
  };
  const sum = (): Value | undefined => {
    let left = product();
    while (left && (tokens[i] === '+' || tokens[i] === '-')) {
      const op = tokens[i++];
      const right = product();
      if (!right) return undefined;
      left = { n: op === '+' ? left.n + right.n : left.n - right.n, length: true };
    }
    return left;
  };

  const result = sum();
  return result && Number.isFinite(result.n) ? result.n : undefined;
}
