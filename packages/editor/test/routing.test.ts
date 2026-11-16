import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { loadContent } from '../src/astro.js'
import { multi, resolveTypes, single, type ContentTypes } from '../src/content-types.js'
import { ContentValidationError } from '../src/errors.js'
import { findRoute, matchPath, siteRoutes, type ListingRoute, type Route } from '../src/routing.js'
import { stableStringify } from '../src/stable-json.js'
import { createStoreContent } from '../src/store-content.js'
import { createFileStore } from '../src/store.js'
import { contentModel as starterModel, sectionRegistry } from './starter.js'

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

const seo = (title: string) => ({ title, description: `About ${title}`, noindex: false, nofollow: false })
const hero = () => ({ id: 'hero', type: 'hero', props: structuredClone(sectionRegistry.hero.defaults) })
const page = (slug: string, title = slug, extra: Record<string, unknown> = {}) => ({
  slug,
  title,
  seo: seo(title),
  sections: [hero()],
  ...extra,
})

const types = (): ContentTypes => ({
  blog: multi({
    fields: z.object({ date: z.iso.date(), draft: z.boolean().default(false) }),
    sort: { by: 'date', order: 'desc' },
    listing: { perPage: 2 },
  }),
  news: multi({ listing: { slug: 'latest' } }),
  notes: multi(),
  about: single({ path: '/about' }),
  legal: single({ path: '/legal' }),
})

const site = (lang?: string) => ({
  footer: { columns: [] },
  header: { cta: { href: '#cta', label: 'Start' }, links: [{ href: '/', label: 'Home' }] },
  name: 'Demo',
  seo: { titleTemplate: '%s · Demo' },
  url: 'https://bearminion.example',
  ...(lang ? { lang } : {}),
})

function project(files: Record<string, unknown>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bearminion-routing-'))
  directories.push(root)
  for (const [key, value] of Object.entries({ 'site.json': site(), ...files })) {
    const file = path.join(root, 'content', key)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, stableStringify(value))
  }
  return root
}

const blogPost = (slug: string, date: string, draft = false) => page(slug, slug, { fields: { date, draft } })

const full = (): Record<string, unknown> => ({
  'pages/index.json': page('index', 'Home'),
  'pages/404.json': page('404', 'Not found'),
  'pages/contact.json': page('contact', 'Contact'),
  'blog/a.json': blogPost('a', '2026-01-01'),
  'blog/b.json': blogPost('b', '2026-01-03'),
  'blog/c.json': blogPost('c', '2026-01-02'),
  'blog/d.json': blogPost('d', '2026-01-05'),
  'blog/e.json': blogPost('e', '2026-01-04'),
  'blog/wip.json': blogPost('wip', '2026-02-01', true),
  'blog/_listing.json': { title: 'Journal', seo: seo('Journal'), sections: [hero()] },
  'news/first.json': page('first', 'First'),
  'singles/about.json': page('about', 'About us'),
})

const model = () => ({ ...starterModel, types: types() })
const paths = (routes: Route[]) => routes.map((route) => route.path)

