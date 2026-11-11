import { z, type ZodType } from 'zod'
import { applyBlocks, type BlockEdit, parseBody, type SourceBlock } from './entry-blocks.js'
import { EntryError, hasFrontmatter, joinEntry, readFields, setField, splitEntry, removeField } from './entry-source.js'
import { slugSchema } from './page.js'
import { type ContentStore, repoKey } from './store-core.js'
import { type FieldIssue, fieldIssues } from './validate.js'

/*
 * Markdown collections: an existing Astro content collection (`src/content/blog/*.md`, a Zod schema) edited in place.
 * Pure: no Node, Astro or Vite imports, so a hosted editor can run it over a GitHub store. Files are changed with the
 * source-preserving modules (`entry-source`, `entry-blocks`): a field or block the person did not touch stays
 * byte-identical.
 */

/** What a collection's `schema` may be: a Zod schema, or Astro's factory form `({ image }) => schema`. */
export type CollectionSchema = ZodType | ((helpers: { image: () => ZodType }) => ZodType)

export interface CollectionOptions {
  /**
   * The same schema the site's `content.config.ts` uses, imported from a plain module (no `astro:content`). A site that
   * uses Astro's `image()` writes the factory form `({ image }) => z.object({ cover: image().optional() })`.
   */
  schema: CollectionSchema
  /** Where the files are, from the project root, with `{slug}` as the file name: `src/content/blog/en/{slug}.md`. */
  path: string
  /** Shown in the editor. Default: the collection's id. */
  label?: string
  /** Allow changing an entry's slug, which changes its address. Default false. */
  rename?: boolean
  /** Allow deleting entries. Default false. */
  delete?: boolean
}

export interface Collection {
  id: string
  label: string
  /** The folder of the files, from the project root, without a trailing slash. */
  dir: string
  ext: '.md' | '.mdx'
  schema: ZodType
  rename: boolean
  delete: boolean
}

const TEMPLATE = /^((?:[A-Za-z0-9_.-]+\/)+)\{slug\}(\.mdx?)$/
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const FIELD_NAME_RULE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/
const FORBIDDEN_FIELDS = new Set(['__proto__', 'constructor', 'prototype'])

/** Declares a collection. Checks the options now, so a typo fails when the config loads, not on the first save. */
export function collection(options: CollectionOptions): CollectionOptions {
  parseTemplate(options.path)
  return options
}

function parseTemplate(path: string): { dir: string; ext: '.md' | '.mdx' } {
  const match = TEMPLATE.exec(path)
  if (!match || path.split('/').some((part) => part === '.' || part === '..')) {
    throw new Error(
      `bearminion(): a collection path must look like "src/content/blog/{slug}.md" (a folder, then {slug} and .md or .mdx), got "${path}".`,
    )
  }
  return { dir: (match[1] ?? '').replace(/\/$/, ''), ext: match[2] as '.md' | '.mdx' }
}

/** Astro's `image()` stands in as a string path, marked so the editor can offer the uploader. */
const imageField = (): ZodType => z.string().meta({ bearminion: 'image' })

/** Checks the `collections` option and resolves each schema. */
export function resolveCollections(input: Record<string, CollectionOptions> | undefined): Record<string, Collection> {
  const result: Record<string, Collection> = {}
  for (const [id, options] of Object.entries(input ?? {})) {
    if (!ID.test(id)) throw new Error(`bearminion(): collection id "${id}" must be lowercase kebab-case.`)
    const { dir, ext } = parseTemplate(options.path)
    const schema = typeof options.schema === 'function' ? options.schema({ image: imageField }) : options.schema
    result[id] = {
      id,
      label: options.label ?? id,
      dir,
      ext,
      schema,
      rename: options.rename === true,
      delete: options.delete === true,
    }
  }
  return result
}

export function entryKey(collection: Collection, slug: string): string {
  return repoKey(`${collection.dir}/${slug}${collection.ext}`)
}

export interface FieldDefinition {
  name: string
  required: boolean
  /** JSON Schema of the field, or null when the schema cannot describe it. */
  schema: Record<string, unknown> | null
  /** The editor shows the value but does not edit it: the schema has no form for it. */
  readOnly: boolean
}

type Override = NonNullable<Parameters<typeof z.toJSONSchema>[1]>['override']

/** Dates have no JSON Schema form; the editor edits them as text in a date picker. */
const dateOverride: Override = (context) => {
  if (context.zodSchema._zod.def.type === 'date') {
    context.jsonSchema.type = 'string'
    context.jsonSchema.format = 'date-time'
    context.jsonSchema['x-bm'] = 'date'
  }
}

/**
 * The form fields of a collection's schema, one per top-level key. Advisory: refinements and transforms are invisible
 * here, and the real schema validates every save. A field that cannot be described comes back read-only, never dropped.
 */
