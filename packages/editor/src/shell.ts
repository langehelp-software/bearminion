/**
 * The editor shell's geometry and the pure logic its screens run on: the left navigation, the top bar, the inspector,
 * the canvas the page is framed in, and the content listings. No DOM here, so all of it is tested without a browser.
 */
import { formatJsonLd, jsonLdWarnings, parseJsonLdInput, type JsonLdBlock } from './json-ld.js'

export const NAV_OPEN_WIDTH = 248
export const NAV_RAIL_WIDTH = 64
export const TOP_BAR_HEIGHT = 56

export const INSPECTOR_DEFAULT = 352
export const INSPECTOR_MIN = 280
export const INSPECTOR_MAX = 560
/** Arrow keys on the inspector's edge move it this far. */
export const INSPECTOR_KEY_STEP = 16

/** Below this window width the inspector starts closed, and closes itself once when the window shrinks past it. */
export const INSPECTOR_CLOSE_BELOW = 1100

/** Device frames. Desktop is the page itself, at the canvas width. */
export type Viewport = 'desktop' | 'tablet' | 'mobile'
export const DEVICE_WIDTHS: Record<Exclude<Viewport, 'desktop'>, number> = { tablet: 820, mobile: 390 }

/** Whether the left navigation is open ('1') or a rail ('0'). Kept across visits. */
export const NAV_OPEN_KEY = 'bearminion:shell-nav-open'
export const INSPECTOR_WIDTH_KEY = 'bearminion:inspector-width'
/** Whether the inspector is open, kept for the browser session so a reload after a save looks the same. */
export const INSPECTOR_OPEN_KEY = 'bearminion:inspector-open'
/** The full-screen view that was up, so a reload after a save (which reloads the page) comes back to it. */
export const VIEW_KEY = 'bearminion:shell-view'

/** Settings screens. Most cover the canvas; the `SIDE_VIEWS` among them open beside it. */
export const SETTINGS_VIEWS = ['navigation', 'footer', 'site', 'design', 'seo'] as const
export type SettingsView = (typeof SETTINGS_VIEWS)[number]

/**
 * Settings that open in the right-hand sidebar, in place of the inspector, with the page still on the canvas: their
 * controls change what the header, the footer, the colours and the page show, so the result stays in view while they are edited.
 */
export const SIDE_VIEWS = ['navigation', 'footer', 'site', 'design'] as const satisfies readonly SettingsView[]
export type SideView = (typeof SIDE_VIEWS)[number]

export function isSideView(view: string): view is SideView {
  return (SIDE_VIEWS as readonly string[]).includes(view)
}

/** The page is on the canvas: no view, or a settings sidebar beside it. */
export function showsPage(view: string): boolean {
  return view === 'canvas' || isSideView(view)
}

/**
 * What covers the canvas: nothing (`canvas`), the Media library, the commit history, a settings screen, or the listing of a content type
 * (`listing:pages`, `listing:blog`).
 */
export type View = 'canvas' | 'media' | 'history' | SettingsView | `listing:${string}`

export function listingView(type: string): View {
  return `listing:${type}`
}

/** The content type a listing view shows, or null when the view is not a listing. */
export function listingType(view: View): string | null {
  return view.startsWith('listing:') ? view.slice('listing:'.length) : null
}

/** A view read back from storage, or `canvas` when it is not one. */
export function parseView(value: string | null): View {
  if (value === null) return 'canvas'
  if (value === 'canvas' || value === 'media' || value === 'history') return value
  if ((SETTINGS_VIEWS as readonly string[]).includes(value)) return value as SettingsView
  if (/^listing:[a-z0-9][a-z0-9-]*$/.test(value)) return value as View
  return 'canvas'
}

export function clampInspectorWidth(width: number): number {
  const value = Number.isFinite(width) ? Math.round(width) : INSPECTOR_DEFAULT
  return Math.min(INSPECTOR_MAX, Math.max(INSPECTOR_MIN, value))
}

