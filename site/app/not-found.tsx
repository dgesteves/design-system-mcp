import Link from 'next/link';

import { Eyebrow } from '@/components/section';

export default function NotFound() {
  return (
    <main id="main" className="relative">
      <div className="glow pointer-events-none absolute inset-x-0 top-0 h-120" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-3xl px-4 py-24 sm:px-6 sm:py-32">
        <Eyebrow>404</Eyebrow>
        <h1 className="mt-3 text-[2rem] leading-[1.1] font-semibold tracking-[-0.025em] text-fg sm:text-[2.6rem]">
          <span className="font-mono text-[0.85em]">&lt;Page.NotFound&gt;</span> does not exist.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted sm:text-[17px]">
          Did you mean one of these?
        </p>
        <ul className="mt-6 flex flex-wrap gap-2">
          {[
            ['/', 'Home'],
            ['/docs', 'Docs'],
            ['/rules', 'Rules'],
            ['/playground', 'Playground'],
          ].map(([href = '/', label]) => (
            <li key={href}>
              <Link
                href={href}
                className="inline-flex rounded-lg border border-line bg-raised px-3.5 py-2 text-sm text-fg-soft transition-colors hover:border-line-strong hover:text-fg"
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
