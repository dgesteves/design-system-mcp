import type { Metadata } from 'next';

import { DocPage, docsMetadata } from '@/components/doc-page';
import { InlineMarkdown } from '@/components/markdown';
import { MarkdownBlocks, slug } from '@/components/markdown-blocks';
import { docs } from '@/lib/data';

export const metadata: Metadata = docsMetadata('/docs/faq');

const FAQ: [question: string, answer: string][] = [
  [
    'Does my code leave my machine?',
    'No. The server and the CLI run where you run them: they read your files with the TypeScript compiler and apply the rules, with no model calls, no API key and no network requests. Your agent sends its context to its own model, as it does with any tool. The [playground](/playground) is the one exception: it sends what you type to this site, which checks it and does not store it.',
  ],
  [
    'Is there a model behind it?',
    'No. The agent is already the model; what it lacks is ground truth. Everything here is deterministic static analysis that takes milliseconds and can be tested rule by rule. The trade-off: it cannot judge intent, such as whether a `Dialog` was the right call. That stays with the agent and the reviewer.',
  ],
  [
    'How is it different from @shadcn/lint?',
    '@shadcn/lint is a linter: it polices the classes written against a component and the theme, in React, Svelte and Vue, on Tailwind v4. design-system-mcp gives the agent the components, props, variants and tokens before it writes, and catches what does not exist (components, props, variant values), native elements the design system wraps and icon buttons without a name, on Tailwind v3 or v4. Running both in CI is a sensible setup.',
  ],
  [
    'Why not Storybook MCP?',
    'It is a good fit if you run Storybook: it serves stories and a component manifest from a running instance, and can run component tests. design-system-mcp reads the source, so it works in projects without Storybook, and in CI.',
  ],
  [
    'Why not describe the design system in CLAUDE.md or AGENTS.md?',
    'A static list goes stale, and agents still guess prop values and colors. Here the agent asks for the component it is about to use and gets checked afterwards. One line in `CLAUDE.md`, `AGENTS.md` or `.cursor/rules` still helps clients that ignore the server\'s instructions: _"Before writing UI, use the design-system tools. Run check_ui on every file you change and fix all errors."_',
  ],
  [
    'My components are not in components/ui. Do I need a config?',
    'Not if the app has a shadcn/ui `components.json`, imports a workspace package named like a design system (`@acme/ui`), is the design-system package itself, or keeps its components in a flat `src/` that wraps React Aria, Radix or another primitives library: [zero config](/docs/configuration#zero-config) finds those. Otherwise a config file with a `components` glob is enough. `npx -y @dgesteves/design-system-mcp inspect` prints what was found.',
  ],
  [
    "Will check fail on my design system's own components?",
    'No. `check` skips the files `components` matches: they implement the scale and the primitives the rules enforce. `--include-design-system` lints them too.',
  ],
  [
    'Is the Claude Code plugin safe to install everywhere?',
    'Yes. The hook stays quiet in projects without a design system, only reports on what Claude just changed, and honours a baseline.',
  ],
  [
    'Does it work with Vue, Svelte or Angular?',
    'Not yet: React only (`.tsx` and `.jsx`). Angular and Web Components extraction is first on the roadmap.',
  ],
  [
    'It flagged something that is fine. What now?',
    'Turn the rule off or allow the value in the [config](/rules#configure), and please open an issue with the snippet and the output of `inspect`. A linter lives or dies on false positives, so those are the reports I most want.',
  ],
  [
    'What does it need to run?',
    'Node.js 20.19 or later (22.18 or later for a TypeScript config file). On native Windows, wrap the command as `cmd /c npx ...`.',
  ],
];

export default function FaqPage() {
  return (
    <DocPage href="/docs/faq" source={['limits']}>
      <div className="grid gap-8">
        {FAQ.map(([question, answer]) => (
          <section key={question} aria-labelledby={slug(question)}>
            <h2
              id={slug(question)}
              className="scroll-mt-20 text-lg font-semibold tracking-tight text-fg"
            >
              {question}
            </h2>
            <p className="mt-2 leading-relaxed text-muted">
              <InlineMarkdown text={answer} />
            </p>
          </section>
        ))}
      </div>
      <div className="mt-14 border-t border-line pt-10">
        <MarkdownBlocks markdown={`## Limits\n\n${docs.limits}`} />
      </div>
    </DocPage>
  );
}
