import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import * as z from 'zod';

import { detectProject, type ImportMapping } from './detect.js';
import { findTailwindConfig } from './tokens/tailwind-config.js';
import { slashGlob } from './util/paths.js';
import { closest } from './util/strings.js';

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

const SEVERITIES = ['off', 'warn', 'error'] as const;
const severitySchema = z.enum(SEVERITIES);
export type RuleSeverity = z.infer<typeof severitySchema>;

/** Names keys a strict object or record does not know, with the closest known one. */
function unknownKeys(what: string, known: readonly string[]) {
  return (issue: z.core.$ZodRawIssue): string | undefined => {
    if (issue.code !== 'unrecognized_keys') return undefined;
    return issue.keys
      .map((key) => {
        const guess = closest(key, known, 0.5);
        return `Unknown ${what} "${key}". ${guess ? `Did you mean "${guess}"?` : `Expected one of: ${known.join(', ')}.`}`;
      })
      .join('\n');
  };
}

const ruleOptionsShape = {
  allow: z
    .array(z.string())
    .optional()
    .describe('Values the rule accepts anyway: colors, lengths, element or component names.'),
};
const ruleOptionsSchema = z.strictObject(ruleOptionsShape, {
  error: unknownKeys('rule option', Object.keys(ruleOptionsShape)),
});
export type RuleOptions = z.infer<typeof ruleOptionsSchema>;

const ruleSettingSchema = z.union(
  [severitySchema, z.tuple([severitySchema]), z.tuple([severitySchema, ruleOptionsSchema])],
  {
    // `"warning"` otherwise reads "Invalid input"; arrays keep their own, more precise issues.
    error: (issue) => {
      if (typeof issue.input !== 'string') return undefined;
      const input = issue.input;
      const guess = SEVERITIES.find((s) => input && (s.startsWith(input) || input.startsWith(s)));
      return `Invalid severity "${input}": use "off", "warn" or "error"${guess ? ` (did you mean "${guess}"?)` : ''}.`;
    },
  },
);

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

const configShape = {
  $schema: z.string().optional(),
  components: globsSchema
    .optional()
    .describe('Globs for component source files, relative to the root.'),
  exclude: z
    .array(z.string())
    .optional()
    .describe(
      'Globs to ignore (stories, tests). Replaces the defaults; node_modules is skipped either way unless a pattern names it.',
    ),
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
      'Package name components are imported from, e.g. "@acme/ui", or a pattern for packages imported by path: "@acme/ui/{path}" is @acme/ui/primitives/button for primitives/button.tsx in the package. Default: inferred from package exports and tsconfig paths.',
    ),
  elements: z
    .record(z.string(), z.string())
    .optional()
    .describe('Extra native element → component mappings, e.g. { "a": "Link" }.'),
  includeDesignSystem: z
    .boolean()
    .optional()
    .describe(
      "check: lint the design system's own component files too. Off by default: they implement the scale and primitives the rules enforce.",
    ),
  rules: z
    .partialRecord(z.enum(RULE_IDS), ruleSettingSchema, { error: unknownKeys('rule', RULE_IDS) })
    .optional()
    .describe('Rule severities and options: "off" | "warn" | "error" | [severity, { allow }].'),
};

export const configSchema = z.strictObject(configShape, {
  error: unknownKeys('config key', Object.keys(configShape)),
});

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
  /** Import specifiers for component files, from the `exports` of the package that holds them. */
  imports?: ImportMapping[] | undefined;
  /** How the design system was found when the config does not say (`components.json`, a workspace package). */
  detected?: string | undefined;
  /** A Tailwind v3 config, which maps color classes to custom properties (`primary` → `hsl(var(--primary))`). */
  tailwindConfig?: string | undefined;
  elements: Record<string, string>;
  /** `check` lints the component files themselves, which it skips by default. */
  includeDesignSystem: boolean;
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
  includeDesignSystem?: boolean | undefined;
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
  if (!isDirectory(root)) throw new ConfigError(`Project root not found: ${root}`);

  const rules = {} as Record<RuleId, ResolvedRule>;
  for (const id of RULE_IDS) {
    const setting = config.rules?.[id];
    if (setting === undefined) rules[id] = { severity: DEFAULT_SEVERITY[id], options: {} };
    else if (typeof setting === 'string') rules[id] = { severity: setting, options: {} };
    else rules[id] = { severity: setting[0], options: setting[1] ?? {} };
  }

  // Paths may be written Windows-style; globs and POSIX need forward slashes.
  const tsconfig = config.tsconfig?.replaceAll('\\', '/');
  if (tsconfig !== undefined && !fs.existsSync(path.resolve(root, tsconfig))) {
    // Without it, path aliases do not resolve and most checks go quiet.
    throw new ConfigError(
      `tsconfig not found: ${path.resolve(root, tsconfig)} (from "tsconfig" in ${configFile ?? 'the config'})`,
    );
  }

  // Without component globs, look for components.json or a design-system package.
  const componentsSet = Boolean(options.components?.length) || config.components !== undefined;
  const detection = componentsSet ? undefined : detectProject(root, tsconfig);

  // A token file named outright (not a glob) that does not exist is a typo, not "no tokens".
  const explicitTokens = options.tokens?.length
    ? { paths: options.tokens, from: '--tokens' }
    : config.tokens !== undefined
      ? {
          paths: toArray(config.tokens).map((t) => (typeof t === 'string' ? t : t.path)),
          from: `"tokens" in ${configFile ?? 'the config'}`,
        }
      : undefined;
  for (const file of explicitTokens?.paths ?? []) {
    const absolute = path.resolve(root, slashGlob(file));
    if (!/[*?[\]{}()!]/.test(file) && !fs.existsSync(absolute)) {
      throw new ConfigError(`Token file not found: ${absolute} (from ${explicitTokens?.from})`);
    }
  }

  const tokenSources = options.tokens?.length
    ? options.tokens.map((p) => ({ path: p }))
    : config.tokens !== undefined
      ? toArray(config.tokens).map((t) => (typeof t === 'string' ? { path: t } : t))
      : // Detected stylesheets replace the stylesheet guesses, not DTCG files.
        (detection?.tokens.length
          ? [...detection.tokens, ...DEFAULT_TOKENS.filter((t) => t.endsWith('.json'))]
          : DEFAULT_TOKENS
        ).map((p) => ({ path: p }));

  return {
    root,
    configFile,
    components: (options.components?.length
      ? options.components
      : config.components !== undefined
        ? toArray(config.components)
        : detection
          ? [...(detection.withDefaults ? DEFAULT_COMPONENTS : []), ...detection.components]
          : DEFAULT_COMPONENTS
    ).map(slashGlob),
    exclude: (config.exclude ?? DEFAULT_EXCLUDE).map(slashGlob),
    tokens: tokenSources.map((t) => ({ ...t, path: slashGlob(t.path) })),
    docs: (options.docs?.length
      ? options.docs
      : config.docs === undefined
        ? [...DEFAULT_DOCS, ...(detection?.docs ?? [])]
        : toArray(config.docs)
    ).map(slashGlob),
    tsconfig,
    importPath: config.importPath,
    imports: detection?.imports ?? [],
    detected: detection?.source,
    tailwindConfig: findTailwindConfig(root),
    elements: config.elements ?? {},
    includeDesignSystem: options.includeDesignSystem ?? config.includeDesignSystem ?? false,
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

function isDirectory(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function toArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

/** JSON Schema for editor completion in `design-system-mcp.config.json`. */
export function configJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(configSchema, { target: 'draft-7', io: 'input' });
}
