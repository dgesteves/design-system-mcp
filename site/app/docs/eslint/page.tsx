import type { Metadata } from 'next';

import { DocPage, docsMetadata } from '@/components/doc-page';
import { MarkdownBlocks } from '@/components/markdown-blocks';
import { docs } from '@/lib/data';

export const metadata: Metadata = docsMetadata('/docs/eslint');

export default function EslintPage() {
  return (
    <DocPage href="/docs/eslint" file="docs/eslint.md">
      <MarkdownBlocks markdown={docs.eslint} />
    </DocPage>
  );
}
