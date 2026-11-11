import { isAssetPath } from './asset-paths.js'
import type { ListedImage, SavedImage } from './images.js'
import { StoreError } from './store-error.js'
import { parseKey } from './store-core.js'
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
  /**
   * `direct` (default): a save is a commit on `branch`. `pr`: a save is a commit on a branch of its own for the entry
   * being edited, with a pull request opened on the first save. Nothing here ever merges. Needs "Pull requests: Read
   * and write" besides "Contents: Read and write".
   */
  mode?: 'direct' | 'pr'
  /** `pr` mode: the title and body of the pull request opened for an entry. */
  pullRequest?: (change: { scope: string; written: readonly string[]; removed: readonly string[] }) => { title: string; body: string }
  /** `pr` mode: the label put on the pull requests. Default `bearminion`; `false` for none. */
  label?: string | false
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

/** What a store view needs to know about where it reads and writes. */
interface Target {
  /** The branch or sha reads come from. */
  readRef(): Promise<string>
  /** Every ref an upload may live on, nearest first. */
  refs(): Promise<string[]>
  /** The branch a commit goes to; creates it first when it does not exist yet. */
  writeBranch(): Promise<string>
  /** Runs after a commit landed on `branch`. */
  committed?(branch: string, change: { written: string[]; removed: string[] }): Promise<void>
}

function branchStem(scope: string): string {
  const part = scope
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `bearminion/${part === '' ? 'edit' : part}`
}

