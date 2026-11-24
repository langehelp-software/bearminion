import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { handleEditorRequest } from '../src/api.js'
import { multi, resolveTypes, single, type ContentTypes } from '../src/content-types.js'
import { imageSchema } from '../src/fields.js'
import { createMigrator } from '../src/migrate.js'
import { API_PREFIX, type EditorContext } from '../src/options.js'
import { stableStringify } from '../src/stable-json.js'
import { createFileStore } from '../src/store.js'
import { defaultTheme } from '../src/theme.js'
import { sectionRegistry, siteDefinition } from './starter.js'

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const seo = (title: string) => ({ title, description: '', noindex: false, nofollow: false })
const hero = (id = 'hero') => ({ id, type: 'hero', props: structuredClone(sectionRegistry.hero.defaults) })
const cta = (id = 'cta') => ({ id, type: 'cta', props: structuredClone(sectionRegistry.cta.defaults) })

const siteTypes = (): ContentTypes => ({
  blog: multi({
    path: '/blog/{slug}',
    fields: z.object({ date: z.iso.date(), excerpt: z.string().max(200).optional(), cover: imageSchema.optional() }),
    sections: ['hero', 'cta'],
    sort: { by: 'date', order: 'desc' },
    listing: { perPage: 5 },
  }),
  notes: multi({ rename: false, delete: false }),
  about: single({ path: '/about' }),
})

function seed(types: ContentTypes | null = siteTypes(), lang?: string): EditorContext {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bearminion-types-'))
  directories.push(root)
  const contentDir = path.join(root, 'content')
  fs.mkdirSync(path.join(contentDir, 'pages'), { recursive: true })
  fs.writeFileSync(
    path.join(contentDir, 'site.json'),
    stableStringify({
      footer: { columns: [] },
      header: { cta: { href: '#cta', label: 'Start' }, links: [{ href: '/', label: 'Home' }] },
      name: 'Demo',
      seo: { titleTemplate: '%s · Demo' },
      url: 'https://bearminion.example',
      ...(lang ? { lang } : {}),
    }),
  )
  for (const [slug, title] of [
    ['index', 'Home'],
    ['404', 'Not found'],
    ['contact', 'Contact'],
  ] as const) {
    fs.writeFileSync(path.join(contentDir, 'pages', `${slug}.json`), stableStringify({ slug, title, seo: seo(title), sections: [hero()] }))
  }
  const uploadsDir = path.join(root, 'src', 'assets', 'uploads')
  const pageRules = { rename: true, delete: true }
  const context: EditorContext = {
    root,
    contentDir,
    uploadsDir,
    videosDir: path.join(root, 'public', 'videos'),
    maxVideoBytes: 50 * 1_048_576,
    maxImageBytes: 5 * 1_048_576,
    imageConvert: null,
    pageRules,
    sections: sectionRegistry,
    site: siteDefinition,
    types: resolveTypes({ ...(types ? { types } : {}), sections: sectionRegistry }, pageRules),
    store: createFileStore({ root, contentDir, uploadsDir, videosDir: path.join(root, 'public', 'videos') }),
    migrator: createMigrator(),
    theme: defaultTheme,
    git: false,
  }
  return context
}

