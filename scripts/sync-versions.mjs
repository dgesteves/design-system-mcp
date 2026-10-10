// Runs after `changeset version` (see `version-packages`, which the release workflow runs to
// open the release pull request) and copies the new package version wherever a release has to
// name it:
// - server.json, the MCP Registry manifest, so `mcp-publisher publish` lists the version that
//   is on npm, under the npm package of that name;
// - the Claude Code plugin's plugin.json, whose `version` is what Claude Code updates installed
//   copies on, so the plugin ships with each release;
// - the exact package the plugin runs (`onsystem@<version>` in .mcp.json and the hook): the
//   Claude plugin directory refuses a launcher with a range, and a pin means the plugin runs
//   the release it was tested with;
// - the same for the packages for other agents: the Agent Plugins package (plugin.json and
//   mcp.json in plugins/onsystem-agent) and the Cursor plugin (plugins/onsystem-cursor).
//
//   node scripts/sync-versions.mjs           write the files
//   node scripts/sync-versions.mjs --check   change nothing; exit 1 and list what differs
//
// `--root <dir>` runs it on another copy of the repository (for tests).
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import prettier from 'prettier';

const { values } = parseArgs({
  options: { check: { type: 'boolean', default: false }, root: { type: 'string' } },
});
const root = path.resolve(values.root ?? path.join(import.meta.dirname, '..'));
const { check } = values;
const PLUGIN = 'plugins/onsystem';
const AGENT = 'plugins/onsystem-agent';
const CURSOR = 'plugins/onsystem-cursor';

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
// Formatted as the repository formats it, so the release pull request passes CI.
const format = async (file, text) => {
  const filepath = path.join(root, file);
  const options = (await prettier.resolveConfig(filepath)) ?? {};
  return prettier.format(text, { ...options, filepath });
};

const { name, version } = JSON.parse(read('package.json'));
const pinned = `${name}@${version}`;

const updates = [];
const json = (file, change) => {
  const value = JSON.parse(read(file));
  change(value);
  updates.push([file, JSON.stringify(value, null, 2)]);
};

json('server.json', (server) => {
  server.version = version;
  for (const pkg of server.packages) {
    if (pkg.registryType !== 'npm') continue;
    pkg.identifier = name;
    pkg.version = version;
  }
});
const pin = (mcp) => {
  for (const config of Object.values(mcp.mcpServers)) {
    config.args = config.args.map((arg) => (arg.startsWith(`${name}@`) ? pinned : arg));
  }
};
const release = (plugin) => {
  plugin.version = version;
};
json(`${PLUGIN}/.claude-plugin/plugin.json`, release);
json(`${PLUGIN}/.mcp.json`, pin);
json(`${AGENT}/plugin.json`, release);
json(`${AGENT}/mcp.json`, pin);
json(`${CURSOR}/.cursor-plugin/plugin.json`, release);
json(`${CURSOR}/mcp.json`, pin);
const hook = `${PLUGIN}/hooks/check-ui.mjs`;
updates.push([
  hook,
  read(hook).replace(/^const VERSION = '[^']*';/m, `const VERSION = '${version}';`),
]);

const stale = [];
for (const [file, text] of updates) {
  const next = await format(file, text);
  if (next === read(file)) continue;
  stale.push(file);
  if (!check) fs.writeFileSync(path.join(root, file), next);
}

if (check) {
  if (stale.length) {
    console.error(
      `Not at ${pinned}: ${stale.join(', ')}. Run node scripts/sync-versions.mjs (pnpm version-packages runs it).`,
    );
    process.exit(1);
  }
  console.log(`server.json and the plugins are at ${pinned}.`);
} else {
  console.log(
    `server.json, the plugins' manifests -> ${version}; the plugins run ${pinned}${stale.length ? '' : ' (no change)'}`,
  );
}
