import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import * as z from 'zod';

export const RULE_IDS = [
  'no-hardcoded-color',
  'no-hardcoded-spacing',
  'no-hardcoded-radius',
  'prefer-design-system-component',
  'no-unknown-component',
  'no-unknown-prop',
  'no-unknown-variant',
  'icon-button-accessible-name',
] as const;
export type RuleId = (typeof RULE_IDS)[number];

const severitySchema = z.enum(['off', 'warn', 'error']);
export type RuleSeverity = z.infer<typeof severitySchema>;

const ruleOptionsSchema = z
  .object({
    allow: z
      .array(z.string())
      .optional()
      .describe('Values the rule accepts anyway: colors, lengths, element or component names.'),
  })
  .strict();
export type RuleOptions = z.infer<typeof ruleOptionsSchema>;

const ruleSettingSchema = z.union([
  severitySchema,
  z.tuple([severitySchema]),
  z.tuple([severitySchema, ruleOptionsSchema]),
]);

const globsSchema = z.union([z.string(), z.array(z.string())]);
const tokenSourceSchema = z.union([
  z.string(),
  z
    .object({
      path: z.string().describe('File or glob.'),
      prefix: z
        .string()
        .optional()
        .describe('DTCG only: custom property prefix, e.g. "acme" for --acme-color-primary.'),
    })
    .strict(),
]);

export const configSchema = z
  .object({
    $schema: z.string().optional(),
    components: globsSchema
      .optional()
      .describe('Globs for component source files, relative to the root.'),
    exclude: z
      .array(z.string())
      .optional()
      .describe('Globs to ignore (stories, tests). Replaces the defaults.'),
    tokens: z
      .union([tokenSourceSchema, z.array(tokenSourceSchema)])
      .optional()
      .describe('Token files: W3C DTCG JSON (*.json) or CSS custom properties (*.css).'),
    docs: globsSchema.optional().describe('Globs for per-component Markdown/MDX docs.'),
    tsconfig: z.string().optional().describe('tsconfig used to resolve types and path aliases.'),
    importPath: z
      .string()
      .optional()
      .describe(
        'Package name components are imported from, e.g. "@acme/ui". Default: inferred from tsconfig paths.',
      ),
    elements: z
      .record(z.string(), z.string())
      .optional()
      .describe('Extra native element → component mappings, e.g. { "a": "Link" }.'),
    rules: z
      .partialRecord(z.enum(RULE_IDS), ruleSettingSchema)
      .optional()
      .describe('Rule severities and options: "off" | "warn" | "error" | [severity, { allow }].'),
  })
  .strict();

export type Config = z.input<typeof configSchema>;

/** Identity helper for typed `design-system-mcp.config.ts` files. */
export function defineConfig(config: Config): Config {
  return config;
}

export interface TokenSourceConfig {
  path: string;
  prefix?: string | undefined;
}

export interface ResolvedRule {
  severity: RuleSeverity;
  options: RuleOptions;
}

export interface ResolvedConfig {
  root: string;
  configFile?: string | undefined;
  components: string[];
  exclude: string[];
  tokens: TokenSourceConfig[];
  docs: string[];
  tsconfig?: string | undefined;
  importPath?: string | undefined;
  elements: Record<string, string>;
  rules: Record<RuleId, ResolvedRule>;
}

export const CONFIG_FILES = [
  'design-system-mcp.config.json',
  'design-system-mcp.config.ts',
  'design-system-mcp.config.mts',
  'design-system-mcp.config.js',
  'design-system-mcp.config.mjs',
];

export const DEFAULT_COMPONENTS = [
  'components/ui/**/*.{tsx,jsx}',
  'src/components/ui/**/*.{tsx,jsx}',
];
export const DEFAULT_EXCLUDE = [
  '**/node_modules/**',
  '**/*.d.ts',
  '**/*.{test,spec,stories}.{ts,tsx,js,jsx}',
];
export const DEFAULT_TOKENS = [
  'app/globals.css',
  'src/app/globals.css',
  'styles/globals.css',
  'src/styles/globals.css',
  'src/index.css',
  'app/app.css',
  '**/*.tokens.json',
];
export const DEFAULT_DOCS = [
  'docs/components/**/*.{md,mdx}',
  'components/ui/**/*.{md,mdx}',
  'src/components/ui/**/*.{md,mdx}',
];

