import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { escapePath, glob } from 'tinyglobby';

import {
  applyBaseline,
  BASELINE_FILE,
  countBaseline,
  readBaseline,
  updateBaseline,
  writeBaseline,
} from './baseline.js';
import { ConfigError, loadConfig } from './config.js';
import { componentFiles, loadDesignSystem } from './design-system.js';
import { formatDiagnostics, type OutputFormat } from './lint/index.js';
import { serveStdio } from './server/stdio.js';
import type { CheckResult, Diagnostic } from './types.js';
import { stderrLogger, silentLogger } from './util/log.js';
import { relativePath, toPosix } from './util/paths.js';
import { plural } from './util/strings.js';
import { NAME, VERSION } from './version.js';

const README = 'https://github.com/dgesteves/design-system-mcp#readme';

const HELP = `${NAME} ${VERSION}

Gives coding agents ground truth about your React design system, and lints
the UI they write against it.

Usage
  design-system-mcp [serve] [options]     Start the MCP server on stdio (default)
  design-system-mcp check <paths...>      Lint files, folders or globs with the check_ui
                                          rules (for CI)
  design-system-mcp inspect               Print what was extracted from the project
  design-system-mcp help                  Show this help

Options
  --root <dir>            Project root (default: the config file's directory, or cwd)
  --config <file>         Config file (default: design-system-mcp.config.{json,ts,mjs,js})
  --components <glob>     Component sources, repeatable (default: found through
                          components.json or a workspace package, else
                          components/ui/**/*.{tsx,jsx} and src/components/ui/...)
  --tokens <file>         Token file (DTCG .json or CSS), repeatable
  --docs <glob>           Component docs (Markdown/MDX), repeatable
  --no-cache              Ignore the on-disk extraction cache
  --no-watch              serve: do not reload when files change
  --format <format>       check: pretty | json | github (default: pretty)
  --max-warnings <n>      check: exit 1 when there are more than n warnings
  --update-baseline       check: record the current findings as accepted, and exit 0
  --baseline <file>       check: baseline file (default: ${BASELINE_FILE} in the root,
                          used whenever it exists)
  --ignore-baseline       check: report every finding, baseline or not
  --include-design-system
                          check: also lint the design system's own component
                          files, which are skipped by default
  --quiet-without-design-system
                          check: print nothing and exit 0 when the project has no
                          design system (no components, no tokens of its own, no
                          config), for hooks installed across many projects
  --require-design-system
                          check: exit 2 when no components or no color tokens
                          are found, so CI cannot pass by checking nothing
  -h, --help              Show this help
  -v, --version           Show the version

Examples
  npx -y ${NAME} inspect
  npx -y ${NAME} check . --format github --require-design-system
  npx -y ${NAME} check . --update-baseline   # adopt in an existing codebase

Docs: ${README}
`;

export interface Io {
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  color: boolean;
}

const defaultIo: Io = {
  cwd: process.cwd(),
  stdout: (text) => process.stdout.write(`${text}\n`),
  stderr: (text) => process.stderr.write(`${text}\n`),
  color: process.stdout.isTTY && !process.env.NO_COLOR,
};

/** Runs the CLI. Resolves to an exit code; `serve` resolves once the server is listening. */
export async function main(argv: string[], io: Io = defaultIo): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      allowNegative: true,
      options: {
        root: { type: 'string' },
        config: { type: 'string' },
        components: { type: 'string', multiple: true },
        tokens: { type: 'string', multiple: true },
        docs: { type: 'string', multiple: true },
        cache: { type: 'boolean', default: true },
        watch: { type: 'boolean', default: true },
        format: { type: 'string', default: 'pretty' },
        'max-warnings': { type: 'string' },
        baseline: { type: 'string' },
        'update-baseline': { type: 'boolean', default: false },
        'ignore-baseline': { type: 'boolean', default: false },
        'quiet-without-design-system': { type: 'boolean', default: false },
        'include-design-system': { type: 'boolean' },
        'require-design-system': { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (error) {
    io.stderr(`${(error as Error).message}\n\nRun design-system-mcp --help for usage.`);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.help) {
    io.stdout(HELP);
    return 0;
  }
  if (values.version) {
    io.stdout(VERSION);
    return 0;
  }

  const [command = 'serve', ...rest] = positionals;
  if (command === 'help') {
    io.stdout(HELP);
    return 0;
  }
  // `--root ${workspaceFolder}` from a client that does not expand variables
  // would make a folder of that name the project.
  let root = values.root;
  if (root !== undefined && /\$\{[^}]*\}/.test(root)) {
    io.stderr(
      `--root "${root}" holds a variable the client did not expand; using ${command === 'serve' ? "the client's workspace roots or " : ''}the working directory instead.`,
    );
    root = undefined;
  }
  const configOptions = {
    cwd: io.cwd,
    root,
    config: values.config,
    components: values.components,
    tokens: values.tokens,
    docs: values.docs,
    includeDesignSystem: values['include-design-system'],
  };

  try {
    switch (command) {
      case 'serve':
        await serveStdio({
          ...configOptions,
          cache: values.cache,
          watch: values.watch,
          logger: stderrLogger,
        });
        return 0;
      case 'check':
        return await check(rest, configOptions, values, io);
      case 'inspect':
        return await inspect(configOptions, values, io);
      default:
        io.stderr(`Unknown command "${command}". Run design-system-mcp --help for usage.`);
        return 2;
    }
  } catch (error) {
    if (error instanceof ConfigError) {
      io.stderr(error.message);
      return 2;
    }
    throw error;
  }
}

