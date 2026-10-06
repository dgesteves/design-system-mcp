import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Building a TypeScript program for the fixtures takes a moment on cold CI runners.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
