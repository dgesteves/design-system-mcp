import type { Metadata } from 'next';
import type { StaticImageData } from 'next/image';

import architectureSvg from '../../../../.github/assets/architecture.svg';

import { DocPage, docsMetadata } from '@/components/doc-page';
import { MarkdownBlocks } from '@/components/markdown-blocks';
import { docs } from '@/lib/data';

export const metadata: Metadata = docsMetadata('/docs/how-it-works');

// The diagram is a Markdown image in the file; here it is the repository's SVG, served by the site.
// Next.js types an SVG import as `any`; it is a static image like any other.
const architecture = architectureSvg as StaticImageData;
const IMAGE = /^!\[([^\]]*)\]\([^)]*architecture\.svg\)$/m;
const alt = IMAGE.exec(docs.howItWorks)?.[1] ?? '';
const markdown = docs.howItWorks.replace(IMAGE, '');

export default function HowItWorksPage() {
  return (
    <DocPage href="/docs/how-it-works" file="docs/how-it-works.md">
      <MarkdownBlocks markdown={markdown.slice(0, markdown.indexOf('\n\n'))} />
      {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG diagram */}
      <img
        src={architecture.src}
        width={architecture.width}
        height={architecture.height}
        alt={alt}
        className="my-8 h-auto w-full rounded-xl border border-line"
      />
      <MarkdownBlocks markdown={markdown.slice(markdown.indexOf('\n\n'))} />
    </DocPage>
  );
}
