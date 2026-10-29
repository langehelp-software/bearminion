import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveEditorContext } from '../src/options.js'
import { createBearminionServer } from '../src/mcp/server.js'
import { contentModel } from './starter.js'

const starter = path.resolve(import.meta.dirname, '../../../templates/default')

let root: string
let client: Client

async function connect(options: { uploadsFrom?: string[]; uploadLinkTtlMs?: number } = {}): Promise<Client> {
  const server = createBearminionServer(resolveEditorContext({ ...contentModel, forms: false }, root), options)
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  const connected = new Client({ name: 'test', version: '1' })
  await Promise.all([server.connect(serverSide), connected.connect(clientSide)])
  return connected
}

interface ToolResult {
  isError?: boolean
  content: Array<{ type: string; text: string }>
}

async function call(name: string, args: Record<string, unknown> = {}): Promise<{ isError: boolean; text: string; json: () => unknown }> {
  const result = (await client.callTool({ name, arguments: args })) as ToolResult
  const text = result.content[0]?.text ?? ''
  return { isError: result.isError === true, text, json: () => JSON.parse(text) }
}

const readPage = (slug: string) => JSON.parse(fs.readFileSync(path.join(root, 'content/pages', `${slug}.json`), 'utf8'))

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-mcp-'))
  fs.cpSync(path.join(starter, 'content'), path.join(root, 'content'), { recursive: true })
  fs.cpSync(path.join(starter, 'src/assets/uploads'), path.join(root, 'src/assets/uploads'), { recursive: true })
  client = await connect()
})

afterEach(async () => {
  await client.close()
})

describe('the MCP server', () => {
  it('offers the page, site and guide tools, and none that run code or push', async () => {
    const { tools } = await client.listTools()
    const names = tools.map((tool) => tool.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'list_sections',
        'get_section_guide',
        'list_pages',
        'get_page',
        'save_page',
        'save_pages',
        'create_page',
        'delete_page',
        'rename_page',
        'set_home_page',
        'get_site',
        'save_site',
        'list_images',
      ]),
    )
    expect(names.some((name) => /commit|push|exec|shell/.test(name))).toBe(false)
    expect(tools.find((tool) => tool.name === 'delete_page')?.annotations?.destructiveHint).toBe(true)
  })

  it('lists the sections and prints one guide, with the emphasis rule', async () => {
    expect((await call('list_sections')).text).toContain('`hero`')
    const guide = await call('get_section_guide', { type: 'hero' })
    expect(guide.text).toContain('# Hero')
    expect(guide.text).toContain('set `em`')
    const unknown = await call('get_section_guide', { type: 'nope' })
    expect(unknown.isError).toBe(true)
    expect(unknown.text).toContain('hero')
  })

  it('lists pages compactly', async () => {
    const pages = (await call('list_pages')).json() as Array<Record<string, unknown>>
    expect(pages.map((page) => page.slug)).toContain('index')
    expect(Object.keys(pages[0] ?? {}).sort()).toEqual(['anchors', 'slug', 'system', 'title'])
  })

  it('saves a changed page to the file', async () => {
    const page = (await call('get_page', { slug: 'about' })).json() as { title: string }
    const saved = await call('save_page', { slug: 'about', page: { ...page, title: 'About, changed' } })
    expect(saved.isError).toBe(false)
    expect(readPage('about').title).toBe('About, changed')
  })

  it('rejects a write the schema refuses, names the field, and changes nothing', async () => {
    const before = fs.readFileSync(path.join(root, 'content/pages/about.json'), 'utf8')
    const page = (await call('get_page', { slug: 'about' })).json() as { sections: unknown[] }
    const broken = { ...page, sections: [{ id: 'x', type: 'hero', variant: 'nonsense', tone: 'base', props: {} }] }
    const result = await call('save_page', { slug: 'about', page: broken })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('variant')
    expect(fs.readFileSync(path.join(root, 'content/pages/about.json'), 'utf8')).toBe(before)
  })

  it('saves several pages one by one and reports each', async () => {
    const about = (await call('get_page', { slug: 'about' })).json() as { title: string }
    const result = await call('save_pages', {
      pages: [
        { slug: 'about', page: { ...about, title: 'Batch title' } },
        { slug: 'about', page: { ...about, slug: 'wrong' } },
      ],
    })
    const outcome = result.json() as Array<{ saved: boolean }>
    expect(outcome.map((entry) => entry.saved)).toEqual([true, false])
    expect(result.isError).toBe(true)
    expect(readPage('about').title).toBe('Batch title')
  })

  it('creates, renames and deletes a page, and refuses to delete the home page', async () => {
    expect((await call('create_page', { slug: 'team', title: 'Team' })).isError).toBe(false)
    expect(fs.existsSync(path.join(root, 'content/pages/team.json'))).toBe(true)
    expect((await call('rename_page', { slug: 'team', newSlug: 'people' })).isError).toBe(false)
    expect(fs.existsSync(path.join(root, 'content/pages/people.json'))).toBe(true)
    expect((await call('delete_page', { slug: 'people' })).isError).toBe(false)
    expect(fs.existsSync(path.join(root, 'content/pages/people.json'))).toBe(false)
    expect((await call('delete_page', { slug: 'index' })).isError).toBe(true)
  })

  it('serves the guides as resources', async () => {
    const { resources } = await client.listResources()
    expect(resources.map((resource) => resource.uri)).toContain('bearminion://sections')
    const templates = await client.listResourceTemplates()
    expect(templates.resourceTemplates.map((template) => template.uriTemplate)).toContain('bearminion://sections/{type}')
    const read = await client.readResource({ uri: 'bearminion://sections/hero' })
    expect(JSON.stringify(read.contents[0])).toContain('# Hero')
  })
})

