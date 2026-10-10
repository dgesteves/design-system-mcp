// Real-world regression corpus: public repositories pinned by commit, checked with the built CLI
// and compared with corpus/snapshot.json and the hand-labelled findings in corpus/labels.json.
//
//   node scripts/corpus.mjs                  fetch what is missing, check every run, compare
//   node scripts/corpus.mjs --update         the same, then record the new counts in the snapshot
//   node scripts/corpus.mjs fetch            only fetch
//   node scripts/corpus.mjs sample <run>     print unlabelled findings with their code, to label
//
// It fails when the counts differ from the snapshot (pass --update to accept them, as with Jest
// snapshots), when a finding labelled TP is no longer reported, or when one labelled FP comes
// back after a fix. It ends with the false-positive rate of the labelled sample.
//
// The repositories are untrusted. They are fetched shallow and sparse (source, styles,
// manifests and docs only), never installed or built, and nothing in them runs: a run whose
// folder holds a design-system-mcp config written in code is refused, since loading it would
// execute it. Run `pnpm build` first.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import {
  changeTable,
  compare,
  falsePositiveRate,
  findings,
  invalidLabels,
  labelKey,
  percent,
  random,
  ruleCounts,
} from './corpus-lib.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const CORPUS = path.join(ROOT, 'corpus');
const CLI = path.join(ROOT, 'dist', 'cli.js');
const SNAPSHOT = path.join(CORPUS, 'snapshot.json');
const LABELS = path.join(CORPUS, 'labels.json');

/** What the CLI reads: sources, styles, manifests and docs. Images, fonts and binaries stay out. */
const EXTENSIONS = [
  'tsx',
  'ts',
  'jsx',
  'js',
  'mjs',
  'cjs',
  'mts',
  'cts',
  'json',
  'css',
  'md',
  'mdx',
];
const MANIFESTS = [
  'package.json',
  'tsconfig*.json',
  'jsconfig*.json',
  'components.json',
  '.gitignore',
];
const CODE_CONFIGS = ['ts', 'mts', 'js', 'mjs'].map((ext) => `design-system-mcp.config.${ext}`);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    update: { type: 'boolean', default: false },
    only: { type: 'string', multiple: true },
    dir: { type: 'string' },
    'per-rule': { type: 'string', default: '2' },
    seed: { type: 'string', default: '1' },
    rule: { type: 'string' },
    file: { type: 'string' },
    line: { type: 'string' },
    all: { type: 'boolean', default: false },
  },
});
const [command = 'check', ...args] = positionals;
const dir = path.resolve(
  values.dir ?? process.env.CORPUS_DIR ?? path.join(os.tmpdir(), 'design-system-mcp-corpus'),
);

const corpus = readJson(path.join(CORPUS, 'repos.json'));
const runs = corpus.repos.flatMap((repo) => repo.runs.map((run) => ({ ...run, repo })));
const wanted = values.only?.length
  ? runs.filter((run) => values.only.includes(run.name) || values.only.includes(run.repo.name))
  : runs;
if (values.only?.length && !wanted.length)
  fail(`No run or repository named ${values.only.join(', ')}.`);

