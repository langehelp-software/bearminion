import { describe, expect, it } from 'vitest'
import { DEFAULT_IMAGE_BYTE_LIMIT, formatBytes, resolveConvert, resolveMaxImageBytes } from '../src/upload-rules.js'

describe('resolveConvert', () => {
  it('is off unless asked for', () => {
    expect(resolveConvert(undefined)).toBeNull()
    expect(resolveConvert(false)).toBeNull()
  })

  it('fills in the defaults', () => {
    expect(resolveConvert({ to: 'webp' })).toEqual({ to: 'webp', maxWidth: null, quality: 0.82 })
    expect(resolveConvert({ to: 'webp', maxWidth: 2400, quality: 0.7 })).toEqual({ to: 'webp', maxWidth: 2400, quality: 0.7 })
  })

  it('refuses values that would break an upload', () => {
    expect(() => resolveConvert({ to: 'webp', maxWidth: 0 })).toThrow(/maxWidth/)
    expect(() => resolveConvert({ to: 'webp', maxWidth: 1200.5 })).toThrow(/maxWidth/)
    expect(() => resolveConvert({ to: 'webp', maxWidth: 99_999 })).toThrow(/maxWidth/)
    expect(() => resolveConvert({ to: 'webp', quality: 0 })).toThrow(/quality/)
    expect(() => resolveConvert({ to: 'webp', quality: 2 })).toThrow(/quality/)
    expect(() => resolveConvert({ to: 'avif' } as never)).toThrow(/webp/)
  })
})

describe('resolveMaxImageBytes', () => {
  it('defaults to 5 MB', () => {
    expect(resolveMaxImageBytes(undefined)).toBe(DEFAULT_IMAGE_BYTE_LIMIT)
    expect(DEFAULT_IMAGE_BYTE_LIMIT).toBe(5 * 1_048_576)
  })

  it('takes whole numbers of bytes from 1 KB up', () => {
    expect(resolveMaxImageBytes(2_000_000)).toBe(2_000_000)
    expect(() => resolveMaxImageBytes(10)).toThrow(/maxImageBytes/)
    expect(() => resolveMaxImageBytes(1.5 * 1024 * 1024 + 0.5)).toThrow(/maxImageBytes/)
  })
})

describe('formatBytes', () => {
  it('writes sizes the way an editor reads them', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(310 * 1024)).toBe('310 KB')
    expect(formatBytes(5 * 1_048_576)).toBe('5 MB')
    expect(formatBytes(4.2 * 1_048_576)).toBe('4.2 MB')
  })
})
