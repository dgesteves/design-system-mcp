import type { ReactNode } from 'react';

import { docsHref, repoLink } from '@/lib/site';

/** Where a README link points from the site: anchors and relative paths go to GitHub. */
export function resolveReadmeHref(href: string): string {
  if (/^https?:\/\//.test(href) || href.startsWith('/')) return href;
  if (href.startsWith('#')) return docsHref(href.slice(1));
  return repoLink(href.replace(/^\.\//, ''), /\.[a-z]+$/i.test(href) ? 'blob' : 'tree');
}

/**
 * Inline Markdown from the README: `code`, [links](...), **bold** and _italics_. Enough for
 * table cells and short paragraphs; anything else stays as text.
 */
export function InlineMarkdown({ text }: { text: string }): ReactNode {
  const parts: ReactNode[] = [];
  const pattern = /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|(?<!\w)_(\S.*?)_(?!\w)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index;
    if (index > last) parts.push(text.slice(last, index));
    const [, code, label, href, bold, italic] = match;
    const key = parts.length;
    if (code !== undefined) {
      parts.push(
        <code
          key={key}
          className="rounded bg-white/[0.06] px-1 py-px font-mono text-[0.9em] text-fg-soft"
        >
          {code}
        </code>,
      );
    } else if (label !== undefined && href !== undefined) {
      parts.push(
        <a
          key={key}
          href={resolveReadmeHref(href)}
          className="text-fg underline decoration-line-strong underline-offset-4 hover:decoration-cyan"
        >
          <InlineMarkdown text={label} />
        </a>,
      );
    } else if (bold !== undefined) {
      parts.push(
        <strong key={key} className="font-semibold text-fg">
          {bold}
        </strong>,
      );
    } else if (italic !== undefined) {
      parts.push(<em key={key}>{italic}</em>);
    }
    last = index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
