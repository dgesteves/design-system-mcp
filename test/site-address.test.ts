import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

// The websites moved from *-demo.vercel.app to onsystem.vercel.app, ondocs.vercel.app and
// signoff-ui.vercel.app. The old addresses redirect, but links, metadata and messages use the
// new ones. Changelogs and the record of the one-off rename commands keep what was published.
const root = path.resolve(import.meta.dirname, '..');
const OLD = /(?:design-system-mcp|ask-my-site|agent-ui-kit)-demo\.vercel\.app/;
const KEEP = [/(?:^|\/)CHANGELOG\.md$/, /^CONTRIBUTING\.md$/];
const BINARY = /\.(?:png|jpe?g|webp|gif|ico|svg|mp4|webm|woff2?|ttf|pdf)$/i;

it('links to the websites at their current addresses', () => {
  const stale = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter((file) => file && !BINARY.test(file) && !KEEP.some((keep) => keep.test(file)))
    .filter((file) => {
      const full = path.join(root, file);
      return fs.existsSync(full) && OLD.test(fs.readFileSync(full, 'utf8'));
    });
  expect(stale).toEqual([]);
});
