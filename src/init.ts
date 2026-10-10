import fs from 'node:fs';
import path from 'node:path';

import { BASELINE_FILE, LEGACY_BASELINE_FILE } from './baseline.js';
import {
  CONFIG_FILES,
  DEFAULT_DOCS,
  LEGACY_CONFIG_FILES,
  type LoadConfigOptions,
} from './config.js';
import { componentFiles, tokenFiles } from './design-system.js';
import { relativePath } from './util/paths.js';
import { NAME } from './version.js';
import { loadTarget } from './workspace.js';

/** What `init` needs from the CLI it runs in. */
export interface InitIo {
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** Asks a question and resolves to the answer; undefined when there is no terminal to ask in. */
  prompt?: ((question: string) => Promise<string>) | undefined;
}

export interface InitOptions {
  yes: boolean;
  force: boolean;
  cache: boolean;
}

/** Runs `check` the way the CLI does, with its output captured. */
export type RunCheck = (
  args: string[],
  io: InitIo,
) => Promise<{ code: number; stdout: string; stderr: string }>;

const SCHEMA = 'https://unpkg.com/onsystem/schema.json';
/** More detected globs than this are files, not folders: zero config keeps them. */
const MAX_GLOBS = 6;

/**
 * Writes `onsystem.config.json` in the root from what zero config finds there, or from
 * the answers to up to three questions when it finds nothing, then checks the project
 * once without failing and offers to record what it found as the baseline.
 */
