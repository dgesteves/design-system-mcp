import type { Metadata } from 'next';

import { DocPage, docsMetadata } from '@/components/doc-page';
import { MarkdownBlocks } from '@/components/markdown-blocks';
import { docs } from '@/lib/data';

export const metadata: Metadata = docsMetadata('/docs/configuration');

export default function ConfigurationPage() {
  return (
    <DocPage href="/docs/configuration" file="docs/configuration.md">
      <MarkdownBlocks markdown={docs.configuration} />
    </DocPage>
  );
}
