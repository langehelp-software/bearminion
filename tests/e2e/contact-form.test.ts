import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Browser, Page, Request, Route } from 'playwright'
import { launchBrowser, openClean as openCleanAt, startDevServer, starter, waitFor, type DevServer } from './dev-server'

const port = 4480
const origin = `http://127.0.0.1:${port}`
const formsEntry = path.resolve(starter, '../../packages/editor/dist/forms.js')

/** What the mock endpoint answers with, by test. */
type Answer = { status: number; body?: unknown; delay?: number } | 'offline'

describe('contact form', () => {
  let browser: Browser
  let server: DevServer
  let root = ''
  let contentDir = ''
  let uploadsDir = ''
  let formsDir = ''
  let calls = ''

  const logs = () => server?.logs() ?? ''
  const pagePath = (name: string) => path.join(contentDir, 'pages', `${name}.json`)
  const openClean = (page: Page, pathname: string) => openCleanAt(page, origin, pathname)

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bearminion-forms-'))
    contentDir = path.join(root, 'content')
    uploadsDir = path.join(starter, 'src', 'assets', 'e2e-forms-uploads')
    fs.cpSync(path.join(starter, 'content'), contentDir, { recursive: true })
    fs.rmSync(uploadsDir, { recursive: true, force: true })
    fs.mkdirSync(uploadsDir, { recursive: true })
    const page = (slug: string, props: Record<string, unknown>) =>
      fs.writeFileSync(
        pagePath(slug),
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
                  topics: ['General', 'Press'],
                  thanks: 'Thanks, we got it.',
                  ...props,
                },
              },
            ],
            seo: { title: slug, description: `${slug} page.` },
            slug,
            title: slug,
          },
          null,
          2,
        ),
      )
    page('connected', {})
    page('editing', {})
    // A form file of the site's own. This server is not live, so the dev route only receives the message.
    formsDir = path.join(root, 'forms')
    calls = path.join(root, 'calls.txt')
    fs.mkdirSync(formsDir)
    fs.writeFileSync(
      path.join(formsDir, 'contact.mjs'),
      `import fs from 'node:fs'
import { defineForm } from ${JSON.stringify(formsEntry)}

export default defineForm((submission) => void fs.appendFileSync(${JSON.stringify(calls)}, submission.name + '\\n'))
`,
    )
    server = await startDevServer({ port, contentDir, uploadsDir, formsDir })
    browser = await launchBrowser()
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    server?.stop()
    if (root) fs.rmSync(root, { recursive: true, force: true })
    if (uploadsDir) fs.rmSync(uploadsDir, { recursive: true, force: true })
  })

  /** Answers /api/contact like a handler would, and records what the form sent. */
  async function mockEndpoint(page: Page, answer: () => Answer): Promise<Request[]> {
    const seen: Request[] = []
    await page.route('**/api/contact', async (route: Route) => {
      const request = route.request()
      seen.push(request)
      const next = answer()
      if (next === 'offline') return route.abort('failed')
      if (next.delay) await new Promise((resolve) => setTimeout(resolve, next.delay))
      return route.fulfill({
        status: next.status,
        headers: { 'content-type': 'application/json' },
        body: next.body === undefined ? '' : JSON.stringify(next.body),
      })
    })
    return seen
  }

  /** The page as a visitor sees it, with the form ready for input and the "too fast" window already over. */
  async function visit(page: Page, slug: string, { settle = true } = {}): Promise<void> {
    await openClean(page, `/${slug}`)
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    await page.getByRole('button', { name: 'Exit preview' }).waitFor()
    if (settle) await page.waitForTimeout(1700)
  }

  async function fill(page: Page): Promise<void> {
    await page.locator('input[name="name"]').fill('Ada Lovelace')
    await page.locator('input[name="email"]').fill('ada@example.com')
    await page.locator('select[name="topic"]').selectOption('Press')
    await page.locator('textarea[name="message"]').fill('Hello there')
  }

  const submit = (page: Page) => page.getByRole('button', { name: /^Send message$|^Sending/ }).click()
  /** The message a failed send leaves on screen until the visitor closes it. */
  const toast = (page: Page) => page.locator('.bm-toast')

  it('posts the fields as JSON to /api/contact with the form id and page, shows sending, then the thank-you, and can send another', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const seen = await mockEndpoint(page, () => ({ status: 200, body: { ok: true }, delay: 600 }))
    await visit(page, 'connected')
    // The address is fixed: nothing in the content or the settings can point the form somewhere else.
    expect(await page.locator('form[data-contact-form]').getAttribute('action')).toBe('/api/contact')
    // No site key in the environment, so no Turnstile widget.
    expect(await page.locator('[data-turnstile-widget]').count()).toBe(0)
    await fill(page)
    await submit(page)

    // While the request is out the button is disabled and says so.
    const button = page.locator('form[data-contact-form] button[type="submit"]')
    await page.waitForFunction(
      () => document.querySelector('form[data-contact-form] button[type="submit"]')?.textContent?.trim() === 'Sending…',
    )
    expect(await button.isDisabled()).toBe(true)
    expect(await page.locator('form[data-contact-form]').getAttribute('aria-busy')).not.toBeNull()

    const success = page.locator('[data-contact-success]')
    await success.waitFor()
    expect(await success.innerText()).toContain('Thanks, we got it.')
    expect(await success.evaluate((node) => node === document.activeElement)).toBe(true)
    expect(await page.locator('form[data-contact-form]').isVisible()).toBe(false)

    expect(seen).toHaveLength(1)
    const request = seen[0]
    if (!request) throw new Error('no request')
    expect(request.method()).toBe('POST')
    expect(new URL(request.url()).pathname).toBe('/api/contact')
    expect(await request.headerValue('accept')).toBe('application/json')
    expect(await request.headerValue('content-type')).toBe('application/json')
    // The trap field is never sent.
    expect(request.postDataJSON()).toEqual({
      formId: 'contact',
      page: '/connected',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      topic: 'Press',
      message: 'Hello there',
    })

    await page.getByRole('button', { name: 'Send another' }).click()
    expect(await page.locator('form[data-contact-form]').isVisible()).toBe(true)
    expect(await page.locator('input[name="name"]').inputValue()).toBe('')
    expect(await button.isEnabled()).toBe(true)
    expect(errors, logs()).toEqual([])
    await page.close()
  }, 60_000)

  it('shows the endpoint message and field errors, marks the fields, clears them on edit, and retries', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let answer: Answer = { status: 422, body: { ok: false, error: 'Check the form.', fieldErrors: { email: 'That is not an address.' } } }
    const seen = await mockEndpoint(page, () => answer)
    await visit(page, 'connected')
    await fill(page)
    await submit(page)

    await toast(page).getByText('Check the form.').waitFor()
    const email = page.locator('input[name="email"]')
    expect(await email.getAttribute('aria-invalid')).toBe('true')
    const note = page.locator('[data-field-error]')
    expect(await note.innerText()).toBe('That is not an address.')
    expect(await email.getAttribute('aria-describedby')).toBe(await note.getAttribute('id'))
    // Focus goes to the first field that is wrong, and the form is still there with what was typed.
    expect(await email.evaluate((node) => node === document.activeElement)).toBe(true)
    expect(await page.locator('input[name="name"]').inputValue()).toBe('Ada Lovelace')
    expect(await page.locator('form[data-contact-form] button[type="submit"]').isEnabled()).toBe(true)

    // Editing the field takes its mark away. The message does not fade on its own, and the visitor closes it.
    await email.fill('ada@lovelace.example')
    expect(await email.getAttribute('aria-invalid')).toBeNull()
    expect(await page.locator('[data-field-error]').count()).toBe(0)
    await page.waitForTimeout(2500)
    expect(await toast(page).isVisible()).toBe(true)
    await toast(page).getByRole('button', { name: 'Dismiss message' }).click()
    expect(await toast(page).count()).toBe(0)

    // The same form, sent again, goes through.
    answer = { status: 200, body: { ok: true } }
    await submit(page)
    await page.locator('[data-contact-success]').waitFor()
    expect(await toast(page).count()).toBe(0)
    expect(seen).toHaveLength(2)
    expect(errors, logs()).toEqual([])
    await page.close()
  }, 60_000)

  it('says what went wrong for a server error and for no connection, and keeps the form usable', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let answer: Answer = { status: 500 }
    await mockEndpoint(page, () => answer)
    await visit(page, 'connected')
    await fill(page)
    const button = page.locator('form[data-contact-form] button[type="submit"]')

    await submit(page)
    await toast(page).getByText('The server had a problem').waitFor()
    expect(await button.isEnabled()).toBe(true)
    expect(await page.locator('[data-contact-success]').isVisible()).toBe(false)

    // A new send replaces the old message instead of piling up.
    answer = 'offline'
    await submit(page)
    await toast(page).getByText('Check your connection').waitFor()
    expect(await toast(page).count()).toBe(1)
    expect(await button.isEnabled()).toBe(true)
    // Focus is back on the button, so the visitor can send again from the keyboard.
    expect(await button.evaluate((node) => node === document.activeElement)).toBe(true)

    // A handler that answers 200 but says ok: false is an error too.
    answer = { status: 200, body: { ok: false, error: 'Access key is invalid.' } }
    await submit(page)
    await toast(page).getByText('Access key is invalid.').waitFor()
    expect(await toast(page).count()).toBe(1)

    answer = { status: 200, body: { ok: true } }
    await submit(page)
    await page.locator('[data-contact-success]').waitFor()
    expect(errors, logs()).toEqual([])
    await page.close()
  }, 60_000)

  it('drops what a script sends: a filled trap, or a submit before a person could have typed', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const seen = await mockEndpoint(page, () => ({ status: 200, body: { ok: true } }))
    // The trap is out of sight and out of the tab order, and a screen reader skips it.
    await visit(page, 'connected')
    const trap = page.locator('input[name="_gotcha"]')
    expect(await trap.getAttribute('tabindex')).toBe('-1')
    expect(await trap.evaluate((node) => node.closest('[aria-hidden="true"]') !== null)).toBe(true)
    expect(await trap.isVisible()).toBe(true)
    expect(await trap.evaluate((node) => node.getBoundingClientRect().right < 0)).toBe(true)

    await fill(page)
    await trap.evaluate((node) => {
      ;(node as HTMLInputElement).value = 'https://spam.example'
    })
    await submit(page)
    await page.locator('[data-contact-success]').waitFor()
    expect(seen).toHaveLength(0)

    // A fresh page, submitted at once, is dropped the same way.
    const quick = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const quickSeen = await mockEndpoint(quick, () => ({ status: 200, body: { ok: true } }))
    await visit(quick, 'connected', { settle: false })
    await fill(quick)
    await submit(quick)
    await quick.locator('[data-contact-success]').waitFor()
    expect(quickSeen).toHaveLength(0)
    await quick.close()
    expect(errors, logs()).toEqual([])
    await page.close()
  }, 90_000)

  it("replaces the thank-you text with the endpoint's own message, and brings it back for the next one", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let answer: Answer = { status: 200, body: { ok: true, message: 'We will write back today.' } }
    await mockEndpoint(page, () => answer)
    await visit(page, 'connected')
    await fill(page)
    await submit(page)
    const success = page.locator('[data-contact-success]')
    await success.waitFor()
    expect(await success.innerText()).toContain('We will write back today.')
    expect(await success.innerText()).not.toContain('Thanks, we got it.')

    await page.getByRole('button', { name: 'Send another' }).click()
    answer = { status: 200, body: { ok: true } }
    await fill(page)
    await submit(page)
    await success.waitFor()
    expect(await success.innerText()).toContain('Thanks, we got it.')
    expect(await success.innerText()).not.toContain('We will write back today.')
    expect(errors, logs()).toEqual([])
    await page.close()
  }, 60_000)

  it('answers /api/contact from src/forms with a dry run: the page sees a success, the message is only logged', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await visit(page, 'connected')
    await fill(page)
    await submit(page)
    await page.locator('[data-contact-success]').waitFor()
    expect(await page.locator('[data-contact-success]').innerText()).toContain('Thanks, we got it.')
    await waitFor(() => logs().includes('Dry run: nothing was sent'), 'the dry run was not logged')
    expect(logs()).toContain('BEARMINION_FORMS_LIVE=on')
    expect(logs()).toContain('ada@example.com')
    // The handler never ran.
    expect(fs.existsSync(calls)).toBe(false)
    expect(errors, logs()).toEqual([])
    await page.close()
  }, 60_000)

  it('has no form settings in the sidebar, only a note that the handler is custom code to check by hand', async () => {
    const page = await browser.newPage({ viewport: { width: 1700, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await openClean(page, '/editing')
    const toolbar = page.getByRole('toolbar', { name: 'Section' })
    await page.locator('[data-section-id="contact"] [data-field="sections.0.props.heading"]').click({ position: { x: 4, y: 4 } })
    await page.locator('[data-section-id="contact"]').hover()
    const form = page.locator('[data-editor-field="section:contact"]')
    if (!(await form.isVisible())) await toolbar.getByRole('button', { name: 'Settings', exact: true }).click()
    await form.waitFor()

    const note = form.locator('[data-form-handler="contact"]')
    await note.waitFor()
    expect(await note.innerText()).toContain('/api/contact')
    expect(await note.innerText()).toContain('cannot check')
    expect(await note.getAttribute('role')).toBe('status')
    expect(await note.getByRole('link', { name: 'How to set up a form' }).getAttribute('href')).toBe('https://docs.bearminion.com/forms')
    // The endpoint, the Turnstile key and the way of sending are not settings any more.
    expect(await form.getByRole('textbox', { name: /^Form endpoint/ }).count()).toBe(0)
    expect(await form.getByRole('textbox', { name: /Turnstile/ }).count()).toBe(0)
    expect(await page.getByRole('radiogroup', { name: 'Send as', exact: true }).count()).toBe(0)
    // The dev server found the handler, so it did not warn.
    expect(logs()).not.toContain('does not exist')
    expect(errors, logs()).toEqual([])
    await page.close()
  }, 90_000)
})
