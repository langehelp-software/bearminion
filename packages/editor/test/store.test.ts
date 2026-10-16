import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultTheme } from '../src/theme.js'
import { handleEditorRequest } from '../src/api.js'
import type { ListedImage, SavedImage } from '../src/images.js'
import type { EditorContext } from '../src/options.js'
import { stableStringify } from '../src/stable-json.js'
import { createMigrator } from '../src/migrate.js'
import { StoreKeyError, createFileStore, pageKey, type ContentStore } from '../src/store.js'
import { sectionRegistry, siteDefinition } from './starter.js'

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

function tempDir(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bearminion-store-'))
  directories.push(directory)
  return directory
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

describe('file store', () => {
  function fileStore() {
    const root = tempDir()
    const contentDir = path.join(root, 'content')
    const uploadsDir = path.join(root, 'src', 'assets', 'uploads')
    return { root, contentDir, uploadsDir, store: createFileStore({ root, contentDir, uploadsDir }) }
  }

  it('reads, lists and applies documents by key', async () => {
    const { contentDir, store } = fileStore()
    expect(await store.read('site.json')).toBeUndefined()
    expect(await store.exists('site.json')).toBe(false)
    expect(await store.list('pages')).toBeUndefined()

    await store.apply([
      { type: 'write', key: 'pages/b.json', text: '{"b":1}\n' },
      { type: 'write', key: 'pages/a.json', text: '{"a":1}\n' },
    ])
    expect(await store.read('pages/a.json')).toBe('{"a":1}\n')
    expect(await store.exists('pages/b.json')).toBe(true)
    expect(await store.list('pages')).toEqual(['a.json', 'b.json'])
    expect(fs.readFileSync(path.join(contentDir, 'pages', 'a.json'), 'utf8')).toBe('{"a":1}\n')

    // A rename: the new file is written, the old one removed, and removing a missing key is not an error.
    await store.apply([
      { type: 'write', key: 'pages/c.json', text: '{"c":1}\n' },
      { type: 'remove', key: 'pages/a.json' },
      { type: 'remove', key: 'pages/missing.json' },
    ])
    expect(await store.list('pages')).toEqual(['b.json', 'c.json'])
  })

  it('refuses keys outside the content directory and writes nothing for a bad batch', async () => {
    const { contentDir, store } = fileStore()
    for (const key of ['', '../site.json', 'pages/../../x.json', '/etc/passwd', 'pages//a.json', './a.json']) {
      await expect(store.read(key)).rejects.toBeInstanceOf(StoreKeyError)
    }
    await expect(
      store.apply([
        { type: 'write', key: 'pages/ok.json', text: '{}' },
        { type: 'write', key: '../escape.json', text: '{}' },
      ]),
    ).rejects.toBeInstanceOf(StoreKeyError)
    expect(fs.existsSync(path.join(contentDir, 'pages', 'ok.json'))).toBe(false)
  })

  it('saves, lists and removes uploads', async () => {
    const { uploadsDir, store } = fileStore()
    const saved = await store.uploads.save({ originalName: 'Hero Shot.PNG', bytes: PNG, kind: 'png' })
    expect(saved.filename).toMatch(/^hero-shot-[0-9a-f]{8}\.png$/)
    expect(saved.path).toBe(`src/assets/uploads/${saved.filename}`)
    expect(fs.existsSync(path.join(uploadsDir, saved.filename))).toBe(true)
    expect(await store.uploads.list()).toEqual([{ filename: saved.filename, path: saved.path }])
    expect(await store.uploads.remove('nope.png')).toBe(false)
    expect(await store.uploads.remove(saved.filename)).toBe(true)
    expect(await store.uploads.list()).toEqual([])
  })

  it('builds page keys from slugs', () => {
    expect(pageKey('about')).toBe('pages/about.json')
  })
})

/** A store that keeps everything in memory, to show the editor API needs nothing from the disk. */
function memoryStore(
  documents: Record<string, string>,
): ContentStore & { documents: Map<string, string>; images: Map<string, Uint8Array> } {
  const docs = new Map(Object.entries(documents))
  const images = new Map<string, Uint8Array>()
  return {
    documents: docs,
    images,
    async read(key) {
      return docs.get(key)
    },
    async exists(key) {
      return docs.has(key)
    },
    async list(dir) {
      const prefix = `${dir}/`
      const names = [...docs.keys()].filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
      return names.length === 0 ? undefined : names.map((key) => key.slice(prefix.length)).sort()
    },
    async apply(operations) {
      for (const operation of operations) if (operation.type === 'write') docs.set(operation.key, operation.text)
      for (const operation of operations) if (operation.type === 'remove') docs.delete(operation.key)
    },
    uploads: {
      async list(): Promise<ListedImage[]> {
        return [...images.keys()].sort().map((filename) => ({ filename, path: `memory/${filename}` }))
      },
      async save({ originalName, bytes }): Promise<SavedImage> {
        const filename = `${originalName.replace(/\.[^.]+$/, '')}-mem.png`
        images.set(filename, bytes)
        return { filename, path: `memory/${filename}`, bytes: bytes.byteLength }
      },
      async remove(filename) {
        return images.delete(filename)
      },
    },
  }
}

describe('editor API on a custom store', () => {
  const hero = {
    id: 'hero',
    type: 'hero',
    variant: sectionRegistry.hero.defaultVariant,
    tone: 'base',
    props: sectionRegistry.hero.defaults,
  }
  const page = (slug: string, title: string) => ({
    slug,
    title,
    seo: { title, description: '', noindex: false, nofollow: false },
    sections: [hero],
  })

  function setup() {
    const root = tempDir()
    const store = memoryStore({
      'site.json': stableStringify({
        name: 'Memory',
        url: 'https://memory.example',
        seo: {},
        header: { links: [] },
        footer: { columns: [] },
      }),
      'pages/index.json': stableStringify(page('index', 'Home')),
    })
    const missing = path.join(root, 'no-such-content-dir')
    const context: EditorContext = {
      root,
      contentDir: missing,
      uploadsDir: path.join(missing, 'uploads'),
      sections: sectionRegistry,
      site: siteDefinition,
      store,
      migrator: createMigrator(),
      theme: defaultTheme,
      git: false,
    }
    async function call(method: string, pathname: string, body?: unknown): Promise<Response> {
      const headers = new Headers({ host: '127.0.0.1:4321' })
      const isForm = body instanceof FormData
      if (body !== undefined && !isForm) headers.set('content-type', 'application/json')
      const response = await handleEditorRequest(
        new Request(`http://127.0.0.1:4321/__bearminion/api${pathname}`, {
          method,
          headers,
          body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
        }),
        context,
        { remoteAddress: '127.0.0.1' },
      )
      if (response === null) throw new Error('no response')
      return response
    }
    return { store, call, missing }
  }

  it('reads the site and pages from the store', async () => {
    const { call } = setup()
    const site = await call('GET', '/site')
    expect(site.status).toBe(200)
    expect(((await site.json()) as { name: string }).name).toBe('Memory')
    const pages = (await (await call('GET', '/pages')).json()) as { pages: { slug: string; file: string }[] }
    expect(pages.pages).toEqual([expect.objectContaining({ slug: 'index', file: 'index.json' })])
    const schema = await call('GET', '/schema')
    expect(((await schema.json()) as { projectId: string }).projectId).toEqual(expect.any(String))
  })

  it('creates, saves, renames, promotes and deletes pages in the store', async () => {
    const { call, store, missing } = setup()
    expect((await call('POST', '/pages', { slug: 'about', title: 'About' })).status).toBe(201)
    expect(store.documents.has('pages/about.json')).toBe(true)
    expect((await call('POST', '/pages', { slug: 'about', title: 'Again' })).status).toBe(409)

    const saved = await call('PUT', '/pages/about', page('about', 'About us'))
    expect(saved.status).toBe(200)
    expect(JSON.parse(store.documents.get('pages/about.json') ?? '{}').title).toBe('About us')

    expect((await call('POST', '/pages/about/rename', { slug: 'company' })).status).toBe(200)
    expect([...store.documents.keys()].sort()).toEqual(['pages/company.json', 'pages/index.json', 'site.json'])

    const promoted = await call('POST', '/pages/company/set-home', { previousSlug: 'old-home' })
    expect(promoted.status).toBe(200)
    expect([...store.documents.keys()].sort()).toEqual(['pages/index.json', 'pages/old-home.json', 'site.json'])
    expect(JSON.parse(store.documents.get('pages/index.json') ?? '{}').slug).toBe('index')
    expect(JSON.parse(store.documents.get('pages/old-home.json') ?? '{}').slug).toBe('old-home')

    expect((await call('DELETE', '/pages/old-home')).status).toBe(200)
    expect(store.documents.has('pages/old-home.json')).toBe(false)
    expect(fs.existsSync(missing)).toBe(false)
  })

  it('writes the site and keeps uploads in the store', async () => {
    const { call, store } = setup()
    const site = (await (await call('GET', '/site')).json()) as Record<string, unknown>
    const put = await call('PUT', '/site', { ...site, name: 'Renamed' })
    expect(put.status).toBe(200)
    expect(JSON.parse(store.documents.get('site.json') ?? '{}').name).toBe('Renamed')
  })

  it('stores uploads through the store, not the uploads folder', async () => {
    const { call, store, missing } = setup()
    const form = new FormData()
    form.set('file', new File([PNG], 'logo.png', { type: 'image/png' }))
    const uploaded = await call('POST', '/images', form)
    expect(uploaded.status).toBe(201)
    const saved = (await uploaded.json()) as { filename: string; path: string }
    expect(saved).toMatchObject({ filename: 'logo-mem.png', path: 'memory/logo-mem.png' })
    expect(store.images.has('logo-mem.png')).toBe(true)

    const listed = (await (await call('GET', '/images')).json()) as { images: { filename: string }[] }
    expect(listed.images.map((image) => image.filename)).toEqual(['logo-mem.png'])
    expect((await call('DELETE', '/images/logo-mem.png')).status).toBe(200)
    expect((await call('DELETE', '/images/logo-mem.png')).status).toBe(404)
    expect(fs.existsSync(missing)).toBe(false)
  })
})
