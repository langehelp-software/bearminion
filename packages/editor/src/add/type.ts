import { z } from 'zod'
import { defineTypes, multi, single, type SingleOptions, type TypeOptions } from '../content-types.js'
import { imageSchema } from '../fields.js'

/*
 * `bearminion add type`: declares one content type. Each type is its own file in `src/lib/types/`, and
 * `src/lib/types/index.ts` gathers them into `siteTypes`, which the content model passes as `types`. Adding a type is
 * then a new file and one line in a small file this command wrote, never an edit inside a declaration someone may have
 * changed by hand. Everything here works on text and is pure, so the command and its tests share it.
 */

export const CONTENT_MODEL_PATH = 'src/lib/content-model.ts'
export const TYPES_DIR = 'src/lib/types'
export const TYPES_INDEX = `${TYPES_DIR}/index.ts`
export const TYPES_GUIDE = 'https://docs.bearminion.com/content-types/'

/** The kinds of field this command writes: one for each control the editor draws for a type's fields. */
export const FIELD_KINDS = ['text', 'long-text', 'date', 'number', 'switch', 'choice', 'image', 'list'] as const
export type FieldKind = (typeof FIELD_KINDS)[number]

export const FIELD_KIND_LABELS: Record<FieldKind, string> = {
  text: 'Text, one line',
  'long-text': 'Text, a paragraph',
  date: 'Date',
  number: 'Number',
  switch: 'Switch, on or off (off to start)',
  choice: 'Choice from a list',
  image: 'Image (always optional)',
  list: 'List of words, such as tags (empty to start)',
}

/** Kinds that always hold a value, so whether they are required is never asked. */
const ALWAYS_SET = new Set<FieldKind>(['switch', 'list'])
/** An image cannot be given a first value when an entry is created, so it is always optional. */
const NEVER_REQUIRED = new Set<FieldKind>(['image'])
/** Kinds whose values have an order. Lists and images do not. */
const SORTABLE = new Set<FieldKind>(['text', 'long-text', 'date', 'number', 'switch', 'choice'])
const DEFAULT_MAX: Partial<Record<FieldKind, number>> = { text: 120, 'long-text': 1000 }

export interface FieldSpec {
  /** camelCase: the key in the entry's `fields`. The editor shows `publishDate` as "Publish date". */
  name: string
  kind: FieldKind
  required: boolean
  /** The options of a `choice`. */
  choices?: string[]
  /** Longest text, for `text` and `long-text`. */
  max?: number
}

export interface TypeSpec {
  /** Lowercase kebab-case: `blog`, `case-studies`. Also the folder its entries are stored in. */
  id: string
  kind: 'multi' | 'single'
  /** `/blog/{slug}` for entries, `/about` for a single. */
  path: string
  label?: string
  fields: FieldSpec[]
  /** Entries only. Absent: by title, A to Z. */
  sort?: { by: string; order: 'asc' | 'desc' }
  /** Entries only: the listing page, or false for none. */
  listing: false | { perPage: number }
}

/** Types this command can write without asking anything. `add blog` is `add type` with the `blog` preset. */
export const PRESETS: Record<string, TypeSpec> = {
  blog: {
    id: 'blog',
    kind: 'multi',
    path: '/blog/{slug}',
    fields: [
      { name: 'date', kind: 'date', required: true },
      { name: 'excerpt', kind: 'long-text', required: false, max: 200 },
      { name: 'cover', kind: 'image', required: false },
      { name: 'draft', kind: 'switch', required: true },
    ],
    sort: { by: 'date', order: 'desc' },
    listing: { perPage: 10 },
  },
}

const FIELD_NAME = /^[a-z][a-zA-Z0-9]*$/
/** `title` is what a sort by title means; a field of that name could never be told apart from it. */
const RESERVED_FIELDS = new Set(['title'])

/** Why `name` cannot be a field name, or undefined when it can. */
export function fieldNameProblem(name: string, taken: readonly string[]): string | undefined {
  if (!FIELD_NAME.test(name))
    return `"${name}" must be camelCase letters and digits, starting with a letter: date, publishDate, readingTime.`
  if (RESERVED_FIELDS.has(name)) return `"${name}" is taken: every entry already has a title.`
  if (taken.includes(name)) return `There is already a field named "${name}".`
  return undefined
}

