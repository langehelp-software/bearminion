import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  createEntrySchema,
  createListingSchema,
  defineTypes,
  entryKey,
  entryPath,
  listingKey,
  listingPageCount,
  listingPath,
  multi,
  reservedSlugs,
  resolveTypes,
  single,
  sortEntries,
  type MultiType,
} from '../src/content-types.js'
import { createPageSchema, createTolerantPageSchema } from '../src/page.js'
import { sectionRegistry } from './starter.js'

const blogFields = z.object({
  date: z.iso.date(),
  excerpt: z.string().max(200).optional(),
  featured: z.boolean().default(false),
  rank: z.number(),
  tags: z.array(z.string()).default([]),
})

const blog = () =>
  multi({
    path: '/blog/{slug}',
    fields: blogFields,
    sort: { by: 'date', order: 'desc' },
    listing: { perPage: 5 },
    sections: ['hero', 'cta'],
  })

function multiOf(types: Parameters<typeof resolveTypes>[0]['types'], id: string): MultiType {
  const type = resolveTypes({ types }).get(id)
  if (type?.kind !== 'multi') throw new Error(`no multi type ${id}`)
  return type
}

const seo = { title: 'T', description: '', noindex: false, nofollow: false }
const hero = (id = 'hero') => ({ id, type: 'hero', props: structuredClone(sectionRegistry.hero.defaults) })

