import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { ArrowRightIcon } from '@/components/icons';
import { Eyebrow } from '@/components/section';
import { docsPage, type DocsHref } from '@/lib/docs';
import { pageMetadata } from '@/lib/metadata';
import { repoLink } from '@/lib/site';

/** The frame of a docs page: title, lead, content, where it comes from, and the next page. */
export function DocPage({
  href,
  lead,
  file,
  children,
}: {
  href: DocsHref;
  lead?: ReactNode;
  /** The file in the repository the page is generated from, such as `docs/ci.md`. */
  file?: string;
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

      {file && (
        <p className="mt-12 max-w-3xl border-t border-line pt-5 text-[13px] text-subtle">
          Generated from{' '}
          <a
            href={repoLink(file)}
            className="text-muted underline decoration-line-strong underline-offset-4 hover:text-fg"
          >
            {file}
          </a>{' '}
          when the site is built.
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

export function docsMetadata(href: DocsHref): Metadata {
  const { page } = docsPage(href);
  return pageMetadata({
    title: page.href === '/docs' ? 'Docs: quickstart' : page.title,
    description: page.description,
    path: page.href,
    // app/docs/opengraph-image.tsx covers /docs; the pages under it point at the same card.
    image: page.href === '/docs' ? undefined : '/docs/opengraph-image',
  });
}
