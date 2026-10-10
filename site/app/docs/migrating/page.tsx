import type { Metadata } from 'next';

import { DocPage, docsMetadata } from '@/components/doc-page';
import { MarkdownBlocks } from '@/components/markdown-blocks';
import { docs } from '@/lib/data';

export const metadata: Metadata = docsMetadata('/docs/migrating');

export default function MigratingPage() {
  return (
    <DocPage href="/docs/migrating" file="docs/migrating.md">
      <MarkdownBlocks markdown={docs.migrating} />
    </DocPage>
  );
}
