import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { glob } from 'tinyglobby';
import type ts from 'typescript';

import type { ResolvedConfig } from './config.js';
import { extractComponents } from './extract/components.js';
import { attachDocs, parseDoc, type ParsedDoc } from './extract/docs.js';
import { checkSource, LintTarget } from './lint/index.js';
import {
  buildSearchIndex,
  searchComponents,
  type Bm25Index,
  type SearchHit,
} from './search/index.js';
import { loadTokens, type TokenIndex } from './tokens/index.js';
import type {
  CheckResult,
  ComponentInfo,
  DesignSystemModel,
  Token,
  TokenCategory,
} from './types.js';
import { silentLogger, type Logger } from './util/log.js';
import { globBase, isInside, relativePath } from './util/paths.js';
import { closest } from './util/strings.js';
import { parseUtility } from './lint/tailwind.js';
import { VERSION } from './version.js';

/** A loaded design system: the model plus the indexes the tools query. */
export class DesignSystem {
  readonly lint: LintTarget;
  private readonly searchIndex: Bm25Index<ComponentInfo>;

  constructor(
    readonly model: DesignSystemModel,
    readonly config: ResolvedConfig,
  ) {
    this.lint = new LintTarget(model, config);
    this.searchIndex = buildSearchIndex(model.components);
  }

  get root(): string {
    return this.model.root;
  }

  get components(): ComponentInfo[] {
    return this.model.components;
  }

  get tokens(): Token[] {
    return this.model.tokens;
  }

  get tokenIndex(): TokenIndex {
    return this.lint.tokens;
  }

  /** Top-level components, i.e. not parts of another component. */
  roots(): ComponentInfo[] {
    return this.model.components.filter((c) => !c.parent);
  }

  /** Looks a component up by name, alias, `Card.Header`/`CardHeader` or case-insensitively. */
  getComponent(name: string): ComponentInfo | undefined {
    const exact = this.lint.components.get(name);
    if (exact) return exact;
    const key = (n: string) => n.replace(/\./g, '').toLowerCase();
    const wanted = key(name);
    return this.model.components.find(
      (c) => key(c.name) === wanted || c.aliases.some((a) => key(a) === wanted),
    );
  }

  suggestComponent(name: string): string | undefined {
    return closest(name, this.lint.names(), 0.5);
  }

  search(query: string, limit = 5): SearchHit[] {
    return searchComponents(this.searchIndex, query, limit);
  }

  getTokens(
    filter: { category?: TokenCategory | undefined; query?: string | undefined } = {},
  ): Token[] {
    const query = filter.query?.toLowerCase();
    return this.model.tokens.filter(
      (t) =>
        (!filter.category || t.category === filter.category) &&
        (!query ||
          t.name.toLowerCase().includes(query) ||
          (t.description ?? '').toLowerCase().includes(query) ||
          t.usage.some((u) => u.toLowerCase().includes(query))),
    );
  }

  /** Tokens a component's classes and CSS variables reference, e.g. `bg-primary` → `primary`. */
  relatedTokens(component: ComponentInfo): Token[] {
    const byUsage = new Map<string, Token>();
    for (const token of this.model.tokens) {
      for (const usage of token.usage) byUsage.set(usage, token);
    }
    const found = new Map<string, Token>();
    // The spacing unit backs every p-*/gap-* class; listing it says nothing.
    const isUnit = (token: Token) => token.category === 'spacing' && token.tailwind === '';
    for (const cls of component.classNames) {
      const { base } = parseUtility(cls);
      const token = byUsage.get(base) ?? matchUtility(base, this.model.tokens);
      if (token && !isUnit(token)) found.set(token.name, token);
    }
    for (const cssVar of component.cssVars) {
      const token = this.tokenIndex.byCssVar(cssVar);
      if (token) found.set(token.name, token);
    }
    return [...found.values()];
  }

  check(code: string, filename?: string): CheckResult {
    return checkSource(code, this.lint, { filename, rules: this.config.rules });
  }
}

const COLOR_UTILITY =
  /^(?:bg|text|border(?:-[xytrblse])?|ring|ring-offset|outline|fill|stroke|from|via|to|divide|accent|caret|decoration|placeholder|shadow)-(.+)$/;

/** `border-ring` → token `ring`, for color utilities a token's usage list does not spell out. */
function matchUtility(base: string, tokens: Token[]): Token | undefined {
  const key = COLOR_UTILITY.exec(base)?.[1];
  return key ? tokens.find((t) => t.category === 'color' && t.tailwind === key) : undefined;
}

// ─── Loading ────────────────────────────────────────────────────────────────

export interface LoadOptions {
  /** Use the on-disk extraction cache. Default true. */
  cache?: boolean;
  logger?: Logger;
  /** Previous TypeScript program, reused for incremental rebuilds. */
  oldProgram?: ts.Program | undefined;
}