async function check(
  patterns: string[],
  configOptions: Parameters<typeof loadConfig>[0],
  values: {
    cache: boolean;
    format: string;
    'max-warnings'?: string | undefined;
    baseline?: string | undefined;
    'update-baseline': boolean;
    'ignore-baseline': boolean;
    'quiet-without-design-system': boolean;
    'require-design-system': boolean;
  },
  io: Io,
): Promise<number> {
  if (values['quiet-without-design-system'] && values['require-design-system']) {
    io.stderr('check: pass --quiet-without-design-system or --require-design-system, not both');
    return 2;
  }
  if (!patterns.length) {
    io.stderr('check: pass files, folders or globs, e.g. design-system-mcp check .');
    return 2;
  }
  const format = values.format as OutputFormat;
  if (!['pretty', 'json', 'github'].includes(format)) {
    io.stderr(`check: unknown --format "${values.format}" (pretty, json, github)`);
    return 2;
  }
  const maxWarnings =
    values['max-warnings'] === undefined ? undefined : Number(values['max-warnings']);
  if (maxWarnings !== undefined && !Number.isInteger(maxWarnings)) {
    io.stderr('check: --max-warnings expects an integer');
    return 2;
  }

  const config = await loadConfig(configOptions);
  const ds = await loadDesignSystem(config, { cache: values.cache, logger: silentLogger });
  // An existing path is taken literally, so `app/(marketing)` and `[slug]` are not
  // glob syntax. A directory means every TSX/JSX file under it.
  const globs = patterns.map((pattern) => {
    const stat = fs.statSync(path.resolve(io.cwd, pattern), { throwIfNoEntry: false });
    if (!stat) return toPosix(pattern);
    const literal = escapePath(toPosix(path.join(pattern, '.')));
    if (!stat.isDirectory()) return literal;
    return literal === '.' ? '**/*.{tsx,jsx}' : `${literal}/**/*.{tsx,jsx}`;
  });
  let files = (
    await glob(globs, {
      cwd: io.cwd,
      absolute: true,
      ignore: ['**/node_modules/**'],
      expandDirectories: false,
    })
  ).sort();
  if (!files.length) {
    io.stderr(`check: no files match ${patterns.join(' ')}`);
    return 2;
  }

  // A hook installed for every project should not lint React apps that have no
  // design system: Tailwind's default scale alone is not one.
  if (
    values['quiet-without-design-system'] &&
    !config.configFile &&
    !ds.components.length &&
    ds.tokens.every((t) => t.origin === 'tailwind-default')
  ) {
    if (format === 'json') io.stdout('[]');
    return 0;
  }

  // A run that found no components or no color tokens passes without having
  // checked them: say so, and fail in CI when asked to.
  const notice = ds.notice();
  if (notice && values['require-design-system']) {
    io.stderr(`check --require-design-system: ${notice}`);
    return 2;
  }

  // The design system's own files implement the scale and the primitives the
  // rules enforce (shadcn/ui's `p-[3px]`), so `check .` leaves them alone.
  let skipped = 0;
  if (!config.includeDesignSystem) {
    const own = new Set((await componentFiles(config)).map(realPath));
    const rest = files.filter((file) => !own.has(realPath(file)));
    skipped = files.length - rest.length;
    files = rest;
  }
  if (!files.length) {
    if (format === 'json') io.stdout('[]');
    else if (format === 'pretty') {
      io.stdout(
        `Nothing to check: ${plural(skipped, 'design-system file')} skipped. Pass --include-design-system to check ${skipped === 1 ? 'it' : 'them'}.`,
      );
    }
    return 0;
  }

  const update = values['update-baseline'];
  const baselineFile = values.baseline
    ? path.resolve(io.cwd, values.baseline)
    : path.join(ds.root, BASELINE_FILE);
  // Read before an update too: a baseline mangled by a merge conflict must not be overwritten silently.
  const baseline = values['ignore-baseline'] ? undefined : readBaseline(baselineFile);
  if (values.baseline && !update && !values['ignore-baseline'] && !baseline) {
    io.stderr(`check: baseline not found: ${displayPath(io.cwd, baselineFile)}`);
    return 2;
  }
  // Entries of rules that are off are kept, not reported as fixed.
  const disabled = new Set(
    Object.entries(ds.config.rules)
      .filter(([, rule]) => rule.severity === 'off')
      .map(([id]) => id),
  );
  // Keys are relative to the real root, with the on-disk spelling of each path and
  // NFC names, so `APP/`, a linked root or a decomposed `café.tsx` find the same entry.
  const realRoot = fs.realpathSync.native(ds.root);
  const baselineKey = (file: string) =>
    relativePath(realRoot, fs.realpathSync.native(file)).normalize('NFC');

  const results: CheckResult[] = [];
  const checked = new Map<string, Diagnostic[]>();
  let baselined = 0;
  let fixed = 0;
  for (const file of files) {
    const code = await fsp.readFile(file, 'utf8');
    let result = ds.check(code, relativePath(ds.root, file));
    const key = baselineKey(file);
    if (update) checked.set(key, result.diagnostics);
    if (baseline && !update) {
      const match = applyBaseline(baseline, key, result, disabled);
      result = { ...match.result, baselined: match.baselined };
      baselined += match.baselined;
      fixed += match.fixed;
    }
    results.push({ ...result, file: relativePath(io.cwd, file) });
  }

  if (update) {
    const next = updateBaseline(baseline, checked, realRoot, disabled);
    writeBaseline(baselineFile, next);
    const counts = countBaseline(next);
    io.stdout(
      `Baseline: ${count(counts.findings, 'finding')} in ${count(counts.files, 'file')} → ${displayPath(io.cwd, baselineFile)}`,
    );
    if (notice) io.stderr(notice);
    return 0;
  }

  const output = formatDiagnostics(results, format, {
    color: io.color,
    baselined: baseline ? baselined : undefined,
    skipped,
    fixedHint: fixed
      ? `${count(fixed, 'baseline finding')} no longer ${fixed === 1 ? 'occurs' : 'occur'}: run \`check ${patterns.map(shellQuote).join(' ')} --update-baseline\` to drop ${fixed === 1 ? 'it' : 'them'}.`
      : undefined,
  });
  if (output) io.stdout(output);
  if (notice) {
    if (format === 'pretty') io.stdout(notice);
    else if (format === 'github') io.stdout(`::warning title=design-system-mcp::${notice}`);
    else io.stderr(notice);
  }

  const errors = results.reduce((n, r) => n + r.errorCount, 0);
  const warnings = results.reduce((n, r) => n + r.warningCount, 0);
  if (errors > 0) return 1;
  if (maxWarnings !== undefined && warnings > maxWarnings) {
    if (format === 'pretty') io.stderr(`Too many warnings (${warnings}, max ${maxWarnings}).`);
    return 1;
  }
  return 0;
}

