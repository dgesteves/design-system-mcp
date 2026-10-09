// Generates the data the site renders, from the library itself, the demo design system in
// examples/shadcn-demo, the benchmark results in bench/agents and the README, so what the
// site shows is what the tool does at this commit. `pnpm build` and `pnpm dev` run it first.
// It needs the library built: `pnpm --dir .. build`.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

let lib;
try {
  lib = await import('@dgesteves/design-system-mcp');
} catch (error) {
  console.error(
    `Could not load @dgesteves/design-system-mcp (${error.message}).\nBuild the library first: pnpm --dir .. build`,
  );
  process.exit(1);
}
const { applyFixes, buildModel, DesignSystem, loadConfig, RULES, VERSION } = lib;

const site = path.resolve(import.meta.dirname, '..');
const repo = path.resolve(site, '..');
const demoRoot = path.join(repo, 'examples/shadcn-demo');
const OUT = path.join(site, 'generated');
fs.mkdirSync(OUT, { recursive: true });

function write(name, data) {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`generated/${name} ${(fs.statSync(file).size / 1024).toFixed(1)}kB`);
}

/** 1-based line and column → 0-based offset. */
function offsetOf(text, line, column) {
  let offset = 0;
  for (let i = 1; i < line; i++) offset = text.indexOf('\n', offset) + 1;
  return offset + column - 1;
}

// ─── The demo design system ────────────────────────────────────────────────

const config = await loadConfig({ root: demoRoot });
const { model } = await buildModel(config, { cache: false });
const ds = new DesignSystem(model, config);
assert.ok(ds.roots().length >= 5, 'the demo design system should have its components');

// ─── The loop: draft, check_ui, fix, clean ──────────────────────────────────

const demoFile = 'app/settings/danger-zone.tsx';
// The file starts with a comment explaining the demo; on the site the agent writes the file.
const draft = fs
  .readFileSync(path.join(demoRoot, demoFile), 'utf8')
  .replace(/^(?:\/\/[^\n]*\n)+/, '');
const result = ds.check(draft, demoFile);
assert.ok(result.errorCount > 0, 'the demo draft should have errors');

// What the agent writes after reading the findings: the mechanical fixes, plus the three
// it has to decide itself (a Badge variant, moving the inline style to classes, the import).
const fixed = applyFixes(draft, result.diagnostics)
  .replace('tone="warning"', 'variant="destructive"')
  .replace(
    ' style={{ color: "var(--muted-foreground)", marginTop: 6 }}',
    ' className="mt-1.5 text-muted-foreground"',
  )
  .replace(
    'import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"',
    'import {\n  Card,\n  CardContent,\n  CardDescription,\n  CardHeader,\n  CardTitle,\n} from "@/components/ui/card"',
  );
const after = ds.check(fixed, demoFile);
assert.equal(
  after.diagnostics.length,
  0,
  `the corrected demo should be clean, got ${JSON.stringify(after.diagnostics, null, 2)}`,
);

/** The short "found → fix" form the transcript shows for each finding. */
function shortForm(d) {
  let found = d.source;
  let fix = d.suggestion ?? '';
  if (d.ruleId === 'icon-button-accessible-name') found = '<Button size="icon">';
  else if (d.ruleId === 'prefer-design-system-component') found = `<${d.source}>`;
  else if (d.ruleId === 'no-unknown-component') found = `<${d.source}>`;
  else if (d.ruleId === 'no-unknown-prop') found = `${d.source}=`;
  else if (d.ruleId === 'no-unknown-variant') found = `variant=${d.source}`;
  else if (d.ruleId === 'no-hardcoded-spacing' && /^-?\d+$/.test(d.source))
    found = `marginTop: ${d.source}`;
  else if (d.source.startsWith('#')) found = `color: "${d.source}"`;
  if (d.ruleId === 'no-unknown-prop') fix = `${fix}=`;
  return { found, fix };
}

const findings = result.diagnostics.map((d) => ({
  ruleId: d.ruleId,
  severity: d.severity,
  message: d.message,
  line: d.line,
  column: d.column,
  start: offsetOf(draft, d.line, d.column),
  end: offsetOf(draft, d.endLine, d.endColumn),
  source: d.source,
  suggestion: d.suggestion ?? null,
  fixable: Boolean(d.fix?.length),
  ...shortForm(d),
}));