describe('siteRoutes', () => {
  it('gives a site without types its pages, exactly', () => {
    const root = project({ 'pages/index.json': page('index'), 'pages/404.json': page('404'), 'pages/contact.json': page('contact') })
    const content = loadContent(path.join(root, 'content'), starterModel)
    expect(content.entries).toEqual({})
    expect(content.listings).toEqual({})
    expect(content.singles).toEqual({})
    const routes = siteRoutes(starterModel, content)
    expect(routes.map((route) => [route.path, route.kind, route.type])).toEqual([
      ['/', 'page', 'home'],
      ['/404', 'page', 'not-found'],
      ['/contact', 'page', 'pages'],
    ])
  })

  it('lists every address of a site with types: singles, pages, listing pages and entries', () => {
    const content = loadContent(path.join(project(full()), 'content'), model())
    expect(paths(siteRoutes(model(), content))).toEqual([
      '/',
      '/404',
      '/about',
      '/legal',
      '/contact',
      '/blog',
      '/blog/page/2',
      '/blog/page/3',
      '/blog/d',
      '/blog/e',
      '/blog/b',
      '/blog/c',
      '/blog/a',
      '/latest',
      '/news/first',
    ])
  })

  it('pages a listing in sort order, with its sections on the first page only', () => {
    const content = loadContent(path.join(project(full()), 'content'), model())
    const listings = siteRoutes(model(), content).filter(
      (route): route is ListingRoute => route.kind === 'listing' && route.type === 'blog',
    )
    expect(listings.map((route) => route.entries.map((entry) => entry.slug))).toEqual([['d', 'e'], ['b', 'c'], ['a']])
    const [first, second, third] = listings as [ListingRoute, ListingRoute, ListingRoute]
    expect(first.page).toMatchObject({ slug: 'blog', title: 'Journal', seo: { title: 'Journal' } })
    expect(first.page.sections).toHaveLength(1)
    expect(second.page.sections).toEqual([])
    expect(second.page.seo.title).toBe('Journal - Page 2')
    expect(first.entries[0]).toEqual({
      slug: 'd',
      title: 'd',
      path: '/blog/d',
      description: 'About d',
      fields: { date: '2026-01-05', draft: false },
    })
    expect(first.pagination).toEqual({
      page: 1,
      pages: 3,
      total: 5,
      perPage: 2,
      previous: null,
      next: '/blog/page/2',
      links: [
        { page: 1, path: '/blog', current: true },
        { page: 2, path: '/blog/page/2', current: false },
        { page: 3, path: '/blog/page/3', current: false },
      ],
    })
    expect(second.pagination).toMatchObject({ previous: '/blog', next: '/blog/page/3' })
    expect(third.pagination).toMatchObject({ previous: '/blog/page/2', next: null })
  })

  it('leaves drafts out of a build and shows them when asked', () => {
    const content = loadContent(path.join(project(full()), 'content'), model())
    expect(paths(siteRoutes(model(), content))).not.toContain('/blog/wip')
    const withDrafts = siteRoutes(model(), content, { drafts: true })
    expect(paths(withDrafts)).toContain('/blog/wip')
    const first = withDrafts.find((route): route is ListingRoute => route.path === '/blog')
    expect(first?.entries.map((entry) => entry.slug)).toEqual(['wip', 'd'])
  })

  it('leaves a page marked draft out of a build, and never the home or 404 page', () => {
    const root = project({
      'pages/index.json': page('index', 'Home', { status: 'draft' }),
      'pages/404.json': page('404'),
      'pages/contact.json': page('contact', 'Contact', { status: 'draft' }),
      'pages/about.json': page('about', 'About', { status: 'published' }),
    })
    const content = loadContent(path.join(root, 'content'), starterModel)
    expect(paths(siteRoutes(starterModel, content))).toEqual(['/', '/404', '/about'])
    expect(paths(siteRoutes(starterModel, content, { drafts: true }))).toContain('/contact')
  })

  it('gives a listing with no entries its first page, and an unsaved listing and single their defaults', () => {
    const content = loadContent(path.join(project({ 'pages/index.json': page('index') }), 'content'), model())
    const routes = siteRoutes(model(), content)
    expect(paths(routes)).toEqual(['/', '/about', '/legal', '/blog', '/latest'])
    const blog = routes.find((route): route is ListingRoute => route.path === '/blog')
    expect(blog).toMatchObject({ entries: [], pagination: { page: 1, pages: 1, total: 0 }, page: { title: 'Blog', sections: [] } })
    expect(routes.find((route) => route.path === '/legal')).toMatchObject({
      kind: 'page',
      type: 'legal',
      page: { slug: 'legal', title: 'Legal', sections: [] },
    })
  })

  it('names both documents when two share an address', () => {
    const content = loadContent(path.join(project({ ...full(), 'pages/blog.json': page('blog', 'Blog page') }), 'content'), model())
    expect(() => siteRoutes(model(), content)).toThrow(/share the address "\/blog": "blog" \(pages\) and the listing of "blog"/)
  })

  it('finds one route with or without a trailing slash', () => {
    const content = loadContent(path.join(project(full()), 'content'), model())
    expect(findRoute(model(), content, '/blog/page/2/')?.kind).toBe('listing')
    expect(findRoute(model(), content, '/contact/')).toMatchObject({ kind: 'page', type: 'pages' })
    expect(findRoute(model(), content, '/nope')).toBeUndefined()
  })
})

