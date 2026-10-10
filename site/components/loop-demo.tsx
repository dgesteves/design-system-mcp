'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Line } from '@/components/code';
import { CheckIcon, PauseIcon, PlayIcon } from '@/components/icons';
import { highlightLines } from '@/lib/highlight';

export interface LoopFinding {
  ruleId: string;
  /** Offsets into the draft. */
  start: number;
  end: number;
  severity: 'error' | 'warning';
  line: number;
  column: number;
  found: string;
  fix: string;
  message: string;
}

export interface LoopDemoProps {
  prompt: string;
  file: string;
  /** The code as the agent wrote it, and after the fixes. */
  draftCode: string;
  fixedCode: string;
  findings: LoopFinding[];
  /** What the agent changed, as offsets into `fixedCode`. */
  changes: { start: number; end: number }[];
  errorCount: number;
  warningCount: number;
}

const STEPS = [
  { label: 'Write', caption: 'The agent writes the card from what it learned in training.' },
  { label: 'check_ui', caption: 'It runs check_ui on the file. Every finding comes with a fix.' },
  {
    label: 'Fix',
    caption:
      'It applies the fixes, and makes the calls a linter leaves to it: which Badge variant, where the inline style goes.',
  },
  { label: 'Clean', caption: 'check_ui again: nothing left for code review to catch.' },
] as const;

type Step = 0 | 1 | 2 | 3;
type Pane = 'code' | 'agent';

/** Milliseconds: one line typed, one finding listed, and how long each step holds. */
const TIMING = { line: 55, finding: 150, hold: [900, 4200, 3400, 3800] };

/**
 * The loop on the demo design system, as a scripted session: the agent writes a component,
 * check_ui reports what is wrong with it, the agent fixes it and checks again. It plays while
 * it is on screen. With reduced motion it shows the end state, and the steps can be clicked
 * through. Below the lg breakpoint the editor and the transcript share one pane.
 */
