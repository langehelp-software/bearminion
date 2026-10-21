// Records the editor demo shown on bearminion.com: open the editor, edit the hero heading, add a section, switch
// its layout, repaint the palette, save. Writes an H.264 MP4 to apps/web/public/videos/ and a poster image to
// apps/web/src/assets/uploads/.
//
//   pnpm web:record-demo                 record and encode
//   pnpm web:record-demo -- --keep       also keep the captured frames (in tests/.demo-frames/)
//
// Needs ffmpeg with libx264 on PATH (or FFMPEG=/path/to/ffmpeg), and Playwright's Chromium
// (`pnpm e2e:setup`, or BEARMINION_E2E_CHROMIUM=/path/to/chromium).
//
// The site runs from a throwaway copy, apps/web/.demo-recording/, so the demo's saves never touch apps/web/content
// or its version history. Frames come from Chrome's screencast at full quality: Playwright's recordVideo writes
// low-bitrate VP8 that smears UI text.
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const web = path.join(repo, 'apps/web')
const scratch = path.join(web, '.demo-recording')
const framesDir = path.join(repo, 'tests/.demo-frames')
const videoOut = path.join(web, 'public/videos/bearminion-editor.mp4')
const posterOut = path.join(web, 'src/assets/uploads/editor-demo-poster.png')
const port = 4488
const origin = `http://127.0.0.1:${port}`
const keepFrames = process.argv.includes('--keep')

/** 16:9 at 1600 × 900 CSS pixels, captured at 1920 × 1080. */
const VIEWPORT = { width: 1600, height: 900 }
const SCALE = 1.2
const FPS = 30

/** What the demo types and picks. Change them here and re-record. */
const DEMO = {
  heading: 'Click the heading. Type.',
  section: 'Steps',
  variant: 'List',
  /** Passes every contrast check, so the Design tab shows no warning. */
  brand: '#ff6a3d',
}

const ffmpeg = process.env.FFMPEG ?? 'ffmpeg'

function checkFfmpeg() {
  const probe = spawnSync(ffmpeg, ['-hide_banner', '-encoders'], { encoding: 'utf8' })
  if (probe.error || !probe.stdout.includes('libx264')) {
    throw new Error('ffmpeg with libx264 is needed: install it (macOS: brew install ffmpeg) or set FFMPEG=/path/to/ffmpeg.')
  }
}

/** A copy of apps/web with the template's code synced in, minus anything the build or the editor writes. */
function prepareSite() {
  const sync = spawnSync(process.execPath, [path.join(web, 'scripts/sync-template.mjs')], { cwd: web, stdio: 'inherit' })
  if (sync.status !== 0) throw new Error('scripts/sync-template.mjs failed')
  rmSync(scratch, { recursive: true, force: true })
  const skip = new Set(['node_modules', 'dist', '.astro', '.editor', '.demo-recording', 'public'])
  mkdirSync(scratch, { recursive: true })
  for (const entry of readdirSync(web)) {
    if (!skip.has(entry)) cpSync(path.join(web, entry), path.join(scratch, entry), { recursive: true })
  }
  // The page the demo edits leaves out its own video slot: an empty frame in a recording of itself looks broken.
  const indexFile = path.join(scratch, 'content/pages/index.json')
  const page = JSON.parse(readFileSync(indexFile, 'utf8'))
  page.sections = page.sections.filter((section) => section.type !== 'media')
  writeFileSync(indexFile, `${JSON.stringify(page, null, 2)}\n`)
}

function startServer() {
  // Inside apps/web, so node_modules and the workspace resolve as they do for apps/web itself.
  const astro = path.join(web, 'node_modules/astro/bin/astro.mjs')
  const env = { ...process.env, NODE_ENV: 'development' }
  const server = spawn(process.execPath, [astro, 'dev', '--port', String(port), '--host', '127.0.0.1', '--ignore-lock'], {
    cwd: scratch,
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  server.stdout.on('data', (chunk) => {
    logs += chunk
  })
  server.stderr.on('data', (chunk) => {
    logs += chunk
  })
  return { server, logs: () => logs }
}

async function waitForHttp(url, readLogs) {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      http
        .get(url, (response) => {
          response.resume()
          resolve(response.statusCode === 200)
        })
        .on('error', () => resolve(false))
    })
    if (ok) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`The dev server did not answer at ${url}:\n${readLogs()}`)
}

/**
 * A visible pointer. Headless Chrome draws none, and a demo where things change by themselves is hard to follow.
 * It lives outside the editor's shadow root, above everything, and keeps its place across the save reload.
 */
