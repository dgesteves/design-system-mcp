import { CopyButton } from '@/components/copy-button';
import { ArrowUpRightIcon, StarIcon } from '@/components/icons';
import { CURSOR_INSTALL, NPX, PLUGIN_COMMANDS, REPO, VSCODE_INSTALL } from '@/lib/site';

const label = 'font-mono text-[11px] tracking-[0.14em] text-subtle uppercase';

/** Every way in, in the order most people need them: the plugin, one-click editors, any client. */
export function InstallPanel({ className = '' }: { className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-line bg-raised/90 shadow-[0_24px_80px_-32px_rgb(0_0_0/0.8)] ${className}`}
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <p className={label}>
            Claude Code plugin
            <span className="ml-2 tracking-normal normal-case max-sm:hidden">
              · hook, server, skill
            </span>
          </p>
          <CopyButton
            text={PLUGIN_COMMANDS}
            label="Copy the two plugin commands"
            className="-my-1"
          />
        </div>
        <pre className="code mt-2.5 rounded-lg border border-line bg-ink/70 px-3 py-2.5 text-[12px] leading-relaxed whitespace-pre-wrap text-fg-soft">
          {PLUGIN_COMMANDS.split('\n').map((line) => (
            <span key={line} className="block">
              {/* Wrap between words only: `dgesteves/onsystem` stays whole. */}
              {line.split(' ').map((word, i) => (
                <span key={i}>
                  {i > 0 && ' '}
                  <span className={`whitespace-nowrap ${i === 0 ? 'text-cyan-bright' : ''}`}>
                    {word}
                  </span>
                </span>
              ))}
            </span>
          ))}
        </pre>
      </div>
      <div className="grid grid-cols-2 border-y border-line">
        <a
          href={CURSOR_INSTALL}
          className="group flex items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-fg transition-colors hover:bg-white/[0.03] sm:px-5"
        >
          Install in Cursor
          <ArrowUpRightIcon className="size-4 shrink-0 text-subtle transition-colors group-hover:text-cyan" />
        </a>
        <a
          href={VSCODE_INSTALL}
          className="group flex items-center justify-between gap-2 border-l border-line px-4 py-3 text-sm font-medium text-fg transition-colors hover:bg-white/[0.03] sm:px-5"
        >
          Install in VS Code
          <ArrowUpRightIcon className="size-4 shrink-0 text-subtle transition-colors group-hover:text-cyan" />
        </a>
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <p className={label}>Any MCP client, over stdio</p>
          <CopyButton text={NPX} label="Copy the npx command" className="-my-1" />
        </div>
        <pre className="code mt-2.5 rounded-lg border border-line bg-ink/70 px-3 py-2.5 text-[12px] leading-relaxed whitespace-pre-wrap text-fg-soft">
          <span className="text-subtle select-none">$ </span>
          {NPX}
        </pre>
      </div>
    </div>
  );
}

export function StarButton({ className = '' }: { className?: string }) {
  return (
    <a
      href={REPO}
      className={`inline-flex items-center gap-2 rounded-lg border border-line-strong bg-raised-2 px-3.5 py-2 text-sm font-medium text-fg transition-colors hover:border-cyan/60 hover:bg-[#1c2229] ${className}`}
    >
      <StarIcon className="size-4 text-cyan" />
      Star on GitHub
    </a>
  );
}
