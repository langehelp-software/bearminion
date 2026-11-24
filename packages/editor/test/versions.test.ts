import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { handleEditorRequest } from '../src/api.js'
import { API_PREFIX } from '../src/model.js'
import { fileVersions, parseNameStatus } from '../src/git.js'
import { createMigrator } from '../src/migrate.js'
import type { EditorContext } from '../src/options.js'
import { createFileStore } from '../src/store.js'
import { defaultTheme } from '../src/theme.js'
import { planRestore, referencedAssets, VersionError } from '../src/versions-types.js'
import { siteDefinition } from './starter.js'

let root = ''

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' })
}

function write(file: string, text: string) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
  fs.writeFileSync(path.join(root, file), text)
}

function commit(message: string) {
  git('add', '-A')
  git('commit', '-q', '-m', message)
  return git('rev-parse', 'HEAD').trim()
}

function context(enabled: boolean): EditorContext {
  const contentDir = path.join(root, 'content')
  const uploadsDir = path.join(root, 'src', 'assets', 'uploads')
  return {
    root,
    contentDir,
    uploadsDir,
    videosDir: path.join(root, 'public', 'videos'),
    maxVideoBytes: 1,
    maxImageBytes: 1,
    imageConvert: null,
    pageRules: { rename: true, delete: true },
    sections: {},
    site: siteDefinition,
    store: createFileStore({ root, contentDir, uploadsDir }),
    migrator: createMigrator(),
    theme: defaultTheme,
    git: enabled,
  }
}

