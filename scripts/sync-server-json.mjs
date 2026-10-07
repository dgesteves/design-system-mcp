// Copies the package version into server.json (the MCP Registry manifest) so
// `mcp-publisher publish` always lists the version that is on npm.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const file = path.join(root, 'server.json');
const server = JSON.parse(fs.readFileSync(file, 'utf8'));
server.version = version;
for (const pkg of server.packages) pkg.version = version;
fs.writeFileSync(file, `${JSON.stringify(server, null, 2)}\n`);
console.log(`server.json -> ${version}`);
