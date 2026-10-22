import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'

const starter = path.resolve(import.meta.dirname, '../../templates/default')
const astroBin = path.join(starter, 'node_modules', 'astro', 'bin', 'astro.mjs')
const port = 4478
const origin = `http://127.0.0.1:${port}`

/** Runs a script once in the head (a hit counter) and leaves a mark, so the test can see whether it ran. */
const HEAD =
  '<script>window.__hits=(window.__hits||0)+1;document.documentElement.setAttribute("data-tracked","yes");document.cookie="_ga=1; path=/"</script>'
const BODY = '<div id="body-snippet">b</div>'

describe('cookie consent on a built site', () => {
  let browser: Browser
  let server: ChildProcess | undefined
  let root = ''
  let logs = ''
  let buildEnv: NodeJS.ProcessEnv = {}

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bearminion-consent-'))
    const contentDir = path.join(root, 'content')
    fs.cpSync(path.join(starter, 'content'), contentDir, { recursive: true })
    const sitePath = path.join(contentDir, 'site.json')
    const site = JSON.parse(fs.readFileSync(sitePath, 'utf8')) as Record<string, unknown>
    site.analytics = { head: HEAD, bodyEnd: BODY }
    site.consent = { policyHref: '/privacy' }
    fs.writeFileSync(sitePath, JSON.stringify(site, null, 2))
    const env: NodeJS.ProcessEnv = { ...process.env, BEARMINION_CONTENT_DIR: contentDir, BEARMINION_ANALYTICS: 'on' }
    buildEnv = env
    delete env.VITEST
    delete env.VITEST_POOL_ID
    delete env.VITEST_WORKER_ID
    execFileSync(process.execPath, [astroBin, 'build'], { cwd: starter, env, stdio: 'pipe' })
    server = spawn(process.execPath, [astroBin, 'preview', '--port', String(port), '--host', '127.0.0.1'], {
      cwd: starter,
      detached: true,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    server.stdout?.on('data', (chunk: Buffer) => {
      logs += chunk.toString()
    })
    server.stderr?.on('data', (chunk: Buffer) => {
      logs += chunk.toString()
    })
    await waitForServer()
    const executablePath = process.env.BEARMINION_E2E_CHROMIUM
    browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox', '--disable-gpu'] })
  }, 240_000)

  afterAll(async () => {
    await browser?.close()
    if (server?.pid) {
      try {
        process.kill(-server.pid, 'SIGTERM')
      } catch {
        server.kill('SIGTERM')
      }
    }
    if (root) fs.rmSync(root, { recursive: true, force: true })
  })

  async function state(page: Page) {
    return page.evaluate(() => {
      const banner = document.querySelector<HTMLElement>('[data-consent-banner]')
      const queue = ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? []).map((entry) => Array.from(entry))
      return {
        tracked: document.documentElement.getAttribute('data-tracked'),
        hits: (window as unknown as { __hits?: number }).__hits ?? 0,
        bodySnippet: document.querySelector('body > #body-snippet') !== null,
        bannerHidden: banner?.hidden ?? null,
        stored: localStorage.getItem('bm-consent'),
        cookies: document.cookie,
        queue,
      }
    })
  }

  it('holds the snippets back until the visitor accepts, and takes them away again on withdrawal', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(origin)

    // Before any choice: denied by default, nothing ran, the banner asks.
    let s = await state(page)
    expect(s.bannerHidden).toBe(false)
    expect(s.tracked).toBeNull()
    expect(s.hits).toBe(0)
    expect(s.bodySnippet).toBe(false)
    expect(s.queue[0]?.slice(0, 2)).toEqual(['consent', 'default'])
    expect(s.queue[0]?.[2]).toEqual({
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    })
    // The policy link is the one the site set.
    expect(await page.locator('[data-consent-banner] a').getAttribute('href')).toBe('/privacy')

    // Reject: still nothing, and the banner stays away after a reload.
    await page.locator('[data-consent-banner] [data-consent-reject]').click()
    s = await state(page)
    expect(s.bannerHidden).toBe(true)
    expect(s.tracked).toBeNull()
    expect(JSON.parse(s.stored ?? '{}').analytics).toBe(false)
    await page.reload()
    s = await state(page)
    expect(s.bannerHidden).toBe(true)
    expect(s.hits).toBe(0)

    // The footer link reopens it, and focus lands on it.
    await page.locator('[data-consent-open]').click()
    expect((await state(page)).bannerHidden).toBe(false)
    expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-consent-banner'))).toBe(true)

    // Accept: the snippets run once, after the consent update.
    await page.locator('[data-consent-banner] [data-consent-accept]').click()
    s = await state(page)
    expect(s.bannerHidden).toBe(true)
    expect(s.tracked).toBe('yes')
    expect(s.hits).toBe(1)
    expect(s.bodySnippet).toBe(true)
    const update = s.queue.findIndex(
      (entry) => entry[1] === 'update' && (entry[2] as { analytics_storage?: string }).analytics_storage === 'granted',
    )
    expect(update).toBeGreaterThan(0)
    await page.reload()
    s = await state(page)
    expect(s.hits).toBe(1)
    expect(s.bannerHidden).toBe(true)

    // Withdraw: the page reloads without the snippets and their cookies are gone.
    await page.locator('[data-consent-open]').click()
    const reloaded = page.waitForEvent('load')
    await page.locator('[data-consent-banner] [data-consent-reject]').click()
    await reloaded
    s = await state(page)
    expect(s.tracked).toBeNull()
    expect(s.hits).toBe(0)
    expect(s.cookies).not.toContain('_ga=')
    expect(errors, logs).toEqual([])
    await page.close()
  }, 60_000)

  it('asks again when the choice is old or unreadable', async () => {
    const page = await browser.newPage()
    await page.goto(origin)
    const day = 24 * 60 * 60 * 1000
    await page.evaluate(
      (age) => localStorage.setItem('bm-consent', JSON.stringify({ v: 1, analytics: true, at: Date.now() - age })),
      181 * day,
    )
    await page.reload()
    let s = await state(page)
    expect(s.bannerHidden).toBe(false)
    expect(s.hits).toBe(0)
    await page.evaluate(() => localStorage.setItem('bm-consent', '{broken'))
    await page.reload()
    s = await state(page)
    expect(s.bannerHidden).toBe(false)
    await page.close()
  }, 30_000)

  it('shows the banner and its flow with analytics off, and loads nothing', async () => {
    // A build that does not ship snippets (dev, previews): the preview server serves dist from disk.
    execFileSync(process.execPath, [astroBin, 'build'], { cwd: starter, env: { ...buildEnv, BEARMINION_ANALYTICS: 'off' }, stdio: 'pipe' })
    const page = await browser.newPage()
    await page.goto(origin)
    expect(await page.locator('template[data-consent-snippet]').count()).toBe(0)
    let s = await state(page)
    expect(s.bannerHidden).toBe(false)
    expect(s.queue).toEqual([])
    await page.locator('[data-consent-banner] [data-consent-accept]').click()
    s = await state(page)
    expect(s.bannerHidden).toBe(true)
    expect(s.tracked).toBeNull()
    expect(s.hits).toBe(0)
    expect(s.bodySnippet).toBe(false)
    expect(JSON.parse(s.stored ?? '{}').analytics).toBe(true)
    await page.locator('[data-consent-open]').click()
    expect((await state(page)).bannerHidden).toBe(false)
    await page.close()
  }, 120_000)

  it('can reopen the banner from a corner icon instead of the footer', async () => {
    const sitePath = path.join(String(buildEnv.BEARMINION_CONTENT_DIR), 'site.json')
    const site = JSON.parse(fs.readFileSync(sitePath, 'utf8')) as { consent: Record<string, unknown> }
    site.consent = { reopen: 'icon', settings: 'Cookie choices' }
    fs.writeFileSync(sitePath, JSON.stringify(site, null, 2))
    execFileSync(process.execPath, [astroBin, 'build'], { cwd: starter, env: buildEnv, stdio: 'pipe' })
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.goto(origin)
    const icon = page.locator('[data-consent-icon]')
    expect(await page.locator('footer [data-consent-open]').count()).toBe(0)
    // Banner open: no icon on top of it.
    expect(await icon.isVisible()).toBe(false)
    await page.locator('[data-consent-banner] [data-consent-reject]').click()
    await icon.waitFor({ state: 'visible' })
    expect(await icon.getAttribute('aria-label')).toBe('Cookie choices')
    const box = await icon.boundingBox()
    expect(box && box.x < 40 && box.y > 900 - 80).toBe(true)
    await icon.click()
    expect((await state(page)).bannerHidden).toBe(false)
    expect(await icon.isVisible()).toBe(false)
    await page.locator('[data-consent-banner] [data-consent-accept]').click()
    await icon.waitFor({ state: 'visible' })
    // The icon is the control that had focus, so focus returns to it.
    expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-consent-icon'))).toBe(true)
    await page.screenshot({ path: path.join(os.tmpdir(), 'consent-icon.png') })
    await page.close()
  }, 120_000)

  async function waitForServer(): Promise<void> {
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${origin}/`)
        if (response.ok) return
      } catch {
        // not up yet
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error(`preview did not start\n${logs}`)
  }
})
