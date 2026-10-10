import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// The docs pages are read on GitHub and rendered on the website (site/scripts/generate.mjs),
// so their links are relative paths that work in both: other docs files, files in the repository
// and anchors. This checks that each one leads somewhere.
const root = path.resolve(import.meta.dirname, '..');
const docsDir = path.join(root, 'docs');
const files = [
  'README.md',
  ...fs
    .readdirSync(docsDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => `docs/${f}`),
];

/** GitHub's heading anchors: lowercase, punctuation dropped, spaces to hyphens. */
function anchors(markdown: string): Set<string> {
  const found = new Set<string>();
  let fenced = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    const heading = fenced ? null : /^#{1,6} (.+)$/.exec(line);
    if (!heading?.[1]) continue;
    found.add(
      heading[1]
        .toLowerCase()
        .replace(/`/g, '')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s/g, '-'),
    );
  }
  return found;
}

/** Inline links outside code: `[text](href)`, images included. */
function links(markdown: string): string[] {
  const prose = markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  return [...prose.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1] ?? '');
}

describe('links in the docs and the README', () => {
  for (const file of files) {
    it(`resolve in ${file}`, () => {
      const text = fs.readFileSync(path.join(root, file), 'utf8');
      for (const href of links(text)) {
        if (/^(?:https?:|mailto:)/.test(href)) continue;
        const [target = '', anchor] = href.split('#');
        const resolved = target ? path.resolve(path.dirname(path.join(root, file)), target) : '';
        if (target) expect(fs.existsSync(resolved), `${file}: ${href}`).toBe(true);
        if (anchor) {
          const into = target ? fs.readFileSync(resolved, 'utf8') : text;
          expect(anchors(into).has(anchor), `${file}: ${href}`).toBe(true);
        }
      }
    });
  }

  it('every docs page starts with a title', () => {
    for (const file of files.filter((f) => f.startsWith('docs/'))) {
      expect(fs.readFileSync(path.join(root, file), 'utf8'), file).toMatch(/^# \S/);
    }
  });
});