async function call(context: EditorContext, method: string, route: string, body?: unknown): Promise<Response> {
  const headers = new Headers({ host: '127.0.0.1:4321' })
  if (body !== undefined && !(body instanceof FormData)) headers.set('content-type', 'application/json')
  const request = new Request(`http://127.0.0.1:4321${API_PREFIX}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  })
  const response = await handleEditorRequest(request, context, { remoteAddress: '127.0.0.1' })
  if (!response) throw new Error('not an API route')
  return response
}

const data = async <T = Record<string, unknown>>(response: Response): Promise<T> => (await response.json()) as T
const stored = (context: EditorContext, key: string) => JSON.parse(fs.readFileSync(path.join(context.contentDir, key), 'utf8'))
const exists = (context: EditorContext, key: string) => fs.existsSync(path.join(context.contentDir, key))

async function post(context: EditorContext, slug: string, date: string, title = slug): Promise<Response> {
  return call(context, 'POST', '/types/blog/entries', { slug, title, fields: { date } })
}

describe('GET /types', () => {
  it('describes the built-in types of a site that declares none', async () => {
    const context = seed(null)
    const { types } = await data<{ types: Record<string, unknown>[] }>(await call(context, 'GET', '/types'))
    expect(types.map((type) => type.id)).toEqual(['home', 'not-found', 'pages'])
    expect(types[0]).toEqual({ id: 'home', kind: 'single', label: 'Home', fields: null, sections: null, path: '/', builtIn: true })
    expect(types[2]).toMatchObject({ kind: 'multi', path: '/{slug}', builtIn: true, sort: null, listing: null, rename: true, delete: true })
  })

  it('describes declared types with their fields, listing and locks', async () => {
    const { types } = await data<{ types: Record<string, unknown>[] }>(await call(seed(), 'GET', '/types'))
    expect(types.map((type) => type.id)).toEqual(['home', 'not-found', 'about', 'pages', 'blog', 'notes'])
    const blog = types.find((type) => type.id === 'blog') as { fields: { name: string; required: boolean }[] }
    expect(blog).toMatchObject({
      label: 'Blog',
      path: '/blog/{slug}',
      sections: ['hero', 'cta'],
      sort: { by: 'date', order: 'desc' },
      listing: { slug: 'blog', perPage: 5, path: '/blog' },
      rename: true,
      delete: true,
      builtIn: false,
    })
    expect(blog.fields.map((field) => [field.name, field.required])).toEqual([
      ['date', true],
      ['excerpt', false],
      ['cover', false],
    ])
    expect(types.find((type) => type.id === 'notes')).toMatchObject({ rename: false, delete: false, listing: null })
    expect(types.find((type) => type.id === 'about')).toMatchObject({ kind: 'single', path: '/about', builtIn: false })
  })

  it('reports the pages option as the lock of the pages type', async () => {
    const context = { ...seed(), pageRules: { rename: false, delete: true } }
    const { types } = await data<{ types: Record<string, unknown>[] }>(await call(context, 'GET', '/types'))
    expect(types.find((type) => type.id === 'pages')).toMatchObject({ rename: false, delete: true })
  })
})

describe('entries of a declared type', () => {
  it('creates an entry in the type folder with its fields, from the first allowed section', async () => {
    const context = seed()
    const created = await post(context, 'first-post', '2026-01-05', 'First post')
    expect(created.status).toBe(201)
    expect(stored(context, 'blog/first-post.json')).toMatchObject({
      schemaVersion: 1,
      slug: 'first-post',
      title: 'First post',
      fields: { date: '2026-01-05' },
      sections: [{ type: 'hero' }],
    })
    expect(exists(context, 'pages/first-post.json')).toBe(false)
  })

  it('starts a new entry with today in a required date, so a title is enough to create one', async () => {
    const context = seed()
    const response = await call(context, 'POST', '/types/blog/entries', { slug: 'p', title: 'P' })
    expect(response.status).toBe(201)
    expect(stored(context, 'blog/p.json').fields).toEqual({ date: new Date().toISOString().slice(0, 10) })
  })

  it('reports a required field it cannot start, and writes nothing', async () => {
    const context = seed({
      team: multi({ fields: z.object({ role: z.string().min(1), level: z.enum(['junior', 'senior']), order: z.number() }) }),
    })
    const response = await call(context, 'POST', '/types/team/entries', { slug: 'p', title: 'P' })
    expect(response.status).toBe(400)
    expect((await data<{ issues: { path: string }[] }>(response)).issues.map((issue) => issue.path)).toEqual(['fields.role'])
    expect(exists(context, 'team')).toBe(false)
    const filled = await call(context, 'POST', '/types/team/entries', { slug: 'p', title: 'P', fields: { role: 'Lead' } })
    expect(filled.status).toBe(201)
    expect(stored(context, 'team/p.json').fields).toEqual({ role: 'Lead', level: 'junior', order: 0 })
  })

  it('refuses a template the type does not allow, and copies an entry with its fields', async () => {
    const context = seed()
    const refused = await call(context, 'POST', '/types/blog/entries', {
      slug: 'p',
      title: 'P',
      template: 'faq',
      fields: { date: '2026-01-01' },
    })
    expect(refused.status).toBe(400)
    expect((await data<{ message: string }>(refused)).message).toMatch(/not allowed in Blog\. Allowed: hero, cta/)
    await post(context, 'one', '2026-03-03')
    const copy = await call(context, 'POST', '/types/blog/entries', { slug: 'two', title: 'Two', template: 'one' })
    expect(copy.status).toBe(201)
    expect(stored(context, 'blog/two.json').fields).toEqual({ date: '2026-03-03' })
  })

  it('lists entries in the type sort order, with their address', async () => {
    const context = seed()
    await post(context, 'b', '2026-01-05')
    await post(context, 'old', '2025-12-31')
    await post(context, 'a', '2026-01-05')
    await post(context, 'new', '2026-02-01')
    await call(context, 'PUT', '/types/blog/listing', { title: 'Blog', seo: seo('Blog'), sections: [] })
    const { entries } = await data<{ entries: Record<string, unknown>[] }>(await call(context, 'GET', '/types/blog/entries'))
    expect(entries.map((entry) => entry.slug)).toEqual(['new', 'a', 'b', 'old'])
    expect(entries[0]).toEqual({
      slug: 'new',
      title: 'new',
      file: 'new.json',
      path: '/blog/new',
      sortValue: '2026-02-01',
      anchors: [],
      updatedAt: expect.any(String),
    })
  })

  it('orders titles in the language of the site', async () => {
    const types = { words: multi() }
    const titles = async (lang: string) => {
      const context = seed(types, lang)
      await call(context, 'POST', '/types/words/entries', { slug: 'z', title: 'Zebra' })
      await call(context, 'POST', '/types/words/entries', { slug: 'a', title: 'Äpfel' })
      return (await data<{ entries: { slug: string }[] }>(await call(context, 'GET', '/types/words/entries'))).entries.map(
        (entry) => entry.slug,
      )
    }
    expect(await titles('de')).toEqual(['a', 'z'])
    expect(await titles('sv')).toEqual(['z', 'a'])
  })

  it('lists nothing for a type whose folder does not exist yet', async () => {
    const response = await call(seed(), 'GET', '/types/blog/entries')
    expect(response.status).toBe(200)
    expect(await data(response)).toEqual({ entries: [] })
  })

  it('reads, saves, renames and deletes an entry, touching only its file', async () => {
    const context = seed()
    await post(context, 'first', '2026-01-05')
    await post(context, 'other', '2026-01-06')
    const other = fs.readFileSync(path.join(context.contentDir, 'blog', 'other.json'), 'utf8')
    const entry = await data(await call(context, 'GET', '/types/blog/entries/first'))
    expect(entry).toMatchObject({ slug: 'first', fields: { date: '2026-01-05' } })

    const saved = await call(context, 'PUT', '/types/blog/entries/first', {
      ...entry,
      title: 'Changed',
      fields: { date: '2026-02-02', excerpt: 'Short' },
    })
    expect(saved.status).toBe(200)
    expect(stored(context, 'blog/first.json')).toMatchObject({ title: 'Changed', fields: { date: '2026-02-02', excerpt: 'Short' } })

    const badField = await call(context, 'PUT', '/types/blog/entries/first', { ...entry, fields: { date: 'tomorrow' } })
    expect(badField.status).toBe(400)
    const badSection = await call(context, 'PUT', '/types/blog/entries/first', {
      ...entry,
      sections: [{ id: 'faq', type: 'faq', props: structuredClone(sectionRegistry.faq.defaults) }],
    })
    expect((await data<{ issues: { message: string }[] }>(badSection)).issues[0]?.message).toMatch(/not allowed in Blog/)

    const renamed = await call(context, 'POST', '/types/blog/entries/first/rename', { slug: 'renamed' })
    expect(renamed.status).toBe(200)
    expect(exists(context, 'blog/first.json')).toBe(false)
    expect(stored(context, 'blog/renamed.json').slug).toBe('renamed')

    expect((await call(context, 'DELETE', '/types/blog/entries/renamed')).status).toBe(200)
    expect(fs.readdirSync(path.join(context.contentDir, 'blog'))).toEqual(['other.json'])
    expect(fs.readFileSync(path.join(context.contentDir, 'blog', 'other.json'), 'utf8')).toBe(other)
    expect((await call(context, 'GET', '/types/blog/entries/renamed')).status).toBe(404)
  })

  it('saves and renames an entry through /save with its type', async () => {
    const context = seed()
    await post(context, 'first', '2026-01-05')
    const entry = await data(await call(context, 'GET', '/types/blog/entries/first'))
    const saved = await call(context, 'POST', '/save', {
      page: { type: 'blog', from: 'first', document: { ...entry, slug: 'moved', title: 'Moved' } },
    })
    expect(saved.status).toBe(200)
    expect(stored(context, 'blog/moved.json').title).toBe('Moved')
    expect(exists(context, 'blog/first.json')).toBe(false)
    const unknown = await call(context, 'POST', '/save', { page: { type: 'nope', from: 'moved', document: entry } })
    expect(unknown.status).toBe(404)
    // A single is saved through /save too, but an entry is not its document.
    const single = await call(context, 'POST', '/save', { page: { type: 'about', from: 'about', document: entry } })
    expect(single.status).toBe(400)
    expect(exists(context, 'singles/about.json')).toBe(false)
  })

  it('refuses rename and delete where the type locks them', async () => {
    const context = seed()
    await call(context, 'POST', '/types/notes/entries', { slug: 'one', title: 'One' })
    const renamed = await call(context, 'POST', '/types/notes/entries/one/rename', { slug: 'two' })
    expect(renamed.status).toBe(409)
    expect(await data(renamed)).toMatchObject({ error: 'operation_locked', message: expect.stringContaining('Notes') })
    expect((await call(context, 'DELETE', '/types/notes/entries/one')).status).toBe(409)
    expect(exists(context, 'notes/one.json')).toBe(true)
  })

  it('answers 404 for an unknown type and for entry routes on a single', async () => {
    const context = seed()
    expect((await call(context, 'GET', '/types/nope/entries')).status).toBe(404)
    expect((await call(context, 'GET', '/types/about/entries')).status).toBe(404)
    expect((await call(context, 'GET', '/types/blog/document')).status).toBe(404)
    expect((await call(context, 'GET', '/types/notes/listing')).status).toBe(404)
  })
})

describe('addresses that belong to something else', () => {
  it('refuses a page named like a type, a listing or a single', async () => {
    const context = seed({ ...siteTypes(), news: multi({ listing: { slug: 'latest' } }) })
    for (const slug of ['blog', 'notes', 'about', 'news', 'latest']) {
      const created = await call(context, 'POST', '/pages', { slug, title: 'Taken' })
      expect(created.status, slug).toBe(409)
      expect((await data<{ error: string }>(created)).error).toBe('reserved_slug')
      const renamed = await call(context, 'POST', '/pages/contact/rename', { slug })
      expect(renamed.status, slug).toBe(409)
      const contact = await data(await call(context, 'GET', '/pages/contact'))
      const saved = await call(context, 'POST', '/save', { page: { from: 'contact', document: { ...contact, slug } } })
      expect(saved.status, slug).toBe(409)
    }
    expect(fs.readdirSync(path.join(context.contentDir, 'pages')).sort()).toEqual(['404.json', 'contact.json', 'index.json'])
  })

  it('refuses an entry named page when the listing has page numbers there', async () => {
    const context = seed()
    const created = await post(context, 'page', '2026-01-05')
    expect(created.status).toBe(409)
    expect((await data<{ message: string }>(created)).message).toMatch(/page numbers/)
    // Notes has no listing, so /notes/page is an ordinary address.
    expect((await call(context, 'POST', '/types/notes/entries', { slug: 'page', title: 'Page' })).status).toBe(201)
  })

  it('lets an entry share a slug with a page: their addresses differ', async () => {
    const context = seed()
    expect((await post(context, 'contact', '2026-01-05')).status).toBe(201)
    expect(exists(context, 'pages/contact.json')).toBe(true)
  })
})

describe('singles and listing pages', () => {
  it('serves a declared single empty until its first save, then from its file', async () => {
    const context = seed()
    const empty = await call(context, 'GET', '/types/about/document')
    expect(empty.status).toBe(200)
    const document = await data(empty)
    expect(document).toEqual({ slug: 'about', title: 'About', seo: seo('About'), sections: [] })
    expect(exists(context, 'singles/about.json')).toBe(false)

    const saved = await call(context, 'PUT', '/types/about/document', { ...document, title: 'About us', sections: [cta()] })
    expect(saved.status).toBe(200)
    expect(stored(context, 'singles/about.json')).toMatchObject({ slug: 'about', title: 'About us', schemaVersion: 1 })
    expect(await data(await call(context, 'GET', '/types/about/document'))).toMatchObject({ title: 'About us' })

    const moved = await call(context, 'PUT', '/types/about/document', { ...document, slug: 'elsewhere' })
    expect(moved.status).toBe(400)
    expect((await data<{ error: string }>(moved)).error).toBe('slug_mismatch')
    expect((await call(context, 'DELETE', '/types/about/document')).status).toBe(405)
  })

  it('reads and saves the home page as a single, in the same file as /pages/index', async () => {
    const context = seed()
    const home = await data(await call(context, 'GET', '/types/home/document'))
    expect(home).toMatchObject({ slug: 'index', title: 'Home' })
    expect((await call(context, 'PUT', '/types/home/document', { ...home, title: 'Welcome' })).status).toBe(200)
    expect(stored(context, 'pages/index.json').title).toBe('Welcome')
    expect(await data(await call(context, 'GET', '/pages/index'))).toMatchObject({ title: 'Welcome' })
  })

  it('answers 404 for a home page that does not exist: only declared singles start empty', async () => {
    const context = seed()
    fs.rmSync(path.join(context.contentDir, 'pages', 'index.json'))
    expect((await call(context, 'GET', '/types/home/document')).status).toBe(404)
  })

  it('serves a default listing page until one is saved, and keeps it out of the entries', async () => {
    const context = seed()
    await post(context, 'first', '2026-01-05')
    const initial = await data(await call(context, 'GET', '/types/blog/listing'))
    expect(initial).toEqual({ title: 'Blog', seo: seo('Blog'), sections: [] })
    // The listing may show sections the entries may not.
    const faq = { id: 'faq', type: 'faq', props: structuredClone(sectionRegistry.faq.defaults) }
    const saved = await call(context, 'PUT', '/types/blog/listing', { ...initial, title: 'Journal', sections: [faq] })
    expect(saved.status).toBe(200)
    expect(stored(context, 'blog/_listing.json')).toMatchObject({ title: 'Journal' })
    const { entries } = await data<{ entries: { slug: string }[] }>(await call(context, 'GET', '/types/blog/entries'))
    expect(entries.map((entry) => entry.slug)).toEqual(['first'])
    expect((await call(context, 'PUT', '/types/blog/listing', { ...initial, slug: 'blog' })).status).toBe(400)
  })

  it('refuses an orphaned section the stored document does not already have', async () => {
    const context = seed()
    const initial = await data(await call(context, 'GET', '/types/blog/listing'))
    const response = await call(context, 'PUT', '/types/blog/listing', { ...initial, sections: [{ id: 'x', type: 'gone', props: {} }] })
    expect(response.status).toBe(400)
    expect((await data<{ issues: { path: string }[] }>(response)).issues[0]?.path).toBe('sections.0.type')
  })
})

describe('uploads used outside the pages', () => {
  async function upload(context: EditorContext): Promise<{ filename: string; path: string }> {
    const form = new FormData()
    form.append('file', new File([PNG], 'cover.png', { type: 'image/png' }))
    return data(await call(context, 'POST', '/images', form))
  }

  it('refuses to delete an image that only an entry field uses', async () => {
    const context = seed()
    const image = await upload(context)
    await call(context, 'POST', '/types/blog/entries', {
      slug: 'first',
      title: 'First',
      fields: { date: '2026-01-05', cover: { src: image.path, alt: '' } },
    })
    const refused = await call(context, 'DELETE', `/images/${image.filename}`)
    expect(refused.status).toBe(409)
    expect((await data<{ usages: string[] }>(refused)).usages).toEqual(['First page › fields.cover.src'])
    await call(context, 'DELETE', '/types/blog/entries/first')
    expect((await call(context, 'DELETE', `/images/${image.filename}`)).status).toBe(200)
  })

  it('refuses to delete an image that only a listing page or a single uses', async () => {
    const context = seed()
    const image = await upload(context)
    const withImage = (base: Record<string, unknown>) => ({ ...base, seo: { ...(base.seo as object), ogImage: image.path } })
    const listing = await data(await call(context, 'GET', '/types/blog/listing'))
    expect((await call(context, 'PUT', '/types/blog/listing', withImage(listing))).status).toBe(200)
    expect((await call(context, 'DELETE', `/images/${image.filename}`)).status).toBe(409)
    await call(context, 'PUT', '/types/blog/listing', listing)

    const about = await data(await call(context, 'GET', '/types/about/document'))
    expect((await call(context, 'PUT', '/types/about/document', withImage(about))).status).toBe(200)
    const refused = await call(context, 'DELETE', `/images/${image.filename}`)
    expect(refused.status).toBe(409)
    expect((await data<{ usages: string[] }>(refused)).usages).toEqual(['About page › social preview image'])
  })

  it('refuses a save that points a field at an image that is not there', async () => {
    const context = seed()
    const response = await call(context, 'POST', '/types/blog/entries', {
      slug: 'first',
      title: 'First',
      fields: { date: '2026-01-05', cover: { src: 'src/assets/uploads/nope.png', alt: '' } },
    })
    expect(response.status).toBe(400)
    expect((await data<{ issues: { path: string }[] }>(response)).issues[0]?.path).toBe('fields.cover.src')
    expect(exists(context, 'blog/first.json')).toBe(false)
  })
})

describe('migrations', () => {
  it('tells a migration which type a document belongs to', async () => {
    const seen: (string | undefined)[] = []
    const context = seed()
    await post(context, 'first', '2026-01-05')
    await call(context, 'PUT', '/types/blog/listing', { title: 'Blog', seo: seo('Blog'), sections: [] })
    const about = await data(await call(context, 'GET', '/types/about/document'))
    await call(context, 'PUT', '/types/about/document', about)
    const upgraded: EditorContext = {
      ...context,
      migrator: createMigrator({
        schemaVersion: 2,
        migrations: {
          1: (document, kind, type) => {
            if (kind === 'page') seen.push(type)
            return document
          },
        },
      }),
    }
    await call(upgraded, 'GET', '/pages')
    await call(upgraded, 'GET', '/types/blog/entries')
    await call(upgraded, 'GET', '/types/blog/listing')
    await call(upgraded, 'GET', '/types/about/document')
    expect(seen).toEqual(['not-found', 'pages', 'home', 'blog', 'listing', 'about'])
  })
})

describe('GET /document: what an address shows', () => {
  const at = async (context: EditorContext, pathname: string) => call(context, 'GET', `/document?path=${encodeURIComponent(pathname)}`)

  it('answers each kind of document with its type', async () => {
    const context = seed()
    await post(context, 'first', '2026-01-05')
    expect(await data(await at(context, '/'))).toMatchObject({ type: 'pages', kind: 'entry', slug: 'index', document: { title: 'Home' } })
    expect(await data(await at(context, '/404'))).toMatchObject({ type: 'pages', kind: 'entry', slug: '404' })
    expect(await data(await at(context, '/contact/'))).toMatchObject({ type: 'pages', kind: 'entry', slug: 'contact' })
    expect(await data(await at(context, '/blog/first'))).toMatchObject({
      type: 'blog',
      kind: 'entry',
      slug: 'first',
      document: { fields: { date: '2026-01-05' } },
    })
    expect(await data(await at(context, '/about'))).toMatchObject({
      type: 'about',
      kind: 'single',
      slug: 'about',
      document: { title: 'About' },
    })
    expect(await data(await at(context, '/blog'))).toEqual({
      type: 'blog',
      kind: 'listing',
      slug: 'blog',
      page: 1,
      document: { title: 'Blog', seo: seo('Blog'), sections: [] },
    })
    expect(await data(await at(context, '/blog/page/3'))).toMatchObject({ type: 'blog', kind: 'listing', page: 3 })
  })

  it('answers 404 where nothing lives', async () => {
    const context = seed()
    for (const pathname of ['/nope', '/index', '/blog/nope', '/blog/page', '/x/y/z', 'contact', '']) {
      expect((await at(context, pathname)).status, pathname).toBe(404)
    }
  })
})

describe('POST /save for a single and a listing page', () => {
  it('saves a declared single and a listing page, together with the site', async () => {
    const context = seed()
    const about = await data(await call(context, 'GET', '/types/about/document'))
    const single = await call(context, 'POST', '/save', { page: { type: 'about', document: { ...about, title: 'About us' } } })
    expect(single.status).toBe(200)
    expect(stored(context, 'singles/about.json').title).toBe('About us')
    expect((await data<{ page: { title: string } }>(single)).page.title).toBe('About us')

    const site = stored(context, 'site.json')
    const listing = await call(context, 'POST', '/save', {
      page: { type: 'blog', listing: true, document: { title: 'Journal', seo: seo('Journal'), sections: [cta()] } },
      site: { ...site, name: 'Renamed' },
    })
    expect(listing.status).toBe(200)
    expect(stored(context, 'blog/_listing.json').title).toBe('Journal')
    expect(stored(context, 'site.json').name).toBe('Renamed')
  })

  it('refuses what does not fit: a moved single, a listing where there is none, an entry without from', async () => {
    const context = seed()
    const about = await data(await call(context, 'GET', '/types/about/document'))
    expect((await call(context, 'POST', '/save', { page: { type: 'about', document: { ...about, slug: 'x' } } })).status).toBe(400)
    expect((await call(context, 'POST', '/save', { page: { type: 'notes', listing: true, document: about } })).status).toBe(404)
    expect((await call(context, 'POST', '/save', { page: { type: 'blog', document: about } })).status).toBe(400)
    expect(exists(context, 'singles/about.json')).toBe(false)
  })
})
