import { ImageResponse } from 'next/og';

import { DOCS_PAGES } from '@/lib/docs';
import { C, ogFonts, PageCard, Panel } from '@/lib/og';

export const alt =
  'design-system-mcp docs: quickstart, setup for each agent, the Claude Code plugin, configuration, tools, CI and the FAQ.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    <PageCard
      {...size}
      eyebrow="Docs"
      title="Install in a minute. Configure with a few globs, or not at all."
      lead="Quickstart, setup for each agent, the Claude Code plugin, configuration, CI and baselines."
      aside={
        <Panel>
          {DOCS_PAGES.map((page, i) => (
            <div key={page.href} style={{ display: 'flex', gap: 14 }}>
              <span style={{ color: C.subtle }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ color: C.fgSoft }}>{page.title}</span>
            </div>
          ))}
        </Panel>
      }
    />,
    { ...size, fonts: await ogFonts() },
  );
}
