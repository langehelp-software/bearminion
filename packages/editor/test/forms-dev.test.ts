import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFormsMiddleware, formFile, formsAreLive, readDotEnv, resolveFormsConfig } from '../src/forms-dev.js'
import { defineForm } from '../src/forms/index.js'

let root = ''

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bearminion-forms-dev-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('resolveFormsConfig', () => {
  it('defaults to src/forms under /api, takes a folder and path, and can be switched off', () => {
    expect(resolveFormsConfig(undefined, root)).toEqual({ dir: path.join(root, 'src/forms'), prefix: '/api' })
    expect(resolveFormsConfig({ dir: 'server/forms', prefix: 'hooks/' }, root)).toEqual({
      dir: path.join(root, 'server/forms'),
      prefix: '/hooks',
    })
    expect(resolveFormsConfig(false, root)).toBeNull()
  })
})

describe('formFile', () => {
  it('finds a form by name with a script extension, and nothing else', () => {
    const dir = path.join(root, 'forms')
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, 'contact.ts'), '')
    fs.writeFileSync(path.join(dir, 'notes.txt'), '')
    fs.writeFileSync(path.join(root, 'secret.ts'), '')
    expect(formFile(dir, 'contact')).toBe(path.join(dir, 'contact.ts'))
    expect(formFile(dir, 'notes')).toBeNull()
    expect(formFile(dir, 'missing')).toBeNull()
    // A name cannot climb out of the folder.
    expect(formFile(dir, '../secret')).toBeNull()
    expect(formFile(dir, '..%2Fsecret')).toBeNull()
    expect(formFile(dir, 'a/b')).toBeNull()
    expect(formFile(dir, '')).toBeNull()
  })
})

describe('readDotEnv', () => {
  it('reads the env files in Vite order, later files winning, and skips missing ones', () => {
    fs.writeFileSync(path.join(root, '.env'), 'A=base\nB=base\n')
    fs.writeFileSync(path.join(root, '.env.local'), 'B=local\nC="quoted value"\n')
    fs.writeFileSync(path.join(root, '.env.development'), 'D=dev\n')
    expect(readDotEnv(root)).toEqual({ A: 'base', B: 'local', C: 'quoted value', D: 'dev' })
    expect(readDotEnv(path.join(root, 'nowhere'))).toEqual({})
  })
})

describe('formsAreLive', () => {
  const saved = process.env.BEARMINION_FORMS_LIVE
  afterEach(() => {
    if (saved === undefined) delete process.env.BEARMINION_FORMS_LIVE
    else process.env.BEARMINION_FORMS_LIVE = saved
  })

  it('is off by default, and on when the variable or an env file says on', () => {
    delete process.env.BEARMINION_FORMS_LIVE
    expect(formsAreLive(root)).toBe(false)
    fs.writeFileSync(path.join(root, '.env.local'), 'BEARMINION_FORMS_LIVE=on\n')
    expect(formsAreLive(root)).toBe(true)
    process.env.BEARMINION_FORMS_LIVE = 'off'
    expect(formsAreLive(root)).toBe(false)
    process.env.BEARMINION_FORMS_LIVE = 'on'
    expect(formsAreLive(path.join(root, 'nowhere'))).toBe(true)
  })
})

describe('forms route', () => {
  async function serve(options: { live: boolean; form?: unknown; files?: string[] }) {
    const dir = path.join(root, 'src/forms')
    fs.mkdirSync(dir, { recursive: true })
    for (const name of options.files ?? ['contact.ts']) fs.writeFileSync(path.join(dir, name), '')
    const logs: string[] = []
    const middleware = createFormsMiddleware({
      dir,
      prefix: '/api',
      root,
      live: options.live,
      load: async () => ({ default: options.form }),
      log: { info: (message) => logs.push(`info: ${message}`), error: (message) => logs.push(`error: ${message}`) },
    })
    const server = http.createServer((req, res) =>
      middleware(req, res, () => {
        res.statusCode = 404
        res.end('next')
      }),
    )
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    return { base, logs, close: () => new Promise<void>((resolve) => server.close(() => resolve())) }
  }

  const send = (base: string, pathname = '/api/contact') =>
    fetch(`${base}${pathname}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ formId: 'contact', page: '/', name: 'Ada', message: 'Hi' }),
    })

  it('is a dry run by default: prints the message, answers ok and never calls the handler', async () => {
    const calls: string[] = []
    const dev = await serve({ live: false, form: defineForm(() => void calls.push('called')) })
    const response = await send(dev.base)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(calls).toEqual([])
    expect(dev.logs.join('\n')).toContain('Dry run')
    expect(dev.logs.join('\n')).toContain('BEARMINION_FORMS_LIVE=on')
    expect(dev.logs.join('\n')).toContain('"name": "Ada"')
    await dev.close()
  })

  it('runs the handler when live, with the project env and dev set', async () => {
    fs.writeFileSync(path.join(root, '.env'), 'FORMS_TEST_KEY=from-dotenv\n')
    const seen: unknown[] = []
    const dev = await serve({
      live: true,
      form: defineForm((submission, { env, dev: isDev }) => {
        seen.push({ name: submission.name, key: env.FORMS_TEST_KEY, isDev })
        return { ok: true, message: 'Got it.' }
      }),
    })
    const response = await send(dev.base)
    expect(await response.json()).toEqual({ ok: true, message: 'Got it.' })
    expect(seen).toEqual([{ name: 'Ada', key: 'from-dotenv', isDev: true }])
    await dev.close()
  })

  it('leaves other paths and unknown forms to the dev server', async () => {
    const dev = await serve({ live: true, form: defineForm(() => undefined) })
    expect((await send(dev.base, '/api/other')).status).toBe(404)
    expect((await send(dev.base, '/contact')).status).toBe(404)
    expect((await send(dev.base, '/api/contact/extra')).status).toBe(404)
    await dev.close()
  })

  it('says what is wrong when the file does not default-export defineForm()', async () => {
    const dev = await serve({ live: true, form: () => undefined })
    const response = await send(dev.base)
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ ok: false, error: expect.stringContaining('must export default defineForm') })
    expect(dev.logs.join('\n')).toContain('error: src/forms/contact.ts must `export default defineForm(...)`')
    await dev.close()
  })

  it('answers a post that is too large with 413', async () => {
    const dev = await serve({ live: true, form: defineForm(() => undefined) })
    const response = await fetch(`${dev.base}/api/contact`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'x'.repeat(1_100_000) }),
    })
    expect(response.status).toBe(413)
    await dev.close()
  })
})
