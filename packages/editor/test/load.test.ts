import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ContentReadError, ContentValidationError } from '../src/index.js'
import { loadContent, loadPages, loadSite } from '../src/astro.js'
import { contentModel, sectionRegistry, siteDefinition } from './starter.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtures = path.join(here, 'fixtures')
const starterContent = path.resolve(here, '../../../templates/default/content')

describe('loadContent', () => {
  it('loads the starter site and pages', () => {
    const content = loadContent(starterContent, contentModel)

    expect(content.site.name).toBe('BearMinion')
    expect(content.site.url).toBe('https://example.com')
    expect(content.site.seo.titleTemplate).toBe('%s · BearMinion')
    expect(content.site.header.variant).toBe('floating')
    expect(content.site.header.links.map((item) => item.href)).toEqual(['/#features', '/#pricing', '/#faq', '/about'])
    expect(content.site.footer.variant).toBe('wordmark')
    expect(content.site.footer.columns).toHaveLength(3)
    expect(content.site.theme).toEqual({ mode: 'light', motion: true })

    expect(content.pages.map((page) => page.slug)).toEqual(['404', 'about', 'index', 'preview'])
    expect(content.pages.find((page) => page.slug === 'preview')?.seo.noindex).toBe(true)
    expect(content.pages.find((page) => page.slug === 'index')?.seo.noindex).toBe(false)
    const home = content.pages.find((page) => page.slug === 'index')
    expect(home?.sections.map((section) => section.type)).toEqual([
      'hero',
      'logoStrip',
      'features',
      'textImage',
      'stats',
      'testimonials',
      'pricing',
      'faq',
      'cta',
      'contact',
    ])
    expect(home?.sections.find((section) => section.type === 'stats')?.tone).toBe('inverse')
    expect(home?.seo.ogImage).toBe('src/assets/uploads/og.png')
  })

  it('loads a valid fixture directory', () => {
    const content = loadContent(path.join(fixtures, 'valid'), contentModel)
    expect(content.site.name).toBe('Fixture')
    expect(content.pages).toHaveLength(1)
    expect(content.pages[0]?.slug).toBe('index')
  })

  it('reports a missing site name with the file path', () => {
    const dir = path.join(fixtures, 'invalid', 'missing-name')
    expect(() => loadSite(dir, siteDefinition)).toThrow(ContentValidationError)
    try {
      loadSite(dir, siteDefinition)
    } catch (error) {
      expect(error).toBeInstanceOf(ContentValidationError)
      if (error instanceof ContentValidationError) {
        expect(error.filePath).toBe(path.join(dir, 'site.json'))
        expect(error.message).toContain('Invalid content in')
        expect(error.issues.some((issue) => issue.path.join('.') === 'name')).toBe(true)
      }
    }
  })

  it('reports a navigation item that is missing href', () => {
    const dir = path.join(fixtures, 'invalid', 'bad-nav')
    try {
      loadSite(dir, siteDefinition)
      expect.fail('expected validation to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(ContentValidationError)
      if (error instanceof ContentValidationError) {
        expect(error.message).toContain(path.join(dir, 'site.json'))
        expect(error.issues.some((issue) => issue.path.join('.') === 'header.links.0.href')).toBe(true)
      }
    }
  })

  it('reports invalid section props with a field path', () => {
    const dir = path.join(fixtures, 'invalid', 'bad-props')
    try {
      loadPages(dir, sectionRegistry)
      expect.fail('expected validation to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(ContentValidationError)
      if (error instanceof ContentValidationError) {
        expect(error.filePath).toBe(path.join(dir, 'pages', 'index.json'))
        const paths = error.issues.map((issue) => issue.path.join('.'))
        // The hero's props are all optional, so only the features section is wrong.
        expect(paths).toContain('sections.1.props.items.0.title')
        expect(paths.some((item) => item.startsWith('sections.0'))).toBe(false)
        expect(error.message).toMatch(/sections\.1\.props\.items\.0\.title/)
      }
    }
  })

  it('reports an unknown section type', () => {
    const dir = path.join(fixtures, 'invalid', 'unknown-type')
    try {
      loadPages(dir, sectionRegistry)
      expect.fail('expected validation to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(ContentValidationError)
      if (error instanceof ContentValidationError) {
        expect(error.message).toMatch(/Unknown section type "banner"/)
        expect(error.issues.some((issue) => issue.path.join('.').includes('type'))).toBe(true)
      }
    }
  })

  it('reports duplicate section ids', () => {
    const dir = path.join(fixtures, 'invalid', 'duplicate-ids')
    try {
      loadPages(dir, sectionRegistry)
      expect.fail('expected validation to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(ContentValidationError)
      if (error instanceof ContentValidationError) {
        expect(error.message).toMatch(/Duplicate section id "hero"/)
        expect(error.issues.some((issue) => issue.path.join('.') === 'sections.1.id')).toBe(true)
      }
    }
  })

  it('reports duplicate slugs across pages', () => {
    const dir = path.join(fixtures, 'invalid', 'duplicate-slug')
    try {
      loadPages(dir, sectionRegistry)
      expect.fail('expected validation to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(ContentValidationError)
      if (error instanceof ContentValidationError) {
        expect(error.filePath).toBe(path.join(dir, 'pages', 'b.json'))
        expect(error.message).toMatch(/Duplicate slug "about"/)
        expect(error.message).toContain(path.join(dir, 'pages', 'a.json'))
      }
    }
  })

  it('reports invalid JSON separately from schema errors', () => {
    const dir = path.join(fixtures, 'invalid', 'bad-json')
    try {
      loadPages(dir, sectionRegistry)
      expect.fail('expected JSON parsing to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(ContentReadError)
      if (error instanceof ContentReadError) {
        expect(error.filePath).toBe(path.join(dir, 'pages', 'index.json'))
        expect(error.message).toMatch(/Invalid JSON/)
      }
    }
  })

  it('reports a missing content file', () => {
    const missing = path.join(fixtures, 'does-not-exist')
    expect(() => loadSite(missing, siteDefinition)).toThrow(ContentReadError)
    try {
      loadSite(missing, siteDefinition)
    } catch (error) {
      expect(error).toBeInstanceOf(ContentReadError)
      if (error instanceof ContentReadError) {
        expect(error.message).toMatch(/not found/)
        expect(error.filePath).toBe(path.join(missing, 'site.json'))
      }
    }
  })
})
