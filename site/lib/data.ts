/**
 * Typed access to generated/*.json, which scripts/generate.mjs writes at build time from the
 * library, the demo design system, the benchmark results and the README.
 */
import benchJson from '@/generated/bench.json';
import demoJson from '@/generated/demo.json';
import designSystemJson from '@/generated/design-system.json';
import docsJson from '@/generated/docs.json';
import readmeJson from '@/generated/readme.json';
import rulesJson from '@/generated/rules.json';
import toolsJson from '@/generated/tools.json';

export interface Finding {
  ruleId: string;
  severity: 'error' | 'warning';
  message: string;
  line: number;
  column: number;
  /** 0-based offsets into the draft. */
  start: number;
  end: number;
  source: string;
  suggestion: string | null;
  fixable: boolean;
  /** Short forms for the transcript: `border-[#ef4444]` → `border-destructive`. */
  found: string;
  fix: string;
}

export interface Demo {
  prompt: string;
  file: string;
  draft: string;
  fixed: string;
  findings: Finding[];
  errorCount: number;
  warningCount: number;
  /** Spans of `fixed` that the agent changed. */
  changes: { start: number; end: number }[];
  /** Median time of one check of the draft, measured at build time. */
  checkMs: number;
}

export interface RunSummary {
  runs: number;
  clean: number;
  errors: number;
  warnings: number;
  cost: number;
  seconds: number;
  turns: number;
  toolCalls: number;
  hookBlocks: number;
}

export interface BenchModel {
  id: string;
  name: string;
  base: RunSummary;
  plugin: RunSummary;
  costDelta: number;
  tasks: {
    id: string;
    base: { errors: number; byRule: Record<string, number> };
    plugin: { errors: number; byRule: Record<string, number> };
  }[];
}

export interface Bench {
  project: string;
  tasks: { id: string; file: string; prompt: string }[];
  models: BenchModel[];
}

export interface Tools {
  version: string;
  tools: { name: string; title: string; description: string }[];
  prompts: { name: string; title: string; description: string }[];
  resources: string[];
  samples: { tool: string; args: Record<string, unknown>; output: string }[];
}

export interface Rule {
  id: string;
  description: string;
  severity: 'error' | 'warn' | 'off';
}

export interface RuleEntry extends Rule {
  /** The README's Rules table, as Markdown. */
  catches: string;
  suggests: string;
  why: string;
  allow: string | null;
  /** An example the rule trips on, and the same code after the fix (verified clean). */
  bad: string;
  good: string;
  fixedBy: 'rule' | 'hand';
  changes: { start: number; end: number }[];
  findings: {
    severity: 'error' | 'warning';
    message: string;
    line: number;
    column: number;
    start: number;
    end: number;
    suggestion: string | null;
    fixable: boolean;
  }[];
}

export interface RuleCatalog {
  version: string;
  rules: RuleEntry[];
  /** How colour, spacing and radius fixes are chosen, from the README. */
  details: string;
}

export interface Docs {
  quickstart: string;
  setup: string;
  plugin: string;
  cursorVsCode: string;
  otherClients: string;
  tools: string;
  zeroConfig: string;
  configFile: string;
  ci: string;
  baseline: string;
  limits: string;
  skill: string;
  /** docs/migrating.md, without its title. */
  migrating: string;
}

export interface MarkdownTable {
  header: string[];
  rows: string[][];
}

export interface Readme {
  install: { cursor: string; vscode: string; plugin: string };
  realCodebases: MarkdownTable & { intro: string };
  rules: MarkdownTable;
  engines: { node: string };
}

export interface DesignSystemSummary {
  components: {
    name: string;
    description: string | null;
    element: string | null;
    variants: Record<string, string[]>;
    parts: string[];
  }[];
  tokens: Record<string, number>;
}

/** The generated files are checked by scripts/generate.mjs; here they get their types. */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the point: a typed view of JSON
function typed<T>(json: unknown): T {
  return json as T;
}

export const demo = typed<Demo>(demoJson);
export const bench = typed<Bench>(benchJson);
export const tools = typed<Tools>(toolsJson);
export const ruleCatalog = typed<RuleCatalog>(rulesJson);
export const rules: Rule[] = ruleCatalog.rules;
export const docs = typed<Docs>(docsJson);
export const readme = typed<Readme>(readmeJson);
export const designSystem = typed<DesignSystemSummary>(designSystemJson);