describe('resolveTypes', () => {
  it('gives the three built-in types when the site declares none', () => {
    const types = resolveTypes({})
    expect(types.home).toMatchObject({ kind: 'single', path: '/', slug: 'index', key: 'pages/index.json', builtIn: true })
    expect(types.notFound).toMatchObject({ kind: 'single', path: '/404', slug: '404', key: 'pages/404.json', builtIn: true })
    expect(types.pages).toMatchObject({ id: 'pages', prefix: '', dir: 'pages', fields: null, sections: null, sort: null, listing: null })
    expect(types.pages).toMatchObject({ rename: true, delete: true })
    expect(types.multi.map((type) => type.id)).toEqual(['pages'])
    expect(types.singles.map((type) => type.id)).toEqual(['home', 'not-found'])
    expect(types.get('nope')).toBeUndefined()
  })

  it('feeds the pages option into the built-in pages type, and the type itself wins', () => {
    expect(resolveTypes({}, { rename: false, delete: true }).pages).toMatchObject({ rename: false, delete: true })
    const tuned = resolveTypes({ types: { pages: multi({ rename: true }) } }, { rename: false, delete: false })
    expect(tuned.pages).toMatchObject({ rename: true, delete: false })
  })

  it('fills in the defaults of a declared type', () => {
    const news = multiOf({ news: multi() }, 'news')
    expect(news).toMatchObject({ label: 'News', prefix: 'news', dir: 'news', listing: null, rename: true, delete: true })
    expect(news.sort).toEqual({ by: 'title', order: 'asc' })
    const listed = multiOf({ 'case-studies': multi({ path: '/work/{slug}', listing: {} }) }, 'case-studies')
    expect(listed).toMatchObject({ label: 'Case studies', prefix: 'work', dir: 'case-studies' })
    expect(listed.listing).toEqual({ slug: 'work', perPage: 10 })
  })

  it('accepts a plain object as a multi type', () => {
    expect(multiOf({ news: { path: '/n/{slug}' } }, 'news').prefix).toBe('n')
  })

  it('resolves a single the site declares', () => {
    const types = resolveTypes({ types: { about: single({ path: '/about-us', sections: ['hero'] }) } })
    expect(types.get('about')).toMatchObject({
      kind: 'single',
      label: 'About',
      path: '/about-us',
      slug: 'about-us',
      key: 'singles/about.json',
      sections: ['hero'],
      builtIn: false,
    })
    expect(types.singles.map((type) => type.id)).toEqual(['home', 'not-found', 'about'])
  })

  it('returns the same object for the same config', () => {
    const types = { blog: blog() }
    expect(resolveTypes({ types })).toBe(resolveTypes({ types }))
    expect(resolveTypes({})).toBe(resolveTypes({}))
  })

  it.each([
    ['an id that is not kebab-case', { Blog: multi() }, /"Blog" must be lowercase kebab-case/],
    ['a built-in id', { home: multi() }, /"home" cannot be a type id\. It is built in/],
    ['a reserved id', { site: multi() }, /"site" cannot be a type id/],
    ['the singles folder as an id', { singles: multi() }, /"singles" cannot be a type id/],
    ['a nested path', { blog: multi({ path: '/a/b/{slug}' }) }, /path must look like "\/blog\/\{slug\}"/],
    ['a path without a slug', { blog: multi({ path: '/blog' }) }, /path must look like/],
    ['a path on pages', { pages: multi({ path: '/p/{slug}' }) }, /always at "\/\{slug\}"/],
    ['a listing on pages', { pages: multi({ listing: {} }) }, /has no listing page/],
    ['pages as a single', { pages: single({ path: '/pages' }) }, /has many entries/],
    [
      'two types on one prefix',
      { a: multi({ path: '/x/{slug}' }), b: multi({ path: '/x/{slug}' }) },
      /"\/x" is already the address of the entries of "a"/,
    ],
    [
      'a listing on another type prefix',
      { a: multi(), b: multi({ listing: { slug: 'a' } }) },
      /"\/a" is already the address of the entries of "a"/,
    ],
    ['a single on a type prefix', { blog: multi(), about: single({ path: '/blog' }) }, /already the address of the entries of "blog"/],
    ['a prefix on a built-in address', { blog: multi({ path: '/404/{slug}' }) }, /address of a built-in page/],
    ['a single on the home slug', { start: single({ path: '/index' }) }, /address of a built-in page/],
    ['a nested single', { about: { kind: 'single', path: '/a/b' } }, /path must be one segment/],
  ])('refuses %s', (_name, types, message) => {
    expect(() => resolveTypes({ types: types as never })).toThrow(message)
  })

  it.each([
    ['an unknown option', () => multi({ pth: '/blog/{slug}' } as never), /unknown option "pth"/],
    ['an unknown single option', () => single({ path: '/a', sort: { by: 'title' } } as never), /unknown option "sort"/],
    ['an unknown listing option', () => multi({ listing: { size: 3 } as never }), /unknown option listing\.size/],
    ['perPage of zero', () => multi({ listing: { perPage: 0 } }), /from 1 to 100/],
    ['perPage above the limit', () => multi({ listing: { perPage: 101 } }), /from 1 to 100/],
    ['a fractional perPage', () => multi({ listing: { perPage: 2.5 } }), /from 1 to 100/],
    ['a listing slug with a slash', () => multi({ listing: { slug: 'a/b' } }), /one lowercase kebab-case segment/],
    ['a sort order that is not one', () => multi({ sort: { by: 'title', order: 'up' as never } }), /"asc" or "desc"/],
    ['fields that are not an object schema', () => multi({ fields: z.string() as never }), /fields must be a z\.object/],
    ['an empty section list', () => multi({ sections: [] }), /sections is empty/],
    ['a non-boolean lock', () => multi({ rename: 'no' as never }), /rename must be true or false/],
  ])('refuses %s where it is written', (_name, declare, message) => {
    expect(declare).toThrow(message)
  })

  it('checks sort.by against the fields', () => {
    const fields = z.object({ date: z.iso.date(), excerpt: z.string().optional(), tags: z.array(z.string()), when: z.coerce.date() })
    expect(() => defineTypes({ b: multi({ fields, sort: { by: 'nope' } }) })).toThrow(
      /"nope" is not a field of this type\. Known: title, date/,
    )
    expect(() => defineTypes({ b: multi({ fields, sort: { by: 'excerpt' } }) })).toThrow(/it is optional/)
    expect(() => defineTypes({ b: multi({ fields, sort: { by: 'tags' } }) })).toThrow(/a array has no order/)
    expect(() => defineTypes({ b: multi({ sort: { by: 'date' } }) })).toThrow(/is not a field/)
    expect(multiOf({ b: multi({ fields, sort: { by: 'when' } }) }, 'b').sort).toEqual({ by: 'when', order: 'asc' })
    expect(multiOf({ b: multi({ fields: blogFields, sort: { by: 'featured' } }) }, 'b').sort?.by).toBe('featured')
  })

  it('checks section lists against the registry when it is given one', () => {
    const types = { blog: multi({ sections: ['hero', 'nope'] }) }
    expect(() => resolveTypes({ types })).not.toThrow()
    expect(() => resolveTypes({ types, sections: sectionRegistry })).toThrow(/names "nope", which the site does not define/)
  })
})

