import { z } from 'zod'
import { ContentReadError, ContentValidationError, type ContentIssue } from './errors.js'
import { imageTooLarge, kindFromMime, sniffImage } from './images.js'
import { sniffVideo, videoBodyLimit, videoKindFromMime } from './videos.js'
import { API_PREFIX, type EditorContext, type SectionRegistry } from './options.js'
import { formFile } from './forms-dev.js'
import type { CountRule, Option } from './section-options.js'
import type { OptionalContent } from './section-optional.js'
import type { FieldChoices, FieldIcons, ShowWhen } from './field-rules.js'
import { imageFields } from './section-fields.js'
import type { Wireframe } from './wireframe.js'
import { JSON_BODY_LIMIT, MULTIPART_BODY_LIMIT, isLocalRequest, readSlug } from './security.js'
import { projectId } from './draft-store.js'
import { ensureBaseline, isHistoryId, listHistory, readHistory, writeHistory } from './history.js'
import { fieldIssues, validateEditorPage, validatePage, validateSite, type FieldIssue } from './validate.js'
import { assetRefs, describePageRef, describeSiteRef, missingAssetIssues } from './asset-refs.js'
import { COMMIT_MESSAGE_LIMIT, GitError, commitChanges, gitInfo } from './git.js'
import { PreviewUnavailableError } from './preview.js'
import { isSystemPage, withoutOrphanSections, type Page } from './page.js'
import { isOrphanSection } from './section-schema.js'
import type { Site } from './site.js'
import { SCHEMA_VERSION_KEY, type DocumentKind } from './migrate.js'
import { stableStringify } from './stable-json.js'
import { PAGES_DIR, SITE_KEY, StoreKeyError, pageKey } from './store.js'

export interface HandleMeta {
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
  page: Page
}

/**
 * Dev-server API. Returns null when the URL is not under {@link API_PREFIX}
 * so other middleware can continue. Every write is schema-checked first.
 */
export async function handleEditorRequest(request: Request, context: EditorContext, meta: HandleMeta = {}): Promise<Response | null> {
  const url = new URL(request.url)
  const pathname = stripTrailingSlash(url.pathname)
  if (pathname !== API_PREFIX && !pathname.startsWith(`${API_PREFIX}/`)) return null

  if (!isLocalRequest(request.headers, meta.remoteAddress)) {
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
    if (method === 'GET') return getSite(context)
    if (method === 'PUT') return putSite(request, context)
    return methodNotAllowed(['GET', 'PUT'])
  }

  if (parts.length === 1 && parts[0] === 'save') {
    if (method === 'POST') return postSave(request, context)
    return methodNotAllowed(['POST'])
  }

  if (parts.length === 1 && parts[0] === 'pages') {
    if (method === 'GET') return getPages(context)
    if (method === 'POST') return createPage(request, context)
    return methodNotAllowed(['GET', 'POST'])
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
    if (method === 'GET') return getImages(context)
    if (method === 'POST') return postImage(request, context)
    return methodNotAllowed(['GET', 'POST'])
  }

  if (parts.length === 2 && parts[0] === 'images') {
    if (method === 'DELETE') return removeImage(context, decodeSegment(parts[1] ?? ''))
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
    if (method === 'GET') return getPage(context, slug)
    if (method === 'PUT') return putPage(request, context, slug)
    if (method === 'DELETE') return deletePage(context, slug)
    return methodNotAllowed(['GET', 'PUT', 'DELETE'])
  }

  if (parts.length === 3 && parts[0] === 'pages' && parts[2] === 'rename') {
    const slug = readSlug(parts[1] ?? '')
    if (slug === null) return badSlug()
    if (method === 'POST') return renamePage(request, context, slug)
    return methodNotAllowed(['POST'])
  }

  if (parts.length === 3 && parts[0] === 'pages' && parts[2] === 'set-home') {
    const slug = readSlug(parts[1] ?? '')
    if (slug === null) return badSlug()
    if (method === 'POST') return setHome(request, context, slug)
    return methodNotAllowed(['POST'])
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
    const file = context.formsDir ? formFile(context.formsDir, name) : null
    handlers[name] = { file: file ? relativeTo(context.root, file) : null }
  }
  return json(200, { enabled: context.formsDir != null, handlers })
}

