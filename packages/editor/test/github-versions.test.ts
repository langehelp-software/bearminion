import { describe, expect, it } from 'vitest'
import { githubStore, type GithubStoreOptions } from '../src/github-store.js'
import { FakeGithub } from './fake-github.js'

function setup(files: Record<string, string | Uint8Array> = {}, options: Partial<GithubStoreOptions> = {}) {
  const github = new FakeGithub({ files })
  const store = githubStore({ repo: 'acme/site', token: 'token', fetch: github.fetch, ...options })
  const versions = store.versions
  if (!versions) throw new Error('githubStore has no versions')
  return { github, store, versions }
}

const text = (bytes: Uint8Array | undefined) => (bytes === undefined ? undefined : new TextDecoder().decode(bytes))

describe('githubStore versions', () => {
  it('lists commits of the content and uploads only, newest first, in pages', async () => {
    const { github, versions } = setup({ 'content/pages/index.json': '{"t":1}', 'src/pages/x.astro': 'a' })
    github.push({ 'src/pages/x.astro': 'b' }, 'code only')
    github.push({ 'content/pages/index.json': '{"t":2}' }, 'content 2')
    github.push({ 'src/assets/uploads/a.png': 'png' }, 'upload')
    github.push({ 'content/site.json': '{}', 'src/pages/x.astro': 'c' }, 'mixed')

    const first = await versions.list({ limit: 2 })
    expect(first.branch).toBe('main')
    expect(first.commits.map((item) => item.message)).toEqual(['mixed', 'upload'])
    expect(first.cursor).toBeDefined()
    const second = await versions.list({ limit: 2, cursor: first.cursor })
    expect(second.commits.map((item) => item.message)).toEqual(['content 2', 'Initial commit'])
    expect(second.cursor).toBeUndefined()

    const mixed = await versions.get(first.commits[0]!.sha)
    expect(mixed?.files).toEqual([{ path: 'content/site.json', status: 'added', key: 'site.json' }])
    expect(await versions.get('ffffff0')).toBeUndefined()
  })

  it('works inside rootDir', async () => {
    const { github, versions } = setup({}, { rootDir: 'site' })
    github.push({ 'site/content/pages/a.json': '{}', 'other/content/pages/b.json': '{}' }, 'two sites')
    const page = await versions.list({ limit: 5 })
    expect(page.commits.map((item) => item.message)).toEqual(['two sites'])
    expect((await versions.get(page.commits[0]!.sha))?.files).toEqual([
      { path: 'content/pages/a.json', status: 'added', key: 'pages/a.json' },
    ])
    expect(text(await versions.read(page.commits[0]!.sha, 'content/pages/a.json'))).toBe('{}')
  })

  it('restores the files of a commit as a new commit, with the images they point at', async () => {
    const { github, versions } = setup({
      'content/pages/index.json': '{"t":"one","img":"src/assets/uploads/hero.png"}',
      'content/pages/about.json': '{"t":"about"}',
      'src/assets/uploads/hero.png': 'png',
    })
    const one = github.head
    github.push({ 'content/pages/index.json': '{"t":"two"}', 'content/pages/about.json': '{"t":"about 2"}' }, 'two')
    github.remove(['src/assets/uploads/hero.png'], 'remove hero')

    const count = github.commitCount
    const result = await versions.restore(one, { paths: ['content/pages/index.json'] })
    expect(result.written.sort()).toEqual(['content/pages/index.json', 'src/assets/uploads/hero.png'])
    expect(github.commitCount).toBe(count + 1)
    expect(github.text('content/pages/index.json')).toContain('"one"')
    expect(github.text('src/assets/uploads/hero.png')).toBe('png')
    expect(github.text('content/pages/about.json')).toContain('about 2')
    expect(github.commits.at(-1)?.message).toMatch(/^Restore 2 files from c00000/)
    expect(result.commit).toBe(github.head.slice(0, 7))
  })

  it('says when there is nothing to restore', async () => {
    const { github, versions } = setup({ 'content/pages/index.json': '{}' })
    await expect(versions.restore(github.head, {})).rejects.toMatchObject({ code: 'empty' })
    await expect(versions.restore('abcdef1', {})).rejects.toMatchObject({ code: 'not_found' })
  })

  it('in pull request mode, lists unmerged saves and restores onto the entry branch', async () => {
    const { github, store, versions } = setup({ 'content/pages/about.json': '{"t":"one"}' }, { mode: 'pr' })
    const one = github.head
    github.push({ 'content/pages/about.json': '{"t":"two"}' }, 'published two')
    await store.scoped!('page:about').apply([{ type: 'write', key: 'pages/about.json', text: '{"t":"draft"}' }])

    const page = await versions.list({ limit: 10 })
    expect(page.commits[0]).toMatchObject({ message: 'Update content/pages/about.json', branch: 'bearminion/page-about' })
    expect(page.commits.slice(1).map((item) => item.branch)).toEqual([undefined, undefined])

    await versions.restore(one, {})
    // Onto the open pull request of that page, not the published branch.
    expect(github.text('content/pages/about.json', 'bearminion/page-about')).toBe('{"t":"one"}')
    expect(github.text('content/pages/about.json')).toBe('{"t":"two"}')
  })
})
