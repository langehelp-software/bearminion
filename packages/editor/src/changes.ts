/**
 * A readable list of what differs between the saved files and the draft, for the "Unsaved" review dialog.
 * Pure: it only compares two JSON documents.
 */

export type ChangeKind = 'added' | 'removed' | 'changed'

export interface ChangeEntry {
  /** Group heading in the dialog: "Page", "Hero · #intro", "Header"... */
  area: string
  /** Human label of the field, or a sentence for structural changes. */
  field: string
  kind: ChangeKind
  before?: string
  after?: string
}

type Json = unknown
type Sections = { id: string; type: string; anchor?: string }[]

const SITE_AREAS: Record<string, string> = {
  name: 'Brand',
  nameMarks: 'Brand',
  brandLogo: 'Brand',
  favicon: 'Brand',
  logo: 'Brand',
  header: 'Header',
  footer: 'Footer',
  theme: 'Design',
}

const MAX_VALUE = 48

function isRecord(value: Json): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Every leaf of a document keyed by its dot path. Empty objects and arrays count as leaves. */
function leaves(value: Json, prefix: string, out: Map<string, string>): Map<string, string> {
  if (Array.isArray(value) && value.length > 0) {
    for (const [index, item] of value.entries()) leaves(item, prefix ? `${prefix}.${index}` : String(index), out)
  } else if (isRecord(value) && Object.keys(value).length > 0) {
    for (const [key, item] of Object.entries(value)) leaves(item, prefix ? `${prefix}.${key}` : key, out)
  } else if (value !== undefined) {
    out.set(prefix, Array.isArray(value) ? '[]' : isRecord(value) ? '{}' : typeof value === 'string' ? value : JSON.stringify(value))
  }
  return out
}

function shorten(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim()
  if (flat === '') return 'empty'
  return flat.length > MAX_VALUE ? `${flat.slice(0, MAX_VALUE - 1)}…` : flat
}

function words(segment: string): string {
  return segment
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .toLowerCase()
}

/** `props.plans.1.cta.label` → `plans › #2 › cta › label`. */
export function fieldLabel(path: string): string {
  return path
    .split('.')
    .filter((segment, index) => !(index === 0 && segment === 'props'))
    .map((segment) => (/^\d+$/.test(segment) ? `#${Number(segment) + 1}` : words(segment)))
    .join(' › ')
}

function compare(
  before: Map<string, string>,
  after: Map<string, string>,
): { path: string; kind: ChangeKind; before?: string; after?: string }[] {
  const paths = [...new Set([...before.keys(), ...after.keys()])]
  const result: { path: string; kind: ChangeKind; before?: string; after?: string }[] = []
  for (const path of paths) {
    const a = before.get(path)
    const b = after.get(path)
    if (a === b) continue
    if (a === undefined) result.push({ path, kind: 'added', after: b })
    else if (b === undefined) result.push({ path, kind: 'removed', before: a })
    else result.push({ path, kind: 'changed', before: a, after: b })
  }
  return result
}

function entry(area: string, path: string, change: { kind: ChangeKind; before?: string; after?: string }): ChangeEntry {
  return {
    area,
    field: fieldLabel(path),
    kind: change.kind,
    ...(change.before === undefined ? {} : { before: shorten(change.before) }),
    ...(change.after === undefined ? {} : { after: shorten(change.after) }),
  }
}

function sectionsOf(page: Json): Sections {
  if (!isRecord(page) || !Array.isArray(page.sections)) return []
  return page.sections.filter(isRecord).map((section) => ({
    id: String(section.id),
    type: String(section.type),
    ...(typeof section.anchor === 'string' ? { anchor: section.anchor } : {}),
  }))
}

function sectionName(section: { type: string; anchor?: string }, labels: Record<string, string>): string {
  const label = labels[section.type] ?? section.type
  return section.anchor ? `${label} · #${section.anchor}` : label
}

/** Differences in a page file: its own fields, then each section. */
export function describePageChanges(saved: Json, draft: Json, labels: Record<string, string> = {}): ChangeEntry[] {
  const entries: ChangeEntry[] = []
  const savedRest = isRecord(saved) ? { ...saved, sections: undefined } : {}
  const draftRest = isRecord(draft) ? { ...draft, sections: undefined } : {}
  for (const change of compare(leaves(savedRest, '', new Map()), leaves(draftRest, '', new Map()))) {
    entries.push(entry('Page', change.path, change))
  }

  const before = sectionsOf(saved)
  const after = sectionsOf(draft)
  const beforeIds = new Set(before.map((section) => section.id))
  const afterIds = new Set(after.map((section) => section.id))
  for (const section of after) {
    if (!beforeIds.has(section.id)) entries.push({ area: 'Sections', field: `${sectionName(section, labels)} added`, kind: 'added' })
  }
  for (const section of before) {
    if (!afterIds.has(section.id)) entries.push({ area: 'Sections', field: `${sectionName(section, labels)} removed`, kind: 'removed' })
  }
  const keptBefore = before.filter((section) => afterIds.has(section.id)).map((section) => section.id)
  const keptAfter = after.filter((section) => beforeIds.has(section.id)).map((section) => section.id)
  if (keptBefore.join('|') !== keptAfter.join('|')) {
    entries.push({ area: 'Sections', field: 'Order changed', kind: 'changed' })
  }

  const savedSections = isRecord(saved) && Array.isArray(saved.sections) ? saved.sections.filter(isRecord) : []
  const draftSections = isRecord(draft) && Array.isArray(draft.sections) ? draft.sections.filter(isRecord) : []
  for (const next of draftSections) {
    const previous = savedSections.find((item) => item.id === next.id)
    if (!previous) continue
    const area = sectionName({ type: String(next.type), ...(typeof next.anchor === 'string' ? { anchor: next.anchor } : {}) }, labels)
    for (const change of compare(leaves(previous, '', new Map()), leaves(next, '', new Map()))) {
      if (change.path === 'id') continue
      entries.push(entry(area, change.path, change))
    }
  }
  return entries
}