function relativeTo(root: string, file: string): string {
  const prefix = root.endsWith('/') || root.endsWith('\\') ? root : `${root}/`
  return file.startsWith(prefix) ? file.slice(prefix.length).replaceAll('\\', '/') : file
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
  await ensureBaseline(context, 'site', '', await readStoredJson(context, SITE_KEY, 'site'))
  await writeDocuments(context, [[SITE_KEY, parsed.data]])
  await writeHistory(context, 'site', '', parsed.data)
  return json(200, parsed.data)
}

/** The parsed document at `key`, upgraded to the current version, or undefined when it is missing or not JSON. */
async function readStoredJson(context: EditorContext, key: string, kind: DocumentKind): Promise<unknown> {
  try {
    const text = await context.store.read(key)
    if (text === undefined) return undefined
    const upgraded = context.migrator.upgrade(JSON.parse(text), kind)
    return upgraded.ok ? upgraded.value : undefined
  } catch {
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
        /** The slug the page is stored under now. The document's own `slug` is where it goes. */
        from: z.string(),
        document: z.unknown(),
        /** Where the current home page moves when this page becomes `index`. */
        previousHomeSlug: z.string().optional(),
      })
      .strict()
      .optional(),
    site: z.unknown().optional(),
  })
  .strict()
  .refine((value) => value.page !== undefined || value.site !== undefined, { message: 'Nothing to save.' })

/**
 * Save the editor draft in one request: a page (with its rename or promotion to home, when the slug
 * changed) and the site. Every document is validated before anything is written, and all writes and
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
  const result: { page?: Page; site?: Site } = {}

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
          await ensureBaseline(context, 'site', '', stored)
          await writeHistory(context, 'site', '', site.data)
        })
        result.site = site.data
      }
    }
  }

  if (parsed.data.page !== undefined) {
    const planned = await planPageSave(context, parsed.data.page)
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
  | { page: Page; writes: [string, unknown][]; removals: string[]; after: () => Promise<void>; response?: undefined; issues?: undefined }
  | { response: Response; issues?: undefined }
  /** Field errors; the caller decides how to answer, since a save reports the site's alongside them. */
  | { issues: FieldIssue[]; response?: undefined }

