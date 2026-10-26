import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Browser, Page, Request, Route } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchBrowser, openClean as openCleanAt, startDevServer, starter, type DevServer } from './dev-server'

const port = 4483
const origin = `http://127.0.0.1:${port}`
/** Cloudflare's test site key, which always passes. The site gets it from PUBLIC_TURNSTILE_SITE_KEY, never from content. */
const siteKey = '1x00000000000000000000AA'
/** What stands in for Cloudflare's script: it records the widget and lets the test hand out tokens. */
const fakeTurnstile = `
  window.__turnstile = null
  window.turnstile = {
    render: function (el, opts) {
      window.__turnstile = { el: el, opts: opts, resets: 0 }
      el.setAttribute('data-fake-turnstile', '')
      return 'widget-1'
    },
    reset: function () { window.__turnstile.resets += 1 },
  }
`
type FakeTurnstile = { opts: { sitekey: string; callback: (token: string) => void; 'error-callback': () => void }; resets: number }
type Answer = { status: number; body?: unknown }

/**
 * The form with a Turnstile site key in the environment and no handler file in the forms folder. One dev server per
 * file: two of the same project share `.astro` and race on it.
 */
describe('contact form with Turnstile and no handler', () => {
  let browser: Browser
  let server: DevServer
  let root = ''
  let contentDir = ''
  let uploadsDir = ''

  const logs = () => server?.logs() ?? ''
  const openClean = (page: Page, pathname: string) => openCleanAt(page, origin, pathname)

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bearminion-turnstile-'))
    contentDir = path.join(root, 'content')
    uploadsDir = path.join(starter, 'src', 'assets', 'e2e-turnstile-uploads')
    fs.cpSync(path.join(starter, 'content'), contentDir, { recursive: true })
    fs.rmSync(uploadsDir, { recursive: true, force: true })
    fs.mkdirSync(uploadsDir, { recursive: true })
    const formsDir = path.join(root, 'forms')
    fs.mkdirSync(formsDir)
    fs.writeFileSync(
      path.join(contentDir, 'pages', 'turnstile.json'),
      JSON.stringify(
        {
          sections: [
            {
              id: 'contact',
              anchor: 'contact',
              type: 'contact',
              variant: 'split',
              tone: 'base',
              props: { heading: 'Write to us', details: [], topics: ['General', 'Press'], thanks: 'Thanks, we got it.' },
            },
          ],
          seo: { title: 'turnstile', description: 'turnstile page.' },
          slug: 'turnstile',
          title: 'turnstile',
        },
        null,
        2,
      ),
    )
    server = await startDevServer({ port, contentDir, uploadsDir, formsDir, env: { PUBLIC_TURNSTILE_SITE_KEY: siteKey } })
    browser = await launchBrowser()
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    server?.stop()
    if (root) fs.rmSync(root, { recursive: true, force: true })
    if (uploadsDir) fs.rmSync(uploadsDir, { recursive: true, force: true })
  })

  async function mockEndpoint(page: Page, answer: () => Answer): Promise<Request[]> {
    const seen: Request[] = []
    await page.route('**/api/contact', (route: Route) => {
      seen.push(route.request())
      const next = answer()
      return route.fulfill({
        status: next.status,
        headers: { 'content-type': 'application/json' },
        body: next.body === undefined ? '' : JSON.stringify(next.body),
      })
    })
    return seen
  }

  async function visit(page: Page): Promise<void> {
    await openClean(page, '/turnstile')
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    await page.getByRole('button', { name: 'Exit preview' }).waitFor()
    await page.waitForTimeout(1700)
  }

  async function fill(page: Page): Promise<void> {
    await page.locator('input[name="name"]').fill('Ada Lovelace')
    await page.locator('input[name="email"]').fill('ada@example.com')
    await page.locator('select[name="topic"]').selectOption('Press')
    await page.locator('textarea[name="message"]').fill('Hello there')
  }

  const submit = (page: Page) => page.getByRole('button', { name: /^Send message$|^Sending/ }).click()
  const toast = (page: Page) => page.locator('.bm-toast')

  it('warns in the terminal that src/forms/contact.ts does not exist', async () => {
    expect(logs()).toContain('src/forms/contact.ts does not exist')
    expect(logs()).toContain('/api/contact')
  })

  it('shows the widget with the key from the environment, waits for its token, sends it, and needs a new one after every send', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const scripts: string[] = []
    await page.route('https://challenges.cloudflare.com/**', (route) => {
      scripts.push(route.request().url())
      return route.fulfill({ contentType: 'application/javascript', body: fakeTurnstile })
    })
    let answer: Answer = { status: 422, body: { ok: false, error: 'The spam check did not pass.' } }
    const seen = await mockEndpoint(page, () => answer)
    const giveToken = (token: string) =>
      page.evaluate((value) => (window as unknown as { __turnstile: FakeTurnstile }).__turnstile.opts.callback(value), token)
    const resets = () => page.evaluate(() => (window as unknown as { __turnstile: FakeTurnstile }).__turnstile.resets)

    await visit(page)
    // The stand-in widget has no size, so wait for it to exist rather than to be visible.
    await page.locator('[data-turnstile-widget][data-fake-turnstile]').waitFor({ state: 'attached' })
    expect(scripts[0]).toContain('/turnstile/v0/api.js')
    expect(scripts[0]).toContain('render=explicit')
    expect(await page.evaluate(() => (window as unknown as { __turnstile: FakeTurnstile }).__turnstile.opts.sitekey)).toBe(siteKey)
    // The token goes in the request, not into a hidden field of the form.
    expect(await page.locator('input[name="cf-turnstile-response"]').count()).toBe(0)

    // No token yet: nothing is sent, and the visitor is told why.
    await fill(page)
    await submit(page)
    await toast(page).getByText('spam check is still running').waitFor()
    expect(seen).toHaveLength(0)

    // The token goes out with the message. The handler refuses, which spends the token: a new one is asked for.
    await giveToken('token-1')
    await submit(page)
    await toast(page).getByText('The spam check did not pass.').waitFor()
    expect(seen).toHaveLength(1)
    expect(seen[0]?.postDataJSON()).toMatchObject({ 'cf-turnstile-response': 'token-1', email: 'ada@example.com' })
    expect(await resets()).toBe(1)

    await submit(page)
    await toast(page).getByText('spam check is still running').waitFor()
    expect(seen).toHaveLength(1)

    answer = { status: 200, body: { ok: true } }
    await giveToken('token-2')
    await submit(page)
    await page.locator('[data-contact-success]').waitFor()
    expect(seen).toHaveLength(2)
    expect(seen[1]?.postDataJSON()).toMatchObject({ 'cf-turnstile-response': 'token-2' })
    expect(await resets()).toBe(2)
    expect(errors, logs()).toEqual([])
    await page.close()
  }, 60_000)

  it("says the spam check could not run when Cloudflare's script is blocked or the widget reports an error", async () => {
    const blocked = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors: string[] = []
    blocked.on('pageerror', (error) => errors.push(error.message))
    await blocked.route('https://challenges.cloudflare.com/**', (route) => route.abort('failed'))
    const seen = await mockEndpoint(blocked, () => ({ status: 200, body: { ok: true } }))
    await visit(blocked)
    await fill(blocked)
    await submit(blocked)
    await toast(blocked).getByText('spam check could not run').waitFor()
    expect(seen).toHaveLength(0)
    await blocked.close()

    const broken = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    broken.on('pageerror', (error) => errors.push(error.message))
    await broken.route('https://challenges.cloudflare.com/**', (route) =>
      route.fulfill({ contentType: 'application/javascript', body: fakeTurnstile }),
    )
    await mockEndpoint(broken, () => ({ status: 200, body: { ok: true } }))
    await visit(broken)
    await broken.locator('[data-turnstile-widget][data-fake-turnstile]').waitFor({ state: 'attached' })
    await broken.evaluate(() => (window as unknown as { __turnstile: FakeTurnstile }).__turnstile.opts['error-callback']())
    await fill(broken)
    await submit(broken)
    await toast(broken).getByText('spam check could not run').waitFor()
    await broken.close()
    expect(errors, logs()).toEqual([])
  }, 90_000)

  it('warns in the sidebar that nothing receives the form while the handler file is missing', async () => {
    const page = await browser.newPage({ viewport: { width: 1700, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    // The page loads Cloudflare's script once a site key is set; this test does not need it.
    await page.route('https://challenges.cloudflare.com/**', (route) => route.abort('failed'))
    await openClean(page, '/turnstile')
    const toolbar = page.getByRole('toolbar', { name: 'Section' })
    await page.locator('[data-section-id="contact"] [data-field="sections.0.props.heading"]').click({ position: { x: 4, y: 4 } })
    await page.locator('[data-section-id="contact"]').hover()
    const form = page.locator('[data-editor-field="section:contact"]')
    if (!(await form.isVisible())) await toolbar.getByRole('button', { name: 'Settings', exact: true }).click()
    await form.waitFor()

    const note = form.locator('[data-form-handler="contact"]')
    await note.waitFor()
    expect(await note.getAttribute('role')).toBe('alert')
    expect(await note.innerText()).toContain('Nothing receives this form yet')
    expect(await note.innerText()).toContain('src/forms/contact.ts')
    expect(errors, logs()).toEqual([])
    await page.close()
  }, 90_000)
})
