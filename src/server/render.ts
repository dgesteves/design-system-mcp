import type { DesignSystem } from '../design-system.js';
import type { SearchHit } from '../search/index.js';
import { formatPx } from '../tokens/units.js';
import type { CheckResult, ComponentInfo, PropInfo, Token } from '../types.js';
import { plural, truncate } from '../util/strings.js';

/**
 * Tool results are read by models, so they are rendered as compact Markdown:
 * fewer tokens than JSON, and the same information. The JSON is still sent
 * as structured content.
 */

function firstSentence(text: string | undefined, max = 140): string {
  if (!text) return '';
  // A sentence ends at . ! or ? followed by an uppercase letter or the end ("e.g. a menu" does not).
  const sentence = /^[\s\S]*?[.!?](?=\s+[A-Z`"(]|\s*$)/.exec(text.trim())?.[0] ?? text.trim();
  return truncate(sentence.replace(/\s+/g, ' '), max);
}

export function importStatement(component: ComponentInfo): string {
  const binding = component.exportName.split('.')[0] ?? component.name;
  return `import { ${binding} } from "${component.importPath}"`;
}

function variantSummary(component: ComponentInfo): string[] {
  return component.variants.map(
    (v) => `${v.name}: ${v.values.join(' | ')}${v.default ? ` (default ${v.default})` : ''}`,
  );
}

export function renderComponentList(ds: DesignSystem): string {
  const roots = ds.roots();
  if (!roots.length) {
    return `No components found. Check the "components" globs in the config (root: ${ds.root}).`;
  }
  const parts = ds.components.length - roots.length;
  const lines = [
    `${plural(roots.length, 'component')}${parts ? ` (+${plural(parts, 'part')})` : ''}. Call get_component before using one.`,
    '',
  ];
  for (const component of roots) {
    const element = component.element ? ` <${component.element}>` : '';
    lines.push(
      `${component.name}${element} — ${firstSentence(component.description) || 'No description.'}`,
    );
    for (const variant of variantSummary(component)) lines.push(`  ${variant}`);
    if (component.subcomponents.length)
      lines.push(`  parts: ${component.subcomponents.join(', ')}`);
    lines.push(`  ${importStatement(component)}`);
  }
  return lines.join('\n');
}

/** Inherited attributes worth naming, per element; the rest are summarised. */
const NOTABLE_INHERITED: Record<string, string[]> = {
  button: ['onClick', 'type', 'disabled', 'form'],
  input: [
    'type',
    'value',
    'defaultValue',
    'onChange',
    'placeholder',
    'disabled',
    'name',
    'required',
  ],
  textarea: ['value', 'defaultValue', 'onChange', 'placeholder', 'disabled', 'name', 'rows'],
  select: ['value', 'defaultValue', 'onChange', 'disabled', 'name'],
  a: ['href', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'height'],
  label: ['htmlFor'],
  default: ['onClick', 'id', 'role', 'children'],
};

/** What callers of a React Aria component most often need, from its inherited props. */
const REACT_ARIA_NOTABLE = [
  'onPress',
  'onChange',
  'onAction',
  'onSelectionChange',
  'onOpenChange',
  'value',
  'defaultValue',
  'isDisabled',
  'isRequired',
  'isInvalid',
  'isReadOnly',
  'autoFocus',
];

function renderProp(prop: PropInfo): string {
  const optional = prop.required ? '' : '?';
  const fallback = prop.default !== undefined ? ` = ${prop.default}` : '';
  const deprecated = prop.deprecated
    ? ` DEPRECATED${prop.deprecated === true ? '' : `: ${prop.deprecated}`}.`
    : '';
  const description = prop.description ? ` — ${prop.description.replace(/\s*\n\s*/g, ' ')}` : '';
  return `- ${prop.name}${optional}: ${prop.type}${fallback}${description}${deprecated}`;
}

export function renderComponent(ds: DesignSystem, component: ComponentInfo): string {
  const lines: string[] = [`# ${component.name}`];
  if (component.deprecated) {
    lines.push(`DEPRECATED${component.deprecated === true ? '' : `: ${component.deprecated}`}`);
  }
  if (component.description) lines.push(component.description);
  lines.push('', importStatement(component));
  const facts = [
    component.element ? `Renders <${component.element}>` : undefined,
    component.parent ? `Part of ${component.parent}` : undefined,
    component.aliases.length ? `Also available as ${component.aliases.join(', ')}` : undefined,
    `${component.source.file}:${component.source.line}`,
    component.docs ? `docs: ${component.docs.file}` : undefined,
  ].filter(Boolean);
  lines.push(facts.join(' · '));

  lines.push('', '## Props');
  if (!component.props.length && !component.inherits.length) lines.push('No props.');
  for (const prop of component.props) lines.push(renderProp(prop));
  for (const inherited of component.inherits) {
    const names = ds.model.propSets[inherited.set] ?? [];
    // React Aria's event props mark its components, whatever they render.
    const wanted = names.some((n) => n === 'onPress' || n === 'onFocusChange')
      ? REACT_ARIA_NOTABLE
      : (NOTABLE_INHERITED[component.element ?? ''] ?? NOTABLE_INHERITED.default ?? []);
    const notable = wanted.filter((n) => names.includes(n) && !inherited.deprecated?.includes(n));
    lines.push(
      `- …plus ${inherited.count} props from ${inherited.from}` +
        (notable.length ? ` (${notable.join(', ')}, aria-*, data-*, …)` : ''),
    );
  }
  if (component.openProps) {
    lines.push('- Part of the props type could not be resolved; extra props may be accepted.');
  }

  if (component.variants.length) {
    lines.push('', '## Variants');
    for (const variant of component.variants) {
      lines.push(`${variant.name}${variant.default ? ` (default "${variant.default}")` : ''}`);
      const width = Math.max(...variant.values.map((v) => v.length));
      for (const value of variant.values) {
        lines.push(`  ${value.padEnd(width)}  ${variant.classes[value] ?? ''}`.trimEnd());
      }
    }
    for (const compound of component.compoundVariants) {
      const when = Object.entries(compound.when)
        .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('|') : v}`)
        .join(' & ');
      lines.push(`  when ${when}: ${compound.classes}`);
    }
  }

  if (component.subcomponents.length) {
    lines.push('', '## Parts');
    for (const name of component.subcomponents) {
      const part = ds.getComponent(name);
      lines.push(`- ${name}${part?.description ? ` — ${firstSentence(part.description)}` : ''}`);
    }
  }

  const tokens = ds.relatedTokens(component);
  if (tokens.length) {
    lines.push('', '## Design tokens used');
    lines.push(tokens.map((t) => `${t.name} (${t.usage[0] ?? t.value})`).join(', '));
  }

  if (component.docs?.sections.length) {
    lines.push('', `## Docs (${component.docs.file})`);
    for (const section of component.docs.sections) {
      if (/^examples?$/i.test(section.heading) && !section.body) continue;
      lines.push(`### ${section.heading}`);
      if (section.body) lines.push(section.body);
    }
  }

  if (component.examples.length) {
    lines.push('', '## Examples');
    for (const example of component.examples) {
      if (example.title) lines.push(`### ${example.title}`);
      lines.push(`\`\`\`${example.lang}`, example.code, '```');
    }
  }
  return lines.join('\n');
}

export function renderSearch(query: string, hits: SearchHit[]): string {
  if (!hits.length) {
    return `No components match "${query}". Try other words, or list_components to browse.`;
  }
  const lines = [`Components for "${query}", best first:`, ''];
  hits.forEach((hit, i) => {
    const c = hit.component;
    const parent = c.parent ? ` (part of ${c.parent})` : '';
    lines.push(
      `${i + 1}. ${c.name}${parent} — ${firstSentence(c.description) || 'No description.'}`,
    );
    lines.push(
      `   score ${hit.score} · matched: ${hit.matched.join(', ')} · ${importStatement(c)}`,
    );
  });
  lines.push('', 'Call get_component for props, variants and examples.');
  return lines.join('\n');
}

export function renderTokens(ds: DesignSystem, tokens: Token[]): string {
  if (!tokens.length)
    return 'No tokens match. Call get_tokens without filters to see all categories.';
  const groups = new Map<string, Token[]>();
  for (const token of tokens)
    groups.set(token.category, [...(groups.get(token.category) ?? []), token]);
  const lines: string[] = [];
  for (const [category, list] of groups) {
    lines.push(`## ${category} (${list.length})`);
    for (const token of list) {
      const px =
        token.category === 'spacing' || token.category === 'radius'
          ? ds.tokenIndex.toPx(token.value)
          : undefined;
      const value =
        px !== undefined && !/^-?[\d.]+px$/.test(token.value)
          ? `${token.value} = ${formatPx(px)}`
          : token.value;
      const modes = token.modes
        ? ` (${Object.entries(token.modes)
            .map(([mode, v]) => `${mode}: ${v}`)
            .join(', ')})`
        : '';
      const usage = token.usage.length ? ` → ${token.usage.join(', ')}` : '';
      const description = token.description ? ` — ${token.description}` : '';
      const deprecated = token.deprecated ? ' DEPRECATED' : '';
      lines.push(`- ${token.name}: ${value}${modes}${usage}${description}${deprecated}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

export function renderCheck(result: CheckResult): string {
  if (!result.diagnostics.length) {
    return `${result.file}: no design-system problems found.`;
  }
  const lines = [
    `${result.file}: ${plural(result.errorCount, 'error')}, ${plural(result.warningCount, 'warning')}`,
    '',
  ];
  for (const d of result.diagnostics) {
    lines.push(`${d.line}:${d.column} ${d.severity} [${d.ruleId}] ${d.message}`);
  }
  lines.push(
    '',
    result.errorCount
      ? 'Fix every error, then run check_ui again.'
      : 'Only warnings: fix them if the design system has an equivalent.',
  );
  return lines.join('\n');
}
