import { type Document, isAlias, isMap, isNode, isScalar, isSeq, type Pair, parseDocument, Scalar, type YAMLMap } from 'yaml'

/**
 * Source-preserving access to a Markdown entry: frontmatter plus body.
 *
 * Nothing here re-serializes a document. `splitEntry` cuts the file into pieces that join back into the exact same
 * bytes, and `setField` / `removeField` replace only the source range of the one key being changed, so comments,
 * spacing, folded scalars, quoting, CRLF and a missing final newline all survive an edit. (The `yaml` Document API
 * alone does not: `toString()` re-wraps and re-spaces untouched lines.) Pure: no Node, Astro or Vite imports.
 */

export type EntryErrorCode = 'invalid_frontmatter' | 'read_only_field'

export class EntryError extends Error {
  constructor(
    readonly code: EntryErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'EntryError'
  }
}

export interface EntryParts {
  /** `﻿` when the file starts with a byte order mark, else ''. */
  bom: string
  /** The file's line ending, from its first line break. */
  eol: '\n' | '\r\n'
  /** Opening fence line including its line break; '' when the file has no frontmatter. */
  head: string
  /** Text between the fences, including the line break before the closing fence. */
  frontmatter: string
  /** Closing fence line including its line break (or end of file); '' when the file has no frontmatter. */
  tail: string
  /** Everything after the closing fence. */
  body: string
}

const OPEN = /^---[ \t]*\r?\n/

/** Cuts an entry into parts. `joinEntry(splitEntry(source))` is `source`, byte for byte. */
export function splitEntry(source: string): EntryParts {
  const bom = source.startsWith('﻿') ? '﻿' : ''
  const text = source.slice(bom.length)
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const open = OPEN.exec(text)
  if (!open) return { bom, eol, head: '', frontmatter: '', tail: '', body: text }
  let position = open[0].length
  while (position <= text.length) {
    const lineEnd = text.indexOf('\n', position)
    const end = lineEnd === -1 ? text.length : lineEnd + 1
    const line = text.slice(position, end).replace(/\r?\n$/, '')
    if (/^---[ \t]*$/.test(line)) {
      return {
        bom,
        eol,
        head: open[0],
        frontmatter: text.slice(open[0].length, position),
        tail: text.slice(position, end),
        body: text.slice(end),
      }
    }
    if (lineEnd === -1) break
    position = end
  }
  // An opening fence with no closing one is not frontmatter.
  return { bom, eol, head: '', frontmatter: '', tail: '', body: text }
}

export function joinEntry(parts: EntryParts): string {
  return parts.bom + parts.head + parts.frontmatter + parts.tail + parts.body
}

export function hasFrontmatter(parts: EntryParts): boolean {
  return parts.head !== ''
}

function mapOf(document: Document.Parsed, source: string): YAMLMap.Parsed | null {
  if (document.errors.length > 0) {
    throw new EntryError('invalid_frontmatter', `The frontmatter is not valid YAML: ${document.errors[0]?.message ?? ''}`)
  }
  if (document.contents === null) return null
  if (!isMap(document.contents)) throw new EntryError('invalid_frontmatter', 'The frontmatter is not a mapping.')
  if (/^[ \t]*<<[ \t]*:/m.test(source)) {
    throw new EntryError('read_only_field', 'The frontmatter uses merge keys; edit it by hand.')
  }
  return document.contents
}

/** Where a pair's value ends in the source (the key's end when the value is empty). */
function valueEnd(pair: Pair): number {
  const value = pair.value
  if (value && isNode(value) && value.range) return value.range[1]
  const key = pair.key
  return isNode(key) && key.range ? key.range[1] : 0
}

function findPair(map: YAMLMap.Parsed, key: string): Pair | undefined {
  return map.items.find((pair) => isScalar(pair.key) && pair.key.value === key)
}

/**
 * The frontmatter as a plain object, read the way Astro reads it: YAML 1.2 plus timestamps, so `2026-01-05` is a
 * Date. Returns `{}` when the frontmatter is empty.
 */
