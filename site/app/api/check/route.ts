import { DesignSystem, type DesignSystemModel, type ResolvedConfig } from 'onsystem';

import data from '@/generated/playground-model.json';
import { createCheckHandler, createRateLimiter } from '@/lib/check-service';
import { PLAYGROUND_LIMITS } from '@/lib/playground';

// check_ui for the playground: the demo design system's model was extracted at build time, so a
// request only parses the code and runs the rules against it.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

const ds = new DesignSystem(
  data.model as unknown as DesignSystemModel,
  data.config as unknown as ResolvedConfig,
);

const handle = createCheckHandler({
  check: (code) => ds.check(code, data.file),
  maxBytes: PLAYGROUND_LIMITS.maxBytes,
  timeoutMs: PLAYGROUND_LIMITS.timeoutMs,
  limiter: createRateLimiter(PLAYGROUND_LIMITS.rateLimit),
});

export function POST(request: Request): Promise<Response> {
  return handle(request);
}
