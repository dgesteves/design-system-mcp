import type { Metadata } from 'next';

import { DocPage, docsMetadata } from '@/components/doc-page';
import { MarkdownBlocks } from '@/components/markdown-blocks';
import { docs } from '@/lib/data';

export const metadata: Metadata = docsMetadata('/docs/configuration');

export default function ConfigurationPage() {
  return (
    <DocPage
      href="/docs/configuration"
      source={['zero-config', 'config-file']}
      lead={
        <p>
          Most projects need no config: the server finds the design system the way your app imports
          it. Other layouts take a few globs.
        </p>
      }
    >
      <MarkdownBlocks
        markdown={`### Zero config\n\n${docs.zeroConfig}\n\n### Config file\n\n${docs.configFile}`}
        shift={1}
      />
    </DocPage>
  );
}