const DEFAULT_SEVERITY: Record<RuleId, RuleSeverity> = {
  'no-hardcoded-color': 'error',
  'no-hardcoded-spacing': 'warn',
  'no-hardcoded-radius': 'warn',
  'prefer-design-system-component': 'error',
  'no-unknown-component': 'error',
  'no-unknown-prop': 'error',
  'no-unknown-variant': 'error',
  'icon-button-accessible-name': 'error',
};

export interface LoadConfigOptions {
  /** Where to look for a config file when `root` and `config` are not given. */
  cwd?: string;
  /** Project root. Defaults to the config file's directory, then `cwd`. */
  root?: string | undefined;
  /** Explicit config file path. */
  config?: string | undefined;
  /** CLI overrides; replace the config file's values when set. */
  components?: string[] | undefined;
  tokens?: string[] | undefined;
  docs?: string[] | undefined;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<ResolvedConfig> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const searchDir = options.root ? path.resolve(cwd, options.root) : cwd;
  const configFile = options.config
    ? path.resolve(cwd, options.config)
    : CONFIG_FILES.map((name) => path.join(searchDir, name)).find((file) => fs.existsSync(file));

  let raw: unknown = {};
  if (configFile) {
    if (!fs.existsSync(configFile)) throw new ConfigError(`Config file not found: ${configFile}`);
    raw = await readConfigFile(configFile);
  }
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ConfigError(
      `Invalid config in ${configFile ?? '(defaults)'}:\n${z.prettifyError(parsed.error)}`,
    );
  }
  const config = parsed.data;
  const root = options.root
    ? path.resolve(cwd, options.root)
    : configFile
      ? path.dirname(configFile)
      : cwd;

  const rules = {} as Record<RuleId, ResolvedRule>;
  for (const id of RULE_IDS) {
    const setting = config.rules?.[id];
    if (setting === undefined) rules[id] = { severity: DEFAULT_SEVERITY[id], options: {} };
    else if (typeof setting === 'string') rules[id] = { severity: setting, options: {} };
    else rules[id] = { severity: setting[0], options: setting[1] ?? {} };
  }

  const tokenSources = options.tokens?.length
    ? options.tokens.map((p) => ({ path: p }))
    : config.tokens === undefined
      ? DEFAULT_TOKENS.map((p) => ({ path: p }))
      : toArray(config.tokens).map((t) => (typeof t === 'string' ? { path: t } : t));

  return {
    root,
    configFile,
    components: options.components?.length
      ? options.components
      : config.components === undefined
        ? DEFAULT_COMPONENTS
        : toArray(config.components),
    exclude: config.exclude ?? DEFAULT_EXCLUDE,
    tokens: tokenSources,
    docs: options.docs?.length
      ? options.docs
      : config.docs === undefined
        ? DEFAULT_DOCS
        : toArray(config.docs),
    tsconfig: config.tsconfig,
    importPath: config.importPath,
    elements: config.elements ?? {},
    rules,
  };
}

async function readConfigFile(file: string): Promise<unknown> {
  if (file.endsWith('.json')) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    } catch (error) {
      throw new ConfigError(`Could not parse ${file}: ${(error as Error).message}`);
    }
  }
  try {
    const mod = (await import(pathToFileURL(file).href)) as { default?: unknown };
    return mod.default ?? mod;
  } catch (error) {
    const hint = /\.m?ts$/.test(file)
      ? ' TypeScript configs need Node.js 22.18+ (type stripping); use JSON or .mjs otherwise.'
      : '';
    throw new ConfigError(`Could not load ${file}: ${(error as Error).message}.${hint}`);
  }
}

function toArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

/** JSON Schema for editor completion in `design-system-mcp.config.json`. */
export function configJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(configSchema, { target: 'draft-7', io: 'input' });
}