export function fieldDefinitions(schema: ZodType): FieldDefinition[] | null {
  const shape = (schema as { shape?: Record<string, ZodType> }).shape
  if (shape === undefined || typeof shape !== 'object') return null
  return Object.entries(shape).map(([name, field]) => {
    try {
      const converted = z.toJSONSchema(z.object({ [name]: field }), { io: 'input', unrepresentable: 'any', override: dateOverride })
      const property = (converted.properties?.[name] ?? null) as Record<string, unknown> | null
      const described = property !== null && ['type', 'enum', 'const', 'anyOf', 'oneOf', '$ref'].some((key) => key in property)
      return { name, required: converted.required?.includes(name) === true, schema: property, readOnly: !described }
    } catch {
      return { name, required: false, schema: null, readOnly: true }
    }
  })
}

export interface Entry {
  slug: string
  format: 'md' | 'mdx'
  /** Frontmatter as plain JSON: dates become `YYYY-MM-DD` at midnight UTC and full ISO strings otherwise. */
  fields: Record<string, unknown>
  /** Top-level blocks of the body. Blocks with `editable: false` carry their source and are only passed through. */
  blocks: Pick<SourceBlock, 'id' | 'type' | 'raw' | 'editable'>[]
}

function jsonSafe(value: unknown): unknown {
  if (value instanceof Date) {
    const iso = value.toISOString()
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso
  }
  if (Array.isArray(value)) return value.map(jsonSafe)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, jsonSafe(inner)]))
  }
  return value
}

function describe(collection: Collection, slug: string, source: string): Entry {
  const parts = splitEntry(source)
  const format = collection.ext === '.mdx' ? 'mdx' : 'md'
  const parsed = parseBody(parts.body, { mdx: format === 'mdx' })
  return {
    slug,
    format,
    fields: jsonSafe(hasFrontmatter(parts) ? readFields(parts.frontmatter) : {}) as Record<string, unknown>,
    blocks: parsed.blocks.map(({ id, type, raw, editable }) => ({ id, type, raw, editable })),
  }
}

export type Failure = { ok: false; status: number; code: string; message: string; issues?: FieldIssue[] }
export type Outcome<T> = { ok: true; value: T } | Failure

const fail = (status: number, code: string, message: string, issues?: FieldIssue[]): Failure => ({
  ok: false,
  status,
  code,
  message,
  ...(issues ? { issues } : {}),
})

function entryFailure(error: unknown): Failure {
  if (error instanceof EntryError) {
    return fail(error.code === 'read_only_field' ? 409 : 422, error.code, error.message)
  }
  throw error
}

async function validate(collection: Collection, source: string): Promise<FieldIssue[]> {
  const parts = splitEntry(source)
  const result = await collection.schema.safeParseAsync(hasFrontmatter(parts) ? readFields(parts.frontmatter) : {})
  if (result.success) return []
  return fieldIssues(result.error)
}

export async function listEntries(store: ContentStore, collection: Collection): Promise<{ slugs: string[]; skipped: string[] }> {
  const names = (await store.list(repoKey(collection.dir))) ?? []
  const slugs: string[] = []
  const skipped: string[] = []
  for (const name of names) {
    if (!name.endsWith(collection.ext)) continue
    const slug = name.slice(0, -collection.ext.length)
    if (slugSchema.safeParse(slug).success) slugs.push(slug)
    else skipped.push(name)
  }
  return { slugs, skipped }
}

export async function readEntry(store: ContentStore, collection: Collection, slug: string): Promise<Outcome<Entry>> {
  const source = await store.read(entryKey(collection, slug))
  if (source === undefined) return fail(404, 'not_found', `No entry "${slug}" in ${collection.label}.`)
  try {
    return { ok: true, value: describe(collection, slug, source) }
  } catch (error) {
    return entryFailure(error)
  }
}

export interface EntryPatch {
  /** Frontmatter keys to set. Only these keys are rewritten in the file. */
  set?: Record<string, unknown>
  /** Frontmatter keys to remove. */
  unset?: string[]
  /** The body in its new order: existing blocks by id (optionally with new `markdown`) and new blocks. */
  blocks?: BlockEdit[]
}

function checkFieldName(name: string): Failure | null {
  if (!FIELD_NAME_RULE.test(name) || FORBIDDEN_FIELDS.has(name))
    return fail(400, 'invalid_field', `"${name}" is not a field name the editor can write.`)
  return null
}

