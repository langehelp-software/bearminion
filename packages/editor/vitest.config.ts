import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  define: { __BEARMINION_VERSION__: JSON.stringify(version) },
  test: {
    // Vitest 5 shares one module cache at the workspace root by default, and every run that finds it stale deletes it,
    // so `pnpm test` running the packages in parallel failed with ENOTEMPTY. Each package keeps its own.
    fsModuleCachePath: 'node_modules/.vitest-cache',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
