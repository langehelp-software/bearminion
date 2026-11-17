// Copies the default template's code into this site, which keeps only its own content, images and package.json.
// bearminion.com always runs the current template, and there is one copy of every component: change them in
// templates/default, never here. The copied files are ignored by git (see .gitignore). The one exception is `sections/`:
// section types only this site has, copied in next to the template's (see SITE_SECTIONS).
//
//   node scripts/sync-template.mjs             copy the template's code, check that the dependencies match
//   node scripts/sync-template.mjs --watch     keep copying while you edit the template
//   node scripts/sync-template.mjs --fix-deps  copy the template's dependency ranges into package.json
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, watch, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const template = path.resolve(site, '../../templates/default')

/** Template files and folders this site runs as they are. Everything else here belongs to the site. */
const SYNCED = ['astro.config.ts', 'tsconfig.json', 'src']
/** Never copied: the site's own images and form handlers, and Storybook, which this site does not use. */
const SKIPPED = ['src/assets', 'src/forms', 'src/stories']
/** Folders under `src/` that belong to this site: a sync leaves them alone. */
const SITE_OWNED = ['assets', 'forms']
const STORYBOOK = ['storybook', '@storybook/builder-vite', '@storybook-astro/framework']
/**
 * This site's dependency on the template itself. Nothing imports it: it tells Vercel's "Skip deployment" (and pnpm)
 * that bearminion.com is built from templates/default, so a template-only change still redeploys the site.
 */
const SITE_ONLY = ['bearminion-site']

/**
 * Section types only bearminion.com has, such as the editor demo: one directory each under `sections/`, copied next to
 * the template's in `src/components/sections`. They are not in templates/default, so they are not in the registry and
 * `npx bearminion add` never offers them to another site.
 */
const SITE_SECTIONS = path.join(site, 'sections')
const SECTIONS_DIR = 'src/components/sections'

const posix = (file) => file.split(path.sep).join('/')

