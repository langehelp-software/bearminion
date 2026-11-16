import {
  LISTING_MIGRATION_TYPE,
  createEntrySchema,
  createListingSchema,
  entryKey,
  listingKey,
  resolveTypes,
  type ContentType,
  type Entry,
  type ListingDocument,
  type MultiType,
} from './content-types.js'
import { ContentReadError, ContentValidationError } from './errors.js'
import { type DocumentKind, createMigrator } from './migrate.js'
import type { ContentModel } from './model.js'
import { type Page, createPageSchema, createTolerantPageSchema, slugSchema, withoutOrphanSections } from './page.js'
import { type Route, emptySingle, listedEntries, listingRoute, matchPath, normalizePath } from './routing.js'
import { type ContentStore, SITE_KEY, pageKey } from './store-core.js'

/*
 * The site's own pages, read from a ContentStore at request time: what a hosted editor needs to draw a page from the
 * repository's current content instead of the content baked in at build time. Same checks as the build (migrate, then
 * validate), so a page the editor shows is a page the site could publish. Pure: no Node, Astro or Vite imports.
 */

export interface StoreContent {
  /** `site.json`. Throws `ContentReadError` when it is missing or not JSON, `ContentValidationError` when it is invalid. */
  getSite(): Promise<unknown>
  /** One page by slug (the home page is `index`), or `undefined` when there is none or the slug is not a slug. */
  getPage(slug: string): Promise<Page | undefined>
  /**
   * What the address `pathname` shows: a page, an entry of a declared type, a single, or one page of a listing. The
   * same answer the static build gives for that address, drafts included, since this is what an editor is looking at.
   * Undefined when nothing lives there.
   */
  getRoute(pathname: string): Promise<Route | undefined>
}

export interface StoreContentOptions {
  /**
   * Keep a page that holds a section type the site dropped, and leave that section out of what is returned. The editor
   * needs it to open such a page and remove the section. Default true.
   */
  tolerateOrphans?: boolean
}

export function createStoreContent(model: ContentModel, store: ContentStore, options: StoreContentOptions = {}): StoreContent {
  const migrator = createMigrator(model)
  const tolerant = options.tolerateOrphans !== false

  const types = resolveTypes(model)
  const orphans = { tolerateOrphans: tolerant }

  /** One stored page-like document, checked like the build checks it, or undefined when there is no such file. */
  async function document<T extends { sections: unknown[] }>(key: string, schema: { safeParse(input: unknown): unknown }, type: string) {
    const raw = await read(key, 'page', type)
    if (raw === undefined) return undefined
    const parsed = schema.safeParse(raw) as
      | { success: true; data: T }
      | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } }
    if (!parsed.success) throw new ContentValidationError(key, parsed.error.issues)
    return withoutOrphanSections(parsed.data, model.sections)
  }

  const entryOf = (type: ContentType, key: string) => document<Entry>(key, createEntrySchema(model.sections, type, orphans), type.id)

  /** Every entry of a type. A listing needs each entry's title and sort field, so it reads them all. */
  async function entriesOf(type: MultiType): Promise<Entry[]> {
    const names = ((await store.list(type.dir)) ?? []).filter(
      (name) => name.endsWith('.json') && !name.startsWith('.') && !name.startsWith('_'),
    )
    const found = await Promise.all(names.map((name) => entryOf(type, `${type.dir}/${name}`)))
    return found.filter((entry): entry is Entry => entry !== undefined)
  }

  async function siteLang(): Promise<string> {
    const raw = await read(SITE_KEY, 'site')
    const lang = typeof raw === 'object' && raw !== null && 'lang' in raw ? raw.lang : undefined
    return typeof lang === 'string' && lang !== '' ? lang : 'en'
  }

  async function read(key: string, kind: DocumentKind, type?: string): Promise<unknown> {
    const text = await store.read(key)
    if (text === undefined) return undefined
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch (error) {
      throw new ContentReadError(key, `Invalid JSON in ${key}: ${error instanceof Error ? error.message : String(error)}`)
    }
    const upgraded = migrator.upgrade(raw, kind, type)
    if (!upgraded.ok) throw new ContentValidationError(key, [{ path: [], message: upgraded.message }])
    return upgraded.value
  }

  return {
    async getSite() {
      const raw = await read(SITE_KEY, 'site')
      if (raw === undefined) throw new ContentReadError(SITE_KEY, `Content file not found: ${SITE_KEY}`)
      const parsed = model.site.schema.safeParse(raw)
      if (!parsed.success) throw new ContentValidationError(SITE_KEY, parsed.error.issues)
      return parsed.data
    },

    async getPage(slug) {
      if (!slugSchema.safeParse(slug).success) return undefined
      const key = pageKey(slug)
      const raw = await read(key, 'page')
      if (raw === undefined) return undefined
      const parsed = (tolerant ? createTolerantPageSchema(model.sections) : createPageSchema(model.sections)).safeParse(raw)
      if (!parsed.success) throw new ContentValidationError(key, parsed.error.issues)
      return withoutOrphanSections(parsed.data as Page, model.sections)
    },
    async getRoute(pathname) {
      const match = matchPath(types, pathname)
      if (match === null) return undefined
      if (match.kind === 'single') {
        const { type } = match
        const page = (await entryOf(type, type.key)) ?? (type.builtIn ? undefined : emptySingle(type))
        return page && { kind: 'page', type: type.id, path: type.path, page }
      }
      if (match.kind === 'entry') {
        const { type, slug } = match
        // The home page is stored among the pages as `index`, but its address is `/`, not `/index`.
        if (type === types.pages && slug === types.home.slug) return undefined
        const page = await entryOf(type, entryKey(type, slug))
        return page && page.slug === slug ? { kind: 'page', type: type.id, path: normalizePath(pathname), page } : undefined
      }
      const { type, page } = match
      const [entries, listing, locale] = await Promise.all([
        entriesOf(type),
        document<ListingDocument>(listingKey(type), createListingSchema(model.sections, orphans), LISTING_MIGRATION_TYPE),
        siteLang(),
      ])
      return listingRoute(type, listing, listedEntries(type, entries, { locale, drafts: true }), page)
    },
  }
}
