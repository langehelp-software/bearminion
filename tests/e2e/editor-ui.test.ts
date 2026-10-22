import { spawn, type ChildProcess } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'

const starter = path.resolve(import.meta.dirname, '../../templates/default')
const port = 4477
const heading = 'Content lives in git now.'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

describe('editor overlay', () => {
  let browser: Browser
  let server: ChildProcess | undefined
  let contentDir = ''
  let uploadsDir = ''
  let logs = ''

  beforeAll(async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bearminion-e2e-'))
    contentDir = path.join(root, 'content')
    uploadsDir = path.join(starter, 'src', 'assets', 'e2e-uploads')
    fs.cpSync(path.join(starter, 'content'), contentDir, { recursive: true })
    fs.rmSync(uploadsDir, { recursive: true, force: true })
    fs.mkdirSync(uploadsDir, { recursive: true })
    const astroBin = path.join(starter, 'node_modules', 'astro', 'bin', 'astro.mjs')
    const env: NodeJS.ProcessEnv = { ...process.env, BEARMINION_CONTENT_DIR: contentDir, BEARMINION_UPLOADS_DIR: uploadsDir }
    delete env.VITEST
    delete env.VITEST_POOL_ID
    delete env.VITEST_WORKER_ID
    env.NODE_ENV = 'development'
    // `--ignore-lock` below keeps Astro 7 from moving the server to the background when it detects an agent,
    // and lets the test run next to your own `astro dev`.
    server = spawn(process.execPath, [astroBin, 'dev', '--port', String(port), '--host', '127.0.0.1', '--ignore-lock'], {
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
    await waitForHttp(`http://127.0.0.1:${port}/`, server, () => logs)
    // Playwright's own Chromium (`pnpm exec playwright install chromium`), or the binary in BEARMINION_E2E_CHROMIUM.
    const executablePath = process.env.BEARMINION_E2E_CHROMIUM
    browser = await chromium.launch({
      ...(executablePath ? { executablePath } : {}),
      args: ['--no-sandbox', '--disable-gpu'],
    })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    if (server?.pid) {
      try {
        process.kill(-server.pid, 'SIGTERM')
      } catch {
        server.kill('SIGTERM')
      }
    }
    if (contentDir) fs.rmSync(path.dirname(contentDir), { recursive: true, force: true })
    if (uploadsDir) fs.rmSync(uploadsDir, { recursive: true, force: true })
  })

  it('edits a hero title, adds a section, and uploads an image', async () => {
    // Wide enough that the hero image is not under the sidebar, which can stay open across the save reload.
    const page = await browser.newPage({ viewport: { width: 1700, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    // The upload at the end leaves the draft dirty, and a Vite reload can then raise a beforeunload prompt that
    // `page.close()` dismisses, or closes with the page, before `accept()` lands. That race is not a failure;
    // anything else still is.
    page.on('dialog', (dialog) => {
      dialog.accept().catch((error: unknown) => {
        const closed = error instanceof Error && /already handled|has been closed/.test(error.message)
        if (!closed && !page.isClosed()) throw error
      })
    })
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' })
    const editorButton = page.getByRole('button', { name: 'Editor', exact: true })
    await editorButton.waitFor()

    const title = page.locator('[data-section-id="hero"] [data-field="sections.0.props.heading"]')
    await title.click({ position: { x: 12, y: 8 } })
    await title.fill(heading)
    // A save reloads the page. Wait for that reload, or the next clicks land on the page it replaces.
    const reloaded = page.waitForEvent('load')
    await page.keyboard.press('Control+s')

    const indexPath = path.join(contentDir, 'pages', 'index.json')
    await waitFor(() => fs.readFileSync(indexPath, 'utf8').includes(heading), 'saved heading missing from index.json')
    await reloaded
    await page.locator('[data-field="sections.0.props.heading"]', { hasText: heading }).waitFor()

    // The section toolbar appears on hover.
    await page.locator('[data-section-id="hero"]').hover()
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Add below' }).click()
    await page.getByRole('listbox', { name: 'Add section' }).getByRole('button', { name: 'Call to action' }).click()
    await page.locator('[data-section-id="cta-2"]').waitFor()
    // Wait for the reload itself: the page before it already has data-bearminion-ready, so a click right after
    // the save can land on that page and be lost when it reloads.
    const reloadedAgain = page.waitForEvent('load')
    await page.keyboard.press('Control+s')
    await waitFor(() => fs.readFileSync(indexPath, 'utf8').includes('"id": "cta-2"'), 'added section missing from index.json')
    await reloadedAgain
    // The sidebar can stay open across the save reload, so wait for the editor itself, not its button.
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-bearminion-ready'))

    await page.locator('[data-section-id="hero"] [data-field="sections.0.props.image.alt"]').click()
    await page.locator('[data-editor-field="sections.0.props.image"]').waitFor()
    const upload = path.join(os.tmpdir(), 'bearminion-pixel.png')
    fs.writeFileSync(upload, png)
    await page.getByRole('dialog', { name: 'Choose image' }).getByRole('tab', { name: 'Upload' }).click()
    await page.getByLabel('Upload image').setInputFiles(upload)
    await waitFor(() => fs.readdirSync(uploadsDir).some((name) => name.endsWith('.png')), 'uploaded image missing from disk')
    await page.locator('[data-editor-field="sections.0.props.image"] img').waitFor()
    expect(errors, logs).toEqual([])
    await page.close()
  }, 90_000)

  it('renders rich text, switches a variant without reload, and edits an anchor', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' })
    const sub = page.locator('[data-section-id="hero"] [data-field="sections.0.props.sub"]')
    await sub.locator('strong').waitFor()
    expect(await sub.locator('strong').innerText()).toBe('one key phrase in bold')
    expect(await sub.locator('a').getAttribute('rel')).toContain('noopener')
    expect(await sub.innerText()).not.toContain('**')
    await shot(page, 'rich_text_rendered.png')

    await shot(page, 'variant_before.png')
    let navigated = false
    page.on('framenavigated', () => {
      navigated = true
    })
    await page.locator('[data-section-id="hero"]').click({ position: { x: 24, y: 80 } })
    await page.getByRole('button', { name: 'Editor', exact: true }).click()
    await page.getByRole('tab', { name: 'Section' }).click()
    await shot(page, 'anchor_field_sidebar.png')
    await page.getByRole('textbox', { name: /^Anchor/ }).fill('top')
    await page.locator('#top').waitFor()
    expect(await page.locator('#top').getAttribute('data-section-id')).toBe('hero')
    await choose(page, 'Variant', 'Centered')
    await page.locator('[data-section-id="hero"] .text-center').waitFor()
    expect(navigated).toBe(false)
    await shot(page, 'variant_after.png')
    await page.keyboard.press('Control+s')
    const indexPath = path.join(contentDir, 'pages', 'index.json')
    await waitFor(() => fs.readFileSync(indexPath, 'utf8').includes('"anchor": "top"'), 'anchor missing from index.json')
    expect(errors, logs).toEqual([])
    await page.close()
  }, 90_000)

  it('shows nested navigation and anchor choices in the link picker', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' })
    const desktopNav = page.locator('header nav[aria-label="Primary"]').first()
    // The starter's first header link has one child, "How it works".
    // Hidden until hover, so a CSS locator: getByRole skips hidden links.
    const nested = desktopNav.locator('a', { hasText: 'How it works' })
    // Wait rather than count once: the test before this one saves, and the dev server may still be settling.
    await nested.waitFor({ state: 'attached', timeout: 15_000 }).catch(async () => {
      throw new Error(`No "How it works" link in the header nav. The nav was:\n${await desktopNav.innerHTML().catch(() => '(no nav)')}`)
    })
    expect(await nested.count()).toBe(1)
    await desktopNav.getByRole('link', { name: /^Features/ }).hover()
    await nested.waitFor({ state: 'visible' })
    await shot(page, 'nested_nav_dropdown.png')
    await page.getByRole('button', { name: 'Editor', exact: true }).click()
    await page.getByRole('tab', { name: 'Navigation' }).click()
    await page.getByRole('combobox', { name: 'Link target' }).first().click()
    await page.getByRole('option', { name: '#features' }).first().waitFor()
    await page.getByRole('option', { name: '#pricing' }).first().waitFor()
    await shot(page, 'link_picker_anchors.png')
    await page.close()
  }, 90_000)

  it('renders a newly uploaded image without a reload', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' })
    await page.locator('[data-section-id="hero"] [data-field="sections.0.props.image.alt"]').click()
    const field = page.locator('[data-editor-field="sections.0.props.image"]')
    expect(await page.getByRole('tab', { name: 'Images' }).count()).toBe(0)
    const upload = path.join(os.tmpdir(), `bearminion-live-${Date.now()}.png`)
    fs.writeFileSync(upload, png)
    // Clicking the image on the page opens the picker straight away, without the sidebar.
    const picker = page.getByRole('dialog', { name: 'Choose image' })
    await picker.waitFor()
    expect(await field.isVisible()).toBe(false)
    await picker.getByRole('tab', { name: 'Upload' }).click()
    await picker.getByLabel('Upload image').setInputFiles(upload)
    await picker.waitFor({ state: 'detached' })
    await waitFor(() => fs.readdirSync(uploadsDir).some((name) => name.includes('bearminion-live-')), 'live upload missing from disk')
    const filename = fs.readdirSync(uploadsDir).find((name) => name.includes('bearminion-live-'))
    if (!filename) throw new Error('live upload missing from disk')
    const image = page.locator('[data-section-id="hero"] img')
    await image.waitFor({ state: 'visible' })
    expect(await image.getAttribute('src')).toMatch(/__bearminion\/assets|\/_image/)
    expect(await field.isVisible()).toBe(false)
    await page.getByRole('button', { name: 'Editor', exact: true }).click()
    await page.getByRole('tab', { name: 'Section' }).click()
    await field.waitFor()
    await shot(page, 'image_field.png')
    await field.getByRole('button', { name: 'Remove image' }).click()
    await image.waitFor({ state: 'detached' })
    await field.getByRole('button', { name: 'Add image' }).click()
    await picker.getByRole('tab', { name: 'Library' }).click()
    await picker.getByRole('button', { name: filename, exact: false }).first().click()
    await image.waitFor({ state: 'visible' })
    // The unsaved draft points at the upload, so the picker refuses to delete it and names where it is used.
    await field.getByRole('button', { name: 'Change image' }).click()
    await picker.getByRole('tab', { name: 'Library' }).click()
    await picker.getByRole('button', { name: `Delete ${filename}` }).click()
    await picker.getByRole('button', { name: 'Delete image' }).click()
    await picker.getByText(`${filename} is still used`, { exact: false }).waitFor()
    expect(fs.existsSync(path.join(uploadsDir, filename))).toBe(true)
    await page.keyboard.press('Escape')
    await picker.waitFor({ state: 'detached' })
    // Once the draft no longer uses it, the delete goes through.
    await field.getByRole('button', { name: 'Remove image' }).click()
    await image.waitFor({ state: 'detached' })
    await field.getByRole('button', { name: 'Add image' }).click()
    await picker.getByRole('tab', { name: 'Library' }).click()
    await picker.getByRole('button', { name: `Delete ${filename}` }).click()
    await picker.getByRole('button', { name: 'Delete image' }).click()
    await waitFor(() => !fs.existsSync(path.join(uploadsDir, filename)), 'deleted image still on disk')
    await picker.getByRole('button', { name: `Delete ${filename}` }).waitFor({ state: 'detached' })
    await page.keyboard.press('Escape')
    await picker.waitFor({ state: 'detached' })
    expect(errors, logs).toEqual([])
    await page.close()
  }, 90_000)

  it('sets fit and position from the bar over a hovered image', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await openClean(page)
    const image = page.locator('[data-section-id="hero"] img').first()
    // Earlier tests save the hero as `centered`, which puts the image below the fold.
    await image.scrollIntoViewIfNeeded()
    const box = await image.boundingBox()
    if (!box) throw new Error('hero image has no box')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    const bar = page.getByRole('toolbar', { name: 'Image layout' })
    await bar.waitFor()

    await bar.getByRole('button', { name: 'Contain' }).click()
    await waitForDraft(page, '"fit":"contain"')
    await page.waitForFunction(() => {
      const img = document.querySelector('[data-section-id="hero"] img')
      return img !== null && getComputedStyle(img).objectFit === 'contain'
    })

    // Nine separate 9px cells: none may cover a neighbour, or the corners cannot be clicked.
    const cells = bar.getByRole('group', { name: 'Image position' }).locator('button')
    const boxes = await cells.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON() as DOMRect))
    expect(boxes).toHaveLength(9)
    for (const [index, cell] of boxes.entries()) {
      expect(cell.width).toBeLessThanOrEqual(12)
      for (const other of boxes.slice(index + 1)) {
        const overlap = cell.left < other.right && other.left < cell.right && cell.top < other.bottom && other.top < cell.bottom
        expect(overlap).toBe(false)
      }
    }
    await shot(page, 'image_bar.png')
    await bar.getByRole('button', { name: 'Top left', exact: true }).click()
    await waitForDraft(page, '"position":"top left"')
    await page.waitForFunction(() => {
      const img = document.querySelector('[data-section-id="hero"] img')
      return img !== null && getComputedStyle(img).objectPosition === '0% 0%'
    })
    expect(errors, logs).toEqual([])
    await page.close()
  }, 60_000)

  it('treats the whole image frame as the slot, even with no image in it', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await openClean(page)
    // The text-and-image section ships with a placeholder: striped frame, small alt label in a corner.
    const frame = page.locator('[data-section-id="workflow"] [data-field$=".image.alt"]').first()
    await frame.scrollIntoViewIfNeeded()
    expect(await frame.evaluate((node) => node.tagName)).toBe('DIV')
    const box = await frame.boundingBox()
    if (!box) throw new Error('image frame has no box')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3)
    await page.locator('#bearminion-editor-host .bm-outline-field').waitFor()
    await shot(page, 'image_slot_hover.png')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 3)
    const picker = page.getByRole('dialog', { name: 'Choose image' })
    await picker.waitFor()
    await page.keyboard.press('Escape')
    await picker.waitFor({ state: 'detached' })
    expect(errors, logs).toEqual([])
    await page.close()
  }, 60_000)

  it('lists unsaved changes and saves page and site together from the review dialog', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await openClean(page)
    const heading = `Saved together ${Date.now()}`
    const siteUrl = `https://saved-${Date.now()}.example.com`
    const title = page.locator('[data-section-id="hero"] [data-field="sections.0.props.heading"]')
    await title.click()
    await title.fill(heading)
    await page.getByRole('button', { name: 'Editor', exact: true }).click()
    await page.getByRole('tab', { name: 'Site' }).click()
    await page.getByRole('tabpanel', { name: 'Site' }).getByLabel('URL').fill(siteUrl)
    await page.getByRole('button', { name: 'Unsaved' }).click()
    const dialog = page.getByRole('dialog', { name: 'Unsaved changes' })
    await dialog.waitFor()
    await dialog.getByText(heading).waitFor()
    await dialog.getByText(siteUrl).waitFor()
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await page.waitForLoadState('networkidle')
    const indexPath = path.join(contentDir, 'pages', 'index.json')
    const sitePath = path.join(contentDir, 'site.json')
    await waitFor(() => fs.readFileSync(indexPath, 'utf8').includes(heading), 'page heading was not saved')
    await waitFor(() => fs.readFileSync(sitePath, 'utf8').includes(siteUrl), 'site url was not saved')
    expect(page.url()).toMatch(/127\.0\.0\.1:4477\/?$/)
    await page.close()
  }, 90_000)

  it('discards unsaved changes from the save menu', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await openClean(page)
    const title = page.locator('[data-section-id="hero"] [data-field="sections.0.props.heading"]')
    const original = (await title.textContent()) ?? ''
    await title.click()
    await title.fill(`Throwaway ${Date.now()}`)
    await page.getByRole('button', { name: 'Editor', exact: true }).click()
    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'Discard changes…' }).click()
    await page.getByRole('alertdialog', { name: 'Discard changes' }).getByRole('button', { name: 'Discard' }).click()
    await page.waitForLoadState('networkidle')
    await page
      .locator('[data-section-id="hero"] [data-field="sections.0.props.heading"]')
      .filter({ hasText: original.trim().slice(0, 12) })
      .waitFor()
    await page.close()
  }, 90_000)

  it('undoes and redoes a text edit from the save menu', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await openClean(page)
    const title = page.locator('[data-section-id="hero"] [data-field="sections.0.props.heading"]')
    const original = ((await title.textContent()) ?? '').trim()
    const edited = `Undo me ${Date.now()}`
    await title.click()
    await title.fill(edited)
    await page.getByRole('button', { name: 'Editor', exact: true }).click()
    await page.getByRole('button', { name: 'More actions' }).click()
    // The step is recorded once typing pauses, so the item enables a moment after the edit.
    await page.getByRole('menuitem', { name: 'Undo' }).click({ timeout: 5000 })
    await page
      .locator('[data-section-id="hero"] [data-field="sections.0.props.heading"]')
      .filter({ hasText: original.slice(0, 10) })
      .waitFor()
    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'Redo' }).click({ timeout: 5000 })
    await page.locator('[data-section-id="hero"] [data-field="sections.0.props.heading"]').filter({ hasText: edited }).waitFor()
    await page.close()
  }, 90_000)

  it('does not reload when save fails validation', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await openClean(page)
    await page.getByRole('button', { name: 'Editor', exact: true }).click()
    await page.getByRole('tab', { name: 'Site' }).click()
    await page.getByRole('tabpanel', { name: 'Site' }).getByLabel('URL').fill('not a url')
    await page.getByRole('button', { name: 'Unsaved' }).click()
    await page.getByRole('dialog', { name: 'Unsaved changes' }).getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByText('url: Invalid URL').waitFor()
    expect(page.url()).toMatch(/127\.0\.0\.1:4477\/?$/)
    expect(fs.readFileSync(path.join(contentDir, 'site.json'), 'utf8')).not.toContain('not a url')
    await page.close()
  }, 90_000)

  it('removes a button and an emptied text from the page and from the file', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const indexPath = path.join(contentDir, 'pages', 'index.json')
    const original = fs.readFileSync(indexPath, 'utf8')
    try {
      await openClean(page)
      const hero = page.locator('[data-section-id="hero"]')
      await hero.locator('[data-field="sections.0.props.primary.label"]').waitFor()
      await hero.click({ position: { x: 24, y: 80 } })
      await page.getByRole('button', { name: 'Editor', exact: true }).click()
      await page.getByRole('tab', { name: 'Section' }).click()
      await page.getByRole('button', { name: 'Remove primary' }).click()
      await page.getByRole('textbox', { name: /^Eyebrow/ }).fill('')
      await hero.locator('[data-field="sections.0.props.primary.label"]').waitFor({ state: 'detached' })
      await hero.locator('[data-field="sections.0.props.eyebrow"]').waitFor({ state: 'detached' })
      await page.getByRole('button', { name: 'Add primary' }).waitFor()
      // A save reloads the page. Wait for that reload, or the next clicks land on the page it replaces.
      const reloaded = page.waitForEvent('load')
      await page.keyboard.press('Control+s')
      await waitFor(() => {
        const hero0 = (JSON.parse(fs.readFileSync(indexPath, 'utf8')) as { sections: { props: Record<string, unknown> }[] }).sections[0]
        return hero0?.props.primary === undefined
      }, 'removed button still in index.json')
      const saved = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as { sections: { props: Record<string, unknown> }[] }
      expect(saved.sections[0]?.props.eyebrow).toBeUndefined()
      expect(saved.sections[0]?.props.secondary).toBeDefined()
      await reloaded
      await page.waitForFunction(() => document.documentElement.hasAttribute('data-bearminion-ready'))
      // The sidebar can come back open on the Section tab; select the hero and open it either way.
      await hero.click({ position: { x: 24, y: 80 } })
      const sectionTab = page.getByRole('tab', { name: 'Section' })
      if (!(await sectionTab.isVisible())) await page.getByRole('button', { name: 'Editor', exact: true }).click()
      await sectionTab.click()
      await page.getByRole('button', { name: 'Add primary' }).click()
      await hero.locator('[data-field="sections.0.props.primary.label"]').waitFor()
    } finally {
      fs.writeFileSync(indexPath, original)
      await page.close()
    }
  }, 90_000)

  it('discards a dirty draft when opening another page', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await openClean(page)
    const heading = `Discard me ${Date.now()}`
    const title = page.locator('[data-section-id="hero"] [data-field="sections.0.props.heading"]')
    await title.click()
    await title.fill(heading)
    await page.getByRole('button', { name: 'Editor', exact: true }).click()
    await page.getByRole('tab', { name: 'Pages' }).click()
    await page.getByRole('tabpanel').getByRole('link', { name: 'About' }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Unsaved changes' })
    await dialog.waitFor()
    await dialog.getByRole('button', { name: 'Discard', exact: true }).click()
    await page.waitForURL(/\/about\/?$/)
    expect(fs.readFileSync(path.join(contentDir, 'pages', 'index.json'), 'utf8')).not.toContain(heading)
    await page.close()
  }, 90_000)

  it('cancels navigation away from a dirty draft', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await openClean(page)
    const heading = `Keep me ${Date.now()}`
    const title = page.locator('[data-section-id="hero"] [data-field="sections.0.props.heading"]')
    await title.click()
    await title.fill(heading)
    await page.getByRole('button', { name: 'Editor', exact: true }).click()
    await page.getByRole('tab', { name: 'Pages' }).click()
    await page.getByRole('tabpanel').getByRole('link', { name: 'About' }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Unsaved changes' })
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dialog.waitFor({ state: 'hidden' })
    expect(page.url()).toMatch(/127\.0\.0\.1:4477\/?$/)
    expect(await title.innerText()).toContain(heading)
    expect(fs.readFileSync(path.join(contentDir, 'pages', 'index.json'), 'utf8')).not.toContain(heading)
    await page.close()
  }, 90_000)

  it('restores a local draft in a new browser context', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    await openClean(page)
    const heading = `Restored ${Date.now()}`
    const title = page.locator('[data-section-id="hero"] [data-field="sections.0.props.heading"]')
    await title.click()
    await title.fill(heading)
    await waitForDraft(page, heading)
    const state = await context.storageState()
    await page.close()
    const next = await browser.newContext({ storageState: state, viewport: { width: 1280, height: 900 } })
    const restored = await next.newPage()
    await restored.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' })
    const banner = restored.getByRole('status', { name: 'Unsaved draft' })
    await banner.getByText(/Unsaved changes from /).waitFor()
    await banner.getByRole('button', { name: 'Restore' }).click()
    await restored.locator('[data-section-id="hero"] [data-field="sections.0.props.heading"]', { hasText: heading }).waitFor()
    expect(fs.readFileSync(path.join(contentDir, 'pages', 'index.json'), 'utf8')).not.toContain(heading)
    await context.close()
    await next.close()
  }, 90_000)

  it('discards a stored draft without writing it', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await openClean(page)
    const heading = `Discard draft ${Date.now()}`
    const title = page.locator('[data-section-id="hero"] [data-field="sections.0.props.heading"]')
    await title.click()
    await title.fill(heading)
    await waitForDraft(page, heading)
    await page.reload({ waitUntil: 'load' })
    const banner = page.getByRole('status', { name: 'Unsaved draft' })
    await banner.getByRole('button', { name: 'Discard' }).click()
    await banner.waitFor({ state: 'hidden' })
    await page.locator('[data-section-id="hero"] [data-field="sections.0.props.heading"]', { hasText: heading }).waitFor({
      state: 'hidden',
    })
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage).some(
          (key) => key.includes(':page:') && !key.endsWith(':saved') && localStorage.getItem(key)?.includes('Discard draft'),
        ),
      ),
    ).toBe(false)
    expect(fs.readFileSync(path.join(contentDir, 'pages', 'index.json'), 'utf8')).not.toContain(heading)
    await page.close()
  }, 90_000)

  it('warns when the file changed since the draft and still restores it', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    await openClean(page)
    const heading = `Conflict ${Date.now()}`
    const title = page.locator('[data-section-id="hero"] [data-field="sections.0.props.heading"]')
    await title.click()
    await title.fill(heading)
    await waitForDraft(page, heading)
    const indexPath = path.join(contentDir, 'pages', 'index.json')
    const disk = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as {
      sections: { props: { heading?: string; marks?: unknown } }[]
    }
    // Another writer changes the heading. Its marks style ranges of the old heading and would fall outside the new
    // one, which the schema rejects, so they go with it; otherwise the dev server refuses the file.
    const diskHeading = `On disk ${Date.now()}`
    disk.sections[0]!.props.heading = diskHeading
    delete disk.sections[0]!.props.marks
    fs.writeFileSync(indexPath, `${JSON.stringify(disk, null, 2)}\n`)
    const state = await context.storageState()
    await page.close()
    // The dev server reloads open pages once it has synced the changed file. Wait until it serves the new heading,
    // so that reload cannot land after Restore and replace the restored draft.
    await waitForServed('/', diskHeading)
    const next = await browser.newContext({ storageState: state, viewport: { width: 1280, height: 900 } })
    const restored = await next.newPage()
    await restored.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' })
    const banner = restored.getByRole('status', { name: 'Unsaved draft' })
    await banner.getByText('The file on disk has changed since this draft.').waitFor()
    await banner.getByRole('button', { name: 'Restore' }).click()
    await restored.locator('[data-section-id="hero"] [data-field="sections.0.props.heading"]', { hasText: heading }).waitFor()
    await context.close()
    await next.close()
  }, 90_000)

  it('clears the stored draft after a successful save', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await openClean(page)
    const heading = `Saved draft ${Date.now()}`
    const title = page.locator('[data-section-id="hero"] [data-field="sections.0.props.heading"]')
    await title.click()
    await title.fill(heading)
    await waitForDraft(page, heading)
    await page.keyboard.press('Control+s')
    await waitFor(() => fs.readFileSync(path.join(contentDir, 'pages', 'index.json'), 'utf8').includes(heading), 'saved heading missing')
    await page.waitForFunction(
      (value) =>
        !Object.keys(localStorage).some(
          (key) => key.includes(':page:') && !key.endsWith(':saved') && (localStorage.getItem(key)?.includes(value) ?? false),
        ),
      heading,
    )
    await page.close()
  }, 90_000)

  it('warns when another tab saves the page', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    const other = await context.newPage()
    await openClean(page)
    await openClean(other)
    const heading = `Other tab ${Date.now()}`
    const title = page.locator('[data-section-id="hero"] [data-field="sections.0.props.heading"]')
    await title.click()
    await title.fill(heading)
    await page.keyboard.press('Control+s')
    await waitFor(() => fs.readFileSync(path.join(contentDir, 'pages', 'index.json'), 'utf8').includes(heading), 'other tab save missing')
    await other.getByRole('status', { name: 'Saved in another tab' }).getByText('Another tab saved this page.').waitFor()
    await context.close()
  }, 90_000)

  it('creates, edits, and renders a rich text list, and strips pasted headings and images', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await openClean(page)
    const sub = page.locator('[data-section-id="hero"] [data-field="sections.0.props.sub"]')
    await sub.click()
    // Start from an empty field: the click lands mid-sentence, and the list would wrap the placeholder copy around it.
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('Backspace')
    await page.getByRole('button', { name: 'Bulleted list' }).click()
    await page.keyboard.type('Alpha')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Beta')
    await expectList(sub, 'Alpha', 'Beta')
    // A save reloads the page. Wait for that reload, or the paste below lands on the page it replaces.
    const reloaded = page.waitForEvent('load')
    await page.keyboard.press('Control+s')
    const indexPath = path.join(contentDir, 'pages', 'index.json')
    await waitFor(() => fs.readFileSync(indexPath, 'utf8').includes('- Alpha'), 'bullet list was not saved')
    await reloaded
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-bearminion-ready'))
    await page.locator('[data-section-id="hero"] ul li', { hasText: 'Alpha' }).waitFor()
    await page.locator('[data-section-id="hero"] ul li', { hasText: 'Beta' }).waitFor()

    await sub.click()
    await page.keyboard.press('Control+a')
    await page.evaluate(() => {
      const field = document.querySelector('[data-section-id="hero"] [data-field="sections.0.props.sub"]')
      if (!(field instanceof HTMLElement)) throw new Error('rich field missing')
      field.focus()
      const data = new DataTransfer()
      data.setData('text/html', '<h2>Nope</h2><p>Keep me</p><img src="/x.png" alt="pic"><ul><li>Listed</li></ul>')
      data.setData('text/plain', '# Nope\nKeep me\n![pic](/x.png)\n- Listed')
      const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', { value: data })
      field.dispatchEvent(event)
    })
    expect(await sub.locator('h1, h2, h3, img').count()).toBe(0)
    expect(await sub.innerText()).toContain('Keep me')
    expect(await sub.innerText()).toContain('Listed')
    expect(await sub.innerText()).not.toContain('Nope')
    expect(await sub.innerText()).not.toContain('pic')
    await page.close()
  }, 90_000)

  it('uses an icon toolbar with the section name and confirms duplicate and delete', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await openClean(page)
    await page.locator('[data-section-id="hero"]').click({ position: { x: 24, y: 80 } })
    const toolbar = page.getByRole('toolbar', { name: 'Section' })
    await toolbar.waitFor()
    expect(await toolbar.getByRole('button').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')))).toEqual([
      'Move up',
      'Move down',
      'Add',
      'Duplicate',
      'Settings',
      'Delete',
    ])
    expect(await toolbar.locator('svg').count()).toBe(6)
    for (const label of ['Move up', 'Move down', 'Add', 'Duplicate', 'Settings', 'Delete']) {
      expect(await toolbar.getByRole('button', { name: label, exact: true }).getAttribute('title')).toBe(label)
    }
    const name = toolbar.locator('.bm-toolbar-name')
    expect(await name.innerText()).toMatch(/^Hero · #/)
    expect(await name.getAttribute('title')).toBe(await name.innerText())
    expect(await toolbar.getByRole('button', { name: 'Move up', exact: true }).isDisabled()).toBe(true)
    await page.locator('[data-section-id="contact"]').click({ position: { x: 24, y: 140 } })
    await toolbar.getByRole('button', { name: 'Move down', exact: true }).waitFor()
    expect(await toolbar.getByRole('button', { name: 'Move down', exact: true }).isDisabled()).toBe(true)

    await page.locator('[data-section-id="hero"]').click({ position: { x: 24, y: 80 } })
    await toolbar.getByRole('button', { name: 'Add', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Add above' }).click()
    await page.getByRole('listbox', { name: 'Add section' }).getByRole('button', { name: 'Logo strip' }).click()
    await page.locator('[data-section-id="logoStrip"]').waitFor()

    await page.locator('[data-section-id="hero"]').click({ position: { x: 24, y: 80 } })
    await toolbar.getByRole('button', { name: 'Duplicate', exact: true }).click()
    const duplicate = page.getByRole('alertdialog', { name: 'Duplicate section' })
    await duplicate.waitFor()
    await page.waitForFunction(() => {
      const active = document.getElementById('bearminion-editor-host')?.shadowRoot?.activeElement
      return active instanceof HTMLButtonElement && active.textContent?.trim() === 'Duplicate'
    })
    await page.keyboard.press('Escape')
    await duplicate.waitFor({ state: 'hidden' })
    expect(await page.locator('[data-section-id="hero-2"]').count()).toBe(0)

    await toolbar.getByRole('button', { name: 'Duplicate', exact: true }).click()
    await duplicate.getByRole('button', { name: 'Duplicate' }).click()
    await page.locator('[data-section-id="hero-2"]').waitFor()

    await page.locator('[data-section-id="hero-2"]').click({ position: { x: 24, y: 140 } })
    await toolbar.getByRole('button', { name: 'Delete', exact: true }).click()
    const remove = page.getByRole('alertdialog', { name: 'Delete section' })
    await remove.getByRole('button', { name: 'Cancel' }).click()
    expect(await page.locator('[data-section-id="hero-2"]').count()).toBe(1)
    await toolbar.getByRole('button', { name: 'Delete', exact: true }).click()
    await remove.getByRole('button', { name: 'Delete' }).click()
    await page.locator('[data-section-id="hero-2"]').waitFor({ state: 'detached' })

    await page.locator('[data-section-id="hero"]').click({ position: { x: 24, y: 80 } })
    await toolbar.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('tab', { name: 'Section', selected: true }).waitFor()
    await page.locator('[data-editor-field="section:hero"]').waitFor()
    await shot(page, 'section_toolbar.png')
    await page.close()
  }, 90_000)

  it('keeps the section toolbar inset from its section corner and scrolls it away with the section', async () => {
    const inset = 8
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await openClean(page)
    const hero = page.locator('[data-section-id="hero"]')
    await hero.click({ position: { x: 24, y: 160 } })
    const toolbar = page.getByRole('toolbar', { name: 'Section' })
    await toolbar.waitFor()

    const read = () =>
      page.evaluate(() => {
        const bar = document.getElementById('bearminion-editor-host')?.shadowRoot?.querySelector('[role="toolbar"][aria-label="Section"]')
        const section = document.querySelector('[data-section-id="hero"]')
        if (!(bar instanceof HTMLElement) || !(section instanceof HTMLElement)) return null
        const barBox = bar.getBoundingClientRect()
        const sectionBox = section.getBoundingClientRect()
        return { top: barBox.top, left: barBox.left, right: barBox.right, sectionTop: sectionBox.top, sectionLeft: sectionBox.left }
      })

    // The bar sits `inset` px inside the section's top-left corner.
    const glued = await read()
    if (!glued) throw new Error('toolbar metrics missing')
    expect(Math.abs(glued.top - (glued.sectionTop + inset))).toBeLessThan(2)
    expect(Math.abs(glued.left - (glued.sectionLeft + inset))).toBeLessThan(2)

    // It is not pinned under the header: once the section's top edge is gone, so is the bar.
    await page.evaluate(() => {
      const section = document.querySelector('[data-section-id="hero"]')
      if (!(section instanceof HTMLElement)) return
      window.scrollTo(0, section.getBoundingClientRect().bottom + window.scrollY + 8)
    })
    await toolbar.waitFor({ state: 'hidden' })

    await page.evaluate(() => window.scrollTo(0, 0))
    await toolbar.waitFor()
    const restored = await read()
    if (!restored) throw new Error('restored toolbar metrics missing')
    expect(Math.abs(restored.top - (restored.sectionTop + inset))).toBeLessThan(2)

    // Hovering another section moves the bar to it.
    await page.evaluate(() => {
      const section = document.querySelector('[data-section-id="features"]')
      if (section instanceof HTMLElement) section.scrollIntoView({ block: 'start', behavior: 'instant' })
    })
    const features = await page.evaluate(() => {
      const section = document.querySelector('[data-section-id="features"]')
      if (!(section instanceof HTMLElement)) return null
      const box = section.getBoundingClientRect()
      return { x: Math.max(24, box.left + 40), y: Math.max(box.top, 0) + 120 }
    })
    if (!features) throw new Error('features box missing')
    await page.mouse.move(features.x, features.y)
    await page.waitForFunction(() => {
      const name = document.getElementById('bearminion-editor-host')?.shadowRoot?.querySelector('.bm-toolbar-name')
      return name?.textContent?.includes('Features') ?? false
    })

    // An open sidebar pulls the bar's right edge in with the page content.
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.getByRole('button', { name: 'Editor', exact: true }).click()
    await page.getByRole('separator', { name: 'Resize sidebar' }).waitFor()
    await hero.hover({ position: { x: 24, y: 160 } })
    await toolbar.waitFor()
    const withSidebar = await read()
    if (!withSidebar) throw new Error('sidebar toolbar metrics missing')
    const width = Number(await page.getByRole('separator', { name: 'Resize sidebar' }).getAttribute('aria-valuenow'))
    expect(withSidebar.right).toBeLessThanOrEqual(1280 - width + 1)
    expect(Math.abs(withSidebar.left - (withSidebar.sectionLeft + inset))).toBeLessThan(2)
    await page.getByRole('separator', { name: 'Resize sidebar' }).focus()
    await page.keyboard.press('ArrowLeft')
    await page.waitForFunction(
      () =>
        document.getElementById('bearminion-editor-host')?.shadowRoot?.querySelector('[role=separator]')?.getAttribute('aria-valuenow') ===
        '456',
    )
    const resized = await read()
    if (!resized) throw new Error('resized toolbar metrics missing')
    expect(resized.right).toBeLessThanOrEqual(1280 - 456 + 1)
    await page.close()
  }, 90_000)

  it('formats a heading word and edits a button link', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await openClean(page)
    await page.goto(`http://127.0.0.1:${port}/about`, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-bearminion-ready'))
    const title = page.locator('[data-section-id="intro"] [data-field$=".heading"]')
    await title.locator('.bm-em', { hasText: 'work' }).waitFor()
    await page.evaluate(() => {
      const field = document.querySelector('[data-section-id="intro"] [data-field$=".heading"]')
      if (!(field instanceof HTMLElement)) return
      const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node) {
        const text = node.textContent ?? ''
        const at = text.indexOf('work')
        if (at >= 0) {
          const range = document.createRange()
          range.setStart(node, at)
          range.setEnd(node, at + 'work'.length)
          const selection = document.getSelection()
          selection?.removeAllRanges()
          selection?.addRange(range)
          document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
          return
        }
        node = walker.nextNode()
      }
    })
    const format = page.getByRole('toolbar', { name: 'Heading format' })
    await format.waitFor()
    await shot(page, 'heading_format_bar.png')
    await format.getByRole('button', { name: 'Mono', exact: true }).click()
    await title.locator('.font-mono', { hasText: 'work' }).waitFor()

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' })

    await page.locator('[data-section-id="hero"] [data-field="sections.0.props.primary.label"]').click()
    const dialog = page.getByRole('dialog', { name: 'Edit link' })
    await dialog.waitFor()
    await shot(page, 'link_popover.png')
    await dialog.getByLabel('Open in new window').check()
    await openAdvanced(dialog)
    await dialog.getByLabel('ID').fill('get-starter')
    expect(await dialog.getByLabel('Analytics').count()).toBe(0)
    await dialog.getByRole('button', { name: 'Apply' }).click()
    const cta = page.locator('[data-section-id="hero"] [data-field="sections.0.props.primary.label"]')
    await page.waitForFunction(() => {
      const node = document.querySelector('[data-section-id="hero"] [data-field$=".primary.label"]')
      return node instanceof HTMLElement && node.id === 'get-starter' && node.getAttribute('target') === '_blank'
    })
    expect(await cta.getAttribute('target')).toBe('_blank')
    expect(await cta.getAttribute('rel')).toContain('noopener')
    expect(await cta.getAttribute('id')).toBe('get-starter')

    await page.locator('[data-section-id="hero"] [data-field="sections.0.props.primary.label"]').click()
    await openAdvanced(dialog)
    await dialog.getByLabel('ID').fill('features')
    await dialog.getByRole('button', { name: 'Apply' }).click()
    await page.keyboard.press('Control+s')
    await page.getByText('Link id "features" collides with section anchor "features"').waitFor()
    await page.close()
  }, 90_000)

  it('removes an optional button from its edit popover', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await openClean(page)
    const label = page.locator('[data-section-id="hero"] [data-field="sections.0.props.primary.label"]')
    await label.click()
    const dialog = page.getByRole('dialog', { name: 'Edit link' })
    await dialog.waitFor()
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })
    await label.waitFor({ state: 'detached' })
    await page.close()
  }, 60_000)

  it('previews the Design tab palette live on the page', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await openClean(page)
    await page.getByRole('button', { name: 'Editor', exact: true }).click()
    await page.getByRole('tab', { name: 'Design' }).click()
    const hex = page.getByLabel('Brand hex')
    await hex.fill('#1d4ed8')
    await page.waitForFunction(() => document.getElementById('bm-theme')?.textContent?.includes('--t-base-accent'))
    const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--t-base-accent').trim())
    expect(accent).toMatch(/^oklch\(0\.4\d+ /)
    await page.getByRole('button', { name: 'Reset brand color' }).click()
    await page.waitForFunction(() => document.getElementById('bm-theme')?.textContent === '')
    await page.close()
  }, 60_000)

  it('opens the footer settings from the footer bar', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await openClean(page)
    await page.locator('[data-organism="footer"]').scrollIntoViewIfNeeded()
    await page.getByRole('toolbar', { name: 'Footer' }).getByRole('button', { name: 'Footer settings' }).click()
    expect(await page.getByRole('tab', { name: 'Footer' }).getAttribute('aria-selected')).toBe('true')
    await page.close()
  }, 60_000)

  it('offers a name or logo image for the brand, with a height slider', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await openClean(page)
    await page.getByRole('button', { name: 'Editor', exact: true }).click()
    await page.getByRole('tab', { name: 'Navigation' }).click()
    await page.getByRole('radio', { name: 'Logo image' }).click()
    await page.locator('[data-editor-field="brandLogo"]').waitFor()
    const slider = page.getByRole('slider', { name: 'Logo height' })
    await slider.fill('40')
    expect(await page.getByText('40 px').count()).toBeGreaterThan(0)
    await page.getByRole('radio', { name: 'Name' }).click()
    await page.locator('[data-editor-field="brandLogo"]').waitFor({ state: 'detached' })
    await page.close()
  }, 60_000)

  it('hides all editor chrome in preview and returns with the bubble or Esc', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await openClean(page)
    await page.getByRole('button', { name: 'Editor', exact: true }).click()
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    const exit = page.getByRole('button', { name: 'Exit preview' })
    await exit.waitFor()
    expect(await page.getByRole('toolbar').count()).toBe(0)
    expect(await page.getByRole('complementary', { name: 'BearMinion editor' }).count()).toBe(0)
    await exit.click()
    await page.getByRole('tab', { name: 'Pages' }).waitFor()
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    await exit.waitFor()
    await page.keyboard.press('Escape')
    await exit.waitFor({ state: 'detached' })
    await page.close()
  }, 60_000)

  it('remembers a clamped sidebar width', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await openClean(page)
    await page.getByRole('button', { name: 'Editor', exact: true }).click()
    const handle = page.getByRole('separator', { name: 'Resize sidebar' })
    await handle.focus()
    await page.keyboard.press('ArrowLeft')
    expect(await handle.getAttribute('aria-valuenow')).toBe('456')
    await page.keyboard.press('End')
    expect(Number(await handle.getAttribute('aria-valuenow'))).toBeLessThanOrEqual(512)
    await handle.dblclick()
    expect(await handle.getAttribute('aria-valuenow')).toBe('440')
    await page.keyboard.press('ArrowLeft')
    await page.waitForFunction(
      () =>
        document.getElementById('bearminion-editor-host')?.shadowRoot?.querySelector('[role=separator]')?.getAttribute('aria-valuenow') ===
        '456',
    )
    await shot(page, 'sidebar_resized.png')
    await page.reload({ waitUntil: 'networkidle' })
    // The sidebar was open before the reload, so it comes back open.
    await page.getByRole('separator', { name: 'Resize sidebar' }).waitFor()
    expect(await page.getByRole('separator', { name: 'Resize sidebar' }).getAttribute('aria-valuenow')).toBe('456')
    await page.setViewportSize({ width: 700, height: 800 })
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('separator', { name: 'Resize sidebar' }).waitFor()
    expect(await page.getByRole('separator', { name: 'Resize sidebar' }).getAttribute('aria-valuenow')).toBe('280')
    await page.close()
  }, 90_000)

  it('keeps the sidebar open on its last tab across a reload, and starts on Pages after a close', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await openClean(page)
    await page.getByRole('button', { name: 'Editor', exact: true }).click()
    expect(await page.getByRole('tab', { name: 'Pages' }).getAttribute('aria-selected')).toBe('true')
    await page.getByRole('tab', { name: 'Site' }).click()
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('separator', { name: 'Resize sidebar' }).waitFor()
    expect(await page.getByRole('tab', { name: 'Site' }).getAttribute('aria-selected')).toBe('true')
    await page.getByRole('button', { name: 'Close sidebar' }).click()
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Editor', exact: true }).waitFor()
    expect(await page.getByRole('separator', { name: 'Resize sidebar' }).count()).toBe(0)
    await page.getByRole('button', { name: 'Editor', exact: true }).click()
    expect(await page.getByRole('tab', { name: 'Pages' }).getAttribute('aria-selected')).toBe('true')
    await page.close()
  }, 90_000)

  it('paints stats labels with the section tone', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.goto(`http://127.0.0.1:${port}/variants`, { waitUntil: 'load' })
    const row = page.locator('#stats-row')
    const split = page.locator('#stats-split')
    await row.waitFor()
    await split.scrollIntoViewIfNeeded()
    const tone = async (root: ReturnType<Page['locator']>, selector: string) =>
      root
        .locator(selector)
        .first()
        .evaluate((node) => getComputedStyle(node).color)
    const baseLabel = await tone(row, 'dt')
    const inverseLabel = await tone(split, 'dt')
    const inverseValue = await tone(split, 'dd')
    expect(inverseLabel).not.toBe(baseLabel)
    expect(inverseValue).not.toBe(baseLabel)
    const light = (color: string) => {
      const oklch = /oklch\(\s*([\d.]+)/.exec(color)
      if (oklch?.[1]) return Number(oklch[1]) >= 0.7
      const match = color.match(/[\d.]+/g)?.map(Number) ?? []
      return (match[0] ?? 0) > 160 && (match[1] ?? 0) > 160 && (match[2] ?? 0) > 160
    }
    expect(light(inverseLabel)).toBe(true)
    expect(light(inverseValue)).toBe(true)
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' })
    const home = page.locator('[data-section-id="stats"]')
    await home.scrollIntoViewIfNeeded()
    const homeLabel = await tone(home, 'dt')
    expect(light(homeLabel)).toBe(true)
    await page.close()
  }, 90_000)

  it('adds a video section as an empty frame and plays the file linked in its settings', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await openClean(page)
    const toolbar = page.getByRole('toolbar', { name: 'Section' })
    await page.locator('[data-section-id="hero"]').click({ position: { x: 24, y: 80 } })
    await toolbar.getByRole('button', { name: 'Add', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Add below' }).click()
    await page.getByRole('listbox', { name: 'Add section' }).getByRole('button', { name: 'Video', exact: true }).click()
    const section = page.locator('[data-section-id="video"]')
    const empty = section.getByText('Add a video link in the section settings')
    await empty.waitFor()
    expect(await section.locator('video').count()).toBe(0)

    // The frame's middle: the section's top edge can sit under the sticky header, depending on what is above it.
    await empty.click()
    // A click selects the section; the sidebar may already be open on it, otherwise Settings opens it.
    const form = page.locator('[data-editor-field="section:video"]')
    if (!(await form.isVisible())) await toolbar.getByRole('button', { name: 'Settings', exact: true }).click()
    await form.waitFor()
    await page.getByLabel('Video', { exact: true }).fill('/videos/demo.webm')
    const video = section.locator('video')
    await video.waitFor({ state: 'attached' })
    expect(await video.getAttribute('src')).toBe('/videos/demo.webm')
    expect(await video.getAttribute('aria-label')).toBe('Product walkthrough')
    expect(await video.evaluate((node) => (node as HTMLVideoElement).controls)).toBe(true)

    // A looping video is muted and bound by the page script, which takes its controls away while it plays. The file
    // here does not exist, so play() fails once it is on screen and the controls come back; that is not checked.
    await choose(page, 'Playback', 'Loop')
    await section.locator('video[data-video-loop]').waitFor({ state: 'attached' })
    await page.waitForFunction(() => {
      const node = document.querySelector('[data-section-id="video"] video')
      return node instanceof HTMLVideoElement && node.muted && node.loop && node.dataset.bound === 'true'
    })
    expect(errors, logs).toEqual([])
    await page.close()
  }, 60_000)

  it('shows the hero command in the chosen style, hides the primary button, and copies the command', async () => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      permissions: ['clipboard-read', 'clipboard-write'],
    })
    const page = await context.newPage()
    await openClean(page)
    const hero = page.locator('[data-section-id="hero"]')
    expect(await hero.locator('[data-command-line]').count()).toBe(0)
    await hero.click({ position: { x: 24, y: 80 } })
    await page.getByRole('toolbar', { name: 'Section' }).getByRole('button', { name: 'Settings', exact: true }).click()
    await page.locator('[data-editor-field="section:hero"]').waitFor()
    // While the style is Off the command is not used, so its field is hidden.
    expect(await page.getByRole('textbox', { name: /^Command/ }).count()).toBe(0)

    await choose(page, 'Install command', 'Action')
    await page.getByRole('textbox', { name: /^Command/ }).fill('npm create bearminion@latest')
    const line = hero.locator('[data-command-line]')
    await line.waitFor()
    expect(await line.locator('[data-command]').innerText()).toBe('npm create bearminion@latest')
    // `action` takes the secondary button's place in the row.
    await hero.locator('[data-field="sections.0.props.secondary.label"]').waitFor({ state: 'detached' })
    expect(await hero.locator('[data-field="sections.0.props.primary.label"]').count()).toBe(1)
    expect(await page.getByRole('button', { name: /^Edit link: Primary/ }).count()).toBe(1)
    await page.getByRole('switch', { name: 'Primary button' }).uncheck()
    await hero.locator('[data-field="sections.0.props.primary.label"]').waitFor({ state: 'detached' })
    expect(await page.getByRole('button', { name: /^Edit link: Primary/ }).count()).toBe(0)

    await choose(page, 'Install command', 'Terminal')
    await hero.getByText('Terminal', { exact: true }).waitFor()
    await hero.locator('[data-field="sections.0.props.secondary.label"]').waitFor()

    // While editing, a click on the page selects what is under it; in preview the button works as on the live site.
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    await page.getByRole('button', { name: 'Exit preview' }).waitFor()
    await line.getByRole('button', { name: 'Copy command' }).click()
    await line.getByText('Copied', { exact: true }).waitFor()
    expect(await line.locator('[role="status"]').innerText()).toBe('Command copied')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('npm create bearminion@latest')
    await context.close()
  }, 60_000)

  it('adds a Media section and plays a YouTube link only after the visitor presses play', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const thirdParty: string[] = []
    // Nothing is fetched from YouTube in the test: requests are recorded and refused.
    await page.route(/youtube|ytimg/, (route) => {
      thirdParty.push(route.request().url())
      return route.abort()
    })
    await openClean(page)
    const toolbar = page.getByRole('toolbar', { name: 'Section' })
    await page.locator('[data-section-id="hero"]').click({ position: { x: 24, y: 80 } })
    await toolbar.getByRole('button', { name: 'Add', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Add below' }).click()
    await page.getByRole('listbox', { name: 'Add section' }).getByRole('button', { name: 'Media', exact: true }).click()
    const section = page.locator('[data-section-id="media"]')
    const empty = section.getByText('Add a video link in the section settings')
    await empty.waitFor()

    await empty.click()
    const form = page.locator('[data-editor-field="section:media"]')
    if (!(await form.isVisible())) await toolbar.getByRole('button', { name: 'Settings', exact: true }).click()
    await form.waitFor()
    await page.getByRole('textbox', { name: /^Video/ }).fill('https://youtu.be/abcdefghijk')
    const play = section.getByRole('button', { name: 'Play video: Product walkthrough' })
    await play.waitFor()
    expect(await section.locator('iframe').count()).toBe(0)
    expect(await section.locator('img').getAttribute('src')).toBe('https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg')

    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    await page.getByRole('button', { name: 'Exit preview' }).waitFor()
    expect(thirdParty.some((url) => url.includes('youtube-nocookie'))).toBe(false)
    await play.click()
    const iframe = section.locator('iframe')
    await iframe.waitFor({ state: 'attached' })
    expect(await iframe.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1&rel=0')
    expect(await iframe.getAttribute('title')).toBe('Product walkthrough')
    expect(errors, logs).toEqual([])
    await page.close()
  }, 60_000)

  it('shows only the Media fields the chosen type uses', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await openClean(page)
    const toolbar = page.getByRole('toolbar', { name: 'Section' })
    await page.locator('[data-section-id="hero"]').click({ position: { x: 24, y: 80 } })
    await toolbar.getByRole('button', { name: 'Add', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Add below' }).click()
    await page.getByRole('listbox', { name: 'Add section' }).getByRole('button', { name: 'Media', exact: true }).click()
    const section = page.locator('[data-section-id="media"]')
    await section.getByText('Add a video link in the section settings').click()
    const form = page.locator('[data-editor-field="section:media"]')
    if (!(await form.isVisible())) await toolbar.getByRole('button', { name: 'Settings', exact: true }).click()
    await form.waitFor()
    const videoField = page.getByRole('textbox', { name: /^Video/ })
    await videoField.waitFor()
    const poster = form.locator('.bm-label-text', { hasText: /^Poster$/ })
    expect(await poster.count()).toBe(1)

    await choose(page, 'Type', 'Image')
    await videoField.waitFor({ state: 'detached' })
    expect(await poster.count()).toBe(0)
    await form.locator('.bm-label-text', { hasText: /^Image$/ }).waitFor()
    await shot(page, 'media_fields_image.png')

    await page.getByRole('switch', { name: 'Show heading' }).uncheck()
    await page.getByRole('textbox', { name: /^Eyebrow/ }).waitFor({ state: 'detached' })
    await choose(page, 'Type', 'Video')
    await videoField.waitFor()
    await page.close()
  }, 60_000)

  it('adds a Steps section and renders code typed in backticks as a chip', async () => {
    // Tall enough that the new section's text, and the format bar under it, are on screen.
    const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } })
    await openClean(page)
    const toolbar = page.getByRole('toolbar', { name: 'Section' })
    await page.locator('[data-section-id="hero"]').click({ position: { x: 24, y: 80 } })
    await toolbar.getByRole('button', { name: 'Add', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Add below' }).click()
    await page.getByRole('listbox', { name: 'Add section' }).getByRole('button', { name: 'Steps', exact: true }).click()
    const section = page.locator('[data-section-id="steps"]')
    await section.locator('ol > li').nth(2).waitFor()
    expect(await section.locator('ol > li').count()).toBe(3)

    const text = section.locator('[data-field="sections.1.props.steps.0.description"]')
    await text.click()
    // Select "reader does" at the end of "Name the first thing the reader does." and mark it as code. End does not
    // move the caret in Chrome on macOS; Cmd+Right is the end of the line there.
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End')
    await page.keyboard.press('ArrowLeft')
    for (let step = 0; step < 11; step += 1) await page.keyboard.press('Shift+ArrowLeft')
    await page.getByRole('button', { name: 'Code', exact: true }).click()
    await text.locator('code', { hasText: 'reader does' }).waitFor()
    await page.waitForFunction(() =>
      Object.keys(localStorage).some(
        (key) => key.includes(':page:') && (localStorage.getItem(key)?.includes('the `reader does`.') ?? false),
      ),
    )

    // Step icons are picked from a grid, and the page redraws the icon.
    await toolbar.getByRole('button', { name: 'Settings', exact: true }).click()
    const form = page.locator('[data-editor-field="section:steps"]')
    await form.waitFor()
    await form.locator('details.bm-array-item summary').first().click()
    const picker = form.getByRole('radiogroup', { name: 'Icon' }).first()
    expect(await picker.getByRole('radio', { checked: true }).getAttribute('aria-label')).toBe('Cursor')
    const terminal = await picker.getByRole('radio', { name: 'Terminal' }).locator('path').getAttribute('d')
    await picker.getByRole('radio', { name: 'Terminal' }).click()
    await section.locator(`ol > li:first-child path[d="${terminal}"]`).waitFor()
    await shot(page, 'steps_icon_picker.png')
    await page.close()
  }, 60_000)

  it('renames a page and saves its edits in one request', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.goto(`http://127.0.0.1:${port}/preview`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Editor', exact: true }).click()
    await page.getByRole('tab', { name: 'Pages' }).click()
    const saves: string[] = []
    page.on('request', (request) => {
      if (request.method() !== 'GET' && request.url().includes('/__bearminion/api/')) saves.push(new URL(request.url()).pathname)
    })
    await page.getByLabel('Title', { exact: true }).fill('Preview renamed')
    await page.getByLabel('Slug', { exact: true }).fill('preview-renamed')
    await page.keyboard.press('Control+s')
    const pagesDir = path.join(contentDir, 'pages')
    await waitFor(() => fs.existsSync(path.join(pagesDir, 'preview-renamed.json')), 'renamed page file missing')
    // The new file is written before the old one is removed.
    await waitFor(() => !fs.existsSync(path.join(pagesDir, 'preview.json')), 'old page file still there after the rename')
    expect(JSON.parse(fs.readFileSync(path.join(pagesDir, 'preview-renamed.json'), 'utf8')).title).toBe('Preview renamed')
    expect(saves.filter((pathname) => !pathname.endsWith('/preview') && !pathname.endsWith('/preview/site'))).toEqual([
      '/__bearminion/api/save',
    ])
    await page.close()

    // Put the page back for the tests that follow.
    const stored = JSON.parse(fs.readFileSync(path.join(pagesDir, 'preview-renamed.json'), 'utf8')) as Record<string, unknown>
    const restored = await fetch(`http://127.0.0.1:${port}/__bearminion/api/save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ page: { from: 'preview-renamed', document: { ...stored, slug: 'preview', title: 'Preview' } } }),
    })
    expect(restored.status).toBe(200)
  }, 60_000)

  it('edits SEO and JSON-LD in a dialog and saves analytics from the Site tab', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${port}/about`, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-bearminion-ready'))
    await page.getByRole('button', { name: 'Editor', exact: true }).click()
    await page.getByRole('tab', { name: 'Pages' }).click()
    await page.getByRole('button', { name: 'Edit SEO' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit SEO' })
    await dialog.locator('label', { hasText: 'Description' }).locator('textarea').fill('A custom description.')

    // Invalid JSON blocks Apply and says why.
    const json = dialog.locator('textarea.bm-seo-json')
    await json.fill('{"@type": "Article",}')
    await dialog.getByRole('alert').waitFor()
    expect(await dialog.getByRole('button', { name: 'Apply', exact: true }).isDisabled()).toBe(true)

    // A pasted script tag is unwrapped and stored as parsed JSON.
    await json.fill('<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"About us"}</script>')
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })
    await page.getByText('JSON-LD · 1', { exact: true }).waitFor()

    // Cancel drops what the dialog changed.
    await page.getByRole('button', { name: 'Edit SEO' }).click()
    await dialog.locator('label', { hasText: 'Description' }).locator('textarea').fill('Never applied.')
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })

    await page.getByRole('tab', { name: 'Site' }).click()
    const snippet = '<script async src="https://stats.example/a.js"></script>'
    await page.locator('label', { hasText: /^Head/ }).locator('textarea').fill(snippet)
    await page.keyboard.press('Control+s')

    const aboutPath = path.join(contentDir, 'pages', 'about.json')
    const sitePath = path.join(contentDir, 'site.json')
    await waitFor(() => fs.readFileSync(aboutPath, 'utf8').includes('"jsonLd"'), 'jsonLd missing from about.json')
    await waitFor(() => fs.readFileSync(sitePath, 'utf8').includes('stats.example'), 'analytics missing from site.json')
    const saved = JSON.parse(fs.readFileSync(aboutPath, 'utf8')) as { seo: { description: string; jsonLd: unknown } }
    expect(saved.seo.description).toBe('A custom description.')
    expect(saved.seo.jsonLd).toEqual([{ '@context': 'https://schema.org', '@type': 'Article', headline: 'About us' }])
    expect(JSON.parse(fs.readFileSync(sitePath, 'utf8')).analytics).toEqual({ head: snippet })
    expect(errors, logs).toEqual([])
    await page.close()
  }, 60_000)

  it('switches the cookie banner from the sidebar and edits its text in a dialog', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${port}/about`, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-bearminion-ready'))
    await page.getByRole('button', { name: 'Editor', exact: true }).click()
    await page.getByRole('tab', { name: 'Site' }).click()
    const sitePath = path.join(contentDir, 'site.json')
    const saved = () => JSON.parse(fs.readFileSync(sitePath, 'utf8')) as { consent?: Record<string, unknown> }

    const row = page.locator('label.bm-switch-row', { hasText: 'Ask before analytics runs' })
    const toggle = row.getByRole('switch')
    expect(await toggle.isChecked()).toBe(true)
    await toggle.uncheck()
    await page.getByText(/^Off\. Your snippets run for every visitor/).waitFor()

    // The text lives in a dialog. A policy link that could run script is refused.
    await page.getByRole('button', { name: 'Edit banner' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit cookie banner' })
    await dialog
      .locator('label', { hasText: /^Title/ })
      .locator('input')
      .fill('Ciasteczka')
    const policy = dialog.locator('label', { hasText: 'Policy page' }).locator('input')
    await policy.fill('javascript:alert(1)')
    await dialog.getByRole('alert').waitFor()
    expect(await dialog.getByRole('button', { name: 'Apply', exact: true }).isDisabled()).toBe(true)
    await policy.fill('/polityka')
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })

    // Cancel drops what the dialog changed.
    await page.getByRole('button', { name: 'Edit banner' }).click()
    await dialog
      .locator('label', { hasText: /^Title/ })
      .locator('input')
      .fill('Never applied')
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })

    await page.keyboard.press('Control+s')
    await waitFor(() => saved().consent?.title === 'Ciasteczka', 'consent missing from site.json')
    // Only what differs from the default is stored, and an off switch is stored as `false`.
    expect(saved().consent).toEqual({ enabled: false, policyHref: '/polityka', title: 'Ciasteczka' })

    // Switching back on drops `enabled`; the texts stay.
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-bearminion-ready'))
    await page
      .getByRole('button', { name: 'Editor', exact: true })
      .click()
      .catch(() => undefined)
    await page.getByRole('tab', { name: 'Site' }).click()
    await row.getByRole('switch').check()
    await page.keyboard.press('Control+s')
    await waitFor(() => saved().consent?.enabled === undefined, 'enabled still in site.json')
    expect(saved().consent).toEqual({ policyHref: '/polityka', title: 'Ciasteczka' })
    expect(errors, logs).toEqual([])
    await page.close()
  }, 90_000)

  it('locks page scroll behind a dialog without shifting the layout, and restores it', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.goto(`http://127.0.0.1:${port}/about`, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-bearminion-ready'))
    await page.getByRole('button', { name: 'Editor', exact: true }).click()
    await page.getByRole('tab', { name: 'Pages' }).click()
    const lockState = () =>
      page.evaluate(() => ({ overflow: document.documentElement.style.overflow, gutter: document.documentElement.style.scrollbarGutter }))
    expect(await lockState()).toEqual({ overflow: '', gutter: '' })
    await page.getByRole('button', { name: 'Edit SEO' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit SEO' })
    expect((await lockState()).overflow).toBe('hidden')
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })
    expect(await lockState()).toEqual({ overflow: '', gutter: '' })
    await page.close()
  }, 60_000)
})

