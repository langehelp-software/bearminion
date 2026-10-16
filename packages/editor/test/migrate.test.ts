import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { handleEditorRequest } from '../src/api.js'
import { contentCollections } from '../src/content.js'
import { ContentValidationError } from '../src/index.js'
import { loadContent, loadPages } from '../src/astro.js'
import { createMigrator, type ContentMigration } from '../src/migrate.js'
import { API_PREFIX, resolveEditorContext } from '../src/options.js'
import { contentModel, sectionRegistry } from './starter.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const starterContent = path.resolve(here, '../../../templates/default/content')
/** The starter's images: saving content that points at a missing image fails validation. */
const starterAssets = path.resolve(here, '../../../templates/default/src/assets')
const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

/** A copy of the starter content in which `about.json` is a version 1 file that still calls `title` `name`. */
function legacyProject(): { root: string; contentDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bearminion-migrate-'))
  roots.push(root)
  const contentDir = path.join(root, 'content')
  fs.cpSync(starterContent, contentDir, { recursive: true })
  fs.cpSync(starterAssets, path.join(root, 'src', 'assets'), { recursive: true })
  const file = path.join(contentDir, 'pages', 'about.json')
  const { title, ...rest } = JSON.parse(fs.readFileSync(file, 'utf8')) as { title: string }
  fs.writeFileSync(file, JSON.stringify({ ...rest, name: title }))
  return { root, contentDir }
}

const renameNameToTitle: ContentMigration = (document, kind) => {
  if (kind !== 'page' || !('name' in document)) return document
  const { name, ...rest } = document
  return { ...rest, title: name }
}
const v2 = { schemaVersion: 2, migrations: { 1: renameNameToTitle } }

describe('createMigrator', () => {
  it('defaults to version 1 and treats a file without schemaVersion as version 1', () => {
    const migrator = createMigrator()
    expect(migrator.version).toBe(1)
    expect(migrator.upgrade({ a: 1 }, 'page')).toEqual({ ok: true, value: { a: 1 } })
  })

  it('strips the version key, runs each step in order, and passes non-objects through', () => {
    const calls: number[] = []
    const migrator = createMigrator({
      schemaVersion: 3,
      migrations: {
        1: (doc) => {
          calls.push(1)
          return { ...doc, one: true }
        },
        2: (doc) => {
          calls.push(2)
          return { ...doc, two: true }
        },
      },
    })
    expect(migrator.upgrade({ x: 1 }, 'site')).toEqual({ ok: true, value: { x: 1, one: true, two: true } })
    expect(migrator.upgrade({ x: 1, schemaVersion: 2 }, 'site')).toEqual({ ok: true, value: { x: 1, two: true } })
    expect(calls).toEqual([1, 2, 2])
    expect(migrator.upgrade([1], 'page')).toEqual({ ok: true, value: [1] })
  })

  it('refuses newer or malformed versions and reports a failing step', () => {
    const migrator = createMigrator({
      schemaVersion: 2,
      migrations: {
        1: () => {
          throw new Error('boom')
        },
      },
    })
    expect(migrator.upgrade({ schemaVersion: 3 }, 'page')).toMatchObject({ ok: false, message: expect.stringContaining('newer') })
    expect(migrator.upgrade({ schemaVersion: 0 }, 'page')).toMatchObject({ ok: false })
    expect(migrator.upgrade({ schemaVersion: '1' }, 'page')).toMatchObject({ ok: false })
    expect(migrator.upgrade({}, 'page')).toEqual({ ok: false, message: 'Migration from version 1 to 2 failed: boom' })
  })

  it('stamps the current version', () => {
    expect(createMigrator({ schemaVersion: 2, migrations: { 1: (doc) => doc } }).stamp({ a: 1 })).toEqual({ a: 1, schemaVersion: 2 })
  })

  it('rejects a version without its migrations', () => {
    expect(() => createMigrator({ schemaVersion: 3, migrations: { 1: (doc) => doc } })).toThrow(/migrations\[2\]/)
    expect(() => createMigrator({ schemaVersion: 0 })).toThrow(/positive integer/)
    expect(() => createMigrator({ schemaVersion: 2, migrations: { 1: (doc) => doc, 2: (doc) => doc } })).toThrow(/migrations\[2\]/)
  })
})

