import Link from 'next/link';
import type { ReactNode } from 'react';

import { ArrowUpRightIcon } from '@/components/icons';
import { NavLink } from '@/components/nav-link';
import { DOCS_PAGES } from '@/lib/docs';
import { REPO } from '@/lib/site';

const item =
  'block rounded-md border border-line px-2.5 py-1.5 text-[13.5px] text-muted transition-colors hover:text-fg aria-[current=page]:border-cyan/40 aria-[current=page]:bg-cyan/10 aria-[current=page]:text-fg lg:border-transparent lg:px-2.5 lg:py-1.5 lg:aria-[current=page]:border-transparent';

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <div className="glow pointer-events-none absolute inset-x-0 top-0 h-120" aria-hidden="true" />
      <div className="relative mx-auto grid w-full max-w-6xl gap-8 px-4 pt-10 pb-16 sm:px-6 sm:pt-14 sm:pb-24 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14">
        <nav aria-label="Docs" className="lg:sticky lg:top-20 lg:self-start">
          <p className="font-mono text-[11px] tracking-[0.14em] text-subtle uppercase">Docs</p>
          <ul className="mt-3 flex flex-wrap gap-1.5 lg:grid lg:gap-0.5">
            {DOCS_PAGES.map((page) => (
              <li key={page.href}>
                <NavLink href={page.href} exact className={item}>
                  {page.title}
                </NavLink>
              </li>
            ))}
            <li className="lg:mt-3">
              <Link href="/rules" className={item}>
                Rules
              </Link>
            </li>
            <li>
              <Link href="/playground" className={item}>
                Playground
              </Link>
            </li>
            <li>
              <a href={`${REPO}#readme`} className={`${item} inline-flex items-center gap-1`}>
                README
                <ArrowUpRightIcon className="size-3.5 text-subtle" />
              </a>
            </li>
          </ul>
        </nav>
        {children}
      </div>
    </div>
  );
}
