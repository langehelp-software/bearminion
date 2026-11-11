import { describe, expect, it } from 'vitest'
import { StoreError, StoreKeyError } from '../src/store-error.js'
import { githubStore, type GithubStoreOptions } from '../src/github-store.js'
import type { ContentStore } from '../src/store.js'
import { FakeGithub } from './fake-github.js'

const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (char) => char.charCodeAt(0),
)

function setup(files: Record<string, string | Uint8Array> = {}, options: Partial<GithubStoreOptions> = {}) {
  const github = new FakeGithub({ files })
  const store = githubStore({ repo: 'acme/site', token: 'token', fetch: github.fetch, ...options })
  return { github, store }
}

async function failure(promise: Promise<unknown>): Promise<StoreError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(StoreError)
    return error as StoreError
  }
  throw new Error('expected a StoreError')
}

describe('githubStore options', () => {
  it('validates repo, token and folders', () => {
    expect(() => githubStore({ repo: 'nope', token: 't' })).toThrow(/owner\/name/)
    expect(() => githubStore({ repo: 'a/b', token: '' })).toThrow(/token/)
    expect(() => githubStore({ repo: 'a/b', token: 't', rootDir: '../x' })).toThrow(/inside the repository/)
    expect(() => githubStore({ repo: 'a/b', token: 't', contentDir: 'a/../../x' })).toThrow(/inside the repository/)
  })
})

describe('githubStore reads', () => {
  it('reads, checks and lists files under the content directory', async () => {
    const { store } = setup({
      'content/site.json': '{"name":"Łódź"}\n',
      'content/pages/b.json': '{}',
      'content/pages/a.json': '{}',
      'content/pages/nested/x.json': '{}',
    })
    expect(await store.read('site.json')).toBe('{"name":"Łódź"}\n')
    expect(await store.read('missing.json')).toBeUndefined()
    expect(await store.exists('site.json')).toBe(true)
    expect(await store.exists('nope.json')).toBe(false)
    expect(await store.list('pages')).toEqual(['a.json', 'b.json'])
    expect(await store.list('nothing')).toBeUndefined()
  })

  it('uses the default branch unless one is given, and honours rootDir and contentDir', async () => {
    const github = new FakeGithub({ defaultBranch: 'trunk', files: { 'web/data/site.json': 'x' } })
    const store = githubStore({ repo: 'acme/site', token: 't', fetch: github.fetch, rootDir: '/web/', contentDir: 'data' })
    expect(await store.read('site.json')).toBe('x')
    expect(github.requests.some((request) => request.route.includes('ref=trunk'))).toBe(true)
  })

  it('answers repeated reads from the ETag cache', async () => {
    const { github, store } = setup({ 'content/site.json': 'one' })
    expect(await store.read('site.json')).toBe('one')
    expect(await store.read('site.json')).toBe('one')
    github.push({ 'content/site.json': 'two' })
    expect(await store.read('site.json')).toBe('two')
  })

  it('addresses files outside the content directory by a leading slash, from the repository root', async () => {
    const { github, store } = setup({
      'content/site.json': 'site',
      'src/content/blog/en/b.md': 'b',
      'src/content/blog/en/a.md': 'a',
    })
    expect(await store.read('/src/content/blog/en/a.md')).toBe('a')
    expect(await store.exists('/src/content/blog/en/b.md')).toBe(true)
    expect(await store.list('/src/content/blog/en')).toEqual(['a.md', 'b.md'])
    expect(await store.list('/src/content/blog/fr')).toBeUndefined()
    expect(await store.read('src/content/blog/en/a.md')).toBeUndefined()
    const before = github.commits.length
    await store.apply([
      { type: 'write', key: '/src/content/blog/en/c.md', text: 'c' },
      { type: 'write', key: 'site.json', text: 'site2' },
      { type: 'remove', key: '/src/content/blog/en/a.md' },
    ])
    expect(github.commits.length).toBe(before + 1)
    expect(await store.read('/src/content/blog/en/c.md')).toBe('c')
    expect(await store.read('site.json')).toBe('site2')
    expect(await store.exists('/src/content/blog/en/a.md')).toBe(false)
  })

  it('honours rootDir for root keys', async () => {
    const github = new FakeGithub({ files: { 'web/src/content/blog/en/a.md': 'a' } })
    const store = githubStore({ repo: 'acme/site', token: 't', fetch: github.fetch, rootDir: 'web' })
    expect(await store.read('/src/content/blog/en/a.md')).toBe('a')
  })

  it('rejects root keys that leave the repository or are malformed', async () => {
    const { store } = setup()
    for (const key of ['/', '//a.md', '/../x', '/src/../../x', '/a/./b']) {
      await expect(store.read(key)).rejects.toBeInstanceOf(StoreKeyError)
    }
  })

  it('rejects keys that leave the content directory', async () => {
    const { store } = setup()
    await expect(store.read('../secrets')).rejects.toBeInstanceOf(StoreKeyError)
    await expect(store.list('pages/../..')).rejects.toBeInstanceOf(StoreKeyError)
    await expect(store.apply([{ type: 'write', key: 'a//b', text: '' }])).rejects.toBeInstanceOf(StoreKeyError)
  })
})

