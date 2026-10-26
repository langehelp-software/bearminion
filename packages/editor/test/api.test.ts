import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultTheme } from '../src/theme.js'
import { z } from 'zod'
import { handleEditorRequest } from '../src/api.js'
import { defineSection } from '../src/define-section.js'
import { API_PREFIX, type EditorContext, type SectionRegistry } from '../src/options.js'
import { IMAGE_BYTE_LIMIT, JSON_BODY_LIMIT } from '../src/security.js'
import { createMigrator } from '../src/migrate.js'
import { createFileStore } from '../src/store.js'
import { contentCounts, sectionOptions, sectionRegistry, sectionTypes, siteDefinition, siteOptions } from './starter.js'
import { stableStringify } from '../src/stable-json.js'

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

function seed(): EditorContext {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bearminion-api-'))
  directories.push(root)
  const contentDir = path.join(root, 'content')
  const pagesDir = path.join(contentDir, 'pages')
  fs.mkdirSync(pagesDir, { recursive: true })
  fs.writeFileSync(
    path.join(contentDir, 'site.json'),
    stableStringify({
      footer: { columns: [] },
      header: {
        cta: { href: '#cta', label: 'Start' },
        links: [{ href: '/', label: 'Home' }],
      },
      name: 'Demo',
      seo: { titleTemplate: '%s · Demo' },
      url: 'https://bearminion.example',
    }),
  )
  fs.writeFileSync(
    path.join(pagesDir, 'index.json'),
    stableStringify({
      sections: [
        {
          id: 'hero',
          props: {
            eyebrow: 'Eyebrow',
            heading: 'Hello',
            primary: { href: '#cta', label: 'Go' },
            secondary: { href: '#features', label: 'More' },
            sub: 'Sub',
          },
          type: 'hero',
        },
      ],
      seo: { description: 'Hello', nofollow: false, noindex: false, title: 'Home' },
      slug: 'index',
      title: 'Home',
    }),
  )
  const uploadsDir = path.join(root, 'src', 'assets', 'uploads')
  return {
    root,
    contentDir,
    uploadsDir,
    videosDir: path.join(root, 'public', 'videos'),
    maxVideoBytes: 50 * 1_048_576,
    sections: sectionRegistry,
    site: siteDefinition,
    store: createFileStore({ root, contentDir, uploadsDir, videosDir: path.join(root, 'public', 'videos') }),
    migrator: createMigrator(),
    theme: defaultTheme,
    git: false,
  }
}