async function openClean(page: Page): Promise<void> {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('bearminion:draft:')) localStorage.removeItem(key)
    }
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Editor', exact: true }).waitFor()
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-bearminion-ready'))
}

/** The Advanced row opens by itself when the link has an ID or a non-default style; open it only if it is still shut. */
/** Picks one option of a segmented control or icon picker in the sidebar. */
async function choose(page: Page, group: string, option: string): Promise<void> {
  await page.getByRole('radiogroup', { name: group, exact: true }).getByRole('radio', { name: option, exact: true }).click()
}

async function openAdvanced(dialog: ReturnType<Page['locator']>): Promise<void> {
  const toggle = dialog.getByRole('button', { name: 'Advanced' })
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
}

async function waitForDraft(page: Page, heading: string): Promise<void> {
  await page.waitForFunction(
    (value) =>
      Object.keys(localStorage).some(
        (key) =>
          key.startsWith('bearminion:draft:') &&
          key.includes(':page:') &&
          !key.endsWith(':saved') &&
          (localStorage.getItem(key)?.includes(value) ?? false),
      ),
    heading,
  )
}

async function expectList(field: ReturnType<Page['locator']>, first: string, second: string): Promise<void> {
  await field.locator('li', { hasText: first }).waitFor()
  await field.locator('li', { hasText: second }).waitFor()
}

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.BEARMINION_E2E_SHOTS
  if (!dir) return
  fs.mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, name) })
}

