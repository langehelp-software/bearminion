import { z } from 'zod'
import { textSchema } from './fields.js'
import type { SectionRegistry } from './model.js'
import { addSectionIdentityIssues, createPageSchema, createTolerantPageSchema, seoSchema, slugSchema, type Page, type Seo } from './page.js'
import { createSectionSchema, createTolerantSectionSchema, type BaseSection } from './section-schema.js'
import { PAGES_DIR } from './store-core.js'

/*
 * Content types: the kinds of JSON document a site has. Three are built in and always there: `home` (the page at `/`),
 * `not-found` (the 404 page) and `pages` (every other page, at `/<slug>`). A site adds more with the `types` key of its
 * content model, for example a blog whose entries live at `/blog/<slug>` and carry a date. Pure: no Node, Astro or
 * Vite imports, so the build, the editor API and a hosted editor resolve the same types from the same config.
 *
 * Not the same as `collections`, which are existing Astro Markdown collections edited in place.
 */

/** How the entries of a type are ordered in its listing and in the editor. */
export interface SortRule {
  /** `title`, or the name of one of the type's `fields`. The field must be required and a date, string, number, boolean or enum. */
  by: string
  /** Default `asc`. */
  order?: 'asc' | 'desc'
}

/** The page that lists a type's entries, with pagination. */
export interface ListingOptions {
  /** The listing's address, one segment: `news` puts it at `/news` and `/news/page/2`. Default: the first segment of `path`. */
  slug?: string
  /** Entries on one listing page, 1 to 100. Default 10. */
  perPage?: number
}

export interface TypeOptions {
  /** Set by `multi()`. A type written as a plain object is a multi type too. */
  kind?: 'multi'
  /** Where an entry is served: `/blog/{slug}`. One segment, then `{slug}`. Default `/<id>/{slug}`. */
  path?: string
  /** Shown in the editor. Default: the id with a capital letter. */
  label?: string
  /** Fields every entry of this type has besides its title, SEO and sections: `z.object({ date: z.iso.date() })`. */
  fields?: z.ZodObject
  /** The section types an entry may use. Default: every section the site defines. */
  sections?: readonly string[]
  /** Default: by title, A to Z. */
  sort?: SortRule
  /** `false` (the default) for no listing page, or its settings. `{}` turns it on with the defaults. */
  listing?: false | ListingOptions
  /** Allow changing an entry's slug, which changes its address. Default true. */
  rename?: boolean
  /** Allow deleting entries. Default true. */
  delete?: boolean
}

/** A type with exactly one document at a fixed address, such as an About page nobody may rename or delete. */
export interface SingleOptions {
  kind: 'single'
  /** The document's address, one segment: `/about`. */
  path: string
  /** Shown in the editor. Default: the id with a capital letter. */
  label?: string
  /** Fields the document has besides its title, SEO and sections. */
  fields?: z.ZodObject
  /** The section types the document may use. Default: every section the site defines. */
  sections?: readonly string[]
}

/** The `types` key of a content model: type options by id. */
export type ContentTypes = Record<string, TypeOptions | SingleOptions>

export const HOME_TYPE = 'home'
export const NOT_FOUND_TYPE = 'not-found'
export const PAGES_TYPE = 'pages'
/** Store directory of the singles a site declares. The built-in home and 404 documents stay in `pages/`. */
export const SINGLES_DIR = 'singles'
/** The slug the home page is stored under. */
export const HOME_SLUG = 'index'
export const NOT_FOUND_SLUG = '404'
/** The file of a type's listing page. An underscore cannot start a slug, so no entry can take the name. */
export const LISTING_FILE = '_listing.json'
/** `/blog/page/2`: the segment before the page number. An entry cannot use it as its slug when the listing shares its prefix. */
export const PAGINATION_SEGMENT = 'page'
/** The Astro collection of listing page documents, one per type that has a listing. Entry id = type id. */
export const LISTINGS_COLLECTION = 'bm-listings'
/** The Astro collection of the singles a model declares. Entry id = type id. */
export const SINGLES_COLLECTION = 'bm-singles'
/** What a migration is told a listing page document is, in place of a content type's id. */
export const LISTING_MIGRATION_TYPE = 'listing'
export const DEFAULT_PER_PAGE = 10
export const MAX_PER_PAGE = 100