describe('uploads', () => {
  const png = () => fs.readFileSync(path.join(starter, 'src/assets/uploads/hero.png'))
  let outside: string

  beforeEach(() => {
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-outside-'))
  })

  const uploaded = () => fs.readdirSync(path.join(root, 'src/assets/uploads'))

  it('copies an image from inside the project and returns the path to use', async () => {
    fs.mkdirSync(path.join(root, 'incoming'))
    fs.writeFileSync(path.join(root, 'incoming/lake.png'), png())
    const before = uploaded().length
    const result = await call('upload_image', { path: 'incoming/lake.png' })
    expect(result.isError).toBe(false)
    const saved = result.json() as { filename: string; path: string }
    expect(saved.path).toMatch(/^src\/assets\/uploads\/lake-[0-9a-f]{8}\.png$/)
    expect(uploaded()).toHaveLength(before + 1)
    expect(fs.existsSync(path.join(root, 'incoming/lake.png'))).toBe(true)
    expect(JSON.stringify((await call('list_images')).json())).toContain(saved.filename)
  })

  it('refuses a file outside the project and the allowed folders, and writes nothing', async () => {
    fs.writeFileSync(path.join(outside, 'secret.png'), png())
    const before = uploaded().length
    const result = await call('upload_image', { path: path.join(outside, 'secret.png') })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('--uploads-from')
    expect(uploaded()).toHaveLength(before)
  })

  it('takes a file from a folder the person allowed', async () => {
    fs.writeFileSync(path.join(outside, 'photo.png'), png())
    const allowed = await connect({ uploadsFrom: [outside] })
    try {
      const result = (await allowed.callTool({ name: 'upload_image', arguments: { path: path.join(outside, 'photo.png') } })) as ToolResult
      expect(result.isError).not.toBe(true)
      expect(result.content[0]?.text).toContain('src/assets/uploads/photo-')
    } finally {
      await allowed.close()
    }
  })

  it('does not follow a link inside the project to a file outside it', async () => {
    fs.writeFileSync(path.join(outside, 'private.png'), png())
    fs.symlinkSync(path.join(outside, 'private.png'), path.join(root, 'link.png'))
    const result = await call('upload_image', { path: 'link.png' })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('outside')
  })

  it('refuses a file that is not an image, whatever its name says', async () => {
    fs.writeFileSync(path.join(root, 'notes.png'), 'just some text, not a picture')
    const result = await call('upload_image', { path: 'notes.png' })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('not a png')
  })

  it('refuses a path that is not a file, and one that does not exist', async () => {
    expect((await call('upload_image', { path: 'content' })).isError).toBe(true)
    expect((await call('upload_image', { path: 'nowhere.png' })).text).toContain('no file')
  })

  it('has no inline upload: a path is required', async () => {
    const { tools } = await client.listTools()
    const properties = tools.find((tool) => tool.name === 'upload_image')?.inputSchema.properties ?? {}
    expect(Object.keys(properties).sort()).toEqual(['name', 'path'])
    expect((await call('upload_image', {})).isError).toBe(true)
    expect((await call('upload_image', { base64: png().toString('base64') })).isError).toBe(true)
  })

  it('uploads a video from the project and returns its url', async () => {
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(32)])
    fs.writeFileSync(path.join(root, 'clip.mp4'), mp4)
    const result = await call('upload_video', { path: 'clip.mp4' })
    expect(result.isError).toBe(false)
    expect((result.json() as { url: string }).url).toMatch(/^\/videos\/clip-[0-9a-f]{8}\.mp4$/)
  })

  it('refuses a video that is really something else', async () => {
    fs.writeFileSync(path.join(root, 'fake.mp4'), 'not a video')
    expect((await call('upload_video', { path: 'fake.mp4' })).isError).toBe(true)
  })
})

