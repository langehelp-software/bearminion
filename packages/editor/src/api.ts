import { z } from 'zod'
import {
  type Collection,
  type EntryPatch,
  type Outcome,
  createEntry,
  deleteEntry,
  fieldDefinitions,
  listEntries,
  readEntry,
  renameEntry,
  updateEntry,
} from './collections.js'
import {
  HOME_SLUG,
  LISTING_MIGRATION_TYPE,
  NOT_FOUND_SLUG,
  PAGES_TYPE,
  PAGINATION_SEGMENT,
  createEntrySchema,
  createListingSchema,
  entryKey,
  entryPath,
  listingKey,
  listingPath,
  reservedSlugs,
  resolveTypes,
  sortEntries,
  type ContentType,
  type Entry,
  type MultiType,
  type ResolvedTypes,
  type SingleType,
} from './content-types.js'
import type { BlockEdit } from './entry-blocks.js'
import { isDraft, matchPath } from './routing.js'
import { ContentReadError, ContentValidationError, type ContentIssue } from './errors.js'
import { imageBodyLimit, imageTooLarge, kindFromMime, sniffImage } from './image-sniff.js'
import { sniffVideo, videoBodyLimit, videoKindFromMime } from './video-sniff.js'
import type { EditorContext } from './editor-context.js'
import type { ListMeta } from './api-types.js'
import { API_PREFIX, type SectionRegistry } from './model.js'
import type { CountRule, Option } from './section-options.js'
import type { OptionalContent } from './section-optional.js'
import type { FieldChoices, FieldIcons, ShowWhen } from './field-rules.js'
import { imageFields } from './section-fields.js'
import type { Wireframe } from './wireframe.js'
import { JSON_BODY_LIMIT, isLocalRequest, isSameOriginRequest, readSlug } from './request-guards.js'
import { formatBytes, type UploadRules } from './upload-rules.js'
import { projectId } from './draft-store.js'
import { NO_HISTORY, isHistoryId, type HistoryScope } from './history-types.js'
import { fieldIssues, validateEditorPage, validateSite, type FieldIssue } from './validate.js'
import { assetRefs, describePageRef, describeSiteRef, missingAssetIssues } from './asset-paths.js'
import { COMMIT_MESSAGE_LIMIT, GitError, NO_GIT } from './git-types.js'
import { PreviewUnavailableError } from './preview.js'
import { isSystemPage, withoutOrphanSections } from './page.js'
import { isOrphanSection } from './section-schema.js'
import type { Site } from './site.js'
import { SCHEMA_VERSION_KEY, type DocumentKind } from './migrate.js'
import { stableStringify } from './stable-json.js'
import { SITE_KEY } from './store-core.js'
import { StoreError, StoreKeyError } from './store-error.js'

export interface HandleMeta {
  /**
   * Hosted editor only. The caller has already signed the person in and checked that they may edit, so the localhost
   * check is replaced by a same-origin check. Never set it on a route that has no sign-in in front of it: with it,
   * anyone who can reach the handler can write the content.
   */
  authenticated?: boolean
  /**
   * TCP peer address. Pass it from the dev server.
   * When it is omitted, only Host and Origin are checked.
   */
  remoteAddress?: string | null
  /**
   * Dev-only. Renders draft JSON to HTML without writing it.
   * Omit it outside `astro dev`.
   */
  renderPreview?: (page: unknown, motion: boolean) => Promise<string>
  /** Dev-only. Renders the header and footer of a draft site. Optional: a project without it keeps reload-to-see. */
  renderSitePreview?: (site: unknown, pathname: string) => Promise<{ header: string; footer: string }>
}

interface StoredPage {
  /** Store key, `pages/<file>.json`. */
  key: string
  fileName: string
  page: Entry
}

/** The site's content types. A context built by hand without them has the built-in ones. */
const typesOf = (context: EditorContext): ResolvedTypes => context.types ?? resolveTypes({})

const isPages = (type: MultiType): boolean => type.id === PAGES_TYPE
const noun = (type: MultiType): string => (isPages(type) ? 'page' : 'entry')
/** The pull-request scope of one entry. Pages keep `page:<slug>`, so pull requests opened before types existed still match. */
const entryScope = (type: MultiType, slug: string): string => (isPages(type) ? `page:${slug}` : `${type.id}:${slug}`)
const entryHistory = (type: MultiType, slug: string): [HistoryScope, string] =>
  isPages(type) ? ['page', slug] : ['entry', `${type.id}/${slug}`]
const entryRoute = (type: MultiType, slug: string): string => (isPages(type) ? `/pages/${slug}` : `/types/${type.id}/entries/${slug}`)

/** Rename and delete locks. The `pages` option of `bearminion()` rules pages; other types carry their own. */
function entryRules(context: EditorContext, type: MultiType): { rename: boolean; delete: boolean } {
  return isPages(type) ? context.pageRules : { rename: type.rename, delete: type.delete }
}

/** The type of a document stored in `type`'s folder: the home and 404 pages are stored among the pages. */
function documentType(context: EditorContext, type: MultiType, slug: string): ContentType {
  if (!isPages(type)) return type
  const types = typesOf(context)
  return slug === HOME_SLUG ? types.home : slug === NOT_FOUND_SLUG ? types.notFound : type
}

/** Validate an entry for the editor (orphaned sections kept), or strictly as the build would. */
function validateEntry(context: EditorContext, type: MultiType, slug: string, input: unknown, strict = false) {
  return createEntrySchema(context.sections, documentType(context, type, slug), { tolerateOrphans: !strict }).safeParse(input)
}

/** Why `slug` cannot be an entry of `type`, or null when it can. */
function reservedSlug(context: EditorContext, type: MultiType, slug: string): Response | null {
  // The home page's own slug is handled where it matters: a site without a home page may create it.
  if (slug === HOME_SLUG || !reservedSlugs(typesOf(context), type).has(slug)) return null
  const why =
    !isPages(type) && slug === PAGINATION_SEGMENT
      ? `"/${type.prefix}/${slug}" is where the listing's page numbers live.`
      : `"/${slug}" is the address of another content type.`
  return problem(409, 'reserved_slug', `"${slug}" cannot be used here: ${why}`)
}

/**
 * Dev-server API. Returns null when the URL is not under {@link API_PREFIX}
 * so other middleware can continue. Every write is schema-checked first.
 */
export async function handleEditorRequest(request: Request, context: EditorContext, meta: HandleMeta = {}): Promise<Response | null> {
  try {
    return await route(request, context, meta)
  } catch (error) {
    // A store that cannot do what was asked (a refused token, a protected branch) says why, so the page can show it.
    if (error instanceof StoreError) return problem(error.status, error.code, error.message)
    throw error
  }
}