export interface CanvasInput {
  windowWidth: number
  windowHeight: number
  /** The navigation is hidden in preview. */
  nav: 'open' | 'rail' | 'hidden'
  /** Inspector width, or 0 when it is closed or hidden. */
  inspector: number
}

export interface CanvasRect {
  top: number
  left: number
  width: number
  height: number
}

/** Where the page sits: below the top bar, between the navigation and the inspector. */
export function canvasRect({ windowWidth, windowHeight, nav, inspector }: CanvasInput): CanvasRect {
  const left = nav === 'open' ? NAV_OPEN_WIDTH : nav === 'rail' ? NAV_RAIL_WIDTH : 0
  return {
    top: TOP_BAR_HEIGHT,
    left,
    width: Math.max(0, windowWidth - left - Math.max(0, inspector)),
    height: Math.max(0, windowHeight - TOP_BAR_HEIGHT),
  }
}

/** "20 min ago", "3 h ago", "Yesterday", then the date ("12 Nov 2026"). Empty for a missing or broken time. */
export function relativeTime(iso: string | undefined, now: number = Date.now()): string {
  if (!iso) return ''
  const then = new Date(iso)
  const time = then.getTime()
  if (Number.isNaN(time)) return ''
  const minutes = Math.max(0, Math.round((now - time) / 60_000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const today = new Date(now)
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (then.getFullYear() === yesterday.getFullYear() && then.getMonth() === yesterday.getMonth() && then.getDate() === yesterday.getDate())
    return 'Yesterday'
  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ---------- content listings ----------

export type RowStatus = 'published' | 'draft' | 'unsaved'

export interface ListingRow {
  slug: string
  title: string
  /** The address: `/`, `/about`, `/blog/first-post`. */
  path: string
  status: RowStatus
  /** False when the document is marked `noindex`. */
  indexed: boolean
  /** ISO time of the last change on disk, when the store knows it. */
  updatedAt?: string
  home?: boolean
  /** Built in (the 404 page): it can be edited, never deleted. */
  system?: boolean
  /** The document open in the canvas. */
  editing?: boolean
  /** A single or a listing page: one document at a fixed address. */
  fixed?: boolean
}

export type ListingFilter = 'all' | RowStatus
export type ListingSortKey = 'title' | 'path' | 'status' | 'indexed' | 'updatedAt'
export interface ListingSort {
  key: ListingSortKey
  dir: 'asc' | 'desc'
}

export const LISTING_PAGE_SIZE = 10
export const DEFAULT_LISTING_SORT: ListingSort = { key: 'updatedAt', dir: 'desc' }

/** The home and 404 pages, singles and listing pages are never deleted from a listing. */
export function canDeleteRow(row: ListingRow): boolean {
  return !row.home && !row.system && !row.fixed
}

export function statusCounts(rows: readonly ListingRow[]): Record<ListingFilter, number> {
  const counts: Record<ListingFilter, number> = { all: rows.length, published: 0, draft: 0, unsaved: 0 }
  for (const row of rows) counts[row.status] += 1
  return counts
}

/** Rows whose title or slug holds the query (case and accents ignored), with the given status. */
export function filterRows<T extends ListingRow>(rows: readonly T[], query: string, filter: ListingFilter): T[] {
  const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const needle = fold(query.trim())
  return rows.filter(
    (row) =>
      (filter === 'all' || row.status === filter) && (needle === '' || fold(row.title).includes(needle) || fold(row.slug).includes(needle)),
  )
}

const STATUS_ORDER: Record<RowStatus, number> = { unsaved: 0, draft: 1, published: 2 }

/** A stable sort: rows that compare equal keep their order. A row with no update time sorts last either way. */
export function sortRows<T extends ListingRow>(rows: readonly T[], sort: ListingSort, locale = 'en'): T[] {
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true })
  const sign = sort.dir === 'asc' ? 1 : -1
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      let order = 0
      switch (sort.key) {
        case 'title':
          order = collator.compare(a.row.title, b.row.title) * sign
          break
        case 'path':
          order = collator.compare(a.row.path, b.row.path) * sign
          break
        case 'status':
          order = (STATUS_ORDER[a.row.status] - STATUS_ORDER[b.row.status]) * sign
          break
        case 'indexed':
          order = (Number(a.row.indexed) - Number(b.row.indexed)) * sign
          break
        case 'updatedAt': {
          const x = a.row.updatedAt ? Date.parse(a.row.updatedAt) : Number.NaN
          const y = b.row.updatedAt ? Date.parse(b.row.updatedAt) : Number.NaN
          if (Number.isNaN(x) || Number.isNaN(y)) order = Number(Number.isNaN(x)) - Number(Number.isNaN(y))
          else order = (x - y) * sign
          break
        }
      }
      return order === 0 ? a.index - b.index : order
    })
    .map(({ row }) => row)
}

