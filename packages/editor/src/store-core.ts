import type { ListedImage, SavedImage } from './image-sniff.js'
import { StoreKeyError } from './store-error.js'
import type { ImageKind } from './upload-names.js'
import type { ListedVideo, SavedVideo, VideoKind } from './video-sniff.js'

export { StoreKeyError }

/**
 * Where the editor reads and writes content. The editor API talks only to this interface, so the
 * place the files live is a choice: {@link createFileStore} uses the local project, and another
 * implementation (a Git host's API, say) can stand in without touching the API handlers.
 *
 * Keys are `/`-separated paths relative to the content directory: `site.json`, `pages/about.json`. A key with a
 * leading slash is relative to the project root instead (`/src/content/blog/en/post.md`), for files that live outside
 * the content directory, such as Markdown collections. See {@link repoKey}.
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
  /** Uploaded videos, served from `public/`. Absent in stores that only hold images. */
  readonly videos?: VideoStore
  /**
   * Whether the image file an image field points at (`src/assets/...`) exists. Saves that point at a missing file
   * fail validation. A store without it skips that check.
   */
  assetExists?(src: string): Promise<boolean>
  /**
   * A view of the store for editing one entry (`page:about`, `site`), for stores that keep each entry's pending edits
   * apart, such as `githubStore` in `pr` mode, where every scope is a branch and a pull request. Reads see the entry's
   * pending edits, writes go to them. Absent when every write goes to the same place.
   */
  scoped?(scope: string): ContentStore
}

export type StoreOperation = { type: 'write'; key: string; text: string } | { type: 'remove'; key: string }

export interface UploadStore {
  list(): Promise<ListedImage[]>
  /** Store the bytes under a unique, sanitised name and return where it went. `path` is what image fields hold. */
  save(input: { originalName: string; bytes: Uint8Array; kind: ImageKind }): Promise<SavedImage>
  /** Delete one upload by file name. False when there is no such upload. */
  remove(filename: string): Promise<boolean>
}

export interface VideoStore {
  list(): Promise<ListedVideo[]>
  save(input: { originalName: string; bytes: Uint8Array; kind: VideoKind }): Promise<SavedVideo>
  remove(filename: string): Promise<boolean>
}

/** The key of a file by its path from the project root, for content outside the content directory. */
export function repoKey(path: string): string {
  return `/${path}`
}

/** Where a key points: the content directory or the project root, and the path segments inside it. */
export interface ParsedKey {
  base: 'content' | 'root'
  parts: string[]
}

/** Splits a store key and refuses anything empty, with empty or dot segments, or leaving its base. */
export function parseKey(key: string): ParsedKey {
  const base = key.startsWith('/') ? 'root' : 'content'
  const parts = (base === 'root' ? key.slice(1) : key).split('/')
  if (key === '' || parts.some((part) => part === '' || part === '.' || part === '..')) throw new StoreKeyError(key)
  return { base, parts }
}

export const SITE_KEY = 'site.json'
export const PAGES_DIR = 'pages'

/** The key of the page with this slug. The slug must already be validated (`readSlug`). */
export function pageKey(slug: string): string {
  return `${PAGES_DIR}/${slug}.json`
}
