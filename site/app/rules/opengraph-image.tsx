import { ImageResponse } from 'next/og';

import { ruleCatalog } from '@/lib/data';
import { C, Dot, ogFonts, PageCard, Panel } from '@/lib/og';

export const alt =
  'The onsystem rules: eight rules, from no-hardcoded-color to icon-button-accessible-name, each with a fix.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const { rules } = ruleCatalog;
  return new ImageResponse(
    <PageCard
      {...size}
      eyebrow="Rules"
      title={`${String(rules.length)} rules. Every finding says what to write instead.`}
      lead="Hardcoded values, invented components, props and variants, native elements and unnamed icon buttons."
      aside={
        <Panel>
          {rules.map((rule) => (
            <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Dot error={rule.severity === 'error'} />
              <span style={{ color: C.fgSoft, flex: 1 }}>{rule.id}</span>
              <span
                style={{ color: rule.severity === 'error' ? C.magentaSoft : C.cyan, fontSize: 14 }}
              >
                {rule.severity}
              </span>
            </div>
          ))}
        </Panel>
      }
    />,
    { ...size, fonts: await ogFonts() },
  );
}
