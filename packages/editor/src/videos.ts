import { randomBytes } from 'node:crypto'
import type { Dirent } from 'node:fs'
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isInside, resolveInside } from './security.js'

export type VideoKind = 'mp4' | 'mov' | 'webm' | 'ogv'

const EXTENSION: Record<VideoKind, string> = { mp4: '.mp4', mov: '.mov', webm: '.webm', ogv: '.ogv' }

const MIME_TO_KIND: Record<string, VideoKind> = {
  'video/mp4': 'mp4',
  'video/x-m4v': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
}

/** Default cap for one uploaded video. */
export const DEFAULT_VIDEO_BYTE_LIMIT = 50 * 1_048_576
export { VIDEO_WARN_BYTES } from './videos-shared.js'
/** Room for multipart boundaries around a max-size video. */
export function videoBodyLimit(maxVideoBytes: number): number {
  return maxVideoBytes + 256 * 1024
}

/** The container a file really is, from its first bytes. The file's name and declared type are not trusted. */
export function sniffVideo(bytes: Uint8Array): VideoKind | null {
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12)
    // AVIF images share the container.
    if (brand === 'avif' || brand === 'avis') return null
    return brand === 'qt  ' ? 'mov' : 'mp4'
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    // Matroska and WebM share the EBML header; only the `webm` doctype plays in a browser.
    return ascii(bytes, 0, Math.min(bytes.length, 64)).includes('webm') ? 'webm' : null
  }
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'OggS') return 'ogv'
  return null
}

export function videoKindFromMime(mime: string): VideoKind | null {
  const base = mime.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  return MIME_TO_KIND[base] ?? null
}

export interface SavedVideo {
  filename: string
  /** Project-relative path of the file. */
  path: string
  /** What a Media section's `video` field holds: the file's address on the site, such as `/videos/demo-1a2b.mp4`. */
  url: string
  bytes: number
}

export type ListedVideo = Omit<SavedVideo, 'bytes'> & { bytes?: number }

/** The address a file in `public/` is served at. */
function publicUrl(root: string, filePath: string): string {
  const relative = path.relative(path.resolve(root, 'public'), filePath)
  return `/${relative.split(path.sep).join('/')}`
}

export async function saveVideo(options: {
  root: string
  videosDir: string
  originalName: string
  bytes: Uint8Array
  kind: VideoKind
}): Promise<SavedVideo> {
  await mkdir(options.videosDir, { recursive: true })
  const extension = EXTENSION[options.kind]
  const stem = safeStem(options.originalName)
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const filename = `${stem}-${randomBytes(4).toString('hex')}${extension}`
    const filePath = resolveInside(options.videosDir, filename)
    if (filePath === null) throw new Error('Resolved upload path escaped the videos directory.')
    try {
      await writeFile(filePath, options.bytes, { flag: 'wx' })
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'EEXIST') continue
      throw error
    }
    if (!isInside(options.root, filePath)) throw new Error('Upload path is outside the project root.')
    return {
      filename,
      path: path.relative(options.root, filePath).split(path.sep).join('/'),
      url: publicUrl(options.root, filePath),
      bytes: options.bytes.byteLength,
    }
  }
  throw new Error('Unable to allocate a unique upload filename.')
}

export async function listVideos(root: string, videosDir: string): Promise<ListedVideo[]> {
  let entries: Dirent[]
  try {
    entries = await readdir(videosDir, { withFileTypes: true })
  } catch {
    return []
  }
  const videos: ListedVideo[] = []
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.')) continue
    if (!Object.values(EXTENSION).includes(path.extname(entry.name).toLowerCase())) continue
    const filePath = resolveInside(videosDir, entry.name)
    if (filePath === null) continue
    const info = await stat(filePath).catch(() => null)
    videos.push({
      filename: entry.name,
      path: path.relative(root, filePath).split(path.sep).join('/'),
      url: publicUrl(root, filePath),
      ...(info ? { bytes: info.size } : {}),
    })
  }
  videos.sort((a, b) => a.filename.localeCompare(b.filename))
  return videos
}

/** Delete one uploaded video by file name. False when there is no such file or the name is not a plain video file name. */
export async function deleteVideo(videosDir: string, filename: string): Promise<boolean> {
  if (filename !== path.basename(filename) || filename.startsWith('.')) return false
  if (!Object.values(EXTENSION).includes(path.extname(filename).toLowerCase())) return false
  const filePath = resolveInside(videosDir, filename)
  if (filePath === null) return false
  try {
    if (!(await stat(filePath)).isFile()) return false
    await unlink(filePath)
    return true
  } catch {
    return false
  }
}

function safeStem(originalName: string): string {
  const base = path.win32.basename(path.basename(originalName))
  const cleaned = base
    .replace(/\.[^.]+$/, '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return cleaned || 'video'
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
  return Buffer.from(bytes.subarray(from, to)).toString('latin1')
}
