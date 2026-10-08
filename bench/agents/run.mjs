// Benchmark: Claude Code building the same UI tasks with and without the
// design-system plugin, scored by `design-system-mcp check` (new findings only).
//
// node run.mjs <repo> <dsm-dir> <out-dir> [--concurrency 4] [--only taskId,...] [--conditions base,plugin] [--model m]
//
// <repo>: a clean checkout of the project to work in (copied per run).
// <dsm-dir>: a built design-system-mcp checkout (dist/cli.js, plugins/design-system).

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [repo, dsm, out, ...rest] = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i === -1 ? fallback : rest[i + 1];
};
const concurrency = Number(opt('concurrency', '4'));
const only = opt('only', '')?.split(',').filter(Boolean);
const conditions = opt('conditions', 'base,plugin').split(',');
const model = opt('model', '');
const tasks = JSON.parse(fs.readFileSync(new URL('./tasks.json', import.meta.url), 'utf8')).filter(
  (t) => !only.length || only.includes(t.id),
);
const CLI = path.join(dsm, 'dist/cli.js');
const SUFFIX =
  " Use this project's existing UI components and design tokens. Only create that file: do not modify other files, run commands or install packages.";

fs.mkdirSync(out, { recursive: true });

// A plugin copy whose server runs the local build (the release under test).
const pluginDir = path.join(out, 'plugin');
fs.cpSync(path.join(dsm, 'plugins/design-system'), pluginDir, { recursive: true });
fs.writeFileSync(
  path.join(pluginDir, '.mcp.json'),
  JSON.stringify(
    { mcpServers: { 'design-system': { command: process.execPath, args: [CLI] } } },
    null,
    2,
  ),
);

// Baseline of the untouched repository, so only findings a run adds count.
const pristine = path.join(out, 'pristine');
if (!fs.existsSync(pristine)) {
  fs.cpSync(repo, pristine, { recursive: true, filter: (src) => !src.includes(`${path.sep}.git`) });
  spawnSync(process.execPath, [CLI, 'check', '.', '--update-baseline', '--no-cache'], {
    cwd: pristine,
    stdio: 'inherit',
  });
}

const jobs = [];
for (const task of tasks) for (const condition of conditions) jobs.push({ task, condition });

async function runJob({ task, condition }) {
  const id = `${task.id}--${condition}`;
  const dir = path.join(out, 'runs', id);
  const resultFile = path.join(out, 'results', `${id}.json`);
  if (fs.existsSync(resultFile)) return JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(pristine, dir, { recursive: true });
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['add', '-A'], { cwd: dir });
  spawnSync('git', ['-c', 'user.email=b@b', '-c', 'user.name=b', 'commit', '-qm', 'base'], {
    cwd: dir,
  });

  const args = [
    '-p',
    task.prompt + SUFFIX,
    '--permission-mode',
    'acceptEdits',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-hook-events',
  ];
  if (model) args.push('--model', model);
  if (condition === 'plugin') {
    args.push(
      '--plugin-dir',
      pluginDir,
      '--allowedTools',
      'mcp__plugin_design-system_design-system__*',
    );
  }
  const started = Date.now();
  const transcript = path.join(out, 'transcripts', `${id}.jsonl`);
  fs.mkdirSync(path.dirname(transcript), { recursive: true });
  await new Promise((resolve) => {
    const child = spawn('claude', args, {
      cwd: dir,
      env: { ...process.env, DESIGN_SYSTEM_MCP_BIN: CLI },
      stdio: ['ignore', fs.openSync(transcript, 'w'), 'ignore'],
    });
    const timer = setTimeout(() => child.kill('SIGTERM'), 15 * 60_000);
    child.on('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  const seconds = Math.round((Date.now() - started) / 1000);

  // Score every file the run created or changed, against the pristine baseline.
  const changed = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: dir,
    encoding: 'utf8',
  })
    .stdout.split('\n')
    .map((l) => l.slice(3).trim())
    .filter((f) => /\.[jt]sx$/.test(f));
  let findings = [];
  if (changed.length) {
    const check = spawnSync(
      process.execPath,
      [CLI, 'check', ...changed, '--format', 'json', '--no-cache'],
      {
        cwd: dir,
        encoding: 'utf8',
        maxBuffer: 64 << 20,
      },
    );
    try {
      findings = JSON.parse(check.stdout).flatMap((r) =>
        r.diagnostics.map((d) => ({ file: r.file, ...d })),
      );
    } catch {
      findings = [
        { ruleId: 'check-failed', severity: 'error', message: check.stderr.slice(0, 300) },
      ];
    }
  }

  let cost = null;
  let turns = null;
  let modelUsed = null;
  let hookBlocks = 0;
  let mcpCalls = 0;
  for (const line of fs.readFileSync(transcript, 'utf8').split('\n')) {
    try {
      const e = JSON.parse(line);
      if (e.type === 'system' && e.subtype === 'init') modelUsed = e.model;
      if (e.type === 'result') {
        cost = e.total_cost_usd;
        turns = e.num_turns;
      }
      if (e.type === 'system' && e.subtype === 'hook_response' && e.exit_code === 2) hookBlocks++;
      if (e.type === 'assistant') {
        for (const c of e.message.content)
          if (c.type === 'tool_use' && c.name.startsWith('mcp__plugin_design-system')) mcpCalls++;
      }
    } catch {
      // Partial line.
    }
  }
  const result = {
    task: task.id,
    condition,
    model: modelUsed,
    created: fs.existsSync(path.join(dir, task.file)),
    changed,
    errors: findings.filter((f) => f.severity === 'error').length,
    warnings: findings.filter((f) => f.severity === 'warning').length,
    byRule: findings.reduce((acc, f) => ({ ...acc, [f.ruleId]: (acc[f.ruleId] ?? 0) + 1 }), {}),
    findings,
    cost,
    turns,
    seconds,
    hookBlocks,
    mcpCalls,
  };
  fs.mkdirSync(path.dirname(resultFile), { recursive: true });
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
  console.log(
    `${id}: ${result.errors} errors, ${result.warnings} warnings, $${cost?.toFixed(3)}, ${seconds}s, hook blocks ${hookBlocks}, mcp calls ${mcpCalls}`,
  );
  return result;
}

const queue = [...jobs];
const results = [];
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (queue.length) results.push(await runJob(queue.shift()));
  }),
);
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(results, null, 2));
console.log('done', results.length);
