import { CopyButton } from '@/components/copy-button';
import { highlightLines, type Lang, type Segment } from '@/lib/highlight';

/** One line of highlighted segments. */
export function Line({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((segment, i) => (
        <span
          key={i}
          className={`tok-${segment.kind}${segment.mark ? ` mark-${segment.mark.kind}` : ''}`}
        >
          {segment.text}
        </span>
      ))}
    </>
  );
}

/** A highlighted block of code, with an optional title bar and copy button. */
export function Code({
  code,
  lang,
  title,
  copy,
  className = '',
  wrap = false,
}: {
  code: string;
  lang: Lang;
  title?: string;
  /** Accessible name of the copy button; no button without it. */
  copy?: string;
  className?: string;
  wrap?: boolean;
}) {
  const lines = highlightLines(code, lang);
  return (
    <div
      className={`min-w-0 overflow-hidden rounded-xl border border-line bg-[#101317] ${className}`}
    >
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
          <span className="truncate font-mono text-xs text-muted">{title}</span>
          {copy && (
            <CopyButton text={stripPrompts(code, lang)} label={copy} className="-mr-2 size-7" />
          )}
        </div>
      )}
      <div className="relative">
        <pre
          tabIndex={0}
          className={`code overflow-x-auto px-4 py-3.5 text-[12.5px] leading-[1.7] ${wrap ? 'whitespace-pre-wrap' : ''}`}
        >
          <code>
            {lines.map((segments, i) => (
              <span key={i} className="block min-h-[1lh]">
                <Line segments={segments} />
              </span>
            ))}
          </code>
        </pre>
        {copy && !title && (
          <CopyButton
            text={stripPrompts(code, lang)}
            label={copy}
            className="absolute top-2.5 right-2.5"
          />
        )}
      </div>
    </div>
  );
}

/** What to copy from a shell transcript: the commands, without prompts or output. */
function stripPrompts(code: string, lang: Lang): string {
  if (lang !== 'sh' || !code.includes('$ ')) return code;
  return code
    .split('\n')
    .filter((line) => line.startsWith('$ '))
    .map((line) => line.slice(2))
    .join('\n');
}
