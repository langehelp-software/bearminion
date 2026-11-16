// @vitest-environment happy-dom
import { h, render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContentTypeInfo } from '../src/api-types.js'
import type { PageDraft } from '../src/draft.js'
import { SectionPicker } from '../src/ui/overlay/section-picker.js'
import { ListingView } from '../src/ui/shell/listing.js'
import { PagePanel } from '../src/ui/shell/panels.js'
import { EditorContext, createEditor, type Editor } from '../src/ui/state/editor.js'
import type { Catalog, SiteDraft } from '../src/ui/types.js'

const catalog: Catalog = {
  sectionOptions: { hero: [], cta: [], faq: [] },
  siteOptions: [],
  contentCounts: {},
  sectionDefaults: { hero: {}, cta: {}, faq: {} },
  sectionLabels: { hero: 'Hero', cta: 'Call to action', faq: 'FAQ' },
  pageRules: { rename: true, delete: true },
}

const types: ContentTypeInfo[] = [
  { id: 'home', kind: 'single', label: 'Home', path: '/', builtIn: true, fields: null, sections: null },
  { id: 'not-found', kind: 'single', label: '404', path: '/404', builtIn: true, fields: null, sections: null },
  { id: 'about', kind: 'single', label: 'About', path: '/about', builtIn: false, fields: null, sections: null },
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
    fields: [
      { name: 'date', required: true, readOnly: false, schema: { type: 'string', format: 'date' } },
      { name: 'excerpt', required: false, readOnly: false, schema: { type: 'string', maxLength: 200 } },
      { name: 'draft', required: false, readOnly: false, schema: { type: 'boolean', default: false } },
      { name: 'level', required: true, readOnly: false, schema: { type: 'string', enum: ['basic', 'deep'] } },
      { name: 'meta', required: false, readOnly: true, schema: null },
    ],
    sections: ['hero', 'cta'],
    sort: { by: 'date', order: 'desc' },
    listing: { slug: 'blog', perPage: 10, path: '/blog' },
    rename: true,
    delete: false,
  },
  {
    id: 'notes',
    kind: 'multi',
    label: 'Notes',
    path: '/notes/{slug}',
    builtIn: false,
    fields: null,
    sections: null,
    sort: { by: 'title', order: 'asc' },
    listing: null,
    rename: true,
    delete: true,
  },
]

const site: SiteDraft = { name: 'Site', url: 'https://example.com', header: { links: [] } }
const seo = { title: 'T', description: '' }
const entry: PageDraft = {
  slug: 'first',
  title: 'First',
  seo,
  sections: [{ id: 'hero', type: 'hero', props: {} }],
  fields: { date: '2026-01-05', excerpt: 'Short', level: 'basic', meta: { a: 1 } },
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function server(opened: unknown) {
  const sent: { url: string; method: string; body: unknown }[] = []
  const answers: Record<string, unknown> = {
    '/schema': catalog,
    '/site': site,
    '/pages': {
      pages: [
        { slug: 'index', title: 'Home', file: 'index.json' },
        { slug: '404', title: 'Not found', file: '404.json', system: true },
        { slug: 'contact', title: 'Contact', file: 'contact.json' },
      ],
    },
    '/images': { images: [] },
    '/types': { types },
    '/types/blog/entries': {
      entries: [
        { slug: 'second', title: 'Second', file: 'second.json', path: '/blog/second', sortValue: '2026-02-01', anchors: [] },
        { slug: 'first', title: 'First', file: 'first.json', path: '/blog/first', sortValue: '2026-01-05', anchors: [] },
      ],
    },
    '/types/notes/entries': { entries: [] },
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input).replace('/__bearminion/api', '')
      const method = init?.method ?? 'GET'
      if (method !== 'GET') sent.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url.startsWith('/document')) return json(opened)
      if (method === 'POST' && url.endsWith('/entries')) return json({ slug: 'x' }, 201)
      return url in answers ? json(answers[url]) : json({ error: 'not_found', message: url }, 404)
    }),
  )
  return sent
}