describe('githubStore apply', () => {
  it('commits writes and removes together as one commit', async () => {
    const { github, store } = setup({ 'content/pages/a.json': '{"a":1}' })
    const before = github.commitCount
    await store.apply([
      { type: 'write', key: 'pages/c.json', text: '{"c":"zażółć"}\n' },
      { type: 'remove', key: 'pages/a.json' },
      { type: 'remove', key: 'pages/missing.json' },
    ])
    expect(github.commitCount).toBe(before + 1)
    expect(github.text('content/pages/c.json')).toBe('{"c":"zażółć"}\n')
    expect(github.text('content/pages/a.json')).toBeUndefined()
    expect(github.commits.at(-1)?.message).toBe('Update 2 files')
  })

  it('names single-file commits and accepts a custom message', async () => {
    const { github, store } = setup({ 'content/x.json': '1' })
    await store.apply([{ type: 'write', key: 'x.json', text: '2' }])
    expect(github.commits.at(-1)?.message).toBe('Update content/x.json')
    await store.apply([{ type: 'remove', key: 'x.json' }])
    expect(github.commits.at(-1)?.message).toBe('Remove content/x.json')

    const custom = setup({}, { message: ({ written }) => `CMS: ${written.length}` })
    await custom.store.apply([{ type: 'write', key: 'y.json', text: '1' }])
    expect(custom.github.commits.at(-1)?.message).toBe('CMS: 1')
  })

  it('makes no commit for nothing to do', async () => {
    const { github, store } = setup()
    const before = github.commitCount
    await store.apply([])
    await store.apply([{ type: 'remove', key: 'pages/missing.json' }])
    expect(github.commitCount).toBe(before)
  })

  it('retries once when the branch moved, keeping the other commit', async () => {
    const { github, store } = setup({ 'content/a.json': '1' })
    let pushed = false
    github.beforeRefUpdate = () => {
      if (pushed) return
      pushed = true
      github.push({ 'content/other.json': 'theirs' })
    }
    await store.apply([{ type: 'write', key: 'b.json', text: '2' }])
    expect(github.text('content/b.json')).toBe('2')
    expect(github.text('content/other.json')).toBe('theirs')
  })

  it('gives up when the branch keeps moving', async () => {
    const { github, store } = setup()
    github.beforeRefUpdate = () => github.push({ x: String(Math.random()) })
    const error = await failure(store.apply([{ type: 'write', key: 'b.json', text: '2' }]))
    expect(error).toMatchObject({ status: 409, code: 'branch_moved' })
  })

  it('reports a protected branch', async () => {
    const { github, store } = setup()
    github.protectedBranch = true
    const error = await failure(store.apply([{ type: 'write', key: 'b.json', text: '2' }]))
    expect(error).toMatchObject({ status: 409, code: 'branch_protected' })
  })
})

describe('githubStore uploads', () => {
  it('saves, lists and removes binary images', async () => {
    const { github, store } = setup({ 'src/assets/uploads/.gitkeep': '', 'src/assets/uploads/old.png': 'x' })
    const saved = await store.uploads.save({ originalName: 'Zażółć Gęślą.PNG', bytes: PNG, kind: 'png' })
    expect(saved.path).toBe(`src/assets/uploads/${saved.filename}`)
    expect(saved.filename).toMatch(/^zazolc-gesla-[0-9a-f]{8}\.png$/)
    expect(Array.from(github.bytes(saved.path) ?? [])).toEqual(Array.from(PNG))
    expect(github.commits.at(-1)?.message).toBe(`Upload ${saved.filename}`)

    const listed = await store.uploads.list()
    expect(listed.map((image) => image.filename).sort()).toEqual([saved.filename, 'old.png'].sort())

    expect(await store.uploads.remove('../site.json')).toBe(false)
    expect(await store.uploads.remove('nothere-12345678.png')).toBe(false)
    expect(await store.uploads.remove(saved.filename)).toBe(true)
    expect(github.bytes(saved.path)).toBeUndefined()
  })

  it('lists nothing when the uploads folder does not exist', async () => {
    const { store } = setup()
    expect(await store.uploads.list()).toEqual([])
  })

  it('checks whether an asset exists', async () => {
    const { store } = setup({ 'src/assets/uploads/a.png': 'x' })
    expect(await store.assetExists?.('src/assets/uploads/a.png')).toBe(true)
    expect(await store.assetExists?.('src/assets/uploads/b.png')).toBe(false)
    expect(await store.assetExists?.('https://example.com/a.png')).toBe(false)
  })
})

