import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { multi, single } from '../src/content-types.js'
import { missingRoutes, missingRoutesMessage, staleRouteFile } from '../src/route-check.js'
import { stableStringify } from '../src/stable-json.js'
import { contentModel, sectionRegistry } from './starter.js'

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

const seo = (title: string) => ({ title, description: '', noindex: false, nofollow: false })
const page = (slug: string) => ({
  slug,
  title: slug,
  seo: seo(slug),
  sections: [{ id: 'hero', type: 'hero', props: structuredClone(sectionRegistry.hero.defaults) }],
})

function project(files: Record<string, unknown>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bearminion-route-check-'))
  directories.push(root)
  const site = {
    footer: { columns: [] },
    header: { cta: { href: '#cta', label: 'Start' }, links: [{ href: '/', label: 'Home' }] },
    name: 'Demo',
    seo: { titleTemplate: '%s · Demo' },
    url: 'https://bearminion.example',
  }
  for (const [key, value] of Object.entries({ 'content/site.json': site, 'content/pages/index.json': page('index'), ...files })) {
    const file = path.join(root, key)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, typeof value === 'string' ? value : stableStringify(value))
  }
  return root
}

const withTypes = { ...contentModel, types: { blog: multi({ listing: { perPage: 1 } }), about: single({ path: '/about' }) } }
const posts = { 'content/blog/one.json': page('one'), 'content/blog/two.json': page('two') }

describe('missingRoutes', () => {
  it('never looks at a site that declares no types, whatever it built', () => {
    const root = project({ 'content/pages/contact.json': page('contact') })
    expect(missingRoutes(contentModel, path.join(root, 'content'), [])).toEqual([])
    // Tuning the built-in pages type declares nothing new either.
    expect(missingRoutes({ ...contentModel, types: { pages: multi({ rename: false }) } }, path.join(root, 'content'), [])).toEqual([])
  })

  it('names every address of a declared type, single and listing that was not built', () => {
    const root = project(posts)
    const onlyPages = ['/', '404.html']
    expect(missingRoutes(withTypes, path.join(root, 'content'), onlyPages)).toEqual([
      '/about',
      '/blog',
      '/blog/page/2',
      '/blog/one',
      '/blog/two',
    ])
  })

  it('accepts the ways Astro writes an address', () => {
    const root = project(posts)
    const emitted = ['', 'about/', '/blog/index.html', 'blog/page/2/', 'blog/one.html', '/blog/two']
    expect(missingRoutes(withTypes, path.join(root, 'content'), emitted)).toEqual([])
  })

  it('does not hold a site to its pages, which a site may draw with routes of its own', () => {
    const root = project({ ...posts, 'content/pages/contact.json': page('contact') })
    const emitted = ['about/', 'blog/', 'blog/page/2/', 'blog/one/', 'blog/two/']
    expect(missingRoutes(withTypes, path.join(root, 'content'), emitted)).toEqual([])
  })

  it('says what is missing and how to fix it, and keeps a long list short', () => {
    const message = missingRoutesMessage(Array.from({ length: 13 }, (_, index) => `/blog/p${index}`))
    expect(message).toContain('/blog/p0, /blog/p1')
    expect(message).toContain('and 3 more')
    expect(message).not.toContain('/blog/p10')
    expect(message).toContain('npx bearminion add types')
    expect(message).toContain('https://docs.bearminion.com/content-types/')
  })
})

describe('staleRouteFile', () => {
  const route = 'src/pages/[...slug].astro'

  it('warns when the model declares types and the route file predates them', () => {
    const root = project({ [route]: "---\nconst page = await getPage(Astro.params.slug ?? 'index')\n---\n" })
    expect(staleRouteFile(withTypes, root)).toContain('npx bearminion add types')
  })

  it('is quiet for a current route file, a site without types, and a site with routes of its own', () => {
    expect(staleRouteFile(withTypes, project({ [route]: '---\nconst route = await getRoute(pathname)\n---\n' }))).toBeUndefined()
    expect(staleRouteFile(contentModel, project({ [route]: '---\nawait getPage()\n---\n' }))).toBeUndefined()
    expect(staleRouteFile(withTypes, project({}))).toBeUndefined()
  })
})
