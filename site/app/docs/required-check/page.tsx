import type { Metadata } from 'next';

import { DocPage, docsMetadata } from '@/components/doc-page';
import { MarkdownBlocks } from '@/components/markdown-blocks';
import { docs } from '@/lib/data';

export const metadata: Metadata = docsMetadata('/docs/required-check');

export default function RequiredCheckPage() {
  return (
    <DocPage href="/docs/required-check" file="docs/required-check.md">
      <MarkdownBlocks markdown={docs.requiredCheck} />
    </DocPage>
  );
}