export async function init(
  configOptions: LoadConfigOptions,
  options: InitOptions,
  io: InitIo,
  runCheck: RunCheck,
): Promise<number> {
  const target = await loadTarget({ ...configOptions, config: undefined });
  const { config, workspace } = target;
  const root = config.root;
  const existing = [...CONFIG_FILES, ...LEGACY_CONFIG_FILES]
    .map((name) => path.join(root, name))
    .find((file) => fs.existsSync(file));
  if (existing && !options.force) {
    io.stderr(
      `init: ${relativePath(io.cwd, existing) || existing} already exists. Run \`${NAME} inspect --explain\` to see what it resolves to, or pass --force to write a new onsystem.config.json.`,
    );
    return 2;
  }
  const ask = options.yes ? undefined : io.prompt;

  const file: Record<string, unknown> = { $schema: SCHEMA };
  const notes: string[] = [];
  const relative = (abs: string) => relativePath(root, abs);
  if (configOptions.components?.length) {
    file.components = configOptions.components;
    if (configOptions.tokens?.length) file.tokens = configOptions.tokens;
    if (configOptions.docs?.length) file.docs = configOptions.docs;
  } else if (workspace) {
    // At a monorepo root, each project keeps zero config; the file holds what they share.
    notes.push(
      `This is a monorepo root: ${workspace.projects.length} of ${workspace.projects.length + workspace.others.length} workspace packages have a design system (${workspace.projects.map((p) => p.dir).join(', ') || 'none'}). Each keeps zero config; rules and overrides you add here apply to every project without a config of its own.`,
    );
  } else if (config.detected) {
    notes.push(`Found the design system through ${config.detected}.`);
    const specifiers = new Set((config.imports ?? []).map((m) => m.specifier));
    const tokens = (await tokenFiles(config)).map(relative);
    if (specifiers.size > 1) {
      notes.push(
        `"components" is left to zero config: apps import them by ${specifiers.size} specifiers from the package's exports (${[...specifiers].slice(0, 2).join(', ')}, …), which a config cannot spell.`,
      );
    } else if (config.components.length > MAX_GLOBS) {
      notes.push(
        `"components" is left to zero config: it found ${config.components.length} files through the package's exports, which it keeps following as the package changes.`,
      );
    } else {
      // The detected globs, spelled out; a package imported by one name keeps it.
      file.components = config.components;
      if ([...specifiers][0]) file.importPath = [...specifiers][0];
      // Docs found next to the detected components stay found.
      const docs = config.docs.filter((d) => !DEFAULT_DOCS.includes(d));
      if (docs.length) file.docs = [...DEFAULT_DOCS, ...docs];
    }
    if (tokens.length) file.tokens = tokens;
  } else {
    if (!ask) {
      io.stderr(
        `init: zero config found no design system in ${root}. Pass --components (and --tokens) to say where it is, or run init in a terminal to answer a few questions. \`${NAME} inspect --explain\` shows what it looked at.`,
      );
      return 2;
    }
    io.stdout(`Zero config found no design system in ${root}.`);
    let components = '';
    for (let attempt = 0; attempt < 3 && !components; attempt++) {
      const answer = (
        await ask(
          'Where are the components? A glob from the root, e.g. src/components/ui/**/*.tsx: ',
        )
      ).trim();
      if (!answer) continue;
      const matches = await componentFiles({ ...config, components: [answer] });
      if (matches.length) components = answer;
      else io.stdout(`No file matches ${answer}.`);
    }
    if (!components) {
      io.stderr('init: no components given; nothing written.');
      return 2;
    }
    file.components = [components];
    const tokens = (
      await ask('Where are the tokens? A CSS or DTCG .json file, or leave it empty: ')
    ).trim();
    if (tokens) {
      if (!fs.existsSync(path.resolve(root, tokens)) && !/[*?{]/.test(tokens)) {
        io.stdout(`${tokens} does not exist; it is left out.`);
      } else file.tokens = [tokens];
    }
    const importPath = (
      await ask(
        'How do apps import them? A package name such as @acme/ui, or leave it empty for tsconfig paths: ',
      )
    ).trim();
    if (importPath) file.importPath = importPath;
  }

  const out = path.join(root, 'onsystem.config.json');
  fs.writeFileSync(out, `${JSON.stringify(file, null, 2)}\n`);
  for (const note of notes) io.stdout(note);
  io.stdout(`Wrote ${relativePath(io.cwd, out) || out}.`);

  // A dry run: what `check .` reports with this config, by rule, without failing.
  const checkIo = { ...io, cwd: root };
  const dry = await runCheck(
    ['check', '.', '--format', 'json', ...(options.cache ? [] : ['--no-cache'])],
    checkIo,
  );
  let results: { diagnostics: { ruleId: string; severity: string }[] }[] = [];
  try {
    results = JSON.parse(dry.stdout || '[]') as typeof results;
  } catch {
    io.stderr(`init: the dry run did not finish: ${dry.stderr.split('\n')[0] ?? ''}`);
    return 1;
  }
  const byRule = new Map<string, number>();
  let errors = 0;
  let warnings = 0;
  for (const result of results) {
    for (const d of result.diagnostics) {
      byRule.set(d.ruleId, (byRule.get(d.ruleId) ?? 0) + 1);
      if (d.severity === 'error') errors++;
      else warnings++;
    }
  }
  const flagged = results.filter((r) => r.diagnostics.length).length;
  const total = errors + warnings;
  io.stdout(
    total
      ? `Dry run of \`${NAME} check .\`: ${count(errors, 'error')} and ${count(warnings, 'warning')} in ${flagged} of ${count(results.length, 'file')}. By rule: ${[
          ...byRule,
        ]
          .sort((a, b) => b[1] - a[1])
          .map(([rule, n]) => `${rule} ${n.toLocaleString('en-US')}`)
          .join(', ')}.`
      : `Dry run of \`${NAME} check .\`: no problems in ${count(results.length, 'file')}.`,
  );
  for (const line of dry.stderr.split('\n').filter(Boolean)) io.stdout(line);

  // An existing codebase starts with findings: record them, so CI fails only on new ones.
  const hasBaseline = [BASELINE_FILE, LEGACY_BASELINE_FILE].some((name) =>
    fs.existsSync(path.join(root, name)),
  );
  if (total && !hasBaseline) {
    const answer = options.yes
      ? 'y'
      : ask
        ? (
            await ask(
              `Record these ${total.toLocaleString('en-US')} findings in ${BASELINE_FILE}, so check fails only on new ones? [Y/n] `,
            )
          )
            .trim()
            .toLowerCase()
        : 'n';
    if (answer === '' || answer.startsWith('y')) {
      const recorded = await runCheck(
        ['check', '.', '--update-baseline', ...(options.cache ? [] : ['--no-cache'])],
        checkIo,
      );
      if (recorded.stdout) io.stdout(recorded.stdout);
    } else {
      io.stdout(`No baseline written; \`${NAME} check . --update-baseline\` records one later.`);
    }
  }
  io.stdout(
    `Next: commit onsystem.config.json${total && !hasBaseline ? ` and ${BASELINE_FILE}` : ''}, and run \`npx ${NAME} check . --format github --require-design-system\` in CI.`,
  );
  return 0;
}

function count(n: number, word: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? word : `${word}s`}`;
}