async function call(
  context: EditorContext,
  method: string,
  pathname: string,
  init: {
    json?: unknown
    form?: FormData
    headers?: Record<string, string>
    remoteAddress?: string | null
    rawBody?: string
    preview?: (page: unknown, motion: boolean) => Promise<string>
  } = {},
): Promise<Response> {
  const headers = new Headers({ host: '127.0.0.1:4321', ...init.headers })
  let body: string | FormData | undefined
  if (init.form) {
    body = init.form
  } else if (init.rawBody !== undefined) {
    body = init.rawBody
    if (!headers.has('content-type')) headers.set('content-type', 'application/json')
  } else if (init.json !== undefined) {
    body = JSON.stringify(init.json)
    headers.set('content-type', 'application/json')
  }
  const request = new Request(`http://127.0.0.1:4321${pathname}`, { method, headers, body })
  const response = await handleEditorRequest(request, context, {
    remoteAddress: init.remoteAddress === undefined ? '127.0.0.1' : init.remoteAddress,
    renderPreview: init.preview,
  })
  if (response === null) throw new Error(`Expected an editor response for ${pathname}`)
  return response
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

describe('editor API', () => {
  it('ignores URLs outside the editor prefix', async () => {
    const context = withRegistry(seed())
    const response = await handleEditorRequest(
      new Request('http://127.0.0.1:4321/about', { headers: { host: '127.0.0.1:4321' } }),
      context,
      { remoteAddress: '127.0.0.1' },
    )
    expect(response).toBeNull()
  })

  it('returns field errors and does not touch disk when a write is invalid', async () => {
    const context = withRegistry(seed())
    const sitePath = path.join(context.contentDir, 'site.json')
    const pagePath = path.join(context.contentDir, 'pages', 'index.json')
    const siteBefore = fs.readFileSync(sitePath)
    const pageBefore = fs.readFileSync(pagePath)

    const site = await call(context, 'PUT', `${API_PREFIX}/site`, {
      json: { name: 'Demo', url: 'not-a-url' },
    })
    expect(site.status).toBe(400)
    const siteBody = (await site.json()) as { error: string; issues: { path: string; message: string }[] }
    expect(siteBody.error).toBe('validation')
    expect(siteBody.issues.some((issue) => issue.path === 'url' || issue.path.startsWith('url'))).toBe(true)
    expect(fs.readFileSync(sitePath)).toEqual(siteBefore)

    const page = await call(context, 'PUT', `${API_PREFIX}/pages/index`, {
      json: {
        slug: 'index',
        title: 'Home',
        seo: { title: 'Home', description: '' },
        sections: [{ id: 'hero', type: 'banner', props: {} }],
      },
    })
    expect(page.status).toBe(400)
    const pageBody = (await page.json()) as { issues: { path: string; message: string }[] }
    expect(pageBody.issues.some((issue) => issue.path.includes('type'))).toBe(true)
    expect(fs.readFileSync(pagePath)).toEqual(pageBefore)
    expect(fs.readdirSync(context.contentDir).filter((name) => name.endsWith('.tmp'))).toEqual([])
    expect(fs.readdirSync(path.join(context.contentDir, 'pages')).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('writes stable JSON and fills schema defaults', async () => {
    const context = withRegistry(seed())
    const response = await call(context, 'PUT', `${API_PREFIX}/pages/index`, {
      json: {
        title: 'Home',
        slug: 'index',
        sections: [
          {
            type: 'hero',
            id: 'hero',
            props: {
              eyebrow: 'Eyebrow',
              heading: 'Updated',
              sub: 'Sub',
              primary: { label: 'Go', href: '#cta' },
              secondary: { label: 'More', href: '#features' },
            },
          },
        ],
        seo: { description: 'Hello', title: 'Home' },
      },
    })
    expect(response.status).toBe(200)
    const file = fs.readFileSync(path.join(context.contentDir, 'pages', 'index.json'), 'utf8')
    const parsed = JSON.parse(file) as { seo: { noindex: boolean }; sections: { props: { heading: string } }[] }
    expect(file.endsWith('\n')).toBe(true)
    expect(file).toBe(stableStringify(parsed))
    expect(parsed.seo.noindex).toBe(false)
    expect(parsed.sections[0]?.props.heading).toBe('Updated')
    expect(file.indexOf('\n  "sections"')).toBeLessThan(file.indexOf('\n  "title"'))
    expect(file.indexOf('"id"')).toBeLessThan(file.indexOf('"type"'))
  })

  it('creates, renames, and deletes pages, and refuses to delete or rename index', async () => {
    const context = withRegistry(seed())
    const created = await call(context, 'POST', `${API_PREFIX}/pages`, {
      json: { slug: 'notes', title: 'Notes', template: 'cta' },
    })
    expect(created.status).toBe(201)
    const createdBody = (await created.json()) as { slug: string; sections: { type: string }[] }
    expect(createdBody.slug).toBe('notes')
    expect(createdBody.sections[0]?.type).toBe('cta')
    expect(fs.existsSync(path.join(context.contentDir, 'pages', 'notes.json'))).toBe(true)

    const duplicate = await call(context, 'POST', `${API_PREFIX}/pages`, {
      json: { slug: 'notes', title: 'Again' },
    })
    expect(duplicate.status).toBe(409)

    const copied = await call(context, 'POST', `${API_PREFIX}/pages`, {
      json: { slug: 'from-home', title: 'From home', template: 'index' },
    })
    expect(copied.status).toBe(201)
    const copiedBody = (await copied.json()) as { sections: { id: string }[] }
    expect(copiedBody.sections[0]?.id).toBe('hero')

    const renamed = await call(context, 'POST', `${API_PREFIX}/pages/notes/rename`, {
      json: { slug: 'field-notes' },
    })
    expect(renamed.status).toBe(200)
    expect(fs.existsSync(path.join(context.contentDir, 'pages', 'notes.json'))).toBe(false)
    const renamedFile = fs.readFileSync(path.join(context.contentDir, 'pages', 'field-notes.json'), 'utf8')
    expect(JSON.parse(renamedFile)).toMatchObject({ slug: 'field-notes', title: 'Notes' })

    const indexRename = await call(context, 'POST', `${API_PREFIX}/pages/index/rename`, {
      json: { slug: 'home' },
    })
    expect(indexRename.status).toBe(409)
    expect(fs.existsSync(path.join(context.contentDir, 'pages', 'index.json'))).toBe(true)

    const indexDelete = await call(context, 'DELETE', `${API_PREFIX}/pages/index`)
    expect(indexDelete.status).toBe(409)
    expect(fs.readFileSync(path.join(context.contentDir, 'pages', 'index.json'), 'utf8')).toContain('"slug": "index"')

    const removed = await call(context, 'DELETE', `${API_PREFIX}/pages/field-notes`)
    expect(removed.status).toBe(200)
    expect(fs.existsSync(path.join(context.contentDir, 'pages', 'field-notes.json'))).toBe(false)

    const list = await call(context, 'GET', `${API_PREFIX}/pages`)
    const listed = (await list.json()) as { pages: { slug: string }[] }
    expect(listed.pages.map((page) => page.slug).sort()).toEqual(['from-home', 'index'])
  })

  it('moves the home page to another slug when a different page becomes home', async () => {
    const context = withRegistry(seed())
    await call(context, 'POST', `${API_PREFIX}/pages`, { json: { slug: 'about', title: 'About', template: 'cta' } })
    const missing = await call(context, 'POST', `${API_PREFIX}/pages/about/set-home`, { json: {} })
    expect(missing.status).toBe(400)
    const clash = await call(context, 'POST', `${API_PREFIX}/pages/about/set-home`, { json: { previousSlug: 'about' } })
    expect(clash.status).toBe(409)

    const done = await call(context, 'POST', `${API_PREFIX}/pages/about/set-home`, { json: { previousSlug: 'home' } })
    expect(done.status).toBe(200)
    const pagesDir = path.join(context.contentDir, 'pages')
    expect(JSON.parse(fs.readFileSync(path.join(pagesDir, 'index.json'), 'utf8'))).toMatchObject({ slug: 'index', title: 'About' })
    expect(JSON.parse(fs.readFileSync(path.join(pagesDir, 'home.json'), 'utf8'))).toMatchObject({ slug: 'home' })
    expect(fs.existsSync(path.join(pagesDir, 'about.json'))).toBe(false)

    const again = await call(context, 'POST', `${API_PREFIX}/pages/index/set-home`, { json: { previousSlug: 'x' } })
    expect(again.status).toBe(409)
  })

  it('rejects slug mismatches, traversal, and unknown templates without writing', async () => {
    const context = withRegistry(seed())
    const before = fs.readdirSync(path.join(context.contentDir, 'pages'))
    const mismatch = await call(context, 'PUT', `${API_PREFIX}/pages/index`, {
      json: {
        slug: 'other',
        title: 'Home',
        seo: { title: 'Home', description: 'Hello' },
        sections: [],
      },
    })
    expect(mismatch.status).toBe(400)

    const traversal = await call(context, 'GET', `${API_PREFIX}/pages/${encodeURIComponent('../site')}`)
    expect(traversal.status).toBe(400)

    const encoded = await call(context, 'GET', `${API_PREFIX}/pages/${encodeURIComponent('..%2Fsite.json')}`)
    expect(encoded.status).toBe(400)

    const created = await call(context, 'POST', `${API_PREFIX}/pages`, {
      json: { slug: '../secret', title: 'Secret' },
    })
    expect(created.status).toBe(400)
    expect(fs.existsSync(path.join(context.root, 'secret.json'))).toBe(false)
    expect(fs.readdirSync(path.join(context.contentDir, 'pages'))).toEqual(before)

    const unknown = await call(context, 'POST', `${API_PREFIX}/pages`, {
      json: { slug: 'notes', title: 'Notes', template: 'does-not-exist' },
    })
    expect(unknown.status).toBe(400)
    expect(fs.existsSync(path.join(context.contentDir, 'pages', 'notes.json'))).toBe(false)
  })

  it('checks video contents and size, serves the file from public/, and refuses to delete one a page uses', async () => {
    const context = { ...withRegistry(seed()), maxVideoBytes: 1024 }
    const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(8)])
    const uploaded = await call(context, 'POST', `${API_PREFIX}/videos`, { form: fileForm(MP4, '../Demo Clip.mp4', 'video/mp4') })
    expect(uploaded.status).toBe(201)
    const body = (await uploaded.json()) as { filename: string; url: string; path: string }
    expect(body.filename).toMatch(/^demo-clip-[a-f0-9]{8}\.mp4$/)
    expect(body.url).toBe(`/videos/${body.filename}`)
    expect(body.path).toBe(`public/videos/${body.filename}`)
    expect(fs.readFileSync(path.join(context.videosDir, body.filename))).toEqual(MP4)

    const listed = (await (await call(context, 'GET', `${API_PREFIX}/videos`)).json()) as { videos: { url: string }[]; maxBytes: number }
    expect(listed.videos.map((video) => video.url)).toEqual([body.url])
    expect(listed.maxBytes).toBe(1024)

    for (const [bytes, name, type] of [
      [Buffer.from('not a video at all'), 'note.mp4', 'video/mp4'],
      [PNG, 'pic.mp4', 'video/mp4'],
      [MP4, 'clip.webm', 'video/webm'],
    ] as const) {
      const response = await call(context, 'POST', `${API_PREFIX}/videos`, { form: fileForm(Buffer.from(bytes), name, type) })
      expect(response.status, name).toBe(415)
    }
    const tooBig = await call(context, 'POST', `${API_PREFIX}/videos`, {
      form: fileForm(Buffer.concat([MP4, Buffer.alloc(1024)]), 'big.mp4', 'video/mp4'),
    })
    expect(tooBig.status).toBe(413)
    expect(fs.readdirSync(context.videosDir)).toEqual([body.filename])

    // A saved page that links the file keeps it.
    const page = JSON.parse(fs.readFileSync(path.join(context.contentDir, 'pages', 'index.json'), 'utf8')) as { sections: unknown[] }
    page.sections.push({ id: 'clip', type: 'media', variant: 'centered', tone: 'base', props: { kind: 'video', video: body.url } })
    fs.writeFileSync(path.join(context.contentDir, 'pages', 'index.json'), JSON.stringify(page))
    const kept = await call(context, 'DELETE', `${API_PREFIX}/videos/${body.filename}`)
    expect(kept.status).toBe(409)
    expect(fs.existsSync(path.join(context.videosDir, body.filename))).toBe(true)

    page.sections.pop()
    fs.writeFileSync(path.join(context.contentDir, 'pages', 'index.json'), JSON.stringify(page))
    const removed = await call(context, 'DELETE', `${API_PREFIX}/videos/${body.filename}`)
    expect(removed.status).toBe(200)
    expect(fs.existsSync(path.join(context.videosDir, body.filename))).toBe(false)
  })

  it('checks image type and size, and stores a safe unique filename', async () => {
    const context = withRegistry(seed())
    const sentinel = path.join(context.root, 'secret.png')
    fs.writeFileSync(sentinel, 'safe')

    const uploaded = await call(context, 'POST', `${API_PREFIX}/images`, {
      form: fileForm(PNG, '../../secret.png', 'image/png'),
    })
    expect(uploaded.status).toBe(201)
    const body = (await uploaded.json()) as { filename: string; path: string }
    expect(body.filename).toMatch(/^secret-[a-f0-9]{8}\.png$/)
    expect(body.path).toBe(`src/assets/uploads/${body.filename}`)
    expect(fs.readFileSync(path.join(context.uploadsDir, body.filename))).toEqual(PNG)
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('safe')
    expect(fs.existsSync(path.join(context.root, 'secret.png'))).toBe(true)

    const listed = await call(context, 'GET', `${API_PREFIX}/images`)
    const images = (await listed.json()) as { images: { filename: string }[] }
    expect(images.images.map((image) => image.filename)).toEqual([body.filename])

    const text = await call(context, 'POST', `${API_PREFIX}/images`, {
      form: fileForm(Buffer.from('not an image'), 'note.png', 'image/png'),
    })
    expect(text.status).toBe(415)

    const svg = await call(context, 'POST', `${API_PREFIX}/images`, {
      form: fileForm(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'icon.svg', 'image/svg+xml'),
    })
    expect(svg.status).toBe(415)

    const mismatch = await call(context, 'POST', `${API_PREFIX}/images`, {
      form: fileForm(PNG, 'photo.jpg', 'image/jpeg'),
    })
    expect(mismatch.status).toBe(415)

    const oversized = Buffer.alloc(IMAGE_BYTE_LIMIT + 1)
    PNG.copy(oversized)
    const tooBig = await call(context, 'POST', `${API_PREFIX}/images`, {
      form: fileForm(oversized, 'big.png', 'image/png'),
    })
    expect(tooBig.status).toBe(413)
    expect(fs.readdirSync(context.uploadsDir)).toEqual([body.filename])
  })

  it('rejects JSON bodies over 1MB', async () => {
    const context = withRegistry(seed())
    const response = await call(context, 'PUT', `${API_PREFIX}/site`, {
      rawBody: `{${' '.repeat(JSON_BODY_LIMIT)}`,
    })
    expect(response.status).toBe(413)
    expect(fs.readFileSync(path.join(context.contentDir, 'site.json'), 'utf8')).toContain('"Demo"')
  })

  it('rejects non-local host, origin, and socket addresses', async () => {
    const context = withRegistry(seed())
    const sitePath = path.join(context.contentDir, 'site.json')
    const before = fs.readFileSync(sitePath)

    const origin = await call(context, 'PUT', `${API_PREFIX}/site`, {
      json: { name: 'Hijack' },
      headers: { origin: 'https://evil.example' },
    })
    expect(origin.status).toBe(403)

    const host = await call(context, 'GET', `${API_PREFIX}/site`, {
      headers: { host: 'evil.example' },
    })
    expect(host.status).toBe(403)

    const socket = await call(context, 'GET', `${API_PREFIX}/site`, {
      remoteAddress: '203.0.113.10',
    })
    expect(socket.status).toBe(403)

    const mapped = await call(context, 'GET', `${API_PREFIX}/site`, {
      remoteAddress: '::ffff:203.0.113.10',
    })
    expect(mapped.status).toBe(403)

    // A no-cors GET from another site carries no Origin, but the browser marks it cross-site.
    const crossSite = await call(context, 'GET', `${API_PREFIX}/site`, {
      headers: { 'sec-fetch-site': 'cross-site' },
    })
    expect(crossSite.status).toBe(403)
    const sameSite = await call(context, 'GET', `${API_PREFIX}/site`, {
      headers: { 'sec-fetch-site': 'same-site' },
    })
    expect(sameSite.status).toBe(403)
    const sameOrigin = await call(context, 'GET', `${API_PREFIX}/site`, {
      headers: { 'sec-fetch-site': 'same-origin' },
    })
    expect(sameOrigin.status).toBe(200)

    const missingHost = await call(context, 'GET', `${API_PREFIX}/site`, {
      headers: { host: '' },
    })
    expect(missingHost.status).toBe(403)

    const allowed = await call(context, 'GET', `${API_PREFIX}/site`, {
      headers: { host: 'localhost:4321', origin: 'http://localhost:4321' },
      remoteAddress: '::ffff:127.0.0.1',
    })
    expect(allowed.status).toBe(200)
    expect(fs.readFileSync(sitePath)).toEqual(before)
  })

  it('serves the option catalog and creates every section template from design-system defaults', async () => {
    const context = withRegistry(seed())
    const schema = await call(context, 'GET', `${API_PREFIX}/schema`)
    expect(schema.status).toBe(200)
    const catalog = (await schema.json()) as {
      sectionOptions: unknown
      siteOptions: unknown
      siteLimits: unknown
      theme: { fonts: Record<string, { label: string }>; tones: string[] }
      contentCounts: unknown
      sectionLabels: { hero: string }
      sectionDescriptions: Record<string, string>
      sectionWireframes: Record<string, unknown[]>
      sectionDefaults: { hero: { heading: string } }
      fieldChoices: Record<string, Record<string, string[]>>
      fieldIcons: Record<string, Record<string, Record<string, string>>>
      fieldImages: Record<string, string[]>
      showWhen: Record<string, Record<string, Record<string, unknown>>>
      projectId: string
    }
    expect(catalog.sectionOptions).toEqual(sectionOptions)
    expect(catalog.siteOptions).toEqual(siteOptions)
    expect(catalog.siteLimits).toEqual({ maxHeaderActions: 2, maxFooterColumns: 3 })
    expect(catalog.theme.tones).toEqual(['base', 'subtle', 'inverse', 'brand'])
    expect(catalog.theme.fonts.serif?.label).toBe('Serif')
    expect(catalog.contentCounts).toEqual({
      header: { links: { recommended: 4 } },
      footer: { columns: { recommended: 3, max: 3 } },
      logoStrip: { logos: { recommended: 6 } },
      steps: contentCounts.steps,
      gallery: { images: { recommended: '6 to 12', min: 1, max: 24 } },
      features: contentCounts.features,
      textImage: { points: { recommended: 3 } },
      stats: { items: { recommended: 4 } },
      testimonials: { items: { recommended: 3 } },
      pricing: { plans: { recommended: 3 } },
      faq: contentCounts.faq,
      contact: { details: { recommended: 3 }, topics: { recommended: 3 } },
    })
    expect(Object.keys(catalog.sectionWireframes)).toEqual(sectionTypes)
    expect(catalog.sectionWireframes.hero?.length).toBeGreaterThan(0)
    expect(catalog.sectionDescriptions.hero).toBe('Opening heading, intro, buttons and an image.')
    expect(catalog.sectionLabels.hero).toBe('Hero')
    expect(catalog.sectionDefaults.hero.heading).toBe('Say what you do in one line.')
    expect(catalog.fieldChoices.steps?.['steps[].icon']).toContain('terminal')
    expect(catalog.fieldChoices.media?.kind).toEqual(['video', 'image'])
    expect(Object.keys(catalog.fieldIcons)).toEqual(['steps'])
    expect(catalog.fieldIcons.steps?.['steps[].icon']?.terminal).toMatch(/^M/)
    expect(catalog.showWhen.media?.poster).toEqual({ kind: 'video' })
    expect(catalog.fieldImages.media).toEqual(['poster', 'image'])
    expect(catalog.fieldImages.features).toEqual(['items[].image'])
    expect(catalog.showWhen.hero?.command).toEqual({ code: ['action', 'chip', 'terminal'] })
    expect(catalog.projectId).toMatch(/^[0-9a-f]+-[0-9a-f]+$/)

    const write = await call(context, 'POST', `${API_PREFIX}/schema`, { json: {} })
    expect(write.status).toBe(405)

    const fresh = await call(context, 'POST', `${API_PREFIX}/pages`, {
      json: { slug: 'fresh', title: 'Fresh' },
    })
    expect(fresh.status).toBe(201)
    const freshBody = (await fresh.json()) as {
      sections: { type: string; variant: string; tone: string; props: { heading: string } }[]
    }
    expect(freshBody.sections).toEqual([
      {
        id: 'hero',
        type: 'hero',
        variant: 'split',
        tone: 'base',
        props: sectionRegistry.hero.defaults,
      },
    ])

    for (const type of sectionTypes) {
      const slug = `tpl-${type.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`
      const created = await call(context, 'POST', `${API_PREFIX}/pages`, {
        json: { slug, title: type, template: type },
      })
      expect(created.status, type).toBe(201)
      const body = (await created.json()) as {
        sections: { type: string; variant: string; tone: string; props: unknown }[]
      }
      const variant = sectionOptions[type].find((option) => option.name === 'variant')
      const tone = sectionOptions[type].find((option) => option.name === 'tone')
      expect(body.sections[0]).toEqual({
        id: type,
        type,
        variant: variant?.type === 'enum' ? variant.default : undefined,
        tone: tone?.type === 'enum' ? tone.default : undefined,
        props: sectionRegistry[type].defaults,
      })
    }
  })

  it('deletes an uploaded image and refuses paths and unknown names', async () => {
    const context = withRegistry(seed())
    const uploaded = await call(context, 'POST', `${API_PREFIX}/images`, {
      form: fileForm(PNG, 'gone.png', 'image/png'),
    })
    const saved = (await uploaded.json()) as { filename: string }
    const missing = await call(context, 'DELETE', `${API_PREFIX}/images/nope.png`)
    expect(missing.status).toBe(404)
    const traversal = await call(context, 'DELETE', `${API_PREFIX}/images/..%2Fsite.json`)
    expect(traversal.status).toBe(404)
    const wrongMethod = await call(context, 'GET', `${API_PREFIX}/images/${saved.filename}`)
    expect(wrongMethod.status).toBe(405)
    const removed = await call(context, 'DELETE', `${API_PREFIX}/images/${saved.filename}`)
    expect(removed.status).toBe(200)
    const listed = await call(context, 'GET', `${API_PREFIX}/images`)
    expect(((await listed.json()) as { images: unknown[] }).images).toEqual([])
  })

  it('accepts every variant and an uploaded image on design-system image fields', async () => {
    const context = withRegistry(seed())
    const uploaded = await call(context, 'POST', `${API_PREFIX}/images`, {
      form: fileForm(PNG, 'mark.png', 'image/png'),
    })
    expect(uploaded.status).toBe(201)
    const saved = (await uploaded.json()) as { path: string }
    expect(saved.path.startsWith('src/assets/uploads/')).toBe(true)
    const image = { src: saved.path, alt: 'Uploaded mark' }

    const tones = ['base', 'subtle', 'inverse', 'brand'] as const
    const sections = sectionTypes.flatMap((type) => {
      const variant = sectionOptions[type].find((option) => option.name === 'variant')
      const choices = variant?.type === 'enum' ? variant.choices : []
      return choices.map((choice, index) => {
        const props = structuredClone(sectionRegistry[type].defaults) as Record<string, unknown>
        if (type === 'pricing') props.yearlyDiscount = 0
        if (type === 'hero') props.image = image
        if (type === 'logoStrip' && Array.isArray(props.logos)) props.logos = props.logos.map(() => image)
        if (type === 'features' && Array.isArray(props.items)) {
          props.items = props.items.map((item) => (item && typeof item === 'object' ? { ...item, image } : item))
        }
        if (type === 'textImage') props.image = image
        if (type === 'testimonials' && Array.isArray(props.items)) {
          props.items = props.items.map((item) => (item && typeof item === 'object' ? { ...item, image } : item))
        }
        return {
          id: `${type}-${choice}`,
          type,
          variant: choice,
          tone: tones[index % tones.length],
          motion: index % 2 === 0,
          props,
        }
      })
    })

    const page = await call(context, 'PUT', `${API_PREFIX}/pages/index`, {
      json: {
        slug: 'index',
        title: 'Home',
        seo: { title: 'Home', description: 'Every variant' },
        sections,
      },
    })
    expect(page.status).toBe(200)
    const savedPage = (await page.json()) as { sections: { id: string; variant: string }[] }
    expect(savedPage.sections.map((section) => section.id)).toEqual(sections.map((section) => section.id))
    expect(savedPage.sections).toHaveLength(sections.length)

    const site = await call(context, 'PUT', `${API_PREFIX}/site`, {
      json: {
        name: 'BearMinion',
        nameEm: 'Minion',
        url: 'https://bearminion.example',
        logo: image,
        brandLogo: { ...image, height: 36 },
        seo: { titleTemplate: '%s · BearMinion' },
        theme: { mode: 'system', motion: false },
        header: {
          variant: 'centered',
          tone: 'subtle',
          sticky: false,
          links: [{ label: 'Home', href: '/' }],
          cta: { label: 'Start', href: '#cta' },
          signIn: { label: 'Sign in', href: '/about' },
        },
        footer: {
          variant: 'wordmark',
          tone: 'inverse',
          badge: 'v2.0 · MIT licensed',
          text: 'Hi',
          legal: '© 2026',
          columns: [{ title: 'Product', links: [{ label: 'Home', href: '/' }] }],
        },
      },
    })
    expect(site.status).toBe(200)
    expect(await site.json()).toMatchObject({
      nameMarks: [{ start: 4, end: 10, italic: true, font: 'serif' }],
      // The legacy `logo` key is stored as `favicon`, and the removed `system` mode reads as light.
      favicon: image,
      brandLogo: { ...image, height: 36 },
      theme: { mode: 'light', motion: false },
      header: { variant: 'centered', sticky: false },
      footer: { variant: 'wordmark', badge: 'v2.0 · MIT licensed' },
    })

    const pagePath = path.join(context.contentDir, 'pages', 'index.json')
    const sitePath = path.join(context.contentDir, 'site.json')
    const pageBefore = fs.readFileSync(pagePath)
    const siteBefore = fs.readFileSync(sitePath)

    const badVariant = await call(context, 'PUT', `${API_PREFIX}/pages/index`, {
      json: {
        slug: 'index',
        title: 'Home',
        seo: { title: 'Home', description: '' },
        sections: [{ id: 'hero', type: 'hero', variant: 'giant', props: sectionRegistry.hero.defaults }],
      },
    })
    expect(badVariant.status).toBe(400)

    const shortBento = structuredClone(sectionRegistry.features.defaults)
    shortBento.items = shortBento.items.slice(0, contentCounts.features.items.min - 1)
    const badBento = await call(context, 'PUT', `${API_PREFIX}/pages/index`, {
      json: {
        slug: 'index',
        title: 'Home',
        seo: { title: 'Home', description: '' },
        sections: [{ id: 'features', type: 'features', variant: 'bento', props: shortBento }],
      },
    })
    expect(badBento.status).toBe(400)

    const badName = await call(context, 'PUT', `${API_PREFIX}/site`, {
      json: {
        name: 'Demo',
        nameEm: 'Minion',
        url: 'https://bearminion.example',
        seo: {},
        header: { links: [], cta: { label: 'Go', href: '/' } },
        footer: { columns: [] },
      },
    })
    expect(badName.status).toBe(400)

    expect(fs.readFileSync(pagePath)).toEqual(pageBefore)
    expect(fs.readFileSync(sitePath)).toEqual(siteBefore)
  })

  it('validates writes with a custom section registry', async () => {
    const note = defineSection({
      type: 'note',
      label: 'Note',
      description: 'A short note.',
      schema: z.object({ body: z.string().min(1) }).strict(),
      defaults: { body: 'A note.' },
      variants: ['plain'],
      defaultVariant: 'plain',
      optional: { props: [] },
      wireframe: [[8, 8, 40, 8, 'title']],
    })
    const context = withRegistry(seed(), { note })
    fs.writeFileSync(
      path.join(context.contentDir, 'pages', 'index.json'),
      stableStringify({
        sections: [{ id: 'note', props: { body: 'Home note' }, type: 'note' }],
        seo: { description: 'Hello', nofollow: false, noindex: false, title: 'Home' },
        slug: 'index',
        title: 'Home',
      }),
    )
    const created = await call(context, 'POST', `${API_PREFIX}/pages`, {
      json: { slug: 'margin', title: 'Margin', template: 'note' },
    })
    expect(created.status).toBe(201)
    const body = (await created.json()) as { sections: { type: string; props: { body: string } }[] }
    expect(body.sections[0]).toMatchObject({ type: 'note', props: { body: 'A note.' } })

    const hero = await call(context, 'POST', `${API_PREFIX}/pages`, {
      json: { slug: 'other', title: 'Other', template: 'hero' },
    })
    expect(hero.status).toBe(400)
  })

  it('renders a preview without writing the page', async () => {
    const context = withRegistry(seed())
    const pagePath = path.join(context.contentDir, 'pages', 'index.json')
    const before = fs.readFileSync(pagePath)
    const page = JSON.parse(before.toString()) as unknown
    const response = await call(context, 'POST', `${API_PREFIX}/preview`, {
      json: { page, motion: false },
      preview: async (body, motion) => {
        expect(motion).toBe(false)
        expect(body).toMatchObject({ slug: 'index' })
        return '<section data-section-id="hero">preview</section>'
      },
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ html: '<section data-section-id="hero">preview</section>' })
    expect(fs.readFileSync(pagePath)).toEqual(before)

    const unavailable = await call(context, 'POST', `${API_PREFIX}/preview`, { json: { page, motion: true } })
    expect(unavailable.status).toBe(501)

    const invalid = await call(context, 'POST', `${API_PREFIX}/preview`, {
      json: { page: { ...((page as object) ?? {}), slug: '' }, motion: true },
      preview: async () => {
        throw new Error('renderer should not run')
      },
    })
    expect(invalid.status).toBe(400)
    expect(fs.readFileSync(pagePath)).toEqual(before)
  })
})

describe('POST /save', () => {
  const readJson = (context: EditorContext, key: string) =>
    JSON.parse(fs.readFileSync(path.join(context.contentDir, key), 'utf8')) as Record<string, unknown>
  const homePage = (context: EditorContext) => readJson(context, 'pages/index.json')

  async function createAbout(context: EditorContext) {
    const created = await call(context, 'POST', `${API_PREFIX}/pages`, { json: { slug: 'about', title: 'About' } })
    expect(created.status).toBe(201)
    return (await created.json()) as Record<string, unknown>
  }

  it('saves a page and the site together', async () => {
    const context = seed()
    const page = { ...homePage(context), title: 'Welcome' }
    const site = { ...readJson(context, 'site.json'), name: 'Renamed' }
    const response = await call(context, 'POST', `${API_PREFIX}/save`, { json: { page: { from: 'index', document: page }, site } })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { page: { title: string }; site: { name: string } }
    expect(body.page.title).toBe('Welcome')
    expect(body.site.name).toBe('Renamed')
    expect(homePage(context).title).toBe('Welcome')
    expect(readJson(context, 'site.json').name).toBe('Renamed')
  })

  it('writes nothing when either document is invalid', async () => {
    const context = seed()
    const siteBefore = fs.readFileSync(path.join(context.contentDir, 'site.json'))
    const pageBefore = fs.readFileSync(path.join(context.contentDir, 'pages', 'index.json'))
    const response = await call(context, 'POST', `${API_PREFIX}/save`, {
      json: { page: { from: 'index', document: { ...homePage(context), title: 'Changed' } }, site: { name: 'Demo', url: 'not-a-url' } },
    })
    expect(response.status).toBe(400)
    expect(fs.readFileSync(path.join(context.contentDir, 'site.json'))).toEqual(siteBefore)
    expect(fs.readFileSync(path.join(context.contentDir, 'pages', 'index.json'))).toEqual(pageBefore)
  })

  it('renames and saves a page in one write, and leaves the old file when the draft is invalid', async () => {
    const context = seed()
    const about = await createAbout(context)
    const invalid = await call(context, 'POST', `${API_PREFIX}/save`, {
      json: { page: { from: 'about', document: { ...about, slug: 'team', sections: 'nope' } } },
    })
    expect(invalid.status).toBe(400)
    expect(fs.existsSync(path.join(context.contentDir, 'pages', 'about.json'))).toBe(true)
    expect(fs.existsSync(path.join(context.contentDir, 'pages', 'team.json'))).toBe(false)

    const renamed = await call(context, 'POST', `${API_PREFIX}/save`, {
      json: { page: { from: 'about', document: { ...about, slug: 'team', title: 'Team' } } },
    })
    expect(renamed.status).toBe(200)
    expect(fs.existsSync(path.join(context.contentDir, 'pages', 'about.json'))).toBe(false)
    expect(readJson(context, 'pages/team.json').title).toBe('Team')
  })

  it('makes a page the home page and moves the old one', async () => {
    const context = seed()
    const about = await createAbout(context)
    const missing = await call(context, 'POST', `${API_PREFIX}/save`, {
      json: { page: { from: 'about', document: { ...about, slug: 'index' } } },
    })
    expect(missing.status).toBe(400)

    const promoted = await call(context, 'POST', `${API_PREFIX}/save`, {
      json: { page: { from: 'about', document: { ...about, slug: 'index', title: 'New home' }, previousHomeSlug: 'old-home' } },
    })
    expect(promoted.status).toBe(200)
    expect(homePage(context).title).toBe('New home')
    expect(readJson(context, 'pages/old-home.json').title).toBe('Home')
    expect(fs.existsSync(path.join(context.contentDir, 'pages', 'about.json'))).toBe(false)
  })

  it('refuses to move the home page or rename onto an existing page', async () => {
    const context = seed()
    const about = await createAbout(context)
    const home = await call(context, 'POST', `${API_PREFIX}/save`, {
      json: { page: { from: 'index', document: { ...homePage(context), slug: 'start' } } },
    })
    expect(home.status).toBe(409)
    await call(context, 'POST', `${API_PREFIX}/pages`, { json: { slug: 'team', title: 'Team' } })
    const taken = await call(context, 'POST', `${API_PREFIX}/save`, {
      json: { page: { from: 'about', document: { ...about, slug: 'team' } } },
    })
    expect(taken.status).toBe(409)
  })

  it('rejects an empty save', async () => {
    const response = await call(seed(), 'POST', `${API_PREFIX}/save`, { json: {} })
    expect(response.status).toBe(400)
  })
})

function fileForm(bytes: Buffer, filename: string, type: string): FormData {
  const form = new FormData()
  form.set('file', new File([new Uint8Array(bytes) as BlobPart], filename, { type }))
  return form
}

function withRegistry(seeded: EditorContext, sections?: SectionRegistry): EditorContext {
  if (!sections) return seeded
  return { ...seeded, sections }
}

describe('missing images', () => {
  async function upload(context: EditorContext, name: string): Promise<{ filename: string; path: string }> {
    const response = await call(context, 'POST', `${API_PREFIX}/images`, { form: fileForm(PNG, name, 'image/png') })
    expect(response.status).toBe(201)
    return (await response.json()) as { filename: string; path: string }
  }

  function readPage(context: EditorContext): Record<string, unknown> & { sections: { props: Record<string, unknown> }[] } {
    return JSON.parse(fs.readFileSync(path.join(context.contentDir, 'pages', 'index.json'), 'utf8'))
  }

  it('refuses to delete an image that saved content uses, and names where', async () => {
    const context = seed()
    const logo = await upload(context, 'logo.png')
    const page = readPage(context)
    page.sections[0]!.props.image = { src: logo.path, alt: 'Logo' }
    page.seo = { ...(page.seo as object), ogImage: logo.path }
    expect((await call(context, 'PUT', `${API_PREFIX}/pages/index`, { json: page })).status).toBe(200)

    const refused = await call(context, 'DELETE', `${API_PREFIX}/images/${logo.filename}`)
    expect(refused.status).toBe(409)
    const body = (await refused.json()) as { error: string; usages: string[]; message: string }
    expect(body.error).toBe('in_use')
    expect(body.usages).toEqual(['Home page › Hero', 'Home page › social preview image'])
    expect(body.message).toContain(logo.filename)
    expect(fs.existsSync(path.join(context.root, logo.path))).toBe(true)

    page.sections[0]!.props.image = undefined
    page.seo = { ...(page.seo as object), ogImage: undefined }
    expect((await call(context, 'PUT', `${API_PREFIX}/pages/index`, { json: JSON.parse(JSON.stringify(page)) })).status).toBe(200)
    expect((await call(context, 'DELETE', `${API_PREFIX}/images/${logo.filename}`)).status).toBe(200)
  })

  it('counts the site settings as a use', async () => {
    const context = seed()
    const favicon = await upload(context, 'favicon.png')
    const site = JSON.parse(fs.readFileSync(path.join(context.contentDir, 'site.json'), 'utf8')) as Record<string, unknown>
    expect((await call(context, 'PUT', `${API_PREFIX}/site`, { json: { ...site, favicon: { src: favicon.path, alt: '' } } })).status).toBe(
      200,
    )
    const refused = await call(context, 'DELETE', `${API_PREFIX}/images/${favicon.filename}`)
    expect(((await refused.json()) as { usages: string[] }).usages).toEqual(['Site settings › favicon'])
  })

  it('rejects a save that points at an image file that is not there, and writes nothing', async () => {
    const context = seed()
    const before = fs.readFileSync(path.join(context.contentDir, 'pages', 'index.json'), 'utf8')
    const page = readPage(context)
    page.sections[0]!.props.image = { src: 'src/assets/uploads/gone.png', alt: 'Gone' }
    const response = await call(context, 'POST', `${API_PREFIX}/save`, { json: { page: { from: 'index', document: page } } })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { issues: { path: string; message: string }[] }
    expect(body.issues).toEqual([
      {
        file: 'page',
        path: 'sections.0.props.image.src',
        message: 'Image file not found: src/assets/uploads/gone.png. Choose another image or upload it again.',
      },
    ])
    expect(fs.readFileSync(path.join(context.contentDir, 'pages', 'index.json'), 'utf8')).toBe(before)
  })

  it('reports the page and the site errors of one save together, each named by its file', async () => {
    const context = withRegistry(seed())
    const sitePath = path.join(context.contentDir, 'site.json')
    const pagePath = path.join(context.contentDir, 'pages', 'index.json')
    const before = [fs.readFileSync(sitePath), fs.readFileSync(pagePath)]
    const response = await call(context, 'POST', `${API_PREFIX}/save`, {
      json: {
        site: { name: 'Demo', url: 'not-a-url' },
        page: {
          from: 'index',
          document: {
            slug: 'index',
            title: 'Home',
            seo: { title: 'Home', description: '' },
            sections: [{ id: 'hero', type: 'banner', props: {} }],
          },
        },
      },
    })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { issues: { path: string; message: string; file?: string }[] }
    expect(body.issues.every((issue) => issue.file === 'site' || issue.file === 'page')).toBe(true)
    expect(body.issues.some((issue) => issue.file === 'site' && issue.path.startsWith('url'))).toBe(true)
    expect(body.issues.some((issue) => issue.file === 'page' && issue.path.includes('type'))).toBe(true)
    expect([fs.readFileSync(sitePath), fs.readFileSync(pagePath)]).toEqual(before)
  })

  it('accepts remote images and the placeholder, which are not files', async () => {
    const context = seed()
    const page = readPage(context)
    page.sections[0]!.props.image = { src: 'https://images.example/hero.png', alt: 'Remote' }
    page.seo = { ...(page.seo as object), ogImage: 'placeholder' }
    expect((await call(context, 'PUT', `${API_PREFIX}/pages/index`, { json: page })).status).toBe(200)
  })
})