try {
  if (command === 'fetch') {
    fetchAll(wanted);
  } else if (command === 'check') {
    fetchAll(wanted);
    process.exitCode = check(wanted);
  } else if (command === 'sample') {
    const run = runs.find((r) => r.name === args[0]);
    if (!run) fail(`sample: pass a run, one of ${runs.map((r) => r.name).join(', ')}.`);
    fetchAll([run]);
    sample(run);
  } else {
    fail(`Unknown command "${command}": check (default), fetch or sample <run>.`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

// ─── Fetching ─────────────────────────────────────────────────────────────────

function fetchAll(selected) {
  assertIsolated(dir);
  fs.mkdirSync(dir, { recursive: true });
  for (const repo of new Set(selected.map((run) => run.repo))) {
    const target = path.join(dir, repo.name);
    const patterns = sparsePatterns(repo);
    const stamp = path.join(target, '.git', 'design-system-mcp-corpus.json');
    const want = JSON.stringify({ url: repo.url, sha: repo.sha, patterns });
    if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === want) continue;
    const started = performance.now();
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target, { recursive: true });
    git(target, ['init', '--quiet']);
    git(target, ['remote', 'add', 'origin', repo.url]);
    git(target, ['sparse-checkout', 'set', '--no-cone', '--stdin'], `${patterns.join('\n')}\n`);
    git(target, [
      'fetch',
      '--quiet',
      '--depth=1',
      '--filter=blob:none',
      '--no-tags',
      'origin',
      repo.sha,
    ]);
    git(target, ['checkout', '--quiet', '--detach', 'FETCH_HEAD']);
    fs.writeFileSync(stamp, want);
    console.error(`fetched ${repo.name}@${repo.sha.slice(0, 7)} in ${seconds(started)}`);
  }
}

/** Root files, every manifest, and the source of the folders the runs need (or the whole tree). */
function sparsePatterns(repo) {
  const patterns = ['/*', '!/*/', ...MANIFESTS.map((name) => `/**/${name}`)];
  for (const folder of repo.paths ?? ['']) {
    const base = folder ? `/${folder.replace(/^\/+|\/+$/g, '')}` : '';
    for (const ext of EXTENSIONS) patterns.push(`${base}/**/*.${ext}`);
  }
  // Environment files never matter to the checks; keep them off disk.
  return [...patterns, '!/**/.env*'];
}

function git(cwd, gitArgs, input) {
  const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...gitArgs], {
    cwd,
    input,
    encoding: 'utf8',
    // Large files stored in LFS stay pointers: nothing here reads them.
    env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1', GIT_TERMINAL_PROMPT: '0' },
  });
  if (result.status !== 0) {
    throw new Error(`git ${gitArgs.join(' ')} failed in ${cwd}:\n${result.stderr}`);
  }
  return result.stdout;
}

/**
 * The CLI looks upwards for node_modules and workspace roots, so a checkout inside a project
 * would pick up that project's packages and change the results.
 */
function assertIsolated(folder) {
  for (let current = path.dirname(folder); ; current = path.dirname(current)) {
    for (const name of ['package.json', 'pnpm-workspace.yaml', 'node_modules', 'tsconfig.json']) {
      if (fs.existsSync(path.join(current, name))) {
        throw new Error(
          `${folder} is inside ${current}, which has ${name}: the checks would read it. Pass --dir (or set CORPUS_DIR) to a folder outside any project.`,
        );
      }
    }
    if (current === path.dirname(current)) return;
  }
}

// ─── Checking ─────────────────────────────────────────────────────────────────

