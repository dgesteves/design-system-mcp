#!/usr/bin/env node
// Claude Code PostToolUse hook: after Claude writes or edits a .tsx/.jsx file,
// run `design-system-mcp check` on it and hand the findings back.
//
// - Errors: exit 2 with the findings on stderr, which Claude Code shows to
//   Claude so it fixes them before moving on. For an Edit, only findings on
//   the lines it changed are listed; older ones are counted, not pushed.
// - Warnings only: exit 0 with `additionalContext`, a non-blocking note.
// - Clean file, other files, a project without a design system, or anything
//   going wrong here: exit 0 silently. A broken hook must never stall the
//   session; the MCP server reports configuration problems itself.
//
// The CLI is the project's own install when there is one, else npx. Both run
// through Node directly, never a shell, so paths are passed as they are.
// DESIGN_SYSTEM_MCP_BIN points at another CLI script, for tests.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const PACKAGE = '@dgesteves/design-system-mcp';
// The release with --quiet-without-design-system and the baseline.
const RANGE = '^0.2.0';
const UI_FILE = /\.[jt]sx$/i;
const MAX_FINDINGS = 30;
// Where the CLI looks for the design system: the nearest of these marks the project.
const PROJECT_FILES = [
  'design-system-mcp.config.json',
  'design-system-mcp.config.ts',
  'design-system-mcp.config.mts',
  'design-system-mcp.config.js',
  'design-system-mcp.config.mjs',
  'components.json',
  'package.json',
];

const input = await readInput();
const filePath = input?.tool_input?.file_path;
if (typeof filePath !== 'string' || !UI_FILE.test(filePath)) process.exit(0);

const sessionDir =
  typeof input.cwd === 'string' && input.cwd
    ? input.cwd
    : (process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
const file = path.resolve(sessionDir, filePath);
const root = projectRoot(path.dirname(file)) ?? sessionDir;
const cli = resolveCli(root);
if (!cli) process.exit(0);

const run = spawnSync(
  cli[0],
  [...cli.slice(1), 'check', file, '--format', 'json', '--quiet-without-design-system'],
  {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
    maxBuffer: 64 * 1024 * 1024,
    timeout: 55_000,
    windowsHide: true,
  },
);
// 0: clean or warnings, 1: errors. Anything else (a config error, no files,
// npx unavailable or too old) is not Claude's to fix.
if (run.status !== 0 && run.status !== 1) process.exit(0);

let results;
try {
  results = JSON.parse(run.stdout);
} catch {
  process.exit(0);
}
if (!Array.isArray(results)) process.exit(0);
const diagnostics = results.flatMap((r) => (Array.isArray(r?.diagnostics) ? r.diagnostics : []));
if (!diagnostics.length) process.exit(0);

// An Edit is held to the lines it touched; a Write wrote the whole file.
const touched = touchedLines(input);
const inScope = touched
  ? diagnostics.filter((d) => touched.some(([from, to]) => d.line >= from && d.line <= to))
  : diagnostics;
const elsewhere = diagnostics.length - inScope.length;
if (!inScope.length) process.exit(0);

// Errors first, so a long list of warnings never hides one.
const ordered = [
  ...inScope.filter((d) => d.severity === 'error'),
  ...inScope.filter((d) => d.severity !== 'error'),
];
const errors = ordered.filter((d) => d.severity === 'error').length;
const shown = ordered.slice(0, MAX_FINDINGS).map(describe);
if (ordered.length > shown.length) {
  shown.push(
    `…and ${ordered.length - shown.length} more. Run check_ui on the file to see them all.`,
  );
}
const note = elsewhere
  ? `\n(${elsewhere} other ${elsewhere === 1 ? 'finding' : 'findings'} elsewhere in the file predate this edit; leave them unless asked.)`
  : '';
const name = path.relative(root, file) || file;

if (errors) {
  process.stderr.write(
    `${name}: this change breaks the project's design system (design-system-mcp check). ` +
      'Fix these errors before moving on; get_component and get_tokens list the valid props, variants and tokens.\n\n' +
      `${shown.join('\n')}${note}\n`,
  );
  process.exit(2);
}
process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: `design-system-mcp check: warnings in ${name}. Prefer the suggested scale values and tokens.\n${shown.join('\n')}${note}`,
    },
  }),
);
process.exit(0);

function describe(d) {
  return `${d.line}:${d.column} ${d.severity} [${d.ruleId}] ${d.message}`;
}

/** The nearest folder at or above `dir` with a design-system config, components.json or package.json. */
function projectRoot(dir) {
  for (let current = dir; ; current = path.dirname(current)) {
    if (PROJECT_FILES.some((f) => fs.existsSync(path.join(current, f)))) return current;
    if (current === path.dirname(current)) return undefined;
  }
}

/** [node, script, ...args] for the CLI: an override, the project's install, or npx. */
function resolveCli(dir) {
  const override = process.env.DESIGN_SYSTEM_MCP_BIN;
  if (override) return [process.execPath, override];
  try {
    const manifest = createRequire(path.join(dir, 'package.json')).resolve(
      `${PACKAGE}/package.json`,
    );
    const { bin } = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    const script = typeof bin === 'string' ? bin : bin?.['design-system-mcp'];
    if (script) return [process.execPath, path.resolve(path.dirname(manifest), script)];
  } catch {
    // Not installed in the project: use npx.
  }
  // npm's own npx script, run with this Node: no shell, so no quoting or .cmd issues on Windows.
  const nodeDir = path.dirname(process.execPath);
  const npx = [
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npx-cli.js'),
    path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js'),
  ].find((f) => fs.existsSync(f));
  if (npx) return [process.execPath, npx, '--yes', `${PACKAGE}@${RANGE}`];
  return process.platform === 'win32' ? undefined : ['npx', '--yes', `${PACKAGE}@${RANGE}`];
}

/** 1-based line ranges an Edit's new text occupies now, or undefined to check the whole file. */
function touchedLines(payload) {
  if (payload.tool_name !== 'Edit') return undefined;
  const replacement = payload.tool_input?.new_string;
  if (typeof replacement !== 'string' || !replacement.trim()) return undefined;
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  const ranges = [];
  for (let at = text.indexOf(replacement); at !== -1; at = text.indexOf(replacement, at + 1)) {
    const from = text.slice(0, at).split('\n').length;
    ranges.push([from, from + replacement.split('\n').length - 1]);
  }
  return ranges.length ? ranges : undefined;
}

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
}
