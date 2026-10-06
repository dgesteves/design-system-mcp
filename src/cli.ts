import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { glob } from 'tinyglobby';

import { ConfigError, loadConfig } from './config.js';
import { loadDesignSystem } from './design-system.js';
import { formatDiagnostics, type OutputFormat } from './lint/index.js';
import { serveStdio } from './server/stdio.js';
import type { CheckResult } from './types.js';
import { stderrLogger, silentLogger } from './util/log.js';
import { relativePath, toPosix } from './util/paths.js';
import { plural } from './util/strings.js';
import { NAME, VERSION } from './version.js';

const HELP = `${NAME} ${VERSION}

Gives coding agents ground truth about your React design system, and lints
the UI they write against it.

Usage
  design-system-mcp [serve] [options]     Start the MCP server on stdio (default)
  design-system-mcp check <files...>      Lint files with the check_ui rules (for CI)
  design-system-mcp inspect               Print what was extracted from the project

Options
  --root <dir>            Project root (default: the config file's directory, or cwd)
  --config <file>         Config file (default: design-system-mcp.config.{json,ts,mjs,js})
  --components <glob>     Component sources, repeatable (default: components/ui/**/*.tsx)
  --tokens <file>         Token file (DTCG .json or CSS), repeatable
  --docs <glob>           Component docs (Markdown/MDX), repeatable
  --no-cache              Ignore the on-disk extraction cache
  --no-watch              serve: do not reload when files change
  --format <format>       check: pretty | json | github (default: pretty)
  --max-warnings <n>      check: exit 1 when there are more than n warnings
  -h, --help              Show this help
  -v, --version           Show the version

Examples
  claude mcp add design-system -- npx -y ${NAME}
  npx ${NAME} check "app/**/*.tsx" --format github
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
  const configOptions = {
    cwd: io.cwd,
    root: values.root,
    config: values.config,
    components: values.components,
    tokens: values.tokens,
    docs: values.docs,
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
  values: { cache: boolean; format: string; 'max-warnings'?: string | undefined },
  io: Io,
): Promise<number> {
  if (!patterns.length) {
    io.stderr('check: pass files or globs, e.g. design-system-mcp check "src/**/*.tsx"');
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
  const files = (
    await glob(patterns.map(toPosix), {
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

  const results: CheckResult[] = [];
  for (const file of files) {
    const code = await fs.readFile(file, 'utf8');
    const result = ds.check(code, relativePath(ds.root, file));
    results.push({ ...result, file: relativePath(io.cwd, file) });
  }
  const output = formatDiagnostics(results, format, { color: io.color });
  if (output) io.stdout(output);

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

/** Relative to cwd when the file is below it, absolute otherwise. */
function displayPath(cwd: string, file: string): string {
  const rel = path.relative(cwd, file);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : file;
}