function check(selected) {
  if (!fs.existsSync(CLI))
    throw new Error(`${path.relative(ROOT, CLI)} is missing: run pnpm build first.`);
  const labels = readJson(LABELS);
  const problems = invalidLabels(labels);
  if (problems.length) throw new Error(`corpus/labels.json:\n  ${problems.join('\n  ')}`);
  const snapshot = fs.existsSync(SNAPSHOT) ? readJson(SNAPSHOT) : { runs: {}, labels: {} };

  const current = {};
  const found = [];
  for (const run of selected) {
    const started = performance.now();
    const { inspect, results } = runOne(run);
    const runFindings = findings(run.name, results);
    found.push(...runFindings);
    current[run.name] = { inspect, files: results.length, rules: ruleCounts(runFindings) };
    const errors = runFindings.filter((f) => f.severity === 'error').length;
    console.log(
      `${run.name.padEnd(22)} ${String(results.length).padStart(5)} files  ${String(runFindings.length).padStart(5)} findings (${errors} errors, ${runFindings.filter((f) => f.fixable).length} fixable)  ${seconds(started)}`,
    );
  }

  const result = compare(snapshot, current, found, labels);
  const lines = [''];
  if (result.changes.length || result.changedRuns.length) {
    if (result.changes.length)
      lines.push(
        'Counts that differ from corpus/snapshot.json:',
        '',
        changeTable(result.changes),
        '',
      );
    for (const run of result.changedRuns) {
      const before = snapshot.runs[run];
      lines.push(
        before
          ? `${run}: inspect or files checked changed: ${JSON.stringify({ files: before.files, ...before.inspect })} → ${JSON.stringify({ files: current[run].files, ...current[run].inspect })}`
          : `${run}: new run`,
      );
    }
    if (result.changedRuns.length) lines.push('');
  } else {
    lines.push('Counts match corpus/snapshot.json.', '');
  }
  for (const { label, present } of result.labelChanges) {
    lines.push(
      `${present ? 'Back' : 'Gone'}: ${label.verdict} ${label.run} ${label.file}:${label.line} [${label.rule}] "${label.source}"`,
    );
  }
  if (result.labelChanges.length) lines.push('');

  const rate = falsePositiveRate(result.present, current);
  const tally = (p) => `${p.tp} TP, ${p.fp} FP, ${p.d} debatable`;
  const relevant = labels.filter((l) => l.run in current);
  lines.push(
    `Labelled sample: ${relevant.length} findings labelled, ${result.present.size} still reported.`,
    `  Random sample still reported: ${tally(rate.sample)}. False-positive rate ${percent(rate.sample.rate)} (errors only: ${percent(rate.sampleErrors.rate)}).`,
    `  Weighted by run and rule over all findings: ${percent(rate.estimate)} of findings are false positives (errors only: ${percent(rate.estimateErrors)}), from labels covering ${percent(rate.coverage)} of them.`,
    `  Audit picks still reported: ${tally(rate.audit)}.`,
    '  Random sample by rule:',
    ...rate.byRule.map(
      ({ rule, precision }) =>
        `    ${rule.padEnd(32)} ${tally(precision)}: ${percent(precision.rate)}`,
    ),
  );
  console.log(lines.join('\n'));

  if (result.labelFailures.length) {
    console.error(`\n${result.labelFailures.map((f) => `✗ ${f}`).join('\n')}`);
    return 1;
  }
  const changed = result.changes.length > 0 || result.changedRuns.length > 0;
  if (values.update) {
    const merged = { ...snapshot.runs, ...current };
    const presence = { ...snapshot.labels };
    for (const label of relevant) presence[labelKey(label)] = result.present.has(label);
    // In the order of corpus/repos.json; runs and labels that no longer exist leave the snapshot.
    const next = {
      $comment:
        'Written by `node scripts/corpus.mjs --update`. Counts per run and rule; `labels` records which labelled findings were reported.',
      version: readJson(path.join(ROOT, 'package.json')).version,
      runs: Object.fromEntries(
        runs.filter((r) => merged[r.name]).map((r) => [r.name, merged[r.name]]),
      ),
      labels: Object.fromEntries(
        labels.map((l) => [labelKey(l), presence[labelKey(l)]]).filter(([, v]) => v !== undefined),
      ),
    };
    writeJson(SNAPSHOT, next);
    console.log(`\nWrote ${path.relative(ROOT, SNAPSHOT)}.`);
    return 0;
  }
  if (changed) {
    console.error(
      '\n✗ The counts differ from corpus/snapshot.json. If the change is intended, run `node scripts/corpus.mjs --update` and commit the snapshot.',
    );
    return 1;
  }
  const missing =
    selected.length === runs.length
      ? Object.keys(snapshot.runs).filter((name) => !current[name])
      : [];
  if (missing.length) {
    console.error(
      `\n✗ The snapshot has runs that no longer exist: ${missing.join(', ')}. Run with --update.`,
    );
    return 1;
  }
  return 0;
}

