import type { Metadata } from 'next';
import Link from 'next/link';

import { Line } from '@/components/code';
import { CheckIcon } from '@/components/icons';
import { InlineMarkdown } from '@/components/markdown';
import { MarkdownBlocks } from '@/components/markdown-blocks';
import { Eyebrow, InlineCode, TextLink } from '@/components/section';
import { ruleCatalog, type RuleEntry } from '@/lib/data';
import { highlightLines, type Mark } from '@/lib/highlight';
import { pageMetadata } from '@/lib/metadata';
import { repoLink } from '@/lib/site';

const description =
  'Every check_ui and check rule, generated from the source: what it catches, why it matters, the fix it suggests, and a real example run on a demo design system.';

export const metadata: Metadata = pageMetadata({
  title: 'Rules',
  socialTitle: 'onsystem rules',
  description,
  path: '/rules',
});

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-line bg-[#101317]">
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-2">
        <span className="font-mono text-xs text-fg-soft">{title}</span>
        {note && <span className="text-right font-mono text-[11px] text-subtle">{note}</span>}
      </div>
      {children}
    </div>
  );
}

function MarkedCode({ code, marks }: { code: string; marks: Mark[] }) {
  return (
    <pre
      tabIndex={0}
      className="code overflow-x-auto px-4 py-3 text-[12.5px] leading-[1.7] whitespace-pre-wrap [overflow-wrap:anywhere]"
    >
      <code>
        {highlightLines(code.trimEnd(), 'tsx', marks).map((segments, i) => (
          <span key={i} className="block min-h-[1lh]">
            <Line segments={segments} />
          </span>
        ))}
      </code>
    </pre>
  );
}

