import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { glob } from 'astro/loaders'
import { z } from 'zod'
import {
  LISTINGS_COLLECTION,
  LISTING_FILE,
  LISTING_MIGRATION_TYPE,
  SINGLES_COLLECTION,
  SINGLES_DIR,
  createEntrySchema,
  createListingSchema,
  resolveTypes,
  type ContentType,
  type ResolvedTypes,
} from './content-types.js'
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
 * A model that declares content types gets more collections under `types`, to spread into the same object:
 *
 * ```ts
 * const { pages, site, types } = contentCollections(contentModel)
 * export const collections = {
 *   pages: defineCollection(pages),
 *   site: defineCollection(site),
 *   ...Object.fromEntries(Object.entries(types).map(([name, collection]) => [name, defineCollection(collection)])),
 * }
 * ```
 *
 * `types` has one collection per declared multi type, named by its id (entry id = slug), plus `bm-listings` (entry id =
 * type id) when a type has a listing page and `bm-singles` (entry id = type id) when the model declares singles. It is
 * empty for a model with no types, so the two collections above are all a site without types has.
 *
 * `astro.config.ts` runs before Astro loads collections, so it keeps using `loadContent()`.
 */
export function contentCollections<TModel extends ContentModel>(model: TModel, options: ContentCollectionsOptions = {}) {
  const contentDir = path.resolve(options.contentDir ?? DEFAULT_CONTENT_DIR)
  // Tells the editor's reload plugin that Astro refreshes and reloads this content itself.
  ;(globalThis as Record<symbol, unknown>)[CONTENT_COLLECTIONS_MARKER] = true
  const migrator = createMigrator(model)
  const directoryUrl = (directory: string) => pathToFileURL(directory + path.sep)
  const tolerateOrphans = options.tolerateOrphans === true
  const resolved = resolveTypes(model)
  const documentSchema = (type: ContentType) =>
    upgraded(migrator, 'page', createEntrySchema(model.sections, type, { tolerateOrphans }), type.id)

  const types: Record<string, { loader: ReturnType<typeof glob>; schema: z.ZodType }> = {}
  const declared = resolved.multi.filter((type) => type !== resolved.pages)
  for (const type of declared) {
    types[type.id] = {
      // A leading underscore marks a file that is not an entry: the type's listing page.
      loader: glob({
        pattern: ['*.json', '!_*.json'],
        base: directoryUrl(path.join(contentDir, type.dir)),
        generateId: ({ data }) => String(data.slug),
      }),
      schema: documentSchema(type),
    }
  }
  const listed = declared.filter((type) => type.listing)
  if (listed.length > 0) {
    types[LISTINGS_COLLECTION] = {
      loader: glob({
        pattern: listed.map((type) => `${type.dir}/${LISTING_FILE}`),
        base: directoryUrl(contentDir),
        generateId: ({ entry }) => entry.split('/')[0] ?? entry,
      }),
      schema: upgraded(migrator, 'page', createListingSchema(model.sections, { tolerateOrphans }), LISTING_MIGRATION_TYPE),
    }
  }
  const singles = resolved.singles.filter((type) => !type.builtIn)
  if (singles.length > 0) {
    types[SINGLES_COLLECTION] = {
      loader: glob({
        pattern: singles.map((type) => `${type.id}.json`),
        base: directoryUrl(path.join(contentDir, SINGLES_DIR)),
        generateId: ({ entry }) => entry.replace(/\.json$/, ''),
      }),
      // Each single has its own fields; its address segment, stored as the slug, says which one a file is.
      schema: bySlug((slug) => singles.find((type) => type.slug === slug), documentSchema, 'No single is declared for this file.'),
    }
  }
  const tuned = resolved.pages.fields !== null || resolved.pages.sections !== null
  return {
    types,
    pages: {
      loader: glob({
        pattern: '*.json',
        base: directoryUrl(path.join(contentDir, 'pages')),
        generateId: ({ data }) => String(data.slug),
      }),
      schema: (tuned
        ? // `pages` has fields or a section list of its own, which the home and 404 pages stored beside it do not follow.
          bySlug((slug) => pageType(resolved, slug), documentSchema, '')
        : upgraded(
            migrator,
            'page',
            options.tolerateOrphans ? createTolerantPageSchema(model.sections) : createPageSchema<TModel['sections']>(model.sections),
            (raw) => pageType(resolved, slugOf(raw)).id,
          )) as ReturnType<typeof createPageSchema<TModel['sections']>>,
    },
    site: {
      loader: glob({ pattern: 'site.json', base: directoryUrl(contentDir), generateId: () => 'site' }),
      schema: upgraded(migrator, 'site', model.site.schema as TModel['site']['schema']),
    },
  }
}

export { LISTINGS_COLLECTION, SINGLES_COLLECTION }

function pageType(types: ResolvedTypes, slug: string): ContentType {
  return slug === types.home.slug ? types.home : slug === types.notFound.slug ? types.notFound : types.pages
}

const slugOf = (raw: unknown): string =>
  typeof raw === 'object' && raw !== null && 'slug' in raw && typeof raw.slug === 'string' ? raw.slug : ''

/** A schema for a folder whose files are of different types: the `slug` inside a file picks the schema it must pass. */
function bySlug(typeOf: (slug: string) => ContentType | undefined, schemaOf: (type: ContentType) => z.ZodType, unknown: string): z.ZodType {
  return z.unknown().transform((raw, ctx) => {
    const type = typeOf(slugOf(raw))
    if (!type) {
      ctx.issues.push({ code: 'custom', message: unknown, input: raw, path: ['slug'] })
      return z.NEVER
    }
    const result = schemaOf(type).safeParse(raw)
    if (result.success) return result.data
    for (const issue of result.error.issues) ctx.issues.push({ code: 'custom', message: issue.message, path: issue.path, input: raw })
    return z.NEVER
  })
}

/** Runs the content migrations before the schema, so collections accept files written under an older `schemaVersion`. */
function upgraded<TSchema extends z.ZodType>(
  migrator: ContentMigrator,
  kind: DocumentKind,
  schema: TSchema,
  /** The content type's id, for the migrations: fixed, or read from the file when a folder holds more than one type. */
  type?: string | ((raw: unknown) => string),
): TSchema {
  return z.preprocess((raw, ctx) => {
    const result = migrator.upgrade(raw, kind, typeof type === 'function' ? type(raw) : type)
    if (result.ok) return result.value
    ctx.issues.push({ code: 'custom', message: result.message, input: raw, path: ['schemaVersion'] })
    return raw
  }, schema) as unknown as TSchema
}
