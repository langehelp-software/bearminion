import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultTheme } from '../src/theme.js'
import { GitError, commitChanges, gitInfo, parsePorcelain, statusOf } from '../src/git.js'
import type { EditorContext } from '../src/options.js'
import { createMigrator } from '../src/migrate.js'
import { createFileStore } from '../src/store.js'
import { siteDefinition } from './starter.js'

let root = ''

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' })
}

function context(enabled: boolean): EditorContext {
  const contentDir = path.join(root, 'content')
  const uploadsDir = path.join(root, 'src', 'assets', 'uploads')
  return {
    root,
    contentDir,
    uploadsDir,
    sections: {},
    site: siteDefinition,
    store: createFileStore({ root, contentDir, uploadsDir }),
    migrator: createMigrator(),
    theme: defaultTheme,
    git: enabled,
  }
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-git-'))
  fs.mkdirSync(path.join(root, 'content', 'pages'), { recursive: true })
  fs.writeFileSync(path.join(root, 'content', 'pages', 'index.json'), '{"a":1}\n')
  fs.writeFileSync(path.join(root, 'package.json'), '{}\n')
  git('init', '-q')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  git('add', '-A')
  git('commit', '-q', '-m', 'init')
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('git', () => {
  it('maps porcelain codes', () => {
    expect(statusOf('??')).toBe('untracked')
    expect(statusOf(' M')).toBe('modified')
    expect(statusOf('A ')).toBe('added')
    expect(statusOf(' D')).toBe('deleted')
    expect(parsePorcelain(' M content/a.json\0?? content/b.json\0')).toEqual([
      { path: 'content/a.json', status: 'modified' },
      { path: 'content/b.json', status: 'untracked' },
    ])
  })

  it('reports nothing when the option is off', async () => {
    expect(await gitInfo(context(false))).toEqual({ enabled: false, repo: false, files: [] })
    await expect(commitChanges(context(false), 'x')).rejects.toBeInstanceOf(GitError)
  })

  it('lists changed content and ignores files elsewhere', async () => {
    fs.writeFileSync(path.join(root, 'content', 'pages', 'index.json'), '{"a":2}\n')
    fs.writeFileSync(path.join(root, 'content', 'pages', 'new.json'), '{}\n')
    fs.writeFileSync(path.join(root, 'package.json'), '{"x":1}\n')
    const info = await gitInfo(context(true))
    expect(info.repo).toBe(true)
    expect(info.files).toEqual([
      { path: 'content/pages/index.json', status: 'modified' },
      { path: 'content/pages/new.json', status: 'untracked' },
    ])
  })

  it('commits only the content and leaves other changes alone', async () => {
    fs.writeFileSync(path.join(root, 'content', 'pages', 'index.json'), '{"a":2}\n')
    fs.writeFileSync(path.join(root, 'package.json'), '{"x":1}\n')
    const result = await commitChanges(context(true), 'Edit the home page')
    expect(result.files).toBe(1)
    expect(git('log', '-1', '--format=%s').trim()).toBe('Edit the home page')
    expect(git('status', '--porcelain').trim()).toBe('M package.json')
  })

  it('refuses an empty message, an unlisted path and an empty commit', async () => {
    fs.writeFileSync(path.join(root, 'content', 'pages', 'index.json'), '{"a":2}\n')
    await expect(commitChanges(context(true), '  ')).rejects.toMatchObject({ code: 'invalid' })
    await expect(commitChanges(context(true), 'x', ['package.json'])).rejects.toMatchObject({ code: 'invalid' })
    await commitChanges(context(true), 'ok')
    await expect(commitChanges(context(true), 'again')).rejects.toMatchObject({ code: 'empty' })
  })

  it('says so outside a repository', async () => {
    fs.rmSync(path.join(root, '.git'), { recursive: true, force: true })
    expect(await gitInfo(context(true))).toEqual({ enabled: true, repo: false, files: [] })
  })
})
