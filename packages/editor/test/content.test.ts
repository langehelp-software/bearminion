import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { contentCollections } from '../src/content.js'
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
