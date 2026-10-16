import fs from 'node:fs'
import path from 'node:path'
import type { z } from 'zod'
import { ContentReadError, ContentValidationError, type ContentIssue } from './errors.js'
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
  pages: Page<SectionOf<TModel['sections']>>[]
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
  return {
    site: loadSite(contentDir, model.site, { migrator }) as SiteOf<TModel['site']>,
    pages: loadPages<TModel['sections']>(contentDir, model.sections, { migrator, ...options }),
  }
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
  { migrator = createMigrator(), tolerateOrphans = false }: LoadOptions = {},
): Page<SectionOf<TRegistry>>[] {
  const pagesDir = path.join(contentDir, 'pages')
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(pagesDir, { withFileTypes: true })
  } catch (error) {
    if (isErrno(error) && error.code === 'ENOENT') {
      throw new ContentReadError(pagesDir, `Pages directory not found: ${pagesDir}`)
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new ContentReadError(pagesDir, `Unable to read pages directory ${pagesDir}: ${message}`)
  }

  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))

  const pageSchema = (tolerateOrphans ? createTolerantPageSchema(registry) : createPageSchema(registry)) as z.ZodType<
    Page<SectionOf<TRegistry>>
  >
  const pages = files.map((name) => parseFile(path.join(pagesDir, name), pageSchema, migrator, 'page'))

  const seen = new Map<string, string>()
  for (const [index, page] of pages.entries()) {
    const filePath = path.join(pagesDir, files[index] ?? '')
    const previous = seen.get(page.slug)
    if (previous !== undefined) {
      throw new ContentValidationError(filePath, [
        {
          path: ['slug'],
          message: `Duplicate slug "${page.slug}" (also defined in ${previous})`,
        },
      ])
    }
    seen.set(page.slug, filePath)
  }

  return pages
}

function parseFile<T>(filePath: string, schema: z.ZodType<T>, migrator: ContentMigrator, kind: DocumentKind): T {
  const upgraded = migrator.upgrade(readJsonFile(filePath), kind)
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
