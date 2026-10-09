import type { Metadata } from 'next';

import { DocPage, docsMetadata } from '@/components/doc-page';
import { MarkdownBlocks } from '@/components/markdown-blocks';
import { docs } from '@/lib/data';

export const metadata: Metadata = docsMetadata('/docs/ci');

export default function CiPage() {
  return (
    <DocPage href="/docs/ci" source={['ci', 'adopting-it-in-an-existing-codebase']}>
      <MarkdownBlocks
        markdown={`${docs.ci}\n\n### Adopting it in an existing codebase\n\n${docs.baseline}`}
        shift={1}
      />
    </DocPage>
  );
}
