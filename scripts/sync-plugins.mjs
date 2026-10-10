// The skill has one source, the Claude Code plugin's SKILL.md. This copies it, byte for byte,
// into the packages for other agents, so every agent gets the same instructions:
// - plugins/onsystem-agent, the Agent Plugins 1.0 package (GitHub Copilot CLI, VS Code and any
//   client of the standard),
// - plugins/onsystem-cursor, the Cursor plugin, which also takes the icon as its logo.
// `npx skills add dgesteves/onsystem` reads the source itself, through
// .claude-plugin/marketplace.json. Edit the source, then run this; the tests fail on a stale copy.
//
//   node scripts/sync-plugins.mjs           write the copies
//   node scripts/sync-plugins.mjs --check   change nothing; exit 1 and list what differs
//
// `--root <dir>` runs it on another copy of the repository (for tests).
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { check: { type: 'boolean', default: false }, root: { type: 'string' } },
});
const root = path.resolve(values.root ?? path.join(import.meta.dirname, '..'));
const { check } = values;

const SOURCE = 'plugins/onsystem';
/** File in the source plugin → the packages that carry a copy of it. */
const COPIES = {
  'skills/onsystem/SKILL.md': ['plugins/onsystem-agent', 'plugins/onsystem-cursor'],
  'icon.svg': ['plugins/onsystem-cursor'],
};

const stale = [];
for (const [file, packages] of Object.entries(COPIES)) {
  const source = fs.readFileSync(path.join(root, SOURCE, file));
  for (const pkg of packages) {
    const target = path.join(root, pkg, file);
    const current = fs.existsSync(target) ? fs.readFileSync(target) : undefined;
    if (current?.equals(source)) continue;
    stale.push(`${pkg}/${file}`);
    if (check) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source);
  }
}

if (check) {
  if (stale.length) {
    console.error(
      `Not the same as ${SOURCE}: ${stale.join(', ')}. Edit the files in ${SOURCE}, then run node scripts/sync-plugins.mjs.`,
    );
    process.exit(1);
  }
  console.log(`Every package carries the skill from ${SOURCE}.`);
} else {
  console.log(stale.length ? `Copied from ${SOURCE}: ${stale.join(', ')}` : 'No change.');
}
