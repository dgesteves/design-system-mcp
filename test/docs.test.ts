import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { docTargets, parseDoc } from '../src/extract/docs.js';
import { ACME_ROOT } from './helpers.js';

const read = (file: string) => fs.readFileSync(path.join(ACME_ROOT, file), 'utf8');

describe('component docs', () => {
  it('parses frontmatter, description, sections and titled examples', () => {
    const doc = parseDoc(read('docs/button.md'), 'docs/button.md');
    expect(doc.frontmatter).toEqual({
      component: 'Button',
      status: 'beta',
      tags: ['action', 'form'],
      owners: ['design-systems'],
    });
    expect(doc.title).toBe('Button');
    expect(doc.description).toBe('Buttons trigger actions.');
    expect(doc.sections.map((s) => s.heading)).toEqual(['Variants', 'Sizing']);
    expect(doc.examples).toEqual([
      {
        title: 'Danger',
        lang: 'tsx',
        code: '<Button intent="danger">Delete</Button>',
        source: 'docs',
      },
      { title: 'Sizing', lang: 'tsx', code: '<Button size="sm">Small</Button>', source: 'docs' },
    ]);
    // Non-example code stays in the prose.
    expect(doc.sections[1]?.body).toContain('npm install @acme/ui');
  });

  it('closes a fence only on a bare fence line, and keeps nested fences intact', () => {
    const doc = parseDoc(
      [
        '# Button',
        '',
        '## Usage',
        '',
        '```md',
        'Wrap it:',
        '```tsx',
        '<Button />',
        '```',
        '',
        'After.',
        '',
        '````md',
        '```tsx',
        '<Card />',
        '```',
        '````',
      ].join('\n'),
      'button.md',
    );
    expect(doc.examples).toEqual([]);
    expect(doc.sections[0]?.body).toBe(
      '```md\nWrap it:\n```tsx\n<Button />\n```\n\nAfter.\n\n````md\n```tsx\n<Card />\n```\n````',
    );
  });

  it('drops MDX imports and exports and skips JSX when picking the description', () => {
    const doc = parseDoc(read('docs/alert.mdx'), 'docs/alert.mdx');
    expect(doc.description).toBe('Shows a short, important message, such as a failed save.');
    expect(doc.sections[0]?.body).not.toContain('import');
    expect(docTargets(doc)).toEqual(['Alert', 'Alert']);
  });

  it('matches docs to components and warns about orphans', async () => {
    const { load } = await import('./helpers.js');
    const ds = await load(ACME_ROOT);
    expect(ds.getComponent('Alert')?.docs?.file).toBe('docs/alert.mdx');
    expect(ds.model.warnings).toContain('docs/orphan.md: no component named Orphan');
  });
});
