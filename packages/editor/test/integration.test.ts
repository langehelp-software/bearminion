import { EventEmitter } from 'node:events'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { announceVideoChanges, bearminion } from '../src/integration.js'
import { createEditorMiddleware } from '../src/middleware.js'
import { resolveEditorContext } from '../src/options.js'
import { dropEarlyReloadAfterSave } from '../src/reload.js'
import { CONTENT_COLLECTIONS_MARKER, contentReloadPlugin, reloadDevContent } from '../src/reload.js'
import { contentModel } from './starter.js'
import { stableStringify } from '../src/stable-json.js'

describe('dev integration hooks', () => {
  it('registers nothing outside astro dev', async () => {
    const integration = bearminion({ ...contentModel })
    const setup = integration.hooks['astro:config:setup']
    for (const command of ['build', 'preview', 'sync'] as const) {
      const calls: string[] = []
      await setup?.({
        command,
        config: { root: '/tmp/bearminion-project' },
        updateConfig: () => calls.push('update'),
        injectScript: () => calls.push('script'),
        injectRoute: () => calls.push('route'),
        addWatchFile: () => calls.push('watch'),
        addMiddleware: () => calls.push('middleware'),
        addRenderer: () => calls.push('renderer'),
        addClientDirective: () => calls.push('directive'),
        addDevToolbarApp: () => calls.push('toolbar'),
      } as never)
      expect(calls).toEqual([])
    }
  })

  it('adds the content reload plugin and API middleware in dev', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bearminion-dev-'))
    const integration = bearminion({ contentDir: 'content', uploadsDir: 'src/assets/uploads', ...contentModel })
    let plugins: { name?: string }[] = []
    let ignored: unknown
    const scripts: string[] = []
    await integration.hooks['astro:config:setup']?.({
      command: 'dev',
      config: { root },
      updateConfig: (config: { vite?: { plugins?: { name?: string }[]; server?: { watch?: { ignored?: unknown } } } }) => {
        plugins = config.vite?.plugins ?? []
        ignored = config.vite?.server?.watch?.ignored
      },
      injectScript: (stage: string, content: string) => {
        scripts.push(`${stage}:${content}`)
      },
    } as never)
    expect(plugins.map((plugin) => plugin.name)).toEqual(['bearminion-content-reload', 'bearminion-editor-client'])
    // New uploads and the undo history must not trigger a full reload and drop the draft.
    expect(ignored).toEqual([
      `${path.join(root, 'src/assets/uploads').replaceAll('\\', '/')}/**`,
      `${path.join(root, 'public/videos').replaceAll('\\', '/')}/**`,
      `${root.replaceAll('\\', '/')}/.editor/**`,
    ])
    expect(scripts).toEqual(['page:import "virtual:bearminion-editor"'])

    const used: unknown[] = []
    await integration.hooks['astro:server:setup']?.({
      server: {
        config: { root },
        ws: { send: () => {} },
        middlewares: { use: (handler: unknown) => used.push(handler) },
      },
    } as never)
    // The save marker for the reload filter, the video watcher notice, the forms route, then the editor API.
    expect(used).toHaveLength(4)

    // `forms: false` leaves the forms route out.
    const withoutForms: unknown[] = []
    await bearminion({ contentDir: 'content', uploadsDir: 'src/assets/uploads', forms: false, ...contentModel }).hooks[
      'astro:server:setup'
    ]?.({
      server: {
        config: { root },
        ws: { send: () => {} },
        middlewares: { use: (handler: unknown) => withoutForms.push(handler) },
      },
    } as never)
    expect(withoutForms).toHaveLength(3)
    fs.rmSync(root, { recursive: true, force: true })
  })
})

