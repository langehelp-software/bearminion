import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createMigrator } from '../src/migrate.js'
import { ASSETS_PREFIX, createEditorMiddleware, missingImageSvg } from '../src/middleware.js'
import type { EditorContext } from '../src/options.js'
import { createFileStore } from '../src/store.js'
import { defaultTheme } from '../src/theme.js'
import { sectionRegistry, siteDefinition } from './starter.js'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const cleanup: (() => void)[] = []
afterEach(() => {
  for (const step of cleanup.splice(0)) step()
})

/** The editor middleware on a local port, over a project with one image at src/assets/uploads/here.png. */
async function serve(): Promise<string> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bearminion-assets-'))
  const contentDir = path.join(root, 'content')
  const uploadsDir = path.join(root, 'src', 'assets', 'uploads')
  fs.mkdirSync(uploadsDir, { recursive: true })
  fs.writeFileSync(path.join(uploadsDir, 'here.png'), PNG)
  const context: EditorContext = {
    root,
    contentDir,
    uploadsDir,
    sections: sectionRegistry,
    site: siteDefinition,
    store: createFileStore({ root, contentDir, uploadsDir }),
    migrator: createMigrator(),
    theme: defaultTheme,
    git: false,
  }
  const middleware = createEditorMiddleware(context)
  const server = http.createServer((req, res) =>
    middleware(req, res, () => {
      res.statusCode = 418
      res.end()
    }),
  )
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  cleanup.push(() => {
    server.close()
    fs.rmSync(root, { recursive: true, force: true })
  })
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}${ASSETS_PREFIX}?src=`
}

describe('dev asset route', () => {
  it('serves an image that exists', async () => {
    const base = await serve()
    const response = await fetch(`${base}src/assets/uploads/here.png`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG)
  })

  it('answers a missing image with a placeholder that names the file, so the page shows it', async () => {
    const base = await serve()
    const response = await fetch(`${base}src/assets/uploads/gone.png`)
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toBe('image/svg+xml')
    const body = await response.text()
    expect(body).toContain('Missing image')
    expect(body).toContain('gone.png')
  })

  it('answers HEAD without a body, so the editor can ask whether a file exists', async () => {
    const base = await serve()
    const present = await fetch(`${base}src/assets/uploads/here.png`, { method: 'HEAD' })
    const gone = await fetch(`${base}src/assets/uploads/gone.png`, { method: 'HEAD' })
    expect([present.status, gone.status]).toEqual([200, 404])
    expect(await gone.text()).toBe('')
  })

  it('refuses paths outside the image folders and other methods', async () => {
    const base = await serve()
    expect((await fetch(`${base}content/site.json`)).status).toBe(404)
    expect((await fetch(`${base}src/assets/../content/x.png`)).status).toBe(404)
    expect((await fetch(`${base}src/assets/uploads/here.png`, { method: 'POST' })).status).toBe(405)
  })

  it('escapes the file name in the placeholder', () => {
    expect(missingImageSvg('src/assets/a<b>&.png')).toContain('a&#60;b&#62;&#38;.png')
  })
})
