import { readFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'tsdown'
import { assertTemplateRange, copyTemplate } from './src/template.ts'

const here = import.meta.dirname
const templateSource = path.resolve(here, '../../templates/default')
const templateTarget = path.resolve(here, 'template')
const bearminion = JSON.parse(readFileSync(path.resolve(here, '../editor/package.json'), 'utf8')) as { version: string }

export default defineConfig({
  entry: { cli: 'src/cli.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node22',
  dts: false,
  clean: true,
  sourcemap: false,
  deps: {
    neverBundle: [/^node:/],
    // One file with no runtime dependencies: `npm create` downloads only this package before it can ask anything.
    alwaysBundle: [/^@clack\//, /^picocolors$/, /^sisteransi$/, /^fast-string-width$/, /^fast-wrap-ansi$/],
  },
  onSuccess: () => {
    copyTemplate(templateSource, templateTarget)
    assertTemplateRange(templateTarget, bearminion.version)
  },
})
