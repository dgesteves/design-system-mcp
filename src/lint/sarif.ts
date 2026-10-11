import { createHash } from 'node:crypto';

import { findingKey } from '../baseline.js';
import { DEFAULT_SEVERITY } from '../config.js';
import type { CheckResult, Diagnostic } from '../types.js';
import { NAME, VERSION } from '../version.js';
import { RULES } from './rules/index.js';

const SCHEMA =
  'https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json';
const REPO = 'https://github.com/dgesteves/onsystem';
const RULES_PAGE = 'https://onsystem.vercel.app/rules';

type Level = 'error' | 'warning';

interface RuleDescriptor {
  id: string;
  description: string;
  level: Level;
  /** The section of the rules page that documents it. */
  anchor: string;
}

/** The rules, and the two kinds of finding that are not a rule of their own. */
function descriptors(): RuleDescriptor[] {
  return [
    ...RULES.map((rule) => ({
      id: rule.id,
      description: rule.description,
      level: DEFAULT_SEVERITY[rule.id] === 'warn' ? ('warning' as const) : ('error' as const),
      anchor: rule.id,
    })),
    {
      id: 'syntax',
      description:
        'The file must parse. A syntax error, or code nested too deeply to parse, makes the other findings in the file unreliable.',
      level: 'error',
      anchor: 'fixes',
    },
    {
      id: 'suppression',
      description:
        'Suppression comments must name known rules: a misspelled rule name suppresses nothing.',
      level: 'warning',
      anchor: 'suppressing-findings',
    },
  ];
}

/** A path relative to the repository root as a URI reference: `app/blog/%5Bslug%5D/page.tsx`. */
function toUri(file: string): string {
  return file
    .replaceAll('\\', '/')
    .split('/')
    .map((segment) => (segment === '.' || segment === '..' ? segment : encodeURIComponent(segment)))
    .join('/');
}

/**
 * Check results as a SARIF 2.1.0 log, for GitHub code scanning
 * (`github/codeql-action/upload-sarif`) and other SARIF consumers.
 *
 * `uri` maps a result's file to its path relative to the repository root, which code scanning
 * resolves locations against. Each result carries a fingerprint built like a baseline entry
 * (file, rule, the offending text and its occurrence), so an alert keeps its identity when
 * lines above it move.
 */
export function formatSarif(
  results: readonly CheckResult[],
  uri: (file: string) => string = (file) => file,
): string {
  const rules = descriptors();
  const index = new Map(rules.map((rule, i) => [rule.id, i]));
  const sarifResults = results.flatMap((result) => {
    const location = toUri(uri(result.file));
    const seen = new Map<string, number>();
    return result.diagnostics.map((d) => {
      const identity = `${d.ruleId}\0${findingKey(d)}`;
      const occurrence = seen.get(identity) ?? 0;
      seen.set(identity, occurrence + 1);
      return sarifResult(
        d,
        location,
        index.get(d.ruleId),
        fingerprint(location, identity, occurrence),
      );
    });
  });
  const log = {
    $schema: SCHEMA,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: NAME,
            version: VERSION,
            semanticVersion: VERSION,
            informationUri: REPO,
            rules: rules.map((rule) => {
              const helpUri = `${RULES_PAGE}#${rule.anchor}`;
              return {
                id: rule.id,
                shortDescription: { text: rule.description },
                fullDescription: { text: rule.description },
                helpUri,
                help: {
                  text: `${rule.description} See ${helpUri}`,
                  markdown: `${rule.description}\n\n[${rule.id} in the rules catalog](${helpUri})`,
                },
                defaultConfiguration: { level: rule.level },
              };
            }),
          },
        },
        // TypeScript counts columns in UTF-16 code units, as JavaScript strings do.
        columnKind: 'utf16CodeUnits',
        results: sarifResults,
      },
    ],
  };
  return JSON.stringify(log, null, 2);
}

function sarifResult(
  d: Diagnostic,
  uri: string,
  ruleIndex: number | undefined,
  fingerprint: string,
) {
  return {
    ruleId: d.ruleId,
    ...(ruleIndex === undefined ? {} : { ruleIndex }),
    level: d.severity,
    message: { text: d.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri, uriBaseId: '%SRCROOT%' },
          region: {
            startLine: d.line,
            startColumn: d.column,
            endLine: d.endLine,
            endColumn: d.endColumn,
            ...(d.source ? { snippet: { text: d.source } } : {}),
          },
        },
      },
    ],
    partialFingerprints: { [`${NAME}/v1`]: fingerprint },
  };
}

function fingerprint(uri: string, identity: string, occurrence: number): string {
  return createHash('sha256')
    .update(`${uri}\0${identity}\0${String(occurrence)}`)
    .digest('hex');
}
