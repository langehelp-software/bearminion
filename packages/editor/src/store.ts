import type { Dirent } from 'node:fs'
import { access, readFile, readdir, rm, stat } from 'node:fs/promises'
import { assetFile } from './asset-refs.js'
import { writeTextAtomic } from './atomic-write.js'
import { deleteImage, listImages, saveImage, type ImageKind, type ListedImage, type SavedImage } from './images.js'
import { resolveInside } from './security.js'

/**
 * Where the editor reads and writes content. The editor API talks only to this interface, so the
 * place the files live is a choice: {@link createFileStore} uses the local project, and another
 * implementation (a Git host's API, say) can stand in without touching the API handlers.
 *
 * Keys are `/`-separated paths relative to the content directory: `site.json`, `pages/about.json`.
 * Values are text. Parsing, validation and the JSON layout belong to the caller.
 *
 * Not part of the store: undo history (local editor state in `.editor/`), `Commit changes`
 * (needs a local git work tree), and the loaders that run at build time.
 */
export interface ContentStore {
  /** The text at `key`, or `undefined` when there is none. */
  read(key: string): Promise<string | undefined>
  exists(key: string): Promise<boolean>
  /** Names of the files directly inside the directory `dir`, sorted, or `undefined` when it does not exist. */
  list(dir: string): Promise<string[] | undefined>
  /**
   * Apply changes that belong together, such as a rename (write the new file, remove the old one).
   * Writes run before removals, so a failure never leaves the content with a page missing. An
   * implementation that can make the whole batch atomic (one commit) should.
   */
  apply(operations: readonly StoreOperation[]): Promise<void>
  /** Uploaded images. */
  readonly uploads: UploadStore
  /**
   * Whether the image file an image field points at (`src/assets/...`) exists. Saves that point at a missing file
   * fail validation. A store without it skips that check.
   */
  assetExists?(src: string): Promise<boolean>
}

export type StoreOperation = { type: 'write'; key: string; text: string } | { type: 'remove'; key: string }

export interface UploadStore {
  list(): Promise<ListedImage[]>
  /** Store the bytes under a unique, sanitised name and return where it went. `path` is what image fields hold. */
  save(input: { originalName: string; bytes: Uint8Array; kind: ImageKind }): Promise<SavedImage>
  /** Delete one upload by file name. False when there is no such upload. */
  remove(filename: string): Promise<boolean>
}

/** A key that is empty, absolute or leaves the content directory. */
export class StoreKeyError extends Error {
  constructor(key: string) {
    super(`"${key}" is not a path inside the content directory.`)
    this.name = 'StoreKeyError'
  }
}

export const SITE_KEY = 'site.json'
export const PAGES_DIR = 'pages'

/** The key of the page with this slug. The slug must already be validated (`readSlug`). */
export function pageKey(slug: string): string {
  return `${PAGES_DIR}/${slug}.json`
}

export interface FileStoreOptions {
  /** Project root. Upload paths are relative to it. */
  root: string
  contentDir: string
  uploadsDir: string
}

/** The content store for a local project: content as JSON files, uploads in a folder. */
export function createFileStore({ root, contentDir, uploadsDir }: FileStoreOptions): ContentStore {
  function resolve(key: string): string {
    const parts = key.split('/')
    if (key === '' || parts.some((part) => part === '' || part === '.' || part === '..')) throw new StoreKeyError(key)
    const resolved = resolveInside(contentDir, ...parts)
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