async function planPageSave(
  context: EditorContext,
  input: { from: string; document: unknown; previousHomeSlug?: string },
): Promise<PagePlan> {
  const from = readSlug(input.from)
  if (from === null) return { response: badSlug() }
  const upgraded = context.migrator.upgrade(input.document, 'page')
  if (!upgraded.ok) return { issues: [{ path: SCHEMA_VERSION_KEY, message: upgraded.message }] }
  const parsed = validateEditorPage(upgraded.value, context.sections)
  if (!parsed.success) return { issues: fieldIssues(parsed.error) }
  const page = parsed.data as Page
  const target = page.slug
  const missing = await missingAssets(context, page)
  if (missing.length > 0) return { issues: missing }

  const loaded = await loadStoredPages(context)
  if (loaded.response) return { response: loaded.response }
  const found = loaded.pages.find((entry) => entry.page.slug === from)
  if (!found) return { response: problem(404, 'not_found', `No page with slug "${from}".`) }

  // The editor may keep an orphaned section the stored page already has, but never add one.
  const stored = new Set(found.page.sections.filter((section) => isOrphanSection(context.sections, section)).map(orphanKey))
  const added = page.sections.flatMap((section, index) =>
    isOrphanSection(context.sections, section) && !stored.has(orphanKey(section))
      ? [
          {
            path: `sections.${index}.type`,
            message: `Unknown section type "${section.type}". Expected one of: ${Object.keys(context.sections).join(', ')}.`,
          },
        ]
      : [],
  )
  if (added.length > 0) return { issues: added }

  const after = async () => {
    await ensureBaseline(context, 'page', target, found.page)
    await writeHistory(context, 'page', target, page)
  }

  if (target === from) return { page, writes: [[found.key, page]], removals: [], after }

  if (from === 'index') {
    return { response: problem(409, 'conflict', 'The home page slug stays index. Set another page as home to move it.') }
  }
  if (isSystemPage(from) || isSystemPage(target)) {
    return { response: problem(409, 'reserved_slug', 'System pages cannot be renamed, and no page can take their slug.') }
  }

  if (target !== 'index') {
    if (loaded.pages.some((entry) => entry.page.slug === target)) {
      return { response: problem(409, 'conflict', `A page with slug "${target}" already exists.`) }
    }
    const nextKey = pageKey(target)
    if (await context.store.exists(nextKey)) {
      return { response: problem(409, 'conflict', `A file named ${target}.json already exists.`) }
    }
    return { page, writes: [[nextKey, page]], removals: [found.key], after }
  }

  // Promote to home. The current home page, if any, moves to `previousHomeSlug`.
  const indexKey = pageKey('index')
  const home = loaded.pages.find((entry) => entry.page.slug === 'index')
  if (!home) {
    if (await context.store.exists(indexKey)) {
      return { response: problem(409, 'conflict', 'A file named index.json already exists.') }
    }
    return { page, writes: [[indexKey, page]], removals: [found.key], after }
  }
  const previousSlug = input.previousHomeSlug === undefined ? null : readSlug(input.previousHomeSlug)
  if (previousSlug === null || previousSlug === 'index' || isSystemPage(previousSlug)) {
    return { response: problem(400, 'invalid_slug', 'previousHomeSlug is required to move the current home page.') }
  }
  if (loaded.pages.some((entry) => entry.page.slug === previousSlug)) {
    return { response: problem(409, 'conflict', `A page with slug "${previousSlug}" already exists.`) }
  }
  const previousKey = pageKey(previousSlug)
  if (await context.store.exists(previousKey)) {
    return { response: problem(409, 'conflict', `A file named ${previousSlug}.json already exists.`) }
  }
  const moved = validateEditorPage({ ...home.page, slug: previousSlug }, context.sections)
  if (!moved.success) return { issues: fieldIssues(moved.error) }
  return {
    page,
    writes: [
      [previousKey, moved.data],
      [indexKey, page],
    ],
    removals: [...(home.key === indexKey ? [] : [home.key]), found.key],
    after,
  }
}

const commitSchema = z
  .object({
    message: z.string().max(COMMIT_MESSAGE_LIMIT),
    paths: z.array(z.string().min(1).max(512)).max(500).optional(),
  })
  .strict()

async function getGit(context: EditorContext): Promise<Response> {
  return json(200, await gitInfo(context))
}

async function postCommit(request: Request, context: EditorContext): Promise<Response> {
  const body = await readJsonBody(request)
  if (body.response) return body.response
  const parsed = commitSchema.safeParse(body.value)
  if (!parsed.success) return validation(fieldIssues(parsed.error))
  try {
    return json(201, await commitChanges(context, parsed.data.message, parsed.data.paths))
  } catch (error) {
    if (!(error instanceof GitError)) throw error
    const status = error.code === 'failed' ? 500 : error.code === 'invalid' ? 400 : 409
    return problem(status, `git_${error.code}`, error.message)
  }
}

async function getHistory(context: EditorContext, scope: 'page' | 'site', slug: string, id: string | undefined): Promise<Response> {
  if (id === undefined) return json(200, { entries: await listHistory(context, scope, slug) })
  if (!isHistoryId(id)) return problem(400, 'invalid_id', 'Not a history id.')
  const snapshot = await readHistory(context, scope, slug, id)
  if (snapshot === null) return problem(404, 'not_found', 'No saved version with that id.')
  return json(200, snapshot)
}

