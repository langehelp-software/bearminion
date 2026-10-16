import { randomBytes } from 'node:crypto'
import type { Dirent } from 'node:fs'
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { IMAGE_BYTE_LIMIT, isInside, resolveInside } from './security.js'

export type ImageKind = 'png' | 'jpeg' | 'webp' | 'gif' | 'avif'

const EXTENSION: Record<ImageKind, string> = {
  png: '.png',
  jpeg: '.jpg',
  webp: '.webp',
  gif: '.gif',
  avif: '.avif',
}

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

/** Write image bytes under `uploadsDir` using a sniffed extension and a unique name. */
export async function saveImage(options: {
  root: string
  uploadsDir: string
  originalName: string
  bytes: Uint8Array
  kind: ImageKind
}): Promise<SavedImage> {
  await mkdir(options.uploadsDir, { recursive: true })
  const extension = EXTENSION[options.kind]
  const stem = safeStem(options.originalName)
  // `wx` fails when the name exists, so a clash with a concurrent upload retries with a new suffix.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const filename = `${stem}-${randomBytes(4).toString('hex')}${extension}`
    const filePath = resolveInside(options.uploadsDir, filename)
    if (filePath === null) throw new Error('Resolved upload path escaped the uploads directory.')
    try {
      await writeFile(filePath, options.bytes, { flag: 'wx' })
    } catch (error) {
      if (isErrno(error) && error.code === 'EEXIST') continue
      throw error
    }
    return { filename, path: projectRelative(options.root, filePath), bytes: options.bytes.byteLength }
  }
  throw new Error('Unable to allocate a unique upload filename.')
}

export interface ListedImage {
  filename: string
  path: string
}

export async function listImages(root: string, uploadsDir: string): Promise<ListedImage[]> {
  let entries: Dirent[]
  try {
    entries = await readdir(uploadsDir, { withFileTypes: true })
  } catch {
    return []
  }
  const images: ListedImage[] = []
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.')) continue
    const extension = path.extname(entry.name).toLowerCase()
    if (!Object.values(EXTENSION).includes(extension)) continue
    const filePath = resolveInside(uploadsDir, entry.name)
    if (filePath === null || !isInside(uploadsDir, filePath)) continue
    images.push({ filename: entry.name, path: projectRelative(root, filePath) })
  }
  images.sort((a, b) => a.filename.localeCompare(b.filename))
  return images
}

/**
 * Delete one uploaded file. The API refuses first when saved content still points at it (`imageUsages`).
 * Returns false when the file does not exist or the name is not a plain image filename in `uploadsDir`.
 */
export async function deleteImage(uploadsDir: string, filename: string): Promise<boolean> {
  if (filename !== path.basename(filename) || filename.startsWith('.')) return false
  const extension = path.extname(filename).toLowerCase()
  if (!Object.values(EXTENSION).includes(extension)) return false
  const filePath = resolveInside(uploadsDir, filename)
  if (filePath === null || !isInside(uploadsDir, filePath)) return false
  try {
    if (!(await stat(filePath)).isFile()) return false
    await unlink(filePath)
    return true
  } catch {
    return false
  }
}

export function imageTooLarge(size: number): boolean {
  return size > IMAGE_BYTE_LIMIT
}

function safeStem(originalName: string): string {
  const base = path.win32.basename(path.basename(originalName))
  const stem = base.replace(/\.[^.]+$/, '')
  const cleaned = stem
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return cleaned || 'image'
}

function projectRelative(root: string, filePath: string): string {
  const relative = path.relative(root, filePath)
  if (!isInside(root, filePath)) {
    throw new Error('Upload path is outside the project root.')
  }
  return relative.split(path.sep).join('/')
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
  return Buffer.from(sample).toString('ascii')
}

function isErrno(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
