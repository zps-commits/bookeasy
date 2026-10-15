import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /*
   * cacheComponents is off, which the scaffold turns on.
   *
   * It asks every dynamic route for a static shell with the per-request
   * parts behind Suspense. Every page here is per-request by nature:
   * availability changes the moment someone books, and a booking page is
   * addressed by a secret. There is no meaningful shell to prerender, so
   * the feature would buy complexity and no caching.
   */
  cacheComponents: false,
  /*
   * Without this, Next walks up and finds the lockfile in the home
   * directory, then warns that it is outside the repository and traces
   * from the wrong root.
   */
  outputFileTracingRoot: path.join(import.meta.dirname),
  turbopack: {
    rules: {
      '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' },
    },
  },
};

export default nextConfig;
