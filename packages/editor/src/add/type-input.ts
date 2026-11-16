import fs from 'node:fs'
import path from 'node:path'
import {
  defaultPath,
  FIELD_KIND_LABELS,
  FIELD_KINDS,
  type FieldKind,
  type FieldSpec,
  fieldNameProblem,
  isSortable,
  normalizeField,
  normalizePath,
  specProblem,
  TYPES_DIR,
  type TypeSpec,
} from './type.js'

/*
 * Where the type `add type` declares comes from: flags, for scripts and assistants, or questions in a terminal. Both
 * end in the same `TypeSpec`, checked by `specProblem`.
 */

export interface Prompter {
  log: (line: string) => void
  ask?: (question: string, initial?: string) => Promise<string>
  confirm?: (question: string) => Promise<boolean>
  choose?: (question: string, options: ReadonlyArray<{ value: string; label: string }>) => Promise<string | undefined>
}

export interface TypeFlags {
  kind?: string | undefined
  path?: string | undefined
  label?: string | undefined
  field?: string[] | undefined
  sort?: string | undefined
  listing?: string | undefined
}

export const DEFAULT_PER_PAGE = 10

/** True when the flags say what the type is, so nothing about its shape is asked. */
export function hasShapeFlags(flags: TypeFlags): boolean {
  return (
    [flags.kind, flags.path, flags.label, flags.sort, flags.listing].some((value) => value !== undefined) || (flags.field?.length ?? 0) > 0
  )
}

const FIELD_FLAG = /^([^:?=]+)(\?)?:([a-z-]+)(?:=(.*))?$/

/** `date:date`, `excerpt?:long-text`, `level:choice=easy|medium|hard`. A `?` after the name makes the field optional. */
export function parseFieldFlag(text: string): FieldSpec | string {
  const match = FIELD_FLAG.exec(text.trim())
  if (!match) return `--field "${text}" should look like name:kind, name?:kind for an optional field, or name:choice=a|b|c.`
  const [, name = '', optional, kind = '', rest] = match
  if (!(FIELD_KINDS as readonly string[]).includes(kind)) return `--field "${text}": the kind must be one of ${FIELD_KINDS.join(', ')}.`
  if (kind === 'choice') {
    const choices = (rest ?? '').split('|').map((choice) => choice.trim())
    return normalizeField({ name, kind, required: optional === undefined, choices })
  }
  if (rest !== undefined) return `--field "${text}": only a choice takes options after =.`
  return normalizeField({ name, kind: kind as FieldKind, required: optional === undefined })
}

/** The type the flags describe. Missing flags take the defaults: entries, at /<id>/<slug>, with a listing page. */
export function specFromFlags(id: string, flags: TypeFlags): TypeSpec | string {
  const kind = flags.kind ?? 'multi'
  if (kind !== 'multi' && kind !== 'single') return '--kind must be multi (many entries) or single (one page).'
  const fields: FieldSpec[] = []
  for (const text of flags.field ?? []) {
    const field = parseFieldFlag(text)
    if (typeof field === 'string') return field
    fields.push(field)
  }
  const spec: TypeSpec = {
    id,
    kind,
    path: flags.path === undefined ? defaultPath(kind, id) : normalizePath(kind, flags.path),
    ...(flags.label ? { label: flags.label } : {}),
    fields,
    listing: false,
  }
  if (kind === 'single') {
    if (flags.sort !== undefined || flags.listing !== undefined) return 'A single has one page: --sort and --listing are for --kind multi.'
    return spec
  }
  const listing = flags.listing ?? String(DEFAULT_PER_PAGE)
  if (listing !== 'none') {
    const perPage = Number(listing)
    if (!Number.isInteger(perPage)) return '--listing takes the number of entries on a listing page, or none.'
    spec.listing = { perPage }
  }
  if (flags.sort !== undefined) {
    const [by = '', order = 'asc'] = flags.sort.split(':')
    if (order !== 'asc' && order !== 'desc') return '--sort takes a field and an order: date:desc, title:asc.'
    spec.sort = { by, order }
  }
  return spec
}

/** Why `id` cannot be a new type of the site at `root`, or undefined. */
export function idProblem(root: string, id: string): string | undefined {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return `The type id "${id}" must be lowercase kebab-case: news, case-studies.`
  const file = `${TYPES_DIR}/${id}.ts`
  const problem = specProblem({ id, kind: 'single', path: `/${id}`, fields: [], listing: false })
  if (problem) return problem
  if (fs.existsSync(path.join(root, file))) return `${file} already exists. Edit it to change that type.`
  return undefined
}

/** Where pages are stored, as the starter keeps them. A site that moved its content keeps the check in `astro dev`. */
const PAGES_STORE = 'content/pages'

/**
 * Why the type's address is already taken in the site at `root`, or undefined: by a page (`/about` and
 * `content/pages/about.json`), or by another type in src/lib/types. `astro dev` would stop on both.
 */
export function addressProblem(root: string, spec: TypeSpec): string | undefined {
  const segment = spec.path.split('/')[1] ?? ''
  const page = `${PAGES_STORE}/${segment}.json`
  if (fs.existsSync(path.join(root, page))) {
    return `/${segment} is already a page (${page}). Pick another address, or rename that page first.`
  }
  const dir = path.join(root, TYPES_DIR)
  if (!fs.existsSync(dir)) return undefined
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.ts') || name === 'index.ts' || name === `${spec.id}.ts`) continue
    const declared = /^\s*path:\s*'\/([a-z0-9-]+)/m.exec(fs.readFileSync(path.join(dir, name), 'utf8'))?.[1]
    if (declared === segment) return `/${segment} is already the address of the type in ${TYPES_DIR}/${name}. Pick another address.`
  }
  return undefined
}

