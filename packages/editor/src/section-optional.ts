/**
 * Props a section can drop. The editor shows each one as an empty field or an "Add" slot
 * when it is missing, and prunes empty strings before a preview or a save. Nested keys
 * live under the array prop that holds the items. Each section lists its own in `definition.ts`,
 * and a test checks that list against the section schema, so a new optional prop that is not
 * listed there fails.
 */
export interface OptionalContent {
  /** Top-level props. */
  props: readonly string[]
  /** Optional keys inside each item of an array prop. */
  items?: Readonly<Record<string, readonly string[]>>
}

type Json = Record<string, unknown>

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Drop what the author emptied: optional text left as "", and a link or image whose
 * key was removed. Marks go with a heading that is gone. Pure, so the sidebar can run it
 * on a copy before it previews or saves while the draft keeps the empty input.
 */
export function pruneSectionProps(optional: OptionalContent | undefined, props: Json): Json {
  if (!optional) return props
  const next: Json = { ...props }
  for (const key of optional.props) {
    if (next[key] === '' || next[key] === undefined) delete next[key]
  }
  if (next.heading === undefined) {
    delete next.marks
    delete next.em
  }
  for (const [arrayKey, keys] of Object.entries(optional.items ?? {})) {
    const list = next[arrayKey]
    if (!Array.isArray(list)) continue
    next[arrayKey] = list.map((item) => {
      if (!isRecord(item)) return item
      const copy: Json = { ...item }
      for (const key of keys) {
        if (copy[key] === '' || copy[key] === undefined) delete copy[key]
      }
      return copy
    })
  }
  return next
}

/** Whether `path` (`sections.2.props.eyebrow`, `sections.2.props.items.0.role`) names a prop the section can drop. */
export function isOptionalPath(content: OptionalContent | undefined, path: string): boolean {
  if (!content) return false
  const parts = path.replace(/^sections\.\d+\.props\./, '').split('.')
  if (parts.length === 1) return content.props.includes(parts[0] ?? '')
  const [arrayKey, index, key] = parts
  if (parts.length === 3 && arrayKey !== undefined && key !== undefined && /^\d+$/.test(index ?? '')) {
    return content.items?.[arrayKey]?.includes(key) ?? false
  }
  return false
}

/**
 * Section content keys in the order the form lists them: defaults first. An optional prop the defaults leave out sits
 * right after the optional prop listed before it (`body` after `heading`), or at the end when none of those exist.
 */
export function orderContentKeys(present: readonly string[], optional: readonly string[], defaultKeys: readonly string[]): string[] {
  const keys = [...new Set([...present, ...optional])]
  const rank = [...defaultKeys]
  optional.forEach((key, position) => {
    if (rank.includes(key)) return
    const before = optional
      .slice(0, position)
      .reverse()
      .find((name) => rank.includes(name))
    rank.splice(before === undefined ? rank.length : rank.indexOf(before) + 1, 0, key)
  })
  const at = (key: string) => {
    const found = rank.indexOf(key)
    return found === -1 ? Number.MAX_SAFE_INTEGER : found
  }
  return keys
    .map((key, order) => ({ key, order }))
    .sort((a, b) => at(a.key) - at(b.key) || a.order - b.order)
    .map((item) => item.key)
}