async function route(request: Request, context: EditorContext, meta: HandleMeta): Promise<Response | null> {
  const url = new URL(request.url)
  const pathname = stripTrailingSlash(url.pathname)
  if (pathname !== API_PREFIX && !pathname.startsWith(`${API_PREFIX}/`)) return null

  if (meta.authenticated) {
    // The caller has signed the person in. What is left to check here is that the request is not cross-site.
    if (!isSameOriginRequest(request.headers, request.url)) return problem(403, 'forbidden', 'The editor API refuses cross-site requests.')
  } else if (!isLocalRequest(request.headers, meta.remoteAddress)) {
    return problem(403, 'forbidden', 'The editor API only accepts requests from localhost.')
  }

  const parts = pathname
    .slice(API_PREFIX.length)
    .replace(/^\//, '')
    .split('/')
    .filter((part) => part !== '')
  const method = request.method.toUpperCase()

  if (parts.length === 1 && parts[0] === 'schema') {
    if (method === 'GET') return getSchema(context)
    return methodNotAllowed(['GET'])
  }

  if (parts.length === 1 && parts[0] === 'site') {
    if (method === 'GET') return getSite(scoped(context, 'site'))
    if (method === 'PUT') return putSite(request, scoped(context, 'site'))
    return methodNotAllowed(['GET', 'PUT'])
  }

  if (parts.length === 1 && parts[0] === 'save') {
    if (method === 'POST') return postSave(request, scoped(context, 'edits'))
    return methodNotAllowed(['POST'])
  }

  if (parts.length === 1 && parts[0] === 'pages') {
    if (method === 'GET') return getPages(context)
    if (method === 'POST') return createPage(request, context, typesOf(context).pages)
    return methodNotAllowed(['GET', 'POST'])
  }

  if (parts[0] === 'collections') return collectionRoute(request, context, parts.slice(1), method)

  if (parts[0] === 'types') return typeRoute(request, context, parts.slice(1), method)

  if (parts.length === 1 && parts[0] === 'document') {
    if (method === 'GET') return getDocumentAt(context, url.searchParams.get('path') ?? '')
    return methodNotAllowed(['GET'])
  }

  if (parts.length === 1 && parts[0] === 'forms') {
    if (method === 'GET') return getForms(context)
    return methodNotAllowed(['GET'])
  }

  if (parts.length === 1 && parts[0] === 'git') {
    if (method === 'GET') return getGit(context)
    return methodNotAllowed(['GET'])
  }

  if (parts.length === 2 && parts[0] === 'git' && parts[1] === 'commit') {
    if (method === 'POST') return postCommit(request, context)
    return methodNotAllowed(['POST'])
  }

  if (parts.length === 1 && parts[0] === 'images') {
    if (method === 'GET') return getImages(scoped(context, 'uploads'), new URL(request.url).searchParams.get('usage') === '1')
    if (method === 'POST') return postImage(request, scoped(context, 'uploads'))
    return methodNotAllowed(['GET', 'POST'])
  }

  if (parts.length === 2 && parts[0] === 'images') {
    if (method === 'DELETE') return removeImage(scoped(context, 'uploads'), decodeSegment(parts[1] ?? ''))
    return methodNotAllowed(['DELETE'])
  }

  if (parts.length === 1 && parts[0] === 'videos') {
    if (method === 'GET') return getVideos(context)
    if (method === 'POST') return postVideo(request, context)
    return methodNotAllowed(['GET', 'POST'])
  }

  if (parts.length === 2 && parts[0] === 'videos') {
    if (method === 'DELETE') return removeVideo(context, decodeSegment(parts[1] ?? ''))
    return methodNotAllowed(['DELETE'])
  }

  if (parts.length === 1 && parts[0] === 'preview') {
    if (method === 'POST') return postPreview(request, context, meta)
    return methodNotAllowed(['POST'])
  }

  if (parts.length === 2 && parts[0] === 'preview' && parts[1] === 'site') {
    if (method === 'POST') return postSitePreview(request, context, meta)
    return methodNotAllowed(['POST'])
  }

  if (parts[0] === 'history' && parts[1] === 'types' && parts.length >= 4 && parts.length <= 5) {
    if (method !== 'GET') return methodNotAllowed(['GET'])
    const type = typesOf(context).get(decodeSegment(parts[2] ?? ''))
    const name = parts[3] ?? ''
    if (!type) return problem(404, 'not_found', 'Unknown content type.')
    if (type.kind === 'single') {
      if (name !== SINGLE_HISTORY) return problem(404, 'not_found', 'Unknown editor API route.')
      return getHistory(context, ...singleHistory(type), parts[4])
    }
    if (name === LISTING_HISTORY && type.listing) return getHistory(context, 'entry', `${type.id}/${LISTING_HISTORY}`, parts[4])
    const slug = readSlug(name)
    if (slug === null) return badSlug()
    return getHistory(context, ...entryHistory(type, slug), parts[4])
  }

  if (parts[0] === 'history' && (parts[1] === 'site' || parts[1] === 'pages')) {
    if (method !== 'GET') return methodNotAllowed(['GET'])
    if (parts[1] === 'site' && parts.length <= 3) return getHistory(context, 'site', '', parts[2])
    if (parts[1] === 'pages' && parts.length >= 3 && parts.length <= 4) {
      const slug = readSlug(parts[2] ?? '')
      if (slug === null) return badSlug()
      return getHistory(context, 'page', slug, parts[3])
    }
  }

  if (parts.length === 2 && parts[0] === 'pages') {
    const slug = readSlug(parts[1] ?? '')
    if (slug === null) return badSlug()
    const entry = scoped(context, `page:${slug}`)
    const pages = typesOf(context).pages
    if (method === 'GET') return getPage(entry, slug, pages)
    if (method === 'PUT') return putPage(request, entry, slug, pages)
    if (method === 'DELETE') return deletePage(entry, slug, pages)
    return methodNotAllowed(['GET', 'PUT', 'DELETE'])
  }

  if (parts.length === 3 && parts[0] === 'pages' && parts[2] === 'rename') {
    const slug = readSlug(parts[1] ?? '')
    if (slug === null) return badSlug()
    if (method === 'POST') return renamePage(request, scoped(context, `page:${slug}`), slug, typesOf(context).pages)
    return methodNotAllowed(['POST'])
  }

  return problem(404, 'not_found', 'Unknown editor API route.')
}

function findCollection(context: EditorContext, id: string): Collection | null {
  const all = context.collections
  return all !== undefined && Object.hasOwn(all, id) ? (all[id] ?? null) : null
}

const entryPatchSchema = z
  .object({
    set: z.record(z.string(), z.unknown()).optional(),
    unset: z.array(z.string()).optional(),
    blocks: z
      .array(
        z
          .object({ id: z.string().optional(), markdown: z.string().optional() })
          .strict()
          .refine((block) => block.id !== undefined || block.markdown !== undefined, 'A block needs an id or markdown.'),
      )
      .optional(),
  })
  .strict()

const newEntrySchema = z
  .object({ slug: z.string(), fields: z.record(z.string(), z.unknown()).optional(), body: z.string().optional() })
  .strict()

const renameEntrySchema = z.object({ slug: z.string() }).strict()

function outcomeResponse<T>(result: Outcome<T>, status = 200): Response {
  if (result.ok) return json(status, result.value)
  if (result.issues) return validation(result.issues)
  return problem(result.status, result.code, result.message)
}

/** `/collections`, `/collections/<id>/entries`, `/collections/<id>/entries/<slug>` and `.../rename`. */
async function collectionRoute(request: Request, context: EditorContext, parts: string[], method: string): Promise<Response> {
  if (parts.length === 0) {
    if (method !== 'GET') return methodNotAllowed(['GET'])
    const collections = Object.values(context.collections ?? {}).map((item) => ({
      id: item.id,
      label: item.label,
      path: `${item.dir}/{slug}${item.ext}`,
      rename: item.rename,
      delete: item.delete,
      fields: fieldDefinitions(item.schema),
    }))
    return json(200, { collections })
  }
  const found = findCollection(context, decodeSegment(parts[0] ?? ''))
  if (found === null || parts[1] !== 'entries') return problem(404, 'not_found', 'Unknown collection or route.')

  if (parts.length === 2) {
    if (method === 'GET') {
      const listed = await listEntries(context.store, found)
      return json(200, { entries: listed.slugs.map((slug) => ({ slug })), skipped: listed.skipped })
    }
    if (method === 'POST') {
      const body = await readJsonBody(request)
      if (body.response) return body.response
      const parsed = newEntrySchema.safeParse(body.value)
      if (!parsed.success) return validation(fieldIssues(parsed.error))
      const entry = scoped(context, `collection:${found.id}:${parsed.data.slug}`)
      return outcomeResponse(await createEntry(entry.store, found, parsed.data), 201)
    }
    return methodNotAllowed(['GET', 'POST'])
  }

  const slug = readSlug(parts[2] ?? '')
  if (slug === null) return badSlug()
  const entry = scoped(context, `collection:${found.id}:${slug}`)

  if (parts.length === 3) {
    if (method === 'GET') return outcomeResponse(await readEntry(entry.store, found, slug))
    if (method === 'PUT') {
      const body = await readJsonBody(request)
      if (body.response) return body.response
      const parsed = entryPatchSchema.safeParse(body.value)
      if (!parsed.success) return validation(fieldIssues(parsed.error))
      return outcomeResponse(await updateEntry(entry.store, found, slug, parsed.data as EntryPatch & { blocks?: BlockEdit[] }))
    }
    if (method === 'DELETE') return outcomeResponse(await deleteEntry(entry.store, found, slug))
    return methodNotAllowed(['GET', 'PUT', 'DELETE'])
  }

  if (parts.length === 4 && parts[3] === 'rename') {
    if (method !== 'POST') return methodNotAllowed(['POST'])
    const body = await readJsonBody(request)
    if (body.response) return body.response
    const parsed = renameEntrySchema.safeParse(body.value)
    if (!parsed.success) return validation(fieldIssues(parsed.error))
    return outcomeResponse(await renameEntry(entry.store, found, slug, parsed.data.slug))
  }

  return problem(404, 'not_found', 'Unknown editor API route.')
}

/**
 * Which form handlers the sections post to, and whether their files exist right now. Read on every call, so a handler
 * created while `astro dev` runs shows up at once.
 */
async function getForms(context: EditorContext): Promise<Response> {
  const handlers: Record<string, { file: string | null }> = {}
  for (const definition of Object.values(context.sections)) {
    const name = definition.form
    if (!name || handlers[name]) continue
    const file = context.formFile?.(name) ?? null
    handlers[name] = { file: file ? relativeTo(context.root, file) : null }
  }
  return json(200, { enabled: context.formsDir != null, handlers })
}

function relativeTo(root: string, file: string): string {
  const prefix = root.endsWith('/') || root.endsWith('\\') ? root : `${root}/`
  return file.startsWith(prefix) ? file.slice(prefix.length).replaceAll('\\', '/') : file
}

/**
 * The context for editing one entry. A store that keeps each entry's pending edits apart (`githubStore` in `pr` mode)
 * hands out a view of its own; every other store is used as it is.
 */
const history = (context: EditorContext) => context.history ?? NO_HISTORY

function scoped(context: EditorContext, scope: string): EditorContext {
  const store = context.store.scoped?.(scope)
  return store ? { ...context, store } : context
}

async function getSchema(context: EditorContext): Promise<Response> {
  const sectionDefaults: Record<string, unknown> = {}
  const sectionLabels: Record<string, string> = {}
  const sectionDescriptions: Record<string, string> = {}
  const sectionWireframes: Record<string, Wireframe> = {}
  const sectionOptions: Record<string, readonly Option[]> = {}
  const optionalContent: Record<string, OptionalContent> = {}
  const contentCounts: Record<string, Record<string, CountRule>> = { ...context.site.counts }
  const fieldChoices: Record<string, FieldChoices> = {}
  const fieldIcons: Record<string, FieldIcons> = {}
  const showWhen: Record<string, ShowWhen> = {}
  const fieldImages: Record<string, string[]> = {}
  const sectionForms: Record<string, string> = {}
  for (const definition of Object.values(context.sections)) {
    const type = definition.type
    if (definition.form) sectionForms[type] = definition.form
    sectionDefaults[type] = definition.defaults
    sectionLabels[type] = definition.label
    sectionDescriptions[type] = definition.description
    sectionWireframes[type] = definition.wireframe
    sectionOptions[type] = definition.options
    optionalContent[type] = definition.optional
    if (Object.keys(definition.counts).length > 0) contentCounts[type] = { ...definition.counts }
    if (Object.keys(definition.choices).length > 0) fieldChoices[type] = definition.choices
    if (Object.keys(definition.icons).length > 0) fieldIcons[type] = definition.icons
    if (Object.keys(definition.showWhen).length > 0) showWhen[type] = definition.showWhen
    const images = imageFields(definition.schema)
    if (images.length > 0) fieldImages[type] = images
  }
  return json(200, {
    sectionOptions,
    siteOptions: context.site.options,
    siteLimits: context.site.limits,
    theme: context.theme,
    contentCounts,
    optionalContent,
    fieldChoices,
    fieldIcons,
    fieldImages,
    showWhen,
    sectionForms,
    pageRules: context.pageRules,
    sectionDefaults,
    sectionLabels,
    sectionDescriptions,
    sectionWireframes,
    projectId: projectId(context.root, await siteName(context)),
  })
}

async function siteName(context: EditorContext): Promise<string> {
  try {
    return (await readSite(context)).name
  } catch {
    return ''
  }
}

async function getSite(context: EditorContext): Promise<Response> {
  try {
    return json(200, await readSite(context))
  } catch (error) {
    return contentFailure(error)
  }
}

async function putSite(request: Request, context: EditorContext): Promise<Response> {
  const body = await readJsonBody(request)
  if (body.response) return body.response
  const parsed = validateSite(body.value, context.site)
  if (!parsed.success) return validation(fieldIssues(parsed.error))
  const missing = await missingAssets(context, parsed.data)
  if (missing.length > 0) return validation(missing)
  await history(context).ensureBaseline('site', '', await readStoredJson(context, SITE_KEY, 'site'))
  await writeDocuments(context, [[SITE_KEY, parsed.data]])
  await history(context).write('site', '', parsed.data)
  return json(200, parsed.data)
}

/** The parsed document at `key`, upgraded to the current version, or undefined when it is missing or not JSON. */
async function readStoredJson(context: EditorContext, key: string, kind: DocumentKind): Promise<unknown> {
  try {
    const text = await context.store.read(key)
    if (text === undefined) return undefined
    const upgraded = context.migrator.upgrade(JSON.parse(text), kind)
    return upgraded.ok ? upgraded.value : undefined
  } catch (error) {
    if (error instanceof StoreError) throw error
    return undefined
  }
}

/** Write documents in the layout every file uses (sorted keys, two spaces, trailing newline). */
async function writeDocuments(
  context: EditorContext,
  documents: readonly (readonly [key: string, value: unknown])[],
  removals: readonly string[] = [],
): Promise<void> {
  await context.store.apply([
    ...documents.map(([key, value]) => ({ type: 'write' as const, key, text: stableStringify(context.migrator.stamp(value as object)) })),
    ...removals.map((key) => ({ type: 'remove' as const, key })),
  ])
}

const saveSchema = z
  .object({
    page: z
      .object({
        /** The id of the entry's content type. Default `pages`. */
        type: z.string().optional(),
        /** True when `document` is the listing page of `type`, not one of its entries. */
        listing: z.boolean().optional(),
        /** The slug the page is stored under now. The document's own `slug` is where it goes. A single and a listing page have one fixed place and need none. */
        from: z.string().optional(),
        document: z.unknown(),
      })
      .strict()
      .optional(),
    site: z.unknown().optional(),
  })
  .strict()
  .refine((value) => value.page !== undefined || value.site !== undefined, { message: 'Nothing to save.' })

/**
 * Save the editor draft in one request: a page (with its rename, when the slug changed) and the site. Every document is validated before anything is written, and all writes and
 * removals go to the store as one `apply`, so a failure never leaves a page renamed with stale content
 * or the page saved without the site.
 */
async function postSave(request: Request, context: EditorContext): Promise<Response> {
  const body = await readJsonBody(request)
  if (body.response) return body.response
  const parsed = saveSchema.safeParse(body.value)
  if (!parsed.success) return validation(fieldIssues(parsed.error))

  const writes: [key: string, value: unknown][] = []
  const removals: string[] = []
  const after: (() => Promise<void>)[] = []
  const result: { page?: unknown; site?: Site } = {}

  // Validate both documents before answering, so one failed save reports every problem in the page and the site.
  const failures: FieldIssue[] = []

  if (parsed.data.site !== undefined) {
    // A body may be a file as stored, with `schemaVersion`: upgrade it like a read would.
    const upgraded = context.migrator.upgrade(parsed.data.site, 'site')
    if (!upgraded.ok) {
      failures.push(...tagIssues([{ path: SCHEMA_VERSION_KEY, message: upgraded.message }], 'site'))
    } else {
      const site = validateSite(upgraded.value, context.site)
      const missing = site.success ? await missingAssets(context, site.data) : []
      if (!site.success) failures.push(...tagIssues(fieldIssues(site.error), 'site'))
      else if (missing.length > 0) failures.push(...tagIssues(missing, 'site'))
      else {
        const stored = await readStoredJson(context, SITE_KEY, 'site')
        writes.push([SITE_KEY, site.data])
        after.push(async () => {
          await history(context).ensureBaseline('site', '', stored)
          await history(context).write('site', '', site.data)
        })
        result.site = site.data
      }
    }
  }

  if (parsed.data.page !== undefined) {
    const { type: typeId, listing, from, document } = parsed.data.page
    const type = typeId === undefined ? typesOf(context).pages : typesOf(context).get(typeId)
    let planned: PagePlan
    if (type === undefined) planned = { response: problem(404, 'not_found', `Unknown content type "${typeId}".`) }
    else if (type.kind === 'single') planned = await planFixedSave(context, singleDocument(context, type), document, type.slug)
    else if (listing) {
      planned = type.listing
        ? await planFixedSave(context, listingDocument(context, type), document)
        : { response: problem(404, 'not_found', `${type.label} has no listing page (listing in its type options).`) }
    } else if (from === undefined)
      planned = { response: problem(400, 'invalid_slug', 'from is required to save an entry: the slug it is stored under.') }
    else planned = await planPageSave(context, { from, document }, type)
    if (planned.issues) {
      failures.push(...tagIssues(planned.issues, 'page'))
    } else if (planned.response) {
      // A conflict or a missing page is not a validation problem; field errors from the site take precedence.
      if (failures.length === 0) return planned.response
    } else {
      writes.push(...planned.writes)
      removals.push(...planned.removals)
      after.push(planned.after)
      result.page = planned.page
    }
  }

  if (failures.length > 0) return validation(failures)

  // A file whose name does not match its slug can be both moved away from and written to; keep the write.
  const written = new Set(writes.map(([key]) => key))
  await writeDocuments(
    context,
    writes,
    removals.filter((key) => !written.has(key)),
  )
  for (const step of after) await step()
  return json(200, result)
}

type PagePlan =
  | { page: unknown; writes: [string, unknown][]; removals: string[]; after: () => Promise<void>; response?: undefined; issues?: undefined }
  | { response: Response; issues?: undefined }
  /** Field errors; the caller decides how to answer, since a save reports the site's alongside them. */
  | { issues: FieldIssue[]; response?: undefined }

async function planPageSave(context: EditorContext, input: { from: string; document: unknown }, type: MultiType): Promise<PagePlan> {
  const from = readSlug(input.from)
  if (from === null) return { response: badSlug() }
  const upgraded = context.migrator.upgrade(input.document, 'page', documentType(context, type, from).id)
  if (!upgraded.ok) return { issues: [{ path: SCHEMA_VERSION_KEY, message: upgraded.message }] }
  const parsed = validateEntry(context, type, from, upgraded.value)
  if (!parsed.success) return { issues: fieldIssues(parsed.error) }
  const page = parsed.data
  const target = page.slug
  const missing = await missingAssets(context, page)
  if (missing.length > 0) return { issues: missing }

  const loaded = await loadStoredPages(context, {}, type)
  if (loaded.response) return { response: loaded.response }
  const found = loaded.pages.find((entry) => entry.page.slug === from)
  if (!found) return { response: problem(404, 'not_found', `No ${noun(type)} with slug "${from}".`) }

  const added = addedOrphans(context, found.page.sections, page.sections)
  if (added.length > 0) return { issues: added }

  const after = async () => {
    await history(context).ensureBaseline(...entryHistory(type, target), found.page)
    await history(context).write(...entryHistory(type, target), page)
  }

  if (target === from) return { page, writes: [[found.key, page]], removals: [], after }
  if (!entryRules(context, type).rename) return { response: locked('rename', type) }

  if (isPages(type)) {
    if (from === HOME_SLUG) {
      return { response: problem(409, 'conflict', 'The home page is served at / and keeps the slug index.') }
    }
    if (isSystemPage(from) || isSystemPage(target)) {
      return { response: problem(409, 'reserved_slug', 'System pages cannot be renamed, and no page can take their slug.') }
    }
    if (target === HOME_SLUG) return { response: homeIsFixed() }
  }
  const reserved = reservedSlug(context, type, target)
  if (reserved) return { response: reserved }
  if (loaded.pages.some((entry) => entry.page.slug === target)) {
    return { response: problem(409, 'conflict', `A ${noun(type)} with slug "${target}" already exists.`) }
  }
  const nextKey = entryKey(type, target)
  if (await context.store.exists(nextKey)) {
    return { response: problem(409, 'conflict', `A file named ${target}.json already exists.`) }
  }
  return { page, writes: [[nextKey, page]], removals: [found.key], after }
}

const commitSchema = z
  .object({
    message: z.string().max(COMMIT_MESSAGE_LIMIT),
    paths: z.array(z.string().min(1).max(512)).max(500).optional(),
  })
  .strict()

async function getGit(context: EditorContext): Promise<Response> {
  return json(200, await (context.commits ?? NO_GIT).info())
}

async function postCommit(request: Request, context: EditorContext): Promise<Response> {
  const body = await readJsonBody(request)
  if (body.response) return body.response
  const parsed = commitSchema.safeParse(body.value)
  if (!parsed.success) return validation(fieldIssues(parsed.error))
  try {
    return json(201, await (context.commits ?? NO_GIT).commit(parsed.data.message, parsed.data.paths))
  } catch (error) {
    if (!(error instanceof GitError)) throw error
    const status = error.code === 'failed' ? 500 : error.code === 'invalid' ? 400 : 409
    return problem(status, `git_${error.code}`, error.message)
  }
}

async function getHistory(context: EditorContext, scope: HistoryScope, slug: string, id: string | undefined): Promise<Response> {
  if (id === undefined) return json(200, { entries: await history(context).list(scope, slug) })
  if (!isHistoryId(id)) return problem(400, 'invalid_id', 'Not a history id.')
  const snapshot = await history(context).read(scope, slug, id)
  if (snapshot === null) return problem(404, 'not_found', 'No saved version with that id.')
  return json(200, snapshot)
}

const sectionAnchors = (sections: readonly unknown[]): string[] =>
  sections.flatMap((section) =>
    typeof section === 'object' && section !== null && 'anchor' in section && typeof section.anchor === 'string' && section.anchor !== ''
      ? [section.anchor]
      : [],
  )

/** Draft, noindex and the time of the last change: what the listings show beside each document. */
async function listMeta(context: EditorContext, stored: StoredPage): Promise<ListMeta> {
  const time = await context.store.modified?.(stored.key).catch(() => undefined)
  return {
    ...(isDraft(stored.page) ? { draft: true } : {}),
    ...(stored.page.seo.noindex === true ? { noindex: true } : {}),
    ...(time === undefined ? {} : { updatedAt: new Date(time).toISOString() }),
  }
}

async function getPages(context: EditorContext): Promise<Response> {
  const loaded = await loadStoredPages(context)
  if (loaded.response) return loaded.response
  return json(200, {
    pages: await Promise.all(
      loaded.pages.map(async (entry) => ({
        slug: entry.page.slug,
        title: entry.page.title,
        file: entry.fileName,
        system: isSystemPage(entry.page.slug),
        anchors: sectionAnchors(entry.page.sections),
        ...(await listMeta(context, entry)),
      })),
    ),
  })
}

/** The language strings are ordered in: the site's own (`site.json` `lang`), so a listing reads right to its visitors. */
async function siteLang(context: EditorContext): Promise<string> {
  try {
    const lang = ((await readSite(context)) as { lang?: unknown }).lang
    return typeof lang === 'string' && lang !== '' ? lang : 'en'
  } catch {
    return 'en'
  }
}

/** The entries of a declared type, in the type's sort order: what its listing page shows, drafts included. */
async function getEntries(context: EditorContext, type: MultiType): Promise<Response> {
  const loaded = await loadStoredPages(context, {}, type)
  if (loaded.response) return loaded.response
  const own = loaded.pages.filter((entry) => documentType(context, type, entry.page.slug) === type)
  const files = new Map(own.map((entry) => [entry.page.slug, entry.fileName]))
  const metas = new Map(await Promise.all(own.map(async (entry) => [entry.page.slug, await listMeta(context, entry)] as const)))
  const sorted = sortEntries(
    type,
    own.map((entry) => entry.page),
    await siteLang(context),
  )
  const by = type.sort && type.sort.by !== 'title' ? type.sort.by : null
  return json(200, {
    entries: sorted.map((entry) => ({
      slug: entry.slug,
      title: entry.title,
      file: files.get(entry.slug),
      path: entryPath(type, entry.slug),
      ...(by === null ? {} : { sortValue: entry.fields?.[by] }),
      anchors: sectionAnchors(entry.sections),
      ...metas.get(entry.slug),
    })),
  })
}

async function getPage(context: EditorContext, slug: string, type: MultiType): Promise<Response> {
  const loaded = await loadStoredPages(context, {}, type)
  if (loaded.response) return loaded.response
  const found = loaded.pages.find((entry) => entry.page.slug === slug)
  if (!found) return problem(404, 'not_found', `No ${noun(type)} with slug "${slug}".`)
  return json(200, found.page)
}

const orphanKey = (section: { id: string; type: string }): string => `${section.id}:${section.type}`

/** The editor may keep an orphaned section the stored document already has, but never add one. */
function addedOrphans(
  context: EditorContext,
  stored: readonly { id: string; type: string }[],
  sections: readonly { id: string; type: string }[],
): FieldIssue[] {
  const kept = new Set(stored.filter((section) => isOrphanSection(context.sections, section)).map(orphanKey))
  return sections.flatMap((section, index) =>
    isOrphanSection(context.sections, section) && !kept.has(orphanKey(section))
      ? [
          {
            path: `sections.${index}.type`,
            message: `Unknown section type "${section.type}". Expected one of: ${Object.keys(context.sections).join(', ')}.`,
          },
        ]
      : [],
  )
}

async function putPage(request: Request, context: EditorContext, slug: string, type: MultiType): Promise<Response> {
  const body = await readJsonBody(request)
  if (body.response) return body.response
  const parsed = validateEntry(context, type, slug, body.value)
  if (!parsed.success) return validation(fieldIssues(parsed.error))
  const page = parsed.data
  if (page.slug !== slug) {
    return problem(
      400,
      'slug_mismatch',
      `Slug in the body must be "${slug}". Rename the ${noun(type)} with POST ${entryRoute(type, slug)}/rename.`,
    )
  }
  const missing = await missingAssets(context, page)
  if (missing.length > 0) return validation(missing)
  const loaded = await loadStoredPages(context, {}, type)
  if (loaded.response) return loaded.response
  const found = loaded.pages.find((entry) => entry.page.slug === slug)
  if (!found) return problem(404, 'not_found', `No ${noun(type)} with slug "${slug}".`)
  const added = addedOrphans(context, found.page.sections, page.sections)
  if (added.length > 0) return validation(added)
  await history(context).ensureBaseline(...entryHistory(type, slug), found.page)
  await writeDocuments(context, [[found.key, page]])
  await history(context).write(...entryHistory(type, slug), page)
  return json(200, page)
}

async function createPage(request: Request, baseContext: EditorContext, type: MultiType): Promise<Response> {
  const body = await readJsonBody(request)
  if (body.response) return body.response
  const parsed = createPageSchema.safeParse(body.value)
  if (!parsed.success) return validation(fieldIssues(parsed.error))
  const slug = parsed.data.slug
  const context = scoped(baseContext, entryScope(type, slug))

  if (isPages(type) && isSystemPage(slug)) {
    return problem(409, 'reserved_slug', `"${slug}" is a system page and cannot be created.`)
  }
  const reserved = reservedSlug(context, type, slug)
  if (reserved) return reserved
  const loaded = await loadStoredPages(context, { allowMissing: true }, type)
  if (loaded.response) return loaded.response
  if (loaded.pages.some((entry) => entry.page.slug === slug)) {
    return problem(409, 'conflict', `A ${noun(type)} with slug "${slug}" already exists.`)
  }

  const key = entryKey(type, slug)
  if (await context.store.exists(key)) {
    return problem(409, 'conflict', `A file named ${slug}.json already exists.`)
  }

  const drafted = draftPage(parsed.data, loaded.pages, context.sections, type)
  if (drafted.response) return drafted.response
  const validated = validateEntry(context, type, slug, drafted.page, true)
  if (!validated.success) return validation(fieldIssues(validated.error))
  // A new entry's sections hold only defaults, but its fields come from the request and may name an image.
  const missing = await missingAssets(context, validated.data)
  if (missing.length > 0) return validation(missing)

  await writeDocuments(context, [[key, validated.data]])
  return json(201, validated.data)
}

/** The home page is its own fixed document: no other page can be moved onto its slug. A site without one creates it. */
function homeIsFixed(): Response {
  return problem(409, 'reserved_slug', 'The home page is fixed at /. Edit its content instead of moving another page there.')
}

function locked(operation: 'rename' | 'delete', type: MultiType): Response {
  const what = operation === 'rename' ? 'Renaming' : 'Deleting'
  const message = isPages(type)
    ? `${what} pages is turned off for this site (pages.${operation} in the bearminion() options).`
    : `${what} entries is turned off for ${type.label} (${operation}: false in its type options).`
  return problem(409, 'operation_locked', message)
}

async function deletePage(context: EditorContext, slug: string, type: MultiType): Promise<Response> {
  if (!entryRules(context, type).delete) return locked('delete', type)
  if (isPages(type)) {
    if (slug === HOME_SLUG) {
      return problem(409, 'conflict', 'Refusing to delete the index page.')
    }
    if (isSystemPage(slug)) {
      return problem(409, 'reserved_slug', `"${slug}" is a system page and cannot be deleted.`)
    }
  }
  const loaded = await loadStoredPages(context, {}, type)
  if (loaded.response) return loaded.response
  const found = loaded.pages.find((entry) => entry.page.slug === slug)
  if (!found) return problem(404, 'not_found', `No ${noun(type)} with slug "${slug}".`)
  await writeDocuments(context, [], [found.key])
  return json(200, { deleted: true, slug })
}

async function renamePage(request: Request, context: EditorContext, slug: string, type: MultiType): Promise<Response> {
  const body = await readJsonBody(request)
  if (body.response) return body.response
  const parsed = renameSchema.safeParse(body.value)
  if (!parsed.success) return validation(fieldIssues(parsed.error))
  const nextSlug = parsed.data.slug
  if (!entryRules(context, type).rename) return locked('rename', type)
  if (nextSlug === slug) {
    return problem(400, 'invalid_slug', 'The new slug is the same as the current slug.')
  }
  if (isPages(type)) {
    if (slug === HOME_SLUG) {
      return problem(409, 'conflict', 'Refusing to rename the index page.')
    }
    if (isSystemPage(slug) || isSystemPage(nextSlug)) {
      return problem(409, 'reserved_slug', 'System pages cannot be renamed, and no page can take their slug.')
    }
    if (nextSlug === HOME_SLUG) return homeIsFixed()
  }
  const reserved = reservedSlug(context, type, nextSlug)
  if (reserved) return reserved

  const loaded = await loadStoredPages(context, {}, type)
  if (loaded.response) return loaded.response
  const found = loaded.pages.find((entry) => entry.page.slug === slug)
  if (!found) return problem(404, 'not_found', `No ${noun(type)} with slug "${slug}".`)
  if (loaded.pages.some((entry) => entry.page.slug === nextSlug)) {
    return problem(409, 'conflict', `A ${noun(type)} with slug "${nextSlug}" already exists.`)
  }

  const nextKey = entryKey(type, nextSlug)
  if (await context.store.exists(nextKey)) {
    return problem(409, 'conflict', `A file named ${nextSlug}.json already exists.`)
  }

  const renamed = { ...found.page, slug: nextSlug }
  const validated = validateEntry(context, type, nextSlug, renamed)
  if (!validated.success) return validation(fieldIssues(validated.error))
  await writeDocuments(context, [[nextKey, validated.data]], [found.key])
  return json(200, validated.data)
}

const SINGLE_HISTORY = '_single'
const LISTING_HISTORY = '_listing'

/** Where a single's undo history is kept. The home and 404 pages share theirs with the pages API. */
const singleHistory = (type: SingleType): [HistoryScope, string] =>
  type.builtIn ? ['page', type.slug] : ['entry', `${type.id}/${SINGLE_HISTORY}`]

const emptySeo = (title: string) => ({ title, description: '', noindex: false, nofollow: false })

/** What the editor and the API tell about each type: enough to draw its list, its form and its links. */
function describeTypes(context: EditorContext) {
  const types = typesOf(context)
  const shared = (type: ContentType) => ({
    id: type.id,
    kind: type.kind,
    label: type.label,
    fields: type.fields ? fieldDefinitions(type.fields) : null,
    sections: type.sections,
  })
  return [
    ...types.singles.map((type) => ({ ...shared(type), path: type.path, builtIn: type.builtIn })),
    ...types.multi.map((type) => ({
      ...shared(type),
      path: entryPath(type, '{slug}'),
      builtIn: isPages(type),
      sort: type.sort,
      listing: type.listing ? { ...type.listing, path: listingPath(type) } : null,
      rename: entryRules(context, type).rename,
      delete: entryRules(context, type).delete,
    })),
  ]
}

interface StoredDocument {
  key: string
  schema: z.ZodType<{ sections: { id: string; type: string }[] }>
  /** What a migration is told the document is. */
  migrateAs: string
  /** What is served while the file does not exist yet, or undefined when the file must exist. */
  fallback: unknown
  history: [HistoryScope, string]
}

function singleDocument(context: EditorContext, type: SingleType): StoredDocument {
  return {
    key: type.key,
    schema: createEntrySchema(context.sections, type, { tolerateOrphans: true }) as StoredDocument['schema'],
    migrateAs: type.id,
    // Every site has a home page and a 404 page. A single the site declares starts empty until its first save.
    fallback: type.builtIn
      ? undefined
      : { slug: type.slug, title: type.label, seo: emptySeo(type.label), sections: [], ...(type.fields ? { fields: {} } : {}) },
    history: singleHistory(type),
  }
}

function listingDocument(context: EditorContext, type: MultiType): StoredDocument {
  return {
    key: listingKey(type),
    schema: createListingSchema(context.sections, { tolerateOrphans: true }) as StoredDocument['schema'],
    migrateAs: LISTING_MIGRATION_TYPE,
    fallback: { title: type.label, seo: emptySeo(type.label), sections: [] },
    history: ['entry', `${type.id}/${LISTING_HISTORY}`],
  }
}

type ReadDocument =
  | { document: unknown; stored: { sections: { id: string; type: string }[] } | null; response?: undefined }
  | { response: Response }

async function readDocument(context: EditorContext, target: StoredDocument): Promise<ReadDocument> {
  const text = await context.store.read(target.key)
  if (text === undefined) {
    if (target.fallback === undefined) return { response: problem(404, 'not_found', `Content file not found: ${target.key}`) }
    // The defaults may not satisfy the type's own fields yet; the editor fills them in and the save validates.
    const parsed = target.schema.safeParse(target.fallback)
    return { document: parsed.success ? parsed.data : target.fallback, stored: null }
  }
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch (error) {
    return {
      response: problem(400, 'invalid_json', `Invalid JSON in ${target.key}: ${error instanceof Error ? error.message : String(error)}`),
    }
  }
  const invalid = (issues: FieldIssue[]): ReadDocument => ({
    response: json(422, { error: 'validation', message: `Invalid content in ${target.key}.`, issues }),
  })
  const upgraded = context.migrator.upgrade(raw, 'page', target.migrateAs)
  if (!upgraded.ok) return invalid([{ path: SCHEMA_VERSION_KEY, message: upgraded.message }])
  const parsed = target.schema.safeParse(upgraded.value)
  if (!parsed.success) return invalid(fieldIssues(parsed.error))
  return { document: parsed.data, stored: parsed.data }
}

async function getDocument(context: EditorContext, target: StoredDocument): Promise<Response> {
  const read = await readDocument(context, target)
  return read.response ?? json(200, read.document)
}

/** Plan the save of a document that has one fixed place: a single, or a type's listing page. The first save creates the file. */
async function planFixedSave(context: EditorContext, target: StoredDocument, input: unknown, slug?: string): Promise<PagePlan> {
  const upgraded = context.migrator.upgrade(input, 'page', target.migrateAs)
  if (!upgraded.ok) return { issues: [{ path: SCHEMA_VERSION_KEY, message: upgraded.message }] }
  const parsed = target.schema.safeParse(upgraded.value)
  if (!parsed.success) return { issues: fieldIssues(parsed.error) }
  const document = parsed.data
  if (slug !== undefined && (document as { slug?: unknown }).slug !== slug) {
    return { response: problem(400, 'slug_mismatch', `Slug in the body must be "${slug}": this document has a fixed address.`) }
  }
  const missing = await missingAssets(context, document)
  if (missing.length > 0) return { issues: missing }
  const read = await readDocument(context, target)
  if (read.response) return { response: read.response }
  const added = addedOrphans(context, read.stored?.sections ?? [], document.sections)
  if (added.length > 0) return { issues: added }
  const stored = read.stored
  return {
    page: document,
    writes: [[target.key, document]],
    removals: [],
    after: async () => {
      if (stored) await history(context).ensureBaseline(...target.history, stored)
      await history(context).write(...target.history, document)
    },
  }
}

async function putDocument(request: Request, context: EditorContext, target: StoredDocument, slug?: string): Promise<Response> {
  const body = await readJsonBody(request)
  if (body.response) return body.response
  const planned = await planFixedSave(context, target, body.value, slug)
  if (planned.issues) return validation(planned.issues)
  if (planned.response) return planned.response
  await writeDocuments(context, planned.writes)
  await planned.after()
  return json(200, planned.page)
}

/**
 * The document the address `path` shows, with what it is: `{ type, kind, slug, document }`. The editor opens with it,
 * so it need not know how addresses map to types. A listing answers the same document for each of its pages. The home
 * and 404 pages answer as entries of `pages`, where they are stored and edited.
 */
async function getDocumentAt(context: EditorContext, pathname: string): Promise<Response> {
  const types = typesOf(context)
  const match = pathname.startsWith('/') ? matchPath(types, pathname) : null
  if (match === null) return problem(404, 'not_found', `No content at "${pathname}".`)
  if (match.kind === 'listing') {
    const { type } = match
    const read = await readDocument(scoped(context, `${type.id}:${LISTING_HISTORY}`), listingDocument(context, type))
    if (read.response) return read.response
    return json(200, { type: type.id, kind: 'listing', slug: type.listing?.slug ?? type.prefix, page: match.page, document: read.document })
  }
  if (match.kind === 'single' && !match.type.builtIn) {
    const { type } = match
    const read = await readDocument(scoped(context, type.id), singleDocument(context, type))
    if (read.response) return read.response
    return json(200, { type: type.id, kind: 'single', slug: type.slug, document: read.document })
  }
  const type = match.kind === 'entry' ? match.type : types.pages
  const slug = match.kind === 'entry' ? match.slug : match.type.slug
  // `/index` is not an address: the home page is at `/`.
  if (match.kind === 'entry' && isPages(type) && slug === HOME_SLUG) return problem(404, 'not_found', `No content at "${pathname}".`)
  const loaded = await loadStoredPages(scoped(context, entryScope(type, slug)), {}, type)
  if (loaded.response) return loaded.response
  const found = loaded.pages.find((entry) => entry.page.slug === slug)
  if (!found) return problem(404, 'not_found', `No ${noun(type)} with slug "${slug}".`)
  return json(200, { type: type.id, kind: 'entry', slug, document: found.page })
}

/**
 * `/types`, `/types/<id>/document` (a single), `/types/<id>/listing`, `/types/<id>/entries`,
 * `/types/<id>/entries/<slug>` and `.../rename`. `/pages` is the same as `/types/pages/entries`, plus the home and 404 pages.
 */
async function typeRoute(request: Request, context: EditorContext, parts: string[], method: string): Promise<Response> {
  if (parts.length === 0) {
    if (method !== 'GET') return methodNotAllowed(['GET'])
    return json(200, { types: describeTypes(context) })
  }
  const type = typesOf(context).get(decodeSegment(parts[0] ?? ''))
  if (!type) return problem(404, 'not_found', 'Unknown content type.')

  if (type.kind === 'single') {
    if (parts.length !== 2 || parts[1] !== 'document') return problem(404, 'not_found', 'Unknown editor API route.')
    const entry = scoped(context, type.builtIn ? `page:${type.slug}` : type.id)
    const target = singleDocument(entry, type)
    if (method === 'GET') return getDocument(entry, target)
    if (method === 'PUT') return putDocument(request, entry, target, type.slug)
    return methodNotAllowed(['GET', 'PUT'])
  }

  if (parts.length === 2 && parts[1] === 'listing') {
    if (!type.listing) return problem(404, 'not_found', `${type.label} has no listing page (listing in its type options).`)
    const entry = scoped(context, `${type.id}:${LISTING_HISTORY}`)
    const target = listingDocument(entry, type)
    if (method === 'GET') return getDocument(entry, target)
    if (method === 'PUT') return putDocument(request, entry, target)
    return methodNotAllowed(['GET', 'PUT'])
  }

  if (parts[1] !== 'entries') return problem(404, 'not_found', 'Unknown editor API route.')

  if (parts.length === 2) {
    if (method === 'GET') return getEntries(context, type)
    if (method === 'POST') return createPage(request, context, type)
    return methodNotAllowed(['GET', 'POST'])
  }

  const slug = readSlug(parts[2] ?? '')
  if (slug === null) return badSlug()
  const entry = scoped(context, entryScope(type, slug))

  if (parts.length === 3) {
    if (method === 'GET') return getPage(entry, slug, type)
    if (method === 'PUT') return putPage(request, entry, slug, type)
    if (method === 'DELETE') return deletePage(entry, slug, type)
    return methodNotAllowed(['GET', 'PUT', 'DELETE'])
  }

  if (parts.length === 4 && parts[3] === 'rename') {
    if (method === 'POST') return renamePage(request, entry, slug, type)
    return methodNotAllowed(['POST'])
  }

  return problem(404, 'not_found', 'Unknown editor API route.')
}

const previewBodySchema = z
  .object({
    page: z.unknown(),
    /** The id of the document's content type. Default `pages`. */
    type: z.string().optional(),
    motion: z.boolean().optional(),
  })
  .strict()

async function postPreview(request: Request, context: EditorContext, meta: HandleMeta): Promise<Response> {
  if (!meta.renderPreview) {
    return problem(501, 'preview_unavailable', 'Live preview is not available here: no theme preview renderer is wired in.')
  }
  const body = await readJsonBody(request)
  if (body.response) return body.response
  const payload = previewBodySchema.safeParse(body.value)
  if (!payload.success) return validation(fieldIssues(payload.error))
  const type = payload.data.type === undefined ? null : typesOf(context).get(payload.data.type)
  if (type === undefined) return problem(404, 'not_found', `Unknown content type "${payload.data.type}".`)
  const parsed = type
    ? createEntrySchema(context.sections, type, { tolerateOrphans: true }).safeParse(payload.data.page)
    : validateEditorPage(payload.data.page, context.sections)
  if (!parsed.success) return validation(fieldIssues(parsed.error))
  // The site cannot render a section it does not define, so the preview leaves orphaned sections out.
  const renderable = withoutOrphanSections(parsed.data, context.sections)
  try {
    const html = await meta.renderPreview(renderable, payload.data.motion ?? true)
    return json(200, { html })
  } catch (error) {
    if (error instanceof PreviewUnavailableError) return problem(501, 'preview_unavailable', error.message)
    const message = error instanceof Error ? error.message : 'Preview failed.'
    console.error('[bearminion] preview failed', error)
    return problem(500, 'preview_failed', message)
  }
}

const sitePreviewBodySchema = z.object({ site: z.unknown(), pathname: z.string().max(2048) }).strict()

async function postSitePreview(request: Request, context: EditorContext, meta: HandleMeta): Promise<Response> {
  if (!meta.renderSitePreview) {
    return problem(501, 'preview_unavailable', 'Live site preview is not available in this project.')
  }
  const body = await readJsonBody(request)
  if (body.response) return body.response
  const payload = sitePreviewBodySchema.safeParse(body.value)
  if (!payload.success) return validation(fieldIssues(payload.error))
  const parsed = validateSite(payload.data.site, context.site)
  if (!parsed.success) return validation(fieldIssues(parsed.error))
  try {
    return json(200, await meta.renderSitePreview(parsed.data, payload.data.pathname))
  } catch (error) {
    if (error instanceof PreviewUnavailableError) return problem(501, 'preview_unavailable', error.message)
    const message = error instanceof Error ? error.message : 'Preview failed.'
    console.error('[bearminion] site preview failed', error)
    return problem(500, 'preview_failed', message)
  }
}

/** The uploaded images and the upload rules. With `?usage=1`, each image also says where the saved content uses it. */
async function getImages(context: EditorContext, withUsage = false): Promise<Response> {
  const limits: UploadRules = { maxBytes: context.maxImageBytes, convert: context.imageConvert }
  const images = await context.store.uploads.list()
  if (!withUsage) return json(200, { images, limits })
  const usages = await allImageUsages(context)
  return json(200, { images: images.map((image) => ({ ...image, usages: usages.get(image.path) ?? [] })), limits })
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return ''
  }
}

