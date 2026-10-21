import { defineConfig } from 'vitest/config'

/**
 * Tests for the default template. `template` covers its own modules and runs in seconds. `e2e` builds the
 * template and drives the editor overlay in Chromium against `astro dev`, so it runs one file at a time.
 */
export default defineConfig({
  test: {
    // Vitest 5 shares one module cache at the workspace root by default, and every run that finds it stale deletes it,
    // so `pnpm test` running the packages in parallel failed with ENOTEMPTY. Each package keeps its own.
    fsModuleCachePath: 'node_modules/.vitest-cache',
    // The e2e files share a dev server port; the template tests are quick either way.
    fileParallelism: false,
    projects: [
      {
        test: {
          name: 'template',
          environment: 'node',
          include: ['template/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'e2e',
          environment: 'node',
          include: ['e2e/**/*.test.ts'],
          testTimeout: 60_000,
        },
      },
    ],
  },
})
