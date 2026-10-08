import vm from 'node:vm';

import type { CheckResult } from '@dgesteves/design-system-mcp';

/**
 * The playground's check endpoint, kept apart from the route so it can be tested with its own
 * clock, limits and checker. The code it receives is only ever parsed by TypeScript's parser,
 * never run, and the file name it is checked under is fixed, so input never reaches a path.
 */

export type ErrorCode =
  | 'invalid_json'
  | 'invalid_request'
  | 'too_large'
  | 'too_complex'
  | 'rate_limited'
  | 'timeout'
  | 'internal';

export interface CheckError {
  error: { code: ErrorCode; message: string };
}

export interface CheckResponse extends CheckResult {
  /** How long the check took on the server, in milliseconds. */
  ms: number;
}

export interface RateLimiter {
  /** Counts a request from `key`; says when to retry once the key is over its limit. */
  take(key: string): { ok: true } | { ok: false; retryAfterSeconds: number };
}

/**
 * A sliding window per key, in memory. Each server instance counts on its own, which is
 * enough to stop a loop hammering one instance; it is not a quota.
 */
export function createRateLimiter({
  requests,
  windowMs,
  now = Date.now,
  maxKeys = 10_000,
}: {
  requests: number;
  windowMs: number;
  now?: () => number;
  maxKeys?: number;
}): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    take(key) {
      const time = now();
      const recent = (hits.get(key) ?? []).filter((t) => time - t < windowMs);
      hits.delete(key);
      if (recent.length >= requests) {
        hits.set(key, recent);
        const oldest = recent[0] ?? time;
        return {
          ok: false,
          retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - time) / 1000)),
        };
      }
      recent.push(time);
      // Re-inserted last, so the first key is the one seen longest ago.
      hits.set(key, recent);
      if (hits.size > maxKeys) {
        const stale = hits.keys().next().value;
        if (stale !== undefined) hits.delete(stale);
      }
      return { ok: true };
    },
  };
}

const job = new vm.Script('job()', { filename: 'check-ui-playground' });
const context = vm.createContext({ job: undefined as unknown });

/**
 * Runs `fn` and stops it after `timeoutMs`. The check is synchronous, so a timer cannot
 * interrupt it; the vm's watchdog can, by terminating whatever runs inside `runInContext`.
 */
export function runWithTimeout<T>(fn: () => T, timeoutMs: number): T {
  context.job = fn;
  try {
    return job.runInContext(context, { timeout: timeoutMs }) as T;
  } finally {
    context.job = undefined;
  }
}

export function isTimeout(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'ERR_SCRIPT_EXECUTION_TIMEOUT'
  );
}

/** The client's address: Vercel sets `x-real-ip` and `x-forwarded-for` itself. */
export function clientKey(request: Request): string {
  const real = request.headers.get('x-real-ip')?.trim();
  if (real) return real;
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || 'unknown';
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function fail(
  status: number,
  code: ErrorCode,
  message: string,
  headers: Record<string, string> = {},
): Response {
  const body: CheckError = { error: { code, message } };
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

/** Reads at most `limit` bytes of the body; undefined when there are more. */
async function readBody(request: Request, limit: number): Promise<string | undefined> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export interface CheckHandlerOptions {
  check: (code: string) => CheckResult;
  /** Largest code accepted, in UTF-8 bytes. */
  maxBytes: number;
  timeoutMs: number;
  limiter: RateLimiter;
}

export function createCheckHandler({ check, maxBytes, timeoutMs, limiter }: CheckHandlerOptions) {
  // JSON escaping can grow the code several times over; the code itself is measured below.
  const maxBody = maxBytes * 6 + 1024;
  const tooLarge = (bytes: number) =>
    fail(
      413,
      'too_large',
      `The playground checks up to ${kb(maxBytes)} of code${bytes ? `, and this is ${kb(bytes)}` : ''}. The CLI and the MCP server have no such limit: run npx -y @dgesteves/design-system-mcp check on the file.`,
    );

  return async function handle(request: Request): Promise<Response> {
    const limit = limiter.take(clientKey(request));
    if (!limit.ok) {
      return fail(
        429,
        'rate_limited',
        `That is a lot of checks in a minute. Try again in ${String(limit.retryAfterSeconds)} s.`,
        { 'Retry-After': String(limit.retryAfterSeconds) },
      );
    }

    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > maxBody) return tooLarge(0);
    const body = await readBody(request, maxBody);
    if (body === undefined) return tooLarge(0);

    let input: unknown;
    try {
      input = JSON.parse(body);
    } catch {
      return fail(400, 'invalid_json', 'Send JSON: { "code": "<your TSX>" }.');
    }
    const code =
      typeof input === 'object' && input !== null ? (input as { code?: unknown }).code : undefined;
    if (typeof code !== 'string') {
      return fail(400, 'invalid_request', 'Send the code to check as a string: { "code": "..." }.');
    }
    const bytes = Buffer.byteLength(code, 'utf8');
    if (bytes > maxBytes) return tooLarge(bytes);

    const started = performance.now();
    let result: CheckResult;
    try {
      result = runWithTimeout(() => check(code), timeoutMs);
    } catch (error) {
      if (isTimeout(error)) {
        return fail(
          503,
          'timeout',
          `The check took longer than ${String(timeoutMs / 1000)} s and was stopped. Try a smaller piece of code.`,
        );
      }
      // Thousands of nested brackets overflow the parser's recursion; nobody writes that.
      if (error instanceof RangeError && /call stack/i.test(error.message)) {
        return fail(
          422,
          'too_complex',
          'This code is nested too deeply to parse. Real components are nowhere near that deep.',
        );
      }
      console.error('check_ui playground:', error);
      return fail(
        500,
        'internal',
        'The check failed on the server. Please open an issue with the code.',
      );
    }
    const payload: CheckResponse = {
      ...result,
      ms: Math.round((performance.now() - started) * 100) / 100,
    };
    return Response.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  };
}
