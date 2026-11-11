import type { ImageKind } from './upload-names.js'
import { DEFAULT_IMAGE_BYTE_LIMIT } from './upload-rules.js'

/*
 * What an uploaded image is, from its bytes, and how large a request may be. Pure: no Node imports, so the editor API
 * can run where there is no file system. The file-system half lives in `images.ts`.
 */

const MIME_TO_KIND: Record<string, ImageKind> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (isPng(bytes)) return 'png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (isGif(bytes)) return 'gif'
  if (isWebp(bytes)) return 'webp'
  if (isAvif(bytes)) return 'avif'
  return null
}

export function kindFromMime(mime: string): ImageKind | null {
  const base = mime.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  return MIME_TO_KIND[base] ?? null
}

export interface SavedImage {
  filename: string
  path: string
  bytes: number
}

export interface ListedImage {
  filename: string
  path: string
}

export function imageTooLarge(size: number, maxBytes: number = DEFAULT_IMAGE_BYTE_LIMIT): boolean {
  return size > maxBytes
}

/** The largest request body an image upload may have: the file plus room for the multipart boundaries. */
export function imageBodyLimit(maxBytes: number): number {
  return maxBytes + 256 * 1024
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
}

function isGif(bytes: Uint8Array): boolean {
  if (bytes.length < 6) return false
  const header = ascii(bytes.subarray(0, 6))
  return header === 'GIF87a' || header === 'GIF89a'
}

function isWebp(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && ascii(bytes.subarray(0, 4)) === 'RIFF' && ascii(bytes.subarray(8, 12)) === 'WEBP'
}

function isAvif(bytes: Uint8Array): boolean {
  if (bytes.length < 12 || ascii(bytes.subarray(4, 8)) !== 'ftyp') return false
  const brand = ascii(bytes.subarray(8, 12))
  if (brand === 'avif' || brand === 'avis') return true
  return ascii(bytes.subarray(16)).includes('avif') || ascii(bytes.subarray(16)).includes('avis')
}

function ascii(bytes: Uint8Array): string {
  const sample = bytes.byteLength > 64 ? bytes.subarray(0, 64) : bytes
  let text = ''
  for (const byte of sample) text += String.fromCharCode(byte & 0x7f)
  return text
}
