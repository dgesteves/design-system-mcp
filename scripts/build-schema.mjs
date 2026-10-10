// Writes schema.json (JSON Schema for onsystem.config.json) from the
// zod schema in the built package, so editors can validate and complete it.
import fs from 'node:fs';
import path from 'node:path';
import { configJsonSchema } from '../dist/index.js';

const schema = {
  $id: 'https://unpkg.com/onsystem/schema.json',
  title: 'onsystem config',
  ...configJsonSchema(),
};
const out = path.resolve(import.meta.dirname, '../schema.json');
fs.writeFileSync(out, `${JSON.stringify(schema, null, 2)}\n`);
console.log('wrote schema.json');