async function getPages(context: EditorContext): Promise<Response> {
  const loaded = await loadStoredPages(context)
  if (loaded.response) return loaded.response
  return json(200, {
    pages: loaded.pages.map((entry) => ({
      slug: entry.page.slug,
      title: entry.page.title,
      file: entry.fileName,
      system: isSystemPage(entry.page.slug),
      anchors: entry.page.sections.flatMap((section) =>
        'anchor' in section && typeof section.anchor === 'string' && section.anchor !== '' ? [section.anchor] : [],
      ),
    })),
  })
}

async function getPage(context: EditorContext, slug: string): Promise<Response> {
  const loaded = await loadStoredPages(context)
  if (loaded.response) return loaded.response
  const found = loaded.pages.find((entry) => entry.page.slug === slug)
  if (!found) return problem(404, 'not_found', `No page with slug "${slug}".`)
  return json(200, found.page)
}

async function putPage(request: Request, context: EditorContext, slug: string): Promise<Response> {
  const body = await readJsonBody(request)
  if (body.response) return body.response
  const parsed = validateEditorPage(body.value, context.sections)
  if (!parsed.success) return validation(fieldIssues(parsed.error))
  const page = parsed.data as Page
  if (page.slug !== slug) {
    return problem(400, 'slug_mismatch', `Slug in the body must be "${slug}". Rename the page with POST /pages/${slug}/rename.`)
  }
  const missing = await missingAssets(context, page)
  if (missing.length > 0) return validation(missing)
  const loaded = await loadStoredPages(context)
  if (loaded.response) return loaded.response
  const found = loaded.pages.find((entry) => entry.page.slug === slug)
  if (!found) return problem(404, 'not_found', `No page with slug "${slug}".`)
  // The editor may keep an orphaned section the stored page already has, but never add one.
  const stored = new Set(found.page.sections.filter((section) => isOrphanSection(context.sections, section)).map(orphanKey))
  const added = page.sections.flatMap((section, index) =>
    isOrphanSection(context.sections, section) && !stored.has(orphanKey(section))
      ? [
          {
            path: `sections.${index}.type`,
            message: `Unknown section type "${section.type}". Expected one of: ${Object.keys(context.sections).join(', ')}.`,
          },
        ]
      : [],
  )
  if (added.length > 0) return validation(added)
  await ensureBaseline(context, 'page', slug, found.page)
  await writeDocuments(context, [[found.key, page]])
  await writeHistory(context, 'page', slug, page)
  return json(200, page)
}

const orphanKey = (section: { id: string; type: string }): string => `${section.id}:${section.type}`

async function createPage(request: Request, context: EditorContext): Promise<Response> {
  const body = await readJsonBody(request)
  if (body.response) return body.response
  const parsed = createPageSchema.safeParse(body.value)
  if (!parsed.success) return validation(fieldIssues(parsed.error))

  if (isSystemPage(parsed.data.slug)) {
    return problem(409, 'reserved_slug', `"${parsed.data.slug}" is a system page and cannot be created.`)
  }
  const loaded = await loadStoredPages(context, { allowMissing: true })
  if (loaded.response) return loaded.response
  if (loaded.pages.some((entry) => entry.page.slug === parsed.data.slug)) {
    return problem(409, 'conflict', `A page with slug "${parsed.data.slug}" already exists.`)
  }

  const key = pageKey(parsed.data.slug)
  if (await context.store.exists(key)) {
    return problem(409, 'conflict', `A file named ${parsed.data.slug}.json already exists.`)
  }

  const drafted = draftPage(parsed.data, loaded.pages, context.sections)
  if (drafted.response) return drafted.response
  const validated = validatePage(drafted.page, context.sections)
  if (!validated.success) return validation(fieldIssues(validated.error))

  await writeDocuments(context, [[key, validated.data]])
  return json(201, validated.data)
}

