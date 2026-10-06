// Writes schema.json (JSON Schema for design-system-mcp.config.json) from the
// zod schema in the built package, so editors can validate and complete it.
import fs from 'node:fs';
import path from 'node:path';
import { configJsonSchema } from '../dist/index.js';

const schema = {
  $id: 'https://unpkg.com/@dgesteves/design-system-mcp/schema.json',
  title: 'design-system-mcp config',
  ...configJsonSchema(),
};
const out = path.resolve(import.meta.dirname, '../schema.json');
fs.writeFileSync(out, `${JSON.stringify(schema, null, 2)}\n`);
console.log('wrote schema.json');
