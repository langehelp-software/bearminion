import { ContentReadError, ContentValidationError } from './errors.js'
import { type DocumentKind, createMigrator } from './migrate.js'
import type { ContentModel } from './model.js'
import { type Page, createPageSchema, createTolerantPageSchema, slugSchema, withoutOrphanSections } from './page.js'
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

  async function read(key: string, kind: DocumentKind): Promise<unknown> {
    const text = await store.read(key)
    if (text === undefined) return undefined
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch (error) {
      throw new ContentReadError(key, `Invalid JSON in ${key}: ${error instanceof Error ? error.message : String(error)}`)
    }
    const upgraded = migrator.upgrade(raw, kind)
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
  }
}
