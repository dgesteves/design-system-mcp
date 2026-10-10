import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/bin.ts',
    eslint: 'src/eslint/index.ts',
    'eslint-worker': 'src/eslint/worker.ts',
  },
  format: 'esm',
  platform: 'node',
  target: 'node22.18',
  fixedExtension: false,
  dts: true,
  clean: true,
  publint: true,
});