describe('the Pages tab on a site with content types', () => {
  let container: HTMLElement
  let editor: Editor
  let sent: ReturnType<typeof server>

  async function open(pathname: string, opened: unknown) {
    sent = server(opened)
    window.history.replaceState(null, '', pathname)
    editor = createEditor()
    await editor.session.load()
    render(
      h(
        EditorContext.Provider,
        { value: editor },
        h('div', null, ...['pages', 'blog', 'notes'].map((type) => h(ListingView, { catalog, type })), h(PagePanel, { catalog })),
      ),
      container,
    )
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
  })

  afterEach(() => {
    render(null, container)
    container.remove()
    vi.unstubAllGlobals()
  })

  const headings = () => [...container.querySelectorAll('.bm-group')].map((node) => node.textContent?.replace(/\s+/g, ' ').trim())
  const rows = (index: number) =>
    [...(container.querySelectorAll('.bm-listing')[index]?.querySelectorAll('.bm-tr:not(.bm-thead)') ?? [])].map((row) => ({
      title: row.querySelector('.bm-row-title')?.textContent,
      href: row.querySelector('.bm-row-actions a')?.getAttribute('href'),
      badges: [...row.querySelectorAll('.bm-chip')].map((badge) => badge.textContent?.trim()),
      deletable: row.querySelector('.bm-row-delete') !== null,
    }))
  const labelled = (text: string) =>
    [...container.querySelectorAll('label')].find((label) => label.textContent?.trim().startsWith(text)) as HTMLLabelElement | undefined
  const input = (text: string) =>
    labelled(text)?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')

  it('lists pages with the singles, then each declared type in its own list', async () => {
    await open('/blog/first', { type: 'blog', kind: 'entry', slug: 'first', document: entry })
    expect([...container.querySelectorAll('.bm-listing h1')].map((node) => node.textContent)).toEqual(['Pages', 'Blog', 'Notes'])
    expect(rows(0)).toEqual([
      { title: 'Home', href: '/', badges: ['home'], deletable: false },
      { title: 'Not found', href: '/404', badges: ['system'], deletable: false },
      { title: 'Contact', href: '/contact', badges: [], deletable: true },
      { title: 'About', href: '/about', badges: ['single'], deletable: false },
    ])
    // Blog turns deleting off; its listing page is a row of its own, which is never deleted.
    expect(rows(1)).toEqual([
      { title: 'Blog: listing page', href: '/blog', badges: ['listing'], deletable: false },
      { title: 'Second', href: '/blog/second', badges: [], deletable: false },
      { title: 'First', href: '/blog/first', badges: ['editing'], deletable: false },
    ])
    expect(rows(2)).toEqual([])
    expect(container.querySelectorAll('.bm-listing')[2]?.textContent).toContain('No entries here yet.')
  })

  it('edits the fields of the open entry with a control per field', async () => {
    await open('/blog/first', { type: 'blog', kind: 'entry', slug: 'first', document: entry })
    expect(headings()).toContain('Entry · First')
    expect(headings()).toContain('Fields')
    const date = input('Date') as HTMLInputElement
    expect(date.type).toBe('date')
    expect(date.value).toBe('2026-01-05')
    expect((input('Excerpt') as HTMLTextAreaElement).tagName).toBe('TEXTAREA')
    expect((input('Draft') as HTMLInputElement).getAttribute('role')).toBe('switch')
    expect([...(input('Level') as HTMLSelectElement).options].map((option) => option.value)).toEqual(['basic', 'deep'])
    // A field the editor has no control for is shown, not dropped.
    expect(container.textContent).toContain('{"a":1}')

    date.value = '2026-03-03'
    date.dispatchEvent(new Event('input', { bubbles: true }))
    expect(editor.doc.page.value?.fields).toMatchObject({ date: '2026-03-03', excerpt: 'Short', meta: { a: 1 } })
    expect(editor.doc.pageDirty.value).toBe(true)

    const excerpt = input('Excerpt') as HTMLTextAreaElement
    excerpt.value = ''
    excerpt.dispatchEvent(new Event('input', { bubbles: true }))
    expect(editor.doc.page.value?.fields).not.toHaveProperty('excerpt')

    const draft = input('Draft') as HTMLInputElement
    draft.checked = true
    draft.dispatchEvent(new Event('change', { bubbles: true }))
    expect(editor.doc.page.value?.fields?.draft).toBe(true)
  })

  it('keeps the slug of an entry editable and fixes the address of a listing page and a single', async () => {
    await open('/blog/first', { type: 'blog', kind: 'entry', slug: 'first', document: entry })
    expect((input('Slug') as HTMLInputElement).disabled).toBe(false)
    render(null, container)

    await open('/blog', { type: 'blog', kind: 'listing', slug: 'blog', page: 1, document: { title: 'Blog', seo, sections: [] } })
    expect(headings()).toContain('Listing page · Blog')
    expect((input('Slug') as HTMLInputElement).disabled).toBe(true)
    expect(container.textContent).toContain('fixed address')
    // A listing page has no fields of its own, whatever its entries have.
    expect(headings()).not.toContain('Fields')
    expect(rows(1)[0]?.badges).toEqual(['listing', 'editing'])
    render(null, container)

    await open('/about', { type: 'about', kind: 'single', slug: 'about', document: { slug: 'about', title: 'About', seo, sections: [] } })
    expect((input('Slug') as HTMLInputElement).disabled).toBe(true)
    expect(rows(0).at(-1)?.badges).toEqual(['single', 'editing'])
  })

  it('shows a page as it always did: no Fields group, and the home page keeps its slug', async () => {
    await open('/', { type: 'pages', kind: 'entry', slug: 'index', document: { slug: 'index', title: 'Home', seo, sections: [] } })
    expect(headings()).toContain('Page · Home')
    expect(headings()).not.toContain('Fields')
    expect((input('Slug') as HTMLInputElement).disabled).toBe(true)
    expect(rows(0)[0]?.badges).toEqual(['home', 'editing'])
  })

  it('creates an entry in its type, offering only the sections the type allows', async () => {
    await open('/contact', {
      type: 'pages',
      kind: 'entry',
      slug: 'contact',
      document: { slug: 'contact', title: 'Contact', seo, sections: [] },
    })
    const buttons = [...container.querySelectorAll('button')]
    buttons.find((button) => button.textContent?.trim() === 'New entry')?.click()
    await Promise.resolve()
    const card = container.querySelector('.bm-card') as HTMLElement
    expect([...card.querySelectorAll('option')].map((option) => option.value)).toEqual(['hero', 'cta'])
    const title = card.querySelector('input') as HTMLInputElement
    title.value = 'Third post'
    title.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
    ;[...card.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Create entry')?.click()
    await vi.waitFor(() => expect(sent.some((call) => call.url === '/types/blog/entries')).toBe(true))
    expect(sent.find((call) => call.url === '/types/blog/entries')).toEqual({
      url: '/types/blog/entries',
      method: 'POST',
      body: { slug: 'third-post', title: 'Third post', template: 'hero' },
    })
  })
})

describe('the Add section picker', () => {
  it('offers only the sections the open document may use', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    server({ type: 'blog', kind: 'entry', slug: 'first', document: entry })
    window.history.replaceState(null, '', '/blog/first')
    const editor = createEditor()
    await editor.session.load()
    editor.ui.picker.value = { id: 'hero', where: 'below', at: { top: 10, left: 10 } }
    render(h(EditorContext.Provider, { value: editor }, h(SectionPicker, {})), container)
    const offered = () => [...container.querySelectorAll('.bm-picker-grid button')].map((button) => button.getAttribute('aria-label'))
    expect(offered()).toEqual(['Hero', 'Call to action'])
    editor.doc.ref.value = { type: 'pages', kind: 'entry' }
    await Promise.resolve()
    render(h(EditorContext.Provider, { value: editor }, h(SectionPicker, {})), container)
    expect(offered()).toEqual(['Hero', 'Call to action', 'FAQ'])
    render(null, container)
    container.remove()
    vi.unstubAllGlobals()
  })
})