async function inspect(
  configOptions: Parameters<typeof loadConfig>[0],
  values: { cache: boolean; format: string },
  io: Io,
): Promise<number> {
  const config = await loadConfig(configOptions);
  const ds = await loadDesignSystem(config, { cache: values.cache, logger: silentLogger });
  const { model } = ds;
  if (values.format === 'json') {
    io.stdout(JSON.stringify(model, null, 2));
    return 0;
  }
  const lines: string[] = [
    `root     ${model.root}`,
    `config   ${config.configFile ? displayPath(io.cwd, config.configFile) : '(defaults)'}`,
    ...(config.detected ? [`detected ${config.detected}`] : []),
    `files    ${plural(model.stats.files.components, 'component file')}, ${plural(model.stats.files.tokens, 'token file')}, ${plural(model.stats.files.docs, 'doc')}`,
    `time     ${model.stats.durationMs}ms${model.stats.fromCache ? ' (cache)' : ''}`,
    '',
    `Components (${ds.roots().length} + ${model.components.length - ds.roots().length} parts)`,
  ];
  for (const c of ds.roots()) {
    const variants = c.variants.map((v) => `${v.name}[${v.values.length}]`).join(' ');
    const meta = [
      c.element ? `<${c.element}>` : '',
      plural(c.props.length, 'prop'),
      variants,
      c.subcomponents.length ? plural(c.subcomponents.length, 'part') : '',
      c.docs ? 'docs' : '',
      plural(c.examples.length, 'example'),
    ].filter(Boolean);
    lines.push(`  ${c.name.padEnd(18)} ${meta.join(' · ')}`);
  }
  const counts = new Map<string, number>();
  for (const t of model.tokens) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
  lines.push('', `Tokens (${model.tokens.length})`);
  for (const [category, n] of counts) lines.push(`  ${category.padEnd(18)} ${n}`);
  if (model.warnings.length) {
    lines.push('', 'Warnings');
    for (const warning of model.warnings) lines.push(`  ${warning}`);
  }
  io.stdout(lines.join('\n'));
  return 0;
}

/** `1,307 findings`. */
function count(n: number, word: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? word : `${word}s`}`;
}

/** Quotes a pattern for the hint when the shell would expand or split it. */
function shellQuote(pattern: string): string {
  return /^[\w./@-]+$/.test(pattern) ? pattern : `"${pattern.replace(/(["\\$`])/g, '\\$1')}"`;
}

/** The file's real path, so a linked root or a differently spelled path matches. */
function realPath(file: string): string {
  try {
    return fs.realpathSync.native(file);
  } catch {
    return file;
  }
}

/** Relative to cwd when the file is below it, absolute otherwise. */
function displayPath(cwd: string, file: string): string {
  const rel = path.relative(cwd, file);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : file;
}
