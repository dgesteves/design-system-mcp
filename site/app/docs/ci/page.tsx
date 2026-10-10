import type { Metadata } from 'next';

import { DocPage, docsMetadata } from '@/components/doc-page';
import { MarkdownBlocks } from '@/components/markdown-blocks';
import { docs } from '@/lib/data';

export const metadata: Metadata = docsMetadata('/docs/ci');

export default function CiPage() {
  return (
    <DocPage href="/docs/ci" file="docs/ci.md">
      <MarkdownBlocks markdown={docs.ci} />
    </DocPage>
  );
}
