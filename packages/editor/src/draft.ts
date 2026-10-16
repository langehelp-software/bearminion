/** Plain JSON edits for the editor. No DOM and no I/O, so the UI and the tests share one implementation. */

import { MAX_NAV_DEPTH } from './fields.js'
import { applyTextMark, marksFromEmphasis, reconcileMarks, type MarkPatch, type TextMark } from './marks.js'

export { MAX_NAV_DEPTH }

export interface SectionDraft {
  id: string
  type: string
  anchor?: string
  variant?: string
  tone?: string
  motion?: boolean
  props: Record<string, unknown>
}

export interface PageDraft {
  slug: string
  title: string
  seo: Record<string, unknown>
  sections: SectionDraft[]
}

export interface NavLink {
  label: string
  href: string
  newTab?: boolean
  id?: string
  trackingId?: string
  children?: NavLink[]
}

export interface CountRule {
  min?: number
  max?: number
  recommended?: number | string
  exact?: { variant: string; count: number }
}

export function getAt(root: unknown, path: string): unknown {
  if (path === '') return root
  let current = root
  for (const part of path.split('.')) {
    if (Array.isArray(current)) {
      const index = Number(part)
      if (!Number.isInteger(index)) return undefined
      current = current[index]
      continue
    }
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

export function setAt<T>(root: T, path: string, value: unknown): T {
  if (path === '') return value as T
  const parts = path.split('.')
  return write(root, parts, value) as T
}

function write(current: unknown, parts: string[], value: unknown): unknown {
  const [head, ...rest] = parts
  if (head === undefined) return value
  if (Array.isArray(current)) {
    const index = Number(head)
    const next = current.slice()
    next[index] = rest.length === 0 ? value : write(current[index], rest, value)
    return next
  }
  const record = typeof current === 'object' && current !== null ? { ...(current as Record<string, unknown>) } : {}
  record[head] = rest.length === 0 ? value : write(record[head], rest, value)
  return record
}

export function setField(doc: unknown, path: string, value: unknown): unknown {
  return setAt(doc, path, value)
}

/** Heading fields and the site wordmark. Plan names and other `.name` fields are plain. */
export function isHeadingField(path: string): boolean {
  return path === 'name' || path === 'heading' || path.endsWith('.heading')
}

export function marksPathFor(path: string): string | null {
  if (path === 'name') return 'nameMarks'
  if (path === 'heading' || path.endsWith('.heading')) return path.replace(/heading$/, 'marks')
  return null
}

function legacyEmphasisPath(path: string): string | null {
  if (path === 'name') return 'nameEm'
  if (path === 'heading' || path.endsWith('.heading')) return path.replace(/heading$/, 'em')
  return null
}

function readMarks(doc: unknown, path: string, text: string): TextMark[] {
  const stored = getAt(doc, marksPathFor(path) ?? '')
  if (Array.isArray(stored)) return stored as TextMark[]
  const legacy = getAt(doc, legacyEmphasisPath(path) ?? '')
  return marksFromEmphasis(text, typeof legacy === 'string' ? legacy : undefined) ?? []
}

/**
 * Set a field. Heading and wordmark edits keep inline marks aligned with the
 * new text, and drop a legacy `em` / `nameEm` once it has moved to marks.
 */
export function editField(doc: unknown, path: string, value: unknown): unknown {
  const previous = getAt(doc, path)
  let next = setField(doc, path, value)
  if (!isHeadingField(path) || typeof previous !== 'string' || typeof value !== 'string') return next
  const marks = reconcileMarks(previous, value, readMarks(doc, path, previous))
  const marksPath = marksPathFor(path)
  const legacyPath = legacyEmphasisPath(path)
  if (marksPath) {
    next = marks.length > 0 ? setAt(next, marksPath, marks) : deleteAt(next, marksPath)
  }
  if (legacyPath) next = deleteAt(next, legacyPath)
  return next
}

/** Replace the marks on a heading or the site name without changing the text. */
export function editMarks(doc: unknown, path: string, patch: MarkPatch, start: number, end: number): unknown {
  const text = getAt(doc, path)
  if (typeof text !== 'string') return doc
  const marks = applyTextMark(text, readMarks(doc, path, text), start, end, patch)
  const marksPath = marksPathFor(path)
  const legacyPath = legacyEmphasisPath(path)
  if (!marksPath) return doc
  let next = marks.length > 0 ? setAt(doc, marksPath, marks) : deleteAt(doc, marksPath)
  if (legacyPath) next = deleteAt(next, legacyPath)
  return next
}

export function clearField(root: unknown, path: string): unknown {
  return deleteAt(root, path)
}

function deleteAt(root: unknown, path: string): unknown {
  const parts = path.split('.').filter((part) => part.length > 0)
  if (parts.length === 0) return root
  return removeAt(root, parts)
}

function removeAt(current: unknown, parts: readonly string[]): unknown {
  const [head, ...rest] = parts
  if (head === undefined) return current
  if (Array.isArray(current)) {
    const index = Number(head)
    const next = current.slice()
    if (rest.length === 0) {
      if (Number.isInteger(index)) next.splice(index, 1)
      return next
    }
    next[index] = removeAt(current[index], rest)
    return next
  }
  const record = typeof current === 'object' && current !== null ? { ...(current as Record<string, unknown>) } : {}
  if (rest.length === 0) delete record[head]
  else record[head] = removeAt(record[head], rest)
  return record
}

export interface PendingEdit {
  path: string
  value: unknown
}

/**
 * Apply field writes that happened before the page or site draft existed.
 * Edits for a document that is still missing stay in `pending`.
 */
export function applyPendingEdits(
  page: unknown | null,
  site: unknown | null,
  edits: readonly PendingEdit[],
): { page: unknown | null; site: unknown | null; pending: PendingEdit[] } {
  let nextPage = page
  let nextSite = site
  const pending: PendingEdit[] = []
  for (const edit of edits) {
    if (edit.path.startsWith('sections.')) {
      if (nextPage !== null) nextPage = editField(nextPage, edit.path, edit.value)
      else pending.push(edit)
    } else if (nextSite !== null) {
      nextSite = editField(nextSite, edit.path, edit.value)
    } else {
      pending.push(edit)
    }
  }
  return { page: nextPage, site: nextSite, pending }
}

export function isImageField(path: string): boolean {
  return /(?:^|\.)(?:image|images|logo|logos|favicon|brandLogo)(?:\.|$)/.test(path)
}

/** `sections.0.props.image.alt` and `logo.src` both name the image object. */
export function imageObjectPath(path: string): string {
  if (path.endsWith('.alt') || path.endsWith('.src')) return path.slice(0, -4)
  return path
}

export function isButtonLinkPath(path: string): boolean {
  return /(?:^|\.)(?:primary|secondary|cta|signIn|link|actions\.\d+)(?:\.label)?$/.test(path)
}

/** `image.alt` and `logo.src` both assign the image `src`. */
export function imageSrcPath(path: string): string {
  if (path.endsWith('.alt')) return `${path.slice(0, -4)}.src`
  if (path.endsWith('.src')) return path
  return `${path}.src`
}

const multiline = /(?:^|\.)(?:body|intro|description|quote|note|thanks|blurb|sub|text|a)$/

export function isMultilineField(path: string): boolean {
  return multiline.test(path)
}

export function isRichField(path: string, kind: string | null): boolean {
  return kind === 'rich' || /(?:^|\.)(?:body|intro|sub|description|quote|note|thanks|a)$/.test(path)
}

export function nextSectionId(sections: readonly { id: string }[], type: string): string {
  const stem = type.replace(/[^A-Za-z0-9_-]+/g, '') || 'section'
  const ids = new Set(sections.map((section) => section.id))
  if (!ids.has(stem)) return stem
  let n = 2
  while (ids.has(`${stem}-${n}`)) n += 1
  return `${stem}-${n}`
}

export function sectionFromDefaults(type: string, id: string, props: Record<string, unknown>, variant: string, tone: string): SectionDraft {
  return {
    id,
    type,
    variant,
    tone,
    props: structuredClone(props),
  }
}

export function addSection(page: PageDraft, index: number, section: SectionDraft): PageDraft {
  const sections = page.sections.slice()
  const at = Math.max(0, Math.min(index, sections.length))
  sections.splice(at, 0, section)
  return { ...page, sections }
}

export function duplicateSection(page: PageDraft, id: string): PageDraft {
  const index = page.sections.findIndex((section) => section.id === id)
  const source = page.sections[index]
  if (!source) return page
  const copy = structuredClone(source)
  copy.id = nextSectionId(page.sections, source.type)
  if (copy.anchor) {
    const taken = anchorSet(page.sections)
    copy.anchor = uniqueAnchor(copy.anchor, taken)
  }
  return addSection(page, index + 1, copy)
}

export function moveSection(page: PageDraft, id: string, direction: -1 | 1): PageDraft {
  const index = page.sections.findIndex((section) => section.id === id)
  const next = index + direction
  if (index < 0 || next < 0 || next >= page.sections.length) return page
  const sections = page.sections.slice()
  const [item] = sections.splice(index, 1)
  if (!item) return page
  sections.splice(next, 0, item)
  return { ...page, sections }
}

export function removeSection(page: PageDraft, id: string): PageDraft {
  return { ...page, sections: page.sections.filter((section) => section.id !== id) }
}

export function reorderList<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list.slice()
  const next = list.slice()
  const [item] = next.splice(from, 1)
  if (item === undefined) return list.slice()
  next.splice(to, 0, item)
  return next
}

export function canAddItems(count: number, rule: CountRule | undefined, variant: string | undefined): boolean {
  if (!rule) return true
  if (rule.exact && variant === rule.exact.variant) return false
  if (rule.max !== undefined && count >= rule.max) return false
  return true
}

export function canRemoveItems(count: number, rule: CountRule | undefined, variant: string | undefined): boolean {
  if (!rule) return count > 0
  if (rule.exact && variant === rule.exact.variant) return false
  if (rule.min !== undefined && count <= rule.min) return false
  return count > 0
}

export function addListItem(doc: unknown, path: string, item: unknown): unknown {
  const list = getAt(doc, path)
  const next = Array.isArray(list) ? [...list, structuredClone(item)] : [structuredClone(item)]
  return setAt(doc, path, next)
}

export function removeListItem(doc: unknown, path: string, index: number): unknown {
  const list = getAt(doc, path)
  if (!Array.isArray(list)) return doc
  return setAt(
    doc,
    path,
    list.filter((_, itemIndex) => itemIndex !== index),
  )
}

export function reorderListAt(doc: unknown, path: string, from: number, to: number): unknown {
  const list = getAt(doc, path)
  if (!Array.isArray(list)) return doc
  return setAt(doc, path, reorderList(list, from, to))
}

export function addNavChild(links: readonly NavLink[], index: number | readonly number[], child: NavLink): NavLink[] {
  const path = typeof index === 'number' ? [index] : [...index]
  if (path.length >= MAX_NAV_DEPTH || path.length + navHeight(child) > MAX_NAV_DEPTH) return cloneLinks(links)
  const next = cloneLinks(links)
  const found = parentList(next, path)
  const node = found?.list[found.index]
  if (!node) return next
  node.children = [...(node.children ?? []), child]
  return next
}

export function removeNavChild(links: readonly NavLink[], index: number, childIndex: number): NavLink[] {
  return removeNavAt(links, [index, childIndex])
}

export function removeNavAt(links: readonly NavLink[], path: readonly number[]): NavLink[] {
  const next = cloneLinks(links)
  const found = parentList(next, path)
  if (!found) return next
  found.list.splice(found.index, 1)
  clearEmptyChildren(next, path.slice(0, -1))
  return next
}

/** Make the link the last child of the previous sibling, when depth allows. */
export function indentNav(links: readonly NavLink[], path: readonly number[]): NavLink[] {
  const original = cloneLinks(links)
  const next = cloneLinks(links)
  const found = parentList(next, path)
  if (!found || found.index === 0) return original
  const item = found.list[found.index]
  const previous = found.list[found.index - 1]
  if (!item || !previous) return original
  if (path.length + navHeight(item) > MAX_NAV_DEPTH) return original
  found.list.splice(found.index, 1)
  previous.children = [...(previous.children ?? []), item]
  return next
}

/** Move the link to sit just after its parent. */
export function outdentNav(links: readonly NavLink[], path: readonly number[]): NavLink[] {
  if (path.length < 2) return cloneLinks(links)
  const next = cloneLinks(links)
  const found = parentList(next, path)
  const parent = parentList(next, path.slice(0, -1))
  if (!found || !parent) return cloneLinks(links)
  const [item] = found.list.splice(found.index, 1)
  if (!item) return cloneLinks(links)
  clearEmptyChildren(next, path.slice(0, -1))
  parent.list.splice(parent.index + 1, 0, item)
  return next
}

export type NavDrop = 'before' | 'after' | 'child'

/** Move a link before, after, or into another link. A node cannot move into its own subtree. */
export function moveNav(links: readonly NavLink[], from: readonly number[], to: readonly number[], mode: NavDrop): NavLink[] {
  const original = cloneLinks(links)
  if (pathsEqual(from, to) || isPrefix(from, to)) return original
  const item = linkAt(links, from)
  if (!item) return original
  if (mode === 'child' && to.length + navHeight(item) > MAX_NAV_DEPTH) return original
  const next = cloneLinks(links)
  const source = parentList(next, from)
  if (!source) return original
  const [moved] = source.list.splice(source.index, 1)
  if (!moved) return original
  clearEmptyChildren(next, from.slice(0, -1))
  const targetPath = adjustPathAfterRemoval(from, to)
  if (mode === 'child') {
    const host = parentList(next, targetPath)
    const node = host?.list[host.index]
    if (!node) return original
    node.children = [...(node.children ?? []), moved]
    return next
  }
  const dest = parentList(next, targetPath)
  if (!dest) return original
  const insertAt = mode === 'after' ? dest.index + 1 : dest.index
  dest.list.splice(insertAt, 0, moved)
  return next
}

export function navHeight(link: NavLink): number {
  const children = link.children ?? []
  if (children.length === 0) return 1
  let max = 1
  for (const child of children) max = Math.max(max, 1 + navHeight(child))
  return max
}

export function slugifyAnchor(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function uniqueAnchor(base: string, taken: ReadonlySet<string>): string {
  const stem = slugifyAnchor(base) || 'section'
  if (!taken.has(stem)) return stem
  let n = 2
  while (taken.has(`${stem}-${n}`)) n += 1
  return `${stem}-${n}`
}

export function suggestAnchor(section: { type: string; props: Record<string, unknown> }, taken: ReadonlySet<string>): string {
  const heading = typeof section.props.heading === 'string' ? section.props.heading : ''
  const label = typeof section.props.label === 'string' ? section.props.label : ''
  return uniqueAnchor(heading || label || section.type, taken)
}

export function anchorSet(sections: readonly { anchor?: string }[]): Set<string> {
  return new Set(sections.flatMap((section) => (section.anchor ? [section.anchor] : [])))
}

export interface AnchorPage {
  slug: string
  anchors: readonly string[]
}

/** A warning for an internal link whose page or anchor is missing. External URLs are left alone. */
export function linkWarning(href: string, pages: readonly AnchorPage[], currentSlug: string): string | null {
  if (href === '' || href === '#') return null
  if (/^(?:https?:|mailto:|tel:|\/\/)/i.test(href)) return null
  const hashAt = href.indexOf('#')
  const pathPart = hashAt === -1 ? href : href.slice(0, hashAt)
  const hash = hashAt === -1 ? '' : href.slice(hashAt + 1)
  if (!pathPart.startsWith('/') && pathPart !== '') return null
  if (pathPart === '' || pathPart === '#') {
    return missingAnchor(hash, anchorsFor(pages, currentSlug), 'this page')
  }
  const slug = pathPart === '/' ? 'index' : pathPart.replace(/^\//, '').replace(/\/$/, '')
  const page = pages.find((item) => item.slug === slug)
  if (!page) return `No page at ${pathPart}.`
  const where = slug === 'index' ? '/' : `/${slug}`
  return missingAnchor(hash, page.anchors, where)
}

export function pageHref(slug: string): string {
  return slug === 'index' ? '/' : `/${slug}`
}

export function slugFromPath(pathname: string): string {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  if (path === '' || path === '/') return 'index'
  return path.replace(/^\//, '')
}

function cloneLinks(links: readonly NavLink[]): NavLink[] {
  return structuredClone(links) as NavLink[]
}

function parentList(links: NavLink[], path: readonly number[]): { list: NavLink[]; index: number } | null {
  if (path.length === 0) return null
  let list = links
  for (let depth = 0; depth < path.length - 1; depth += 1) {
    const index = path[depth]
    if (index === undefined) return null
    const node = list[index]
    if (!node?.children) return null
    list = node.children
  }
  const index = path[path.length - 1]
  if (index === undefined || index < 0 || index >= list.length) return null
  return { list, index }
}

function linkAt(links: readonly NavLink[], path: readonly number[]): NavLink | undefined {
  let list = links
  let current: NavLink | undefined
  for (const index of path) {
    current = list[index]
    if (!current) return undefined
    list = current.children ?? []
  }
  return current
}

function clearEmptyChildren(links: NavLink[], parentPath: readonly number[]): void {
  if (parentPath.length === 0) return
  const found = parentList(links, parentPath)
  const node = found?.list[found.index]
  if (node && (node.children?.length ?? 0) === 0) delete node.children
}

function pathsEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function isPrefix(prefix: readonly number[], path: readonly number[]): boolean {
  if (prefix.length === 0 || prefix.length >= path.length) return false
  return prefix.every((value, index) => value === path[index])
}

function adjustPathAfterRemoval(from: readonly number[], to: readonly number[]): number[] {
  const next = [...to]
  if (!pathsEqual(from.slice(0, -1), to.slice(0, -1))) return next
  const fromIndex = from[from.length - 1] ?? 0
  const toIndex = to[to.length - 1] ?? 0
  if (toIndex > fromIndex) {
    const last = next.length - 1
    const current = next[last]
    if (current !== undefined) next[last] = current - 1
  }
  return next
}

function missingAnchor(hash: string, anchors: readonly string[], where: string): string | null {
  if (hash === '' || anchors.includes(hash)) return null
  return `No anchor "#${hash}" on ${where}.`
}

function anchorsFor(pages: readonly AnchorPage[], slug: string): readonly string[] {
  return pages.find((page) => page.slug === slug)?.anchors ?? []
}
