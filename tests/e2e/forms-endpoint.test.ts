import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Browser, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchBrowser, openClean as openCleanAt, startDevServer, starter, type DevServer } from './dev-server'

const livePort = 4482
const live = `http://127.0.0.1:${livePort}`
const formsEntry = path.resolve(starter, '../../packages/editor/dist/forms.js')

/**
 * The server side of a form, end to end: a file in the forms folder that default-exports `defineForm(...)` answers at
 * /api/<name> in `astro dev`, and runs for real with BEARMINION_FORMS_LIVE=on. The dry run (the default) is tested in
 * contact-form.test.ts. One dev server per file: two of the same project share `.astro` and race on it.
 */
describe('forms in astro dev', () => {
  let browser: Browser
  let root = ''
  let contentDir = ''
  let uploadsDir = ''
  let calls = ''
  let liveServer: DevServer

  const called = () => (fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').split('\n').filter(Boolean) : [])
  const toast = (page: Page) => page.locator('.bm-toast')

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bearminion-forms-endpoint-'))
    contentDir = path.join(root, 'content')
    uploadsDir = path.join(starter, 'src', 'assets', 'e2e-forms-endpoint-uploads')
    calls = path.join(root, 'calls.txt')
    const formsDir = path.join(root, 'forms')
    fs.cpSync(path.join(starter, 'content'), contentDir, { recursive: true })
    fs.rmSync(uploadsDir, { recursive: true, force: true })
    fs.mkdirSync(uploadsDir, { recursive: true })
    fs.mkdirSync(formsDir)
    fs.writeFileSync(
      path.join(formsDir, 'contact.mjs'),
      `import fs from 'node:fs'
import { defineForm, FormError } from ${JSON.stringify(formsEntry)}

export default defineForm(async (submission, { env, dev }) => {
  fs.appendFileSync(${JSON.stringify(calls)}, submission.name + '\\n')
  if (submission.name === 'boom') throw new Error('upstream said: secret-token-123')
  if (submission.name === 'nope') throw new FormError('We are closed today.', { fieldErrors: { name: 'Not this name.' } })
  if (submission.name === 'hello') return { ok: true, message: 'Hello from the handler, ' + env.FORMS_E2E_GREETING + (dev ? ' (dev)' : '') }
})
`,
    )
    fs.writeFileSync(
      path.join(formsDir, 'guarded.mjs'),
      `import { defineForm } from ${JSON.stringify(formsEntry)}

export default defineForm(() => undefined, { turnstile: true, origins: ['https://other.example'] })
`,
    )
    fs.writeFileSync(
      path.join(contentDir, 'pages', 'endpoint.json'),
      JSON.stringify(
        {
          sections: [
            {
              id: 'contact',
              anchor: 'contact',
              type: 'contact',
              variant: 'split',
              tone: 'base',
              props: {
                heading: 'Write to us',
                details: [],
                topics: ['General'],
                thanks: 'Thanks, we got it.',
              },
            },
          ],
          seo: { title: 'endpoint', description: 'endpoint page.' },
          slug: 'endpoint',
          title: 'endpoint',
        },
        null,
        2,
      ),
    )
    liveServer = await start(livePort, liveEnv)
    browser = await launchBrowser()
  }, 180_000)

  const start = (port: number, env?: Record<string, string>) =>
    startDevServer({ contentDir, uploadsDir, formsDir: path.join(root, 'forms'), port, ...(env ? { env } : {}) })
  const liveEnv = { BEARMINION_FORMS_LIVE: 'on', FORMS_E2E_GREETING: 'welcome', TURNSTILE_SECRET_KEY: 'test-secret' }

  afterAll(async () => {
    await browser?.close()
    liveServer?.stop()
    if (root) fs.rmSync(root, { recursive: true, force: true })
    if (uploadsDir) fs.rmSync(uploadsDir, { recursive: true, force: true })
  })

  async function visit(origin: string): Promise<Page> {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await openCleanAt(page, origin, '/endpoint')
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    await page.getByRole('button', { name: 'Exit preview' }).waitFor()
    await page.waitForTimeout(1700)
    return page
  }

  async function send(page: Page, name: string): Promise<void> {
    await page.locator('input[name="name"]').fill(name)
    await page.locator('input[name="email"]').fill('ada@example.com')
    await page.locator('textarea[name="message"]').fill('Hello there')
    await page.getByRole('button', { name: /^Send message$/ }).click()
  }

  const post = (origin: string, pathname: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${origin}${pathname}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })

  it('runs the handler when live, and shows what it returns', async () => {
    const page = await visit(live)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await send(page, 'hello')
    const success = page.locator('[data-contact-success]')
    await success.waitFor()
    // The handler got the project's environment and dev = true; its message replaced the thank-you text.
    expect(await success.innerText()).toContain('Hello from the handler, welcome (dev)')
    expect(await success.innerText()).not.toContain('Thanks, we got it.')
    expect(called()).toContain('hello')

    await page.getByRole('button', { name: 'Send another' }).click()
    await send(page, 'Ada')
    await success.waitFor()
    expect(await success.innerText()).toContain('Thanks, we got it.')
    expect(errors, liveServer.logs()).toEqual([])
    await page.close()
  }, 90_000)

  it('shows a failure of the outside service as a message the visitor closes, without leaking what the service said', async () => {
    const page = await visit(live)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await send(page, 'boom')
    await toast(page).getByText('The message could not be delivered. Try again later.').waitFor()
    expect(await page.locator('body').innerText()).not.toContain('secret-token-123')
    // The cause is in the dev server's log, for the person who runs the site.
    await expect.poll(() => liveServer.logs()).toContain('secret-token-123')
    expect(await page.locator('[data-contact-success]').isVisible()).toBe(false)
    // It stays until it is closed.
    await page.waitForTimeout(2500)
    expect(await toast(page).count()).toBe(1)
    await toast(page).getByRole('button', { name: 'Dismiss message' }).click()
    expect(await toast(page).count()).toBe(0)
    expect(errors, liveServer.logs()).toEqual([])
    await page.close()
  }, 90_000)

  it('shows a FormError with its text, and marks the field it names', async () => {
    const page = await visit(live)
    await send(page, 'nope')
    await toast(page).getByText('We are closed today.').waitFor()
    expect(await page.locator('[data-field-error]').innerText()).toBe('Not this name.')
    expect(await page.locator('input[name="name"]').getAttribute('aria-invalid')).toBe('true')
    await page.close()
  }, 60_000)

  it('refuses what is not a post from this site, a form post, or a size it accepts, before the handler runs', async () => {
    const before = called().length
    expect((await fetch(`${live}/api/contact`)).status).toBe(405)
    const stranger = await post(live, '/api/contact', { name: 'x' }, { origin: 'https://evil.example' })
    expect(stranger.status).toBe(403)
    expect(await stranger.json()).toMatchObject({ ok: false })
    expect((await post(live, '/api/contact', { name: 'x', message: 'y'.repeat(70_000) })).status).toBe(413)
    expect((await post(live, '/api/contact', 'plain', { 'content-type': 'text/plain' })).status).toBe(415)
    expect((await post(live, '/api/contact', '{nope')).status).toBe(400)
    expect(called().length).toBe(before)
  })

  it('reads a multipart post like the page sends it, and drops a message whose trap field is filled', async () => {
    const form = new FormData()
    form.append('name', 'multipart-person')
    form.append('message', 'Hi')
    const sent = await fetch(`${live}/api/contact`, { method: 'POST', body: form })
    expect(sent.status).toBe(200)
    expect(called()).toContain('multipart-person')

    const trapped = await post(live, '/api/contact', { name: 'trapped', message: 'Hi', _gotcha: 'https://spam.example' })
    expect(trapped.status).toBe(200)
    expect(await trapped.json()).toEqual({ ok: true })
    expect(called()).not.toContain('trapped')
  })

  it('checks Turnstile before the handler, and lets a listed origin post', async () => {
    const missing = await post(live, '/api/guarded', { name: 'x' })
    expect(missing.status).toBe(422)
    expect(await missing.json()).toMatchObject({ ok: false, error: expect.stringContaining('spam check') })

    // Another site that is listed gets past the origin check (and then meets the spam check), with the CORS header.
    // The preflight itself is answered by Vite in `astro dev`; it is covered by the unit tests.
    const listed = await post(live, '/api/guarded', { name: 'x' }, { origin: 'https://other.example' })
    expect(listed.status).toBe(422)
    expect(listed.headers.get('access-control-allow-origin')).toBe('https://other.example')
  })

  it('leaves a path with no form file to the dev server', async () => {
    expect((await fetch(`${live}/api/nothing-here`)).status).toBe(404)
    expect((await fetch(`${live}/api/..%2Fcontact`)).status).toBe(404)
  })
})
