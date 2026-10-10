import type { Metadata } from 'next';

import { DocPage, docsMetadata } from '@/components/doc-page';
import { MarkdownBlocks } from '@/components/markdown-blocks';
import { docs } from '@/lib/data';
import { repoLink } from '@/lib/site';

export const metadata: Metadata = docsMetadata('/docs/plugin');

// The skill's own title is the page's; its sections become this page's.
const skill = docs.skill.replace(/^# .*\n+/, '');

export default function PluginPage() {
  return (
    <DocPage href="/docs/plugin" file="docs/plugin.md">
      <MarkdownBlocks markdown={docs.plugin} />
      <h2
        id="the-skill"
        className="mt-12 scroll-mt-20 text-2xl font-semibold tracking-tight text-fg"
      >
        What the skill tells Claude
      </h2>
      <p className="mt-4 leading-relaxed text-muted">
        Claude loads it by itself for UI work, or with{' '}
        <code className="rounded bg-white/[0.06] px-1 py-px font-mono text-[0.88em] text-fg-soft">
          /onsystem:onsystem
        </code>
        . This is its text, from{' '}
        <a
          href={repoLink('plugins/onsystem/skills/onsystem/SKILL.md')}
          className="text-fg underline decoration-line-strong underline-offset-4 hover:decoration-cyan"
        >
          SKILL.md
        </a>
        :
      </p>
      <div className="mt-6 rounded-2xl border border-line bg-raised p-5 sm:p-6">
        <MarkdownBlocks markdown={skill} shift={0} />
      </div>
    </DocPage>
  );
}
