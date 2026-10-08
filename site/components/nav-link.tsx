'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/** A header link that marks the page you are on. */
export function NavLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const current = !href.includes('#') && (pathname === href || pathname.startsWith(`${href}/`));
  return (
    <Link href={href} aria-current={current ? 'page' : undefined} className={className}>
      {children}
    </Link>
  );
}
