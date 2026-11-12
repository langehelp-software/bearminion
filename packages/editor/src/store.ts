import type { Dirent } from 'node:fs'
import { access, readFile, readdir, rm, stat } from 'node:fs/promises'
import { assetFile } from './asset-refs.js'
import { writeTextAtomic } from './atomic-write.js'
import { deleteImage, listImages, saveImage } from './images.js'
import {
  PAGES_DIR,
  SITE_KEY,
  StoreKeyError,
  pageKey,
  parseKey,
  repoKey,
  type ContentStore,
  type StoredAsset,
  type StoreOperation,
  type UploadStore,
  type VideoStore,
} from './store-core.js'
import { resolveInside } from './security.js'
import type { VideoKind } from './video-sniff.js'
import { deleteVideo, listVideos, saveVideo } from './videos.js'

export interface FileStoreOptions {
  /** Project root. Upload paths are relative to it. */
  root: string
  contentDir: string
  uploadsDir: string
  /** Where uploaded videos go. Without it the store takes no video uploads. */
  videosDir?: string
}

/** The content store for a local project: content as JSON files, uploads in a folder. */
export function createFileStore({ root, contentDir, uploadsDir, videosDir }: FileStoreOptions): ContentStore {
  function resolve(key: string): string {
    const { base, parts } = parseKey(key)
    const resolved = resolveInside(base === 'root' ? root : contentDir, ...parts)
    if (resolved === null) throw new StoreKeyError(key)
    return resolved
  }

  return {
    async read(key) {
      try {
        return await readFile(resolve(key), 'utf8')
      } catch (error) {
        if (isErrno(error) && error.code === 'ENOENT') return undefined
        throw error
      }
    },

    async exists(key) {
      const filePath = resolve(key)
      return access(filePath).then(
        () => true,
        () => false,
      )
    },

    async list(dir) {
      const directory = resolve(dir)
      let entries: Dirent[]
      try {
        entries = await readdir(directory, { withFileTypes: true })
      } catch (error) {
        if (isErrno(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return undefined
        throw error
      }
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b))
    },

    async apply(operations) {
      // Resolve every key first so a bad one fails before anything is written.
      const planned = operations.map((operation) => ({ operation, filePath: resolve(operation.key) }))
      for (const { operation, filePath } of planned) {
        if (operation.type === 'write') await writeTextAtomic(filePath, operation.text)
      }
      for (const { operation, filePath } of planned) {
        if (operation.type === 'remove') await rm(filePath, { force: true })
      }
    },

    async assetExists(src) {
      const filePath = assetFile(root, uploadsDir, src)
      if (filePath === null) return false
      return stat(filePath).then(
        (info) => info.isFile(),
        () => false,
      )
    },

    ...(videosDir === undefined
      ? {}
      : {
          videos: {
            list: () => listVideos(root, videosDir),
            save: ({ originalName, bytes, kind }: { originalName: string; bytes: Uint8Array; kind: VideoKind }) =>
              saveVideo({ root, videosDir, originalName, bytes, kind }),
            remove: (filename: string) => deleteVideo(videosDir, filename),
          } satisfies VideoStore,
        }),

    uploads: {
      async list() {
        return listImages(root, uploadsDir)
      },
      async save({ originalName, bytes, kind }) {
        return saveImage({ root, uploadsDir, originalName, bytes, kind })
      },
      async remove(filename) {
        return deleteImage(uploadsDir, filename)
      },
    },
  }
}

function isErrno(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

export { PAGES_DIR, SITE_KEY, StoreKeyError, pageKey, repoKey }
export type { ContentStore, StoredAsset, StoreOperation, UploadStore, VideoStore }
