import { describe, expect, it } from 'vitest'
import { StoreError, StoreKeyError } from '../src/store-error.js'
import { githubStore, type GithubStoreOptions } from '../src/github-store.js'
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