describe('uploaded videos', () => {
  it('tells Vite about a video the editor adds or removes, because the watcher ignores that folder', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bearminion-videos-'))
    const watcher = new EventEmitter()
    const seen: Array<[string, string]> = []
    for (const event of ['add', 'unlink']) watcher.on(event, (file: string) => seen.push([event, path.basename(file)]))
    const middleware = announceVideoChanges({ watcher } as never, dir)
    const request = (method: string, url: string) => {
      const response = new EventEmitter()
      let passed = false
      middleware({ method, url }, response as never, () => {
        passed = true
      })
      return { finish: () => response.emit('finish'), passed: () => passed }
    }

    fs.writeFileSync(path.join(dir, 'old.mp4'), 'x')
    const upload = request('POST', '/__bearminion/api/videos')
    fs.writeFileSync(path.join(dir, 'new.mp4'), 'x')
    expect(upload.passed()).toBe(true)
    expect(seen).toEqual([])
    upload.finish()
    expect(seen).toEqual([['add', 'new.mp4']])

    const removal = request('DELETE', '/__bearminion/api/videos/old.mp4')
    fs.rmSync(path.join(dir, 'old.mp4'))
    removal.finish()
    expect(seen).toEqual([
      ['add', 'new.mp4'],
      ['unlink', 'old.mp4'],
    ])

    // Other requests, other methods, and a list of videos change nothing.
    seen.length = 0
    for (const [method, url] of [
      ['GET', '/__bearminion/api/videos'],
      ['POST', '/__bearminion/api/save'],
      ['POST', '/videos'],
    ] as const) {
      const other = request(method, url)
      fs.writeFileSync(path.join(dir, `${method}.mp4`), 'x')
      other.finish()
      expect(other.passed()).toBe(true)
    }
    expect(seen).toEqual([])
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('does nothing when the folder does not exist yet', () => {
    const watcher = new EventEmitter()
    const seen: string[] = []
    watcher.on('add', (file: string) => seen.push(file))
    const dir = path.join(os.tmpdir(), `bearminion-missing-${Date.now()}`)
    const response = new EventEmitter()
    announceVideoChanges({ watcher } as never, dir)({ method: 'POST', url: '/__bearminion/api/videos' }, response as never, () => undefined)
    response.emit('finish')
    expect(seen).toEqual([])
  })
})

describe('content reload', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('drops the bare full reload that follows a save and keeps the content-ready one', () => {
    vi.useFakeTimers()
    const sent: unknown[] = []
    const server = { ws: { send: (payload: unknown) => sent.push(payload) } }
    const reloads = dropEarlyReloadAfterSave(server as never)
    server.ws.send({ type: 'full-reload' })
    reloads.saving()
    server.ws.send({ type: 'full-reload' })
    server.ws.send({ type: 'full-reload', path: '*' })
    server.ws.send({ type: 'custom', event: 'x', data: {} })
    expect(sent).toEqual([{ type: 'full-reload' }, { type: 'full-reload', path: '*' }, { type: 'custom', event: 'x', data: {} }])
    vi.advanceTimersByTime(3500)
    server.ws.send({ type: 'full-reload' })
    expect(sent).toHaveLength(4)
  })

  it('full-reloads when content JSON changes and ignores temp files', async () => {
    vi.useFakeTimers()
    const sent: unknown[] = []
    const watcher = new EventEmitter() as EventEmitter & { add: (dir: string) => void }
    watcher.add = () => {}
    const server = {
      watcher,
      moduleGraph: { invalidateAll: () => sent.push('invalidate') },
      environments: {
        ssr: {
          moduleGraph: { invalidateAll: () => sent.push('ssr') },
          hot: { send: (event: string) => sent.push(event) },
          runner: {
            evaluatedModules: {
              idToModuleMap: new Map([['page', { id: 'page' }]]),
              invalidateModule: (node: { id: string }) => sent.push(`eval:${node.id}`),
            },
          },
        },
      },
      ws: { send: (payload: unknown) => sent.push(payload) },
    }
    const plugin = contentReloadPlugin(['/tmp/bearminion-content'])
    const configure = plugin.configureServer
    if (typeof configure !== 'function') throw new Error('Expected configureServer to be a function')
    const run = configure as unknown as (server: object) => void
    run(server)

    watcher.emit('change', '/tmp/bearminion-content/site.json')
    await vi.advanceTimersByTimeAsync(400)
    expect(sent).toEqual([])

    watcher.emit('change', '/tmp/bearminion-content/.site.json.1.tmp')
    await vi.advanceTimersByTimeAsync(50)
    expect(sent).toEqual([])

    watcher.emit('change', '/tmp/bearminion-content/pages/index.json')
    await vi.advanceTimersByTimeAsync(49)
    expect(sent).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(sent).toContain('astro:content-changed')
    expect(sent).toContain('eval:page')
    expect(sent).toContainEqual({ type: 'custom', event: 'bearminion:content-reload', data: {} })

    const afterJson = sent.length
    watcher.emit('add', '/tmp/bearminion-content/hero.png')
    await vi.advanceTimersByTimeAsync(100)
    expect(sent).toHaveLength(afterJson)
  })

  it('leaves the reload to Astro once contentCollections() is in use', async () => {
    vi.useFakeTimers()
    const sent: unknown[] = []
    const watcher = new EventEmitter() as EventEmitter & { add: (dir: string) => void }
    watcher.add = () => {}
    const server = {
      watcher,
      moduleGraph: { invalidateAll: () => sent.push('invalidate') },
      environments: {},
      ws: { send: (payload: unknown) => sent.push(payload) },
    }
    const run = contentReloadPlugin(['/tmp/bearminion-content']).configureServer as unknown as (server: object) => void
    run(server)
    await vi.advanceTimersByTimeAsync(400)
    const marker = globalThis as Record<symbol, unknown>
    marker[CONTENT_COLLECTIONS_MARKER] = true
    try {
      watcher.emit('change', '/tmp/bearminion-content/pages/index.json')
      await vi.advanceTimersByTimeAsync(200)
      expect(sent).toEqual([])
    } finally {
      delete marker[CONTENT_COLLECTIONS_MARKER]
    }
    watcher.emit('change', '/tmp/bearminion-content/pages/index.json')
    await vi.advanceTimersByTimeAsync(200)
    expect(sent).toContain('invalidate')
    vi.useRealTimers()
  })

  it('invalidates module graphs when reloadDevContent runs', () => {
    const sent: string[] = []
    reloadDevContent({
      moduleGraph: { invalidateAll: () => sent.push('root') },
      environments: {
        client: {
          moduleGraph: { invalidateAll: () => sent.push('client') },
          hot: { send: () => sent.push('client-hot') },
        },
      },
      ws: { send: () => sent.push('ws') },
    } as never)
    expect(sent).toEqual(['root', 'client', 'client-hot', 'ws'])
  })
})

