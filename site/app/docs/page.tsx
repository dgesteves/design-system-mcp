import type { Metadata } from 'next';

import { DocPage, docsMetadata } from '@/components/doc-page';
import { InstallPanel } from '@/components/install';
import { MarkdownBlocks } from '@/components/markdown-blocks';
import { docs } from '@/lib/data';

export const metadata: Metadata = docsMetadata('/docs');

export default function QuickstartPage() {
  return (
    <DocPage
      href="/docs"
      file="docs/quickstart.md"
      lead={
        <p>
          From nothing to an agent that is held to your design system, and pull requests that are
          checked against it. Four steps, a couple of minutes.
        </p>
      }
    >
      <InstallPanel className="mb-10" />
      <MarkdownBlocks markdown={docs.quickstart} />
    </DocPage>
  );
}
