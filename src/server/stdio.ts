import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { McpServer, Transport } from '@modelcontextprotocol/server';
import { serveStdio as serveEras } from '@modelcontextprotocol/server/stdio';

import {
  CONFIG_FILES,
  LEGACY_CONFIG_FILES,
  loadConfig,
  type LoadConfigOptions,
} from '../config.js';
import { DesignSystemHost } from '../design-system.js';
import type { Logger } from '../util/log.js';
import { loadTarget, PROJECT_MARKERS } from '../workspace.js';
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

/** The running server: `close()` ends the connection and stops watching. */
export interface ServerHandle {
  close(): Promise<void>;
}

type Served = { host: DesignSystemHost } | { projects: WorkspaceProjects };

/**
 * Starts the server (on stdio unless another transport is given), for clients on
 * either protocol era: a 2026-07-28 client (stateless, `server/discover`) and a
 * 2025-era one (the `initialize` handshake) are both served, the era chosen by the
 * client's first message.
 *
 * The project root comes from `--root` or `--config`, a config file in the working
 * directory, or the working directory itself when it holds a project (a
 * package.json, a components.json). MCP roots, which the 2026-07-28 revision
 * deprecates, are the fallback for a 2025-era client that starts servers somewhere
 * else (Claude Desktop starts them in `/`): its first `file://` root. At a monorepo
 * root with no design system of its own, every project in it is served.
 */
export function serveStdio(options: ServeOptions): Promise<ServerHandle> {
  const { logger } = options;
  let resolveHost: (served: Served) => void = () => undefined;
  let rejectHost: (error: unknown) => void = () => undefined;
  const hostReady = new Promise<Served>((resolve, reject) => {
    resolveHost = resolve;
    rejectHost = reject;
  });
  // Errors surface through tool results; do not crash on an unobserved rejection.
  hostReady.catch(() => undefined);

  const instances = new Set<McpServer>();
  const notify = () => {
    for (const server of instances) {
      if (!server.isConnected()) continue;
      // McpServer.sendResourceListChanged() drops this promise, so a failed send
      // would surface as an unhandled rejection.
      server.server.sendResourceListChanged().catch((error: unknown) => {
        logger.warn(`could not notify the client: ${(error as Error).message}`);
      });
    }
  };
  const closers: (() => void)[] = [];

  let started = false;
  // A 2025-era client is being asked for its roots: requests wait for the answer.
  let askingRoots = false;
  const start = async (root: string | undefined) => {
    if (started) return;
    started = true;
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
        closers.push(() => {
          projects.close();
        });
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
      closers.push(() => {
        host.close();
      });
      resolveHost({ host });
    } catch (error) {
      logger.error((error as Error).message);
      rejectHost(error);
    }
  };

  // The primary ways to the project, none of which needs the client.
  const configured =
    options.root !== undefined ||
    options.config !== undefined ||
    [...CONFIG_FILES, ...LEGACY_CONFIG_FILES].some((file) =>
      fs.existsSync(path.join(options.cwd, file)),
    );
  const cwdIsProject = PROJECT_MARKERS.some((file) => fs.existsSync(path.join(options.cwd, file)));
  if (configured || cwdIsProject) void start(options.root);

  /** The working directory, when nothing else has said where the project is by the first request. */
  const ready = async (): Promise<Served> => {
    if (!started && !askingRoots) void start(undefined);
    return hostReady;
  };

  const factory = ({ era }: { era: 'legacy' | 'modern' }) => {
    const server = createServer({
      getDesignSystem: async () => {
        const served = await ready();
        if ('host' in served) return served.host.get();
        throw new Error('This server serves a workspace root: pass a path.');
      },
      getProjects: async () => {
        const served = await ready();
        return 'projects' in served ? served.projects : undefined;
      },
    });
    instances.add(server);
    // A 2025-era client that started the server outside any project: its roots say where.
    if (!started && era === 'legacy') {
      server.server.oninitialized = () => {
        askingRoots = true;
        void clientRoot(server).then((root) => {
          if (root && root !== options.cwd) logger.info(`using client root ${root}`);
          return start(root);
        });
      };
    }
    return server;
  };

  const handle = serveEras(factory, {
    ...(options.transport ? { transport: options.transport } : {}),
    onerror: (error) => {
      logger.warn(error.message);
    },
  });
  logger.info(options.transport ? 'ready' : 'ready on stdio');
  return Promise.resolve({
    close: async () => {
      for (const close of closers.splice(0)) close();
      await handle.close();
    },
  });
}

/** First `file://` root the client reports, if it supports roots (deprecated in 2026-07-28). */
async function clientRoot(server: McpServer): Promise<string | undefined> {
  // Deprecated with roots (SEP-2577), and only called on a 2025-era connection, where both work.
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  if (!server.server.getClientCapabilities()?.roots) return undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const { roots } = await server.server.listRoots(undefined, { timeout: 3000 });
    const uri = roots.find((r) => r.uri.startsWith('file://'))?.uri;
    return uri ? fileURLToPath(uri) : undefined;
  } catch {
    return undefined;
  }
}
