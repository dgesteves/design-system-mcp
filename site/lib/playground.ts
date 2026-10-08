import type { Diagnostic } from '@dgesteves/design-system-mcp';

import playgroundJson from '@/generated/playground.json';

/** Shared by the route and the page, so the editor can say the limits before the server does. */
export const PLAYGROUND_LIMITS = {
  maxBytes: 20 * 1024,
  timeoutMs: 1000,
  rateLimit: { requests: 30, windowMs: 60_000 },
};

export interface PresetResult {
  file: string;
  diagnostics: Diagnostic[];
  errorCount: number;
  warningCount: number;
}

export interface Preset {
  id: string;
  label: string;
  file: string;
  description: string;
  code: string;
  result: PresetResult;
}

export const playground = playgroundJson as unknown as { file: string; presets: Preset[] };