interface ResolvedFiles {
  components: string[];
  tokens: { file: string; prefix?: string | undefined }[];
  docs: string[];
}

async function resolveFiles(config: ResolvedConfig): Promise<ResolvedFiles> {
  const options = { cwd: config.root, absolute: true, ignore: config.exclude, dot: false };
  const components = (await glob(config.components, options)).sort();
  const docs = (await glob(config.docs, options)).sort();
  const tokens: ResolvedFiles['tokens'] = [];
  const seen = new Set<string>();
  for (const source of config.tokens) {
    for (const file of (await glob(source.path, options)).sort()) {
      if (seen.has(file)) continue;
      seen.add(file);
      tokens.push({ file, prefix: source.prefix });
    }
  }
  return { components, tokens, docs };
}

/** Everything that, when changed, invalidates the cached model. */
async function cacheKey(config: ResolvedConfig, files: ResolvedFiles): Promise<string> {
  const stat = async (file: string) => {
    try {
      const s = await fsp.stat(file);
      return `${relativePath(config.root, file)}:${s.size}:${Math.round(s.mtimeMs)}`;
    } catch {
      return `${file}:missing`;
    }
  };
  const extra = [
    'tsconfig.json',
    'package.json',
    'pnpm-lock.yaml',
    'package-lock.json',
    'yarn.lock',
    'bun.lock',
  ]
    .map((f) => path.join(config.root, f))
    .filter((f) => fs.existsSync(f));
  const all = [...files.components, ...files.tokens.map((t) => t.file), ...files.docs, ...extra];
  const stats = await Promise.all(all.map(stat));
  const { rules: _rules, ...relevant } = config;
  return createHash('sha256')
    .update(JSON.stringify({ version: VERSION, config: relevant, stats }))
    .digest('hex');
}

function cacheFile(root: string): string {
  const nodeModules = path.join(root, 'node_modules');
  if (fs.existsSync(nodeModules)) {
    return path.join(nodeModules, '.cache', 'design-system-mcp', 'model.json');
  }
  const id = createHash('sha256').update(root).digest('hex').slice(0, 16);
  return path.join(os.tmpdir(), 'design-system-mcp', `${id}.json`);
}

export interface BuildResult {
  model: DesignSystemModel;
  program?: ts.Program | undefined;
  /** Fingerprint of every input file; unchanged fingerprint means nothing to rebuild. */
  key?: string;
}

/** Fingerprint of the files a config tracks (paths, sizes, mtimes), without extracting anything. */
export async function fingerprint(config: ResolvedConfig): Promise<string> {
  return cacheKey(config, await resolveFiles(config));
}

export async function buildModel(
  config: ResolvedConfig,
  options: LoadOptions = {},
): Promise<BuildResult> {
  const logger = options.logger ?? silentLogger;
  const started = performance.now();
  const files = await resolveFiles(config);
  const useCache = options.cache !== false;
  const key = await cacheKey(config, files);
  const cachePath = cacheFile(config.root);

  if (useCache && !options.oldProgram) {
    try {
      const cached = JSON.parse(await fsp.readFile(cachePath, 'utf8')) as {
        key?: string;
        model?: DesignSystemModel;
      };
      if (cached.key === key && cached.model?.version === 1) {
        cached.model.stats.fromCache = true;
        cached.model.stats.durationMs = Math.round(performance.now() - started);
        return { model: cached.model, key };
      }
    } catch {
      // No cache yet, or unreadable: extract.
    }
  }

  const extracted = extractComponents({
    root: config.root,
    files: files.components,
    tsconfig: config.tsconfig,
    importPath: config.importPath,
    oldProgram: options.oldProgram,
  });
  const docs: ParsedDoc[] = [];
  const warnings = [...extracted.warnings];
  for (const file of files.docs) {
    try {
      docs.push(parseDoc(await fsp.readFile(file, 'utf8'), relativePath(config.root, file)));
    } catch (error) {
      warnings.push(`${relativePath(config.root, file)}: ${(error as Error).message}`);
    }
  }
  warnings.push(...attachDocs(extracted.components, docs));
  const tokens = await loadTokens(config.root, files.tokens);
  warnings.push(...tokens.warnings);

  if (!files.components.length) {
    warnings.push(
      `No component files matched ${config.components.join(', ')} under ${config.root}`,
    );
  }
  if (!files.tokens.length) warnings.push('No token files found; token rules are disabled.');

  const model: DesignSystemModel = {
    version: 1,
    root: config.root,
    components: extracted.components,
    tokens: tokens.tokens,
    propSets: extracted.propSets,
    warnings,
    stats: {
      files: {
        components: files.components.length,
        tokens: files.tokens.length,
        docs: files.docs.length,
      },
      durationMs: Math.round(performance.now() - started),
      fromCache: false,
    },
  };

  if (useCache) {
    try {
      await fsp.mkdir(path.dirname(cachePath), { recursive: true });
      await fsp.writeFile(cachePath, JSON.stringify({ key, model }));
    } catch (error) {
      logger.warn(`could not write cache ${cachePath}: ${(error as Error).message}`);
    }
  }
  return { model, program: extracted.program, key };
}

