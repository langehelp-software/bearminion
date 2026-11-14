import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { LISTINGS_COLLECTION, SINGLES_COLLECTION, contentCollections } from '../src/content.js'
import { multi, single } from '../src/content-types.js'
import { CONTENT_COLLECTIONS_MARKER } from '../src/reload.js'
import { contentModel } from './starter.js'

const contentDir = path.resolve(__dirname, '../../../templates/default/content')
const readJson = (...parts: string[]): unknown => JSON.parse(fs.readFileSync(path.join(contentDir, ...parts), 'utf8'))

describe('contentCollections', () => {
  const { pages, site } = contentCollections(contentModel, { contentDir })

  it('gives Astro a glob loader per collection', () => {
    expect(pages.loader.name).toBe('glob-loader')
    expect(site.loader.name).toBe('glob-loader')
  })

  it('validates the starter content with the content model schemas', () => {
    const home = pages.schema.parse(readJson('pages', 'index.json'))
    expect(home.slug).toBe('index')
    expect(home.sections.length).toBeGreaterThan(0)
    const parsedSite = site.schema.parse(readJson('site.json'))
    expect(parsedSite.header.variant).toEqual(expect.any(String))
  })

  it('rejects a page whose section does not match its type', () => {
    const page = readJson('pages', 'index.json') as { sections: { props: Record<string, unknown> }[] }
    const broken = { ...page, sections: [{ ...page.sections[0], variant: 'no-such-variant' }] }
    expect(pages.schema.safeParse(broken).success).toBe(false)
  })

  it('defaults the content directory to ./content', () => {
    expect(() => contentCollections(contentModel)).not.toThrow()
  })

  it('tells the editor reload plugin that Astro reloads this content', () => {
    delete (globalThis as Record<symbol, unknown>)[CONTENT_COLLECTIONS_MARKER]
    contentCollections(contentModel, { contentDir })
    expect((globalThis as Record<symbol, unknown>)[CONTENT_COLLECTIONS_MARKER]).toBe(true)
  })
})

describe('contentCollections with content types', () => {
  const seo = { title: 'T', description: '', noindex: false, nofollow: false }
  const home = readJson('pages', 'index.json') as { sections: unknown[] }
  const document = (slug: string, extra: Record<string, unknown> = {}) => ({ slug, title: 'T', seo, sections: home.sections, ...extra })

  it('has no extra collections for a model without types', () => {
    expect(contentCollections(contentModel, { contentDir }).types).toEqual({})
  })

  it('adds a collection per declared type, and one each for listings and singles when there are any', () => {
    const model = {
      ...contentModel,
      types: {
        blog: multi({ fields: z.object({ date: z.iso.date() }), listing: {} }),
        notes: multi(),
        about: single({ path: '/about' }),
        legal: single({ path: '/legal', fields: z.object({ updated: z.iso.date() }) }),
      },
    }
    const { types } = contentCollections(model, { contentDir })
    expect(Object.keys(types).sort()).toEqual([LISTINGS_COLLECTION, SINGLES_COLLECTION, 'blog', 'notes'].sort())
    expect(contentCollections({ ...contentModel, types: { notes: multi() } }, { contentDir }).types).toHaveProperty('notes')
    expect(Object.keys(contentCollections({ ...contentModel, types: { notes: multi() } }, { contentDir }).types)).toEqual(['notes'])

    const blog = types.blog?.schema
    expect(blog?.safeParse(document('first', { fields: { date: '2026-01-05' } })).success).toBe(true)
    expect(blog?.safeParse(document('first')).success).toBe(false)
    expect(types.notes?.schema.safeParse({ ...document('n'), schemaVersion: 1 }).success).toBe(true)
    expect(types[LISTINGS_COLLECTION]?.schema.safeParse({ title: 'Blog', seo, sections: [] }).success).toBe(true)

    // Each single is checked by its own schema: the slug inside the file says which one it is.
    const singles = types[SINGLES_COLLECTION]?.schema
    expect(singles?.safeParse(document('about')).success).toBe(true)
    expect(singles?.safeParse(document('legal')).success).toBe(false)
    expect(singles?.safeParse(document('legal', { fields: { updated: '2026-01-05' } })).success).toBe(true)
    expect(singles?.safeParse(document('other')).success).toBe(false)
  })

  it('checks the home page as a page when the pages type has fields of its own', () => {
    const model = { ...contentModel, types: { pages: multi({ fields: z.object({ badge: z.string() }) }) } }
    const { pages } = contentCollections(model, { contentDir })
    expect(pages.schema.safeParse(readJson('pages', 'index.json')).success).toBe(true)
    expect(pages.schema.safeParse(document('team')).success).toBe(false)
    expect(pages.schema.safeParse(document('team', { fields: { badge: 'new' } })).success).toBe(true)
  })
})
