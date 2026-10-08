// Runs after `changeset version` (see `version-packages`) and copies the new
// package version wherever a release has to name it:
// - server.json, the MCP Registry manifest, so `mcp-publisher publish` lists
//   the version that is on npm;
// - the Claude Code plugin's plugin.json, whose `version` is what Claude Code
//   updates installed copies on, so the plugin ships with each release;
// - the npm range the plugin runs (.mcp.json and the hook), `^major.minor.0`,
//   so the plugin uses this release and its patches.
import fs from 'node:fs';
import path from 'node:path';

import prettier from 'prettier';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
// Formatted as the repository formats it, so the release pull request passes CI.
const write = async (file, text) => {
  const filepath = path.join(root, file);
  const options = (await prettier.resolveConfig(filepath)) ?? {};
  fs.writeFileSync(filepath, await prettier.format(text, { ...options, filepath }));
};
const writeJson = (file, value) => write(file, JSON.stringify(value, null, 2));

const { name, version } = JSON.parse(read('package.json'));
const [major, minor] = version.split('.');
const range = `^${major}.${minor}.0`;

const server = JSON.parse(read('server.json'));
server.version = version;
for (const pkg of server.packages) pkg.version = version;
await writeJson('server.json', server);

const pluginJson = 'plugins/design-system/.claude-plugin/plugin.json';
const plugin = JSON.parse(read(pluginJson));
plugin.version = version;
await writeJson(pluginJson, plugin);

const mcpJson = 'plugins/design-system/.mcp.json';
const mcp = JSON.parse(read(mcpJson));
for (const config of Object.values(mcp.mcpServers)) {
  config.args = config.args.map((arg) => (arg.startsWith(`${name}@`) ? `${name}@${range}` : arg));
}
await writeJson(mcpJson, mcp);

const hook = 'plugins/design-system/hooks/check-ui.mjs';
await write(hook, read(hook).replace(/^const RANGE = '[^']*';/m, `const RANGE = '${range}';`));

console.log(`server.json, plugin.json -> ${version}; plugin runs ${name}@${range}`);
