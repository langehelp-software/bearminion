// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ContentTypeInfo } from '../src/api-types.js'
import { linkWarning, type PageDraft } from '../src/draft.js'
import { fieldLabel, setTypeField, widgetFor } from '../src/ui/forms/type-fields-form.js'
import { createEditor } from '../src/ui/state/editor.js'
import { typeDocuments } from '../src/ui/state/session.js'
import type { Catalog, SiteDraft } from '../src/ui/types.js'

const catalog: Catalog = {
  sectionOptions: { hero: [], cta: [] },
  siteOptions: [],
  contentCounts: {},
  sectionDefaults: { hero: { heading: 'New section' }, cta: {} },
  sectionLabels: { hero: 'Hero', cta: 'Call to action' },
  pageRules: { rename: true, delete: true },
}

const field = (name: string, schema: Record<string, unknown> | null, required = true) => ({
  name,
  required,
  schema,
  readOnly: schema === null,
})

const types: ContentTypeInfo[] = [
  { id: 'home', kind: 'single', label: 'Home', path: '/', builtIn: true, fields: null, sections: null },
  { id: 'not-found', kind: 'single', label: '404', path: '/404', builtIn: true, fields: null, sections: null },
  { id: 'about', kind: 'single', label: 'About', path: '/about', builtIn: false, fields: null, sections: ['hero'] },
  {
    id: 'pages',
    kind: 'multi',
    label: 'Pages',
    path: '/{slug}',
    builtIn: true,
    fields: null,
    sections: null,
    sort: null,
    listing: null,
    rename: true,
    delete: true,
  },
  {
    id: 'blog',
    kind: 'multi',
    label: 'Blog',
    path: '/blog/{slug}',
    builtIn: false,
    fields: [field('date', { type: 'string', format: 'date' })],
    sections: ['hero'],
    sort: { by: 'date', order: 'desc' },
    listing: { slug: 'blog', perPage: 10, path: '/blog' },
    rename: false,
    delete: true,
  },
]

const site: SiteDraft = { name: 'Site', header: { links: [] } }
const seo = { title: 'T', description: '' }
const draft = (slug: string, extra: Partial<PageDraft> = {}): PageDraft => ({
  slug,
  title: slug,
  seo,
  sections: [{ id: 'hero', type: 'hero', props: {} }],
  ...extra,
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** A dev server that answers the routes the editor loads from, and records what it is sent. */
function server(opened: unknown) {
  const sent: { url: string; body: unknown }[] = []
  const answers: Record<string, unknown> = {
    '/schema': catalog,
    '/site': site,
    '/pages': {
      pages: [
        { slug: 'index', title: 'Home', file: 'index.json' },
        { slug: 'contact', title: 'Contact', file: 'contact.json', anchors: ['form'] },
      ],
    },
    '/images': { images: [] },
    '/types': { types },
    '/types/blog/entries': {
      entries: [{ slug: 'first', title: 'First', file: 'first.json', path: '/blog/first', sortValue: '2026-01-05', anchors: ['intro'] }],
    },
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input).replace('/__bearminion/api', '')
      if (init?.body) sent.push({ url, body: JSON.parse(String(init.body)) })
      if (url.startsWith('/document')) return opened === null ? json({ error: 'not_found', message: 'none' }, 404) : json(opened)
      if (url === '/save') {
        const body = JSON.parse(String(init?.body)) as { page?: { document: unknown } }
        return json({ page: body.page?.document })
      }
      return url in answers ? json(answers[url]) : json({ error: 'not_found', message: url }, 404)
    }),
  )
  return sent
}

async function open(pathname: string, opened: unknown) {
  const sent = server(opened)
  window.history.replaceState(null, '', pathname)
  const editor = createEditor()
  await editor.session.load()
  return { editor, sent }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the editor on a page, as before content types', () => {
  it('opens a page with the keys it always had and saves it without a type', async () => {
    const { editor, sent } = await open('/contact', { type: 'pages', kind: 'entry', slug: 'contact', document: draft('contact') })
    const { doc } = editor
    expect(doc.ref.value).toEqual({ type: 'pages', kind: 'entry' })
    expect(doc.draftId.value).toBe('contact')
    expect(doc.pageFile.value).toBe('pages/contact.json')
    expect(doc.href.value).toBe('/contact')
    expect(doc.linkKey.value).toBe('contact')
    expect(doc.allowedSections.value).toBeNull()
    expect(doc.renameRule.value.allowed).toBe(true)
    editor.edits.updatePage({ ...(doc.page.value as PageDraft), title: 'Changed' })
    expect(await editor.session.save()).toBe('saved')
    expect(sent.at(-1)).toMatchObject({ url: '/save', body: { page: { from: 'contact', document: { title: 'Changed' } } } })
    const saved = sent.at(-1)?.body as { page: object } | undefined
    expect(saved?.page).not.toHaveProperty('type')
  })

  it('still loads the site when the address is not a content page', async () => {
    const { editor } = await open('/style-guide', null)
    expect(editor.doc.page.value).toBeNull()
    expect(editor.doc.site.value).toEqual(site)
    expect(editor.doc.ref.value).toEqual({ type: 'pages', kind: 'entry' })
  })
})