function cursorScript() {
  const install = () => {
    if (document.getElementById('demo-cursor')) return
    const style = document.createElement('style')
    style.textContent = `
      #demo-cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none; width: 26px; height: 26px;
        transform: translate(var(--x, -40px), var(--y, -40px)); filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.35)); }
      #demo-cursor svg { width: 26px; height: 26px; }
      #demo-cursor::after { content: ''; position: absolute; left: -14px; top: -14px; width: 28px; height: 28px;
        border-radius: 50%; background: rgb(22 151 23 / 0.35); transform: scale(0); opacity: 0; }
      #demo-cursor.press::after { animation: demo-press 420ms ease-out; }
      @keyframes demo-press { 0% { transform: scale(0.3); opacity: 1 } 100% { transform: scale(1.6); opacity: 0 } }`
    const cursor = document.createElement('div')
    cursor.id = 'demo-cursor'
    cursor.innerHTML =
      '<svg viewBox="0 0 24 24"><path d="M4 2.5l15 9.2-6.6 1.3 3.9 7.4-2.9 1.5-3.9-7.5L4.6 19z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>'
    const place = (x, y) => {
      cursor.style.setProperty('--x', `${x}px`)
      cursor.style.setProperty('--y', `${y}px`)
      try {
        sessionStorage.setItem('demo-cursor', JSON.stringify([x, y]))
      } catch {}
    }
    try {
      const saved = JSON.parse(sessionStorage.getItem('demo-cursor') ?? 'null')
      if (Array.isArray(saved)) place(saved[0], saved[1])
    } catch {}
    addEventListener('mousemove', (event) => place(event.clientX, event.clientY), true)
    addEventListener(
      'mousedown',
      () => {
        cursor.classList.remove('press')
        void cursor.offsetWidth
        cursor.classList.add('press')
      },
      true,
    )
    document.documentElement.append(style, cursor)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install)
  else install()
}

/** Collects screencast frames with their capture times. */
async function startCapture(page) {
  const cdp = await page.context().newCDPSession(page)
  const frames = []
  mkdirSync(framesDir, { recursive: true })
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const file = path.join(framesDir, `f${String(frames.length).padStart(5, '0')}.jpg`)
    writeFileSync(file, Buffer.from(data, 'base64'))
    frames.push({ file, time: metadata.timestamp ?? Date.now() / 1000 })
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  })
  const width = Math.round(VIEWPORT.width * SCALE)
  const height = Math.round(VIEWPORT.height * SCALE)
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: width, maxHeight: height, everyNthFrame: 1 })
  return {
    frames,
    async stop() {
      await cdp.send('Page.stopScreencast').catch(() => {})
    },
  }
}

/** Frames arrive only when the screen changes: each one is held until the next, the last one for `tail` seconds. */
function encode(frames, tail) {
  if (frames.length < 2) throw new Error('No frames were captured.')
  const lines = []
  for (const [index, frame] of frames.entries()) {
    const next = frames[index + 1]
    const duration = next ? Math.max(1 / FPS, next.time - frame.time) : tail
    lines.push(`file '${frame.file}'`, `duration ${duration.toFixed(4)}`)
  }
  // The concat demuxer ignores the last duration unless the last file is listed again.
  lines.push(`file '${frames.at(-1).file}'`)
  const list = path.join(framesDir, 'frames.txt')
  writeFileSync(list, `${lines.join('\n')}\n`)
  mkdirSync(path.dirname(videoOut), { recursive: true })
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    list,
    '-vf',
    `fps=${FPS},scale=${Math.round(VIEWPORT.width * SCALE)}:${Math.round(VIEWPORT.height * SCALE)}:flags=lanczos,format=yuv420p`,
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '22',
    '-tune',
    'stillimage',
    '-profile:v',
    'high',
    // 1080p30 fits level 4.0, which older phones and hardware decoders play; x264 would otherwise pick 5.0.
    '-level:v',
    '4.0',
    '-movflags',
    '+faststart',
    '-an',
    videoOut,
  ]
  const run = spawnSync(ffmpeg, args, { stdio: 'inherit' })
  if (run.status !== 0) throw new Error('ffmpeg failed')
}

/** Moves the visible pointer to the middle of a locator (or a point in it) at a human pace, then clicks. */
async function clickOn(page, locator, { position, pause = 350 } = {}) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  if (!box) throw new Error(`Not on screen: ${locator}`)
  const x = box.x + (position?.x ?? box.width / 2)
  const y = box.y + (position?.y ?? box.height / 2)
  await page.mouse.move(x, y, { steps: 28 })
  await page.waitForTimeout(pause)
  await page.mouse.down()
  await page.mouse.up()
}

async function hoverOn(page, locator, position) {
  const box = await locator.boundingBox()
  if (!box) throw new Error(`Not on screen: ${locator}`)
  await page.mouse.move(box.x + (position?.x ?? box.width / 2), box.y + (position?.y ?? box.height / 2), { steps: 28 })
}