export function readFields(frontmatter: string): Record<string, unknown> {
  const document = parseDocument(frontmatter, { customTags: ['timestamp'] })
  if (!mapOf(document, frontmatter)) return {}
  return (document.toJS() as Record<string, unknown>) ?? {}
}

function detectIndent(source: string): number {
  const match = /^( +)\S/m.exec(source)
  return match ? Math.min(Math.max(match[1]?.length ?? 2, 2), 8) : 2
}

function withEol(text: string, eol: string): string {
  return eol === '\n' ? text : text.replace(/\n/g, eol)
}

/** Serializes `key: value` the way the field was already written (quote style, flow collections). */
function serializePair(key: string, value: unknown, previous: Pair | undefined, indent: number): string {
  const holder = parseDocument('{}')
  holder.contents = holder.createNode({ [key]: value }) as never
  const node = (holder.contents as YAMLMap).items[0]?.value
  const before = previous?.value
  if (isScalar(node) && isScalar(before) && typeof value === 'string') {
    if (before.type === Scalar.QUOTE_DOUBLE || before.type === Scalar.QUOTE_SINGLE) node.type = before.type
  } else if (isSeq(node) && isSeq(before)) {
    node.flow = before.flow
  } else if (isMap(node) && isMap(before)) {
    node.flow = before.flow
  }
  const mapNode = holder.contents as YAMLMap
  mapNode.flow = false
  return holder.toString({ lineWidth: 0, indent }).replace(/\r?\n$/, '')
}

/**
 * Sets one top-level key. Only that key's own text changes; a new key is appended. Throws `EntryError`
 * (`read_only_field`) for a key defined through an anchor, alias or merge key, and `invalid_frontmatter` when the
 * frontmatter is not a YAML mapping.
 */
export function setField(frontmatter: string, key: string, value: unknown, eol: '\n' | '\r\n' = '\n'): string {
  const document = parseDocument(frontmatter)
  const map = mapOf(document, frontmatter)
  const indent = detectIndent(frontmatter)
  const pair = map ? findPair(map, key) : undefined
  if (!pair) {
    const added = withEol(serializePair(key, value, undefined, indent), eol)
    const separator = frontmatter === '' || frontmatter.endsWith('\n') ? '' : eol
    return `${frontmatter}${separator}${added}${eol}`
  }
  const keyNode = pair.key
  const valueNode = pair.value
  if (isAlias(valueNode) || (isScalar(valueNode) || isMap(valueNode) || isSeq(valueNode) ? valueNode.anchor : false)) {
    throw new EntryError('read_only_field', `"${key}" uses a YAML anchor or alias; edit it by hand.`)
  }
  if (!isScalar(keyNode) || !keyNode.range) throw new EntryError('invalid_frontmatter', `Cannot locate "${key}".`)
  const start = keyNode.range[0]
  const rangeEnd = valueEnd(pair)
  let end = rangeEnd
  while (end > start && /\s/.test(frontmatter.charAt(end - 1))) end--
  const replacement = withEol(serializePair(key, value, pair, indent), eol)
  return frontmatter.slice(0, start) + replacement + frontmatter.slice(end)
}

/** Removes one top-level key and the rest of its line. Comment lines above it stay. */
export function removeField(frontmatter: string, key: string): string {
  const document = parseDocument(frontmatter)
  const map = mapOf(document, frontmatter)
  const pair = map ? findPair(map, key) : undefined
  if (!pair || !isScalar(pair.key) || !pair.key.range) return frontmatter
  const valueNode = pair.value
  if (isAlias(valueNode)) throw new EntryError('read_only_field', `"${key}" is an alias; edit it by hand.`)
  const start = frontmatter.lastIndexOf('\n', pair.key.range[0] - 1) + 1
  const rangeEnd = valueEnd(pair)
  let end = rangeEnd
  while (end > start && /\s/.test(frontmatter.charAt(end - 1))) end--
  const lineEnd = frontmatter.indexOf('\n', end)
  return frontmatter.slice(0, start) + (lineEnd === -1 ? '' : frontmatter.slice(lineEnd + 1))
}