/** The field as the command writes it: an image is never required, a switch or a list always is. */
export function normalizeField(field: FieldSpec): FieldSpec {
  const required = ALWAYS_SET.has(field.kind) ? true : NEVER_REQUIRED.has(field.kind) ? false : field.required
  return { ...field, required }
}

/** Whether the field may be what entries are sorted by: a value every entry has, of a kind with an order. */
export function isSortable(field: FieldSpec): boolean {
  const normalized = normalizeField(field)
  return normalized.required && SORTABLE.has(normalized.kind)
}

/** `/news/{slug}` from `news`, `/news`, `news/{slug}` or `/news/{slug}`; `/about` from `about` or `/about`. */
export function normalizePath(kind: TypeSpec['kind'], input: string): string {
  const segment = input
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/\{slug\}$/, '')
    .replace(/\/+$/, '')
  return kind === 'multi' ? `/${segment}/{slug}` : `/${segment}`
}

export function defaultPath(kind: TypeSpec['kind'], id: string): string {
  return kind === 'multi' ? `/${id}/{slug}` : `/${id}`
}

/** `case-studies` → `caseStudies`; an id starting with a digit gets `type` in front, so it is a valid name. */
export function variableName(id: string): string {
  const camel = id.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase())
  return /^[0-9]/.test(camel) ? `type${camel.charAt(0).toUpperCase()}${camel.slice(1)}` : camel
}