async function deletePage(context: EditorContext, slug: string): Promise<Response> {
  if (slug === 'index') {
    return problem(409, 'conflict', 'Refusing to delete the index page.')
  }
  if (isSystemPage(slug)) {
    return problem(409, 'reserved_slug', `"${slug}" is a system page and cannot be deleted.`)
  }
  const loaded = await loadStoredPages(context)
  if (loaded.response) return loaded.response
  const found = loaded.pages.find((entry) => entry.page.slug === slug)
  if (!found) return problem(404, 'not_found', `No page with slug "${slug}".`)
  await writeDocuments(context, [], [found.key])
  return json(200, { deleted: true, slug })
}

/**
 * Make `slug` the home page. The current home page moves to `previousSlug`, so the
 * site never has two pages at "/" and never loses its home page halfway.
 */
async function setHome(request: Request, context: EditorContext, slug: string): Promise<Response> {
  const body = await readJsonBody(request)
  if (body.response) return body.response
  const parsed = setHomeSchema.safeParse(body.value)
  if (!parsed.success) return validation(fieldIssues(parsed.error))
  if (slug === 'index') return problem(409, 'conflict', 'That page is already the home page.')
  if (isSystemPage(slug)) return problem(409, 'reserved_slug', `"${slug}" is a system page and cannot be the home page.`)

  const loaded = await loadStoredPages(context)
  if (loaded.response) return loaded.response
  const target = loaded.pages.find((entry) => entry.page.slug === slug)
  if (!target) return problem(404, 'not_found', `No page with slug "${slug}".`)
  const previous = loaded.pages.find((entry) => entry.page.slug === 'index')

  const indexKey = pageKey('index')
  if (previous) {
    const previousSlug = parsed.data.previousSlug
    if (previousSlug === undefined || previousSlug === 'index') {
      return problem(400, 'invalid_slug', 'previousSlug is required to move the current home page.')
    }
    if (loaded.pages.some((entry) => entry.page.slug === previousSlug)) {
      return problem(409, 'conflict', `A page with slug "${previousSlug}" already exists.`)
    }
    const previousKey = pageKey(previousSlug)
    if (await context.store.exists(previousKey)) {
      return problem(409, 'conflict', `A file named ${previousSlug}.json already exists.`)
    }
    const moved = validateEditorPage({ ...previous.page, slug: previousSlug }, context.sections)
    if (!moved.success) return validation(fieldIssues(moved.error))
    const promoted = validateEditorPage({ ...target.page, slug: 'index' }, context.sections)
    if (!promoted.success) return validation(fieldIssues(promoted.error))
    await writeDocuments(
      context,
      [
        [previousKey, moved.data],
        [indexKey, promoted.data],
      ],
      [...(previous.key === indexKey ? [] : [previous.key]), target.key],
    )
    return json(200, promoted.data)
  }

  if (await context.store.exists(indexKey)) {
    return problem(409, 'conflict', 'A file named index.json already exists.')
  }
  const promoted = validateEditorPage({ ...target.page, slug: 'index' }, context.sections)
  if (!promoted.success) return validation(fieldIssues(promoted.error))
  await writeDocuments(context, [[indexKey, promoted.data]], [target.key])
  return json(200, promoted.data)
}

async function renamePage(request: Request, context: EditorContext, slug: string): Promise<Response> {
  const body = await readJsonBody(request)
  if (body.response) return body.response
  const parsed = renameSchema.safeParse(body.value)
  if (!parsed.success) return validation(fieldIssues(parsed.error))
  const nextSlug = parsed.data.slug
  if (nextSlug === slug) {
    return problem(400, 'invalid_slug', 'The new slug is the same as the current slug.')
  }
  if (slug === 'index') {
    return problem(409, 'conflict', 'Refusing to rename the index page.')
  }
  if (isSystemPage(slug) || isSystemPage(nextSlug)) {
    return problem(409, 'reserved_slug', 'System pages cannot be renamed, and no page can take their slug.')
  }

  const loaded = await loadStoredPages(context)
  if (loaded.response) return loaded.response
  const found = loaded.pages.find((entry) => entry.page.slug === slug)
  if (!found) return problem(404, 'not_found', `No page with slug "${slug}".`)
  if (loaded.pages.some((entry) => entry.page.slug === nextSlug)) {
    return problem(409, 'conflict', `A page with slug "${nextSlug}" already exists.`)
  }

  const nextKey = pageKey(nextSlug)
  if (await context.store.exists(nextKey)) {
    return problem(409, 'conflict', `A file named ${nextSlug}.json already exists.`)
  }

  const renamed = { ...found.page, slug: nextSlug }
  const validated = validateEditorPage(renamed, context.sections)
  if (!validated.success) return validation(fieldIssues(validated.error))
  await writeDocuments(context, [[nextKey, validated.data]], [found.key])
  return json(200, validated.data)
}