/** Image paths that a saved file must not point at, because the file is not there. */
async function missingAssets(context: EditorContext, document: unknown): Promise<FieldIssue[]> {
  const { store } = context
  if (!store.assetExists) return []
  return missingAssetIssues(document, (src) => store.assetExists?.(src) ?? Promise.resolve(true))
}

/**
 * Every stored document that is drawn as a page, read raw so one that fails validation still counts: the entries and
 * the listing page of each type, and the singles the site declares. The home and 404 pages are among the pages.
 */
async function storedDocuments(context: EditorContext): Promise<{ name: string; document: Record<string, unknown> }[]> {
  const types = typesOf(context)
  const keys: [key: string, name: string][] = []
  for (const type of types.multi) {
    for (const file of (await context.store.list(type.dir)) ?? []) {
      if (file.endsWith('.json') && !file.startsWith('.')) keys.push([`${type.dir}/${file}`, file.replace(/\.json$/, '')])
    }
  }
  for (const type of types.singles) if (!type.builtIn) keys.push([type.key, type.label])
  const found: { name: string; document: Record<string, unknown> }[] = []
  for (const [key, name] of keys) {
    const document = await readStoredJson(context, key, 'page')
    if (typeof document === 'object' && document !== null) found.push({ name, document: document as Record<string, unknown> })
  }
  return found
}

