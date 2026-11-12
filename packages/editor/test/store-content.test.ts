import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ContentReadError, ContentValidationError } from '../src/errors.js'
import { createStoreContent } from '../src/store-content.js'
import type { ContentStore } from '../src/store-core.js'
import { contentModel } from './starter.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const starterContent = path.resolve(here, '../../../templates/default/content')

function readStarter(): Record<string, string> {
  const files: Record<string, string> = {}
  for (const name of ['site.json', ...fs.readdirSync(path.join(starterContent, 'pages')).map((f) => `pages/${f}`)]) {
    files[name] = fs.readFileSync(path.join(starterContent, name), 'utf8')
  }
  return files
}

function storeOf(files: Record<string, string>): ContentStore {
  const unsupported = (): never => {
    throw new Error('not used')
  }
  return {
    read: async (key) => files[key],
    exists: async (key) => key in files,
    list: unsupported,
    apply: unsupported,
    uploads: { list: unsupported, save: unsupported, remove: unsupported },
  }
}

describe('createStoreContent', () => {
  it('reads the site and a page the way the build does', async () => {
    const files = readStarter()
    const content = createStoreContent(contentModel, storeOf(files))
    const site = (await content.getSite()) as { name: string }
    expect(site.name).toBe((JSON.parse(files['site.json'] as string) as { name: string }).name)
    const page = await content.getPage('index')
    expect(page?.slug).toBe('index')
    expect(page?.sections.length).toBeGreaterThan(0)
  })

  it('returns undefined for a missing page or a name that is not a slug', async () => {
    const content = createStoreContent(contentModel, storeOf(readStarter()))
    expect(await content.getPage('nope')).toBeUndefined()
    expect(await content.getPage('../site')).toBeUndefined()
    expect(await content.getPage('Index')).toBeUndefined()
  })

  it('reads what the store holds now, not a cached copy', async () => {
    const files = readStarter()
    const content = createStoreContent(contentModel, storeOf(files))
    const before = await content.getPage('index')
    files['pages/index.json'] = JSON.stringify({ ...(before as object), title: 'Changed' })
    expect((await content.getPage('index'))?.title).toBe('Changed')
  })

  it('drops a section the site no longer defines unless told to reject it', async () => {
    const files = readStarter()
    const page = JSON.parse(files['pages/index.json'] as string) as { sections: unknown[] }
    page.sections.push({ id: 'old-1', type: 'retired', props: {} })
    files['pages/index.json'] = JSON.stringify(page)
    const kept = await createStoreContent(contentModel, storeOf(files)).getPage('index')
    expect(kept?.sections.some((s) => s.type === 'retired')).toBe(false)
    await expect(createStoreContent(contentModel, storeOf(files), { tolerateOrphans: false }).getPage('index')).rejects.toBeInstanceOf(
      ContentValidationError,
    )
  })

  it('fails loudly on a missing site, bad JSON and an invalid page', async () => {
    const files = readStarter()
    delete files['site.json']
    files['pages/bad.json'] = '{nope'
    files['pages/invalid.json'] = JSON.stringify({ slug: 'invalid' })
    const content = createStoreContent(contentModel, storeOf(files))
    await expect(content.getSite()).rejects.toBeInstanceOf(ContentReadError)
    await expect(content.getPage('bad')).rejects.toBeInstanceOf(ContentReadError)
    await expect(content.getPage('invalid')).rejects.toBeInstanceOf(ContentValidationError)
  })

  it('refuses a document written by a newer schema version', async () => {
    const files = readStarter()
    files['pages/index.json'] = JSON.stringify({ ...JSON.parse(files['pages/index.json'] as string), schemaVersion: 9 })
    await expect(createStoreContent(contentModel, storeOf(files)).getPage('index')).rejects.toBeInstanceOf(ContentValidationError)
  })
})