const TAILWIND_IMPORT = /^@import\s+["']tailwindcss["'][^;]*;/m

/**
 * Tailwind does not look for class names in files listed in .gitignore, and every copied file here is. A folder named
 * in `@source` is scanned even though it is ignored, so the copy of the stylesheet that imports Tailwind names each
 * copied folder under `src/`. The template itself needs none of this: nothing in it is ignored.
 */
function withSources(css, cssFile) {
  if (!TAILWIND_IMPORT.test(css)) return css
  const src = path.join(site, 'src')
  const folders = readdirSync(path.join(template, 'src'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isSynced(`src/${entry.name}`))
    .map((entry) => posix(path.relative(path.dirname(cssFile), path.join(src, entry.name))))
    // The stylesheet's own folder holds only CSS, which Tailwind never scans.
    .filter((folder) => folder !== '')
    .sort()
  const sources = folders.map((folder) => `@source "${folder.startsWith('.') ? folder : `./${folder}`}";`).join('\n')
  return css.replace(
    TAILWIND_IMPORT,
    (line) => `${line}\n/* Added by apps/web/scripts/sync-template.mjs: Tailwind skips gitignored files. */\n${sources}`,
  )
}

/**
 * The site's sections are type-checked where they are copied to, in `src/components/sections`: in `sections/` their
 * relative imports point nowhere. So the copied tsconfig.json leaves that folder out.
 */
function withoutSiteSections(json) {
  const config = JSON.parse(json)
  config.exclude = [...new Set([...(config.exclude ?? []), 'sections'])]
  return `${JSON.stringify(config, null, 2)}\n`
}

/** Copies one template file, adding the `@source` lines to the stylesheet that imports Tailwind. */
function copyFile(source, target) {
  mkdirSync(path.dirname(target), { recursive: true })
  if (target.endsWith('.css')) writeFileSync(target, withSources(readFileSync(source, 'utf8'), target))
  else if (posix(path.relative(site, target)) === 'tsconfig.json') writeFileSync(target, withoutSiteSections(readFileSync(source, 'utf8')))
  else cpSync(source, target)
}

/** Whether a path relative to the template is copied into the site. */
function isSynced(relative) {
  const file = posix(relative)
  if (!SYNCED.some((entry) => file === entry || file.startsWith(`${entry}/`))) return false
  if (SKIPPED.some((entry) => file === entry || file.startsWith(`${entry}/`))) return false
  return !file.endsWith('.stories.ts')
}

/** Removes what an earlier sync copied, so a file deleted from the template is deleted here too. */
function clean() {
  for (const entry of SYNCED) {
    const target = path.join(site, entry)
    if (entry !== 'src') {
      rmSync(target, { force: true })
      continue
    }
    if (!existsSync(target)) continue
    for (const child of readdirSync(target)) {
      if (!SITE_OWNED.includes(child)) rmSync(path.join(target, child), { recursive: true, force: true })
    }
  }
}

function copyAll() {
  clean()
  const walk = (relative) => {
    const source = path.join(template, relative)
    if (!existsSync(source)) return
    if (statSync(source).isDirectory()) {
      for (const child of readdirSync(source)) {
        const next = path.join(relative, child)
        if (isSynced(next)) walk(next)
      }
    } else {
      copyFile(source, path.join(site, relative))
    }
  }
  for (const entry of SYNCED) walk(entry)
  copySiteSections()
}

/** Copies this site's own section directories in, then lists every section the way `bearminion sync` does. */
function copySiteSections() {
  if (!existsSync(SITE_SECTIONS)) return
  for (const name of readdirSync(SITE_SECTIONS)) {
    const source = path.join(SITE_SECTIONS, name)
    if (!statSync(source).isDirectory()) continue
    const target = path.join(site, SECTIONS_DIR, name)
    if (existsSync(path.join(template, SECTIONS_DIR, name))) {
      throw new Error(`apps/web/sections/${name} has the name of a template section. Rename it, or change the template's instead.`)
    }
    rmSync(target, { recursive: true, force: true })
    cpSync(source, target, { recursive: true })
  }
  listSections()
}

/** Rewrites definitions.gen.ts and components.gen.ts here, which were copied from the template without this site's sections. */
function listSections() {
  const cli = path.join(path.dirname(createRequire(path.join(site, 'package.json')).resolve('bearminion/package.json')), 'dist/cli.js')
  execFileSync(process.execPath, [cli, 'sync'], { cwd: site, stdio: ['ignore', 'ignore', 'inherit'] })
}

function dependencies(file) {
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  const drop = (record = {}) =>
    Object.fromEntries(Object.entries(record).filter(([name]) => !STORYBOOK.includes(name) && !SITE_ONLY.includes(name)))
  return { dependencies: drop(pkg.dependencies), devDependencies: drop(pkg.devDependencies) }
}

/** The template's dependency ranges that differ from this site's, as readable lines. */
function dependencyDrift() {
  const wanted = dependencies(path.join(template, 'package.json'))
  const actual = dependencies(path.join(site, 'package.json'))
  const lines = []
  for (const group of ['dependencies', 'devDependencies']) {
    const names = new Set([...Object.keys(wanted[group]), ...Object.keys(actual[group])])
    for (const name of [...names].sort()) {
      if (wanted[group][name] !== actual[group][name]) {
        lines.push(`  ${group}.${name}: template ${wanted[group][name] ?? '(none)'}, site ${actual[group][name] ?? '(none)'}`)
      }
    }
  }
  return lines
}

function fixDependencies() {
  const file = path.join(site, 'package.json')
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  const wanted = dependencies(path.join(template, 'package.json'))
  const siteOnly = Object.fromEntries(Object.entries(pkg.devDependencies ?? {}).filter(([name]) => SITE_ONLY.includes(name)))
  pkg.dependencies = wanted.dependencies
  pkg.devDependencies = Object.fromEntries(
    Object.entries({ ...wanted.devDependencies, ...siteOnly }).sort(([a], [b]) => a.localeCompare(b)),
  )
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
}

function watchTemplate() {
  console.log('Watching templates/default and sections/ for changes (Ctrl+C to stop)')
  if (existsSync(SITE_SECTIONS)) watch(SITE_SECTIONS, { recursive: true }, () => copySiteSections())
  watch(template, { recursive: true }, (_event, filename) => {
    if (!filename || !isSynced(filename)) return
    const source = path.join(template, filename)
    const target = path.join(site, filename)
    if (existsSync(source) && statSync(source).isFile()) {
      copyFile(source, target)
    } else if (!existsSync(source)) {
      rmSync(target, { recursive: true, force: true })
    }
    // A copied section list leaves this site's own sections out again.
    if (posix(filename).startsWith(`${SECTIONS_DIR}/`)) listSections()
  })
}

const args = new Set(process.argv.slice(2))
if (args.has('--fix-deps')) {
  fixDependencies()
  console.log('Copied the template’s dependency ranges into apps/web/package.json. Run pnpm install.')
} else {
  const drift = dependencyDrift()
  if (drift.length > 0) {
    console.error(
      `apps/web/package.json does not match templates/default/package.json:\n${drift.join('\n')}\n` +
        'Run `node scripts/sync-template.mjs --fix-deps` in apps/web, then `pnpm install`.',
    )
    process.exit(1)
  }
  copyAll()
  if (args.has('--watch')) watchTemplate()
}
