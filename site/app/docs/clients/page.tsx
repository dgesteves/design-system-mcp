import type { Metadata } from 'next';
import Link from 'next/link';

import { DocPage, docsMetadata } from '@/components/doc-page';
import { ArrowUpRightIcon } from '@/components/icons';
import { InlineMarkdown } from '@/components/markdown';
import { MarkdownBlocks } from '@/components/markdown-blocks';
import { docs } from '@/lib/data';
import { CURSOR_INSTALL, VSCODE_INSTALL } from '@/lib/site';

export const metadata: Metadata = docsMetadata('/docs/clients');

const button =
  'group inline-flex items-center gap-2 rounded-lg border border-line-strong bg-raised-2 px-3.5 py-2 text-sm font-medium text-fg transition-colors hover:border-cyan/60';

export default function ClientsPage() {
  return (
    <DocPage
      href="/docs/clients"
      source={['setup', 'cursor-and-vs-code', 'other-clients']}
      lead={<InlineMarkdown text={docs.setup} />}
    >
      <div className="flex flex-wrap gap-3">
        <a href={CURSOR_INSTALL} className={button}>
          Install in Cursor
          <ArrowUpRightIcon className="size-4 text-subtle group-hover:text-cyan" />
        </a>
        <a href={VSCODE_INSTALL} className={button}>
          Install in VS Code
          <ArrowUpRightIcon className="size-4 text-subtle group-hover:text-cyan" />
        </a>
      </div>
      <p className="mt-6 leading-relaxed text-muted">
        In Claude Code, use the{' '}
        <Link
          href="/docs/plugin"
          className="text-fg underline decoration-line-strong underline-offset-4 hover:decoration-cyan"
        >
          plugin
        </Link>
        : it adds the lint-on-edit hook and the skill on top of the server.
      </p>
      <div className="mt-10">
        <MarkdownBlocks
          markdown={`### Cursor and VS Code\n\n${docs.cursorVsCode}\n\n### Other clients\n\n${docs.otherClients}`}
          shift={1}
        />
      </div>
    </DocPage>
  );
}
