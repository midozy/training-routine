import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Screen smoke tests: render every main screen in a simulated browser, against a fake cloud, and fail on any crash.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: {
    environment: 'jsdom',
    env: { NODE_ENV: 'test' }, // React's production build has no test support; a stray NODE_ENV=production in the shell must not matter
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    testTimeout: 20000,
  },
});