/** A type with exactly one document at a fixed address. It cannot be created, renamed or deleted. */
export interface SingleType {
  kind: 'single'
  id: string
  label: string
  /** `/`, `/404`, or the one-segment address of a single the site declares. */
  path: string
  /** The slug inside the stored document: `index`, `404`, or the address segment. */
  slug: string
  /** Store key of the document. */
  key: string
  fields: z.ZodObject | null
  /** Allowed section types, or null for all of them. */
  sections: readonly string[] | null
  /** True for `home` and `not-found`, which every site has. */
  builtIn: boolean
}

/** A type with any number of entries, each at `/<prefix>/<slug>` (or `/<slug>` for `pages`). */
export interface MultiType {
  kind: 'multi'
  id: string
  label: string
  /** The address segment before the slug. Empty for `pages`, whose entries sit at the root. */
  prefix: string
  /** Store directory of the entries, relative to the content directory. */
  dir: string
  fields: z.ZodObject | null
  /** Allowed section types, or null for all of them. */
  sections: readonly string[] | null
  /** Null keeps the order the store lists the files in (the built-in `pages` default). */
  sort: Required<SortRule> | null
  listing: Required<ListingOptions> | null
  rename: boolean
  delete: boolean
}

export type ContentType = SingleType | MultiType

export interface ResolvedTypes {
  home: SingleType
  notFound: SingleType
  /** `home`, `not-found`, then the singles the site declares. */
  singles: readonly SingleType[]
  /** The built-in `pages` type. */
  pages: MultiType
  /** Every multi type, `pages` first, then the site's own in the order they were declared. */
  multi: readonly MultiType[]
  /** The type with this id, or undefined. */
  get(id: string): ContentType | undefined
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PATH = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)\/\{slug\}$/
const SINGLE_PATH = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)$/
const PAGES_PATH = '/{slug}'
/** Ids that would be mistaken for a built-in type, a store file, a pull-request scope or one of the editor's own collections. */
const RESERVED_IDS = new Set([
  HOME_TYPE,
  NOT_FOUND_TYPE,
  HOME_SLUG,
  SINGLES_DIR,
  'site',
  'page',
  'collection',
  'edits',
  'uploads',
  'listing',
  LISTINGS_COLLECTION,
  SINGLES_COLLECTION,
])
/** Root addresses a type or a listing cannot take. */
const RESERVED_SEGMENTS = new Set([HOME_SLUG, NOT_FOUND_SLUG])
const SINGLE_KEYS = new Set(['kind', 'path', 'label', 'fields', 'sections'])
const OPTION_KEYS = new Set(['kind', 'path', 'label', 'fields', 'sections', 'sort', 'listing', 'rename', 'delete'])
const SORTABLE = new Set(['string', 'number', 'boolean', 'enum', 'date'])
const WRAPPERS = new Set(['default', 'prefault', 'readonly', 'catch', 'nonoptional'])

class TypesError extends Error {
  constructor(message: string) {
    super(`Content types: ${message}`)
    this.name = 'ContentTypesError'
  }
}

interface Def {
  type: string
  in?: z.ZodType
  innerType?: z.ZodType
  shape?: Record<string, z.ZodType>
}

function defOf(schema: z.ZodType): Def {
  return (schema as unknown as { _zod: { def: Def } })._zod.def
}

function isObjectSchema(value: unknown): value is z.ZodObject {
  if (typeof value !== 'object' || value === null || !('_zod' in value)) return false
  const def = defOf(value as z.ZodType)
  return def.type === 'object' && typeof def.shape === 'object'
}

