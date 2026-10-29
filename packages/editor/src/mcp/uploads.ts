import fs from 'node:fs/promises'
import path from 'node:path'
import { type ImageKind, sniffImage } from '../images.js'
import { IMAGE_BYTE_LIMIT, isInside } from '../security.js'
import { sniffVideo, type VideoKind } from '../videos.js'

const IMAGE_MIME: Record<ImageKind, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
}
const VIDEO_MIME: Record<VideoKind, string> = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', ogv: 'video/ogg' }

/** A refused upload. The message says why and what to do, and goes back to the assistant as it is. */
export class UploadRefused extends Error {}

/**
 * Where an assistant may read a file from: the project, and the folders the person named with `--uploads-from`.
 * A path inside the project is allowed because the assistant can already read and write it; a folder outside it
 * (Downloads, the desktop) needs the person's say-so, since a copy lands in a folder the public site serves.
 */
export async function allowedRoots(root: string, uploadsFrom: readonly string[]): Promise<string[]> {
  const roots: string[] = []
  for (const dir of [root, ...uploadsFrom.map((entry) => path.resolve(root, entry))]) {
    try {
      roots.push(await fs.realpath(dir))
    } catch {
      // A folder that does not exist allows nothing.
    }
  }
  return roots
}

async function readAllowed(filePath: string, roots: readonly string[], limit: number): Promise<{ bytes: Uint8Array; name: string }> {
  let real: string
  try {
    real = await fs.realpath(filePath)
  } catch {
    throw new UploadRefused(`There is no file at ${filePath}.`)
  }
  // The real path is checked, so a link inside the project that points outside it does not get through.
  if (!roots.some((allowed) => isInside(allowed, real))) {
    throw new UploadRefused(
      `${filePath} is outside the folders this server may read from: the project, and any folder given with --uploads-from. Call request_upload to let the person choose the file in their browser, or ask them to start the server with --uploads-from <folder>.`,
    )
  }
  const info = await fs.stat(real)
  if (!info.isFile()) throw new UploadRefused(`${filePath} is not a file.`)
  if (info.size > limit)
    throw new UploadRefused(`${filePath} is ${Math.ceil(info.size / 1_048_576)} MB; the limit is ${Math.floor(limit / 1_048_576)} MB.`)
  return { bytes: new Uint8Array(await fs.readFile(real)), name: path.basename(real) }
}

/** An image from a path, as the upload route expects it: a file with the type its bytes really have. */
export async function imageFromPath(filePath: string, roots: readonly string[], name?: string): Promise<File> {
  const { bytes, name: baseName } = await readAllowed(filePath, roots, IMAGE_BYTE_LIMIT)
  const kind = sniffImage(bytes)
  if (kind === null) throw new UploadRefused(`${filePath} is not a png, jpeg, webp, gif or avif image.`)
  return new File([bytes as BlobPart], name ?? baseName, { type: IMAGE_MIME[kind] })
}

export async function videoFromPath(filePath: string, roots: readonly string[], limit: number, name?: string): Promise<File> {
  const { bytes, name: baseName } = await readAllowed(filePath, roots, limit)
  const kind = sniffVideo(bytes)
  if (kind === null) throw new UploadRefused(`${filePath} is not an mp4, webm, mov or ogv video.`)
  return new File([bytes as BlobPart], name ?? baseName, { type: VIDEO_MIME[kind] })
}