/**
 * Where the saved content uses the image at `src`: "Home page › Hero", "Site settings › brand logo". Read from the
 * raw files, so a page that fails validation still counts. Unsaved drafts are not on disk: the editor checks its own
 * drafts before it asks to delete, and saving a draft that still points at a deleted image fails validation.
 */
async function imageUsages(context: EditorContext, src: string): Promise<string[]> {
  return (await allImageUsages(context)).get(src) ?? []
}

/** Every image the saved content uses, with where: one pass over the files instead of one per image. */
async function allImageUsages(context: EditorContext): Promise<Map<string, string[]>> {
  const labels = Object.fromEntries(Object.values(context.sections).map((definition) => [definition.type, definition.label]))
  const usages = new Map<string, string[]>()
  const add = (src: string, where: string) => usages.set(src, [...(usages.get(src) ?? []), where])
  const site = await readStoredJson(context, SITE_KEY, 'site')
  for (const ref of assetRefs(site)) add(ref.src, describeSiteRef(ref))
  for (const { name, document: page } of await storedDocuments(context)) {
    const title = 'title' in page && typeof page.title === 'string' ? page.title : name
    const sections = 'sections' in page && Array.isArray(page.sections) ? (page.sections as { type: string }[]) : []
    for (const ref of assetRefs(page)) add(ref.src, describePageRef(ref, { title, sections }, labels))
  }
  return usages
}