const quote = (value: string) => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`

function fieldExpression(field: FieldSpec): string {
  const max = field.max ?? DEFAULT_MAX[field.kind]
  const base: Record<FieldKind, string> = {
    text: `z.string().max(${max})`,
    'long-text': `z.string().max(${max})`,
    date: 'z.iso.date()',
    number: 'z.number()',
    switch: 'z.boolean().default(false)',
    choice: `z.enum([${(field.choices ?? []).map(quote).join(', ')}])`,
    image: 'imageSchema',
    list: 'z.array(z.string()).default([])',
  }
  return `${base[field.kind]}${field.required ? '' : '.optional()'}`
}

function fieldSchema(field: FieldSpec): z.ZodType {
  const max = field.max ?? DEFAULT_MAX[field.kind] ?? 0
  const base: Record<FieldKind, () => z.ZodType> = {
    text: () => z.string().max(max),
    'long-text': () => z.string().max(max),
    date: () => z.iso.date(),
    number: () => z.number(),
    switch: () => z.boolean().default(false),
    choice: () => z.enum((field.choices ?? []) as [string, ...string[]]),
    image: () => imageSchema,
    list: () => z.array(z.string()).default([]),
  }
  const schema = base[field.kind]()
  return field.required ? schema : schema.optional()
}

/** The options `spec` declares, with real schemas, as `multi()` and `single()` take them. */
function options(spec: TypeSpec): TypeOptions | SingleOptions {
  const fields =
    spec.fields.length > 0 ? z.object(Object.fromEntries(spec.fields.map((field) => [field.name, fieldSchema(field)]))) : undefined
  const shared = { ...(spec.label ? { label: spec.label } : {}), ...(fields ? { fields } : {}) }
  if (spec.kind === 'single') return single({ path: spec.path, ...shared })
  return multi({
    path: spec.path,
    ...shared,
    ...(spec.sort ? { sort: spec.sort } : {}),
    ...(spec.listing ? { listing: { perPage: spec.listing.perPage } } : {}),
  })
}

/**
 * Why `spec` would not make a working type, or undefined. The type is declared with the package's own `multi()`,
 * `single()` and `defineTypes()`, so the answer is the one `astro dev` would give. Other types of the site are not
 * known here: an address two types share is still caught by `astro dev`.
 */
export function specProblem(spec: TypeSpec): string | undefined {
  const names: string[] = []
  for (const field of spec.fields) {
    const problem = fieldNameProblem(field.name, names)
    if (problem) return problem
    names.push(field.name)
    if (field.kind === 'choice') {
      const choices = field.choices ?? []
      if (choices.length === 0) return `The choice "${field.name}" needs at least one option.`
      if (choices.some((choice) => choice.trim() === '')) return `The choice "${field.name}" has an empty option.`
      if (new Set(choices).size !== choices.length) return `The choice "${field.name}" lists an option twice.`
    }
  }
  if (spec.kind === 'single' && (spec.sort || spec.listing)) return 'A single has one document: it takes no sort and no listing.'
  try {
    defineTypes({ [spec.id]: options(spec) })
  } catch (error) {
    return error instanceof Error ? error.message.replace(/^Content types: /, '') : String(error)
  }
  return undefined
}

/** One line on what the type is, for the file's comment and the command's report. */
export function describeSpec(spec: TypeSpec): string {
  const label = spec.label ?? spec.id.charAt(0).toUpperCase() + spec.id.slice(1).replaceAll('-', ' ')
  if (spec.kind === 'single') return `${label}: one page at ${spec.path}.`
  const prefix = spec.path.replace('/{slug}', '')
  const sortField = spec.fields.find((field) => field.name === spec.sort?.by)
  const direction =
    sortField?.kind === 'date'
      ? { asc: 'oldest first', desc: 'newest first' }
      : sortField?.kind === 'number'
        ? { asc: 'lowest first', desc: 'highest first' }
        : { asc: 'A to Z', desc: 'Z to A' }
  const order = spec.sort ? `by ${spec.sort.by}, ${direction[spec.sort.order]}` : 'by title, A to Z'
  const listing = spec.listing ? `listed at ${prefix}, ${spec.listing.perPage} to a page` : 'no listing page'
  return `${label}: entries at ${prefix}/<slug>, ${listing}, ordered ${order}.`
}

/** `src/lib/types/<id>.ts`: the type, declared. */
export function typeFileSource(spec: TypeSpec): string {
  const fields = spec.fields.map(normalizeField)
  const fromBearminion = [
    spec.kind === 'single' ? 'single' : 'multi',
    ...(fields.some((field) => field.kind === 'image') ? ['imageSchema'] : []),
  ]
  const usesZod = fields.length > 0
  const lines = [`import { ${fromBearminion.sort((a, b) => a.localeCompare(b)).join(', ')} } from 'bearminion'`]
  if (usesZod) lines.push("import { z } from 'zod'")
  lines.push(
    '',
    '/**',
    ` * ${describeSpec(spec)}`,
    ' * Made by `npx bearminion add type`, and yours from here: add or change fields, and the editor draws a control for each.',
    ` * Guide: ${TYPES_GUIDE}`,
    ' */',
    `export const ${variableName(spec.id)} = ${spec.kind}({`,
    `  path: ${quote(spec.path)},`,
  )
  if (spec.label) lines.push(`  label: ${quote(spec.label)},`)
  if (fields.length > 0) {
    lines.push('  fields: z.object({')
    for (const field of fields) lines.push(`    ${field.name}: ${fieldExpression(field)},`)
    lines.push('  }),')
  }
  if (spec.kind === 'multi') {
    if (spec.sort) lines.push(`  sort: { by: ${quote(spec.sort.by)}, order: ${quote(spec.sort.order)} },`)
    if (spec.listing) lines.push(`  listing: { perPage: ${spec.listing.perPage} },`)
  }
  lines.push('})', '')
  return lines.join('\n')
}

const entryLine = (id: string) => {
  const name = variableName(id)
  return name === id ? `  ${id},` : `  ${quote(id)}: ${name},`
}
const importLine = (id: string) => `import { ${variableName(id)} } from './${id}'`

/** `src/lib/types/index.ts` for a site whose first type is `id`. */
export function typesIndexSource(id: string): string {
  return [
    "import { defineTypes } from 'bearminion'",
    importLine(id),
    '',
    '/**',
    " * The site's own content types, next to the built-in home page, 404 page and pages. `npx bearminion add type` adds a",
    ` * file to this folder and a line here. Guide: ${TYPES_GUIDE}`,
    ' */',
    'export const siteTypes = defineTypes({',
    entryLine(id),
    '})',
    '',
  ].join('\n')
}

export type IndexEdit =
  | { action: 'update'; source: string }
  /** The index already names the type. */
  | { action: 'present' }
  /** Not shaped like the file this command writes: the person adds the lines. */
  | { action: 'manual' }

const INDEX_BLOCK = /^export const siteTypes = defineTypes\(\{(\}\)|\n[\s\S]*?\n\}\))[ \t]*$/m

function afterLastImport(source: string, line: string): string {
  const imports = [...source.matchAll(/^import [^\n]*\n/gm)]
  const last = imports[imports.length - 1]
  const at = last ? (last.index ?? 0) + last[0].length : 0
  return `${source.slice(0, at)}${line}\n${source.slice(at)}`
}

/** `source` with `line` among its imports: before the first `./` import that sorts after it, as Biome orders them. */
function insertImport(source: string, line: string, id: string): string {
  const local = [...source.matchAll(/^import [^\n]* from '\.\/([^']+)'[^\n]*\n/gm)]
  const next = local.find((match) => (match[1] ?? '').localeCompare(id) > 0)
  if (next === undefined) return afterLastImport(source, line)
  const at = next.index ?? 0
  return `${source.slice(0, at)}${line}\n${source.slice(at)}`
}

/** The index with `id` added to `siteTypes`. */
export function registerType(source: string, id: string): IndexEdit {
  const name = variableName(id)
  if (source.includes(`from './${id}'`) || new RegExp(`^\\s*(?:${name}|'${id}'\\s*:[^\\n]*),\\s*$`, 'm').test(source)) {
    return { action: 'present' }
  }
  const block = INDEX_BLOCK.exec(source)
  if (!block) return { action: 'manual' }
  const body = block[1] === '})' ? '' : (block[1] ?? '').slice(0, -3)
  const replaced = `export const siteTypes = defineTypes({${body}\n${entryLine(id)}\n})`
  const next = source.slice(0, block.index) + replaced + source.slice(block.index + block[0].length)
  return { action: 'update', source: insertImport(next, importLine(id), id) }
}

export type ModelEdit =
  | { action: 'link'; source: string }
  /** The content model already passes `siteTypes`. */
  | { action: 'linked' }
  /** The content model declares `types` some other way: the person joins the two. */
  | { action: 'other' }
  /** Not shaped like the starter's content model: the person adds the lines. */
  | { action: 'manual' }

const SITE_LINE = /^([ \t]*)site: siteDefinition,[ \t]*$/m

/** The content model with `types: siteTypes` passed, or why it was left as it is. */
export function linkContentModel(source: string): ModelEdit {
  if (/^\s*types\s*:\s*siteTypes\s*,?\s*$/m.test(source)) return { action: 'linked' }
  if (/^\s*types\s*:/m.test(source)) return { action: 'other' }
  const site = SITE_LINE.exec(source)
  if (!site || !/^import /m.test(source)) return { action: 'manual' }
  const next = source.replace(SITE_LINE, (line) => `${line}\n${site[1] ?? '  '}types: siteTypes,`)
  return { action: 'link', source: afterLastImport(next, "import { siteTypes } from './types'") }
}

/** What the person does by hand when a file was left alone. */
export function manualSteps(index: IndexEdit['action'] | 'create', model: ModelEdit['action'], id: string): string[] {
  const lines: string[] = []
  if (index === 'manual') {
    lines.push(
      `${TYPES_INDEX} is not shaped like the one this command writes, so it was left as it is. Add the type to it:`,
      '',
      `  ${importLine(id)}`,
      `  ${entryLine(id).trim()}   (inside defineTypes({ ... }))`,
      '',
    )
  }
  if (model === 'other') {
    lines.push(
      `${CONTENT_MODEL_PATH} already declares types, so it was left as it is. Pass the ones in ${TYPES_DIR} too:`,
      '',
      "  import { siteTypes } from './types'",
      '  types: defineTypes({ ...siteTypes, /* the types declared here */ }),',
      '',
    )
  }
  if (model === 'manual') {
    lines.push(
      `${CONTENT_MODEL_PATH} is not shaped like the starter's, so it was left as it is. Pass the types to your content model:`,
      '',
      "  import { siteTypes } from './types'",
      '  types: siteTypes,',
      '',
    )
  }
  return lines
}

/** What comes next once the type is declared. */
export function typeNextSteps(spec: TypeSpec): string[] {
  const label = spec.label ?? spec.id.charAt(0).toUpperCase() + spec.id.slice(1).replaceAll('-', ' ')
  const where = spec.kind === 'single' ? `Pages > ${label}` : `Pages > ${label} > New entry`
  const lines = [`Next: start the site, open the editor, and find it under ${where}.`]
  if (spec.kind === 'multi' && spec.listing) {
    lines.push(`Link to ${spec.path.replace('/{slug}', '')} from the header (Navigation tab) when there is something to read.`)
  }
  if (spec.fields.some((field) => !['date', 'excerpt', 'cover', 'draft'].includes(field.name)) && spec.kind === 'multi' && spec.listing) {
    lines.push(
      "The listing shows each entry's title, date, excerpt and cover. For other fields, change src/components/organisms/EntryList.astro.",
    )
  }
  lines.push(`To change the type later, edit ${TYPES_DIR}/${spec.id}.ts. More: ${TYPES_GUIDE}`)
  return lines
}
