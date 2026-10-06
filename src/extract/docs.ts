import type { ComponentDocs, ComponentInfo, DocSection, ExampleInfo } from '../types.js';
import { pascalCase } from '../util/strings.js';

export interface ParsedDoc {
  file: string;
  title?: string;
  description?: string;
  sections: DocSection[];
  examples: ExampleInfo[];
  frontmatter: Record<string, string | string[]>;
}

const EXAMPLE_LANGS = new Set(['tsx', 'jsx', 'ts', 'js', 'typescript', 'javascript']);

interface Fence {
  marker: string;
  lang: string;
  title?: string;
  lines: string[];
}

/**
 * Parses a component's Markdown/MDX page into a description, sections and
 * runnable examples. MDX `import`/`export` lines are dropped; JSX in prose is
 * kept as text.
 */
export function parseDoc(text: string, file: string): ParsedDoc {
  const { frontmatter, body } = splitFrontmatter(text.replace(/\r\n/g, '\n'));
  const doc: ParsedDoc = { file, sections: [], examples: [], frontmatter };

  let heading: string | undefined;
  let buffer: string[] = [];
  let fence: Fence | undefined;
  let preamble: string[] = [];

  /** Example-language blocks become examples; the rest stay in the prose. */
  const closeFence = (block: Fence) => {
    if (EXAMPLE_LANGS.has(block.lang)) {
      const example: ExampleInfo = {
        code: dedent(block.lines.join('\n')),
        lang: block.lang,
        source: 'docs',
      };
      const title = block.title ?? heading;
      if (title) example.title = title;
      doc.examples.push(example);
    } else {
      buffer.push(`${block.marker}${block.lang}`, ...block.lines, block.marker);
    }
  };

  const flush = () => {
    const content = buffer.join('\n').trim();
    if (heading !== undefined) doc.sections.push({ heading, body: content });
    else preamble = buffer;
    buffer = [];
  };

  for (const line of body.split('\n')) {
    if (fence) {
      // Only a bare fence of the same character, at least as long, closes it:
      // a "```tsx" line inside a "```md" block is content.
      const close = /^\s*(`{3,}|~{3,})\s*$/.exec(line)?.[1];
      if (close && close[0] === fence.marker[0] && close.length >= fence.marker.length) {
        closeFence(fence);
        fence = undefined;
      } else {
        fence.lines.push(line);
      }
      continue;
    }
    const open = /^\s*(`{3,}|~{3,})\s*([\w-]*)(.*)$/.exec(line);
    if (open) {
      const title = /title=["']([^"']+)["']/.exec(open[3] ?? '')?.[1];
      fence = { marker: open[1] ?? '```', lang: (open[2] ?? '').toLowerCase(), lines: [] };
      if (title) fence.title = title;
      continue;
    }
    if (/^(import|export)\s/.test(line)) continue;
    const h1 = /^#\s+(.+)$/.exec(line);
    if (h1 && doc.title === undefined) {
      doc.title = h1[1]?.trim();
      continue;
    }
    const h2 = /^##\s+(.+)$/.exec(line);
    if (h2) {
      flush();
      heading = h2[1]?.trim() ?? '';
      continue;
    }
    buffer.push(line);
  }
  // As in CommonMark, an unclosed fence runs to the end of the document.
  if (fence) closeFence(fence);
  flush();

  const description =
    stringValue(frontmatter.description) ??
    preamble
      .join('\n')
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .find((p) => p && !p.startsWith('<'));
  if (description) doc.description = description.replace(/\s*\n\s*/g, ' ');
  return doc;
}

/** Component names a doc page documents: frontmatter `component(s)`, the H1, or the file name. */
export function docTargets(doc: ParsedDoc): string[] {
  const declared = doc.frontmatter.component ?? doc.frontmatter.components;
  if (declared) return Array.isArray(declared) ? declared : [declared];
  const names: string[] = [];
  if (doc.title) names.push(doc.title.replace(/\s+/g, ''));
  const base = doc.file.split('/').pop() ?? '';
  names.push(pascalCase(base.replace(/\.(md|mdx)$/i, '')));
  return names;
}

/** Attaches docs and their examples to components. Returns warnings for unmatched pages. */
export function attachDocs(components: ComponentInfo[], docs: ParsedDoc[]): string[] {
  const warnings: string[] = [];
  const byName = new Map<string, ComponentInfo>();
  for (const component of components) {
    for (const name of [component.name, ...component.aliases])
      byName.set(name.toLowerCase(), component);
  }
  for (const doc of docs) {
    const targets = docTargets(doc);
    const explicit = Boolean(doc.frontmatter.component ?? doc.frontmatter.components);
    const matched = explicit
      ? targets.map((t) => byName.get(t.toLowerCase())).filter((c) => c !== undefined)
      : [targets.map((t) => byName.get(t.toLowerCase())).find((c) => c !== undefined)].filter(
          (c) => c !== undefined,
        );
    if (!matched.length) {
      warnings.push(`${doc.file}: no component named ${targets[0] ?? '(unknown)'}`);
      continue;
    }
    for (const component of matched) {
      const docs: ComponentDocs = {
        file: doc.file,
        sections: doc.sections,
        frontmatter: doc.frontmatter,
      };
      if (doc.description) {
        docs.description = doc.description;
        component.description ??= doc.description;
      }
      component.docs = docs;
      component.examples = [...doc.examples, ...component.examples];
    }
  }
  return warnings;
}

function splitFrontmatter(text: string): {
  frontmatter: Record<string, string | string[]>;
  body: string;
} {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) return { frontmatter: {}, body: text };
  const frontmatter: Record<string, string | string[]> = {};
  let listKey: string | undefined;
  for (const line of (match[1] ?? '').split('\n')) {
    const item = /^\s+-\s+(.+)$/.exec(line);
    if (item && listKey) {
      const list = frontmatter[listKey];
      frontmatter[listKey] = [...(Array.isArray(list) ? list : []), unquote(item[1] ?? '')];
      continue;
    }
    const pair = /^([\w-]+):\s*(.*)$/.exec(line);
    if (!pair?.[1]) continue;
    const key = pair[1];
    const value = (pair[2] ?? '').trim();
    listKey = undefined;
    if (!value) {
      listKey = key;
      frontmatter[key] = [];
    } else if (value.startsWith('[') && value.endsWith(']')) {
      frontmatter[key] = value
        .slice(1, -1)
        .split(',')
        .map((v) => unquote(v.trim()))
        .filter(Boolean);
    } else {
      frontmatter[key] = unquote(value);
    }
  }
  return { frontmatter, body: text.slice(match[0].length) };
}

function unquote(value: string): string {
  return value.replace(/^(['"])(.*)\1$/, '$2');
}

function stringValue(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function dedent(code: string): string {
  const lines = code.replace(/^\n+|\s+$/g, '').split('\n');
  const indent = Math.min(
    ...lines.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)?.[0].length ?? 0),
  );
  return lines.map((l) => l.slice(Number.isFinite(indent) ? indent : 0)).join('\n');
}