async function demo(page) {
  const beat = (ms = 900) => page.waitForTimeout(ms)
  await page.goto(`${origin}/`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-bearminion-ready'))
  await page.mouse.move(VIEWPORT.width * 0.55, VIEWPORT.height * 0.75)
  await beat(300)
  // The poster is the opening frame, so pressing play does not jump to another picture.
  await page.screenshot({ path: posterOut })
  await beat(1100)

  // 1. Edit the hero heading on the page. `astro dev` starts with the editor on; the sidebar stays shut until step 3.
  const heading = page.locator('[data-section-id="hero"] [data-field="sections.0.props.heading"]')
  await clickOn(page, heading, { position: { x: 24, y: 24 } })
  await page.keyboard.press('ControlOrMeta+a')
  await beat(400)
  await page.keyboard.type(DEMO.heading, { delay: 75 })
  await beat(900)
  // Click away so the format bar closes and the change settles.
  await clickOn(page, page.locator('[data-section-id="hero"]'), { position: { x: 40, y: 140 } })
  await beat(900)

  // 2. Add a section below the hero.
  const hero = page.locator('[data-section-id="hero"]')
  await hoverOn(page, hero, { x: 200, y: 120 })
  const toolbar = page.getByRole('toolbar', { name: 'Section' })
  await clickOn(page, toolbar.getByRole('button', { name: 'Add', exact: true }))
  await beat(500)
  await clickOn(page, page.getByRole('menuitem', { name: 'Add below' }))
  await beat(800)
  await clickOn(page, page.getByRole('listbox', { name: 'Add section' }).getByRole('button', { name: DEMO.section, exact: true }))
  const added = page.locator(`[data-section-id="${DEMO.section.toLowerCase()}"]`)
  await added.waitFor()
  await added.scrollIntoViewIfNeeded()
  await page.mouse.wheel(0, -120)
  await beat(1200)

  // 3. Switch its layout in the sidebar.
  await hoverOn(page, added, { x: 200, y: 60 })
  await clickOn(page, toolbar.getByRole('button', { name: 'Settings', exact: true }))
  const variant = page.getByRole('radiogroup', { name: 'Variant', exact: true })
  await variant.waitFor()
  await beat(900)
  await clickOn(page, variant.getByRole('radio', { name: DEMO.variant, exact: true }))
  await beat(1500)

  // 4. Repaint the palette.
  await clickOn(page, page.getByRole('tab', { name: 'Design', exact: true }))
  await beat(900)
  const brand = page.getByRole('textbox', { name: 'Brand hex' })
  await clickOn(page, brand)
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(DEMO.brand, { delay: 90 })
  await beat(1800)

  // 5. Save: the JSON is written and the page reloads from it.
  const reloaded = page.waitForEvent('load')
  await clickOn(page, page.locator('button.bm-save.bm-split-main'))
  await reloaded
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-bearminion-ready'))
  await beat(1200)

  // 6. Close the sidebar and end on the saved hero.
  await clickOn(page, page.getByRole('button', { name: 'Close sidebar', exact: true }))
  await beat(500)
  await page.mouse.move(VIEWPORT.width * 0.5, VIEWPORT.height * 0.8, { steps: 20 })
  await scrollToTop(page)
  await beat(2400)
}

/** Scrolls up in small steps, so the video shows a scroll rather than a cut. */
async function scrollToTop(page) {
  for (let step = 0; step < 40; step++) {
    const top = await page.evaluate(() => scrollY)
    if (top <= 0) return
    await page.mouse.wheel(0, -Math.max(40, Math.min(160, top / 4)))
    await page.waitForTimeout(30)
  }
}

async function main() {
  checkFfmpeg()
  prepareSite()
  rmSync(framesDir, { recursive: true, force: true })
  const { server, logs } = startServer()
  let browser
  try {
    await waitForHttp(`${origin}/`, logs)
    const executablePath = process.env.BEARMINION_E2E_CHROMIUM
    browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox', '--hide-scrollbars'] })
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE, colorScheme: 'light' })
    await context.addInitScript(cursorScript)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('dialog', (dialog) => dialog.accept().catch(() => {}))
    // Warm up: the first request compiles every page and component, which would show as a long blank start.
    await page.goto(`${origin}/`, { waitUntil: 'networkidle' })
    const capture = await startCapture(page)
    await demo(page)
    await capture.stop()
    if (errors.length > 0) throw new Error(`The page reported errors:\n${errors.join('\n')}`)
    encode(capture.frames, 1.5)
    const seconds = capture.frames.at(-1).time - capture.frames[0].time
    console.log(`${capture.frames.length} frames over ${seconds.toFixed(1)}s`)
    console.log(`Wrote ${path.relative(repo, videoOut)} and ${path.relative(repo, posterOut)}`)
  } finally {
    await browser?.close()
    try {
      process.kill(-server.pid, 'SIGTERM')
    } catch {
      server.kill('SIGTERM')
    }
    rmSync(scratch, { recursive: true, force: true })
    if (!keepFrames) rmSync(framesDir, { recursive: true, force: true })
  }
}

if (existsSync(scratch)) rmSync(scratch, { recursive: true, force: true })
await main()
