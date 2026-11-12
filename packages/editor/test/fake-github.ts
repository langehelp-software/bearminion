/*
 * An in-memory stand-in for the parts of the GitHub REST API the store uses: refs, commits, trees, blobs and the
 * contents API with ETags. Just enough behaviour to test the store's commit flow and its error handling.
 */

export interface FakeGithubOptions {
  defaultBranch?: string
  files?: Record<string, string | Uint8Array>
}

export interface FakeRequest {
  method: string
  route: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function hash(bytes: Uint8Array): string {
  let value = 5381
  for (const byte of bytes) value = ((value * 33) ^ byte) >>> 0
  return value.toString(16).padStart(8, '0')
}

const toBytes = (value: string | Uint8Array): Uint8Array => (typeof value === 'string' ? encoder.encode(value) : value)

export class FakeGithub {
  readonly requests: FakeRequest[] = []
  readonly commits: { sha: string; message: string; parent: string | undefined; files: Map<string, Uint8Array> }[] = []
  /** The default branch. */
  branch: string
  readonly branches = new Map<string, string>()
  readonly pulls: {
    number: number
    head: string
    base: string
    state: 'open' | 'closed'
    title: string
    body: string
    labels: string[]
  }[] = []
  /** `unauthorized`: 401 everywhere. `forbidden`: 403 on writes. `rate-limited`: 403 with no quota left. `offline`: fetch rejects. */
  mode: 'ok' | 'unauthorized' | 'forbidden' | 'rate-limited' | 'offline' = 'ok'
  /** Refuse ref updates the way a protected branch does. */
  protectedBranch = false
  /** Runs just before a ref update; use it to push another commit and make the update a non-fast-forward. */
  beforeRefUpdate: (() => void) | undefined
  private readonly trees = new Map<string, Map<string, Uint8Array>>()
  private readonly blobs = new Map<string, Uint8Array>()
  private counter = 0

  constructor(options: FakeGithubOptions = {}) {
    this.branch = options.defaultBranch ?? 'main'
    const files = new Map<string, Uint8Array>()
    for (const [path, value] of Object.entries(options.files ?? {})) files.set(path, toBytes(value))
    this.branches.set(this.branch, this.addCommit('Initial commit', undefined, files))
  }

  get head(): string {
    return this.branches.get(this.branch) ?? ''
  }

  set head(sha: string) {
    this.branches.set(this.branch, sha)
  }

  /** Merge a pull request the way GitHub's button would: the base takes the head's files, the pull request closes. */
  merge(number: number, options: { deleteBranch?: boolean } = {}): void {
    const pull = this.pulls.find((candidate) => candidate.number === number)
    const sha = pull && this.branches.get(pull.head)
    if (!pull || !sha) throw new Error(`no pull request ${number}`)
    this.branches.set(pull.base, sha)
    pull.state = 'closed'
    if (options.deleteBranch) this.branches.delete(pull.head)
  }

  close(number: number): void {
    const pull = this.pulls.find((candidate) => candidate.number === number)
    if (!pull) throw new Error(`no pull request ${number}`)
    pull.state = 'closed'
  }

  /** Commit straight to the branch, as another person pushing would. */
  push(files: Record<string, string>, message = 'Someone else', branch = this.branch): void {
    const head = this.headOf(branch)
    const next = new Map(this.filesAt(head))
    for (const [path, text] of Object.entries(files)) next.set(path, encoder.encode(text))
    this.branches.set(branch, this.addCommit(message, head, next))
  }

  filesAt(sha: string): Map<string, Uint8Array> {
    const commit = this.commits.find((candidate) => candidate.sha === sha)
    if (!commit) throw new Error(`no commit ${sha}`)
    return commit.files
  }

  private headOf(branch?: string): string {
    const sha = this.branches.get(branch ?? this.branch)
    if (!sha) throw new Error(`no branch ${branch}`)
    return sha
  }

  text(path: string, branch?: string): string | undefined {
    const bytes = this.filesAt(this.headOf(branch)).get(path)
    return bytes === undefined ? undefined : decoder.decode(bytes)
  }

  bytes(path: string, branch?: string): Uint8Array | undefined {
    return this.filesAt(this.headOf(branch)).get(path)
  }

  get commitCount(): number {
    return this.commits.length
  }

  private addCommit(message: string, parent: string | undefined, files: Map<string, Uint8Array>): string {
    this.counter += 1
    const sha = `c${this.counter.toString().padStart(6, '0')}`
    this.commits.push({ sha, message, parent, files })
    this.trees.set(`t-${sha}`, files)
    return sha
  }

