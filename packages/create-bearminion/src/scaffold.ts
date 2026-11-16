import { cp, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { DOTFILE_RENAMES } from './template.js'

export interface ScaffoldOptions {
  /** The bundled template (`template/` next to `dist/`). */
  templateDir: string
  targetDir: string
  packageName: string
  siteName: string
  /** Normalized public address; the template's placeholder stays when undefined. */
  url?: string
  storybook: boolean
}

/** Storybook's files in the template. Left out unless the site is created with `--storybook`. */
export function isStorybookPath(relative: string): boolean {
  const posix = relative.split(path.sep).join('/')
  return (
    posix === '.storybook' ||
    posix.startsWith('.storybook/') ||
    posix === 'src/stories' ||
    posix.startsWith('src/stories/') ||
    posix.endsWith('.stories.ts')
  )
}

const STORYBOOK_DEPENDENCIES = ['storybook', '@storybook/builder-vite', '@storybook-astro/framework']
const STORYBOOK_SCRIPTS = ['storybook', 'build-storybook']

interface PackageJson {
  name?: string
  version?: string
  private?: boolean
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  [key: string]: unknown
}

/** The site's own `package.json`: its name, version 0.0.0, private, and Storybook only when asked for. */
export function transformPackageJson(pkg: PackageJson, options: { name: string; storybook: boolean }): PackageJson {
  const next: PackageJson = { ...pkg, name: options.name, version: '0.0.0', private: true }
  if (!options.storybook) {
    if (pkg.scripts) next.scripts = omit(pkg.scripts, STORYBOOK_SCRIPTS)
    if (pkg.devDependencies) next.devDependencies = omit(pkg.devDependencies, STORYBOOK_DEPENDENCIES)
    if (pkg.dependencies) next.dependencies = omit(pkg.dependencies, STORYBOOK_DEPENDENCIES)
  }
  return next
}

interface SiteJson {
  name?: string
  nameMarks?: unknown
  brandLogo?: unknown
  url?: string
  seo?: { titleTemplate?: string; [key: string]: unknown }
  [key: string]: unknown
}

/**
 * `content/site.json` for the new site. The template's name marks style ranges of "BearMinion" and its brand logo is
 * the BearMinion logo, so both go: the header shows the new name until the owner picks a logo or styles it.
 */
export function transformSiteJson(site: SiteJson, options: { name: string; url?: string }): SiteJson {
  const { nameMarks: _marks, brandLogo: _logo, ...rest } = site
  return {
    ...rest,
    name: options.name,
    ...(options.url ? { url: options.url } : {}),
    seo: { ...site.seo, titleTemplate: `%s · ${options.name}` },
  }
}

/** Removes every `<!-- storybook:start -->` … `<!-- storybook:end -->` block, markers included. */
export function stripStorybookBlocks(markdown: string): string {
  return markdown.replace(/\n?<!-- storybook:start -->[\s\S]*?<!-- storybook:end -->\n?/g, '\n').replace(/\n{3,}/g, '\n\n')
}

/** Entries that do not count against an "empty" target, such as a fresh `git init` or Finder's metadata. */
const HARMLESS = new Set(['.git', '.DS_Store', 'Thumbs.db'])

/** The target's entries that would be overwritten or mixed in with the site. Empty when the target can be used. */
export async function blockingEntries(targetDir: string): Promise<string[]> {
  if (!existsSync(targetDir)) return []
  const entries = await readdir(targetDir)
  return entries.filter((entry) => !HARMLESS.has(entry)).sort()
}

export async function scaffold(options: ScaffoldOptions): Promise<void> {
  const { templateDir, targetDir } = options
  await cp(templateDir, targetDir, {
    recursive: true,
    filter: (file) => options.storybook || !isStorybookPath(path.relative(templateDir, file)),
  })
  for (const [stored, real] of Object.entries(DOTFILE_RENAMES)) {
    const file = path.join(targetDir, stored)
    if (existsSync(file)) await rename(file, path.join(targetDir, real))
  }

  const pkgPath = path.join(targetDir, 'package.json')
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as PackageJson
  await writeFile(
    pkgPath,
    `${JSON.stringify(transformPackageJson(pkg, { name: options.packageName, storybook: options.storybook }), null, 2)}\n`,
  )

  // The editor writes content JSON with sorted keys; keep that layout so its first save is a clean diff.
  const sitePath = path.join(targetDir, 'content', 'site.json')
  const site = JSON.parse(await readFile(sitePath, 'utf8')) as SiteJson
  const siteOptions = options.url ? { name: options.siteName, url: options.url } : { name: options.siteName }
  await writeFile(sitePath, `${stableStringify(transformSiteJson(site, siteOptions))}\n`)

  if (!options.storybook) {
    const readmePath = path.join(targetDir, 'README.md')
    if (existsSync(readmePath)) await writeFile(readmePath, stripStorybookBlocks(await readFile(readmePath, 'utf8')))
  }
}

function omit(record: Record<string, string>, keys: string[]): Record<string, string> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)))
}

/** 2-space JSON with object keys sorted, the layout the editor writes content files in. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2)
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    )
  }
  return value
}
