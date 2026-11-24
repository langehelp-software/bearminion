import { isAssetPath } from './asset-paths.js'

/*
 * Version history from the repository: the commits that touched the content, the uploads and the videos, what each
 * changed, and restoring files as they were at one of them. Pure, so the API can run where there is no git: `git.ts`
 * reads a local work tree, `githubStore` reads GitHub.
 */

export type VersionFileStatus = 'added' | 'modified' | 'deleted' | 'renamed'

export interface VersionFile {
  /** Path from the project root, with `/` separators. */
  path: string
  status: VersionFileStatus
  /** A rename: where the file was before. */
  from?: string
  /** The store key of a content file (`site.json`, `pages/about.json`), so the editor can tell what document it is. */
  key?: string
  /** An image or video: the path content points at. */
  asset?: boolean
}

export interface VersionCommit {
  sha: string
  short: string
  /** First line of the message. */
  message: string
  author: string
  /** ISO time the commit was made. */
  at: string
  /** The first parent, or undefined for a root commit. */
  parent?: string
  /** Not merged yet: the commit is on this pull-request branch, not on the published branch. */
  branch?: string
}

export interface VersionPage {
  commits: VersionCommit[]
  /** Pass back to get the next, older page. Absent at the end. */
  cursor?: string
  /** The published branch. */
  branch?: string
  /** Restore makes a commit. False for a local project with `git` off, where it only writes the files. */
  restoreCommits: boolean
}

export interface RestoreResult {
  /** The new commit, or undefined when the files were only written (local, `git` off). */
  commit?: string
  written: string[]
  removed: string[]
}

export class VersionError extends Error {
  constructor(
    readonly code: 'not_repo' | 'not_found' | 'dirty' | 'empty' | 'invalid' | 'failed',
    message: string,
  ) {
    super(message)
  }
}

export interface VersionsPort {
  /** Commits that touched the content, uploads or videos (and `also`, project-relative folders), newest first. */
  list(page: { cursor?: string; limit: number; also?: readonly string[] }): Promise<VersionPage>
  /** One commit and the files it changed under those folders. Undefined for an unknown commit. */
  get(sha: string, also?: readonly string[]): Promise<{ commit: VersionCommit; files: VersionFile[] } | undefined>
  /** The bytes of `path` as it was at `sha`, or undefined when it did not exist there. */
  read(sha: string, path: string): Promise<Uint8Array | undefined>
  /**
   * Put the files `sha` changed (all, or only `paths` of them) back as they were at `sha`, with the images and videos
   * they point at that are gone since, as one new commit.
   */
  restore(sha: string, options: { paths?: readonly string[]; also?: readonly string[] }): Promise<RestoreResult>
}

const SHA = /^[0-9a-f]{7,64}$/

export function isSha(value: string): boolean {
  return SHA.test(value)
}

/** A safe project-relative path: no empty, dot or absolute segments. */
export function isProjectPath(value: string): boolean {
  if (value === '' || value.startsWith('/') || value.includes('\\') || value.includes('\0')) return false
  return value.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
}

/** `src/assets/...` paths a restored file points at. JSON is walked; anything else is scanned as text. */
export function referencedAssets(path: string, text: string): string[] {
  const found = new Set<string>()
  if (path.endsWith('.json')) {
    const visit = (value: unknown) => {
      if (typeof value === 'string') {
        if (isAssetPath(value)) found.add(value)
      } else if (Array.isArray(value)) value.forEach(visit)
      else if (value && typeof value === 'object') Object.values(value).forEach(visit)
    }
    try {
      visit(JSON.parse(text))
    } catch {
      // Not JSON after all: no references.
    }
  } else {
    for (const match of text.matchAll(/src\/assets\/[^\s"'`()<>[\]{}]+/g)) if (isAssetPath(match[0])) found.add(match[0])
  }
  return [...found]
}

export type RestoreChange = { path: string; bytes: Uint8Array } | { path: string; remove: true }

/**
 * The writes that put `files` back as they were at `sha`: each file's old bytes, or its removal when it did not exist
 * there, then the assets the restored text points at that exist at `sha` but not now.
 */
export async function planRestore(
  sha: string,
  files: readonly VersionFile[],
  io: {
    read(sha: string, path: string): Promise<Uint8Array | undefined>
    exists(path: string): Promise<boolean>
    /** Whether the file is already exactly `bytes`. Without it, every file is written. */
    same?(path: string, bytes: Uint8Array): Promise<boolean>
  },
): Promise<RestoreChange[]> {
  const changes: RestoreChange[] = []
  const planned = new Set<string>()
  const decoder = new TextDecoder()
  const assets = new Set<string>()
  for (const file of files) {
    const bytes = await io.read(sha, file.path)
    if (bytes === undefined) {
      if (await io.exists(file.path)) changes.push({ path: file.path, remove: true })
    } else {
      if (!(await io.same?.(file.path, bytes))) changes.push({ path: file.path, bytes })
      if (!file.asset) for (const src of referencedAssets(file.path, decoder.decode(bytes))) assets.add(src)
    }
    planned.add(file.path)
  }
  for (const src of assets) {
    if (planned.has(src) || (await io.exists(src))) continue
    const bytes = await io.read(sha, src)
    if (bytes !== undefined) changes.push({ path: src, bytes })
  }
  return changes
}

/** "Restore pages/about.json from a1b2c3d" or "Restore 3 files from a1b2c3d". */
export function restoreMessage(short: string, changes: readonly RestoreChange[]): string {
  const only = changes.length === 1 ? changes[0] : undefined
  return only ? `Restore ${only.path} from ${short}` : `Restore ${changes.length} files from ${short}`
}

/** The paths of `changes` that are written and that are removed. */
export function changeSummary(changes: readonly RestoreChange[]): { written: string[]; removed: string[] } {
  return {
    written: changes.filter((change) => !('remove' in change)).map((change) => change.path),
    removed: changes.filter((change) => 'remove' in change).map((change) => change.path),
  }
}