  readonly fetch: typeof fetch = async (input, init) => {
    if (this.mode === 'offline') throw new TypeError('fetch failed')
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const method = init?.method ?? 'GET'
    const headers = new Headers(init?.headers)
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {}
    this.requests.push({ method, route: url.pathname + url.search })

    if (this.mode === 'unauthorized') return json(401, { message: 'Bad credentials' })
    if (this.mode === 'rate-limited') {
      return json(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0' })
    }
    if (this.mode === 'forbidden' && method !== 'GET') return json(403, { message: 'Resource not accessible by personal access token' })

    const path = decodeURIComponent(url.pathname)
    const repo = /^\/repos\/[^/]+\/[^/]+/.exec(path)
    if (!repo) return json(404, { message: 'Not Found' })
    const rest = path.slice(repo[0].length)

    if (rest === '' && method === 'GET') return json(200, { default_branch: this.branch })

    const refRoute = /^\/git\/ref\/heads\/(.+)$/.exec(rest)
    if (refRoute && method === 'GET') {
      const sha = this.branches.get(refRoute[1] ?? '')
      return sha ? json(200, { object: { sha } }) : json(404, { message: 'Not Found' })
    }

    if (rest === '/git/refs' && method === 'POST') {
      const name = String(body.ref).replace(/^refs\/heads\//, '')
      if (this.branches.has(name)) return json(422, { message: 'Reference already exists' })
      if (![...this.branches.keys()].every((other) => !other.startsWith(`${name}/`) && !name.startsWith(`${other}/`))) {
        return json(422, { message: 'Reference update failed' })
      }
      this.branches.set(name, String(body.sha))
      return json(201, { ref: body.ref, object: { sha: body.sha } })
    }

    if (rest === '/pulls' && method === 'GET') {
      const head = (url.searchParams.get('head') ?? '').split(':').pop()
      const found = this.pulls.filter((pull) => pull.head === head)
      return json(
        200,
        found.map((pull) => ({ number: pull.number, state: pull.state })),
      )
    }

    if (rest === '/pulls' && method === 'POST') {
      const head = String(body.head)
      const base = String(body.base)
      if (this.pulls.some((pull) => pull.head === head && pull.state === 'open')) {
        return json(422, { message: 'A pull request already exists for this head.' })
      }
      if (this.branches.get(head) === this.branches.get(base)) return json(422, { message: 'No commits between base and head' })
      const number = this.pulls.length + 1
      this.pulls.push({ number, head, base, state: 'open', title: String(body.title), body: String(body.body), labels: [] })
      return json(201, { number })
    }

    const labels = /^\/issues\/(\d+)\/labels$/.exec(rest)
    if (labels && method === 'POST') {
      const pull = this.pulls.find((candidate) => candidate.number === Number(labels[1]))
      if (!pull) return json(404, { message: 'Not Found' })
      pull.labels.push(...(body.labels as string[]))
      return json(200, [])
    }

    const commitRoute = /^\/git\/commits\/(.+)$/.exec(rest)
    if (commitRoute && method === 'GET') {
      const commit = this.commits.find((candidate) => candidate.sha === commitRoute[1])
      return commit ? json(200, { tree: { sha: `t-${commit.sha}` } }) : json(404, { message: 'Not Found' })
    }

    if (rest === '/git/blobs' && method === 'POST') {
      const content = String(body.content)
      const bytes = Uint8Array.from(atob(content), (char) => char.charCodeAt(0))
      const sha = `b-${hash(bytes)}-${this.blobs.size}`
      this.blobs.set(sha, bytes)
      return json(201, { sha })
    }

    if (rest === '/git/trees' && method === 'POST') {
      const base = this.trees.get(String(body.base_tree))
      if (!base) return json(422, { message: 'base tree not found' })
      const next = new Map(base)
      for (const entry of body.tree as { path: string; content?: string; sha?: string | null }[]) {
        if (entry.sha === null) next.delete(entry.path)
        else if (entry.content !== undefined) next.set(entry.path, encoder.encode(entry.content))
        else if (entry.sha !== undefined) next.set(entry.path, this.blobs.get(entry.sha) ?? new Uint8Array())
      }
      this.counter += 1
      const sha = `tree-${this.counter}`
      this.trees.set(sha, next)
      return json(201, { sha })
    }

    if (rest === '/git/commits' && method === 'POST') {
      const tree = this.trees.get(String(body.tree))
      if (!tree) return json(422, { message: 'tree not found' })
      const sha = this.addCommit(String(body.message), (body.parents as string[])[0], tree)
      return json(201, { sha })
    }

    const patch = /^\/git\/refs\/heads\/(.+)$/.exec(rest)
    if (patch && method === 'PATCH') {
      const name = patch[1] ?? ''
      this.beforeRefUpdate?.()
      if (this.protectedBranch && name === this.branch) {
        return json(422, { message: 'Changes must be made through a pull request.' })
      }
      const commit = this.commits.find((candidate) => candidate.sha === body.sha)
      if (!commit) return json(422, { message: 'Object does not exist' })
      if (body.force !== true && commit.parent !== this.branches.get(name)) return json(422, { message: 'Update is not a fast forward' })
      this.branches.set(name, commit.sha)
      return json(200, { object: { sha: commit.sha } })
    }

    const contents = /^\/contents\/(.+)$/.exec(rest)
    if (contents && method === 'GET') {
      const ref = url.searchParams.get('ref') ?? this.branch
      const sha = this.branches.get(ref) ?? ref
      const files = this.commits.find((candidate) => candidate.sha === sha)?.files
      if (!files) return json(404, { message: 'No commit found for the ref' })
      const target = contents[1] ?? ''
      const file = files.get(target)
      if (file) {
        const etag = `"${hash(file)}"`
        if (headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { etag } })
        const raw = (headers.get('accept') ?? '').includes('raw')
        return raw
          ? new Response(file as BodyInit, { status: 200, headers: { etag } })
          : json(200, { type: 'file', name: target.split('/').pop() }, { etag })
      }
      const prefix = `${target}/`
      const names = new Map<string, 'file' | 'dir'>()
      for (const key of files.keys()) {
        if (!key.startsWith(prefix)) continue
        const tail = key.slice(prefix.length)
        const slash = tail.indexOf('/')
        names.set(slash === -1 ? tail : tail.slice(0, slash), slash === -1 ? 'file' : 'dir')
      }
      if (names.size === 0) return json(404, { message: 'Not Found' })
      const listing = [...names].map(([name, type]) => ({ name, type, path: prefix + name }))
      const etag = `"${hash(encoder.encode(JSON.stringify(listing)))}"`
      if (headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { etag } })
      return json(200, listing, { etag })
    }

    return json(404, { message: 'Not Found' })
  }
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
}
