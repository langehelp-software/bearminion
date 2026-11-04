import fs from 'node:fs'
import path from 'node:path'
import type { Browser, Page } from 'playwright'
import ts from 'typescript'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchBrowser } from './dev-server'

/**
 * The upload rules run against the browser's real image codec: decode, scale, encode as WebP. The unit tests use a fake
 * codec; this proves the real one gives a WebP of the right width and a smaller file. No dev server is needed, only
 * the two modules the editor loads, served to an empty page.
 */
const editorSrc = path.resolve(import.meta.dirname, '../../packages/editor/src')
const ORIGIN = 'http://editor.test'

function moduleSource(relative: string): string {
  const source = fs.readFileSync(path.join(editorSrc, relative), 'utf8')
  return ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
}

interface Outcome {
  ok: boolean
  error?: string
  name?: string
  type?: string
  size?: number
  width?: number
  height?: number
  originalSize: number
}

describe('prepareImage in Chromium', () => {
  let browser: Browser
  let page: Page

  /** Build a noisy picture of the given size in the page, hand it to `prepareImage`, and report what came back. */
  function run(options: { width: number; height: number; mime: string; name: string; rules: unknown }): Promise<Outcome> {
    return page.evaluate(async (input) => {
      // `new Function` keeps Vitest from rewriting this `import()` into its own loader, which the page does not have.
      const load = new Function('url', 'return import(url)') as (url: string) => Promise<typeof import('../../packages/editor/src/ui/prepare-image')>
      const { prepareImage } = await load('/ui/prepare-image.js')
      const canvas = document.createElement('canvas')
      canvas.width = input.width
      canvas.height = input.height
      const context = canvas.getContext('2d')
      if (context === null) throw new Error('no 2d context')
      const gradient = context.createLinearGradient(0, 0, input.width, input.height)
      gradient.addColorStop(0, '#d94f30')
      gradient.addColorStop(1, '#2a6f97')
      context.fillStyle = gradient
      context.fillRect(0, 0, input.width, input.height)
      for (let i = 0; i < 4000; i += 1) {
        context.fillStyle = `hsl(${(i * 37) % 360} 70% 50%)`
        context.fillRect((i * 97) % input.width, (i * 61) % input.height, 12, 12)
      }
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((made) => (made ? resolve(made) : reject(new Error('encode failed'))), input.mime, 0.95),
      )
      const original = new File([blob], input.name, { type: input.mime })
      const result = await prepareImage(original, input.rules as never)
      if (!result.ok) return { ok: false, error: result.error, originalSize: original.size }
      const bitmap = await createImageBitmap(result.file)
      const outcome = {
        ok: true,
        name: result.file.name,
        type: result.file.type,
        size: result.file.size,
        width: bitmap.width,
        height: bitmap.height,
        originalSize: original.size,
      }
      bitmap.close()
      return outcome
    }, options)
  }

  beforeAll(async () => {
    browser = await launchBrowser()
    page = await (await browser.newContext()).newPage()
    await page.route(`${ORIGIN}/**`, async (route) => {
      const { pathname } = new URL(route.request().url())
      if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>x</title>' })
      if (pathname === '/ui/prepare-image.js') return route.fulfill({ contentType: 'text/javascript', body: moduleSource('ui/prepare-image.ts') })
      if (pathname === '/upload-rules.js') return route.fulfill({ contentType: 'text/javascript', body: moduleSource('upload-rules.ts') })
      return route.fulfill({ status: 404, body: '' })
    })
    await page.goto(`${ORIGIN}/`)
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
  })

  const convert = (maxWidth: number | null) => ({ maxBytes: 5 * 1_048_576, convert: { to: 'webp', maxWidth, quality: 0.8 } })

  it('scales a wide JPEG to the width cap and returns a smaller WebP', async () => {
    const result = await run({ width: 3000, height: 2000, mime: 'image/jpeg', name: 'IMG_0412.jpg', rules: convert(1200) })
    expect(result.ok).toBe(true)
    expect(result.type).toBe('image/webp')
    expect(result.name).toBe('IMG_0412.webp')
    expect(result.width).toBe(1200)
    expect(result.height).toBe(800)
    expect(result.size).toBeLessThan(result.originalSize)
  })

  it('never scales an image up', async () => {
    const result = await run({ width: 600, height: 400, mime: 'image/png', name: 'small.png', rules: convert(1200) })
    expect(result.ok).toBe(true)
    if (result.type === 'image/webp') expect(result.width).toBe(600)
  })

  it('leaves an image alone when conversion is off', async () => {
    const result = await run({ width: 800, height: 600, mime: 'image/jpeg', name: 'plain.jpg', rules: { maxBytes: 5 * 1_048_576, convert: null } })
    expect(result).toMatchObject({ ok: true, name: 'plain.jpg', type: 'image/jpeg', size: result.originalSize })
  })

  it('refuses a file over the limit before any upload', async () => {
    const result = await run({ width: 1600, height: 1200, mime: 'image/jpeg', name: 'big.jpg', rules: { maxBytes: 2048, convert: null } })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/^big\.jpg is .+\. Images must be 2 KB or smaller\./)
  })
})