async function removeImage(context: EditorContext, filename: string): Promise<Response> {
  const image = (await context.store.uploads.list()).find((item) => item.filename === filename)
  if (!image) return problem(404, 'not_found', 'No uploaded image has that name.')
  const usages = await imageUsages(context, image.path)
  if (usages.length > 0) {
    return json(409, {
      error: 'in_use',
      message: `${filename} is still used: ${usages.join('; ')}. Choose another image there and save, then delete it.`,
      usages,
    })
  }
  if (!(await context.store.uploads.remove(filename))) {
    return problem(404, 'not_found', 'No uploaded image has that name.')
  }
  return json(200, { deleted: true, filename })
}

const NO_VIDEOS = 'This content store does not take video uploads.'

async function getVideos(context: EditorContext): Promise<Response> {
  if (!context.store.videos) return json(200, { videos: [], maxBytes: context.maxVideoBytes })
  return json(200, { videos: await context.store.videos.list(), maxBytes: context.maxVideoBytes })
}

/** Every string in a JSON value. */
function* strings(value: unknown): Generator<string> {
  if (typeof value === 'string') yield value
  else if (Array.isArray(value)) for (const item of value) yield* strings(item)
  else if (typeof value === 'object' && value !== null) for (const item of Object.values(value)) yield* strings(item)
}

