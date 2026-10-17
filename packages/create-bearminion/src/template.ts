import { cpSync, existsSync, readFileSync, renameSync, rmSync } from 'node:fs'
import path from 'node:path'

/** Never copied from the monorepo's template: installs, builds, caches and the editor's local history. */
const SKIPPED = new Set(['node_modules', 'dist', '.astro', '.editor', 'storybook-static', '.DS_Store'])
/** Files e2e tests upload into the template while they run. */
const SKIPPED_PATHS = ['src/assets/e2e-uploads']

/**
 * npm leaves `.gitignore` and `.npmrc` out of published packages, so the bundled template stores them under these
 * names and `scaffold()` renames them back.
 */
export const DOTFILE_RENAMES: Record<string, string> = { _gitignore: '.gitignore', _npmrc: '.npmrc' }

/**
 * Copies `templates/default` into the CLI package at build time. The site the CLI creates is exactly this copy, so
 * it cannot drift from the `bearminion` version it is released with.
 */
export function copyTemplate(source: string, target: string): void {
  if (!existsSync(path.join(source, 'package.json'))) throw new Error(`No template at ${source}`)
  rmSync(target, { recursive: true, force: true })
  cpSync(source, target, {
    recursive: true,
    filter: (file) => {
      const relative = path.relative(source, file).split(path.sep).join('/')
      if (relative === '') return true
      if (relative.split('/').some((part) => SKIPPED.has(part))) return false
      return !SKIPPED_PATHS.some((skipped) => relative === skipped || relative.startsWith(`${skipped}/`))
    },
  })
  for (const [stored, real] of Object.entries(DOTFILE_RENAMES)) {
    const file = path.join(target, real)
    if (existsSync(file)) renameSync(file, path.join(target, stored))
  }
}

/**
 * Fails the build when the template asks for a `bearminion` range that the package being released does not satisfy
 * as its lowest version (`^1.1.0` for 1.1.0). Changesets keeps the two in step; this catches a release that did not.
 */
export function assertTemplateRange(templateDir: string, bearminionVersion: string): void {
  const pkg = JSON.parse(readFileSync(path.join(templateDir, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> }
  const range = pkg.dependencies?.bearminion
  if (range !== `^${bearminionVersion}`) {
    throw new Error(
      `templates/default asks for bearminion "${range}", but bearminion is ${bearminionVersion}. Expected "^${bearminionVersion}".`,
    )
  }
}