describe('githubStore errors', () => {
  it('maps GitHub failures to store errors', async () => {
    const cases: [FakeGithub['mode'], number, string][] = [
      ['unauthorized', 502, 'github_auth'],
      ['rate-limited', 429, 'github_rate_limited'],
      ['offline', 502, 'github_unreachable'],
    ]
    for (const [mode, status, code] of cases) {
      const { github, store } = setup({ 'content/a.json': '1' })
      github.mode = mode
      expect(await failure(store.read('a.json'))).toMatchObject({ status, code })
    }
    const forbidden = setup()
    forbidden.github.mode = 'forbidden'
    expect(await failure(forbidden.store.apply([{ type: 'write', key: 'a.json', text: '1' }]))).toMatchObject({ code: 'github_forbidden' })
  })

  it('reports a missing repository', async () => {
    const github = new FakeGithub()
    const store = githubStore({ repo: 'acme/site', token: 't', branch: 'gone', fetch: github.fetch })
    expect(await failure(store.apply([{ type: 'write', key: 'a.json', text: '1' }]))).toMatchObject({ code: 'github_not_found' })
  })
})

describe('githubStore pull request mode', () => {
  const files = { 'content/pages/about.json': '{"v":1}', 'content/pages/index.json': '{}' }

  function setupPr(options: Partial<GithubStoreOptions> = {}) {
    const { github, store } = setup(files, { mode: 'pr', ...options })
    const scoped = (scope: string): ContentStore => {
      if (!store.scoped) throw new Error('pr mode stores are scoped')
      return store.scoped(scope)
    }
    return { github, store, scoped }
  }

  it('is only scoped in pr mode, and validates the mode', () => {
    expect(setup().store.scoped).toBeUndefined()
    expect(() => githubStore({ repo: 'a/b', token: 't', mode: 'merge' as never })).toThrow(/mode/)
  })

  it('commits an entry to a branch of its own and opens one pull request, never merging', async () => {
    const { github, scoped } = setupPr()
    const baseHead = github.head
    await scoped('page:about').apply([{ type: 'write', key: 'pages/about.json', text: '{"v":2}' }])

    expect(github.head).toBe(baseHead)
    expect(github.text('content/pages/about.json')).toBe('{"v":1}')
    expect(github.text('content/pages/about.json', 'bearminion/page-about')).toBe('{"v":2}')
    expect(github.pulls).toHaveLength(1)
    expect(github.pulls[0]).toMatchObject({
      head: 'bearminion/page-about',
      base: 'main',
      state: 'open',
      title: 'Edit page: about',
      labels: ['bearminion'],
    })
    expect(github.pulls[0]?.body).toContain('content/pages/about.json')
  })

  it('adds later saves of the same entry to the same pull request', async () => {
    const { github, scoped } = setupPr()
    await scoped('page:about').apply([{ type: 'write', key: 'pages/about.json', text: '{"v":2}' }])
    await scoped('page:about').apply([{ type: 'write', key: 'pages/about.json', text: '{"v":3}' }])
    expect(github.pulls).toHaveLength(1)
    expect(github.text('content/pages/about.json', 'bearminion/page-about')).toBe('{"v":3}')
    expect(github.commits.filter((commit) => commit.message.startsWith('Update')).length).toBe(2)
  })

  it('keeps entries apart, and reads each entry from its own pending edits', async () => {
    const { github, store, scoped } = setupPr()
    await scoped('page:about').apply([{ type: 'write', key: 'pages/about.json', text: '{"v":2}' }])
    await scoped('site').apply([{ type: 'write', key: 'site.json', text: '{"s":1}' }])
    expect(github.pulls.map((pull) => pull.head).sort()).toEqual(['bearminion/page-about', 'bearminion/site'])

    expect(await scoped('page:about').read('pages/about.json')).toBe('{"v":2}')
    expect(await scoped('page:index').read('pages/about.json')).toBe('{"v":1}')
    expect(await store.read('pages/about.json')).toBe('{"v":1}')
    expect(await scoped('page:about').list('pages')).toEqual(['about.json', 'index.json'])
  })

  it('starts a new branch and pull request once the earlier one is merged', async () => {
    const deleted = setupPr()
    await deleted.scoped('page:about').apply([{ type: 'write', key: 'pages/about.json', text: '{"v":2}' }])
    deleted.github.merge(1, { deleteBranch: true })
    // The merged edit is the base now.
    expect(await deleted.scoped('page:about').read('pages/about.json')).toBe('{"v":2}')
    await deleted.scoped('page:about').apply([{ type: 'write', key: 'pages/about.json', text: '{"v":3}' }])
    expect(deleted.github.pulls.map((pull) => [pull.number, pull.head, pull.state])).toEqual([
      [1, 'bearminion/page-about', 'closed'],
      [2, 'bearminion/page-about', 'open'],
    ])

    // A host that keeps merged branches: the next one gets a suffix.
    const kept = setupPr()
    await kept.scoped('page:about').apply([{ type: 'write', key: 'pages/about.json', text: '{"v":2}' }])
    kept.github.merge(1)
    await kept.scoped('page:about').apply([{ type: 'write', key: 'pages/about.json', text: '{"v":3}' }])
    expect(kept.github.pulls[1]).toMatchObject({ head: 'bearminion/page-about-2', state: 'open' })
    expect(kept.github.text('content/pages/about.json', 'bearminion/page-about-2')).toBe('{"v":3}')
  })

  it('starts a new branch when the pull request was closed unmerged', async () => {
    const { github, scoped } = setupPr()
    await scoped('page:about').apply([{ type: 'write', key: 'pages/about.json', text: '{"v":2}' }])
    github.close(1)
    // The abandoned branch is not read from any more.
    expect(await scoped('page:about').read('pages/about.json')).toBe('{"v":1}')
    await scoped('page:about').apply([{ type: 'write', key: 'pages/about.json', text: '{"v":3}' }])
    expect(github.pulls[1]).toMatchObject({ head: 'bearminion/page-about-2', state: 'open' })
  })

  it('never writes to the base branch, even outside an entry', async () => {
    const { github, store } = setupPr()
    const baseHead = github.head
    await store.apply([{ type: 'write', key: 'pages/new.json', text: '{}' }])
    const saved = await store.uploads.save({ originalName: 'a.png', bytes: PNG, kind: 'png' })
    expect(github.head).toBe(baseHead)
    expect(github.pulls.map((pull) => pull.head).sort()).toEqual(['bearminion/edits', 'bearminion/uploads'])
    expect(github.bytes(saved.path, 'bearminion/uploads')?.byteLength).toBe(PNG.byteLength)
  })

  it('sees an image waiting in the uploads pull request when an entry refers to it', async () => {
    const { store, scoped } = setupPr()
    const saved = await store.uploads.save({ originalName: 'a.png', bytes: PNG, kind: 'png' })
    expect(await store.assetExists?.(saved.path)).toBe(false)
    expect(await scoped('page:about').assetExists?.(saved.path)).toBe(true)
    expect((await scoped('uploads').uploads.list()).map((image) => image.filename)).toContain(saved.filename)
  })

  it('takes the pull request text and label from the options', async () => {
    const { github, scoped } = setupPr({
      label: false,
      pullRequest: ({ scope, written }) => ({ title: `CMS ${scope}`, body: `${written.length} file` }),
    })
    await scoped('page:about').apply([{ type: 'write', key: 'pages/about.json', text: '{"v":2}' }])
    expect(github.pulls[0]).toMatchObject({ title: 'CMS page:about', body: '1 file', labels: [] })
  })

  it('is not stopped by a protected base branch, since entries never touch it', async () => {
    const { github, scoped } = setupPr()
    github.protectedBranch = true
    await scoped('page:about').apply([{ type: 'write', key: 'pages/about.json', text: '{"v":2}' }])
    expect(github.pulls).toHaveLength(1)
  })

  it('points a protected base at pr mode in direct mode', async () => {
    const { github, store } = setup()
    github.protectedBranch = true
    const error = await failure(store.apply([{ type: 'write', key: 'a.json', text: '1' }]))
    expect(error.code).toBe('branch_protected')
    expect(error.message).toContain("mode: 'pr'")
  })
})
