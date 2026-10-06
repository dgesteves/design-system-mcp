/**
 * Diagnostics go to stderr: in stdio mode stdout carries JSON-RPC and must
 * never receive anything else.
 */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export const stderrLogger: Logger = {
  info: (message) => process.stderr.write(`[design-system-mcp] ${message}\n`),
  warn: (message) => process.stderr.write(`[design-system-mcp] warning: ${message}\n`),
  error: (message) => process.stderr.write(`[design-system-mcp] error: ${message}\n`),
};

export const silentLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
