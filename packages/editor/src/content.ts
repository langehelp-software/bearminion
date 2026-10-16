import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { glob } from 'astro/loaders'
import { z } from 'zod'
import { DEFAULT_CONTENT_DIR, type ContentModel } from './model.js'
import { CONTENT_COLLECTIONS_MARKER } from './reload.js'
import { createMigrator, type ContentMigrator, type DocumentKind } from './migrate.js'
import { createPageSchema, createTolerantPageSchema } from './page.js'

export interface ContentCollectionsOptions {
  /** Directory that contains `site.json` and `pages/`. Default `content`, resolved from the project root. */
  contentDir?: string
  /**
   * Accept a page whose sections include a type the site no longer defines, so `astro dev` still starts and
   * the editor can open the page and remove it. Pass `import.meta.env.DEV`: the build stays strict. Entries
   * can then hold such sections, so render them through `withoutOrphanSections()`.
   */
  tolerateOrphans?: boolean
}

/**
 * The site's content as Astro content collections, for `src/content.config.ts`:
 *
 * ```ts
 * const { pages, site } = contentCollections(contentModel)
 * export const collections = { pages: defineCollection(pages), site: defineCollection(site) }
 * ```
 *
 * `pages` has one entry per `pages/*.json`, with the page slug as its id, and `site` has the single
 * entry `site`. Both use Astro's own `glob()` loader, so entries are validated against the content
 * model's schemas, typed in `getCollection()` / `getEntry()`, and refreshed in dev when a file changes.
 * `entry.data` is the same object `loadPages()` and `loadSite()` return.
 *
 * `astro.config.ts` runs before Astro loads collections, so it keeps using `loadContent()`.
 */
export function contentCollections<TModel extends ContentModel>(model: TModel, options: ContentCollectionsOptions = {}) {
  const contentDir = path.resolve(options.contentDir ?? DEFAULT_CONTENT_DIR)
  // Tells the editor's reload plugin that Astro refreshes and reloads this content itself.
  ;(globalThis as Record<symbol, unknown>)[CONTENT_COLLECTIONS_MARKER] = true
  const migrator = createMigrator(model)
  const directoryUrl = (directory: string) => pathToFileURL(directory + path.sep)
  return {
    pages: {
      loader: glob({
        pattern: '*.json',
        base: directoryUrl(path.join(contentDir, 'pages')),
        generateId: ({ data }) => String(data.slug),
      }),
      schema: upgraded(
        migrator,
        'page',
        (options.tolerateOrphans
          ? createTolerantPageSchema(model.sections)
          : createPageSchema<TModel['sections']>(model.sections)) as ReturnType<typeof createPageSchema<TModel['sections']>>,
      ),
    },
    site: {
      loader: glob({ pattern: 'site.json', base: directoryUrl(contentDir), generateId: () => 'site' }),
      schema: upgraded(migrator, 'site', model.site.schema as TModel['site']['schema']),
    },
  }
}

/** Runs the content migrations before the schema, so collections accept files written under an older `schemaVersion`. */
function upgraded<TSchema extends z.ZodType>(migrator: ContentMigrator, kind: DocumentKind, schema: TSchema): TSchema {
  return z.preprocess((raw, ctx) => {
    const result = migrator.upgrade(raw, kind)
    if (result.ok) return result.value
    ctx.issues.push({ code: 'custom', message: result.message, input: raw, path: ['schemaVersion'] })
    return raw
  }, schema) as unknown as TSchema
}
