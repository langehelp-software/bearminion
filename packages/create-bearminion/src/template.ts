import { cpSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
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

/**
 * The sections a new site starts with. `templates/default` holds every section, because the registry that
 * `npx bearminion add <section>` copies from is built from it; a new site gets these and adds the rest when it needs
 * them. Contact is left out on purpose: its form needs a handler and host glue, so `npx bearminion add form` brings
 * the section along with them.
 */
export const STARTER_SECTIONS = ['hero', 'steps', 'gallery', 'features', 'text', 'text-image', 'media', 'faq', 'cta'] as const

const SECTIONS_DIR = 'src/components/sections'
const CODE = /\.(?:ts|mts|mjs|js|astro)$/
const RESOLVE = ['', '.ts', '.astro', '.mjs', '.js', '/index.ts']

function codeFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((name) => path.join(dir, name))
    .filter((file) => CODE.test(file) && !file.split(path.sep).includes('node_modules') && statSync(file).isFile())
}

/** The files in the template that `file` imports with a relative path. */
function localImports(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  const found: string[] = []
  for (const match of text.matchAll(
    /\b(?:import|export)\s[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|\bimport\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g,
  )) {
    const base = path.resolve(path.dirname(file), (match[1] ?? match[2]) as string)
    const hit = RESOLVE.map((ending) => base + ending).find((candidate) => existsSync(candidate) && statSync(candidate).isFile())
    if (hit) found.push(hit)
  }
  return found
}

/**
 * Leaves only `keep` in the copied template: the other section directories go, and so does every file only they
 * imported (the Contact form's rules, say). The generated section lists still name the removed sections; run
 * `bearminion sync` in the target afterwards. Returns the removed paths, relative to `target`.
 */
export function trimToStarter(target: string, keep: readonly string[] = STARTER_SECTIONS): string[] {
  const sectionsDir = path.join(target, SECTIONS_DIR)
  const dropped = readdirSync(sectionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !keep.includes(entry.name) && existsSync(path.join(sectionsDir, entry.name, 'definition.ts')))
    .map((entry) => path.join(sectionsDir, entry.name))
  const missing = keep.filter((name) => !existsSync(path.join(sectionsDir, name, 'definition.ts')))
  if (missing.length > 0) throw new Error(`The starter lists sections the template does not have: ${missing.join(', ')}.`)

  // What the dropped sections reach, outside their own directories: the candidates for removal.
  const candidates = new Set<string>()
  const queue = dropped.flatMap((dir) => codeFiles(dir))
  while (queue.length > 0) {
    for (const imported of localImports(queue.pop() as string)) {
      if (dropped.some((dir) => imported.startsWith(dir + path.sep)) || candidates.has(imported)) continue
      candidates.add(imported)
      queue.push(imported)
    }
  }
  for (const dir of dropped) rmSync(dir, { recursive: true, force: true })

  // A candidate stays while anything left (generated lists aside, which sync rewrites) imports it.
  const generated = new Set(['definitions.gen.ts', 'components.gen.ts'].map((name) => path.join(sectionsDir, name)))
  const removed = dropped.map((dir) => path.relative(target, dir))
  for (;;) {
    const used = new Set<string>()
    const roots = [...codeFiles(path.join(target, 'src')), ...codeFiles(path.join(target, '.storybook'))]
    for (const name of readdirSync(target)) if (CODE.test(name)) roots.push(path.join(target, name))
    for (const file of roots)
      if (!generated.has(file) && !candidates.has(file)) for (const imported of localImports(file)) used.add(imported)
    // Candidates import each other: one that only another unused candidate imports is unused too.
    let changed = true
    while (changed) {
      changed = false
      for (const file of candidates) {
        if (!used.has(file)) continue
        for (const imported of localImports(file))
          if (!used.has(imported)) {
            used.add(imported)
            changed = true
          }
      }
    }
    const unused = [...candidates].filter((file) => !used.has(file) && existsSync(file))
    if (unused.length === 0) break
    for (const file of unused) {
      rmSync(file)
      candidates.delete(file)
      removed.push(path.relative(target, file).split(path.sep).join('/'))
    }
  }
  return removed.map((file) => file.split(path.sep).join('/'))
}