const MAX_BRANCHES_PER_SCOPE = 20

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
  const prMode = options.mode === 'pr'
  if (options.mode !== undefined && options.mode !== 'direct' && options.mode !== 'pr') {
    throw new Error(`githubStore(): mode must be "direct" or "pr", got "${String(options.mode)}".`)
  }

  const inRepo = (...parts: string[]): string => [rootDir, ...parts].filter((part) => part !== '').join('/')

  /** The repository path of a store key, checked the way the file store checks it. */
  function contentPath(key: string): string {
    const { base, parts } = parseKey(key)
    return base === 'root' ? inRepo(...parts) : inRepo(contentDir, ...parts)
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
  /** The branch edits are based on: the configured one, or the repository's default. */
  function baseBranch(): Promise<string> {
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

  async function readFileAt(path: string, ref: string): Promise<string | undefined> {
    const reply = await cached(contentsRoute(path, ref), RAW)
    if (reply.status === 404) return undefined
    if (reply.status !== 200) throw failure(reply, `read ${path}`)
    return reply.text
  }

  /** The names of the files directly inside `path`, or `undefined` when there is no such folder. */
  async function listFilesAt(path: string, ref: string): Promise<string[] | undefined> {
    const reply = await cached(contentsRoute(path, ref), JSON_TYPE)
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

  async function branchHead(name: string): Promise<string | undefined> {
    const reply = await send('GET', `/repos/${repo}/git/ref/heads/${encodePath(name)}`)
    if (reply.status === 404) return undefined
    if (reply.status !== 200) throw failure(reply, `read the branch "${name}"`)
    return (JSON.parse(reply.text) as { object: { sha: string } }).object.sha
  }

  type PullState = 'open' | 'closed' | 'none'
  /** The state of the pull requests whose head is `name`: any open one wins, then closed or merged ones. */
  async function pullState(name: string): Promise<PullState> {
    const head = encodeURIComponent(`${match?.[1] ?? ''}:${name}`)
    const pulls = await json<{ state: string }[]>(
      send('GET', `/repos/${repo}/pulls?head=${head}&state=all&per_page=100`),
      'look up pull requests',
    )
    if (pulls.some((pull) => pull.state === 'open')) return 'open'
    return pulls.length > 0 ? 'closed' : 'none'
  }

  /** One commit on the target's branch holding all of `changes`. Goes through the Git Data API so the files land together. */
  function view(target: Target): ContentStore {
    async function readFile(path: string): Promise<string | undefined> {
      return readFileAt(path, await target.readRef())
    }

    async function listFile(path: string): Promise<string[] | undefined> {
      return listFilesAt(path, await target.readRef())
    }

    async function listAcross(path: string): Promise<string[]> {
      const names = new Set<string>()
      for (const ref of await target.refs()) for (const name of (await listFilesAt(path, ref)) ?? []) names.add(name)
      return [...names].sort((a, b) => a.localeCompare(b))
    }

    async function commit(changes: readonly Change[], describe: (applied: readonly Change[]) => string): Promise<void> {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const name = await target.writeBranch()
        const headSha = await branchHead(name)
        if (headSha === undefined) throw failure({ status: 404, headers: new Headers(), text: '' }, `read the branch "${name}"`)
        const parent = await json<{ tree: { sha: string } }>(send('GET', `/repos/${repo}/git/commits/${headSha}`), 'read the latest commit')

        const entries: Record<string, unknown>[] = []
        const applied: Change[] = []
        for (const change of changes) {
          if ('remove' in change) {
            // Removing what is not there is not an error, as it is not for the file store.
            if ((await readFileAt(change.path, headSha)) === undefined) continue
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
          send('POST', `/repos/${repo}/git/commits`, { body: { message: describe(applied), tree: tree.sha, parents: [headSha] } }),
          'create the commit',
        )
        const update = await send('PATCH', `/repos/${repo}/git/refs/heads/${encodePath(name)}`, {
          body: { sha: created.sha, force: false },
        })
        if (update.status === 200) {
          await target.committed?.(name, {
            written: applied.filter((change) => !('remove' in change)).map((change) => change.path),
            removed: applied.filter((change) => 'remove' in change).map((change) => change.path),
          })
          return
        }

        if ((update.status === 403 || update.status === 422) && PROTECTED.test(messageOf(update.text))) {
          throw new StoreError(
            409,
            'branch_protected',
            `The branch "${name}" is protected, so edits cannot be committed to it directly. Allow this token to push to it, use another branch, or set mode: 'pr'.`,
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
        const names = await listAcross(inRepo(uploadsDir))
        return names
          .filter((name) => !name.startsWith('.') && hasImageExtension(name))
          .map((filename) => ({ filename, path: `${uploadsDir}/${filename}` }))
      },

      async save({ originalName, bytes, kind }): Promise<SavedImage> {
        const taken = new Set(await listAcross(inRepo(uploadsDir)))
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
        if (!(await listAcross(inRepo(uploadsDir))).includes(filename)) return false
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
        return listFile(contentPath(dir))
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
        const folder = inRepo(src.slice(0, slash))
        const name = src.slice(slash + 1)
        for (const ref of await target.refs()) {
          if ((await listFilesAt(folder, ref))?.includes(name)) return true
        }
        return false
      },
    }
  }

  const direct: Target = {
    readRef: baseBranch,
    refs: async () => [await baseBranch()],
    writeBranch: baseBranch,
  }
  if (!prMode) return view(direct)

  /** The branch of one entry's pull request: `bearminion/<scope>`, then `-2`, `-3` once earlier pull requests are closed. */
  async function activeBranch(scope: string): Promise<{ name: string; exists: boolean }> {
    const stem = branchStem(scope)
    for (let index = 1; index <= MAX_BRANCHES_PER_SCOPE; index += 1) {
      const name = index === 1 ? stem : `${stem}-${index}`
      if ((await branchHead(name)) === undefined) return { name, exists: false }
      // A branch with a merged or closed pull request is finished with; the next save starts a fresh one.
      if ((await pullState(name)) !== 'closed') return { name, exists: true }
    }
    throw new StoreError(
      409,
      'branch_exhausted',
      `There are already ${MAX_BRANCHES_PER_SCOPE} closed pull requests for "${scope}". Delete some of the bearminion/ branches.`,
    )
  }

  const labelName = options.label === undefined ? 'bearminion' : options.label

  async function openPullRequest(scope: string, name: string, change: { written: string[]; removed: string[] }): Promise<void> {
    if ((await pullState(name)) === 'open') return
    const kind = scope.replace(':', ': ')
    const files = [...change.written.map((path) => `- ${path}`), ...change.removed.map((path) => `- ${path} (removed)`)].join('\n')
    const text = options.pullRequest?.({ scope, ...change }) ?? {
      title: `Edit ${kind}`,
      body: `Opened by the BearMinion editor. Merge it to publish the change.\n\nFirst save changed:\n${files}\n\nLater saves of the same entry are added to this pull request.`,
    }
    const reply = await send('POST', `/repos/${repo}/pulls`, {
      body: { title: text.title, head: name, base: await baseBranch(), body: text.body },
    })
    if (reply.status === 422 && /already exists/i.test(messageOf(reply.text))) return
    if (reply.status !== 201) throw failure(reply, 'open the pull request')
    if (labelName === false) return
    // A label is a nicety: when it cannot be added, the pull request still stands.
    const { number } = JSON.parse(reply.text) as { number: number }
    await send('POST', `/repos/${repo}/issues/${number}/labels`, { body: { labels: [labelName] } })
  }

  function scopeTarget(scope: string): Target {
    const readRef = async (): Promise<string> => {
      const active = await activeBranch(scope)
      return active.exists ? active.name : baseBranch()
    }
    return {
      readRef,
      refs: async () => {
        const own = await readRef()
        const refs = [own]
        if (scope !== 'uploads') {
          const uploads = await activeBranch('uploads')
          if (uploads.exists) refs.push(uploads.name)
        }
        const base = await baseBranch()
        if (!refs.includes(base)) refs.push(base)
        return refs
      },
      async writeBranch() {
        const active = await activeBranch(scope)
        if (active.exists) return active.name
        const base = await baseBranch()
        const sha = await branchHead(base)
        if (sha === undefined) throw failure({ status: 404, headers: new Headers(), text: '' }, `read the branch "${base}"`)
        const created = await send('POST', `/repos/${repo}/git/refs`, { body: { ref: `refs/heads/${active.name}`, sha } })
        // 422: someone created it a moment ago. Use theirs.
        if (created.status !== 201 && created.status !== 422) throw failure(created, `create the branch "${active.name}"`)
        return active.name
      },
      committed: (name, change) => openPullRequest(scope, name, change),
    }
  }

  const scoped = (scope: string): ContentStore => view(scopeTarget(scope))
  const base = view(direct)
  const edits = scoped('edits')
  const uploadScope = scoped('uploads')
  // In pull request mode nothing is written to the base branch. Reads outside any entry see the base; writes outside
  // any entry land in shared pull requests (`edits` for batch saves, `uploads` for images).
  return {
    read: base.read,
    exists: base.exists,
    list: base.list,
    apply: edits.apply,
    uploads: uploadScope.uploads,
    assetExists: base.assetExists,
    scoped,
  }
}
