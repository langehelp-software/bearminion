import fs from 'node:fs'
import zlib from 'node:zlib'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Browser, Page } from 'playwright'
import { launchBrowser, openClean as openCleanAt, startDevServer, starter, waitFor, type DevServer } from './dev-server'

const port = 4479
const origin = `http://127.0.0.1:${port}`

/**
 * A solid-colour PNG. The gallery's large file is capped at the picture's own width, so a 1-pixel picture would give
 * the same address for the thumbnail and for the large file, and the test could not tell them apart.
 */
function solidPng(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff
    for (const byte of bytes) c = (crcTable[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const head = Buffer.alloc(4)
    head.writeUInt32BE(data.length)
    const tail = Buffer.alloc(4)
    tail.writeUInt32BE(crc(body))
    return Buffer.concat([head, body, tail])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.alloc(1 + width * 3)
  for (let x = 0; x < width; x += 1) row.set([r, g, b], 1 + x * 3)
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** The smallest bytes the library accepts as MP4: an `ftyp` box with a known brand. */
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypmp42'), Buffer.from([0, 0, 0, 0]), Buffer.from('mp42isom')])

const galleryImages = [
  { src: 'src/assets/e2e-gallery/alpha.png', alt: 'Alpha' },
  { src: 'src/assets/e2e-gallery/beta.png', alt: 'Beta', caption: 'The second picture' },
  { src: 'src/assets/e2e-gallery/gamma.png', alt: 'Gamma' },
]

describe('Text, Gallery and Media editing', () => {
  let browser: Browser
  let server: DevServer
  let root = ''
  let contentDir = ''
  let uploadsDir = ''
  let galleryDir = ''
  let videosDir = ''

  const logs = () => server?.logs() ?? ''
  const pagePath = (name: string) => path.join(contentDir, 'pages', `${name}.json`)
  const readPage = (name: string) =>
    JSON.parse(fs.readFileSync(pagePath(name), 'utf8')) as { sections: Array<{ props: Record<string, unknown> }> }
  const savedImages = () => (readPage('gallery').sections[0]?.props.images ?? []) as Array<{ alt: string; caption?: string }>
  const openClean = (page: Page, pathname = '/') => openCleanAt(page, origin, pathname)

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bearminion-sections-'))
    contentDir = path.join(root, 'content')
    fs.cpSync(path.join(starter, 'content'), contentDir, { recursive: true })
    // Uploads, gallery pictures and videos live inside the template (Astro only sees `src/assets` and `public`), in
    // folders of their own that this file removes again.
    uploadsDir = path.join(starter, 'src', 'assets', 'e2e-sections-uploads')
    galleryDir = path.join(starter, 'src', 'assets', 'e2e-gallery')
    videosDir = path.join(starter, 'public', 'e2e-videos')
    for (const dir of [uploadsDir, galleryDir, videosDir]) fs.rmSync(dir, { recursive: true, force: true })
    for (const dir of [uploadsDir, galleryDir, videosDir]) fs.mkdirSync(dir, { recursive: true })
    const colours: Array<[string, [number, number, number]]> = [
      ['alpha', [200, 60, 60]],
      ['beta', [60, 160, 90]],
      ['gamma', [60, 90, 200]],
    ]
    for (const [name, colour] of colours) fs.writeFileSync(path.join(galleryDir, `${name}.png`), solidPng(2200, 1300, colour))

    const page = (slug: string, title: string, sections: unknown[]) =>
      fs.writeFileSync(pagePath(slug), JSON.stringify({ sections, seo: { title, description: `${title} page.` }, slug, title }, null, 2))
    page('legal', 'Legal', [
      {
        id: 'legal',
        anchor: 'legal',
        type: 'text',
        variant: 'left',
        tone: 'base',
        props: { heading: 'Privacy', body: 'The first paragraph.\n\nThe second paragraph.\n\n- One\n- Two', narrow: true },
      },
    ])
    page('gallery', 'Gallery', [
      {
        id: 'gallery',
        anchor: 'gallery',
        type: 'gallery',
        variant: 'grid',
        tone: 'base',
        props: { heading: 'Pictures', images: galleryImages, columns: '3', lightbox: true, frame: false },
      },
    ])

    server = await startDevServer({ port, contentDir, uploadsDir, videosDir })
    browser = await launchBrowser()
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    server?.stop()
    if (root) fs.rmSync(root, { recursive: true, force: true })
    for (const dir of [uploadsDir, galleryDir, videosDir]) {
      if (dir) fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('offers heading buttons only where a field allows headings, and saves them as markdown', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await openClean(page, '/legal')
    const body = page.locator('[data-section-id="legal"] [data-rich-headings="true"]')
    const second = body.locator('p', { hasText: 'The second paragraph.' })
    await second.click()

    const heading = page.getByRole('button', { name: 'Heading', exact: true })
    const subheading = page.getByRole('button', { name: 'Subheading', exact: true })
    await heading.waitFor()
    await heading.click()
    await body.locator('h2', { hasText: 'The second paragraph.' }).waitFor()
    expect(await heading.getAttribute('aria-pressed')).toBe('true')

    await subheading.click()
    await body.locator('h3', { hasText: 'The second paragraph.' }).waitFor()
    expect(await body.locator('h2').count()).toBe(0)
    expect(await subheading.getAttribute('aria-pressed')).toBe('true')

    // The same button again turns the line back into a paragraph.
    await subheading.click()
    await body.locator('p', { hasText: 'The second paragraph.' }).waitFor()
    expect(await body.locator('h2, h3').count()).toBe(0)

    await heading.click()
    await body.locator('h2', { hasText: 'The second paragraph.' }).waitFor()
    const reloaded = page.waitForEvent('load')
    await page.keyboard.press('Control+s')
    await waitFor(
      () => String(readPage('legal').sections[0]?.props.body).includes('## The second paragraph.'),
      'heading missing from legal.json',
    )
    await reloaded
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-bearminion-ready'))
    // The saved markdown renders as a real heading on the page, and the lists around it survive.
    expect(await page.locator('[data-section-id="legal"] h2', { hasText: 'The second paragraph.' }).count()).toBe(1)
    expect(String(readPage('legal').sections[0]?.props.body)).toBe('The first paragraph.\n\n## The second paragraph.\n\n- One\n- Two')

    // A field that does not allow headings has no such buttons.
    await page.goto(`${origin}/`, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-bearminion-ready'))
    await page.locator('[data-section-id="hero"] [data-field="sections.0.props.sub"]').click()
    await page.getByRole('button', { name: 'Bold', exact: true }).waitFor()
    expect(await page.getByRole('button', { name: 'Heading', exact: true }).count()).toBe(0)
    expect(errors, logs()).toEqual([])
    await page.close()
  }, 90_000)

  it('opens a gallery picture large in preview, steps through them, and returns focus', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const requested: string[] = []
    page.on('request', (request) => requested.push(request.url()))
    await openClean(page, '/gallery')
    const section = page.locator('[data-section-id="gallery"]')
    const openers = section.locator('a[data-gallery-open]')
    expect(await openers.count()).toBe(3)
    const dialog = section.locator('dialog[data-gallery-dialog]')

    // The editor is on the page: a click opens the image picker, never the lightbox, and the page is not left.
    await openers.first().click()
    await page.getByRole('dialog', { name: 'Choose image' }).waitFor()
    expect(await dialog.evaluate((node) => (node as HTMLDialogElement).open)).toBe(false)
    expect(page.url()).toBe(`${origin}/gallery`)
    await page.keyboard.press('Escape')
    await page.getByRole('dialog', { name: 'Choose image' }).waitFor({ state: 'detached' })

    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    await page.getByRole('button', { name: 'Exit preview' }).waitFor()

    // The large files are not requested until a picture is opened.
    const larges = await openers.evaluateAll((nodes) => nodes.map((node) => (node as HTMLAnchorElement).href))
    expect(larges.every((href) => href.length > 0)).toBe(true)
    expect(requested.filter((url) => larges.includes(url))).toEqual([])

    await openers.first().click()
    await page.waitForFunction(() => document.querySelector('dialog[data-gallery-dialog]')?.hasAttribute('open'))
    const counter = dialog.locator('[data-gallery-counter]')
    const caption = dialog.locator('[data-gallery-caption]')
    const image = dialog.locator('[data-gallery-image]')
    await waitFor(() => requested.includes(larges[0] ?? ''), 'the first large picture was never requested')
    expect(await counter.innerText()).toBe('1 / 3')
    // A picture without a caption shows its description.
    expect(await caption.innerText()).toBe('Alpha')
    expect(await image.getAttribute('alt')).toBe('Alpha')
    // The page behind a modal dialog does not scroll.
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('hidden')

    await page.keyboard.press('ArrowRight')
    expect(await counter.innerText()).toBe('2 / 3')
    expect(await caption.innerText()).toBe('The second picture')
    await page.keyboard.press('ArrowRight')
    expect(await counter.innerText()).toBe('3 / 3')
    await page.keyboard.press('ArrowRight')
    expect(await counter.innerText()).toBe('1 / 3')
    await page.keyboard.press('ArrowLeft')
    expect(await counter.innerText()).toBe('3 / 3')
    await page.keyboard.press('Home')
    expect(await counter.innerText()).toBe('1 / 3')
    await page.keyboard.press('End')
    expect(await counter.innerText()).toBe('3 / 3')
    await dialog.getByRole('button', { name: 'Previous picture' }).click()
    expect(await counter.innerText()).toBe('2 / 3')
    await dialog.getByRole('button', { name: 'Next picture' }).click()
    expect(await counter.innerText()).toBe('3 / 3')

    // Escape closes it, scrolling comes back, and focus returns to the picture that was showing.
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('dialog[data-gallery-dialog]')?.hasAttribute('open'))
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe('hidden')
    // The dialog's `close` event, which moves focus back, fires a moment after `open` is gone.
    await expect.poll(() => openers.nth(2).evaluate((node) => node === document.activeElement)).toBe(true)

    // The close button and the backdrop close it too.
    await openers.nth(1).click()
    await page.waitForFunction(() => document.querySelector('dialog[data-gallery-dialog]')?.hasAttribute('open'))
    await dialog.getByRole('button', { name: 'Close' }).click()
    await page.waitForFunction(() => !document.querySelector('dialog[data-gallery-dialog]')?.hasAttribute('open'))
    // The dialog's `close` event, which moves focus back, fires a moment after `open` is gone.
    await expect.poll(() => openers.nth(1).evaluate((node) => node === document.activeElement)).toBe(true)
    await openers.first().click()
    await page.waitForFunction(() => document.querySelector('dialog[data-gallery-dialog]')?.hasAttribute('open'))
    await page.mouse.click(4, 450)
    await page.waitForFunction(() => !document.querySelector('dialog[data-gallery-dialog]')?.hasAttribute('open'))
    expect(errors, logs()).toEqual([])
    await page.close()
  }, 90_000)

  it('links each gallery picture to its large file when JavaScript is off', async () => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    await page.goto(`${origin}/gallery`, { waitUntil: 'load' })
    const openers = page.locator('[data-section-id="gallery"] a[data-gallery-open]')
    expect(await openers.count()).toBe(3)
    const first = await openers.first().getAttribute('href')
    expect(first).toBeTruthy()
    await openers.first().click()
    await page.waitForURL((url) => url.pathname !== '/gallery')
    expect(page.url()).toContain((first ?? '').split('?')[0] ?? '')
    await context.close()
  }, 60_000)

  it('edits a picture caption in the settings and saves it with the picture', async () => {
    const page = await browser.newPage({ viewport: { width: 1700, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await openClean(page, '/gallery')
    await openGallerySettings(page)
    const rows = page.locator('[data-editor-field="section:gallery"] .bm-array-row')
    await rows.first().locator('summary').click()
    const caption = rows.first().getByLabel('Caption', { exact: true })
    await caption.waitFor()
    expect(await caption.inputValue()).toBe('')
    await caption.fill('Typed in the editor')
    // The second picture already has one; its field shows it.
    await rows.nth(1).locator('summary').click()
    expect(await rows.nth(1).getByLabel('Caption', { exact: true }).inputValue()).toBe('The second picture')

    const reloaded = page.waitForEvent('load')
    await page.keyboard.press('Control+s')
    await waitFor(() => JSON.stringify(readPage('gallery')).includes('Typed in the editor'), 'caption missing from gallery.json')
    await reloaded
    const images = savedImages()
    expect(images.map((image) => image.caption)).toEqual(['Typed in the editor', 'The second picture', undefined])
    // The lightbox reads it from the page.
    expect(await page.locator('[data-section-id="gallery"] a[data-gallery-open]').first().getAttribute('data-caption')).toBe(
      'Typed in the editor',
    )
    expect(errors, logs()).toEqual([])
    await page.close()
  }, 90_000)

  it('reorders list items by dragging the grip, and keeps the moved card open', async () => {
    const page = await browser.newPage({ viewport: { width: 1700, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await openClean(page, '/gallery')
    await openGallerySettings(page)
    const rows = page.locator('[data-editor-field="section:gallery"] .bm-array-row')
    const summaries = () => rows.locator('.bm-array-summary').allInnerTexts()
    const onPage = () =>
      page
        .locator('[data-section-id="gallery"] a[data-gallery-open]')
        .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.alt ?? ''))
    expect(await summaries()).toEqual(['Alpha', 'Beta', 'Gamma'])

    // Drag the first card below the last one. The card being moved is open, and it stays open where it lands.
    await rows.first().locator('summary').click()
    expect(
      await rows
        .first()
        .locator('details')
        .evaluate((node) => (node as HTMLDetailsElement).open),
    ).toBe(true)
    await dragGrip(page, rows.first().locator('.bm-array-grip'), rows.nth(2), 'after')
    await expectOrder(summaries, ['Beta', 'Gamma', 'Alpha'])
    expect(
      await rows
        .nth(2)
        .locator('details')
        .evaluate((node) => (node as HTMLDetailsElement).open),
    ).toBe(true)
    expect(
      await rows
        .first()
        .locator('details')
        .evaluate((node) => (node as HTMLDetailsElement).open),
    ).toBe(false)
    // The page behind follows without a reload.
    await expectOrder(onPage, ['Beta', 'Gamma', 'Alpha'])

    // Dropping on the upper half of a card puts the item before it.
    await dragGrip(page, rows.nth(2).locator('.bm-array-grip'), rows.first(), 'before')
    await expectOrder(summaries, ['Alpha', 'Beta', 'Gamma'])
    // The card that was moved is still the open one, now first again.
    expect(
      await rows
        .first()
        .locator('details')
        .evaluate((node) => (node as HTMLDetailsElement).open),
    ).toBe(true)

    // The arrow buttons move the same way and the order is what gets saved.
    await rows.first().getByRole('button', { name: 'Move item down' }).click()
    await expectOrder(summaries, ['Beta', 'Alpha', 'Gamma'])
    const reloaded = page.waitForEvent('load')
    await page.keyboard.press('Control+s')
    await waitFor(() => savedImages()[0]?.alt === 'Beta', 'new order missing from gallery.json')
    await reloaded
    expect(savedImages().map((image) => image.alt)).toEqual(['Beta', 'Alpha', 'Gamma'])
    expect(errors, logs()).toEqual([])
    await page.close()
  }, 90_000)

  it('uploads a video file, picks it again from the library, and refuses a page link or a fake file', async () => {
    const page = await browser.newPage({ viewport: { width: 1700, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
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
    const link = page.getByRole('textbox', { name: /^Video\b/ })

    // A page link is refused with the reason, and the field says what it is looking for.
    await link.fill('https://example.com/watch?v=1')
    await form.getByRole('alert').filter({ hasText: 'page link' }).waitFor()
    await link.fill('')
    await form.getByText('Paste a YouTube or Vimeo link as it is, or upload a video file.').waitFor()

    // A file that only calls itself a video is refused by its bytes and never reaches the folder.
    const input = form.locator('input[type="file"][accept*="video"]')
    await input.setInputFiles({ name: 'fake.mp4', mimeType: 'video/mp4', buffer: Buffer.from('this is not a video') })
    await form.getByRole('alert').waitFor()
    expect(fs.readdirSync(videosDir)).toEqual([])
    expect(await link.inputValue()).toBe('')

    // A real one is stored under a unique name, filled into the field, and played from there.
    await input.setInputFiles({ name: 'clip.mp4', mimeType: 'video/mp4', buffer: mp4 })
    await waitFor(() => fs.readdirSync(videosDir).some((name) => /^clip.*\.mp4$/.test(name)), 'uploaded video missing from disk')
    const stored = fs.readdirSync(videosDir).find((name) => name.endsWith('.mp4')) ?? ''
    const filled = async () => (await link.inputValue()) === `/e2e-videos/${stored}`
    for (let i = 0; i < 50 && !(await filled()); i += 1) await page.waitForTimeout(200)
    expect(await link.inputValue()).toBe(`/e2e-videos/${stored}`)
    const player = section.locator('[data-media-player][data-kind="file"]')
    await player.waitFor()
    expect(await player.getAttribute('data-src')).toBe(`/e2e-videos/${stored}`)
    await form.getByText('Video file.').waitFor()
    // The dev server serves it from `public/`.
    let status = 0
    for (let attempt = 0; attempt < 25 && status !== 200; attempt += 1) {
      status = (await fetch(`${origin}/e2e-videos/${stored}`)).status
      if (status !== 200) await page.waitForTimeout(200)
    }
    expect(status).toBe(200)

    // Clear the field, then choose the upload again from the library.
    await link.fill('')
    const library = form.getByRole('combobox', { name: 'Uploaded videos' })
    await library.waitFor()
    await library.selectOption({ value: `/e2e-videos/${stored}` })
    expect(await link.inputValue()).toBe(`/e2e-videos/${stored}`)
    expect(errors, logs()).toEqual([])
    await page.close()
  }, 90_000)
})

/**
 * Runs the list's drag-and-drop the way the browser would, event by event: dragstart on the grip, dragover and drop on
 * the row (in its upper or lower half), dragend. Headless Chromium cancels a real mouse drag that starts on a
 * `draggable` span inside a `<summary>`, so the events are dispatched with a shared DataTransfer instead. A frame passes
 * between them, because the list keeps the drag in state that renders before the next event reads it.
 */
async function dragGrip(
  page: Page,
  grip: ReturnType<Page['locator']>,
  row: ReturnType<Page['locator']>,
  half: 'before' | 'after',
): Promise<void> {
  const gripHandle = await grip.elementHandle()
  const rowHandle = await row.elementHandle()
  if (!gripHandle || !rowHandle) throw new Error('drag has no element')
  await page.evaluate(
    async ([from, to, where]) => {
      if (!(from instanceof HTMLElement) || !(to instanceof HTMLElement) || typeof where !== 'string') throw new Error('bad drag arguments')
      const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      const transfer = new DataTransfer()
      const box = to.getBoundingClientRect()
      const clientY = where === 'after' ? box.bottom - 3 : box.top + 3
      const fire = (target: HTMLElement, type: string) =>
        target.dispatchEvent(
          new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: box.left + 60, clientY }),
        )
      fire(from, 'dragstart')
      await frame()
      fire(to, 'dragenter')
      fire(to, 'dragover')
      await frame()
      fire(to, 'drop')
      fire(from, 'dragend')
      await frame()
    },
    [gripHandle, rowHandle, half] as const,
  )
}

/** Polls until a list reads back in this order. */
async function expectOrder(read: () => Promise<string[]>, expected: string[]): Promise<void> {
  let last: string[] = []
  for (let attempt = 0; attempt < 100; attempt += 1) {
    last = await read()
    if (last.join() === expected.join()) return
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  expect(last).toEqual(expected)
}

/** Selects the gallery section and opens its settings in the sidebar. */
async function openGallerySettings(page: Page): Promise<void> {
  const toolbar = page.getByRole('toolbar', { name: 'Section' })
  const form = page.locator('[data-editor-field="section:gallery"]')
  // Aim at the heading: the pictures themselves are image slots that open the picker.
  await page
    .locator('[data-section-id="gallery"] [data-field="sections.0.props.heading"]')
    .click({ position: { x: 4, y: 4 } })
    .catch(() => undefined)
  await page.locator('[data-section-id="gallery"]').hover()
  if (!(await form.isVisible())) await toolbar.getByRole('button', { name: 'Settings', exact: true }).click()
  await form.waitFor()
}