const previewBodySchema = z
  .object({
    page: z.unknown(),
    motion: z.boolean().optional(),
  })
  .strict()

async function postPreview(request: Request, context: EditorContext, meta: HandleMeta): Promise<Response> {
  if (!meta.renderPreview) {
    return problem(501, 'preview_unavailable', 'Live preview is only available while astro dev is running.')
  }
  const body = await readJsonBody(request)
  if (body.response) return body.response
  const payload = previewBodySchema.safeParse(body.value)
  if (!payload.success) return validation(fieldIssues(payload.error))
  const parsed = validateEditorPage(payload.data.page, context.sections)
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

async function getImages(context: EditorContext): Promise<Response> {
  return json(200, { images: await context.store.uploads.list() })
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
 * Where the saved content uses the image at `src`: "Home page › Hero", "Site settings › brand logo". Read from the
 * raw files, so a page that fails validation still counts. Unsaved drafts are not on disk: the editor checks its own
 * drafts before it asks to delete, and saving a draft that still points at a deleted image fails validation.
 */
async function imageUsages(context: EditorContext, src: string): Promise<string[]> {
  const labels = Object.fromEntries(Object.values(context.sections).map((definition) => [definition.type, definition.label]))
  const usages: string[] = []
  const site = await readStoredJson(context, SITE_KEY, 'site')
  for (const ref of assetRefs(site)) if (ref.src === src) usages.push(describeSiteRef(ref))
  for (const name of (await context.store.list(PAGES_DIR)) ?? []) {
    if (!name.endsWith('.json') || name.startsWith('.')) continue
    const page = await readStoredJson(context, `${PAGES_DIR}/${name}`, 'page')
    if (typeof page !== 'object' || page === null) continue
    const title = 'title' in page && typeof page.title === 'string' ? page.title : name.replace(/\.json$/, '')
    const sections = 'sections' in page && Array.isArray(page.sections) ? (page.sections as { type: string }[]) : []
    for (const ref of assetRefs(page)) if (ref.src === src) usages.push(describePageRef(ref, { title, sections }, labels))
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
  for (const name of (await context.store.list(PAGES_DIR)) ?? []) {
    if (!name.endsWith('.json') || name.startsWith('.')) continue
    const page = await readStoredJson(context, `${PAGES_DIR}/${name}`, 'page')
    if (typeof page !== 'object' || page === null) continue
    const title = 'title' in page && typeof page.title === 'string' ? page.title : name.replace(/\.json$/, '')
    const sections = 'sections' in page && Array.isArray(page.sections) ? (page.sections as { type?: string }[]) : []
    for (const section of sections) {
      if ([...strings(section)].includes(url)) usages.push(`${title} › ${labels[section.type ?? ''] ?? section.type ?? 'section'}`)
    }
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
  const length = contentLength(request)
  if (length !== null && length > MULTIPART_BODY_LIMIT) {
    return problem(413, 'too_large', 'Upload exceeds the 5MB image limit.')
  }
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
  if (imageTooLarge(entry.size)) {
    return problem(413, 'too_large', 'Images must be 5MB or smaller.')
  }

  const bytes = new Uint8Array(await entry.arrayBuffer())
  if (imageTooLarge(bytes.byteLength)) {
    return problem(413, 'too_large', 'Images must be 5MB or smaller.')
  }
  const declared = kindFromMime(entry.type)
  const sniffed = sniffImage(bytes)
  if (declared === null || sniffed === null || declared !== sniffed) {
    return problem(415, 'unsupported_media_type', 'Upload a png, jpeg, webp, gif, or avif file whose contents match the declared type.')
  }

  try {
    const saved = await context.store.uploads.save({ originalName: entry.name, bytes, kind: sniffed })
    return json(201, saved)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed.'
    return problem(500, 'write_failed', message)
  }
}

const createPageSchema = z
  .object({
    slug: z.string(),
    title: z.string(),
    template: z.string().min(1).optional(),
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

const setHomeSchema = z
  .object({
    /** Slug the current home page moves to. Required when a home page exists. */
    previousSlug: z.string().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.previousSlug !== undefined && readSlug(value.previousSlug) === null) {
      ctx.addIssue({ code: 'custom', message: 'Slug must be lowercase kebab-case', path: ['previousSlug'] })
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
  input: { slug: string; title: string; template?: string },
  pages: readonly StoredPage[],
  registry: SectionRegistry,
): { page: unknown; response?: undefined } | { page?: undefined; response: Response } {
  const slug = readSlug(input.slug)
  if (slug === null) return { response: badSlug() }
  const seo = { title: input.title, description: '', noindex: false, nofollow: false }

  if (input.template === undefined) {
    const definition = registry.hero ?? Object.values(registry)[0]
    if (!definition) {
      return { response: problem(400, 'unknown_template', 'No section types are registered.') }
    }
    return { page: pageFromSection(slug, input.title, seo, definition) }
  }

  const definition = registry[input.template]
  if (definition) {
    return { page: pageFromSection(slug, input.title, seo, definition) }
  }

  const source = pages.find((entry) => entry.page.slug === input.template)
  if (!source) {
    return {
      response: problem(400, 'unknown_template', `Unknown template "${input.template}". Use a section type or an existing page slug.`),
    }
  }
  return {
    page: {
      slug,
      title: input.title,
      seo,
      sections: structuredClone(source.page.sections),
    },
  }
}

function sectionId(type: string): string {
  const cleaned = type.replace(/[^A-Za-z0-9_-]+/g, '')
  return cleaned || 'section'
}

async function loadStoredPages(
  context: EditorContext,
  options: { allowMissing?: boolean } = {},
): Promise<{ pages: StoredPage[]; response?: undefined } | { pages?: undefined; response: Response }> {
  let listed: string[] | undefined
  try {
    listed = await context.store.list(PAGES_DIR)
  } catch (error) {
    return { response: contentFailure(error) }
  }
  if (listed === undefined) {
    if (options.allowMissing) return { pages: [] }
    return { response: problem(404, 'not_found', `Pages directory not found: ${PAGES_DIR}`) }
  }
  const names = listed.filter((name) => name.endsWith('.json') && !name.startsWith('.'))

  const pages: StoredPage[] = []
  const seen = new Map<string, string>()
  for (const name of names) {
    const key = `${PAGES_DIR}/${name}`
    let raw: unknown
    try {
      raw = JSON.parse((await context.store.read(key)) ?? '') as unknown
    } catch (error) {
      if (error instanceof StoreKeyError) return { response: problem(400, 'invalid_path', `Refusing to read ${name}.`) }
      const message = error instanceof Error ? error.message : String(error)
      return { response: problem(400, 'invalid_json', `Invalid JSON in ${name}: ${message}`) }
    }
    const upgraded = context.migrator.upgrade(raw, 'page')
    if (!upgraded.ok) {
      return {
        response: json(422, {
          error: 'validation',
          message: `Invalid content in ${name}.`,
          issues: [{ path: SCHEMA_VERSION_KEY, message: upgraded.message }],
        }),
      }
    }
    const parsed = validateEditorPage(upgraded.value, context.sections)
    if (!parsed.success) {
      return {
        response: json(422, {
          error: 'validation',
          message: `Invalid content in ${name}.`,
          issues: fieldIssues(parsed.error),
        }),
      }
    }
    const page = parsed.data as Page
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
  if (Buffer.byteLength(text) > JSON_BODY_LIMIT) {
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
