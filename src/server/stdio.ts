import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import {
  CONFIG_FILES,
  LEGACY_CONFIG_FILES,
  loadConfig,
  type LoadConfigOptions,
} from '../config.js';
import { DesignSystemHost } from '../design-system.js';
import type { Logger } from '../util/log.js';
import { loadTarget } from '../workspace.js';
import { createServer } from './index.js';
import { WorkspaceProjects } from './projects.js';

export interface ServeOptions extends LoadConfigOptions {
  cwd: string;
  cache: boolean;
  watch: boolean;
  logger: Logger;
  /** Defaults to stdio. */
  transport?: Transport;
}

type Served = { host: DesignSystemHost } | { projects: WorkspaceProjects };

/**
 * Starts the server (on stdio unless another transport is given). The project
 * root comes from `--root`/`--config`, a config file in the working directory,
 * or else the client's MCP roots (for clients that launch servers from their
 * own directory). At a monorepo root with no design system of its own, it serves
 * every project in it, each file answered by its own project.
 */
export async function serveStdio(options: ServeOptions): Promise<McpServer> {
  const { logger } = options;
  let resolveHost: (served: Served) => void = () => undefined;
  let rejectHost: (error: unknown) => void = () => undefined;
  const hostReady = new Promise<Served>((resolve, reject) => {
    resolveHost = resolve;
    rejectHost = reject;
  });
  // Errors surface through tool results; do not crash on an unobserved rejection.
  hostReady.catch(() => undefined);

  const server = createServer({
    getDesignSystem: async () => {
      const served = await hostReady;
      if ('host' in served) return served.host.get();
      throw new Error('This server serves a workspace root: pass a path.');
    },
    getProjects: async () => {
      const served = await hostReady;
      return 'projects' in served ? served.projects : undefined;
    },
  });
  const notify = () => {
    if (!server.isConnected()) return;
    // McpServer.sendResourceListChanged() drops this promise, so a failed send
    // would surface as an unhandled rejection.
    server.server.sendResourceListChanged().catch((error: unknown) => {
      logger.warn(`could not notify the client: ${(error as Error).message}`);
    });
  };

  const start = async (root: string | undefined) => {
    try {
      const target = await loadTarget({ ...options, root });
      const { config, workspace } = target;
      // Once, at start: a reload of the config does not repeat them.
      for (const text of config.deprecations ?? []) logger.warn(text);
      if (workspace) {
        const projects = new WorkspaceProjects(workspace, {
          cache: options.cache,
          watch: options.watch,
          logger,
          onChange: notify,
        });
        logger.info(
          `monorepo root: ${workspace.projects.length} of ${workspace.projects.length + workspace.others.length} workspace packages have a design system${workspace.projects.length ? ` (${workspace.projects.map((p) => p.dir).join(', ')})` : ''}`,
        );
        server.server.onclose = () => {
          projects.close();
        };
        resolveHost({ projects });
        return;
      }
      if (config.detected) logger.info(`found the design system through ${config.detected}`);
      const host = new DesignSystemHost(config, {
        cache: options.cache,
        logger,
        // Keep CLI overrides when the config file is edited.
        loadConfig: () => loadConfig({ ...options, root }),
      });
      host.onChange(notify);
      if (options.watch) host.watch();
      host.get().catch((error: unknown) => {
        logger.error((error as Error).message);
      });
      server.server.onclose = () => {
        host.close();
      };
      resolveHost({ host });
    } catch (error) {
      logger.error((error as Error).message);
      rejectHost(error);
    }
  };

  const explicit =
    options.root !== undefined ||
    options.config !== undefined ||
    [...CONFIG_FILES, ...LEGACY_CONFIG_FILES].some((file) =>
      fs.existsSync(path.join(options.cwd, file)),
    );

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
