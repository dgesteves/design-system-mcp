import { LogoMark } from '@/components/logo';
import { AUTHOR, MORE, NPM, REGISTRY, REPO, VERSION, repoLink } from '@/lib/site';

const link = 'text-muted transition-colors hover:text-fg';

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1.6fr]">
        <div className="max-w-xs">
          <div className="flex items-center gap-2.5">
            <LogoMark className="size-6" />
            <span className="font-mono text-[13px] font-semibold text-fg">design-system-mcp</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Ground truth about your React design system for coding agents, and a linter they run on
            their own UI. MIT licensed, version {VERSION}.
          </p>
        </div>
        <nav aria-label="Project">
          <h2 className="font-mono text-[11px] tracking-[0.14em] text-subtle uppercase">Project</h2>
          <ul className="mt-3 grid gap-2 text-sm">
            <li>
              <a className={link} href={REPO}>
                GitHub
              </a>
            </li>
            <li>
              <a className={link} href={NPM}>
                npm
              </a>
            </li>
            <li>
              <a className={link} href={REGISTRY}>
                MCP Registry
              </a>
            </li>
            <li>
              <a className={link} href={repoLink('CHANGELOG.md')}>
                Changelog
              </a>
            </li>
            <li>
              <a className={link} href={`${REPO}/issues`}>
                Issues
              </a>
            </li>
          </ul>
        </nav>
        <nav aria-label="More by Diogo Esteves">
          <h2 className="font-mono text-[11px] tracking-[0.14em] text-subtle uppercase">
            More by {AUTHOR.name}
          </h2>
          <ul className="mt-3 grid gap-3 text-sm">
            {MORE.map((project) => (
              <li key={project.name}>
                <a className="group block" href={project.url}>
                  <span className="font-mono text-[13px] text-fg-soft transition-colors group-hover:text-cyan-bright">
                    {project.name}
                  </span>
                  <span className="mt-0.5 block text-muted">{project.description}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-line/60">
        <p className="mx-auto w-full max-w-6xl px-4 py-5 text-xs text-subtle sm:px-6">
          Built by{' '}
          <a
            className="text-muted underline decoration-line-strong underline-offset-4 hover:text-fg"
            href={AUTHOR.url}
          >
            {AUTHOR.name}
          </a>
          . The demo, findings, rules and benchmark on this site are generated from the repository
          when it is built.
        </p>
      </div>
    </footer>
  );
}
