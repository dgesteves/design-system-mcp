import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { SITE_URL } from '@/lib/site';

import { mono, sans } from './fonts';

import './globals.css';

const title = 'design-system-mcp: your design system, as ground truth for coding agents';
const description =
  'An MCP server and Claude Code plugin that gives coding agents your React components, props, cva variants and tokens, and check_ui, a linter they run on their own UI. Static analysis, no API key.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: title, template: '%s · design-system-mcp' },
  description,
  applicationName: 'design-system-mcp',
  authors: [{ name: 'Diogo Esteves', url: 'https://github.com/dgesteves' }],
  keywords: [
    'MCP server',
    'design system',
    'Claude Code plugin',
    'shadcn/ui',
    'React',
    'Tailwind CSS',
    'linter',
    'coding agents',
    'Cursor',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'design-system-mcp',
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