/** `inspect` and `check --format json` with the built CLI, from the run's folder. */
function runOne(run) {
  const cwd = path.join(dir, run.repo.name, run.cwd);
  for (const name of CODE_CONFIGS) {
    if (fs.existsSync(path.join(cwd, name))) {
      throw new Error(
        `${run.name}: ${name} would run the repository's code. Give the run a JSON config in corpus/configs.`,
      );
    }
  }
  const config = run.config ? ['--root', '.', '--config', path.join(CORPUS, run.config)] : [];
  const inspect = cli(['inspect', '--no-cache', ...config], cwd);
  if (inspect.status !== 0)
    throw new Error(`${run.name}: inspect exited ${inspect.status}\n${inspect.stderr}`);
  const checked = cli(['check', ...run.check, '--format', 'json', '--no-cache', ...config], cwd);
  if (checked.status !== 0 && checked.status !== 1) {
    throw new Error(`${run.name}: check exited ${checked.status}\n${checked.stderr}`);
  }
  const results = JSON.parse(checked.stdout);
  fs.mkdirSync(path.join(dir, '.results'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.results', `${run.name}.json`), checked.stdout);
  return { inspect: summarizeInspect(inspect.stdout), results };
}

function cli(cliArgs, cwd) {
  return spawnSync(process.execPath, [CLI, ...cliArgs], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' },
  });
}

/** What `inspect` found, without the machine-specific root and timing. */
function summarizeInspect(text) {
  const lines = text.split('\n');
  const field = (key) =>
    lines
      .find((l) => l.startsWith(`${key} `))
      ?.slice(key.length)
      .trim();
  const components = /^Components \((\d+) \+ (\d+) parts\)$/m.exec(text);
  const tokens = {};
  const at = lines.findIndex((l) => /^Tokens \(\d+\)$/.test(l));
  for (const line of at === -1 ? [] : lines.slice(at + 1)) {
    const match = /^ {2}(\S+)\s+(\d+)$/.exec(line);
    if (!match) break;
    tokens[match[1]] = Number(match[2]);
  }
  const warnings = lines.indexOf('Warnings');
  return {
    detected: field('detected') ?? null,
    files: field('files') ?? null,
    components: components ? Number(components[1]) : 0,
    parts: components ? Number(components[2]) : 0,
    tokens,
    warnings:
      warnings === -1 ? 0 : lines.slice(warnings + 1).filter((l) => l.startsWith('  ')).length,
  };
}

// ─── Sampling findings to label ───────────────────────────────────────────────

function sample(run) {
  const cached = path.join(dir, '.results', `${run.name}.json`);
  const fresh = fs.existsSync(cached) && fs.statSync(cached).mtimeMs > fs.statSync(CLI).mtimeMs;
  const results = fresh ? readJson(cached) : runOne(run).results;
  const labelled = new Set(readJson(LABELS).map((l) => l.fingerprint));
  let pool = findings(run.name, results).filter((f) => !labelled.has(f.fingerprint));
  if (values.rule) pool = pool.filter((f) => f.rule === values.rule);
  if (values.file) pool = pool.filter((f) => f.file.includes(values.file));
  if (values.line) pool = pool.filter((f) => f.line === Number(values.line));
  let picked = pool;
  if (!values.all && !values.file && !values.line) {
    const next = random(Number(values.seed));
    const perRule = Number(values['per-rule']);
    picked = [];
    for (const rule of [...new Set(pool.map((f) => f.rule))].sort()) {
      const of = pool.filter((f) => f.rule === rule);
      for (let i = 0; i < perRule && of.length; i++)
        picked.push(...of.splice(Math.floor(next() * of.length), 1));
    }
  }
  const root = path.join(dir, run.repo.name, run.cwd);
  for (const f of picked) {
    let code = [];
    try {
      code = fs.readFileSync(path.join(root, f.file), 'utf8').split('\n');
    } catch {
      // Shown without context.
    }
    console.log(`\n── ${f.file}:${f.line} [${f.rule}] ${f.severity}${f.fixable ? ' fixable' : ''}`);
    console.log(`   ${f.message}`);
    if (f.suggestion) console.log(`   suggestion: ${f.suggestion}`);
    for (let n = Math.max(1, f.line - 3); n <= Math.min(code.length, f.line + 3); n++) {
      console.log(
        `   ${n === f.line ? '>' : ' '}${String(n).padStart(5)}| ${code[n - 1]?.slice(0, 200)}`,
      );
    }
    const {
      message: _message,
      severity: _severity,
      fixable: _fixable,
      suggestion: _suggestion,
      ...fields
    } = f;
    console.log(`   ${JSON.stringify({ ...fields, verdict: '?', reason: '', sample: 'random' })}`);
  }
  console.error(`\n${picked.length} of ${pool.length} unlabelled findings in ${run.name}.`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** JSON the way Prettier would write it, so `pnpm format:check` stays green. */
function writeJson(file, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  const prettier = path.join(
    ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prettier.cmd' : 'prettier',
  );
  fs.writeFileSync(file, text);
  if (fs.existsSync(prettier))
    spawnSync(prettier, ['--write', file], {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
}

function seconds(started) {
  return `${((performance.now() - started) / 1000).toFixed(1)}s`;
}

function fail(message) {
  console.error(message);
  process.exit(2);
}
