import { describe, expect, it } from 'vitest'
import {
  formatJsonLd,
  generateSiteJsonLd,
  hasJsonLdId,
  isPlaceholderSiteUrl,
  jsonLdWarnings,
  mergeJsonLd,
  parseJsonLdInput,
  siteJsonLdIds,
  upsertJsonLd,
} from '../src/index.js'

const article = { '@context': 'https://schema.org', '@type': 'Article', headline: 'Hello' }

describe('parseJsonLdInput', () => {
  it('treats empty input as no custom JSON-LD', () => {
    expect(parseJsonLdInput('  \n')).toEqual({ ok: true, value: [] })
    expect(parseJsonLdInput('[]')).toEqual({ ok: true, value: [] })
  })

  it('accepts one object, an array, and an @graph object', () => {
    expect(parseJsonLdInput(JSON.stringify(article))).toEqual({ ok: true, value: [article] })
    expect(parseJsonLdInput(JSON.stringify([article, article]))).toEqual({ ok: true, value: [article, article] })
    const graph = { '@context': 'https://schema.org', '@graph': [{ '@type': 'Organization', name: 'X' }] }
    expect(parseJsonLdInput(JSON.stringify(graph))).toEqual({ ok: true, value: [graph] })
  })

  it('unwraps a pasted script tag', () => {
    const pasted = `<script type="application/ld+json">\n${JSON.stringify(article)}\n</script>`
    expect(parseJsonLdInput(pasted)).toEqual({ ok: true, value: [article] })
    expect(parseJsonLdInput(`<SCRIPT TYPE='application/ld+json' id="x">${JSON.stringify(article)}</SCRIPT>`)).toEqual({
      ok: true,
      value: [article],
    })
  })

  it('reports invalid JSON and non-object values', () => {
    const broken = parseJsonLdInput('{"@type": "Article",}')
    expect(broken.ok).toBe(false)
    expect(parseJsonLdInput('"text"')).toMatchObject({ ok: false })
    expect(parseJsonLdInput('[1, 2]')).toMatchObject({ ok: false })
    expect(parseJsonLdInput('[[{}]]')).toMatchObject({ ok: false })
  })

  it('does not unwrap other script tags', () => {
    expect(parseJsonLdInput('<script>alert(1)</script>')).toMatchObject({ ok: false })
  })
})

describe('formatJsonLd', () => {
  it('shows one block as an object and several as an array', () => {
    expect(formatJsonLd(undefined)).toBe('')
    expect(formatJsonLd([])).toBe('')
    expect(JSON.parse(formatJsonLd([article]))).toEqual(article)
    expect(JSON.parse(formatJsonLd([article, article]))).toEqual([article, article])
  })

  it('round-trips through the parser', () => {
    expect(parseJsonLdInput(formatJsonLd([article, article]))).toEqual({ ok: true, value: [article, article] })
  })
})

describe('jsonLdWarnings', () => {
  it('flags a missing context or type but not a graph', () => {
    expect(jsonLdWarnings([article])).toEqual([])
    expect(jsonLdWarnings([{ '@context': 'https://schema.org', '@graph': [] }])).toEqual([])
    expect(jsonLdWarnings([{ name: 'x' }])).toHaveLength(2)
  })
})

describe('siteJsonLdIds', () => {
  it('builds the ids from the site URL and ignores trailing slashes', () => {
    expect(siteJsonLdIds('https://example.org')).toEqual({
      organization: 'https://example.org/#organization',
      website: 'https://example.org/#website',
    })
    expect(siteJsonLdIds('https://example.org///')).toEqual(siteJsonLdIds('https://example.org'))
  })
})

describe('mergeJsonLd', () => {
  const org = { '@type': 'Organization', '@id': 'https://x.test/#organization', name: 'Site' }
  const site = [org, { '@type': 'WebSite', '@id': 'https://x.test/#website' }, { '@type': 'Thing' }]

  it('puts every site block on a page that has no markup of its own', () => {
    const webPage = { '@type': 'WebPage' }
    expect(mergeJsonLd(site, [webPage])).toEqual([...site, webPage])
    expect(mergeJsonLd(undefined, [webPage])).toEqual([webPage])
  })

  it('emits a block once when the page uses the same @id, and the page wins', () => {
    const refined = { '@type': 'Organization', '@id': 'https://x.test/#organization', name: 'Page' }
    const merged = mergeJsonLd(site, [refined])
    expect(merged.filter((block) => block['@id'] === refined['@id'])).toEqual([refined])
    expect(merged).toHaveLength(3)
    expect(merged.at(-1)).toBe(refined)
  })

  it('keeps blocks without an @id, even when they look alike', () => {
    expect(mergeJsonLd([{ '@type': 'Thing' }], [{ '@type': 'Thing' }])).toHaveLength(2)
  })

  it('finds a block by @id', () => {
    expect(hasJsonLdId(site, 'https://x.test/#organization')).toBe(true)
    expect(hasJsonLdId(site, 'https://x.test/#missing')).toBe(false)
    expect(hasJsonLdId(undefined, 'https://x.test/#organization')).toBe(false)
  })
})

describe('generateSiteJsonLd', () => {
  it('writes an Organization and a WebSite from the site settings', () => {
    const [organization, website] = generateSiteJsonLd({ name: 'Acme', url: 'https://acme.test/', lang: 'pl' })
    expect(organization).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': 'https://acme.test/#organization',
      name: 'Acme',
      url: 'https://acme.test/',
    })
    expect(website).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': 'https://acme.test/#website',
      name: 'Acme',
      url: 'https://acme.test/',
      inLanguage: 'pl',
    })
  })

  it('defaults the language to en and adds the logo only when given', () => {
    const [organization, website] = generateSiteJsonLd({ name: 'Acme', url: 'https://acme.test', logo: 'https://acme.test/logo.png' })
    expect(organization?.logo).toBe('https://acme.test/logo.png')
    expect(website?.inLanguage).toBe('en')
    expect(generateSiteJsonLd({ name: 'Acme', url: 'https://acme.test' })[0]).not.toHaveProperty('logo')
  })

  it('has no SearchAction, which Google no longer shows', () => {
    expect(JSON.stringify(generateSiteJsonLd({ name: 'Acme', url: 'https://acme.test' }))).not.toContain('SearchAction')
  })

  it('passes the same warnings check as pasted markup', () => {
    expect(jsonLdWarnings(generateSiteJsonLd({ name: 'Acme', url: 'https://acme.test' }))).toEqual([])
  })
})

describe('upsertJsonLd', () => {
  const [organization, website] = generateSiteJsonLd({ name: 'New', url: 'https://x.test' }) as [
    Record<string, unknown>,
    Record<string, unknown>,
  ]

  it('replaces blocks with the same @id in place and keeps the others', () => {
    const mine = { '@type': 'Event', name: 'Launch' }
    const stale = { ...organization, name: 'Old' }
    const next = upsertJsonLd([mine, stale], [organization, website])
    expect(next).toEqual([mine, organization, website])
  })

  it('appends to an empty list', () => {
    expect(upsertJsonLd([], [organization, website])).toEqual([organization, website])
  })
})

describe('isPlaceholderSiteUrl', () => {
  it('flags example.com and its subdomains only', () => {
    expect(isPlaceholderSiteUrl('https://example.com')).toBe(true)
    expect(isPlaceholderSiteUrl('https://www.example.com/')).toBe(true)
    expect(isPlaceholderSiteUrl('https://example.org')).toBe(false)
    expect(isPlaceholderSiteUrl('https://myexample.com')).toBe(false)
    expect(isPlaceholderSiteUrl('not a url')).toBe(false)
  })
})
