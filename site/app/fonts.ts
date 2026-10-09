import localFont from 'next/font/local';

// Geist, from the `geist` package, declared here rather than through `geist/font` so the mono
// face is not preloaded: the largest paint is the headline, which is set in the sans.
export const sans = localFont({
  src: '../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2',
  variable: '--font-geist-sans',
  weight: '100 900',
});

export const mono = localFont({
  src: '../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
  preload: false,
  adjustFontFallback: false,
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Liberation Mono', 'monospace'],
});
