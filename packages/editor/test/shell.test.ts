import { describe, expect, it } from 'vitest'
import {
  blockLabel,
  canvasRect,
  checkBlockText,
  clampInspectorWidth,
  copySlug,
  filterRows,
  type ListingRow,
  listingType,
  paginate,
  parseView,
  relativeTime,
  sortRows,
  statusCounts,
} from '../src/shell.js'

const row = (slug: string, extra: Partial<ListingRow> = {}): ListingRow => ({
  slug,
  title: slug[0]?.toUpperCase() + slug.slice(1),
  path: `/${slug}`,
  status: 'published',
  indexed: true,
  ...extra,
})

describe('shell geometry', () => {
  it('frames the canvas between the navigation, the top bar and the inspector', () => {
    expect(canvasRect({ windowWidth: 1440, windowHeight: 900, nav: 'open', inspector: 352 })).toEqual({
      top: 56,
      left: 248,
      width: 840,
      height: 844,
    })
    expect(canvasRect({ windowWidth: 1440, windowHeight: 900, nav: 'rail', inspector: 0 }).left).toBe(64)
    expect(canvasRect({ windowWidth: 1440, windowHeight: 900, nav: 'hidden', inspector: 0 }).width).toBe(1440)
  })

  it('keeps the inspector between 280 and 560px', () => {
    expect(clampInspectorWidth(100)).toBe(280)
    expect(clampInspectorWidth(900)).toBe(560)
    expect(clampInspectorWidth(Number.NaN)).toBe(352)
  })

  it('reads a stored view back, and anything else as the canvas', () => {
    expect(parseView('seo')).toBe('seo')
    expect(parseView('listing:blog')).toBe('listing:blog')
    expect(listingType(parseView('listing:pages'))).toBe('pages')
    expect(parseView('listing:../x')).toBe('canvas')
    expect(parseView('nope')).toBe('canvas')
    expect(parseView(null)).toBe('canvas')
  })
})

describe('relative times', () => {
  const now = Date.parse('2026-11-16T12:00:00Z')
  it('says minutes, hours, yesterday, then the date', () => {
    expect(relativeTime('2026-11-16T11:40:00Z', now)).toBe('20 min ago')
    expect(relativeTime('2026-11-16T09:00:00Z', now)).toBe('3 h ago')
    expect(relativeTime('2026-11-15T08:00:00Z', now)).toBe('Yesterday')
    expect(relativeTime('2026-11-12T08:00:00Z', now)).toBe('12 Nov 2026')
    expect(relativeTime(undefined, now)).toBe('')
    expect(relativeTime('broken', now)).toBe('')
  })
})

describe('content listings', () => {
  const rows = [
    row('about', { updatedAt: '2026-11-10T00:00:00Z' }),
    row('index', { title: 'Home', path: '/', home: true, updatedAt: '2026-11-16T00:00:00Z' }),
    row('pricing', { status: 'draft', indexed: false }),
    row('café', { title: 'Café', status: 'unsaved', updatedAt: '2026-11-01T00:00:00Z' }),
  ]

  it('counts each status', () => {
    expect(statusCounts(rows)).toEqual({ all: 4, published: 2, draft: 1, unsaved: 1 })
  })

  it('searches title and slug, ignoring case and accents', () => {
    expect(filterRows(rows, 'CAFE', 'all').map((item) => item.slug)).toEqual(['café'])
    expect(filterRows(rows, 'home', 'all').map((item) => item.slug)).toEqual(['index'])
    expect(filterRows(rows, '', 'draft').map((item) => item.slug)).toEqual(['pricing'])
  })

  it('sorts by last update, newest first, with unknown times last', () => {
    expect(sortRows(rows, { key: 'updatedAt', dir: 'desc' }).map((item) => item.slug)).toEqual(['index', 'about', 'café', 'pricing'])
    expect(sortRows(rows, { key: 'updatedAt', dir: 'asc' }).map((item) => item.slug)).toEqual(['café', 'about', 'index', 'pricing'])
    expect(sortRows(rows, { key: 'title', dir: 'asc' }).map((item) => item.title)).toEqual(['About', 'Café', 'Home', 'Pricing'])
  })

  it('pages ten rows at a time and clamps the page', () => {
    const many = Array.from({ length: 14 }, (_, index) => index)
    expect(paginate(many, 1)).toMatchObject({ page: 1, pages: 2, range: '1–10 of 14' })
    expect(paginate(many, 9)).toMatchObject({ page: 2, rows: [10, 11, 12, 13], range: '11–14 of 14' })
    expect(paginate([], 1)).toMatchObject({ page: 1, pages: 1, range: '0 of 0' })
  })

  it('finds a free slug for a copy', () => {
    expect(copySlug('about', new Set(['about']))).toBe('about-copy')
    expect(copySlug('about', new Set(['about', 'about-copy', 'about-copy-2']))).toBe('about-copy-3')
  })
})

describe('JSON-LD cards', () => {
  it('tells valid, incomplete and broken blocks apart', () => {
    expect(checkBlockText('{"@context":"https://schema.org","@type":"Organization"}').state).toBe('valid')
    expect(checkBlockText('{"@type":"Organization"}')).toMatchObject({ state: 'warning', message: 'Missing @context or @type.' })
    expect(checkBlockText('{"@type":')).toMatchObject({ state: 'error' })
    expect(checkBlockText('')).toMatchObject({ state: 'error' })
  })

  it('unwraps a pasted script tag', () => {
    const state = checkBlockText('<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite"}</script>')
    expect(state.state).toBe('valid')
  })

  it('names a card by its @type and @id', () => {
    expect(blockLabel('{"@type":"WebSite","@id":"#website"}')).toEqual({ type: 'WebSite', id: '#website' })
    expect(blockLabel('nope')).toEqual({ type: 'Block', id: '' })
  })
})
