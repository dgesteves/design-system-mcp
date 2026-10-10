// Temporary: why types do not resolve in a test fixture whose node_modules links the demo's.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import ts from 'typescript';

const demo = path.resolve(import.meta.dirname, '../examples/shadcn-demo/node_modules');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsm-debug-'));
console.log('tmpdir', os.tmpdir(), '->', fs.realpathSync.native(os.tmpdir()));
fs.mkdirSync(path.join(dir, 'node_modules'));
for (const name of fs.readdirSync(demo)) {
  if (name.startsWith('.')) continue;
  fs.symlinkSync(path.join(demo, name), path.join(dir, 'node_modules', name), 'junction');
}
for (const name of ['react', '@types', '@types/react', '@radix-ui/react-dialog']) {
  const link = path.join(dir, 'node_modules', name);
  let info;
  try {
    info = {
      link: fs.lstatSync(link).isSymbolicLink(),
      real: fs.realpathSync.native(link),
      pkg: fs.existsSync(path.join(link, 'package.json')),
    };
  } catch (error) {
    info = String(error);
  }
  console.log(name, JSON.stringify(info));
  const demoLink = path.join(demo, name);
  try {
    console.log(
      '  demo:',
      fs.lstatSync(demoLink).isSymbolicLink(),
      fs.realpathSync.native(demoLink),
      fs.readlinkSync(demoLink),
    );
  } catch (error) {
    console.log('  demo:', String(error));
  }
}
const file = path.join(dir, 'a.tsx');
fs.writeFileSync(
  file,
  'import * as React from "react";\nexport const x: React.ComponentProps<"button"> = {};\n',
);
const options = {
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
};
for (const spec of ['react', '@radix-ui/react-dialog']) {
  const r = ts.resolveModuleName(spec, file, options, ts.sys);
  console.log(
    'resolve',
    spec,
    JSON.stringify(r.resolvedModule),
    JSON.stringify(r.failedLookupLocations?.slice(0, 4)),
  );
}
const program = ts.createProgram({ rootNames: [file], options });
const diags = ts
  .getPreEmitDiagnostics(program)
  .slice(0, 5)
  .map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
console.log('diagnostics', JSON.stringify(diags));
console.log(
  'files',
  program.getSourceFiles().length,
  program
    .getSourceFiles()
    .filter((f) => /react/.test(f.fileName))
    .map((f) => f.fileName)
    .slice(0, 3),
);
