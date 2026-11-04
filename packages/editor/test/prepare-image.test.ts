import { describe, expect, it } from 'vitest'
import { prepareImage, type ConvertedImage, type ImageCodec } from '../src/ui/prepare-image.js'
import type { UploadRules } from '../src/upload-rules.js'

const MB = 1_048_576
const file = (size: number, name = 'photo.jpg', type = 'image/jpeg') => new File([new Uint8Array(size)], name, { type })

const convertTo = (maxWidth: number | null = null): UploadRules => ({ maxBytes: 5 * MB, convert: { to: 'webp', maxWidth, quality: 0.8 } })
const off: UploadRules = { maxBytes: 5 * MB, convert: null }

/** A codec that answers with a WebP of the given size, or whatever the test needs. */
const codec = (answer: ConvertedImage | null | Error): ImageCodec => ({
  async toWebp() {
    if (answer instanceof Error) throw answer
    return answer
  },
})
const webp = (size: number, resized = false, type = 'image/webp'): ConvertedImage => ({
  blob: new Blob([new Uint8Array(size)], { type }),
  resized,
})

describe('prepareImage without conversion', () => {
  it('passes a file within the limit through untouched', async () => {
    const original = file(MB)
    const result = await prepareImage(original, off, codec(new Error('must not be called')))
    expect(result).toEqual({ ok: true, file: original })
  })

  it('refuses a file over the limit before anything is uploaded, with sizes in the message', async () => {
    const result = await prepareImage(file(6 * MB, 'big.jpg'), off, codec(null))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toBe('big.jpg is 6 MB. Images must be 5 MB or smaller. Use a smaller image.')
  })

  it('accepts a file of exactly the limit', async () => {
    expect((await prepareImage(file(5 * MB), off, codec(null))).ok).toBe(true)
  })
})

describe('prepareImage with conversion', () => {
  it('replaces a large photo with the smaller WebP and renames it', async () => {
    const result = await prepareImage(file(12 * MB, 'IMG_0412.jpeg'), convertTo(2400), codec(webp(300 * 1024, true)))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.file.name).toBe('IMG_0412.webp')
    expect(result.file.type).toBe('image/webp')
    expect(result.file.size).toBe(300 * 1024)
  })

  it('converts a photo that was already under the limit, to keep the repository light', async () => {
    const result = await prepareImage(file(3 * MB), convertTo(), codec(webp(200 * 1024)))
    expect(result.ok && result.file.type).toBe('image/webp')
  })

  it('keeps the original when the WebP is not smaller and nothing was scaled', async () => {
    const original = file(100 * 1024, 'logo.png', 'image/png')
    const result = await prepareImage(original, convertTo(), codec(webp(140 * 1024)))
    expect(result).toEqual({ ok: true, file: original })
  })

  it('uses a larger WebP when the image had to be scaled down to the width cap', async () => {
    const result = await prepareImage(file(100 * 1024, 'wide.png', 'image/png'), convertTo(800), codec(webp(140 * 1024, true)))
    expect(result.ok && result.file.name).toBe('wide.webp')
  })

  it('keeps the original when the browser cannot encode WebP and hands back another type', async () => {
    const original = file(MB)
    const result = await prepareImage(original, convertTo(), codec(webp(2000, false, 'image/png')))
    expect(result).toEqual({ ok: true, file: original })
  })

  it('keeps the original when the image cannot be decoded, and still enforces the limit', async () => {
    const small = file(MB)
    expect(await prepareImage(small, convertTo(), codec(null))).toEqual({ ok: true, file: small })
    expect(await prepareImage(small, convertTo(), codec(new Error('decode failed')))).toEqual({ ok: true, file: small })
    const huge = await prepareImage(file(9 * MB), convertTo(), codec(null))
    expect(huge.ok).toBe(false)
  })

  it('never converts a GIF, which may be animated', async () => {
    const gif = file(MB, 'spin.gif', 'image/gif')
    const result = await prepareImage(gif, convertTo(), codec(new Error('must not be called')))
    expect(result).toEqual({ ok: true, file: gif })
    expect((await prepareImage(file(6 * MB, 'spin.gif', 'image/gif'), convertTo(), codec(null))).ok).toBe(false)
  })

  it('refuses a converted file that is still over the limit, without suggesting a smaller image', async () => {
    const rules: UploadRules = { maxBytes: 100 * 1024, convert: { to: 'webp', maxWidth: null, quality: 0.8 } }
    const result = await prepareImage(file(9 * MB, 'huge.png', 'image/png'), rules, codec(webp(200 * 1024, true)))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toBe('huge.webp is 200 KB. Images must be 100 KB or smaller.')
  })
})
