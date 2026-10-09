import { ImageResponse } from 'next/og';

import { C, Dot, ogFonts, PageCard, Panel } from '@/lib/og';
import { playground } from '@/lib/playground';

export const alt =
  'The check_ui playground: a snippet with variant="green", variant="primary", size="small" and arbitrary values, and the fixes check_ui suggests for each.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const snippet = playground.presets.find((p) => p.id === 'snippet');
  const findings = snippet?.result.diagnostics ?? [];
  return new ImageResponse(
    <PageCard
      {...size}
      eyebrow="Playground"
      title="Try check_ui on a real design system."
      lead="Edit a component and see every finding with its fix, as the agent does. Parsed on the server, never run."
      aside={
        <Panel>
          <span style={{ color: C.subtle, fontSize: 14 }}>
            {snippet?.result.errorCount} errors · {snippet?.result.warningCount} warnings
          </span>
          {findings.map((d, i) => (
            <div
              key={i}
              style={{ display: 'flex', alignItems: 'center', gap: 12, whiteSpace: 'nowrap' }}
            >
              <Dot error={d.severity === 'error'} />
              <span style={{ color: C.fgSoft }}>
                {d.ruleId === 'no-unknown-variant' && d.suggestion
                  ? `${d.suggestion.split('=')[0] ?? ''}=${d.source}`
                  : d.source}
              </span>
              <span style={{ color: C.subtle }}>→</span>
              {d.suggestion ? (
                <span style={{ color: C.cyanBright }}>{d.suggestion}</span>
              ) : (
                <span style={{ color: C.subtle }}>no token has this hue</span>
              )}
            </div>
          ))}
        </Panel>
      }
    />,
    { ...size, fonts: await ogFonts() },
  );
}
