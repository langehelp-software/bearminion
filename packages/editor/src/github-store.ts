import { isAssetPath } from './asset-paths.js'
import type { ListedImage, SavedImage } from './images.js'
import { StoreError, StoreKeyError } from './store-error.js'
import type { ContentStore, StoreOperation, UploadStore } from './store.js'
import { hasImageExtension, isUploadFilename, uploadFilename } from './upload-names.js'

/*
 * A content store whose files live in a GitHub repository. Web-standard `fetch` only (no Node imports), so the same
 * code can run in a Worker or a serverless function.
 */

export interface GithubStoreOptions {
  /** `owner/name`. */
  repo: string
  /**
   * A token that may write to the repository: a fine-grained personal access token with "Contents: Read and write" on
   * this one repository. Keep it in the environment, never in a file the repository tracks.
   */
  token: string
  /** The branch edits are committed to. Default: the repository's default branch. */
  branch?: string
  /** The folder of the site inside the repository. Default: the repository root. */
  rootDir?: string
  /** The content folder, relative to `rootDir`. Default `content`. */
  contentDir?: string
  /** The folder uploaded images go to, relative to `rootDir`. Default `src/assets/uploads`. */
  uploadsDir?: string
  /** The commit message for a change. Default: `Update pages/about.json`, `Update 3 files`, `Upload photo-1a2b3c4d.jpg`. */
  message?: (change: { written: readonly string[]; removed: readonly string[] }) => string
  /** The GitHub API. Default `https://api.github.com`. Set it for GitHub Enterprise. */
  apiUrl?: string
  /** Default: the global `fetch`. */
  fetch?: typeof fetch
}

type Change = { path: string; text: string } | { path: string; bytes: Uint8Array } | { path: string; remove: true }

interface Reply {
  status: number
  headers: Headers
  text: string
}

const API_VERSION = '2022-11-28'
const RAW = 'application/vnd.github.raw+json'
const JSON_TYPE = 'application/vnd.github+json'
/** GitHub's messages for a push that a branch rule refuses. */
const PROTECTED = /protected branch|must be made through a pull request|repository rule violation|required status check/i

function folder(value: string, name: string): string {
  const parts = value.split('/').filter((part) => part !== '')
  if (parts.some((part) => part === '.' || part === '..')) {
    throw new Error(`githubStore(): ${name} must stay inside the repository, got "${value}".`)
  }
  return parts.join('/')
}

const encodePath = (path: string): string => path.split('/').map(encodeURIComponent).join('/')

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

function messageOf(text: string): string {
  try {
    const body = JSON.parse(text) as { message?: unknown }
    return typeof body.message === 'string' ? body.message : ''
  } catch {
    return ''
  }
}

function defaultMessage({ written, removed }: { written: readonly string[]; removed: readonly string[] }): string {
  if (written.length + removed.length === 1) {
    return written.length === 1 ? `Update ${written[0]}` : `Remove ${removed[0]}`
  }
  const count = written.length + removed.length
  return `Update ${count} files`
}

