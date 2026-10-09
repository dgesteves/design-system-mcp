import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

// The repository root: the site builds against the workspace's own library and reads the
// demo design system and the benchmark from there.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: {
    root,
    // The playground's route handler imports the library, whose CLI and server read projects
    // from disk with computed paths. Turbopack flags each of those calls; the route never
    // makes them, so the warnings are noise, and the files they make it trace are left out below.
    ignoreIssue: [{ path: /dist\/.+\.js$/, title: /Dynamic filesystem access/ }],
  },
  outputFileTracingRoot: root,
  outputFileTracingExcludes: {
    '/api/check': [
      './app/**',
      './components/**',
      './generated/**',
      './lib/**',
      './scripts/**',
      './test/**',
    ],
  },
  headers() {
    return Promise.resolve([
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ]);
  },
};

export default config;
