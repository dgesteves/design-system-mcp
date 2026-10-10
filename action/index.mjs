// Entry point of the GitHub Action: see check.mjs.
import { run } from './check.mjs';

process.exitCode = run({
  env: process.env,
  cwd: process.cwd(),
  stdout: (text) => process.stdout.write(`${text}\n`),
  stderr: (text) => process.stderr.write(`${text}\n`),
});