export async function loadDesignSystem(
  config: ResolvedConfig,
  options: LoadOptions = {},
): Promise<DesignSystem> {
  const { model } = await buildModel(config, options);
  return new DesignSystem(model, config);
}

// ─── Host: lazy load, reload on change ──────────────────────────────────────

/**
 * Owns the current DesignSystem. Loads lazily, rebuilds when watched files
 * change (reusing the previous TypeScript program), and never serves a
 * half-built model: callers get the in-flight build when one is running.
 */
export interface HostOptions extends LoadOptions {
  /** Builds the model; replaceable in tests. Defaults to `buildModel`. */
  build?: typeof buildModel;
}

export class DesignSystemHost {
  private current?: Promise<DesignSystem>;
  private program?: ts.Program | undefined;
  private key?: string | undefined;
  private watchers: fs.FSWatcher[] = [];
  private timer?: NodeJS.Timeout;
  private readonly listeners = new Set<(ds: DesignSystem) => void>();

  constructor(
    private readonly config: ResolvedConfig,
    private readonly options: HostOptions = {},
  ) {}

  get(): Promise<DesignSystem> {
    this.current ??= this.build(false);
    return this.current;
  }

  reload(): Promise<DesignSystem> {
    const next = this.build(true);
    // Keep serving the previous model if the rebuild fails.
    const previous = this.current;
    this.current = next.catch(async (error: unknown) => {
      (this.options.logger ?? silentLogger).error(`reload failed: ${(error as Error).message}`);
      if (previous) return previous;
      throw error;
    });
    return this.current;
  }

  onChange(listener: (ds: DesignSystem) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Watches the component, token and docs locations plus config files. */
  watch(): void {
    if (this.watchers.length) return;
    const { root } = this.config;
    const dirs = new Set<string>();
    for (const pattern of [
      ...this.config.components,
      ...this.config.docs,
      ...this.config.tokens.map((t) => t.path),
    ]) {
      const base = path.resolve(root, globBase(pattern));
      if (isInside(root, base) && fs.existsSync(base)) dirs.add(base);
    }
    const files = [
      this.config.configFile,
      path.join(root, this.config.tsconfig ?? 'tsconfig.json'),
    ].filter((f): f is string => Boolean(f && fs.existsSync(f)));
    // Watched directories can hold unrelated files (a token file in app/ puts
    // every page under watch), so only rebuild when a tracked file changed.
    const schedule = () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        void fingerprint(this.config).then(
          (key) => (key === this.key ? undefined : this.reload()),
          () => this.reload(),
        );
      }, 150);
    };
    // Skip dirs nested inside another watched dir.
    const roots = [...dirs].filter((d) => ![...dirs].some((o) => o !== d && isInside(o, d)));
    for (const dir of roots) {
      try {
        // Non-persistent: the process lives as long as stdin, not as long as the watchers.
        const watcher = fs.watch(dir, { recursive: true, persistent: false }, (_event, file) => {
          if (file && /node_modules|\.git[\\/]/.test(file)) return;
          schedule();
        });
        watcher.on('error', () => undefined);
        this.watchers.push(watcher);
      } catch {
        // Recursive watch unsupported here; changes need a restart.
      }
    }
    for (const file of files) {
      try {
        const watcher = fs.watch(file, { persistent: false }, schedule);
        watcher.on('error', () => undefined);
        this.watchers.push(watcher);
      } catch {
        // ignore
      }
    }
  }

  close(): void {
    clearTimeout(this.timer);
    for (const watcher of this.watchers) watcher.close();
    this.watchers = [];
  }

  private async build(incremental: boolean): Promise<DesignSystem> {
    const logger = this.options.logger ?? silentLogger;
    const build = this.options.build ?? buildModel;
    const { model, program, key } = await build(this.config, {
      ...this.options,
      oldProgram: incremental ? this.program : undefined,
    });
    if (program) this.program = program;
    this.key = key;
    const ds = new DesignSystem(model, this.config);
    const { stats } = model;
    logger.info(
      `${incremental ? 'reloaded' : 'loaded'} ${model.components.length} components, ${model.tokens.length} tokens` +
        ` from ${relativePath(process.cwd(), this.config.root) || '.'} in ${stats.durationMs}ms${stats.fromCache ? ' (cache)' : ''}`,
    );
    for (const warning of model.warnings) logger.warn(warning);
    if (incremental) for (const listener of this.listeners) listener(ds);
    return ds;
  }
}