/** Where saved content links the video at `url`, named like the image usages: "Home page › Media". */
async function videoUsages(context: EditorContext, url: string): Promise<string[]> {
  const labels = Object.fromEntries(Object.values(context.sections).map((definition) => [definition.type, definition.label]))
  const usages: string[] = []
  const site = await readStoredJson(context, SITE_KEY, 'site')
  if ([...strings(site)].includes(url)) usages.push('Site settings')
  for (const { name, document: page } of await storedDocuments(context)) {
    const title = 'title' in page && typeof page.title === 'string' ? page.title : name
    const sections = 'sections' in page && Array.isArray(page.sections) ? (page.sections as { type?: string }[]) : []
    for (const section of sections) {
      if ([...strings(section)].includes(url)) usages.push(`${title} › ${labels[section.type ?? ''] ?? section.type ?? 'section'}`)
    }
    // A type's own fields sit beside the sections, not in them.
    if ('fields' in page && [...strings(page.fields)].includes(url)) usages.push(`${title} › fields`)
  }
  return usages
}

async function removeVideo(context: EditorContext, filename: string): Promise<Response> {
  const videos = context.store.videos
  if (!videos) return problem(404, 'not_found', NO_VIDEOS)
  const video = (await videos.list()).find((item) => item.filename === filename)
  if (!video) return problem(404, 'not_found', 'No uploaded video has that name.')
  const usages = await videoUsages(context, video.url)
  if (usages.length > 0) {
    return json(409, {
      error: 'in_use',
      message: `${filename} is still used: ${usages.join('; ')}. Choose another video there and save, then delete it.`,
      usages,
    })
  }
  if (!(await videos.remove(filename))) return problem(404, 'not_found', 'No uploaded video has that name.')
  return json(200, { deleted: true, filename })
}