describe('the editor on a document of a declared type', () => {
  it('opens an entry by its address and saves it with its type', async () => {
    const entry = draft('first', { fields: { date: '2026-01-05' } })
    const { editor, sent } = await open('/blog/first', { type: 'blog', kind: 'entry', slug: 'first', document: entry })
    const { doc } = editor
    expect(doc.page.value).toEqual(entry)
    expect(doc.ref.value).toEqual({ type: 'blog', kind: 'entry' })
    expect(doc.savedSlug.value).toBe('first')
    // A page called `first` keeps its own draft, undo steps and history.
    expect(doc.draftId.value).toBe('blog~first')
    expect(doc.pageFile.value).toBe('blog/first.json')
    expect(doc.href.value).toBe('/blog/first')
    expect(doc.linkKey.value).toBe('/blog/first')
    expect(doc.allowedSections.value).toEqual(['hero'])
    expect(doc.renameRule.value).toMatchObject({ allowed: false })
    expect(doc.typeInfo.value?.fields?.[0]?.name).toBe('date')

    editor.edits.updatePage({ ...entry, fields: { date: '2026-02-02' } })
    expect(doc.pageDirty.value).toBe(true)
    expect(await editor.session.save()).toBe('saved')
    expect(sent.at(-1)?.body).toEqual({ page: { type: 'blog', from: 'first', document: { ...entry, fields: { date: '2026-02-02' } } } })
    expect(doc.pageDirty.value).toBe(false)
  })

  it('opens a listing page as a page with the listing address, and saves it without that slug', async () => {
    const listing = { title: 'Blog', seo, sections: [] }
    const { editor, sent } = await open('/blog/page/2', { type: 'blog', kind: 'listing', slug: 'blog', page: 2, document: listing })
    const { doc } = editor
    expect(doc.page.value).toEqual({ ...listing, slug: 'blog' })
    expect(doc.pageDirty.value).toBe(false)
    expect(doc.draftId.value).toBe('blog~_listing')
    expect(doc.pageFile.value).toBe('blog/_listing.json')
    // A listing has an address per page, so a save never sends the editor somewhere else.
    expect(doc.href.value).toBeNull()
    // The listing may show any section, whatever its entries are limited to.
    expect(doc.allowedSections.value).toBeNull()
    expect(doc.renameRule.value.allowed).toBe(false)

    editor.edits.updatePage({ ...(doc.page.value as PageDraft), title: 'Journal' })
    expect(await editor.session.save()).toBe('saved')
    expect(sent.at(-1)?.body).toEqual({ page: { type: 'blog', listing: true, document: { ...listing, title: 'Journal' } } })
    expect(doc.page.value?.slug).toBe('blog')
    expect(doc.pageDirty.value).toBe(false)

    editor.edits.updatePage({ ...(doc.page.value as PageDraft), slug: 'news' })
    expect(await editor.session.save()).toBe('failed')
  })

  it('opens a single and saves it with its type alone', async () => {
    const about = draft('about')
    const { editor, sent } = await open('/about', { type: 'about', kind: 'single', slug: 'about', document: about })
    const { doc } = editor
    expect(doc.draftId.value).toBe('about~_single')
    expect(doc.pageFile.value).toBe('singles/about.json')
    expect(doc.href.value).toBe('/about')
    editor.edits.updatePage({ ...about, title: 'About us' })
    expect(await editor.session.save()).toBe('saved')
    expect(sent.at(-1)?.body).toEqual({ page: { type: 'about', document: { ...about, title: 'About us' } } })
  })

  it('lists pages first, then the documents of declared types with their addresses', async () => {
    const { editor } = await open('/contact', { type: 'pages', kind: 'entry', slug: 'contact', document: draft('contact') })
    expect(editor.doc.pages.value.map((item) => [item.type ?? 'pages', item.path ?? `/${item.slug}`, item.fixed ?? ''])).toEqual([
      ['pages', '/index', ''],
      ['pages', '/contact', ''],
      ['about', '/about', 'single'],
      ['blog', '/blog', 'listing'],
      ['blog', '/blog/first', ''],
    ])
    expect(editor.doc.pages.value.at(-1)).toMatchObject({ sortValue: '2026-01-05', anchors: ['intro'] })
  })
})

