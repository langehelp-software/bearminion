import { describe, expect, it } from 'vitest'
import { createSitemapFilter, normalizePathname, pagePath } from '../../templates/default/src/lib/sitemap'

describe('sitemap filter', () => {
  const filter = createSitemapFilter([
    { slug: 'index', seo: { noindex: false } },
    { slug: 'about', seo: {} },
    { slug: 'preview', seo: { noindex: true } },
  ])

  it('maps the home slug to / and other slugs to a path', () => {
    expect(pagePath('index')).toBe('/')
    expect(pagePath('about')).toBe('/about')
    expect(normalizePathname('/about/')).toBe('/about')
    expect(normalizePathname('/')).toBe('/')
  })

  it('includes indexable content pages and drops noindex pages', () => {
    expect(filter('https://bearminion.example/')).toBe(true)
    expect(filter('https://bearminion.example/about/')).toBe(true)
    expect(filter('https://bearminion.example/about')).toBe(true)
    expect(filter('https://bearminion.example/preview/')).toBe(false)
    expect(filter('https://bearminion.example/preview')).toBe(false)
  })

  it('leaves out routes that are not in the content loader', () => {
    expect(filter('https://bearminion.example/style-guide/')).toBe(false)
    expect(filter('https://bearminion.example/style-guide')).toBe(false)
  })
})
