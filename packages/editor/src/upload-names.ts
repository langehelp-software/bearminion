/* Pure helpers for naming uploaded images. The Git store uses them too, so nothing here may touch node:*. */

export type ImageKind = 'png' | 'jpeg' | 'webp' | 'gif' | 'avif'

export const IMAGE_EXTENSION: Record<ImageKind, string> = {
  png: '.png',
  jpeg: '.jpg',
  webp: '.webp',
  gif: '.gif',
  avif: '.avif',
}

const EXTENSIONS: readonly string[] = Object.values(IMAGE_EXTENSION)

/** True for a file name with an image extension the editor handles. */
export function hasImageExtension(name: string): boolean {
  const dot = name.lastIndexOf('.')
  return dot > 0 && EXTENSIONS.includes(name.slice(dot).toLowerCase())
}

/** A plain image file name: no folders, no leading dot, an extension the editor handles. */
export function isUploadFilename(name: string): boolean {
  return name !== '' && !name.includes('/') && !name.includes('\\') && !name.startsWith('.') && hasImageExtension(name)
}

/** The readable part of an upload's name: the original file name, lowercase ASCII, at most 48 characters. */
const PLAIN_LETTERS: Record<string, string> = { ł: 'l', đ: 'd', ø: 'o', ð: 'd', þ: 'th', ß: 'ss', æ: 'ae', œ: 'oe', ı: 'i' }

export function uploadStem(originalName: string): string {
  const base = originalName.split(/[\\/]/).pop() ?? ''
  const stem = base.replace(/\.[^.]+$/, '')
  const cleaned = stem
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[łđøðþßæœı]/g, (letter) => PLAIN_LETTERS[letter] ?? letter)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return cleaned || 'image'
}

/** `photo-1a2b3c4d.jpg`: the stem, eight random hex digits, the extension for the sniffed kind. */
export function uploadFilename(originalName: string, kind: ImageKind): string {
  const random = crypto.getRandomValues(new Uint8Array(4))
  const suffix = Array.from(random, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${uploadStem(originalName)}-${suffix}${IMAGE_EXTENSION[kind]}`
}