/**
 * Spans of `next` that are new relative to `prev`, from a longest-common-subsequence diff of
 * word tokens. Class names, tags and quoted values count as words, so a changed class lights
 * up on its own rather than the whole attribute.
 */
function changedSpans(prev, next) {
  const words = (text) =>
    [...text.matchAll(/"?[\w\-.#[\]:%@][\w\-.#[\]:%/@]*"?|[^\s\w]/g)].map((m) => ({
      text: m[0],
      start: m.index,
      end: m.index + m[0].length,
    }));
  const a = words(prev);
  const b = words(next);
  const table = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] =
        a[i].text === b[j].text
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const changed = [];
  let i = 0;
  let j = 0;
  while (j < b.length) {
    if (i < a.length && a[i].text === b[j].text) {
      i++;
      j++;
    } else if (i < a.length && table[i + 1][j] >= table[i][j + 1]) {
      i++;
    } else {
      changed.push(b[j]);
      j++;
    }
  }
  const spans = [];
  for (const word of changed) {
    const last = spans.at(-1);
    // Join neighbours on the same line separated only by spaces or `=`.
    if (last && /^[ \t=]*$/.test(next.slice(last.end, word.start))) last.end = word.end;
    else spans.push({ start: word.start, end: word.end });
  }
  return (
    spans
      // A lone comma or bracket is noise next to the real change.
      .filter((s) => /\w/.test(next.slice(s.start, s.end)))
      // A quote that belongs to an unchanged neighbour (`"rounded-sm` in `"rounded-sm bg-muted px-3"`).
      .map((s) => {
        const text = next.slice(s.start, s.end);
        if ((text.match(/"/g) ?? []).length !== 1) return s;
        return text.startsWith('"')
          ? { ...s, start: s.start + 1 }
          : text.endsWith('"')
            ? { ...s, end: s.end - 1 }
            : s;
      })
  );
}

/** Median wall time of `run`, in milliseconds. */
function median(run, times = 200) {
  const samples = [];
  for (let i = 0; i < times; i++) {
    const started = performance.now();
    run();
    samples.push(performance.now() - started);
  }
  samples.sort((x, y) => x - y);
  return samples[Math.floor(times / 2)];
}
const checkMs = median(() => ds.check(draft, demoFile));

write('demo.json', {
  prompt: 'Add a danger-zone card to the workspace settings page',
  file: demoFile,
  draft,
  fixed,
  findings,
  errorCount: result.errorCount,
  warningCount: result.warningCount,
  changes: changedSpans(draft, fixed),
  checkMs: Math.round(checkMs * 100) / 100,
});

// ─── The playground: the model to check against, and the drafts ────────────

// The route handler builds a DesignSystem from this JSON and never touches the filesystem.
// Paths from this machine are left out: the model only needs paths relative to the root.
const PLAYGROUND_FILE = 'app/playground.tsx';
const { root: _root, configFile: _configFile, tailwindConfig: _tailwind, ...portable } = config;
const playgroundConfig = { ...portable, root: '/demo' };
const playgroundModel = {
  ...model,
  root: '/demo',
  warnings: [],
  stats: { ...model.stats, durationMs: 0 },
};
const portableDs = new DesignSystem(
  JSON.parse(JSON.stringify(playgroundModel)),
  JSON.parse(JSON.stringify(playgroundConfig)),
);
// The JSON round trip must not change a single finding.
assert.deepEqual(
  portableDs.check(draft, demoFile).diagnostics,
  result.diagnostics,
  'the serialised model should check exactly like the loaded one',
);
write('playground-model.json', {
  file: PLAYGROUND_FILE,
  model: playgroundModel,
  config: playgroundConfig,
});

const { deleteDialog, snippet } = await import('./presets.mjs');
const demoSource = (file) =>
  fs.readFileSync(path.join(demoRoot, file), 'utf8').replace(/^(?:\/\/[^\n]*\n)+/, '');
const presets = [
  {
    id: 'danger-zone',
    label: 'Agent draft',
    file: 'danger-zone.tsx',
    description: 'The settings card from the demo above: one problem per rule.',
    code: draft,
  },
  {
    id: 'delete-dialog',
    label: 'Dialog',
    file: 'delete-dialog.tsx',
    description: 'A confirmation dialog with props, parts and values from other libraries.',
    code: deleteDialog,
  },
  {
    id: 'snippet',
    label: 'Snippet',
    file: 'snippet.tsx',
    description: 'A fragment with no imports, the way agents often check code before saving it.',
    code: snippet,
  },
  {
    id: 'members',
    label: 'Clean',
    file: 'members.tsx',
    description: 'UI written against the design system: nothing to report.',
    code: demoSource('app/settings/members.tsx'),
  },
].map((preset) => ({ ...preset, result: portableDs.check(preset.code, PLAYGROUND_FILE) }));
for (const preset of presets) {
  const { errorCount, warningCount, diagnostics } = preset.result;
  const clean = preset.id === 'members';
  assert.ok(
    clean
      ? diagnostics.length === 0
      : errorCount > 0 && !diagnostics.some((d) => d.ruleId === 'syntax'),
    `preset ${preset.id}: unexpected result ${JSON.stringify(diagnostics.map((d) => d.ruleId))}`,
  );
  console.log(`  preset ${preset.id}: ${errorCount} errors, ${warningCount} warnings`);
}
write('playground.json', { file: PLAYGROUND_FILE, presets });

// ─── What the agent sees: the real MCP server over stdio ────────────────────

const pkg = JSON.parse(
  fs.readFileSync(
    fileURLToPath(import.meta.resolve('@dgesteves/design-system-mcp/package.json')),
    'utf8',
  ),
);
const cli = path.join(
  path.dirname(fileURLToPath(import.meta.resolve('@dgesteves/design-system-mcp/package.json'))),
  pkg.bin['design-system-mcp'],
);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [cli, '--root', demoRoot, '--no-watch', '--no-cache'],
  stderr: 'pipe',
});
const client = new Client({ name: 'design-system-mcp-site', version: VERSION });
await client.connect(transport);
const text = (r) => r.content.find((c) => c.type === 'text')?.text ?? '';
const { tools } = await client.listTools();
const { prompts } = await client.listPrompts();
const { resourceTemplates } = await client.listResourceTemplates();
const { resources } = await client.listResources();
const samples = [];
for (const [name, args] of [
  ['search_components', { query: 'confirm a destructive action', limit: 3 }],
  ['get_component', { name: 'Badge' }],
  ['get_tokens', { category: 'color', query: 'destructive' }],
  [
    'check_ui',
    { code: '<Button variant="primary" className="bg-blue-600 px-[18px]">Save</Button>' },
  ],
]) {
  const response = await client.callTool({ name, arguments: args });
  assert.ok(!response.isError, `${name} failed: ${text(response)}`);
  samples.push({ tool: name, args, output: text(response) });
}
await client.close();