async function postVideo(request: Request, context: EditorContext): Promise<Response> {
  const videos = context.store.videos
  if (!videos) return problem(404, 'not_found', NO_VIDEOS)
  const limitMb = Math.round(context.maxVideoBytes / 1_048_576)
  const tooLarge = () =>
    problem(413, 'too_large', `Videos must be ${limitMb}MB or smaller. Link a hosted video instead, or compress this one.`)
  const length = contentLength(request)
  if (length !== null && length > videoBodyLimit(context.maxVideoBytes)) return tooLarge()
  const type = request.headers.get('content-type') ?? ''
  if (!type.toLowerCase().includes('multipart/form-data')) {
    return problem(415, 'unsupported_media_type', 'Upload the video as multipart/form-data.')
  }
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return problem(400, 'invalid_upload', 'The upload body could not be read.')
  }
  const entry = form.get('file')
  if (!(entry instanceof File)) return problem(400, 'invalid_upload', 'Expected a multipart file field named "file".')
  if (entry.size > context.maxVideoBytes) return tooLarge()
  const bytes = new Uint8Array(await entry.arrayBuffer())
  if (bytes.byteLength > context.maxVideoBytes) return tooLarge()
  const declared = videoKindFromMime(entry.type)
  const sniffed = sniffVideo(bytes)
  if (declared === null || sniffed === null || declared !== sniffed) {
    return problem(415, 'unsupported_media_type', 'Upload an mp4, webm, mov or ogv video whose contents match the declared type.')
  }
  try {
    return json(201, await videos.save({ originalName: entry.name, bytes, kind: sniffed }))
  } catch (error) {
    return problem(500, 'write_failed', error instanceof Error ? error.message : 'Upload failed.')
  }
}

async function postImage(request: Request, context: EditorContext): Promise<Response> {
  const tooLarge = () => problem(413, 'too_large', `Images must be ${formatBytes(context.maxImageBytes)} or smaller.`)
  const length = contentLength(request)
  if (length !== null && length > imageBodyLimit(context.maxImageBytes)) return tooLarge()
  const type = request.headers.get('content-type') ?? ''
  if (!type.toLowerCase().includes('multipart/form-data')) {
    return problem(415, 'unsupported_media_type', 'Upload the image as multipart/form-data.')
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return problem(400, 'invalid_upload', 'The upload body could not be read.')
  }
  const entry = form.get('file')
  if (!(entry instanceof File)) {
    return problem(400, 'invalid_upload', 'Expected a multipart file field named "file".')
  }
  if (imageTooLarge(entry.size, context.maxImageBytes)) return tooLarge()

  const bytes = new Uint8Array(await entry.arrayBuffer())
  if (imageTooLarge(bytes.byteLength, context.maxImageBytes)) return tooLarge()
  const declared = kindFromMime(entry.type)
  const sniffed = sniffImage(bytes)
  if (declared === null || sniffed === null || declared !== sniffed) {
    return problem(415, 'unsupported_media_type', 'Upload a png, jpeg, webp, gif, or avif file whose contents match the declared type.')
  }

  try {
    const saved = await context.store.uploads.save({ originalName: entry.name, bytes, kind: sniffed })
    return json(201, saved)
  } catch (error) {
    if (error instanceof StoreError) throw error
    const message = error instanceof Error ? error.message : 'Upload failed.'
    return problem(500, 'write_failed', message)
  }
}

const createPageSchema = z
  .object({
    slug: z.string(),
    title: z.string(),
    template: z.string().min(1).optional(),
    /** The entry's own fields, for a type that declares them. */
    fields: z.record(z.string(), z.unknown()).optional(),
    /** `draft` starts the entry as a draft. Absent: published, as before. */
    status: z.enum(['published', 'draft']).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (readSlug(value.slug) === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Slug must be lowercase kebab-case (the home page uses "index")',
        path: ['slug'],
      })
    }
    if (value.title.trim() === '') {
      ctx.addIssue({ code: 'custom', message: 'Title is required', path: ['title'] })
    }
  })

const renameSchema = z
  .object({
    slug: z.string(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (readSlug(value.slug) === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Slug must be lowercase kebab-case (the home page uses "index")',
        path: ['slug'],
      })
    }
  })

function pageFromSection(
  slug: string,
  title: string,
  seo: { title: string; description: string; noindex: boolean; nofollow: boolean },
  definition: SectionRegistry[string],
): unknown {
  const section: Record<string, unknown> = {
    id: sectionId(definition.type),
    type: definition.type,
    props: structuredClone(definition.defaults),
  }
  const variant = definition.options.find((option) => option.name === 'variant')
  const tone = definition.options.find((option) => option.name === 'tone')
  if (variant?.type === 'enum') section.variant = variant.default
  if (tone?.type === 'enum') section.tone = tone.default
  return {
    slug,
    title,
    seo,
    sections: [section],
  }
}

