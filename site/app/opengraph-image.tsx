import { ImageResponse } from 'next/og';

import { HomeCard, ogFonts } from '@/lib/og';

export const alt =
  'onsystem keeps any coding agent on your design system. An agent session where check_ui lists 8 errors and 3 warnings, each with a fix, and the corrected file comes back clean; 10/10 clean components with the plugin, 6/10 without.';
export const size = { width: 1280, height: 640 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    <HomeCard width={size.width} height={size.height} footer="design-system-mcp-demo.vercel.app" />,
    { ...size, fonts: await ogFonts() },
  );
}