export function LoopDemo({
  prompt,
  file,
  draftCode,
  fixedCode,
  findings,
  changes,
  errorCount,
  warningCount,
}: LoopDemoProps) {
  // Highlighted the same way on the server and in the browser, from the plain code.
  const draft = useMemo(
    () =>
      highlightLines(
        draftCode,
        'tsx',
        findings.map((f, id) => ({ start: f.start, end: f.end, kind: f.severity, id })),
      ),
    [draftCode, findings],
  );
  const fixed = useMemo(
    () =>
      highlightLines(
        fixedCode,
        'tsx',
        changes.map((c) => ({ ...c, kind: 'changed' })),
      ),
    [fixedCode, changes],
  );
  // Server render and first paint: the draft as written, before the check.
  const [step, setStep] = useState<Step>(0);
  const [typed, setTyped] = useState(draft.length);
  const [listed, setListed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(false);
  const [active, setActive] = useState<number | undefined>(undefined);
  const [chosenPane, setChosenPane] = useState<Pane | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null);

  const show = (next: Step) => {
    setStep(next);
    setTyped(draft.length);
    setListed(next >= 1 ? findings.length : 0);
    setChosenPane(undefined);
  };

  // Starts the first time the demo is on screen: playing, or with reduced motion at the end.
  const started = useRef(false);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const onScreen = Boolean(entry?.isIntersecting);
        setVisible(onScreen);
        if (!onScreen || started.current) return;
        started.current = true;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          setStep(3);
          setListed(findings.length);
        } else {
          setPlaying(true);
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [findings.length]);

  // The timeline: one timer at a time, only while playing and on screen.
  useEffect(() => {
    if (!playing || !visible) return;
    let delay: number;
    let advance: () => void;
    if (step === 0 && typed < draft.length) {
      delay = TIMING.line;
      advance = () => {
        setTyped((n) => n + 1);
      };
    } else if (step === 1 && listed < findings.length) {
      delay = listed === 0 ? 450 : TIMING.finding;
      advance = () => {
        setListed((n) => n + 1);
      };
    } else {
      delay = TIMING.hold[step] ?? 3000;
      advance = () => {
        if (step === 3) {
          setStep(0);
          setTyped(0);
          setListed(0);
        } else {
          setStep((step + 1) as Step);
        }
      };
    }
    const timer = setTimeout(advance, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [playing, visible, step, typed, listed, draft.length, findings.length]);

  const pane: Pane = chosenPane ?? (step === 0 || step === 2 ? 'code' : 'agent');
  const code = step >= 2 ? fixed : draft;
  const lines = Math.max(draft.length, fixed.length);
  const shownFindings = findings.slice(0, listed);
  const findingLines = new Map<number, 'error' | 'warning'>();
  for (const f of shownFindings) {
    if (findingLines.get(f.line) !== 'error') findingLines.set(f.line, f.severity);
  }
  const shownErrors = shownFindings.filter((f) => f.severity === 'error').length;
  const status =
    step === 0
      ? `${String(draft.length)} lines, unchecked`
      : step === 1
        ? `${count(shownErrors, 'error')} · ${count(shownFindings.length - shownErrors, 'warning')}`
        : step === 2
          ? `${String(findings.length)} findings resolved`
          : 'No design-system problems';

  const paneClass = (which: Pane) =>
    `min-w-0 [grid-area:1/1] lg:[grid-area:auto] ${pane === which ? '' : 'max-lg:invisible'}`;

  return (
    <div
      ref={root}
      className="overflow-hidden rounded-2xl border border-line bg-raised shadow-[0_40px_120px_-40px_rgb(0_0_0/0.9)]"
    >
      {/* Window chrome, with the pane switch on small screens */}
      <div className="flex items-center gap-3 border-b border-line bg-[#11151a] px-4 py-2">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
        </div>
        <p className="min-w-0 flex-1 truncate font-mono text-xs text-subtle max-lg:hidden lg:text-center">
          ~/acme-app — agent session
        </p>
        <div
          className="ml-auto flex rounded-md border border-line bg-ink/60 p-0.5 lg:hidden"
          role="group"
          aria-label="Show"
        >
          {(['agent', 'code'] as const).map((which) => (
            <button
              key={which}
              type="button"
              aria-pressed={pane === which}
              onClick={() => {
                setPlaying(false);
                setChosenPane(which);
              }}
              className="cursor-pointer rounded px-2.5 py-1 font-mono text-[11px] text-muted aria-pressed:bg-raised-2 aria-pressed:text-fg"
            >
              {which === 'agent' ? 'Agent' : 'Editor'}
            </button>
          ))}
        </div>
        <span className="w-[42px] max-lg:hidden" aria-hidden="true" />
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        {/* Editor */}
        <div className={`${paneClass('code')} lg:border-r lg:border-line`}>
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
            <span className="truncate font-mono text-xs text-fg-soft">{file}</span>
            <span
              className={`shrink-0 font-mono text-[11px] ${step === 1 ? 'text-magenta-soft' : step === 3 ? 'text-cyan' : 'text-subtle'}`}
            >
              {status}
            </span>
          </div>
          <pre
            tabIndex={0}
            className="code overflow-x-auto py-3 text-[11.5px] leading-[1.75] sm:text-[12.5px]"
            style={{ minHeight: `calc(${String(lines)}lh + 1.5rem)` }}
          >
            <code className="block min-w-max">
              {code.map((segments, i) => {
                const hidden = step === 0 && i >= typed;
                const severity = step === 1 ? findingLines.get(i + 1) : undefined;
                const shown = segments.map((s) => {
                  if (!s.mark) return s;
                  if (s.mark.kind === 'changed') return step === 2 ? s : { ...s, mark: undefined };
                  const id = s.mark.id ?? -1;
                  if (step !== 1 || id >= listed) return { ...s, mark: undefined };
                  return id === active ? { ...s, mark: { ...s.mark, kind: 'active' } } : s;
                });
                return (
                  <span key={i} className={`flex ${hidden ? 'invisible' : ''}`}>
                    <span
                      className="relative w-10 shrink-0 pr-3 text-right text-[11px] text-subtle select-none sm:w-11"
                      aria-hidden="true"
                    >
                      {severity && (
                        <span
                          className={`absolute top-1/2 left-1.5 size-1.5 -translate-y-1/2 rounded-full ${severity === 'error' ? 'bg-magenta' : 'bg-cyan'}`}
                        />
                      )}
                      {i + 1}
                    </span>
                    <span className="pr-4">
                      <Line segments={shown} />
                      {step === 0 && playing && i === typed - 1 && typed < draft.length && (
                        <span className="caret ml-px inline-block h-[1.1em] w-[7px] translate-y-[2px] bg-cyan/80" />
                      )}
                    </span>
                  </span>
                );
              })}
            </code>
          </pre>
        </div>

        {/* Agent transcript */}
        <div
          className={`${paneClass('agent')} p-4 font-mono text-[12px] leading-relaxed sm:p-5 sm:text-[12.5px]`}
        >
          <p className="flex gap-2.5 text-fg">
            <span className="text-cyan" aria-hidden="true">
              ›
            </span>
            {prompt}
          </p>
          <ol className="mt-4 grid gap-3">
            <Event dot="muted">
              <span className="text-muted">Write</span> <span className="text-fg-soft">{file}</span>{' '}
              <span className="text-subtle">+{draft.length} lines</span>
            </Event>
            <Event dot="cyan" hidden={step < 1}>
              <span className="text-cyan-bright">onsystem</span>
              <span className="text-subtle"> · </span>
              <span className="text-cyan-bright">check_ui</span>{' '}
              <span className="text-muted">(path: &quot;{file}&quot;)</span>
            </Event>
          </ol>

          <div
            className={`mt-3 rounded-xl border border-line bg-raised-2 transition-opacity duration-300 ${step < 1 ? 'invisible opacity-0' : ''}`}
          >
            <p className="flex flex-wrap items-baseline gap-x-2 border-b border-line px-3.5 py-2.5">
              <span className="font-medium text-magenta-soft">{errorCount} errors</span>
              <span className="text-subtle">·</span>
              <span className="font-medium text-cyan">{warningCount} warnings</span>
              <span className="text-subtle">each with a rule id, a location and a fix</span>
            </p>
            <ul className="grid gap-px py-1.5">
              {findings.map((f, i) => (
                <li
                  key={i}
                  onMouseEnter={() => {
                    setActive(i);
                  }}
                  onMouseLeave={() => {
                    setActive(undefined);
                  }}
                  title={f.message}
                  className={`grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 px-3.5 py-0.5 leading-[1.55] sm:py-1 ${i >= listed ? 'invisible' : step === 1 && playing ? 'rise' : ''} ${active === i && step === 1 ? 'bg-white/[0.04]' : ''}`}
                >
                  <span className="pt-[7px]" aria-hidden="true">
                    {step >= 2 ? (
                      <CheckIcon className="-mt-[3px] -ml-[3px] size-3 text-cyan" />
                    ) : (
                      <span
                        className={`block size-1.5 rounded-full ${f.severity === 'error' ? 'bg-magenta' : 'bg-cyan'}`}
                      />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="flex gap-2 text-[11.5px]">
                      <span className="text-subtle">
                        {f.line}:{f.column}
                      </span>
                      <span className="truncate text-muted">{f.ruleId}</span>
                      <span className="sr-only">{f.severity}</span>
                    </span>
                    <span className="block break-words text-fg-soft">
                      <span
                        className={step >= 2 ? 'text-subtle line-through decoration-subtle/60' : ''}
                      >
                        {f.found}
                      </span>
                      <span className="text-subtle"> → </span>
                      <span className="text-cyan-bright">{f.fix}</span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <ol className="mt-4 grid gap-3">
            <Event dot="muted" hidden={step < 2}>
              <span className="text-muted">Edit</span> <span className="text-fg-soft">{file}</span>{' '}
              <span className="text-subtle">resolved all {findings.length} findings</span>
            </Event>
            <Event dot="cyan" hidden={step < 3}>
              <span className="text-cyan-bright">check_ui</span>{' '}
              <CheckIcon className="inline size-4 -translate-y-px text-cyan" />{' '}
              <span className="text-fg-soft">No design-system problems</span>
            </Event>
          </ol>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-t border-line bg-[#11151a] px-3 py-3 sm:px-4">
        <button
          type="button"
          onClick={() => {
            if (!playing && step === 3) {
              setStep(0);
              setTyped(0);
              setListed(0);
            }
            setChosenPane(undefined);
            setPlaying((p) => !p);
          }}
          aria-label={playing ? 'Pause the demo' : 'Play the demo'}
          className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-line bg-raised-2 text-fg-soft transition-colors hover:border-line-strong hover:text-fg"
        >
          {playing ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
        </button>
        <ol className="flex flex-1 flex-wrap gap-0.5 sm:gap-1" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s.label}>
              <button
                type="button"
                onClick={() => {
                  setPlaying(false);
                  show(i as Step);
                }}
                aria-current={step === i ? 'step' : undefined}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-transparent px-2 py-1.5 font-mono text-xs text-muted transition-colors hover:text-fg aria-[current=step]:border-line aria-[current=step]:bg-raised-2 aria-[current=step]:text-fg sm:px-2.5"
              >
                <span className="text-subtle max-sm:hidden">{i + 1}</span>
                {s.label}
              </button>
            </li>
          ))}
        </ol>
        <p
          className="w-full text-[13px] leading-snug text-muted lg:w-auto lg:max-w-md lg:text-right"
          aria-live={playing ? 'off' : 'polite'}
        >
          {STEPS[step].caption}
        </p>
      </div>
    </div>
  );
}

function count(n: number, noun: string): string {
  return `${String(n)} ${noun}${n === 1 ? '' : 's'}`;
}

function Event({
  dot,
  hidden = false,
  children,
}: {
  dot: 'muted' | 'cyan';
  hidden?: boolean;
  children: ReactNode;
}) {
  return (
    <li className={`flex gap-2.5 ${hidden ? 'invisible' : 'rise'}`}>
      <span
        className={`mt-[7px] size-2 shrink-0 rounded-full ${dot === 'cyan' ? 'bg-cyan' : 'bg-line-strong'}`}
        aria-hidden="true"
      />
      <span className="min-w-0 break-words">{children}</span>
    </li>
  );
}