describe('localhost middleware', () => {
  it('serves the API on loopback and rejects a non-local Host or Origin', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bearminion-http-'))
    const contentDir = path.join(root, 'content')
    fs.mkdirSync(path.join(contentDir, 'pages'), { recursive: true })
    fs.writeFileSync(
      path.join(contentDir, 'site.json'),
      stableStringify({
        footer: { columns: [] },
        header: {
          cta: { href: '#cta', label: 'Start' },
          links: [{ href: '/', label: 'Home' }],
        },
        name: 'Demo',
        seo: {},
        url: 'https://bearminion.example',
      }),
    )
    const context = resolveEditorContext({ contentDir, ...contentModel }, root)
    const middleware = createEditorMiddleware(context)
    const server = http.createServer((req, res) => {
      middleware(req, res, () => {
        res.statusCode = 599
        res.end('next')
      })
    })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const port = (server.address() as AddressInfo).port
    try {
      const site = await request(port, 'GET', '/__bearminion/api/site')
      expect(site.status).toBe(200)
      expect(site.body).toContain('Demo')

      const passed = await request(port, 'GET', '/about')
      expect(passed.status).toBe(599)
      expect(passed.body).toBe('next')

      const foreignHost = await request(port, 'GET', '/__bearminion/api/site', { host: 'evil.example' })
      expect(foreignHost.status).toBe(403)

      const foreignOrigin = await request(port, 'GET', '/__bearminion/api/site', {
        origin: 'https://evil.example',
      })
      expect(foreignOrigin.status).toBe(403)
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

function request(
  port: number,
  method: string,
  pathname: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, method, path: pathname, headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') })
      })
    })
    req.on('error', reject)
    req.end()
  })
}