function waitForHttp(url: string, child: ChildProcess, readLogs: () => string): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    let settled = false
    let last = 'no probe yet'
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearInterval(timer)
      if (error) reject(error)
      else resolve()
    }
    const timer = setInterval(() => {
      if (child.exitCode !== null) finish(new Error(`astro dev exited ${child.exitCode}\n${readLogs()}`))
      else if (Date.now() - started > 20_000) {
        finish(new Error(`astro dev did not serve ${url} (${last})\n${readLogs()}`))
      }
    }, 250)
    const probe = async () => {
      while (!settled && child.exitCode === null) {
        last = await probeStatus(url)
        if (last.startsWith('status 2')) {
          finish()
          return
        }
        if (last.startsWith('status 5') && Date.now() - started > 8_000) {
          finish(new Error(`${last}\n${readLogs()}`))
          return
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 400))
      }
    }
    void probe()
  })
}

function probeStatus(url: string): Promise<string> {
  return new Promise((resolve) => {
    const req = http.get(url, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8').replace(/\s+/g, ' ').slice(0, 180)
        resolve(`status ${response.statusCode ?? 0} ${body}`)
      })
    })
    req.setTimeout(3000, () => {
      req.destroy()
      resolve('timeout')
    })
    req.on('error', (error) => resolve(`error ${error.message}`))
  })
}

/** Polls the dev server until `pathname` serves HTML that contains `text`. */
async function waitForServed(pathname: string, text: string): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < 20_000) {
    const html = await fetch(`http://127.0.0.1:${port}${pathname}`)
      .then((response) => response.text())
      .catch(() => '')
    if (html.includes(text)) return
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`the dev server never served "${text}" at ${pathname}`)
}

async function waitFor(check: () => boolean, label: string): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < 20_000) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(label)
}
