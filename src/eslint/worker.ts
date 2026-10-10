/**
 * The ESLint plugin's loader, in a worker thread. ESLint rules run synchronously, and finding a
 * project's design system does not (config files written in code, globs, the extraction
 * cache), so the plugin asks this worker and waits for the answer (see `bridge.ts`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { parentPort, type MessagePort } from 'node:worker_threads';

import { DEFAULT_TEST_EXCLUDE, DEFAULT_TEST_FOLDERS, type ResolvedConfig } from '../config.js';
import { buildModel, componentFiles } from '../design-system.js';
import type { DesignSystemModel } from '../types.js';
import { matchesGlob, relativePath } from '../util/paths.js';
import { loadTarget } from '../workspace.js';

type Target = Awaited<ReturnType<typeof loadTarget>>;

export interface LoadRequest {
  /** ESLint's working directory: where `check` would run from. */
  cwd: string;
  /** The file being linted, absolute. */
  file: string;
  /** `settings.onsystem` in the ESLint config: `--root` and `--config`, relative to `cwd`. */
  root?: string | undefined;
  config?: string | undefined;
  /** The version of each design system the plugin already holds, by project root. */
  known: Record<string, string>;
}

export type LoadResponse =
  | {
      /** Why the file is not checked, as `check .` would leave it out. */
      skip: string;
    }
  | {
      root: string;
      version: string;
      /** Left out when the plugin already holds this version. */
      data?: { config: ResolvedConfig; model: DesignSystemModel };
    }
  | { error: string };

export interface Call {
  request: LoadRequest;
  /** Set to 1, and notified, once the response is on `port`. */
  signal: Int32Array;
  port: MessagePort;
}

/** How long a loaded design system is trusted before its files are looked at again. */
const FRESH_MS = 2000;

const targets = new Map<string, { at: number; target: Promise<Target> }>();
/** The default test and story patterns: the recommended config ignores those files itself. */
const TEST_PATTERNS = new Set([DEFAULT_TEST_EXCLUDE, DEFAULT_TEST_FOLDERS]);
const projects = new Map<
  string,
  {
    at: number;
    version: string;
    config: ResolvedConfig;
    model: DesignSystemModel;
    own: Set<string>;
  }
>();

function realPath(file: string): string {
  try {
    return fs.realpathSync.native(file);
  } catch {
    return file;
  }
}

async function targetFor({ cwd, root, config }: LoadRequest): Promise<Target> {
  const key = JSON.stringify([cwd, root, config]);
  const cached = targets.get(key);
  if (cached && Date.now() - cached.at < FRESH_MS) return cached.target;
  const target = loadTarget({
    cwd,
    root: root === undefined ? undefined : path.resolve(cwd, root),
    config: config === undefined ? undefined : path.resolve(cwd, config),
  });
  targets.set(key, { at: Date.now(), target });
  return target;
}

export async function load(request: LoadRequest): Promise<LoadResponse> {
  const target = await targetFor(request);
  const config = target.workspace
    ? (await target.workspace.projectFor(request.file)).config
    : target.config;

  let project = projects.get(config.root);
  if (!project || Date.now() - project.at >= FRESH_MS) {
    const { model, key } = await buildModel(config, { cache: true });
    const own = new Set((await componentFiles(config)).map(realPath));
    project = { at: Date.now(), version: key ?? String(Date.now()), config, model, own };
    projects.set(config.root, project);
  }

  // What `check .` leaves out of a folder: the config's `exclude` and the design system's own
  // component files. Tests and stories are left to the ESLint config (the recommended one
  // ignores them), as `--include-tests` lifts them for `check`.
  const relative = relativePath(config.root, request.file);
  const excluded = config.exclude.find(
    (pattern) => !TEST_PATTERNS.has(pattern) && matchesGlob(relative, pattern),
  );
  if (excluded) return { skip: `excluded by "${excluded}"` };
  if (!config.includeDesignSystem && project.own.has(realPath(request.file))) {
    return { skip: 'one of the design system’s own component files' };
  }
  const { version } = project;
  return {
    root: config.root,
    version,
    ...(request.known[config.root] === version
      ? {}
      : { data: { config: project.config, model: project.model } }),
  };
}

parentPort?.on('message', ({ request, signal, port }: Call) => {
  const reply = (response: LoadResponse) => {
    port.postMessage(response);
    Atomics.store(signal, 0, 1);
    Atomics.notify(signal, 0);
  };
  load({ ...request, file: path.resolve(request.cwd, request.file) }).then(
    reply,
    (error: unknown) => {
      reply({ error: (error as Error).message });
    },
  );
});
