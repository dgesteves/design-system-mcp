import type { Metadata } from 'next';

import { DocPage, docsMetadata } from '@/components/doc-page';
import { MarkdownBlocks } from '@/components/markdown-blocks';
import { docs } from '@/lib/data';

export const metadata: Metadata = docsMetadata('/docs/tools');

export default function ToolsPage() {
  return (
    <DocPage href="/docs/tools" source={['tools']}>
      <MarkdownBlocks markdown={docs.tools} />
    </DocPage>
  );
}