export interface ListingPage<T> {
  rows: T[]
  /** 1-based, clamped to the pages there are. */
  page: number
  pages: number
  /** "1–10 of 14", or "0 of 0". */
  range: string
}

export function paginate<T>(rows: readonly T[], page: number, size: number = LISTING_PAGE_SIZE): ListingPage<T> {
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const current = Math.min(pages, Math.max(1, Math.floor(page) || 1))
  const start = (current - 1) * size
  const slice = rows.slice(start, start + size)
  return {
    rows: slice,
    page: current,
    pages,
    range: rows.length === 0 ? '0 of 0' : `${start + 1}–${start + slice.length} of ${rows.length}`,
  }
}

/** "about-copy", then "about-copy-2", … : the first slug for a duplicate that is not taken yet. */
export function copySlug(slug: string, taken: ReadonlySet<string>): string {
  const base = `${slug}-copy`
  if (!taken.has(base)) return base
  for (let n = 2; ; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
}

// ---------- structured data, one block per card ----------

export const JSON_LD_MAX_BLOCKS = 10
export const JSON_LD_MAX_BYTES = 50_000

export type BlockState = { state: 'valid' | 'warning'; message: string; blocks: JsonLdBlock[] } | { state: 'error'; message: string }

/** What one card's text holds. An array or a pasted script tag is fine: Format splits it into one card per block. */
export function checkBlockText(text: string): BlockState {
  const parsed = parseJsonLdInput(text)
  if (!parsed.ok) return { state: 'error', message: parsed.error }
  if (parsed.value.length === 0) return { state: 'error', message: 'Empty. Paste a JSON-LD object or remove the block.' }
  const warnings = jsonLdWarnings(parsed.value)
  if (warnings.length > 0) return { state: 'warning', message: 'Missing @context or @type.', blocks: parsed.value }
  return { state: 'valid', message: 'Valid JSON-LD.', blocks: parsed.value }
}

/** The `@type` and `@id` a card's header shows. */
export function blockLabel(text: string): { type: string; id: string } {
  const parsed = parseJsonLdInput(text)
  const first = parsed.ok ? parsed.value[0] : undefined
  const type = first?.['@type']
  const id = first?.['@id']
  return {
    type: typeof type === 'string' ? type : Array.isArray(type) ? type.join(', ') : first && '@graph' in first ? '@graph' : 'Block',
    id: typeof id === 'string' ? id : '',
  }
}

/** Each stored block as the text of its own card. */
export function blockTexts(blocks: readonly JsonLdBlock[] | undefined): string[] {
  return (blocks ?? []).map((block) => formatJsonLd([block]))
}

/** Byte size of the blocks as `site.json` stores them, which is what the 50 KB limit counts. */
export function jsonLdBytes(blocks: readonly JsonLdBlock[]): number {
  return JSON.stringify(blocks).length
}
