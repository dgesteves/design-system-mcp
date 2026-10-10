import fs from 'node:fs';
import path from 'node:path';

import { DesignSystem, type DesignSystemModel, type ResolvedConfig } from 'onsystem';
import { describe, expect, it } from 'vitest';

import {
  createCheckHandler,
  createRateLimiter,
  runWithTimeout,
  type CheckError,
  type CheckHandlerOptions,
  type CheckResponse,
} from '@/lib/check-service';
import { PLAYGROUND_LIMITS } from '@/lib/playground';

// The same generated model the route serves (pnpm generate writes it).
const generated = (file: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../generated', file), 'utf8'));
const data = generated('playground-model.json') as {
  file: string;
  model: DesignSystemModel;
  config: ResolvedConfig;
};
const presets = (generated('playground.json') as { presets: { id: string; code: string }[] })
  .presets;
const draft = presets.find((p) => p.id === 'danger-zone')?.code ?? '';
const ds = new DesignSystem(data.model, data.config);

function handler(options: Partial<CheckHandlerOptions> = {}) {
  return createCheckHandler({
    check: (code) => ds.check(code, data.file),
    maxBytes: PLAYGROUND_LIMITS.maxBytes,
    timeoutMs: PLAYGROUND_LIMITS.timeoutMs,
    limiter: createRateLimiter(PLAYGROUND_LIMITS.rateLimit),
    ...options,
  });
}

function post(
  body: unknown,
  {
    ip = '203.0.113.7',
    raw,
    headers = {},
  }: { ip?: string; raw?: string; headers?: Record<string, string> } = {},
): Request {
  return new Request('http://localhost/api/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': ip, ...headers },
    body: raw ?? JSON.stringify(body),
  });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe('the check endpoint', () => {
  it('checks code against the demo design system, like check_ui', async () => {
    const response = await handler()(post({ code: draft }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const result = await json<CheckResponse>(response);
    expect(result).toMatchObject({ file: 'app/playground.tsx', errorCount: 8, warningCount: 3 });
    expect(result.diagnostics.map((d) => d.ruleId)).toContain('no-unknown-variant');
    expect(result.ms).toBeGreaterThanOrEqual(0);
  });

  it('reads only the code: the file name is fixed, whatever the request says', async () => {
    const response = await handler()(
      post({ code: '<button>Save</button>', filename: '../../../etc/passwd', path: '/etc/passwd' }),
    );
    const result = await json<CheckResponse>(response);
    expect(result.file).toBe(data.file);
    expect(result.diagnostics[0]?.ruleId).toBe('prefer-design-system-component');
  });

  it('accepts 20 KB of code and refuses a byte more', async () => {
    const limit = PLAYGROUND_LIMITS.maxBytes;
    const fits = `// ${'x'.repeat(limit - 3)}`;
    expect((await handler()(post({ code: fits }))).status).toBe(200);

    const response = await handler()(post({ code: `${fits}x` }));
    expect(response.status).toBe(413);
    const { error } = await json<CheckError>(response);
    expect(error.code).toBe('too_large');
    expect(error.message).toMatch(/20\.0 KB/);
  });

  it('measures the limit in bytes, not characters', async () => {
    // 7,000 euro signs are 21,000 bytes in UTF-8.
    const response = await handler()(post({ code: `// ${'€'.repeat(7000)}` }));
    expect(response.status).toBe(413);
  });

  it('refuses an oversized body before parsing it', async () => {
    const huge = 'x'.repeat(PLAYGROUND_LIMITS.maxBytes * 8);
    const response = await handler()(post(undefined, { raw: huge }));
    expect(response.status).toBe(413);
    const declared = await handler()(
      post({ code: 'x' }, { headers: { 'content-length': String(10 * 1024 * 1024) } }),
    );
    expect(declared.status).toBe(413);
  });

  it('rate limits each address, and lets it back in after the window', async () => {
    let now = 1_000_000;
    const check = handler({
      limiter: createRateLimiter({ requests: 3, windowMs: 60_000, now: () => now }),
    });
    for (let i = 0; i < 3; i++) expect((await check(post({ code: '<p />' }))).status).toBe(200);

    const limited = await check(post({ code: '<p />' }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    expect((await json<CheckError>(limited)).error.code).toBe('rate_limited');

    // Someone else is not affected.
    expect((await check(post({ code: '<p />' }, { ip: '198.51.100.4' }))).status).toBe(200);

    now += 30_000;
    expect((await check(post({ code: '<p />' }))).headers.get('retry-after')).toBe('30');
    now += 30_001;
    expect((await check(post({ code: '<p />' }))).status).toBe(200);
  });

  it('keys the limit on the forwarded address when there is no x-real-ip', async () => {
    const check = handler({ limiter: createRateLimiter({ requests: 1, windowMs: 60_000 }) });
    const from = (forwarded: string) =>
      new Request('http://localhost/api/check', {
        method: 'POST',
        headers: { 'x-forwarded-for': forwarded },
        body: JSON.stringify({ code: '<p />' }),
      });
    expect((await check(from('192.0.2.1, 10.0.0.1'))).status).toBe(200);
    expect((await check(from('192.0.2.1, 10.0.0.2'))).status).toBe(429);
    expect((await check(from('192.0.2.2'))).status).toBe(200);
  });

  it('stops a check that runs too long, and keeps working afterwards', async () => {
    const spin = handler({
      timeoutMs: 50,
      check: () => {
        for (;;) {
          // A check that never ends.
        }
      },
    });
    const started = performance.now();
    const response = await spin(post({ code: '<p />' }));
    expect(response.status).toBe(503);
    expect((await json<CheckError>(response)).error.code).toBe('timeout');
    expect(performance.now() - started).toBeLessThan(1000);

    const after = await handler()(post({ code: draft }));
    expect((await json<CheckResponse>(after)).errorCount).toBe(8);
  });

  it('answers malformed requests with 400 and a reason', async () => {
    const cases: [string | undefined, unknown][] = [
      ['{"code": ', undefined],
      ['', undefined],
      [undefined, { code: 42 }],
      [undefined, { source: '<p />' }],
      [undefined, null],
      [undefined, ['<p />']],
    ];
    for (const [raw, body] of cases) {
      const response = await handler()(post(body, { raw }));
      expect(response.status).toBe(400);
      expect(['invalid_json', 'invalid_request']).toContain(
        (await json<CheckError>(response)).error.code,
      );
    }
  });

  it('reports code that does not parse as a finding, not a failure', async () => {
    const response = await handler()(post({ code: '<Button variant="danger">Save' }));
    expect(response.status).toBe(200);
    const result = await json<CheckResponse>(response);
    expect(result.diagnostics.some((d) => d.ruleId === 'syntax')).toBe(true);
  });

  it('survives input that is not code at all', async () => {
    const noise = Array.from({ length: 4000 }, (_, i) =>
      String.fromCharCode((i * 7919) % 0xd7ff),
    ).join('');
    for (const code of [noise, '\u0000'.repeat(100), '"'.repeat(3000), '/*'.repeat(3000)]) {
      const response = await handler()(post({ code }));
      expect(response.status).toBe(200);
    }
  });

  it('answers code nested too deeply to parse with a finding, and keeps working', async () => {
    // Thousands of nested brackets overflow TypeScript's recursive parser; the library reports it.
    const response = await handler()(post({ code: '{'.repeat(5000) }));
    expect(response.status).toBe(200);
    const result = await json<CheckResponse>(response);
    expect(result.diagnostics[0]).toMatchObject({ ruleId: 'syntax' });
    expect(result.diagnostics[0]?.message).toMatch(/nested too deeply to parse/);
    // A long operator chain is checked rather than refused.
    expect((await handler()(post({ code: '<'.repeat(5000) }))).status).toBe(200);
    const after = await handler()(post({ code: draft }));
    expect((await json<CheckResponse>(after)).errorCount).toBe(8);
  });

  it('runs a function within the time limit and returns its value', () => {
    expect(runWithTimeout(() => 42, 100)).toBe(42);
    expect(() =>
      runWithTimeout(() => {
        throw new Error('boom');
      }, 100),
    ).toThrow('boom');
  });
});
