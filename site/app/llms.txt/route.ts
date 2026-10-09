import { llmsTxt } from '@/lib/llms';

// Written once per build, from the same generated data as the pages.
export const dynamic = 'force-static';

export function GET() {
  return new Response(llmsTxt(), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