/** Asks until `check` passes. An empty answer with no default gives up. */
async function askUntil(io: Prompter, question: string, initial: string | undefined, check: (answer: string) => string | undefined) {
  const ask = io.ask
  if (!ask) return undefined
  for (;;) {
    const answer = (await ask(question, initial)).trim()
    if (answer === '') return undefined
    const problem = check(answer)
    if (problem === undefined) return answer
    io.log(problem)
  }
}

async function askField(io: Prompter, taken: readonly string[]): Promise<FieldSpec | undefined> {
  const name = await askUntil(io, 'Field name, camelCase (Enter to stop):', undefined, (answer) => fieldNameProblem(answer, taken))
  if (name === undefined || !io.choose) return undefined
  const kind = (await io.choose(
    `What kind of field is ${name}?`,
    FIELD_KINDS.map((value) => ({ value, label: FIELD_KIND_LABELS[value] })),
  )) as FieldKind | undefined
  if (kind === undefined) return undefined
  let choices: string[] | undefined
  if (kind === 'choice') {
    const answer = await askUntil(io, 'Its options, separated by commas:', undefined, (text) => {
      const list = text.split(',').map((choice) => choice.trim())
      if (list.some((choice) => choice === '')) return 'An option is empty. Try again, like: draft, review, done.'
      return new Set(list).size === list.length ? undefined : 'An option is there twice.'
    })
    if (answer === undefined) return undefined
    choices = answer.split(',').map((choice) => choice.trim())
  }
  const asked = normalizeField({ name, kind, required: true })
  const fixed = asked.kind === 'switch' || asked.kind === 'list' || asked.kind === 'image'
  const required = fixed ? asked.required : io.confirm ? await io.confirm(`Must every entry have ${name}?`) : false
  return normalizeField({ name, kind, required, ...(choices ? { choices } : {}) })
}

/** Asks for the type in a terminal. Undefined when there is no terminal or the person stopped. */
export async function askSpec(io: Prompter, root: string, givenId: string | undefined): Promise<TypeSpec | undefined> {
  if (!io.ask || !io.confirm || !io.choose) return undefined
  const id = givenId ?? (await askUntil(io, 'Type id, lowercase (news, case-studies):', undefined, (answer) => idProblem(root, answer)))
  if (id === undefined) return undefined

  const kind = ((await io.choose('What is it?', [
    { value: 'multi', label: 'Many entries, like posts, projects or events' },
    { value: 'single', label: 'One page at a fixed address, like About, that nobody renames or deletes' },
  ])) ?? 'multi') as TypeSpec['kind']

  const shape = kind === 'multi' ? 'the start of each entry address' : 'its address'
  const pathAnswer = await askUntil(io, `Address, ${shape}:`, defaultPath(kind, id), (answer) => {
    const candidate: TypeSpec = { id, kind, path: normalizePath(kind, answer), fields: [], listing: false }
    return specProblem(candidate) ?? addressProblem(root, candidate)
  })
  const spec: TypeSpec = { id, kind, path: normalizePath(kind, pathAnswer ?? defaultPath(kind, id)), fields: [], listing: false }

  io.log('Every entry already has a title, SEO and sections. Add the fields it needs besides those.')
  while (await io.confirm(spec.fields.length === 0 ? 'Add a field?' : 'Add another field?')) {
    const field = await askField(
      io,
      spec.fields.map((existing) => existing.name),
    )
    if (field === undefined) break
    spec.fields.push(field)
  }

  if (kind === 'single') return spec
  const prefix = spec.path.replace('/{slug}', '')
  if (await io.confirm(`A listing page at ${prefix}, with pages of entries?`)) {
    const perPage = await askUntil(io, 'Entries on one listing page:', String(DEFAULT_PER_PAGE), (answer) =>
      /^\d+$/.test(answer) && Number(answer) >= 1 && Number(answer) <= 100 ? undefined : 'A whole number from 1 to 100.',
    )
    spec.listing = { perPage: Number(perPage ?? DEFAULT_PER_PAGE) }
  }
  const sortable = spec.fields.filter(isSortable)
  if (sortable.length > 0) {
    const options = [
      { value: 'title:asc', label: 'Title, A to Z' },
      ...sortable.flatMap((field) =>
        field.kind === 'date'
          ? [
              { value: `${field.name}:desc`, label: `${field.name}, newest first` },
              { value: `${field.name}:asc`, label: `${field.name}, oldest first` },
            ]
          : [
              { value: `${field.name}:asc`, label: `${field.name}, A to Z or lowest first` },
              { value: `${field.name}:desc`, label: `${field.name}, Z to A or highest first` },
            ],
      ),
    ]
    const picked = await io.choose('Order entries by:', options)
    if (picked !== undefined && picked !== 'title:asc') {
      const [by = 'title', order = 'asc'] = picked.split(':')
      spec.sort = { by, order: order as 'asc' | 'desc' }
    }
  }
  return spec
}
