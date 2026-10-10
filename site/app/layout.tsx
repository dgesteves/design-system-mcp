import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { SITE_URL } from '@/lib/site';

import { mono, sans } from './fonts';

import './globals.css';

const title = 'onsystem: keeps coding agents on your design system';
const description =
  'Keeps coding agents on your design system: it knows your real components, props, variants and tokens, catches the moment an agent invents one and has it fix it, and the same check gates your PRs. Local, zero config, works alongside @shadcn/lint.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: title, template: '%s · onsystem' },
  description,
  applicationName: 'onsystem',
  authors: [{ name: 'Diogo Esteves', url: 'https://github.com/dgesteves' }],
  keywords: [
    'design system',
    'design system linter',
    'agent guardrails',
    'Claude Code plugin',
    'Claude Code hook',
    'CI',
    'MCP server',
    'shadcn/ui',
    'React',
    'Tailwind CSS',
    'coding agents',
    'Cursor',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'onsystem',
    title,
    description,
    url: '/',
  },
  twitter: { card: 'summary_large_image', title, description },
};

export const viewport: Viewport = {
  themeColor: '#0d0f12',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-sans">
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
