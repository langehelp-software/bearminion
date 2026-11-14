import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { resolveTypes } from './content-types.js'
import { loadContent } from './load.js'
import type { ContentModel } from './model.js'
import { normalizePath, siteRoutes } from './routing.js'

/*
 * A site's route file is copied from the starter and stays the site's: `npm update bearminion` does not touch it. A
 * route file from before content types knows only pages, so a site that declares a type and keeps the old file would
 * build without a word and publish no entries. These checks say so instead. They look only at sites that declare a
 * type, single or listing of their own: a site with none is never checked and cannot be failed by them.
 */

export const TYPES_UPGRADE_DOCS = 'https://docs.bearminion.com/content-types/#upgrading-from-120'

const ROUTE_FILE = 'src/pages/[...slug].astro'

/** True when the model declares something beyond the built-in home page, 404 page and pages. */
function declaresTypes(model: Pick<ContentModel, 'types'>): boolean {
  const types = resolveTypes(model)
  return types.multi.length > 1 || types.singles.some((type) => !type.builtIn)
}

/** `blog/first/`, `/blog/first/index.html` and `blog/first.html` are all the address `/blog/first`. */
function emittedPath(pathname: string): string {
  const trimmed = pathname.replace(/(^|\/)index\.html$/, '').replace(/\.html$/, '')
  return normalizePath(`/${trimmed.replace(/^\/+/, '')}`)
}

/**
 * The addresses of declared types, singles and listings that the build should have written and did not. `emitted` is
 * the `pathname` of every page Astro built. Empty for a model that declares nothing of its own.
 */
export function missingRoutes(model: ContentModel, contentDir: string, emitted: readonly string[]): string[] {
  if (!declaresTypes(model)) return []
  const types = resolveTypes(model)
  const builtIn = new Set([types.home.id, types.notFound.id, types.pages.id])
  const content = loadContent(contentDir, model)
  const lang = (content.site as { lang?: unknown }).lang
  const built = new Set(emitted.map(emittedPath))
  return siteRoutes(model, content, typeof lang === 'string' ? { locale: lang } : {})
    .filter((route) => !builtIn.has(route.type))
    .map((route) => route.path)
    .filter((routePath) => !built.has(routePath))
}

export function missingRoutesMessage(missing: readonly string[]): string {
  const shown = missing.slice(0, 10).join(', ')
  const more = missing.length > 10 ? ` and ${missing.length - 10} more` : ''
  return (
    `The content model declares content types, but the build wrote no page for: ${shown}${more}. ` +
    `${ROUTE_FILE} is the starter's file from before content types and knows only pages. ` +
    `Update the site's files with \`npx bearminion add types\`, then build again. ${TYPES_UPGRADE_DOCS}`
  )
}

/**
 * Why the route file of the project at `root` cannot serve declared types, or undefined when it can, when the model
 * declares none, or when the site has its own routes. For `astro dev`, where pages are drawn one request at a time
 * and there is no list of built pages to compare.
 */
export function staleRouteFile(model: ContentModel, root: string): string | undefined {
  if (!declaresTypes(model)) return undefined
  const file = path.join(root, ROUTE_FILE)
  let source: string
  try {
    if (!existsSync(file)) return undefined
    source = readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
  if (source.includes('getRoute')) return undefined
  return (
    `The content model declares content types, but ${ROUTE_FILE} is the starter's file from before content types: ` +
    `entries, singles and listing pages will answer 404. Update the site's files with ` +
    `\`npx bearminion add types\`. ${TYPES_UPGRADE_DOCS}`
  )
}
