import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import { CONFIG_FILES, loadConfig, type LoadConfigOptions } from '../config.js';
import { DesignSystemHost } from '../design-system.js';
import type { Logger } from '../util/log.js';
import { createServer } from './index.js';

export interface ServeOptions extends LoadConfigOptions {
  cwd: string;
  cache: boolean;
  watch: boolean;
  logger: Logger;
  /** Defaults to stdio. */
  transport?: Transport;
}

/**
 * Starts the server (on stdio unless another transport is given). The project
 * root comes from `--root`/`--config`, a config file in the working directory,
 * or else the client's MCP roots (for clients that launch servers from their
 * own directory).
 */
export async function serveStdio(options: ServeOptions): Promise<McpServer> {
  const { logger } = options;
  let resolveHost: (host: DesignSystemHost) => void = () => undefined;
  let rejectHost: (error: unknown) => void = () => undefined;
  const hostReady = new Promise<DesignSystemHost>((resolve, reject) => {
    resolveHost = resolve;
    rejectHost = reject;
  });
  // Errors surface through tool results; do not crash on an unobserved rejection.
  hostReady.catch(() => undefined);

  const server = createServer({ getDesignSystem: async () => (await hostReady).get() });

  const start = async (root: string | undefined) => {
    try {
      const config = await loadConfig({ ...options, root });
      const host = new DesignSystemHost(config, { cache: options.cache, logger });
      host.onChange(() => {
        if (server.isConnected()) server.sendResourceListChanged();
      });
      if (options.watch) host.watch();
      host.get().catch((error: unknown) => {
        logger.error((error as Error).message);
      });
      server.server.onclose = () => {
        host.close();
      };
      resolveHost(host);
    } catch (error) {
      logger.error((error as Error).message);
      rejectHost(error);
    }
  };

  const explicit =
    options.root !== undefined ||
    options.config !== undefined ||
    CONFIG_FILES.some((file) => fs.existsSync(path.join(options.cwd, file)));

  if (explicit) {
    await start(options.root);
  } else {
    server.server.oninitialized = () => {
      void clientRoot(server).then((root) => {
        if (root && root !== options.cwd) logger.info(`using client root ${root}`);
        return start(root);
      });
    };
  }

  await server.connect(options.transport ?? new StdioServerTransport());
  // The SDK's stdio transport does not watch for the client going away.
  if (!options.transport) process.stdin.once('end', () => void server.close());
  logger.info(options.transport ? 'ready' : 'ready on stdio');
  return server;
}

/** First `file://` root the client reports, if it supports roots. */
async function clientRoot(server: McpServer): Promise<string | undefined> {
  if (!server.server.getClientCapabilities()?.roots) return undefined;
  try {
    const { roots } = await server.server.listRoots(undefined, { timeout: 3000 });
    const uri = roots.find((r) => r.uri.startsWith('file://'))?.uri;
    return uri ? fileURLToPath(uri) : undefined;
  } catch {
    return undefined;
  }
}
