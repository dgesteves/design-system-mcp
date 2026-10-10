import type { Metadata } from 'next';

import { DocPage, docsMetadata } from '@/components/doc-page';
import { ArrowUpRightIcon } from '@/components/icons';
import { MarkdownBlocks } from '@/components/markdown-blocks';
import { docs } from '@/lib/data';
import { CURSOR_INSTALL, VSCODE_INSTALL } from '@/lib/site';

export const metadata: Metadata = docsMetadata('/docs/clients');

const button =
  'group inline-flex items-center gap-2 rounded-lg border border-line-strong bg-raised-2 px-3.5 py-2 text-sm font-medium text-fg transition-colors hover:border-cyan/60';

export default function ClientsPage() {
  return (
    <DocPage href="/docs/clients" file="docs/clients.md">
      <div className="mb-10 flex flex-wrap gap-3">
        <a href={CURSOR_INSTALL} className={button}>
          Install in Cursor
          <ArrowUpRightIcon className="size-4 text-subtle group-hover:text-cyan" />
        </a>
        <a href={VSCODE_INSTALL} className={button}>
          Install in VS Code
          <ArrowUpRightIcon className="size-4 text-subtle group-hover:text-cyan" />
        </a>
      </div>
      <MarkdownBlocks markdown={docs.clients} />
    </DocPage>
  );
}