/** Differences in `site.json`, grouped as Brand, Header, Footer, Design and Site. */
export function describeSiteChanges(saved: Json, draft: Json): ChangeEntry[] {
  return compare(leaves(saved ?? {}, '', new Map()), leaves(draft ?? {}, '', new Map())).map((change) => {
    const [top = '', ...rest] = change.path.split('.')
    // The area heading already says "Header", "Footer" or "Design", so the label starts below it.
    const path = (top === 'header' || top === 'footer' || top === 'theme') && rest.length > 0 ? rest.join('.') : change.path
    return entry(SITE_AREAS[top] ?? 'Site', path, change)
  })
}

/** Entries grouped by area, keeping the order areas first appear in. */
export function groupChanges(entries: ChangeEntry[]): { area: string; entries: ChangeEntry[] }[] {
  const groups = new Map<string, ChangeEntry[]>()
  for (const item of entries) {
    const list = groups.get(item.area)
    if (list) list.push(item)
    else groups.set(item.area, [item])
  }
  return [...groups].map(([area, list]) => ({ area, entries: list }))
}

/* ---------- a version's changes, for the History screen ---------- */

/** One changed value: a readable label, the raw path for whoever needs to match it, and the values. */
export interface DiffRow {
  /** "Hero · main button link". */
  label: string
  /** "#intro › primary › href". */
  path: string
  kind: ChangeKind
  /** What the value is, for the summary. */
  is: 'link' | 'image' | 'field'
  before?: string
  after?: string
}

export interface DocumentDiff {
  sectionsAdded: string[]
  sectionsRemoved: string[]
  reordered: boolean
  rows: DiffRow[]
  /** "1 section added · 5 removed · 1 link changed". Empty when nothing differs. */
  summary: string
}

const LONG_VALUE = 280

/** Two-segment names first (`primary.href`), then one segment (`heading`). Anything else is shown by its key. */
const FIELD_NAMES_2: Record<string, string> = {
  'primary.href': 'main button link',
  'primary.label': 'main button text',
  'secondary.href': 'second button link',
  'secondary.label': 'second button text',
  'cta.href': 'button link',
  'cta.label': 'button text',
  'link.href': 'link',
  'link.label': 'link text',
  'image.src': 'image',
  'image.alt': 'image description',
  'image.fit': 'image fit',
  'image.position': 'image position',
  'seo.title': 'SEO title',
  'seo.description': 'SEO description',
  'seo.ogImage': 'social preview image',
  'seo.noindex': 'hidden from search',
  'seo.nofollow': 'links not followed',
  'brandLogo.src': 'logo',
  'favicon.src': 'favicon',
}

const FIELD_NAMES_1: Record<string, string> = {
  href: 'link',
  url: 'link',
  label: 'text',
  heading: 'heading',
  subheading: 'subheading',
  eyebrow: 'eyebrow',
  body: 'text',
  text: 'text',
  title: 'title',
  description: 'description',
  variant: 'layout',
  tone: 'colour',
  anchor: 'anchor',
  src: 'image',
  alt: 'image description',
  name: 'name',
  slug: 'address',
}

/** `items.1.cta.href` → `item 2 › button link`. */
export function fieldName(path: string): string {
  const segments = path.split('.').filter((segment, index) => !(index === 0 && segment === 'props'))
  const last2 = segments.slice(-2).join('.')
  const last = segments.at(-1) ?? ''
  let name: string
  let rest: string[]
  if (segments.length >= 2 && FIELD_NAMES_2[last2]) {
    name = FIELD_NAMES_2[last2]
    rest = segments.slice(0, -2)
  } else {
    name = FIELD_NAMES_1[last] ?? words(last)
    rest = segments.slice(0, -1)
  }
  const context: string[] = []
  for (const segment of rest) {
    if (/^\d+$/.test(segment)) {
      const previous = context.pop()
      const noun = previous && previous.length > 3 && previous.endsWith('s') ? previous.slice(0, -1) : (previous ?? 'item')
      context.push(`${noun} ${Number(segment) + 1}`)
    } else context.push(words(segment))
  }
  return [...context, name].join(' › ')
}

