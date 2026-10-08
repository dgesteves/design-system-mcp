import type { ReactNode } from 'react';

import { Code } from '@/components/code';
import { InlineMarkdown } from '@/components/markdown';
import type { Lang } from '@/lib/highlight';

/**
 * Renders the Markdown the README uses in the sections the docs show: headings, paragraphs,
 * fenced code, lists (with code inside items), tables and the `<details>` blocks that hold
 * per-client configs. It is not a general Markdown parser; scripts/generate.mjs picks the
 * sections, and anything outside that subset shows up as plain text rather than breaking.
 */

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'code'; lang: string; code: string }
  | { type: 'list'; ordered: boolean; items: Block[][] }
  | { type: 'table'; header: string[]; rows: string[][] };

const LANGS: Record<string, Lang> = {
  tsx: 'tsx',
  jsx: 'tsx',
  ts: 'tsx',
  js: 'tsx',
  json: 'json',
  sh: 'sh',
  bash: 'sh',
  toml: 'toml',
  yaml: 'yaml',
  yml: 'yaml',
};

export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>|`/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());
}

export function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    // `<details>`: its summary becomes a heading; the closing tags carry nothing.
    const summary = /<summary>(?:<strong>)?(.*?)(?:<\/strong>)?<\/summary>/.exec(trimmed);
    if (summary?.[1]) {
      blocks.push({ type: 'heading', level: 4, text: summary[1] });
      i++;
      continue;
    }
    if (/^<\/?(details|p|div)\b[^>]*>$/.test(trimmed)) {
      i++;
      continue;
    }
    const heading = /^(#{2,6}) (.*)$/.exec(line);
    if (heading?.[1] && heading[2]) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }
    const fence = /^```(\w*)/.exec(trimmed);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i] ?? '')) body.push(lines[i++] ?? '');
      i++;
      blocks.push({ type: 'code', lang: fence[1] ?? '', code: body.join('\n') });
      continue;
    }
    if (trimmed.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('|')) {
        rows.push(cells(lines[i] ?? ''));
        i++;
      }
      const [header = [], , ...body] = rows;
      blocks.push({ type: 'table', header, rows: body });
      continue;
    }
    const item = /^(\s*)(?:[-*]|(\d+)\.) /.exec(line);
    if (item) {
      const ordered = item[2] !== undefined;
      const items: string[][] = [];
      while (i < lines.length) {
        const current = lines[i] ?? '';
        const start = /^(?:[-*]|\d+\.) (.*)$/.exec(current);
        if (start) {
          items.push([start[1] ?? '']);
          i++;
          continue;
        }
        // Continuation: indented lines, or a blank line followed by an indented one.
        if (/^\s{2,}\S/.test(current)) {
          items.at(-1)?.push(current.replace(/^\s{2,3}/, ''));
          i++;
          continue;
        }
        if (!current.trim() && /^\s{2,}\S/.test(lines[i + 1] ?? '')) {
          items.at(-1)?.push('');
          i++;
          continue;
        }
        break;
      }
      blocks.push({
        type: 'list',
        ordered,
        items: items.map((body) => parseBlocks(body.join('\n'))),
      });
      continue;
    }
    const paragraph: string[] = [];
    while (i < lines.length) {
      const current = lines[i] ?? '';
      if (
        !current.trim() ||
        /^(#{2,6} |```|\||(?:[-*]|\d+\.) )/.test(current.trim()) ||
        /^<\/?(details|summary|p)\b/.test(current.trim())
      ) {
        break;
      }
      paragraph.push(current.trim());
      i++;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
  }
  return blocks;
}

function Heading({ level, text }: { level: number; text: string }) {
  const id = slug(text);
  const content = <InlineMarkdown text={text} />;
  if (level <= 2) {
    return (
      <h2
        id={id}
        className="mt-12 scroll-mt-20 text-2xl font-semibold tracking-tight text-fg first:mt-0"
      >
        {content}
      </h2>
    );
  }
  return (
    <h3
      id={id}
      className="mt-9 scroll-mt-20 text-lg font-semibold tracking-tight text-fg first:mt-0"
    >
      {content}
    </h3>
  );
}

function Blocks({ blocks, shift }: { blocks: Block[]; shift: number }): ReactNode {
  return blocks.map((block, i) => {
    switch (block.type) {
      case 'heading':
        return <Heading key={i} level={Math.max(2, block.level - shift)} text={block.text} />;
      case 'paragraph':
        return (
          <p key={i} className="mt-4 leading-relaxed text-muted first:mt-0">
            <InlineMarkdown text={block.text} />
          </p>
        );
      case 'code':
        return (
          <Code
            key={i}
            code={block.code}
            lang={LANGS[block.lang] ?? 'text'}
            className="mt-4 first:mt-0"
            copy={block.lang === 'tsx' ? undefined : 'Copy the code'}
          />
        );
      case 'list': {
        const Tag = block.ordered ? 'ol' : 'ul';
        return (
          <Tag
            key={i}
            className={`mt-4 grid gap-2.5 pl-5 leading-relaxed text-muted marker:text-subtle first:mt-0 ${block.ordered ? 'list-decimal' : 'list-disc'}`}
          >
            {block.items.map((item, j) => (
              <li key={j} className="min-w-0 pl-1 [&>p]:mt-2 [&>p:first-child]:mt-0">
                <Blocks blocks={item} shift={shift} />
              </li>
            ))}
          </Tag>
        );
      }
      case 'table':
        return (
          <div key={i} className="mt-5 first:mt-0">
            {/* Narrow screens get one card per row; tables of prose do not fit. */}
            <ul className="grid gap-3 sm:hidden">
              {block.rows.map((row, j) => (
                <li key={j} className="rounded-xl border border-line bg-raised/60 px-4 py-3">
                  <p className="text-[14.5px] text-fg-soft">
                    <InlineMarkdown text={row[0] ?? ''} />
                  </p>
                  <dl className="mt-2 grid gap-2 text-[14px] leading-relaxed">
                    {row.slice(1).map((cell, k) => (
                      <div key={k}>
                        <dt className="font-mono text-[11px] tracking-[0.12em] text-subtle uppercase">
                          <InlineMarkdown text={block.header[k + 1] ?? ''} />
                        </dt>
                        <dd className="mt-0.5 break-words text-muted">
                          <InlineMarkdown text={cell} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-hidden rounded-xl border border-line sm:block">
              <table className="w-full text-left text-[14px]">
                <thead className="bg-raised">
                  <tr>
                    {block.header.map((cell, j) => (
                      <th
                        key={j}
                        scope="col"
                        className="px-4 py-2.5 align-bottom font-medium text-fg-soft"
                      >
                        <InlineMarkdown text={cell} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {block.rows.map((row, j) => (
                    <tr key={j}>
                      {row.map((cell, k) => (
                        <td
                          key={k}
                          className={`px-4 py-3 align-top leading-relaxed break-words ${k === 0 ? 'text-fg-soft' : 'text-muted'}`}
                        >
                          <InlineMarkdown text={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
    }
  });
}

/** README Markdown as page content. `shift` lowers heading levels: `###` → `h2` with 1. */
export function MarkdownBlocks({ markdown, shift = 0 }: { markdown: string; shift?: number }) {
  return (
    <div className="text-[15.5px]">
      <Blocks blocks={parseBlocks(markdown)} shift={shift} />
    </div>
  );
}
