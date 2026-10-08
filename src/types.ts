/**
 * The design-system model the server exposes. Everything here is plain JSON so
 * it can be cached on disk and returned as MCP structured content.
 */

export const TOKEN_CATEGORIES = [
  'color',
  'spacing',
  'radius',
  'typography',
  'shadow',
  'other',
] as const;
export type TokenCategory = (typeof TOKEN_CATEGORIES)[number];

export interface SourceLocation {
  /** Path relative to the project root, with forward slashes. */
  file: string;
  /** 1-based line. */
  line: number;
}

export interface Token {
  /**
   * Canonical name: the DTCG path for JSON tokens (`color.brand.500`) or the
   * custom property without its dashes for CSS tokens (`primary`, `radius-md`).
   */
  name: string;
  category: TokenCategory;
  /** The value with aliases resolved, as authored (`oklch(0.205 0 0)`, `0.5rem`). */
  value: string;
  /** Values for other modes or themes, e.g. `{ dark: "oklch(0.922 0 0)" }`. */
  modes?: Record<string, string>;
  /** The custom property to reference from CSS, e.g. `--primary`. */
  cssVar?: string;
  /**
   * Tailwind theme key when the token is exposed through `@theme`
   * (`primary` for `--color-primary`, `md` for `--radius-md`).
   */
  tailwind?: string;
  /** Ready-to-paste usages, most idiomatic first: `bg-primary`, `var(--primary)`. */
  usage: string[];
  description?: string;
  deprecated?: string | true;
  /** Name of the token this one aliases, if any. */
  aliasOf?: string;
  /** Where the value comes from. `tailwind-default` marks Tailwind built-ins such as `--spacing`. */
  origin?: 'tailwind-default';
  source: SourceLocation;
}

export interface PropInfo {
  name: string;
  /** TypeScript type as written by the checker, without `| undefined`. */
  type: string;
  required: boolean;
  default?: string;
  description?: string;
  /** Allowed values when the type is a finite set of literals. */
  values?: string[];
  deprecated?: string | true;
  /** `variant` when the prop comes from a `cva()` definition. */
  kind: 'prop' | 'variant';
}

export interface VariantInfo {
  /** Variant prop name, e.g. `variant` or `size`. */
  name: string;
  values: string[];
  default?: string;
  /** Classes applied for each value, straight from the `cva()` config. */
  classes: Record<string, string>;
}

export interface CompoundVariantInfo {
  when: Record<string, string | string[]>;
  classes: string;
}

export interface InheritedProps {
  /** Source text of the type the props come from, e.g. `React.ComponentProps<"button">`. */
  from: string;
  count: number;
  /** Key into `DesignSystemModel.propSets` with the full list of names. */
  set: string;
}

export interface ExampleInfo {
  title?: string;
  code: string;
  lang: string;
  source: 'docs' | 'jsdoc';
}

export interface DocSection {
  heading: string;
  body: string;
}

export interface ComponentDocs {
  file: string;
  description?: string;
  sections: DocSection[];
  frontmatter: Record<string, string | string[]>;
}

export interface ComponentInfo {
  /** How the component is referenced in JSX: `Button`, `CardHeader` or `Tabs.List`. */
  name: string;
  /** Other names that resolve to the same component (e.g. `Card.Header` when `CardHeader` is also exported). */
  aliases: string[];
  description?: string;
  deprecated?: string | true;
  /** Suggested import specifier, e.g. `@/components/ui/button`. */
  importPath: string;
  /** Exported binding name, or the static member path for compound members. */
  exportName: string;
  source: SourceLocation;
  /** The root component this one belongs to (`Card` for `CardHeader`). */
  parent?: string;
  /** Direct sub-components, in declaration order. */
  subcomponents: string[];
  /** Native element it renders or wraps, when it can be inferred (`button`, `input`). */
  element?: string;
  props: PropInfo[];
  inherits: InheritedProps[];
  /**
   * True when part of the props type could not be resolved (missing
   * `node_modules`, a type error). The linter then skips unknown-prop checks.
   */
  openProps: boolean;
  variants: VariantInfo[];
  compoundVariants: CompoundVariantInfo[];
  examples: ExampleInfo[];
  docs?: ComponentDocs;
  /** Utility classes used in the component source; mapped to tokens at query time. */
  classNames: string[];
  /** CSS custom properties referenced in the component source. */
  cssVars: string[];
}

export interface DesignSystemModel {
  version: 1;
  root: string;
  components: ComponentInfo[];
  tokens: Token[];
  /** Shared inherited prop-name lists, deduplicated across components. */
  propSets: Record<string, string[]>;
  /**
   * Every value the component files export, components or not (`Icons`,
   * `buttonVariants`), so the linter tells an invented name from a real export.
   */
  exports: string[];
  /** Non-fatal problems found while extracting (unparseable files, unmatched docs). */
  warnings: string[];
  stats: {
    files: { components: number; tokens: number; docs: number };
    durationMs: number;
    fromCache: boolean;
  };
}

export type Severity = 'error' | 'warning';

export interface TextEdit {
  /** 0-based offsets into the checked source, end exclusive. */
  range: [number, number];
  text: string;
}

export interface Diagnostic {
  ruleId: string;
  severity: Severity;
  message: string;
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
  endLine: number;
  endColumn: number;
  /** The offending source text. */
  source: string;
  /** What to write instead, e.g. `bg-destructive` or `<Button>`. */
  suggestion?: string;
  /** Edits that apply the suggestion, when it can be done mechanically. */
  fix?: TextEdit[];
}

export interface CheckResult {
  file: string;
  diagnostics: Diagnostic[];
  errorCount: number;
  warningCount: number;
}
