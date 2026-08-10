import { defineConfig } from 'tsup';

export default defineConfig([
  // Library builds for bundlers / Node consumers.
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'es2019',
  },
  // Script-tag build: exposes window.SparqAnalytics (v2 API + StAnalyticsClient).
  {
    entry: { 'sparq-analytics.iife': 'src/index.ts' },
    format: ['iife'],
    globalName: 'SparqAnalytics',
    sourcemap: true,
    minify: true,
    target: 'es2019',
  },
]);
