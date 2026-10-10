import fs from 'node:fs';
import path from 'node:path';

import AjvDraft04 from 'ajv-draft-04';
import ajvFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';

import { main, type Io } from '../src/cli.js';
import { RULE_IDS } from '../src/config.js';
import { VERSION } from '../src/version.js';
import { DEMO_ROOT, fixture } from './helpers.js';

// The official SARIF 2.1.0 schema (OASIS, errata 01), vendored so the test needs no network:
// https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json
const schema = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, 'fixtures/sarif/sarif-schema-2.1.0.json'), 'utf8'),
) as object;
// Both are CommonJS modules that also set `exports.default`, which is what TypeScript types.
const ajv = new AjvDraft04.default({ allErrors: true });
ajvFormats.default(ajv);
const validate = ajv.compile(schema);

function expectValid(log: unknown) {
  validate(log);
  expect(validate.errors ?? []).toEqual([]);
}

interface SarifResult {
  ruleId: string;
  ruleIndex: number;
  level: string;
  message: { text: string };
  locations: {
    physicalLocation: {
      artifactLocation: { uri: string; uriBaseId: string };
      region: { startLine: number; startColumn: number; endLine: number; endColumn: number };
    };
  }[];
  partialFingerprints: Record<string, string>;
}
interface SarifLog {
  version: string;
  runs: {
    tool: {
      driver: {
        name: string;
        version: string;
        rules: { id: string; helpUri: string; shortDescription: { text: string } }[];
      };
    };
    results: SarifResult[];
  }[];
}

async function run(args: string[], cwd = DEMO_ROOT) {
  const out: string[] = [];
  const err: string[] = [];
  const io: Io = { cwd, color: false, stdout: (t) => out.push(t), stderr: (t) => err.push(t) };
  const code = await main(args, io);
  return { code, stdout: out.join('\n'), stderr: err.join('\n') };
}

async function sarif(args: string[], cwd?: string) {
  const { code, stdout, stderr } = await run(['check', ...args, '--format', 'sarif'], cwd);
  const log = JSON.parse(stdout) as SarifLog;
  expectValid(log);
  const [first] = log.runs;
  if (!first) throw new Error('no run');
  return { code, stderr, log, run: first, results: first.results };
}

const BUTTON =
  'export function Button(props: React.ComponentProps<"button">) { return <button {...props} /> }';

describe('check --format sarif', () => {
  it('rejects a log that breaks the schema, so passing it means something', () => {
    expect(validate({ version: '2.1.0' })).toBe(false);
    expect(validate({ version: '2.0.0', runs: [] })).toBe(false);
  });

  it('writes a SARIF 2.1.0 log for code scanning', async () => {
    const { code, log, run, results } = await sarif(['app', '--no-cache']);
    expect(code).toBe(1);
    expect(log.version).toBe('2.1.0');
    expect(run.tool.driver).toMatchObject({ name: 'onsystem', version: VERSION });

    // Every rule, and the two findings that are not rules of their own, link to their docs.
    const rules = run.tool.driver.rules;
    expect(rules.map((r) => r.id)).toEqual([...RULE_IDS, 'syntax', 'suppression']);
    for (const rule of rules) {
      expect(rule.helpUri).toMatch(/^https:\/\/[^/]+\/rules#[a-z-]+$/);
      expect(rule.shortDescription.text.length).toBeGreaterThan(20);
    }
    expect(rules.find((r) => r.id === 'no-unknown-variant')?.helpUri).toMatch(
      /\/rules#no-unknown-variant$/,
    );

    // The same findings as the other formats: 8 errors and 3 warnings in danger-zone.tsx.
    expect(results.filter((r) => r.level === 'error')).toHaveLength(8);
    expect(results.filter((r) => r.level === 'warning')).toHaveLength(3);
    const [first] = results;
    expect(first).toMatchObject({
      ruleId: 'no-hardcoded-color',
      level: 'error',
      message: {
        text: 'Hardcoded color `border-[#ef4444]`. Nearest token destructive (ΔE 0.071) → `border-destructive`.',
      },
      locations: [
        {
          physicalLocation: {
            // Relative to the repository root, not the working directory.
            artifactLocation: {
              uri: 'examples/shadcn-demo/app/settings/danger-zone.tsx',
              uriBaseId: '%SRCROOT%',
            },
            region: { startLine: 11, startColumn: 22, endLine: 11, endColumn: 38 },
          },
        },
      ],
    });
    for (const result of results) {
      expect(rules[result.ruleIndex]?.id).toBe(result.ruleId);
    }
    const fingerprints = results.map((r) => r.partialFingerprints['onsystem/v1']);
    expect(new Set(fingerprints).size).toBe(results.length);
  });

  it('keeps fingerprints when lines move, and writes paths as URI references', async () => {
    const page = '<button className="bg-[#ff0000]">Go</button>';
    const files = {
      'components/ui/button.tsx': BUTTON,
      'app/blog/[slug]/page.tsx': `export const A = () => ${page}\nexport const B = () => ${page}\n`,
    };
    const root = fixture(files);
    const before = await sarif(['app', '--no-cache'], root);
    // Outside a git repository, relative to the working directory; `[` and `]` are escaped.
    const uris = before.results.map((r) => r.locations[0]?.physicalLocation.artifactLocation.uri);
    expect(new Set(uris)).toEqual(new Set(['app/blog/%5Bslug%5D/page.tsx']));
    // The same finding twice in a file: two alerts, not one.
    const ids = (log: typeof before) =>
      log.results.map((r) => `${r.ruleId} ${r.partialFingerprints['onsystem/v1'] ?? ''}`);
    expect(new Set(ids(before)).size).toBe(before.results.length);

    const file = path.join(root, 'app/blog/[slug]/page.tsx');
    fs.writeFileSync(file, `// moved down\n\n${fs.readFileSync(file, 'utf8')}`);
    const after = await sarif(['app', '--no-cache'], root);
    expect(after.results[0]?.locations[0]?.physicalLocation.region.startLine).toBe(
      (before.results[0]?.locations[0]?.physicalLocation.region.startLine ?? 0) + 2,
    );
    expect(ids(after)).toEqual(ids(before));
  });

  it('leaves out baseline findings, and prints a log without results when nothing is left', async () => {
    const root = fixture({
      'components/ui/button.tsx': BUTTON,
      'app/page.tsx': 'export default () => <button className="bg-[#ff0000]">Go</button>',
    });
    expect((await sarif(['app', '--no-cache'], root)).results.length).toBeGreaterThan(0);
    expect((await run(['check', 'app', '--no-cache', '--update-baseline'], root)).code).toBe(0);
    const baselined = await sarif(['app', '--no-cache'], root);
    expect(baselined.code).toBe(0);
    expect(baselined.results).toEqual([]);
    // Nothing to check at all: still a log, so code scanning closes fixed alerts.
    const empty = await sarif(['components', '--no-cache'], root);
    expect(empty.results).toEqual([]);
    expect(empty.run.tool.driver.rules.length).toBe(RULE_IDS.length + 2);
  });
});
