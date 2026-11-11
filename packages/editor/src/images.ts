import { randomBytes } from 'node:crypto'
import type { Dirent } from 'node:fs'
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ListedImage, SavedImage } from './image-sniff.js'
import { isInside, resolveInside } from './security.js'
import { IMAGE_EXTENSION as EXTENSION, type ImageKind, uploadStem } from './upload-names.js'

export type { ImageKind }
export { imageBodyLimit, imageTooLarge, kindFromMime, sniffImage } from './image-sniff.js'
export type { ListedImage, SavedImage } from './image-sniff.js'

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
  const stem = uploadStem(options.originalName)
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

function projectRelative(root: string, filePath: string): string {
  const relative = path.relative(root, filePath)
  if (!isInside(root, filePath)) {
    throw new Error('Upload path is outside the project root.')
  }
  return relative.split(path.sep).join('/')
}

function isErrno(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
