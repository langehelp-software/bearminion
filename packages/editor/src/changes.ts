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