write('tools.json', {
  version: VERSION,
  tools: tools.map((t) => ({ name: t.name, title: t.title ?? t.name, description: t.description })),
  prompts: prompts.map((p) => ({ name: p.name, title: p.title, description: p.description })),
  resources: [
    ...resources.filter((r) => !r.uri.startsWith('ds://components/')).map((r) => r.uri),
    ...resourceTemplates.map((r) => r.uriTemplate),
  ],
  samples,
});

// ─── Rules ──────────────────────────────────────────────────────────────────

write('rules.json', {
  rules: RULES.map((rule) => ({
    id: rule.id,
    description: rule.description,
    severity: config.rules[rule.id].severity,
  })),
});

// ─── The demo design system, as the agent sees it ───────────────────────────

write('design-system.json', {
  components: ds.roots().map((c) => ({
    name: c.name,
    description: c.description ?? null,
    element: c.element ?? null,
    variants: Object.fromEntries(c.variants.map((v) => [v.name, v.values])),
    parts: c.subcomponents,
  })),
  tokens: Object.fromEntries(
    ['color', 'spacing', 'radius', 'typography', 'shadow', 'other'].map((category) => [
      category,
      ds.tokens.filter((t) => t.category === category).length,
    ]),
  ),
});

// ─── The benchmark ──────────────────────────────────────────────────────────