/** The kind of value a sort field holds, or why it cannot be sorted by. */
function sortKind(field: z.ZodType): { kind: string } | { reason: string } {
  let current = field
  for (let depth = 0; depth < 16; depth++) {
    const def = defOf(current)
    if (def.type === 'optional' || def.type === 'nullable') return { reason: 'it is optional, so some entries would have no value' }
    if (def.type === 'pipe' && def.in) current = def.in
    else if (WRAPPERS.has(def.type) && def.innerType) current = def.innerType
    else return SORTABLE.has(def.type) ? { kind: def.type } : { reason: `a ${def.type} has no order` }
  }
  return { reason: 'its schema is nested too deep' }
}

function defaultLabel(id: string): string {
  const words = id.replaceAll('-', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Declares a type with many entries. Checks the options that need nothing else now, so a typo fails where it was written. */
export function multi(options: Omit<TypeOptions, 'kind'> = {}): TypeOptions {
  checkOptions('multi()', options)
  return { ...options, kind: 'multi' }
}

/** Declares a type with one document at a fixed address: `single({ path: '/about' })`. */
export function single(options: Omit<SingleOptions, 'kind'>): SingleOptions {
  const declared: SingleOptions = { ...options, kind: 'single' }
  checkSingle('single()', declared)
  return declared
}

function checkShared(where: string, options: { label?: unknown; fields?: unknown; sections?: unknown }): void {
  if (options.label !== undefined && (typeof options.label !== 'string' || options.label.trim() === '')) {
    throw new TypesError(`${where}: label must be a non-empty string.`)
  }
  if (options.fields !== undefined && !isObjectSchema(options.fields)) {
    throw new TypesError(`${where}: fields must be a z.object({...}).`)
  }
  if (options.sections !== undefined) {
    if (!Array.isArray(options.sections) || options.sections.some((name) => typeof name !== 'string')) {
      throw new TypesError(`${where}: sections must be a list of section types.`)
    }
    if (options.sections.length === 0) {
      throw new TypesError(`${where}: sections is empty, so nothing could be added. Leave it out to allow all.`)
    }
  }
}

/** Checks a single's options and returns its address segment. */
function checkSingle(where: string, options: SingleOptions): string {
  if (typeof options !== 'object' || options === null) throw new TypesError(`${where} needs an options object.`)
  for (const key of Object.keys(options)) {
    if (!SINGLE_KEYS.has(key)) {
      throw new TypesError(`${where} has an unknown option "${key}". A single takes: path, label, fields, sections.`)
    }
  }
  const match = typeof options.path === 'string' ? SINGLE_PATH.exec(options.path) : null
  if (!match) throw new TypesError(`${where}: path must be one segment, like "/about", got "${String(options.path)}".`)
  checkShared(where, options)
  return match[1] as string
}

/** Declares the site's types. Checks every type and that no two share an address. */
export function defineTypes<TTypes extends ContentTypes>(types: TTypes): TTypes {
  resolveTypes({ types })
  return types
}

function checkOptions(where: string, options: TypeOptions): void {
  if (typeof options !== 'object' || options === null) throw new TypesError(`${where} needs an options object.`)
  for (const key of Object.keys(options)) {
    if (!OPTION_KEYS.has(key)) throw new TypesError(`${where} has an unknown option "${key}". Known: ${[...OPTION_KEYS].join(', ')}.`)
  }
  if (options.kind !== undefined && options.kind !== 'multi') throw new TypesError(`${where}: kind must be "multi" here.`)
  for (const key of ['rename', 'delete'] as const) {
    if (options[key] !== undefined && typeof options[key] !== 'boolean') throw new TypesError(`${where}: ${key} must be true or false.`)
  }
  checkShared(where, options)
  const listing = options.listing
  if (listing !== undefined && listing !== false) {
    if (typeof listing !== 'object' || listing === null) throw new TypesError(`${where}: listing must be false or { slug, perPage }.`)
    for (const key of Object.keys(listing)) {
      if (key !== 'slug' && key !== 'perPage')
        throw new TypesError(`${where}: unknown option listing.${key}. Use listing.slug or listing.perPage.`)
    }
    const perPage = listing.perPage
    if (perPage !== undefined && (!Number.isInteger(perPage) || perPage < 1 || perPage > MAX_PER_PAGE)) {
      throw new TypesError(`${where}: listing.perPage must be a whole number from 1 to ${MAX_PER_PAGE}.`)
    }
    if (listing.slug !== undefined && (typeof listing.slug !== 'string' || !ID.test(listing.slug))) {
      throw new TypesError(`${where}: listing.slug must be one lowercase kebab-case segment, like "news".`)
    }
  }
  const sort = options.sort
  if (sort !== undefined) {
    if (typeof sort !== 'object' || sort === null || typeof sort.by !== 'string' || sort.by === '') {
      throw new TypesError(`${where}: sort must be { by, order }, with by set to "title" or a field name.`)
    }
    if (sort.order !== undefined && sort.order !== 'asc' && sort.order !== 'desc') {
      throw new TypesError(`${where}: sort.order must be "asc" or "desc".`)
    }
    for (const key of Object.keys(sort)) {
      if (key !== 'by' && key !== 'order') throw new TypesError(`${where}: unknown option sort.${key}. Use sort.by or sort.order.`)
    }
  }
}

function resolveSort(where: string, options: TypeOptions, fallback: Required<SortRule> | null): Required<SortRule> | null {
  const sort = options.sort
  if (sort === undefined) return fallback
  if (sort.by !== 'title') {
    const shape = options.fields ? defOf(options.fields).shape : undefined
    const field = shape && Object.hasOwn(shape, sort.by) ? shape[sort.by] : undefined
    if (field === undefined) {
      const known = ['title', ...Object.keys(shape ?? {})].join(', ')
      throw new TypesError(`${where}: sort.by "${sort.by}" is not a field of this type. Known: ${known}.`)
    }
    const kind = sortKind(field)
    if ('reason' in kind)
      throw new TypesError(
        `${where}: cannot sort by "${sort.by}": ${kind.reason}. Use a required date, string, number, boolean or enum field.`,
      )
  }
  return { by: sort.by, order: sort.order ?? 'asc' }
}

export interface TypesInput {
  types?: ContentTypes
  /** The site's section registry. When given, each type's `sections` is checked against it. */
  sections?: SectionRegistry
}

const resolved = new WeakMap<ContentTypes, ResolvedTypes>()
let builtIn: ResolvedTypes | undefined

/**
 * The site's types with every default filled in: the three built-in ones plus what `types` declares. Throws when the
 * config is wrong, with the type and option to fix. Cached per `types` object.
 */
export function resolveTypes(model: TypesInput, pageRules?: { rename: boolean; delete: boolean }): ResolvedTypes {
  const input = model.types
  // The cache holds the result for the default page rules; a caller with its own rules gets a fresh one.
  if (pageRules === undefined) {
    const cached = input === undefined ? builtIn : resolved.get(input)
    if (cached) {
      checkSections(cached, model.sections)
      return cached
    }
  }
  const result = build(input ?? {}, pageRules)
  checkSections(result, model.sections)
  if (pageRules === undefined) {
    if (input === undefined) builtIn = result
    else resolved.set(input, result)
  }
  return result
}

function build(input: ContentTypes, pageRules: { rename: boolean; delete: boolean } | undefined): ResolvedTypes {
  if (typeof input !== 'object' || input === null) throw new TypesError('`types` must be an object of types by id.')
  const home: SingleType = {
    kind: 'single',
    id: HOME_TYPE,
    label: 'Home',
    path: '/',
    slug: HOME_SLUG,
    key: `${PAGES_DIR}/${HOME_SLUG}.json`,
    fields: null,
    sections: null,
    builtIn: true,
  }
  const notFound: SingleType = {
    kind: 'single',
    id: NOT_FOUND_TYPE,
    label: '404',
    path: `/${NOT_FOUND_SLUG}`,
    slug: NOT_FOUND_SLUG,
    key: `${PAGES_DIR}/${NOT_FOUND_SLUG}.json`,
    fields: null,
    sections: null,
    builtIn: true,
  }

  const pagesOptions = Object.hasOwn(input, PAGES_TYPE) ? (input[PAGES_TYPE] as TypeOptions) : {}
  if ((pagesOptions as { kind?: string }).kind === 'single') {
    throw new TypesError(`types.${PAGES_TYPE}: the built-in pages type has many entries. Give the single another id.`)
  }
  checkOptions(`types.${PAGES_TYPE}`, pagesOptions)
  if (pagesOptions.path !== undefined && pagesOptions.path !== PAGES_PATH) {
    throw new TypesError(
      `types.${PAGES_TYPE}: the built-in pages type is always at "${PAGES_PATH}". Remove path, or add another type for "${pagesOptions.path}".`,
    )
  }
  if (pagesOptions.listing !== undefined && pagesOptions.listing !== false) {
    throw new TypesError(`types.${PAGES_TYPE}: the built-in pages type has no listing page. Add another type for a list of entries.`)
  }
  const pages: MultiType = {
    kind: 'multi',
    id: PAGES_TYPE,
    label: pagesOptions.label ?? 'Pages',
    prefix: '',
    dir: PAGES_DIR,
    fields: pagesOptions.fields ?? null,
    sections: pagesOptions.sections ?? null,
    sort: resolveSort(`types.${PAGES_TYPE}`, pagesOptions, null),
    listing: null,
    rename: pagesOptions.rename ?? pageRules?.rename ?? true,
    delete: pagesOptions.delete ?? pageRules?.delete ?? true,
  }

  const all: MultiType[] = [pages]
  const singles: SingleType[] = [home, notFound]
  /** Root address segment to what holds it, for the collision message. */
  const taken = new Map<string, string>()
  for (const [id, options] of Object.entries(input)) {
    if (id === PAGES_TYPE) continue
    const where = `types.${id}`
    if (!ID.test(id)) throw new TypesError(`the type id "${id}" must be lowercase kebab-case.`)
    if (RESERVED_IDS.has(id)) {
      const builtInNote = id === HOME_TYPE || id === NOT_FOUND_TYPE ? ' It is built in and has no options.' : ''
      throw new TypesError(`"${id}" cannot be a type id.${builtInNote}`)
    }
    if (options.kind === 'single') {
      const segment = checkSingle(where, options)
      claim(taken, segment, `the single "${id}"`, where)
      singles.push({
        kind: 'single',
        id,
        label: options.label ?? defaultLabel(id),
        path: `/${segment}`,
        slug: segment,
        key: `${SINGLES_DIR}/${id}.json`,
        fields: options.fields ?? null,
        sections: options.sections ?? null,
        builtIn: false,
      })
      continue
    }
    checkOptions(where, options)
    const path = options.path ?? `/${id}/{slug}`
    const match = PATH.exec(path)
    if (!match) throw new TypesError(`${where}: path must look like "/blog/{slug}" (one segment, then {slug}), got "${path}".`)
    const prefix = match[1] as string
    claim(taken, prefix, `the entries of "${id}"`, where)
    const listing = options.listing === undefined || options.listing === false ? null : options.listing
    const listingSlug = listing?.slug ?? prefix
    // A listing at its own type's prefix is the usual case (`/blog` lists `/blog/<slug>`), not a collision.
    if (listing && listingSlug !== prefix) claim(taken, listingSlug, `the listing of "${id}"`, where)
    all.push({
      kind: 'multi',
      id,
      label: options.label ?? defaultLabel(id),
      prefix,
      dir: id,
      fields: options.fields ?? null,
      sections: options.sections ?? null,
      sort: resolveSort(where, options, { by: 'title', order: 'asc' }),
      listing: listing ? { slug: listingSlug, perPage: listing.perPage ?? DEFAULT_PER_PAGE } : null,
      rename: options.rename ?? true,
      delete: options.delete ?? true,
    })
  }

  const byId = new Map<string, ContentType>([...singles, ...all].map((type) => [type.id, type] as const))
  return { home, notFound, singles, pages, multi: all, get: (id) => byId.get(id) }
}

function claim(taken: Map<string, string>, segment: string, what: string, where: string): void {
  if (RESERVED_SEGMENTS.has(segment)) throw new TypesError(`${where}: "/${segment}" is the address of a built-in page.`)
  const holder = taken.get(segment)
  if (holder !== undefined) throw new TypesError(`${where}: "/${segment}" is already the address of ${holder}.`)
  taken.set(segment, what)
}

function checkSections(types: ResolvedTypes, registry: SectionRegistry | undefined): void {
  if (registry === undefined) return
  for (const type of [...types.singles, ...types.multi]) {
    for (const name of type.sections ?? []) {
      if (!Object.hasOwn(registry, name)) {
        throw new TypesError(
          `types.${type.id}: sections names "${name}", which the site does not define. Known: ${Object.keys(registry).join(', ')}.`,
        )
      }
    }
  }
}

/** Store key of the entry `slug` of a multi type. The slug must already be validated. */
export function entryKey(type: MultiType, slug: string): string {
  return `${type.dir}/${slug}.json`
}

/** Store key of a type's listing page document. */
export function listingKey(type: MultiType): string {
  return `${type.dir}/${LISTING_FILE}`
}

/**
 * The slugs an entry of `type` cannot take, because the address belongs to something else: a page cannot be named
 * like another type's prefix or a listing, and an entry cannot be `page` when the listing's page numbers live there.
 * The home and 404 slugs are reserved in `pages`, where their documents are stored.
 */
export function reservedSlugs(types: ResolvedTypes, type: MultiType): ReadonlySet<string> {
  const reserved = new Set<string>()
  if (type.id === PAGES_TYPE) {
    reserved.add(HOME_SLUG)
    reserved.add(NOT_FOUND_SLUG)
    for (const other of types.multi) {
      if (other.prefix !== '') reserved.add(other.prefix)
      if (other.listing) reserved.add(other.listing.slug)
    }
    for (const other of types.singles) reserved.add(other.slug)
  } else if (type.listing && type.listing.slug === type.prefix) {
    reserved.add(PAGINATION_SEGMENT)
  }
  return reserved
}

/** The address of an entry: `/about`, `/blog/first-post`. */
export function entryPath(type: MultiType, slug: string): string {
  return type.prefix === '' ? `/${slug}` : `/${type.prefix}/${slug}`
}

/** An entry: a page plus, when its type declares them, `fields`. */
export interface Entry<TSection extends BaseSection = BaseSection> extends Page<TSection> {
  fields?: Record<string, unknown>
}

/** The document of a listing page: what is shown above the list, and its SEO. It has no slug; the type's config owns the address. */
export interface ListingDocument<TSection extends BaseSection = BaseSection> {
  title: string
  seo: Seo
  sections: TSection[]
}

export interface EntrySchemaOptions {
  /** Keep sections of a type the site no longer defines, for the editor. The build stays strict. */
  tolerateOrphans?: boolean
}

function sectionList(registry: SectionRegistry, type: ContentType | null, tolerant: boolean) {
  const section = tolerant ? createTolerantSectionSchema(registry) : createSectionSchema(registry)
  const allowed = type?.sections ?? null
  return z.array(section).superRefine((sections, ctx) => {
    addSectionIdentityIssues(sections, ctx)
    if (allowed === null) return
    sections.forEach((item, index) => {
      const name = (item as { type?: unknown }).type
      // A type the site dropped is the orphan rule's business, not this one's.
      if (typeof name !== 'string' || !Object.hasOwn(registry, name) || allowed.includes(name)) return
      ctx.addIssue({
        code: 'custom',
        message: `Section type "${name}" is not allowed in ${type?.label ?? 'this type'}. Allowed: ${allowed.join(', ')}.`,
        path: [index, 'type'],
      })
    })
  })
}

const entrySchemas = new WeakMap<ContentType, WeakMap<SectionRegistry, [strict?: z.ZodType, tolerant?: z.ZodType]>>()

/**
 * Validates an entry of `type`: the page fields, each section against the registry and the type's allowed list, and
 * `fields` against the type's own schema. For a type with neither fields nor a section list this is the page schema
 * itself, so the built-in `pages` type validates exactly as pages always have.
 */
export function createEntrySchema(registry: SectionRegistry, type: ContentType, options: EntrySchemaOptions = {}): z.ZodType<Entry> {
  const tolerant = options.tolerateOrphans === true
  if (type.fields === null && type.sections === null) {
    return (tolerant ? createTolerantPageSchema(registry) : createPageSchema(registry)) as z.ZodType<Entry>
  }
  let perRegistry = entrySchemas.get(type)
  if (!perRegistry) {
    perRegistry = new WeakMap()
    entrySchemas.set(type, perRegistry)
  }
  let pair = perRegistry.get(registry)
  if (!pair) {
    pair = []
    perRegistry.set(registry, pair)
  }
  const index = tolerant ? 1 : 0
  const cached = pair[index]
  if (cached) return cached as z.ZodType<Entry>
  const schema = z
    .object({
      slug: slugSchema,
      title: textSchema,
      seo: seoSchema,
      sections: sectionList(registry, type, tolerant),
      ...(type.fields ? { fields: type.fields } : {}),
    })
    .strict()
  pair[index] = schema
  return schema as unknown as z.ZodType<Entry>
}

const listingSchemas = new WeakMap<SectionRegistry, [strict?: z.ZodType, tolerant?: z.ZodType]>()

/** Validates a listing page document. Its sections may be any the site defines: the type's list limits entries only. */
export function createListingSchema(registry: SectionRegistry, options: EntrySchemaOptions = {}): z.ZodType<ListingDocument> {
  const tolerant = options.tolerateOrphans === true
  let pair = listingSchemas.get(registry)
  if (!pair) {
    pair = []
    listingSchemas.set(registry, pair)
  }
  const index = tolerant ? 1 : 0
  const cached = pair[index]
  if (cached) return cached as z.ZodType<ListingDocument>
  const schema = z.object({ title: textSchema, seo: seoSchema, sections: sectionList(registry, null, tolerant) }).strict()
  pair[index] = schema
  return schema as unknown as z.ZodType<ListingDocument>
}

type Sortable = { slug: string; title: string; fields?: Record<string, unknown> }

function rank(left: unknown, right: unknown, collator: Intl.Collator): number {
  if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime()
  if (typeof left === 'number' && typeof right === 'number') return left - right
  if (typeof left === 'boolean' && typeof right === 'boolean') return Number(left) - Number(right)
  return collator.compare(String(left), String(right))
}

/**
 * Orders entries by the type's sort rule. Equal values fall back to the slug, A to Z by code point, so the same
 * content gives the same order on every machine and pagination never shuffles between builds. Strings compare with
 * `Intl.Collator` in `locale` (default `en`, fixed so the build host's own locale has no say), numbers inside them
 * by value.
 */
export function sortEntries<TEntry extends Sortable>(type: MultiType, entries: readonly TEntry[], locale = 'en'): TEntry[] {
  const sort = type.sort
  if (sort === null) return [...entries]
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' })
  const direction = sort.order === 'desc' ? -1 : 1
  const value = (entry: TEntry): unknown => (sort.by === 'title' ? entry.title : entry.fields?.[sort.by])
  return [...entries].sort((left, right) => {
    const order = rank(value(left), value(right), collator) * direction
    if (order !== 0) return order
    return left.slug < right.slug ? -1 : left.slug > right.slug ? 1 : 0
  })
}

/** How many listing pages `count` entries need. A type with no entries still has page 1. */
export function listingPageCount(type: MultiType, count: number): number {
  if (!type.listing) return 0
  return Math.max(1, Math.ceil(count / type.listing.perPage))
}

/** The address of a listing page: `/blog`, `/blog/page/2`. */
export function listingPath(type: MultiType, page = 1): string {
  if (!type.listing) throw new TypesError(`types.${type.id} has no listing.`)
  return page <= 1 ? `/${type.listing.slug}` : `/${type.listing.slug}/${PAGINATION_SEGMENT}/${page}`
}