describe('typeDocuments', () => {
  it('lists nothing for a site with only the built-in types', () => {
    expect(
      typeDocuments(
        types.filter((type) => type.builtIn),
        {},
      ),
    ).toEqual([])
  })
})

describe('links to documents of declared types', () => {
  const pages = [
    { slug: 'index', anchors: ['top'] },
    { slug: 'first', anchors: ['intro'], path: '/blog/first' },
    { slug: 'blog', anchors: [], path: '/blog' },
  ]

  it('finds an entry and a listing page by address, not by slug', () => {
    expect(linkWarning('/blog/first', pages, 'index')).toBeNull()
    expect(linkWarning('/blog/first#intro', pages, 'index')).toBeNull()
    expect(linkWarning('/blog/first#nope', pages, 'index')).toBe('No anchor "#nope" on /blog/first.')
    expect(linkWarning('/blog/', pages, 'index')).toBeNull()
    expect(linkWarning('/blog/page/2', pages, 'index')).toBeNull()
    expect(linkWarning('/first', pages, 'index')).toBe('No page at /first.')
    expect(linkWarning('/blog/nope', pages, 'index')).toBe('No page at /blog/nope.')
  })

  it('checks a bare anchor against the open document, named by its address', () => {
    expect(linkWarning('#intro', pages, '/blog/first')).toBeNull()
    expect(linkWarning('#top', pages, '/blog/first')).toBe('No anchor "#top" on this page.')
    expect(linkWarning('#top', pages, 'index')).toBeNull()
  })
})

describe('the form for a type’s own fields', () => {
  it('picks a control from the field schema', () => {
    expect(widgetFor(field('date', { type: 'string', format: 'date' }))).toBe('date')
    expect(widgetFor(field('title', { type: 'string' }))).toBe('text')
    expect(widgetFor(field('slug', { type: 'string', maxLength: 60 }))).toBe('text')
    expect(widgetFor(field('excerpt', { type: 'string', maxLength: 200 }))).toBe('longText')
    expect(widgetFor(field('draft', { type: 'boolean', default: false }))).toBe('boolean')
    expect(widgetFor(field('rank', { type: 'integer' }))).toBe('number')
    expect(widgetFor(field('level', { type: 'string', enum: ['a', 'b'] }))).toBe('choice')
    expect(widgetFor(field('tags', { type: 'array', items: { type: 'string' } }))).toBe('list')
    expect(widgetFor(field('cover', { type: 'object', properties: { src: {}, alt: {} } }))).toBe('image')
    expect(widgetFor(field('cover', { type: 'string', bearminion: 'image' }))).toBe('imagePath')
    expect(widgetFor(field('when', { anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }] }, false))).toBe('date')
  })

  it('shows what it cannot edit instead of dropping it', () => {
    expect(widgetFor(field('meta', { type: 'object', properties: { a: {} } }))).toBe('none')
    expect(widgetFor(field('odd', null))).toBe('none')
    expect(widgetFor({ ...field('locked', { type: 'string' }), readOnly: true })).toBe('none')
  })

  it('removes an optional field that was emptied and keeps a required one', () => {
    const optional = field('excerpt', { type: 'string' }, false)
    const required = field('date', { type: 'string', format: 'date' })
    expect(setTypeField({ date: 'x', excerpt: 'y' }, optional, '')).toEqual({ date: 'x' })
    expect(setTypeField({ date: 'x' }, optional, 'New')).toEqual({ date: 'x', excerpt: 'New' })
    expect(setTypeField({ date: 'x' }, required, '')).toEqual({ date: '' })
    expect(setTypeField({ tags: ['a'] }, field('tags', { type: 'array' }, false), [])).toEqual({})
    expect(setTypeField({}, field('draft', { type: 'boolean' }, false), false)).toEqual({ draft: false })
  })

  it('labels a field from its name', () => {
    expect(fieldLabel('publishDate')).toBe('Publish date')
    expect(fieldLabel('cover_image')).toBe('Cover image')
    expect(fieldLabel('date')).toBe('Date')
  })
})