export async function updateEntry(store: ContentStore, collection: Collection, slug: string, patch: EntryPatch): Promise<Outcome<Entry>> {
  const key = entryKey(collection, slug)
  const source = await store.read(key)
  if (source === undefined) return fail(404, 'not_found', `No entry "${slug}" in ${collection.label}.`)
  try {
    const parts = splitEntry(source)
    let frontmatter = parts.frontmatter
    let head = parts.head
    let tail = parts.tail
    for (const name of [...Object.keys(patch.set ?? {}), ...(patch.unset ?? [])]) {
      const bad = checkFieldName(name)
      if (bad) return bad
    }
    if ((patch.set && Object.keys(patch.set).length > 0) || (patch.unset && patch.unset.length > 0)) {
      if (!hasFrontmatter(parts)) {
        head = `---${parts.eol}`
        tail = `---${parts.eol}`
        frontmatter = ''
      }
      for (const [name, value] of Object.entries(patch.set ?? {})) frontmatter = setField(frontmatter, name, value, parts.eol)
      for (const name of patch.unset ?? []) frontmatter = removeField(frontmatter, name)
    }

    let body = parts.body
    if (patch.blocks) {
      const parsed = parseBody(parts.body, { mdx: collection.ext === '.mdx' })
      const byId = new Map(parsed.blocks.map((block) => [block.id, block]))
      for (const edit of patch.blocks) {
        if (edit.id !== undefined && !byId.has(edit.id)) return fail(400, 'unknown_block', `Block "${edit.id}" does not exist.`)
        if (edit.id !== undefined && edit.markdown !== undefined && byId.get(edit.id)?.editable === false) {
          return fail(409, 'block_locked', `Block "${edit.id}" holds content the editor cannot edit (HTML, MDX, footnotes or similar).`)
        }
      }
      body = applyBlocks(parsed, patch.blocks)
    }

    const next = joinEntry({ ...parts, head, frontmatter, tail, body })
    const issues = await validate(collection, next)
    if (issues.length > 0) return fail(400, 'validation', 'The entry failed schema validation.', issues)
    if (next !== source) await store.apply([{ type: 'write', key, text: next }])
    return { ok: true, value: describe(collection, slug, next) }
  } catch (error) {
    return entryFailure(error)
  }
}

export interface NewEntry {
  slug: string
  fields?: Record<string, unknown>
  /** The body as Markdown. */
  body?: string
}

export async function createEntry(store: ContentStore, collection: Collection, input: NewEntry): Promise<Outcome<Entry>> {
  if (!slugSchema.safeParse(input.slug).success)
    return fail(400, 'invalid_slug', 'Slug must be lowercase kebab-case and must not contain a path.')
  const key = entryKey(collection, input.slug)
  if (await store.exists(key)) return fail(409, 'conflict', `"${input.slug}" already exists in ${collection.label}.`)
  try {
    let frontmatter = ''
    for (const [name, value] of Object.entries(input.fields ?? {})) {
      const bad = checkFieldName(name)
      if (bad) return bad
      frontmatter = setField(frontmatter, name, value)
    }
    const body = (input.body ?? '').replace(/(?:\r?\n)+$/, '')
    const source = `---\n${frontmatter}---\n${body === '' ? '' : `\n${body}\n`}`
    const issues = await validate(collection, source)
    if (issues.length > 0) return fail(400, 'validation', 'The entry failed schema validation.', issues)
    await store.apply([{ type: 'write', key, text: source }])
    return { ok: true, value: describe(collection, input.slug, source) }
  } catch (error) {
    return entryFailure(error)
  }
}

export async function deleteEntry(store: ContentStore, collection: Collection, slug: string): Promise<Outcome<{ slug: string }>> {
  if (!collection.delete)
    return fail(409, 'operation_locked', `Deleting entries is turned off for ${collection.label} (delete in its collection() options).`)
  const key = entryKey(collection, slug)
  if (!(await store.exists(key))) return fail(404, 'not_found', `No entry "${slug}" in ${collection.label}.`)
  await store.apply([{ type: 'remove', key }])
  return { ok: true, value: { slug } }
}

export async function renameEntry(
  store: ContentStore,
  collection: Collection,
  slug: string,
  next: string,
): Promise<Outcome<{ slug: string }>> {
  if (!collection.rename)
    return fail(409, 'operation_locked', `Renaming entries is turned off for ${collection.label} (rename in its collection() options).`)
  if (!slugSchema.safeParse(next).success)
    return fail(400, 'invalid_slug', 'Slug must be lowercase kebab-case and must not contain a path.')
  const from = entryKey(collection, slug)
  const to = entryKey(collection, next)
  const source = await store.read(from)
  if (source === undefined) return fail(404, 'not_found', `No entry "${slug}" in ${collection.label}.`)
  if (next === slug) return { ok: true, value: { slug } }
  if (await store.exists(to)) return fail(409, 'conflict', `"${next}" already exists in ${collection.label}.`)
  await store.apply([
    { type: 'write', key: to, text: source },
    { type: 'remove', key: from },
  ])
  return { ok: true, value: { slug: next } }
}