const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-versions-'))
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('local version history', () => {
  it('says when the project is not a repository', async () => {
    fs.rmSync(path.join(root, '.git'), { recursive: true })
    await expect(fileVersions(context(true)).list({ limit: 10 })).rejects.toBeInstanceOf(VersionError)
  })

  it('lists only commits that touched content, uploads or videos, newest first, in pages', async () => {
    write('content/pages/index.json', '{"title":"One"}')
    commit('first content')
    write('src/components/Hero.astro', '<div/>')
    commit('code only')
    write('src/assets/uploads/a.png', 'png')
    commit('upload')
    write('content/site.json', '{}')
    write('src/components/Hero.astro', '<section/>')
    commit('mixed')

    const versions = fileVersions(context(true))
    const first = await versions.list({ limit: 2 })
    expect(first.commits.map((item) => item.message)).toEqual(['mixed', 'upload'])
    expect(first.branch).toBe('main')
    const second = await versions.list({ limit: 2, cursor: first.cursor })
    expect(second.commits.map((item) => item.message)).toEqual(['first content'])
    expect(second.cursor).toBeUndefined()

    const mixed = await versions.get(first.commits[0]!.sha)
    // The code file the commit also changed is left out.
    expect(mixed?.files).toEqual([{ path: 'content/site.json', status: 'added', key: 'site.json' }])
    const upload = await versions.get(first.commits[1]!.short)
    expect(upload?.files).toEqual([{ path: 'src/assets/uploads/a.png', status: 'added', asset: true }])
  })

  it('includes extra folders such as collections', async () => {
    write('src/content/blog/post.md', '# Hi')
    commit('post')
    const versions = fileVersions(context(true))
    expect((await versions.list({ limit: 5 })).commits).toHaveLength(0)
    expect((await versions.list({ limit: 5, also: ['src/content/blog'] })).commits).toHaveLength(1)
  })

  it('reads a file as it was at a commit', async () => {
    write('content/pages/index.json', '{"title":"One"}')
    const one = commit('one')
    write('content/pages/index.json', '{"title":"Two"}')
    commit('two')
    const versions = fileVersions(context(true))
    expect(new TextDecoder().decode(await versions.read(one, 'content/pages/index.json'))).toBe('{"title":"One"}')
    expect(await versions.read(one, 'content/pages/missing.json')).toBeUndefined()
    expect(await versions.read(one, '../etc/passwd')).toBeUndefined()
    expect(await versions.read('not-a-sha', 'content/pages/index.json')).toBeUndefined()
  })

  it('restores the files of a commit as a new commit, with images deleted since', async () => {
    write('src/assets/uploads/hero.png', 'png-bytes')
    write('content/pages/index.json', '{"title":"One","image":{"src":"src/assets/uploads/hero.png"}}')
    write('content/pages/about.json', '{"title":"About"}')
    const one = commit('one')
    write('content/pages/index.json', '{"title":"Two"}')
    fs.rmSync(path.join(root, 'src/assets/uploads/hero.png'))
    write('content/pages/about.json', '{"title":"About 2"}')
    commit('two')

    const versions = fileVersions(context(true))
    const result = await versions.restore(one, { paths: ['content/pages/index.json'] })
    expect(result.commit).toMatch(/^[0-9a-f]{7,}$/)
    expect(result.written.sort()).toEqual(['content/pages/index.json', 'src/assets/uploads/hero.png'])
    expect(read('content/pages/index.json')).toContain('"One"')
    expect(read('src/assets/uploads/hero.png')).toBe('png-bytes')
    // Not chosen: left as it is.
    expect(read('content/pages/about.json')).toContain('About 2')
    expect(git('log', '-1', '--format=%s').trim()).toMatch(/^Restore 2 files from [0-9a-f]+$/)
    expect(git('status', '--porcelain').trim()).toBe('')
    // The history grew; nothing was rewritten.
    expect(git('rev-list', '--count', 'HEAD').trim()).toBe('3')
  })

  it('removes a file the commit did not have yet', async () => {
    write('content/pages/index.json', '{}')
    commit('one')
    write('content/pages/new.json', '{}')
    const two = commit('two')
    write('content/pages/new.json', '{"x":1}')
    commit('three')
    // Restoring "two" restores new.json as it was then; restoring its parent's state is a removal.
    const versions = fileVersions(context(true))
    await versions.restore(two, {})
    expect(read('content/pages/new.json')).toBe('{}')
  })

  it('refuses to overwrite uncommitted changes', async () => {
    write('content/pages/index.json', '{"title":"One"}')
    const one = commit('one')
    write('content/pages/index.json', '{"title":"Two"}')
    commit('two')
    write('content/pages/index.json', '{"title":"Unsaved"}')
    await expect(fileVersions(context(true)).restore(one, {})).rejects.toMatchObject({ code: 'dirty' })
    expect(read('content/pages/index.json')).toContain('Unsaved')
  })

  it('only writes the files when commits are off', async () => {
    write('content/pages/index.json', '{"title":"One"}')
    const one = commit('one')
    write('content/pages/index.json', '{"title":"Two"}')
    commit('two')
    const result = await fileVersions(context(false)).restore(one, {})
    expect(result.commit).toBeUndefined()
    expect(read('content/pages/index.json')).toContain('One')
    expect(git('status', '--porcelain').trim()).toBe('M content/pages/index.json')
  })

  it('says when there is nothing to restore', async () => {
    write('content/pages/index.json', '{}')
    const one = commit('one')
    await expect(fileVersions(context(true)).restore(one, {})).rejects.toMatchObject({ code: 'empty' })
    await expect(fileVersions(context(true)).restore('deadbeef', {})).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('version helpers', () => {
  it('parses name-status output with renames', () => {
    expect(parseNameStatus('M\0a.json\0R087\0old.json\0new.json\0D\0gone.json\0A\0x.png\0')).toEqual([
      { path: 'a.json', status: 'modified' },
      { path: 'new.json', status: 'renamed', from: 'old.json' },
      { path: 'gone.json', status: 'deleted' },
      { path: 'x.png', status: 'added' },
    ])
  })

  it('finds image paths in JSON and in Markdown', () => {
    expect(referencedAssets('content/pages/a.json', '{"a":{"src":"src/assets/uploads/x.png"},"b":["src/assets/y.jpg"],"c":"no"}')).toEqual([
      'src/assets/uploads/x.png',
      'src/assets/y.jpg',
    ])
    expect(
      referencedAssets('src/content/blog/p.md', '---\ncover: "src/assets/uploads/c.webp"\n---\n![a](src/assets/uploads/d.png)'),
    ).toEqual(['src/assets/uploads/c.webp', 'src/assets/uploads/d.png'])
  })

  it('plans a removal for a file missing at the commit and skips assets that still exist', async () => {
    const bytes = (text: string) => new TextEncoder().encode(text)
    const at: Record<string, string> = {
      'content/a.json': '{"i":"src/assets/uploads/keep.png","j":"src/assets/uploads/back.png"}',
      'src/assets/uploads/back.png': 'b',
    }
    const now = new Set(['content/b.json', 'src/assets/uploads/keep.png'])
    const changes = await planRestore(
      'abc1234',
      [
        { path: 'content/a.json', status: 'modified', key: 'a.json' },
        { path: 'content/b.json', status: 'added', key: 'b.json' },
      ],
      { read: async (_sha, file) => (at[file] === undefined ? undefined : bytes(at[file]!)), exists: async (file) => now.has(file) },
    )
    expect(changes.map((change) => ('remove' in change ? `-${change.path}` : `+${change.path}`))).toEqual([
      '+content/a.json',
      '-content/b.json',
      '+src/assets/uploads/back.png',
    ])
  })
})

describe('versions API', () => {
  async function call(ctx: EditorContext, method: string, route: string, body?: unknown): Promise<Response> {
    const request = new Request(`http://127.0.0.1:4321${API_PREFIX}${route}`, {
      method,
      headers: { host: '127.0.0.1:4321', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const response = await handleEditorRequest(request, ctx, { remoteAddress: '127.0.0.1' })
    if (!response) throw new Error('not an API route')
    return response
  }

  it('lists, shows, serves and restores commits', async () => {
    write('content/pages/index.json', '{"title":"One"}')
    write('src/assets/uploads/a.png', 'png')
    const one = commit('one')
    write('content/pages/index.json', '{"title":"Two"}')
    commit('two')
    const ctx = context(true)
    ctx.versions = fileVersions(ctx)

    const listed = (await (await call(ctx, 'GET', '/versions')).json()) as {
      commits: { sha: string; message: string }[]
      restoreCommits: boolean
    }
    expect(listed.commits.map((item) => item.message)).toEqual(['two', 'one'])
    expect(listed.restoreCommits).toBe(true)

    const detail = (await (await call(ctx, 'GET', `/versions/${one}`)).json()) as { files: { path: string }[] }
    expect(detail.files.map((file) => file.path)).toEqual(['content/pages/index.json', 'src/assets/uploads/a.png'])

    const file = await call(ctx, 'GET', `/versions/${one}/file?path=${encodeURIComponent('content/pages/index.json')}`)
    expect(await file.text()).toBe('{"title":"One"}')
    expect((await call(ctx, 'GET', `/versions/${one}/file?path=src/assets/uploads/a.png`)).headers.get('content-type')).toBe('image/png')
    expect((await call(ctx, 'GET', `/versions/${one}/file?path=../x`)).status).toBe(400)
    expect((await call(ctx, 'GET', `/versions/${one}/file?path=content/none.json`)).status).toBe(404)
    expect((await call(ctx, 'GET', '/versions/zzz')).status).toBe(400)

    const restored = await call(ctx, 'POST', `/versions/${one}/restore`, { paths: ['content/pages/index.json'] })
    expect(restored.status).toBe(201)
    expect(read('content/pages/index.json')).toContain('One')
    const again = await call(ctx, 'POST', `/versions/${one}/restore`, {})
    expect(again.status).toBe(409)
    expect(((await again.json()) as { error: string }).error).toBe('versions_empty')
  })

  it('answers 404 without a repository behind the content, and 409 outside a work tree', async () => {
    const ctx = context(true)
    expect((await call(ctx, 'GET', '/versions')).status).toBe(404)
    fs.rmSync(path.join(root, '.git'), { recursive: true })
    ctx.versions = fileVersions(ctx)
    const response = await call(ctx, 'GET', '/versions')
    expect(response.status).toBe(409)
    expect(((await response.json()) as { error: string }).error).toBe('versions_not_repo')
  })
})