describe('browser upload', () => {
  const png = () => fs.readFileSync(path.join(starter, 'src/assets/uploads/hero.png'))
  const pngFile = (name = 'trash.png') => new File([new Uint8Array(png())], name, { type: 'image/png' })

  async function link(): Promise<{ token: string; url: string }> {
    const result = await call('request_upload')
    expect(result.isError).toBe(false)
    return result.json() as { token: string; url: string }
  }

  function post(url: string, options: { host?: string; origin?: string; length?: number } = {}): Promise<number> {
    const target = new URL(url)
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: target.port,
          path: target.pathname,
          method: 'POST',
          headers: {
            host: options.host ?? target.host,
            ...(options.origin ? { origin: options.origin } : {}),
            'content-type': 'multipart/form-data; boundary=x',
            'content-length': String(options.length ?? 5),
          },
        },
        (res) => {
          res.resume()
          resolve(res.statusCode ?? 0)
        },
      )
      req.on('error', reject)
      req.end('12345')
    })
  }

  const upload = (url: string, file: File) => {
    const form = new FormData()
    form.set('file', file)
    return fetch(url, { method: 'POST', body: form })
  }

  it('gives a one-time local link with a file picker for images', async () => {
    const { url } = await link()
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/upload\/[0-9a-f]{32}$/)
    const page = await fetch(url)
    expect(page.status).toBe(200)
    expect(page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    const html = await page.text()
    expect(html).toContain('type="file"')
    expect(html).toContain('accept="image/png')
  })

  it('stores the chosen image and hands its path back to the assistant', async () => {
    const { token, url } = await link()
    const response = await upload(url, pngFile())
    expect(response.status).toBe(200)
    const done = await call('check_upload', { token, waitSeconds: 0 })
    expect(done.isError).toBe(false)
    const saved = done.json() as { path: string }
    expect(saved.path).toMatch(/^src\/assets\/uploads\/trash-[0-9a-f]{8}\.png$/)
    expect(fs.readFileSync(path.join(root, saved.path)).equals(png())).toBe(true)
  })

  it('lets check_upload wait for an upload that arrives while it waits', async () => {
    const { token, url } = await link()
    const waiting = call('check_upload', { token, waitSeconds: 10 })
    setTimeout(() => void upload(url, pngFile('late.png')), 100)
    const done = await waiting
    expect((done.json() as { path: string }).path).toContain('late-')
  })

  it('says it is still waiting before anything is uploaded', async () => {
    const { token } = await link()
    const waiting = await call('check_upload', { token, waitSeconds: 0 })
    expect(waiting.isError).toBe(false)
    expect(waiting.text).toContain('Still waiting')
  })

  it('works for one upload only', async () => {
    const { token, url } = await link()
    expect((await upload(url, pngFile())).status).toBe(200)
    expect((await upload(url, pngFile())).status).toBe(410)
    expect((await fetch(url)).status).toBe(410)
    expect((await call('check_upload', { token, waitSeconds: 0 })).isError).toBe(false)
  })

  it('refuses a file that is not an image and keeps the link open for another try', async () => {
    const { token, url } = await link()
    const bad = await upload(url, new File(['just text'], 'notes.png', { type: 'image/png' }))
    expect(bad.status).toBe(400)
    expect(((await bad.json()) as { ok: boolean }).ok).toBe(false)
    expect(fs.readdirSync(path.join(root, 'src/assets/uploads')).some((name) => name.startsWith('notes'))).toBe(false)
    expect((await call('check_upload', { token, waitSeconds: 0 })).text).toContain('Still waiting')
    expect((await upload(url, pngFile())).status).toBe(200)
  })

  it('refuses a request without a file', async () => {
    const { url } = await link()
    const response = await fetch(url, { method: 'POST', body: new FormData() })
    expect(response.status).toBe(400)
  })

  it('refuses an upload bigger than the limit before reading it', async () => {
    const { url } = await link()
    expect(await post(url, { length: 6 * 1_048_576 })).toBe(413)
  })

  it('refuses a request whose host name is not local, and one from another origin', async () => {
    const { url } = await link()
    expect(await post(url, { host: 'attacker.test' })).toBe(403)
    expect(await post(url, { origin: 'http://attacker.test' })).toBe(403)
  })

  it('does not know a made-up token or a wrong path', async () => {
    const { url } = await link()
    const base = new URL(url).origin
    expect((await fetch(`${base}/upload/${'0'.repeat(32)}`)).status).toBe(410)
    expect((await fetch(`${base}/`)).status).toBe(404)
    expect((await fetch(`${base}/upload/../../etc/passwd`)).status).toBe(404)
    expect((await call('check_upload', { token: 'nope', waitSeconds: 0 })).isError).toBe(true)
  })

  it('lets a link expire', async () => {
    const short = await connect({ uploadLinkTtlMs: 30 })
    const { token, url } = JSON.parse(
      ((await short.callTool({ name: 'request_upload', arguments: {} })) as ToolResult).content[0]?.text ?? '{}',
    )
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect((await fetch(url)).status).toBe(410)
    const outcome = (await short.callTool({ name: 'check_upload', arguments: { token, waitSeconds: 0 } })) as ToolResult
    expect(outcome.isError).toBe(true)
    await short.close()
  })

  it('stops listening when the assistant disconnects', async () => {
    const { url } = await link()
    await client.close()
    await expect(fetch(url)).rejects.toThrow()
    client = await connect()
  })
})