describe('addresses and store keys', () => {
  const types = resolveTypes({ types: { blog: blog(), news: multi({ listing: { slug: 'latest' } }), about: single({ path: '/about' }) } })
  const blogType = types.get('blog') as MultiType
  const newsType = types.get('news') as MultiType

  it('places entries and listings', () => {
    expect(entryKey(types.pages, 'contact')).toBe('pages/contact.json')
    expect(entryKey(blogType, 'first')).toBe('blog/first.json')
    expect(listingKey(blogType)).toBe('blog/_listing.json')
    expect(entryPath(types.pages, 'contact')).toBe('/contact')
    expect(entryPath(blogType, 'first')).toBe('/blog/first')
    expect(listingPath(blogType)).toBe('/blog')
    expect(listingPath(blogType, 3)).toBe('/blog/page/3')
    expect(listingPath(newsType, 2)).toBe('/latest/page/2')
    expect(() => listingPath(types.pages)).toThrow(/no listing/)
  })

  it('counts listing pages, with page 1 even when there is nothing to list', () => {
    expect(listingPageCount(blogType, 0)).toBe(1)
    expect(listingPageCount(blogType, 5)).toBe(1)
    expect(listingPageCount(blogType, 11)).toBe(3)
    expect(listingPageCount(types.pages, 4)).toBe(0)
  })

  it('reserves the slugs whose address belongs to something else', () => {
    expect([...reservedSlugs(types, types.pages)].sort()).toEqual(['404', 'about', 'blog', 'index', 'latest', 'news'])
    expect([...reservedSlugs(types, blogType)]).toEqual(['page'])
    // The news listing is at /latest, so /news/page is free for an entry.
    expect([...reservedSlugs(types, newsType)]).toEqual([])
  })
})

describe('createEntrySchema', () => {
  it('is the page schema itself for a type with no fields and no section list', () => {
    const { pages, home } = resolveTypes({})
    expect(createEntrySchema(sectionRegistry, pages)).toBe(createPageSchema(sectionRegistry))
    expect(createEntrySchema(sectionRegistry, home, { tolerateOrphans: true })).toBe(createTolerantPageSchema(sectionRegistry))
  })

  const type = multiOf({ blog: blog() }, 'blog')
  const entry = (extra: Record<string, unknown> = {}) => ({
    slug: 'first',
    title: 'First',
    seo,
    sections: [hero()],
    fields: { date: '2026-01-05', rank: 2 },
    ...extra,
  })

  it('validates fields with the type schema and applies its defaults', () => {
    const parsed = createEntrySchema(sectionRegistry, type).parse(entry())
    expect(parsed.fields).toEqual({ date: '2026-01-05', rank: 2, featured: false, tags: [] })
    const bad = createEntrySchema(sectionRegistry, type).safeParse(entry({ fields: { date: 'soon', rank: 2 } }))
    expect(bad.success).toBe(false)
    expect(bad.error?.issues[0]?.path).toEqual(['fields', 'date'])
  })

  it('requires fields and refuses unknown top-level keys', () => {
    const schema = createEntrySchema(sectionRegistry, type)
    expect(schema.safeParse(entry({ fields: undefined })).success).toBe(false)
    expect(schema.safeParse(entry({ extra: 1 })).success).toBe(false)
  })

  it('refuses a section type outside the list, and names the allowed ones', () => {
    const faq = { id: 'faq', type: 'faq', props: structuredClone(sectionRegistry.faq.defaults) }
    const result = createEntrySchema(sectionRegistry, type).safeParse(entry({ sections: [hero(), faq] }))
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({ path: ['sections', 1, 'type'], message: expect.stringContaining('Allowed: hero, cta') })
  })

  it('keeps the page rules: unique section ids', () => {
    const result = createEntrySchema(sectionRegistry, type).safeParse(entry({ sections: [hero('a'), hero('a')] }))
    expect(result.error?.issues[0]?.message).toMatch(/Duplicate section id/)
  })

  it('keeps an orphaned section only when tolerant, and leaves it to the orphan rule', () => {
    const orphan = { id: 'old', type: 'gone', props: {} }
    expect(createEntrySchema(sectionRegistry, type).safeParse(entry({ sections: [orphan] })).success).toBe(false)
    expect(createEntrySchema(sectionRegistry, type, { tolerateOrphans: true }).safeParse(entry({ sections: [orphan] })).success).toBe(true)
  })

  it('caches per type, registry and strictness', () => {
    expect(createEntrySchema(sectionRegistry, type)).toBe(createEntrySchema(sectionRegistry, type))
    expect(createEntrySchema(sectionRegistry, type)).not.toBe(createEntrySchema(sectionRegistry, type, { tolerateOrphans: true }))
  })
})