function draftPage(
  input: { slug: string; title: string; template?: string; fields?: Record<string, unknown>; status?: 'published' | 'draft' },
  pages: readonly StoredPage[],
  registry: SectionRegistry,
  type: MultiType,
): { page: unknown; response?: undefined } | { page?: undefined; response: Response } {
  const slug = readSlug(input.slug)
  if (slug === null) return { response: badSlug() }
  const seo = { title: input.title, description: '', noindex: false, nofollow: false }
  const status = input.status === 'draft' ? { status: 'draft' as const } : {}
  // A new entry starts with something in each required field, so it can be created from a title alone and filled in
  // afterwards. What the body sends wins; the type's schema still has the last word.
  const fields = type.fields || input.fields ? { fields: { ...(type.fields ? starterFields(type.fields) : {}), ...input.fields } } : {}
  const allowed = (name: string): boolean => type.sections === null || type.sections.includes(name)
  const drafted = (definition: SectionRegistry[string]) => ({
    ...(pageFromSection(slug, input.title, seo, definition) as object),
    ...status,
    ...fields,
  })

  if (input.template === undefined) {
    const definition =
      (registry.hero && allowed('hero') ? registry.hero : undefined) ?? Object.values(registry).find((item) => allowed(item.type))
    if (!definition) {
      return { response: problem(400, 'unknown_template', 'No section types are registered.') }
    }
    return { page: drafted(definition) }
  }

  const definition = registry[input.template]
  if (definition) {
    if (!allowed(definition.type)) {
      return {
        response: problem(
          400,
          'unknown_template',
          `Section type "${definition.type}" is not allowed in ${type.label}. Allowed: ${(type.sections ?? []).join(', ')}.`,
        ),
      }
    }
    return { page: drafted(definition) }
  }

  const source = pages.find((entry) => entry.page.slug === input.template)
  if (!source) {
    return {
      response: problem(
        400,
        'unknown_template',
        `Unknown template "${input.template}". Use a section type or an existing ${noun(type)} slug.`,
      ),
    }
  }
  return {
    page: {
      slug,
      title: input.title,
      ...status,
      seo,
      sections: structuredClone(source.page.sections),
      ...(input.fields === undefined && source.page.fields ? { fields: structuredClone(source.page.fields) } : fields),
    },
  }
}

/**
 * A first value for each required field that has no default of its own: today for a date, the first choice of an
 * enum, and the empty value of anything else simple. A field this cannot fill is left out, and validation names it.
 */
function starterFields(schema: z.ZodObject): Record<string, unknown> {
  const starter: Record<string, unknown> = {}
  for (const field of fieldDefinitions(schema) ?? []) {
    const described = field.schema
    if (!field.required || described === null || 'default' in described) continue
    const choices = described.enum
    if (Array.isArray(choices) && choices.length > 0) starter[field.name] = choices[0]
    else if (described.type === 'string') {
      const today = new Date().toISOString()
      starter[field.name] = described.format === 'date' ? today.slice(0, 10) : described.format === 'date-time' ? today : ''
    } else if (described.type === 'number' || described.type === 'integer') starter[field.name] = 0
    else if (described.type === 'boolean') starter[field.name] = false
    else if (described.type === 'array') starter[field.name] = []
  }
  return starter
}

function sectionId(type: string): string {
  const cleaned = type.replace(/[^A-Za-z0-9_-]+/g, '')
  return cleaned || 'section'
}

async function loadStoredPages(
  context: EditorContext,
  options: { allowMissing?: boolean } = {},
  type: MultiType = typesOf(context).pages,
): Promise<{ pages: StoredPage[]; response?: undefined } | { pages?: undefined; response: Response }> {
  let listed: string[] | undefined
  try {
    listed = await context.store.list(type.dir)
  } catch (error) {
    return { response: contentFailure(error) }
  }
  if (listed === undefined) {
    // A declared type whose folder does not exist yet simply has no entries. A site without pages is broken.
    if (options.allowMissing || !isPages(type)) return { pages: [] }
    return { response: problem(404, 'not_found', `Pages directory not found: ${type.dir}`) }
  }
  // A leading underscore marks a file that is not an entry, such as a type's listing page.
  const names = listed.filter((name) => name.endsWith('.json') && !name.startsWith('.') && !name.startsWith('_'))

  const pages: StoredPage[] = []
  const seen = new Map<string, string>()
  for (const name of names) {
    const key = `${type.dir}/${name}`
    let raw: unknown
    try {
      raw = JSON.parse((await context.store.read(key)) ?? '') as unknown
    } catch (error) {
      if (error instanceof StoreError) throw error
      if (error instanceof StoreKeyError) return { response: problem(400, 'invalid_path', `Refusing to read ${name}.`) }
      const message = error instanceof Error ? error.message : String(error)
      return { response: problem(400, 'invalid_json', `Invalid JSON in ${name}: ${message}`) }
    }
    const rawSlug = typeof raw === 'object' && raw !== null && 'slug' in raw && typeof raw.slug === 'string' ? raw.slug : ''
    const upgraded = context.migrator.upgrade(raw, 'page', documentType(context, type, rawSlug).id)
    if (!upgraded.ok) {
      return {
        response: json(422, {
          error: 'validation',
          message: `Invalid content in ${name}.`,
          issues: [{ path: SCHEMA_VERSION_KEY, message: upgraded.message }],
        }),
      }
    }
    const parsed = validateEntry(context, type, rawSlug, upgraded.value)
    if (!parsed.success) {
      return {
        response: json(422, {
          error: 'validation',
          message: `Invalid content in ${name}.`,
          issues: fieldIssues(parsed.error),
        }),
      }
    }
    const page = parsed.data
    const previous = seen.get(page.slug)
    if (previous !== undefined) {
      return {
        response: problem(409, 'conflict', `Duplicate slug "${page.slug}" in ${name} (also defined in ${previous}).`),
      }
    }
    seen.set(page.slug, name)
    pages.push({ key, fileName: name, page })
  }
  return { pages }
}

async function readSite(context: EditorContext): Promise<Site> {
  const raw = await context.store.read(SITE_KEY)
  if (raw === undefined) {
    throw new ContentReadError(SITE_KEY, `Content file not found: ${SITE_KEY}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new ContentReadError(SITE_KEY, `Invalid JSON in ${SITE_KEY}: ${message}`)
  }
  const upgraded = context.migrator.upgrade(parsed, 'site')
  if (!upgraded.ok) {
    throw new ContentValidationError(SITE_KEY, [{ path: [SCHEMA_VERSION_KEY], message: upgraded.message }])
  }
  const result = validateSite(upgraded.value, context.site)
  if (!result.success) {
    const issues: ContentIssue[] = result.error.issues.map((issue) => ({
      path: [...issue.path],
      message: issue.message,
    }))
    throw new ContentValidationError(SITE_KEY, issues)
  }
  return result.data
}

async function readJsonBody(
  request: Request,
): Promise<{ value: unknown; response?: undefined } | { value?: undefined; response: Response }> {
  const length = contentLength(request)
  if (length !== null && length > JSON_BODY_LIMIT) {
    return { response: problem(413, 'too_large', 'JSON body exceeds 1MB.') }
  }
  const type = (request.headers.get('content-type') ?? '').toLowerCase()
  if (type.includes('multipart/form-data')) {
    return { response: problem(415, 'unsupported_media_type', 'This route expects a JSON body.') }
  }
  let text: string
  try {
    text = await request.text()
  } catch {
    return { response: problem(400, 'invalid_json', 'The request body could not be read.') }
  }
  if (new TextEncoder().encode(text).byteLength > JSON_BODY_LIMIT) {
    return { response: problem(413, 'too_large', 'JSON body exceeds 1MB.') }
  }
  try {
    return { value: JSON.parse(text) as unknown }
  } catch {
    return { response: problem(400, 'invalid_json', 'Request body is not valid JSON.') }
  }
}

function contentLength(request: Request): number | null {
  const header = request.headers.get('content-length')
  if (header === null || header === '') return null
  const value = Number(header)
  if (!Number.isFinite(value) || value < 0) return null
  return value
}

function contentFailure(error: unknown): Response {
  // A store failure is not a problem with the content; the request handler answers it with the store's own status.
  if (error instanceof StoreError) throw error
  if (error instanceof ContentValidationError) {
    return json(422, {
      error: 'validation',
      message: error.message,
      issues: error.issues.map((issue) => ({
        path: issue.path.length > 0 ? issue.path.map((part) => String(part)).join('.') : '(root)',
        message: issue.message,
      })),
    })
  }
  if (error instanceof ContentReadError) {
    const missing = /not found/i.test(error.message)
    return problem(missing ? 404 : 400, missing ? 'not_found' : 'invalid_json', error.message)
  }
  const message = error instanceof Error ? error.message : 'Unexpected error.'
  return problem(500, 'write_failed', message)
}

/** Name the document an issue belongs to, for the save route that validates a page and the site together. */
function tagIssues(issues: FieldIssue[], file: 'page' | 'site'): FieldIssue[] {
  return issues.map((issue) => ({ ...issue, file }))
}

function validation(issues: FieldIssue[]): Response {
  return json(400, { error: 'validation', message: 'The document failed schema validation.', issues })
}

function badSlug(): Response {
  return problem(400, 'invalid_slug', 'Slug must be lowercase kebab-case and must not contain a path.')
}

function methodNotAllowed(allow: string[]): Response {
  return json(405, { error: 'method_not_allowed', message: `Allowed: ${allow.join(', ')}.` }, { allow: allow.join(', ') })
}

function problem(status: number, error: string, message: string): Response {
  return json(status, { error, message })
}

function json(status: number, body: unknown, extra?: Record<string, string>): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  if (extra) {
    for (const [key, value] of Object.entries(extra)) headers.set(key, value)
  }
  return new Response(JSON.stringify(body), { status, headers })
}

function stripTrailingSlash(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.replace(/\/+$/, '')
  return pathname
}
