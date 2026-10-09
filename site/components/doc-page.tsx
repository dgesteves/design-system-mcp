import Link from 'next/link';
import type { ReactNode } from 'react';

import { ArrowRightIcon } from '@/components/icons';
import { Eyebrow } from '@/components/section';
import { docsPage, type DocsHref } from '@/lib/docs';
import { readmeLink } from '@/lib/site';

/** The frame of a docs page: title, lead, content, where it comes from, and the next page. */
export function DocPage({
  href,
  lead,
  source,
  children,
}: {
  href: DocsHref;
  lead?: ReactNode;
  /** README section anchors the page is generated from. */
  source?: string[];
  children: ReactNode;
}) {
  const { page, previous, next } = docsPage(href);
  return (
    <main id="main" className="min-w-0">
      <Eyebrow>Docs</Eyebrow>
      <h1 className="mt-3 text-[2rem] leading-[1.1] font-semibold tracking-[-0.025em] text-balance text-fg sm:text-[2.4rem]">
        {page.title}
      </h1>
      {lead && (
        <div className="mt-4 max-w-3xl text-base leading-relaxed text-muted sm:text-[17px]">
          {lead}
        </div>
      )}
      <div className="mt-10 max-w-3xl">{children}</div>

      {source && source.length > 0 && (
        <p className="mt-12 max-w-3xl border-t border-line pt-5 text-[13px] text-subtle">
          Generated from the README when the site is built:{' '}
          {source.map((anchor, i) => (
            <span key={anchor}>
              {i > 0 && ', '}
              <a
                href={readmeLink(anchor)}
                className="text-muted underline decoration-line-strong underline-offset-4 hover:text-fg"
              >
                #{anchor}
              </a>
            </span>
          ))}
          .
        </p>
      )}

      <nav aria-label="Previous and next" className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-2">
        {previous ? (
          <Link
            href={previous.href}
            className="rounded-xl border border-line bg-raised px-4 py-3 transition-colors hover:border-line-strong"
          >
            <span className="block text-[12px] text-subtle">Previous</span>
            <span className="text-[15px] font-medium text-fg">{previous.title}</span>
          </Link>
        ) : (
          <span className="hidden sm:block" />
        )}
        {next && (
          <Link
            href={next.href}
            className="group rounded-xl border border-line bg-raised px-4 py-3 text-right transition-colors hover:border-line-strong"
          >
            <span className="block text-[12px] text-subtle">Next</span>
            <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-fg">
              {next.title}
              <ArrowRightIcon className="size-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-cyan" />
            </span>
          </Link>
        )}
      </nav>
    </main>
  );
}

export function docsMetadata(href: DocsHref) {
  const { page } = docsPage(href);
  return {
    title: page.href === '/docs' ? 'Docs: quickstart' : page.title,
    description: page.description,
    alternates: { canonical: page.href },
    openGraph: {
      title: `${page.title} · design-system-mcp`,
      description: page.description,
      url: page.href,
    },
    twitter: { title: `${page.title} · design-system-mcp`, description: page.description },
  };
}