function Severity({ severity }: { severity: RuleEntry['severity'] }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11px] ${severity === 'error' ? 'border-magenta/40 text-magenta-soft' : 'border-cyan/40 text-cyan'}`}
    >
      <span
        className={`size-1.5 rounded-full ${severity === 'error' ? 'bg-magenta' : 'bg-cyan'}`}
        aria-hidden="true"
      />
      {severity === 'error' ? 'error' : 'warning'} by default
    </span>
  );
}

function Rule({ rule }: { rule: RuleEntry }) {
  const bad: Mark[] = rule.findings.map((f, id) => ({
    start: f.start,
    end: f.end,
    kind: f.severity,
    id,
  }));
  const good: Mark[] = rule.changes.map((c) => ({ ...c, kind: 'changed' }));
  return (
    <section
      id={rule.id}
      aria-labelledby={`${rule.id}-title`}
      className="scroll-mt-20 border-t border-line pt-10 pb-14 first:border-t-0 first:pt-0"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2
          id={`${rule.id}-title`}
          className="font-mono text-lg font-medium tracking-tight text-fg sm:text-xl"
        >
          <a href={`#${rule.id}`} className="hover:text-cyan-bright">
            {rule.id}
          </a>
        </h2>
        <Severity severity={rule.severity} />
      </div>
      <p className="mt-3 text-[16px] leading-relaxed text-fg-soft">
        <InlineMarkdown text={rule.description} />
      </p>

      <dl className="mt-6 grid gap-5 text-[14.5px] leading-relaxed md:grid-cols-2">
        <div>
          <dt className="font-mono text-[11px] tracking-[0.14em] text-subtle uppercase">Catches</dt>
          <dd className="mt-1.5 text-muted">
            <InlineMarkdown text={rule.catches} />
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] tracking-[0.14em] text-subtle uppercase">
            Suggests
          </dt>
          <dd className="mt-1.5 text-muted">
            <InlineMarkdown text={rule.suggests} />
          </dd>
        </div>
        <div className="md:col-span-2">
          <dt className="font-mono text-[11px] tracking-[0.14em] text-subtle uppercase">
            Why it matters
          </dt>
          <dd className="mt-1.5 text-muted">
            <InlineMarkdown text={rule.why} />
          </dd>
        </div>
      </dl>

      <div className="mt-7 grid gap-3 lg:grid-cols-2">
        <Panel title="What the agent wrote">
          <MarkedCode code={rule.bad} marks={bad} />
        </Panel>
        <Panel
          title="After the fix"
          note={rule.fixedBy === 'rule' ? 'the rule’s own fixes' : 'fixed by hand'}
        >
          <MarkedCode code={rule.good} marks={good} />
        </Panel>
      </div>
      <div className="mt-3">
        <Panel title="check_ui">
          <ol className="grid divide-y divide-line/70">
            {rule.findings.map((f, i) => (
              <li key={i} className="px-4 py-3 text-[14px] leading-relaxed">
                <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-[11.5px]">
                  <span className={f.severity === 'error' ? 'text-magenta-soft' : 'text-cyan'}>
                    {f.severity}
                  </span>
                  <span className="text-subtle">
                    {f.line}:{f.column}
                  </span>
                  {f.fixable && (
                    <span className="inline-flex items-center gap-1 text-subtle">
                      <CheckIcon className="size-3 text-cyan" />
                      fix included
                    </span>
                  )}
                </p>
                <p className="mt-1 text-fg-soft">
                  <InlineMarkdown text={f.message} />
                </p>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      {rule.allow && (
        <p className="mt-5 text-[14px] leading-relaxed text-muted">
          <span className="font-medium text-fg-soft">Option.</span>{' '}
          <InlineMarkdown text={rule.allow} />
        </p>
      )}
    </section>
  );
}

export default function RulesPage() {
  const { rules, version, details, suppression } = ruleCatalog;
  return (
    <main id="main" className="relative">
      <div className="glow pointer-events-none absolute inset-x-0 top-0 h-140" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-6xl px-4 pt-12 pb-16 sm:px-6 sm:pt-16 sm:pb-24">
        <div className="max-w-3xl">
          <Eyebrow>Rules</Eyebrow>
          <h1 className="mt-3 text-[2rem] leading-[1.1] font-semibold tracking-[-0.025em] text-balance text-fg sm:text-[2.6rem]">
            Eight rules. Every finding says what to write instead.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted sm:text-[17px]">
            <InlineCode>check_ui</InlineCode> for the agent, and <InlineCode>check</InlineCode> for
            CI and the Claude Code hook, run the same rules against the design system read from your
            source. This page is generated from version {version}: each example below went through
            the real linter on the{' '}
            <TextLink href={repoLink('examples/shadcn-demo', 'tree')}>demo design system</TextLink>{' '}
            when the site was built. Try your own in the{' '}
            <Link
              href="/playground"
              className="text-fg underline decoration-line-strong underline-offset-4 hover:decoration-cyan"
            >
              playground
            </Link>
            .
          </p>
        </div>

        <div className="mt-10 grid gap-10 lg:mt-14 lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:gap-10">
          <nav aria-label="Rules" className="lg:sticky lg:top-20 lg:self-start">
            <p className="font-mono text-[11px] tracking-[0.14em] text-subtle uppercase">
              On this page
            </p>
            <ul className="mt-3 flex flex-wrap gap-1.5 lg:grid lg:gap-0.5">
              {rules.map((rule) => (
                <li key={rule.id}>
                  <a
                    href={`#${rule.id}`}
                    className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 font-mono text-[12px] text-muted transition-colors hover:text-fg lg:border-transparent lg:px-2 lg:py-1"
                  >
                    <span
                      className={`size-1.5 shrink-0 rounded-full ${rule.severity === 'error' ? 'bg-magenta' : 'bg-cyan'}`}
                      aria-hidden="true"
                    />
                    {rule.id}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href="#configure"
                  className="flex rounded-md border border-line px-2.5 py-1.5 text-[13px] text-muted transition-colors hover:text-fg lg:mt-3 lg:border-transparent lg:px-2 lg:py-1"
                >
                  Configuring the rules
                </a>
              </li>
              <li>
                <a
                  href="#suppressing-findings"
                  className="flex rounded-md border border-line px-2.5 py-1.5 text-[13px] text-muted transition-colors hover:text-fg lg:border-transparent lg:px-2 lg:py-1"
                >
                  Suppressing findings
                </a>
              </li>
              <li>
                <a
                  href="#fixes"
                  className="flex rounded-md border border-line px-2.5 py-1.5 text-[13px] text-muted transition-colors hover:text-fg lg:border-transparent lg:px-2 lg:py-1"
                >
                  How fixes are chosen
                </a>
              </li>
            </ul>
          </nav>

          <div className="min-w-0">
            {rules.map((rule) => (
              <Rule key={rule.id} rule={rule} />
            ))}

            <section
              id="configure"
              aria-labelledby="configure-title"
              className="scroll-mt-20 border-t border-line pt-10 pb-12"
            >
              <h2 id="configure-title" className="text-xl font-semibold tracking-tight text-fg">
                Configuring the rules
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">
                Set a rule to <InlineCode>&quot;off&quot;</InlineCode>,{' '}
                <InlineCode>&quot;warn&quot;</InlineCode> or{' '}
                <InlineCode>&quot;error&quot;</InlineCode>, or give it values to accept with{' '}
                <InlineCode>
                  [severity, {'{'} &quot;allow&quot;: [...] {'}'}]
                </InlineCode>
                , in <InlineCode>onsystem.config.json</InlineCode>. Rules that need tokens skip
                themselves when the design system has none of that kind, and code that does not
                parse is reported under <InlineCode>syntax</InlineCode>.{' '}
                <Link
                  href="/docs/configuration#config-file"
                  className="text-fg underline decoration-line-strong underline-offset-4 hover:decoration-cyan"
                >
                  The config file
                </Link>{' '}
                covers the rest.
              </p>
              <pre
                tabIndex={0}
                className="code mt-4 overflow-x-auto rounded-xl border border-line bg-[#101317] px-4 py-3 text-[12.5px] leading-[1.7]"
              >
                <code>
                  {highlightLines(
                    `{
  "rules": {
    "no-hardcoded-spacing": "error",
    "no-hardcoded-color": ["error", { "allow": ["#fff"] }],
    "icon-button-accessible-name": "off"
  }
}`,
                    'json',
                  ).map((segments, i) => (
                    <span key={i} className="block">
                      <Line segments={segments} />
                    </span>
                  ))}
                </code>
              </pre>
            </section>

            <section
              id="suppressing-findings"
              aria-labelledby="suppressing-findings-title"
              className="scroll-mt-20 border-t border-line pt-10 pb-12"
            >
              <h2
                id="suppressing-findings-title"
                className="text-xl font-semibold tracking-tight text-fg"
              >
                Suppressing findings
              </h2>
              <div className="mt-3">
                <MarkdownBlocks markdown={suppression} />
              </div>
            </section>

            <section
              id="fixes"
              aria-labelledby="fixes-title"
              className="scroll-mt-20 border-t border-line pt-10"
            >
              <h2 id="fixes-title" className="text-xl font-semibold tracking-tight text-fg">
                How fixes are chosen
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">
                <InlineMarkdown text={details} />
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
