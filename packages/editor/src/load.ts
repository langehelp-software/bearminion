import fs from 'node:fs'
import path from 'node:path'
import type { z } from 'zod'
import { ContentReadError, ContentValidationError, type ContentIssue } from './errors.js'
import {
  LISTING_FILE,
  LISTING_MIGRATION_TYPE,
  createEntrySchema,
  createListingSchema,
  resolveTypes,
  type ContentType,
  type Entry,
  type ListingDocument,
} from './content-types.js'
import type { ContentModel, SectionRegistry } from './model.js'
import { createPageSchema, createTolerantPageSchema, type Page } from './page.js'
import type { SectionOf } from './section-schema.js'
import { SCHEMA_VERSION_KEY, createMigrator, type ContentMigrator, type DocumentKind } from './migrate.js'
import type { SiteDefinition, SiteOf } from './site.js'

export interface LoadOptions {
  /** Upgrades files written under an older `schemaVersion`. `loadContent` builds it from the model. */
  migrator?: ContentMigrator
  /**
   * Keep a page's sections whose `type` the site no longer defines, instead of failing. For config-time
   * code that does not render sections (the sitemap filter, the `site` URL), so `astro dev` still starts and
   * the editor can open the page and remove the section. The collections and the build stay strict.
   */
  tolerateOrphans?: boolean
}

export interface LoadedContent<TModel extends ContentModel = ContentModel> {
  site: SiteOf<TModel['site']>
  /** Everything in `pages/`: the home page (`index`), the 404 page and the pages. */
  pages: Page<SectionOf<TModel['sections']>>[]
  /** The entries of each type the model declares, by type id, in file name order. Empty for a model with no types. */
  entries: Record<string, Entry[]>
  /** The listing page document of each type that has one saved, by type id. */
  listings: Record<string, ListingDocument>
  /** The document of each declared single that has been saved, by type id. */
  singles: Record<string, Entry>
}

/**
 * Load `site.json` and `pages/*.json` from a content directory.
 * Throws {@link ContentReadError} or {@link ContentValidationError} with the file path.
 */
export function loadContent<TModel extends ContentModel>(
  contentDir: string,
  model: TModel,
  options: Pick<LoadOptions, 'tolerateOrphans'> = {},
): LoadedContent<TModel> {
  const migrator = createMigrator(model)
  const types = resolveTypes(model)
  const tolerateOrphans = options.tolerateOrphans === true
  const entries: Record<string, Entry[]> = {}
  const listings: Record<string, ListingDocument> = {}
  const singles: Record<string, Entry> = {}
  for (const type of types.multi) {
    if (type === types.pages) continue
    const dir = path.join(contentDir, type.dir)
    const schema = createEntrySchema(model.sections, type, { tolerateOrphans })
    // A type nobody has written an entry for yet has no folder. That is an empty type, not an error.
    const files = jsonFiles(dir, { missing: 'empty' }).filter((name) => !name.startsWith('_'))
    entries[type.id] = uniqueSlugs(
      dir,
      files,
      files.map((name) => parseFile(path.join(dir, name), schema, migrator, 'page', type.id)),
    )
    const listingFile = path.join(dir, LISTING_FILE)
    if (type.listing && fs.existsSync(listingFile)) {
      listings[type.id] = parseFile(
        listingFile,
        createListingSchema(model.sections, { tolerateOrphans }),
        migrator,
        'page',
        LISTING_MIGRATION_TYPE,
      )
    }
  }
  for (const type of types.singles) {
    const file = path.join(contentDir, type.key)
    if (type.builtIn || !fs.existsSync(file)) continue
    singles[type.id] = parseFile(file, createEntrySchema(model.sections, type, { tolerateOrphans }), migrator, 'page', type.id)
  }
  return {
    site: loadSite(contentDir, model.site, { migrator }) as SiteOf<TModel['site']>,
    pages: loadPages<TModel['sections']>(contentDir, model.sections, {
      migrator,
      ...options,
      // The home and 404 pages are stored among the pages but are not of the `pages` type.
      typeOf: (slug: string) => (slug === types.home.slug ? types.home : slug === types.notFound.slug ? types.notFound : types.pages),
    }),
    entries,
    listings,
    singles,
  }
}