export function githubStore(options: GithubStoreOptions): ContentStore {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(options.repo)
  if (!match) throw new Error(`githubStore(): repo must be "owner/name", got "${options.repo}".`)
  if (typeof options.token !== 'string' || options.token === '') {
    throw new Error('githubStore(): token is required. Use a fine-grained token with "Contents: Read and write" on this repository.')
  }
  const repo = `${match[1]}/${match[2]}`
  const api = (options.apiUrl ?? 'https://api.github.com').replace(/\/+$/, '')
  const doFetch: typeof fetch = options.fetch ?? ((input, init) => fetch(input, init))
  const rootDir = folder(options.rootDir ?? '', 'rootDir')
  const contentDir = folder(options.contentDir ?? 'content', 'contentDir')
  const uploadsDir = folder(options.uploadsDir ?? 'src/assets/uploads', 'uploadsDir')
  const message = options.message ?? defaultMessage

  const inRepo = (...parts: string[]): string => [rootDir, ...parts].filter((part) => part !== '').join('/')

  /** The repository path of a store key, checked the way the file store checks it. */
  function contentPath(key: string): string {
    const parts = key.split('/')
    if (key === '' || parts.some((part) => part === '' || part === '.' || part === '..')) throw new StoreKeyError(key)
    return inRepo(contentDir, key)
  }

  async function send(
    method: string,
    route: string,
    init: { body?: unknown; accept?: string; headers?: Record<string, string> } = {},
  ): Promise<Reply> {
    let response: Response
    try {
      response = await doFetch(`${api}${route}`, {
        method,
        headers: {
          accept: init.accept ?? JSON_TYPE,
          authorization: `Bearer ${options.token}`,
          'x-github-api-version': API_VERSION,
          'user-agent': 'bearminion',
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...init.headers,
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'the request failed'
      throw new StoreError(502, 'github_unreachable', `Could not reach GitHub: ${reason}.`)
    }
    return { status: response.status, headers: response.headers, text: await response.text() }
  }

  /** What went wrong, in words the person editing can act on. */
  function failure(reply: Reply, action: string): StoreError {
    const detail = messageOf(reply.text)
    if (reply.status === 401)
      return new StoreError(502, 'github_auth', 'GitHub refused the token. Check that it is valid and has not expired.')
    if (reply.status === 403 || reply.status === 429) {
      if (reply.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(detail)) {
        return new StoreError(429, 'github_rate_limited', 'GitHub is rate limiting this token. Wait a few minutes and try again.')
      }
      return new StoreError(502, 'github_forbidden', `GitHub refused to ${action}. The token needs "Contents: Read and write" on ${repo}.`)
    }
    if (reply.status === 404) {
      return new StoreError(
        502,
        'github_not_found',
        `GitHub could not find ${repo} or the branch. Check the name, and that the token can see this repository.`,
      )
    }
    return new StoreError(502, 'github_error', `GitHub could not ${action}: ${detail || `HTTP ${reply.status}`}.`)
  }

  async function json<T>(reply: Promise<Reply>, action: string, ok: readonly number[] = [200, 201]): Promise<T> {
    const settled = await reply
    if (!ok.includes(settled.status)) throw failure(settled, action)
    return JSON.parse(settled.text) as T
  }

  let branchName: Promise<string> | undefined
  function branch(): Promise<string> {
    if (options.branch) return Promise.resolve(options.branch)
    branchName ??= json<{ default_branch: string }>(send('GET', `/repos/${repo}`), 'read the repository').then(
      (info) => info.default_branch,
      (error: unknown) => {
        branchName = undefined
        throw error
      },
    )
    return branchName
  }

  /** GETs that GitHub can answer with 304 Not Modified, which costs no rate limit. */
  const cache = new Map<string, { etag: string; text: string }>()
  async function cached(route: string, accept: string): Promise<Reply> {
    const key = `${accept} ${route}`
    const known = cache.get(key)
    const reply = await send('GET', route, { accept, headers: known ? { 'if-none-match': known.etag } : {} })
    if (reply.status === 304 && known) return { ...reply, status: 200, text: known.text }
    const etag = reply.headers.get('etag')
    if (reply.status === 200 && etag) cache.set(key, { etag, text: reply.text })
    return reply
  }

  const contentsRoute = (path: string, ref: string): string => `/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`

  async function readFile(path: string, ref?: string): Promise<string | undefined> {
    const reply = await cached(contentsRoute(path, ref ?? (await branch())), RAW)
    if (reply.status === 404) return undefined
    if (reply.status !== 200) throw failure(reply, `read ${path}`)
    return reply.text
  }

  /** The names of the files directly inside `path`, or `undefined` when there is no such folder. */
  async function listFiles(path: string): Promise<string[] | undefined> {
    const reply = await cached(contentsRoute(path, await branch()), JSON_TYPE)
    if (reply.status === 404) return undefined
    if (reply.status !== 200) throw failure(reply, `list ${path}`)
    const entries = JSON.parse(reply.text) as unknown
    if (!Array.isArray(entries)) return undefined
    return entries
      .filter((entry): entry is { name: string; type: string } => typeof entry === 'object' && entry !== null && 'name' in entry)
      .filter((entry) => entry.type === 'file')
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))
  }

  /** One commit on the branch holding all of `changes`. Goes through the Git Data API so the files land together. */
  async function commit(changes: readonly Change[], describe: (applied: readonly Change[]) => string): Promise<void> {
    const name = await branch()
    const refRoute = `/repos/${repo}/git/refs/heads/${encodePath(name)}`
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const head = await json<{ object: { sha: string } }>(
        send('GET', `/repos/${repo}/git/ref/heads/${encodePath(name)}`),
        'read the branch',
      )
      const parent = await json<{ tree: { sha: string } }>(
        send('GET', `/repos/${repo}/git/commits/${head.object.sha}`),
        'read the latest commit',
      )

      const entries: Record<string, unknown>[] = []
      const applied: Change[] = []
      for (const change of changes) {
        if ('remove' in change) {
          // Removing what is not there is not an error, as it is not for the file store.
          if ((await readFile(change.path, head.object.sha)) === undefined) continue
          entries.push({ path: change.path, mode: '100644', type: 'blob', sha: null })
          applied.push(change)
        } else if ('text' in change) {
          entries.push({ path: change.path, mode: '100644', type: 'blob', content: change.text })
          applied.push(change)
        } else {
          const blob = await json<{ sha: string }>(
            send('POST', `/repos/${repo}/git/blobs`, { body: { content: toBase64(change.bytes), encoding: 'base64' } }),
            `upload ${change.path}`,
          )
          entries.push({ path: change.path, mode: '100644', type: 'blob', sha: blob.sha })
          applied.push(change)
        }
      }
      if (entries.length === 0) return

      const tree = await json<{ sha: string }>(
        send('POST', `/repos/${repo}/git/trees`, { body: { base_tree: parent.tree.sha, tree: entries } }),
        'write the files',
      )
      const created = await json<{ sha: string }>(
        send('POST', `/repos/${repo}/git/commits`, { body: { message: describe(applied), tree: tree.sha, parents: [head.object.sha] } }),
        'create the commit',
      )
      const update = await send('PATCH', refRoute, { body: { sha: created.sha, force: false } })
      if (update.status === 200) return

      if ((update.status === 403 || update.status === 422) && PROTECTED.test(messageOf(update.text))) {
        throw new StoreError(
          409,
          'branch_protected',
          `The branch "${name}" is protected, so edits cannot be committed to it directly. Allow this token to push to it, or use another branch.`,
        )
      }
      // Someone pushed between reading the branch and moving it. The commit above is unreachable now; start again once
      // from the new head. Changes are whole files, so this never merges two edits of the same file.
      if (update.status === 422 && attempt === 0) continue
      if (update.status === 422) {
        throw new StoreError(409, 'branch_moved', 'The branch changed while saving. Reload the editor and try again.')
      }
      throw failure(update, `update the branch "${name}"`)
    }
  }

  const uploads: UploadStore = {
    async list(): Promise<ListedImage[]> {
      const names = (await listFiles(inRepo(uploadsDir))) ?? []
      return names
        .filter((name) => !name.startsWith('.') && hasImageExtension(name))
        .map((filename) => ({ filename, path: `${uploadsDir}/${filename}` }))
    },

    async save({ originalName, bytes, kind }): Promise<SavedImage> {
      const taken = new Set((await listFiles(inRepo(uploadsDir))) ?? [])
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const filename = uploadFilename(originalName, kind)
        if (taken.has(filename)) continue
        await commit([{ path: inRepo(uploadsDir, filename), bytes }], () => `Upload ${filename}`)
        return { filename, path: `${uploadsDir}/${filename}`, bytes: bytes.byteLength }
      }
      throw new Error('Unable to allocate a unique upload filename.')
    },

    async remove(filename): Promise<boolean> {
      if (!isUploadFilename(filename)) return false
      const names = (await listFiles(inRepo(uploadsDir))) ?? []
      if (!names.includes(filename)) return false
      await commit([{ path: inRepo(uploadsDir, filename), remove: true }], () => `Remove ${filename}`)
      return true
    },
  }

  return {
    async read(key) {
      return readFile(contentPath(key))
    },

    async exists(key) {
      return (await readFile(contentPath(key))) !== undefined
    },

    async list(dir) {
      return listFiles(contentPath(dir))
    },

    async apply(operations: readonly StoreOperation[]) {
      // Resolve every key first so a bad one fails before anything is sent.
      const changes: Change[] = operations.map((operation) =>
        operation.type === 'write'
          ? { path: contentPath(operation.key), text: operation.text }
          : { path: contentPath(operation.key), remove: true },
      )
      if (changes.length === 0) return
      await commit(changes, (applied) =>
        message({
          written: applied.filter((change) => !('remove' in change)).map((change) => change.path),
          removed: applied.filter((change) => 'remove' in change).map((change) => change.path),
        }),
      )
    },

    uploads,

    async assetExists(src) {
      if (!isAssetPath(src)) return false
      const slash = src.lastIndexOf('/')
      const names = await listFiles(inRepo(src.slice(0, slash)))
      return names?.includes(src.slice(slash + 1)) ?? false
    },
  }
}
