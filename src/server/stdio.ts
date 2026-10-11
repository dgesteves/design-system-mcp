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
import { findProjectRoot, hasProjectMarker, loadTarget } from '../workspace.js';
import { createServer, ProjectNotFoundError } from './index.js';
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

/** What answers a request: `target` is the `path` or `filename` it names, if any. */
type Resolve = (target: string | undefined) => Promise<Served>;

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
 *
 * When none of those gives a project (a client that starts servers in the home or the
 * plugin's folder and reports no roots), each request's project is found from the
 * absolute path it names (`findProjectRoot`): the nearest folder at or above it with a
 * project marker, or the monorepo root above that, served as if the server had been
 * started there. Each root found is loaded once and kept; a request without an absolute
 * path is answered from the one root found so far.
 */
export function serveStdio(options: ServeOptions): Promise<ServerHandle> {
  const { logger } = options;
  let decide: (resolve: Resolve) => void = () => undefined;
  const decided = new Promise<Resolve>((resolve) => {
    decide = resolve;
  });

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

  /** The project at `root` (the working directory when undefined), or a monorepo root's projects. */
  const load = async (root: string | undefined): Promise<Served> => {
    const target = await loadTarget({ ...options, root });
    const { config, workspace } = target;
    // Once per project, as it loads: a reload of the config does not repeat them.
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
      return { projects };
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
    return { host };
  };

  let started = false;
  /** One project for every request: the one at `root`, or the working directory. */
  const serveOne = (root: string | undefined) => {
    if (started) return;
    started = true;
    const served = load(root);
    // Errors surface through tool results; log them once, and do not crash on an unobserved rejection.
    served.catch((error: unknown) => {
      logger.error((error as Error).message);
    });
    decide(() => served);
  };
  /** Each request's project, from the absolute path it names. */
  const serveByPath = () => {
    if (started) return;
    started = true;
    logger.info(
      `${options.cwd} holds no project and the client reported no roots: finding each request's project from the absolute path it names`,
    );
    const found = new Map<string, Promise<Served>>();
    decide(async (target) => {
      if (target !== undefined && path.isAbsolute(target)) {
        const dir = findProjectRoot(target);
        if (!dir) {
          throw new ProjectNotFoundError(
            `No project at or above ${target}: no folder from there up holds a package.json, components.json, project.json or onsystem config. Pass the absolute path of a file in your project.`,
          );
        }
        let served = found.get(dir);
        if (!served) {
          logger.info(`using ${dir}, the project of ${target}`);
          served = load(dir);
          served.catch((error: unknown) => {
            logger.error((error as Error).message);
          });
          found.set(dir, served);
        }
        return served;
      }
      // Without an absolute path: the project found so far, when there is just one.
      const [only, ...others] = found.values();
      if (only && !others.length) return only;
      throw new ProjectNotFoundError(
        only
          ? `Requests have named files in ${found.size} projects (${[...found.keys()].join(', ')}). Pass \`path\` (for check_ui with \`code\`, \`filename\`) as the absolute path of the file you are editing, so the answer comes from its project.`
          : `onsystem cannot tell which project to answer for: it was started in ${options.cwd}, which holds no project, and the client reported no workspace roots. Pass \`path\` (for check_ui with \`code\`, \`filename\`) as the absolute path of the file you are editing, and it answers from that file's project. Or start the server with --root <project folder>.`,
      );
    });
  };

  // The primary ways to the project, none of which needs the client.
  const configured =
    options.root !== undefined ||
    options.config !== undefined ||
    [...CONFIG_FILES, ...LEGACY_CONFIG_FILES].some((file) =>
      fs.existsSync(path.join(options.cwd, file)),
    );
  if (configured || hasProjectMarker(options.cwd)) serveOne(options.root);

  /**
   * When nothing else says where the project is: the working directory when flags
   * (`--components`, `--tokens`, `--docs`) describe it, else each request's path.
   */
  const fallback = () => {
    if (options.components?.length || options.tokens?.length || options.docs?.length) {
      serveOne(undefined);
    } else {
      serveByPath();
    }
  };

  // A 2025-era client is being asked for its roots: requests wait for the answer.
  let askingRoots = false;
  /** What answers requests, once decided; nothing has said where the project is by the first request. */
  const resolve: Resolve = async (target) => {
    if (!started && !askingRoots) fallback();
    return (await decided)(target);
  };

  const factory = ({ era }: { era: 'legacy' | 'modern' }) => {
    const server = createServer({
      getDesignSystem: async (target) => {
        const served = await resolve(target);
        if ('host' in served) return served.host.get();
        throw new Error('This server serves a workspace root: pass a path.');
      },
      getProjects: async (target) => {
        const served = await resolve(target);
        return 'projects' in served ? served.projects : undefined;
      },
    });
    instances.add(server);
    // A 2025-era client that started the server outside any project: its roots say where.
    if (!started && era === 'legacy') {
      server.server.oninitialized = () => {
        askingRoots = true;
        void clientRoot(server).then((root) => {
          if (!root) {
            fallback();
            return;
          }
          if (root !== options.cwd) logger.info(`using client root ${root}`);
          serveOne(root);
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
