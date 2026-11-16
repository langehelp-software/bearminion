import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'tsdown'
import { assertTemplateRange, copyTemplate, trimToStarter } from './src/template.ts'

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
    const registryTool = path.resolve(here, '../editor/dist/registry-build.js')
    const bearminionCli = path.resolve(here, '../editor/dist/cli.js')
    if (!existsSync(registryTool) || !existsSync(bearminionCli)) {
      throw new Error('Build bearminion first (pnpm build:lib): create-bearminion needs its registry tool and command line.')
    }
    // A new site starts with the starter's sections; the rest stay one `npx bearminion add` away.
    trimToStarter(templateTarget)
    execFileSync(process.execPath, [bearminionCli, 'sync', '--cwd', templateTarget], { stdio: 'inherit' })
    // The lock a new site starts with: which release each file `bearminion add` can update came from.
    execFileSync(
      process.execPath,
      [registryTool, 'lock', '--template', templateTarget, '--out', path.join(templateTarget, 'bearminion.lock.json')],
      {
        stdio: 'inherit',
      },
    )
  },
})