const bench = path.join(repo, 'bench/agents');
const tasks = JSON.parse(fs.readFileSync(path.join(bench, 'tasks.json'), 'utf8'));
const MODEL_NAMES = { 'haiku-4-5': 'Claude Haiku 4.5', 'opus-5': 'Claude Opus 5' };
const models = fs
  .readdirSync(path.join(bench, 'results'))
  .filter((dir) => fs.statSync(path.join(bench, 'results', dir)).isDirectory())
  .sort()
  .map((dir) => {
    const runs = fs
      .readdirSync(path.join(bench, 'results', dir))
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(fs.readFileSync(path.join(bench, 'results', dir, f), 'utf8')));
    const summary = (condition) => {
      const list = runs.filter((r) => r.condition === condition);
      assert.equal(list.length, tasks.length, `${dir}/${condition} should have a run per task`);
      const sum = (key) => list.reduce((total, r) => total + r[key], 0);
      return {
        runs: list.length,
        clean: list.filter((r) => r.errors === 0).length,
        errors: sum('errors'),
        warnings: sum('warnings'),
        cost: Math.round(sum('cost') * 100) / 100,
        seconds: Math.round(sum('seconds') / list.length),
        turns: Math.round((sum('turns') / list.length) * 10) / 10,
        toolCalls: Math.round((sum('mcpCalls') / list.length) * 10) / 10,
        hookBlocks: sum('hookBlocks'),
      };
    };
    const base = summary('base');
    const plugin = summary('plugin');
    return {
      id: dir,
      name: MODEL_NAMES[dir] ?? dir,
      base,
      plugin,
      costDelta: Math.round(((plugin.cost - base.cost) / base.cost) * 100),
      tasks: tasks.map((task) => {
        const of = (condition) => {
          const run = runs.find((r) => r.task === task.id && r.condition === condition);
          return { errors: run.errors, byRule: run.byRule };
        };
        return { id: task.id, base: of('base'), plugin: of('plugin') };
      }),
    };
  });
write('bench.json', {
  project: 'vercel/ai-chatbot',
  tasks: tasks.map((t) => ({ id: t.id, file: t.file, prompt: t.prompt })),
  models,
});

// ─── From the README ────────────────────────────────────────────────────────

const readme = fs.readFileSync(path.join(repo, 'README.md'), 'utf8');

/** The body of a `## heading` section, up to the next heading of the same or higher level. */
function section(heading) {
  const start = readme.indexOf(`\n${heading}\n`);
  assert.ok(start !== -1, `README section "${heading}" not found`);
  const level = heading.match(/^#+/)[0].length;
  const rest = readme.slice(start + heading.length + 2);
  const end = rest.search(new RegExp(`\\n#{1,${level}} `));
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

/** Rows of the first Markdown table in `markdown`, as arrays of cell Markdown. */
function table(markdown) {
  const lines = markdown.split('\n').filter((l) => l.startsWith('|'));
  const cells = (line) =>
    line
      .slice(1, -1)
      .split(/(?<!\\)\|/)
      .map((c) => c.trim());
  const [header, , ...rows] = lines;
  assert.ok(header && rows.length, 'expected a Markdown table');
  return { header: cells(header), rows: rows.map(cells) };
}

/** The target of the badge link with this alt text. */
function badgeLink(alt) {
  const match = new RegExp(`\\[!\\[${alt}\\]\\([^)]*\\)\\]\\(([^)]+)\\)`).exec(readme);
  assert.ok(match, `README badge "${alt}" not found`);
  return match[1];
}

/** The first fenced code block in `markdown`. */
function codeBlock(markdown) {
  const match = /```\w*\n([\s\S]*?)\n```/.exec(markdown);
  assert.ok(match, 'expected a code block');
  return match[1];
}

const realCodebases = section('## On real codebases');
write('readme.json', {
  install: {
    cursor: badgeLink('Install in Cursor'),
    vscode: badgeLink('Install in VS Code'),
    plugin: codeBlock(section('### Claude Code plugin')),
  },
  realCodebases: {
    intro: realCodebases.split('\n\n')[0],
    ...table(realCodebases),
  },
  rules: table(section('## Rules')),
  engines: JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).engines,
});
