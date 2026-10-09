import Link from 'next/link';

import { GitHubIcon } from '@/components/icons';
import { NavLink } from '@/components/nav-link';
import { LogoMark } from '@/components/logo';
import { REPO, VERSION } from '@/lib/site';

export interface NavItem {
  href: string;
  label: string;
}

export const NAV: NavItem[] = [
  { href: '/#benchmark', label: 'Benchmark' },
  { href: '/playground', label: 'Playground' },
  { href: '/rules', label: 'Rules' },
  { href: '/docs', label: 'Docs' },
];

/** Shown on small screens too; the rest from md up. */
const ALWAYS = new Set(['Playground', 'Docs']);

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-ink/80 backdrop-blur-md">
      <a
        href="#main"
        className="sr-only rounded-md bg-cyan px-3 py-2 font-medium text-ink focus:not-sr-only focus:absolute focus:top-3 focus:left-4 focus:z-50"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-md">
          <LogoMark className="size-7" />
          <span className="font-mono text-[13px] font-semibold tracking-tight text-fg">
            design-system-mcp
          </span>
          <span className="hidden rounded-full border border-line px-1.5 py-px font-mono text-[11px] text-muted sm:inline">
            v{VERSION}
          </span>
        </Link>
        <nav aria-label="Site" className="ml-auto flex items-center gap-0.5 sm:gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              className={`rounded-md px-2 py-1.5 text-[13px] text-muted transition-colors hover:text-fg aria-[current=page]:text-fg ${ALWAYS.has(item.label) ? '' : 'hidden md:inline-block'}`}
            >
              {item.label}
            </NavLink>
          ))}
          <a
            href={REPO}
            className="ml-1 inline-flex size-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-line-strong hover:text-fg"
            aria-label="design-system-mcp on GitHub"
          >
            <GitHubIcon className="size-4" />
          </a>
        </nav>
      </div>
    </header>
  );
}