describe('loadContent with types', () => {
  it('validates entries against their type and names the file', () => {
    const root = project({ ...full(), 'blog/bad.json': page('bad', 'Bad', { fields: { date: 'soon' } }) })
    expect(() => loadContent(path.join(root, 'content'), model())).toThrow(ContentValidationError)
    expect(() => loadContent(path.join(root, 'content'), model())).toThrow(/blog[\\/]bad\.json/)
  })

  it('refuses two entries of one type with the same slug', () => {
    const root = project({ ...full(), 'blog/copy.json': blogPost('a', '2026-03-03') })
    expect(() => loadContent(path.join(root, 'content'), model())).toThrow(/Duplicate slug "a"/)
  })

  it('checks the home and 404 pages as pages even when the pages type has fields of its own', () => {
    const tuned = { ...starterModel, types: { pages: multi({ fields: z.object({ badge: z.string() }) }) } }
    const root = project({
      'pages/index.json': page('index'),
      'pages/404.json': page('404'),
      'pages/team.json': page('team', 'Team', { fields: { badge: 'new' } }),
    })
    const content = loadContent(path.join(root, 'content'), tuned)
    expect(content.pages.map((item) => item.slug)).toEqual(['404', 'index', 'team'])
    const missing = project({ 'pages/index.json': page('index'), 'pages/team.json': page('team') })
    expect(() => loadContent(path.join(missing, 'content'), tuned)).toThrow(/team\.json/)
  })
})

describe('matchPath', () => {
  const resolved = resolveTypes({ types: types() })
  const match = (pathname: string) => {
    const found = matchPath(resolved, pathname)
    return found && [found.kind, found.type.id, 'slug' in found ? found.slug : 'page' in found ? found.page : null]
  }

  it('tells what an address would be', () => {
    expect(match('/')).toEqual(['single', 'home', null])
    expect(match('/404')).toEqual(['single', 'not-found', null])
    expect(match('/about/')).toEqual(['single', 'about', null])
    expect(match('/contact')).toEqual(['entry', 'pages', 'contact'])
    expect(match('/blog')).toEqual(['listing', 'blog', 1])
    expect(match('/blog/first')).toEqual(['entry', 'blog', 'first'])
    expect(match('/blog/page/2')).toEqual(['listing', 'blog', 2])
    expect(match('/latest/page/3')).toEqual(['listing', 'news', 3])
    expect(match('/news/page')).toEqual(['entry', 'news', 'page'])
    expect(match('/notes')).toEqual(['entry', 'pages', 'notes'])
  })

  it('knows no address for anything else', () => {
    for (const pathname of [
      '/blog/page',
      '/blog/page/1',
      '/blog/page/0',
      '/blog/page/x',
      '/blog/a/b',
      '/nope/a',
      '/news/page/2',
      '/Blog',
      '/a b',
      '/blog//a',
    ]) {
      expect(match(pathname), pathname).toBeNull()
    }
  })
})

describe('a hosted editor and the build show the same thing at every address', () => {
  function hosted(root: string) {
    const contentDir = path.join(root, 'content')
    const store = createFileStore({ root, contentDir, uploadsDir: path.join(root, 'uploads') })
    return createStoreContent(model(), store)
  }

  it('agrees with the build on every route, drafts included', async () => {
    const root = project(full())
    const built = siteRoutes(model(), loadContent(path.join(root, 'content'), model(), { tolerateOrphans: true }), { drafts: true })
    const live = hosted(root)
    expect(built.length).toBeGreaterThan(10)
    for (const route of built) expect(await live.getRoute(route.path), route.path).toEqual(route)
  })

  it('has nothing where the build has nothing', async () => {
    const live = hosted(project(full()))
    for (const pathname of [
      '/nope',
      '/index',
      '/blog/nope',
      '/blog/page/4',
      '/blog/page/1',
      '/blog/_listing',
      '/notes/x',
      '/singles/about',
    ]) {
      expect(await live.getRoute(pathname), pathname).toBeUndefined()
    }
  })

  it('sorts a listing in the language of the site', async () => {
    const files = (lang: string) => ({
      'site.json': site(lang),
      'pages/index.json': page('index'),
      'news/z.json': page('z', 'Zebra'),
      'news/a.json': page('a', 'Äpfel'),
    })
    const order = async (lang: string) =>
      ((await hosted(project(files(lang))).getRoute('/latest')) as ListingRoute).entries.map((entry) => entry.slug)
    expect(await order('de')).toEqual(['a', 'z'])
    expect(await order('sv')).toEqual(['z', 'a'])
  })

  it('keeps getPage working for a site that still calls it', async () => {
    const live = hosted(project(full()))
    expect((await live.getPage('contact'))?.title).toBe('Contact')
    expect((await live.getPage('index'))?.slug).toBe('index')
  })
})