function rowKind(path: string): DiffRow['is'] {
  const last = path.split('.').at(-1) ?? ''
  if (last === 'href' || last === 'url') return 'link'
  if (last === 'src' || last === 'ogImage' || last === 'favicon') return 'image'
  return 'field'
}

function longValue(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim()
  if (flat === '') return 'empty'
  return flat.length > LONG_VALUE ? `${flat.slice(0, LONG_VALUE - 1)}…` : flat
}

function diffRow(area: string, rawPrefix: string, path: string, change: { kind: ChangeKind; before?: string; after?: string }): DiffRow {
  const raw = fieldLabel(path)
  return {
    label: area ? `${area} · ${fieldName(path)}` : fieldName(path).replace(/^./, (first) => first.toUpperCase()),
    path: rawPrefix ? `${rawPrefix} › ${raw}` : raw,
    kind: change.kind,
    is: rowKind(path),
    ...(change.before === undefined ? {} : { before: longValue(change.before) }),
    ...(change.after === undefined ? {} : { after: longValue(change.after) }),
  }
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

function summarize(diff: Omit<DocumentDiff, 'summary'>): string {
  const parts: string[] = []
  const added = diff.sectionsAdded.length
  const removed = diff.sectionsRemoved.length
  if (added > 0) parts.push(`${plural(added, 'section', 'sections')} added`)
  if (removed > 0) parts.push(added > 0 ? `${removed} removed` : `${plural(removed, 'section', 'sections')} removed`)
  if (diff.reordered) parts.push('order changed')
  const count = (is: DiffRow['is']) => diff.rows.filter((row) => row.is === is).length
  const links = count('link')
  const images = count('image')
  const fields = count('field')
  if (links > 0) parts.push(`${plural(links, 'link', 'links')} changed`)
  if (images > 0) parts.push(`${plural(images, 'image', 'images')} changed`)
  if (fields > 0) parts.push(`${plural(fields, 'field', 'fields')} changed`)
  return parts.join(' · ')
}

/** What a version changed in a page file: sections added, removed or moved, and each changed value. */
export function describePageDiff(before: Json, after: Json, labels: Record<string, string> = {}): DocumentDiff {
  const rows: DiffRow[] = []
  const beforeRest = isRecord(before) ? { ...before, sections: undefined } : {}
  const afterRest = isRecord(after) ? { ...after, sections: undefined } : {}
  for (const change of compare(leaves(beforeRest, '', new Map()), leaves(afterRest, '', new Map()))) {
    if (change.path === 'schemaVersion') continue
    rows.push(diffRow('', '', change.path, change))
  }
  const old = sectionsOf(before)
  const next = sectionsOf(after)
  const oldIds = new Set(old.map((section) => section.id))
  const nextIds = new Set(next.map((section) => section.id))
  const name = (section: { type: string }) => labels[section.type] ?? section.type
  const sectionsAdded = next.filter((section) => !oldIds.has(section.id)).map(name)
  const sectionsRemoved = old.filter((section) => !nextIds.has(section.id)).map(name)
  const keptOld = old.filter((section) => nextIds.has(section.id)).map((section) => section.id)
  const keptNew = next.filter((section) => oldIds.has(section.id)).map((section) => section.id)

  const oldSections = isRecord(before) && Array.isArray(before.sections) ? before.sections.filter(isRecord) : []
  const newSections = isRecord(after) && Array.isArray(after.sections) ? after.sections.filter(isRecord) : []
  for (const section of newSections) {
    const previous = oldSections.find((item) => item.id === section.id)
    if (!previous) continue
    const area = labels[String(section.type)] ?? String(section.type)
    const prefix = typeof section.anchor === 'string' && section.anchor !== '' ? `#${section.anchor}` : words(String(section.type))
    for (const change of compare(leaves(previous, '', new Map()), leaves(section, '', new Map()))) {
      if (change.path === 'id') continue
      rows.push(diffRow(area, prefix, change.path, change))
    }
  }
  const diff = { sectionsAdded, sectionsRemoved, reordered: keptOld.join('|') !== keptNew.join('|'), rows }
  return { ...diff, summary: summarize(diff) }
}

/** What a version changed in `site.json`: each changed value, labelled by area (Brand, Header, Footer, Design). */
export function describeSiteDiff(before: Json, after: Json): DocumentDiff {
  const rows = compare(leaves(before ?? {}, '', new Map()), leaves(after ?? {}, '', new Map()))
    .filter((change) => change.path !== 'schemaVersion')
    .map((change) => {
      const [top = '', ...rest] = change.path.split('.')
      const area = SITE_AREAS[top] ?? 'Site'
      const inner = (top === 'header' || top === 'footer' || top === 'theme') && rest.length > 0 ? rest.join('.') : change.path
      const row = diffRow(area, '', inner, change)
      return { ...row, path: fieldLabel(change.path) }
    })
  const diff = { sectionsAdded: [], sectionsRemoved: [], reordered: false, rows }
  return { ...diff, summary: summarize(diff) }
}
