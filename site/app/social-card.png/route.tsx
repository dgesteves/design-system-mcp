import { ImageResponse } from 'next/og';

import { HomeCard, ogFonts } from '@/lib/og';

// The repository's social preview (Settings → Social preview takes 1280×640), drawn from the
// same data as the site's cards. Not linked from the site.
export const dynamic = 'force-static';

export async function GET() {
  return new ImageResponse(
    <HomeCard width={1280} height={640} footer="github.com/dgesteves/design-system-mcp" />,
    { width: 1280, height: 640, fonts: await ogFonts() },
  );
}
