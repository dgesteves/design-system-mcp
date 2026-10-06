import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

const DEFAULT_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  strict: true,
  allowJs: true,
  esModuleInterop: true,
  resolveJsonModule: true,
};

export interface ProjectConfig {
  options: ts.CompilerOptions;
  /** Directory `paths` are resolved against. */
  pathsBase: string;
  paths: Record<string, string[]>;
  configFile?: string;
}

/**
 * Reads the project's tsconfig (only from inside the root: walking further up
 * would pick up unrelated configs, e.g. this repository's own when extracting
 * test fixtures).
 */
export function readProjectConfig(root: string, tsconfig?: string): ProjectConfig {
  const configFile = tsconfig ? path.resolve(root, tsconfig) : path.join(root, 'tsconfig.json');
  if (!fs.existsSync(configFile)) {
    return { options: { ...DEFAULT_OPTIONS }, pathsBase: root, paths: {} };
  }
  const read = ts.readConfigFile(configFile, (file) => ts.sys.readFile(file));
  if (read.error)
    return { options: { ...DEFAULT_OPTIONS }, pathsBase: root, paths: {}, configFile };
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(configFile));
  const options: ts.CompilerOptions = { ...DEFAULT_OPTIONS, ...parsed.options };
  // Extraction only needs the checker. Keep it fast and permissive.
  options.noEmit = true;
  options.skipLibCheck = true;
  options.allowJs = true;
  options.jsx ??= ts.JsxEmit.ReactJSX;
  delete options.composite;
  delete options.incremental;
  delete options.tsBuildInfoFile;
  return {
    options,
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- TypeScript 5 projects still set baseUrl.
    pathsBase: options.baseUrl ?? path.dirname(configFile),
    paths: options.paths ?? {},
    configFile,
  };
}

export function createProgram(
  files: string[],
  config: ProjectConfig,
  oldProgram?: ts.Program,
): ts.Program {
  return ts.createProgram({
    rootNames: files,
    options: config.options,
    ...(oldProgram ? { oldProgram } : {}),
  });
}