describe('loading migrated content', () => {
  it('rejects a legacy file until the site supplies the migration', () => {
    const { contentDir } = legacyProject()
    expect(() => loadPages(contentDir, sectionRegistry)).toThrow(ContentValidationError)
    const pages = loadContent(contentDir, { ...contentModel, ...v2 }).pages
    expect(pages.find((page) => page.slug === 'about')?.title).toEqual(expect.any(String))
  })

  it('names schemaVersion when a file is newer than the site', () => {
    const { contentDir } = legacyProject()
    const file = path.join(contentDir, 'site.json')
    const site = JSON.parse(fs.readFileSync(file, 'utf8')) as object
    fs.writeFileSync(file, JSON.stringify({ ...site, schemaVersion: 9 }))
    expect(() => loadContent(contentDir, contentModel)).toThrow(/schemaVersion.*newer/s)
  })

  it('upgrades inside the Astro collection schemas too', () => {
    const { contentDir } = legacyProject()
    const raw = JSON.parse(fs.readFileSync(path.join(contentDir, 'pages', 'about.json'), 'utf8')) as unknown
    const legacy = contentCollections(contentModel, { contentDir })
    expect(legacy.pages.schema.safeParse(raw).success).toBe(false)
    const migrated = contentCollections({ ...contentModel, ...v2 }, { contentDir })
    const parsed = migrated.pages.schema.safeParse(raw)
    expect(parsed.success).toBe(true)
    expect(parsed.success && 'schemaVersion' in parsed.data).toBe(false)
  })
})

describe('editor API versioning', () => {
  async function request(context: ReturnType<typeof resolveEditorContext>, method: string, pathname: string, json?: unknown) {
    const headers = new Headers({ host: '127.0.0.1:4321' })
    if (json !== undefined) headers.set('content-type', 'application/json')
    const response = await handleEditorRequest(
      new Request(`http://127.0.0.1:4321${pathname}`, { method, headers, body: json === undefined ? undefined : JSON.stringify(json) }),
      context,
      { remoteAddress: '127.0.0.1' },
    )
    if (response === null) throw new Error(`No editor response for ${pathname}`)
    return response
  }

  it('serves a legacy page upgraded and stamps the version when it is saved', async () => {
    const { root, contentDir } = legacyProject()
    const context = resolveEditorContext({ ...contentModel, ...v2, contentDir }, root)
    const loaded = await request(context, 'GET', `${API_PREFIX}/pages/about`)
    expect(loaded.status).toBe(200)
    const page = (await loaded.json()) as { title: string }
    expect(page).not.toHaveProperty('schemaVersion')
    expect(page).not.toHaveProperty('name')

    expect((await request(context, 'PUT', `${API_PREFIX}/pages/about`, page)).status).toBe(200)
    const written = JSON.parse(fs.readFileSync(path.join(contentDir, 'pages', 'about.json'), 'utf8')) as Record<string, unknown>
    expect(written.schemaVersion).toBe(2)
    expect(written.title).toBe(page.title)
    expect(written).not.toHaveProperty('name')
  })

  it('answers 422 for a page written by a newer site', async () => {
    const { root, contentDir } = legacyProject()
    const file = path.join(contentDir, 'pages', 'about.json')
    fs.writeFileSync(file, JSON.stringify({ ...(JSON.parse(fs.readFileSync(file, 'utf8')) as object), schemaVersion: 5 }))
    const context = resolveEditorContext({ ...contentModel, contentDir }, root)
    const response = await request(context, 'GET', `${API_PREFIX}/pages`)
    expect(response.status).toBe(422)
    expect(JSON.stringify(await response.json())).toContain('schemaVersion')
  })
})