describe('createListingSchema', () => {
  it('takes a title, SEO and any section, and no slug', () => {
    const schema = createListingSchema(sectionRegistry)
    expect(schema.safeParse({ title: 'Blog', seo, sections: [hero()] }).success).toBe(true)
    expect(schema.safeParse({ title: 'Blog', seo, sections: [] }).success).toBe(true)
    expect(schema.safeParse({ slug: 'blog', title: 'Blog', seo, sections: [] }).success).toBe(false)
    expect(schema.safeParse({ title: '', seo, sections: [] }).success).toBe(false)
  })
})

describe('sortEntries', () => {
  const item = (slug: string, title: string, fields: Record<string, unknown> = {}) => ({ slug, title, fields })

  it('keeps the given order when the type has no sort rule', () => {
    const entries = [item('b', 'B'), item('a', 'A')]
    expect(sortEntries(resolveTypes({}).pages, entries).map((entry) => entry.slug)).toEqual(['b', 'a'])
  })

  it('sorts by title by default, numbers inside by value, case ignored', () => {
    const type = multiOf({ news: multi() }, 'news')
    const sorted = sortEntries(type, [item('x', 'Part 10'), item('y', 'part 2'), item('z', 'Alpha')])
    expect(sorted.map((entry) => entry.title)).toEqual(['Alpha', 'part 2', 'Part 10'])
  })

  it('sorts by a date field, newest first, and breaks ties by slug', () => {
    const type = multiOf({ blog: blog() }, 'blog')
    const sorted = sortEntries(type, [
      item('b', 'B', { date: '2026-01-05' }),
      item('old', 'Old', { date: '2025-12-31' }),
      item('a', 'A', { date: '2026-01-05' }),
      item('new', 'New', { date: '2026-02-01' }),
    ])
    expect(sorted.map((entry) => entry.slug)).toEqual(['new', 'a', 'b', 'old'])
  })

  it('sorts numbers, booleans and Date values', () => {
    const fields = z.object({ rank: z.number(), featured: z.boolean(), when: z.coerce.date() })
    const by = (name: string, order: 'asc' | 'desc' = 'asc') => multiOf({ t: multi({ fields, sort: { by: name, order } }) }, 't')
    const entries = [
      item('a', 'A', { rank: 10, featured: false, when: new Date('2026-03-01') }),
      item('b', 'B', { rank: 2, featured: true, when: new Date('2026-01-01') }),
    ]
    expect(sortEntries(by('rank'), entries).map((entry) => entry.slug)).toEqual(['b', 'a'])
    expect(sortEntries(by('featured', 'desc'), entries).map((entry) => entry.slug)).toEqual(['b', 'a'])
    expect(sortEntries(by('when'), entries).map((entry) => entry.slug)).toEqual(['b', 'a'])
  })

  it('orders strings by the locale it is given', () => {
    const type = multiOf({ news: multi() }, 'news')
    const entries = [item('z', 'Zebra'), item('a', 'Äpfel')]
    expect(sortEntries(type, entries, 'de').map((entry) => entry.slug)).toEqual(['a', 'z'])
    expect(sortEntries(type, entries, 'sv').map((entry) => entry.slug)).toEqual(['z', 'a'])
  })

  it('does not change the list it is given', () => {
    const type = multiOf({ news: multi() }, 'news')
    const entries = [item('b', 'B'), item('a', 'A')]
    sortEntries(type, entries)
    expect(entries.map((entry) => entry.slug)).toEqual(['b', 'a'])
  })
})