/** Names of the `.json` files directly inside `dir`, sorted. */
function jsonFiles(dir: string, options: { missing: 'empty' | 'throw' }): string[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (error) {
    if (isErrno(error) && error.code === 'ENOENT') {
      if (options.missing === 'empty') return []
      throw new ContentReadError(dir, `Pages directory not found: ${dir}`)
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new ContentReadError(dir, `Unable to read pages directory ${dir}: ${message}`)
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
}

function uniqueSlugs<T extends { slug: string }>(dir: string, files: readonly string[], documents: T[]): T[] {
  const seen = new Map<string, string>()
  for (const [index, document] of documents.entries()) {
    const filePath = path.join(dir, files[index] ?? '')
    const previous = seen.get(document.slug)
    if (previous !== undefined) {
      throw new ContentValidationError(filePath, [
        {
          path: ['slug'],
          message: `Duplicate slug "${document.slug}" (also defined in ${previous})`,
        },
      ])
    }
    seen.set(document.slug, filePath)
  }
  return documents
}

/** Validate and return `contentDir/site.json`. */
export function loadSite<TDefinition extends SiteDefinition>(
  contentDir: string,
  site: TDefinition,
  { migrator = createMigrator() }: Pick<LoadOptions, 'migrator'> = {},
): SiteOf<TDefinition> {
  const filePath = path.join(contentDir, 'site.json')
  return parseFile(filePath, site.schema as z.ZodType<SiteOf<TDefinition>>, migrator, 'site')
}

/**
 * Validate every `contentDir/pages/*.json` file.
 * Pages are returned in filename order. Slugs must be unique.
 */
export function loadPages<TRegistry extends SectionRegistry>(
  contentDir: string,
  registry: TRegistry,
  { migrator = createMigrator(), tolerateOrphans = false, typeOf }: LoadOptions & { typeOf?: (slug: string) => ContentType } = {},
): Page<SectionOf<TRegistry>>[] {
  const pagesDir = path.join(contentDir, 'pages')
  const files = jsonFiles(pagesDir, { missing: 'throw' })
  const pageSchema = (tolerateOrphans ? createTolerantPageSchema(registry) : createPageSchema(registry)) as z.ZodType<
    Page<SectionOf<TRegistry>>
  >
  const pages = files.map((name) => {
    const filePath = path.join(pagesDir, name)
    if (!typeOf) return parseFile(filePath, pageSchema, migrator, 'page')
    // Which schema applies depends on the slug inside the file, so read it before validating.
    const raw = readJsonFile(filePath)
    const type = typeOf(typeof raw === 'object' && raw !== null && 'slug' in raw && typeof raw.slug === 'string' ? raw.slug : '')
    const schema = createEntrySchema(registry, type, { tolerateOrphans }) as unknown as z.ZodType<Page<SectionOf<TRegistry>>>
    return parseFile(filePath, schema, migrator, 'page', type.id)
  })
  return uniqueSlugs(pagesDir, files, pages)
}

function parseFile<T>(filePath: string, schema: z.ZodType<T>, migrator: ContentMigrator, kind: DocumentKind, type?: string): T {
  const upgraded = migrator.upgrade(readJsonFile(filePath), kind, type)
  if (!upgraded.ok) {
    throw new ContentValidationError(filePath, [{ path: [SCHEMA_VERSION_KEY], message: upgraded.message }])
  }
  const result = schema.safeParse(upgraded.value)
  if (!result.success) {
    throw new ContentValidationError(filePath, toIssues(result.error.issues))
  }
  return result.data
}

function readJsonFile(filePath: string): unknown {
  let raw: string
  try {
    raw = fs.readFileSync(filePath, 'utf8')
  } catch (error) {
    if (isErrno(error) && error.code === 'ENOENT') {
      throw new ContentReadError(filePath, `Content file not found: ${filePath}`)
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new ContentReadError(filePath, `Unable to read ${filePath}: ${message}`)
  }

  try {
    return JSON.parse(raw) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new ContentReadError(filePath, `Invalid JSON in ${filePath}: ${message}`)
  }
}

function toIssues(issues: readonly { path: PropertyKey[]; message: string }[]): ContentIssue[] {
  return issues.map((issue) => ({
    path: [...issue.path],
    message: issue.message,
  }))
}

function isErrno(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
