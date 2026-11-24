import { execFile } from 'node:child_process'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { COMMIT_MESSAGE_LIMIT, GitError, type ChangedFile, type ChangeStatus, type GitInfo, type GitPort } from './git-types.js'
import type { EditorContext } from './editor-context.js'
import { isInside } from './security.js'
import {
  changeSummary,
  isProjectPath,
  isSha,
  planRestore,
  restoreMessage,
  type VersionCommit,
  VersionError,
  type VersionFile,
  type VersionFileStatus,
  type VersionsPort,
} from './versions-types.js'

const run = promisify(execFile)

async function git(root: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await run('git', args, { cwd: root, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
    return stdout
  } catch (error) {
    const failure = error as { stderr?: string; stdout?: string; message: string }
    const detail = (failure.stderr || failure.stdout || failure.message).trim().split('\n').slice(-3).join('\n')
    throw new GitError('failed', detail || 'git failed.')
  }
}

/** The folders a commit may touch: the content and the uploads. Relative to the project root. */
export function trackedPaths(context: EditorContext): string[] {
  return [context.contentDir, context.uploadsDir, context.videosDir]
    .filter((dir) => isInside(context.root, dir))
    .map((dir) => path.relative(context.root, dir).split(path.sep).join('/') || '.')
}

export function statusOf(code: string): ChangeStatus {
  if (code === '??') return 'untracked'
  if (code.includes('R')) return 'renamed'
  if (code.includes('D')) return 'deleted'
  if (code.includes('A')) return 'added'
  return 'modified'
}

/** Parse `git status --porcelain=v1 -z`. A rename carries a second path, which is skipped. */
export function parsePorcelain(output: string): ChangedFile[] {
  const parts = output.split('\0')
  const files: ChangedFile[] = []
  for (let i = 0; i < parts.length; i += 1) {
    const entry = parts[i] ?? ''
    if (entry.length < 4) continue
    const code = entry.slice(0, 2)
    files.push({ path: entry.slice(3), status: statusOf(code) })
    if (code.includes('R') || code.includes('C')) i += 1
  }
  return files
}

async function inRepo(root: string): Promise<boolean> {
  try {
    return (await git(root, ['rev-parse', '--is-inside-work-tree'])).trim() === 'true'
  } catch {
    return false
  }
}

/** Where the project stands. Without the option, or outside a repository, it says so and lists nothing. */
export async function gitInfo(context: EditorContext): Promise<GitInfo> {
  if (!context.git) return { enabled: false, repo: false, files: [] }
  if (!(await inRepo(context.root))) return { enabled: true, repo: false, files: [] }
  const [status, branch] = await Promise.all([
    git(context.root, ['status', '--porcelain=v1', '-z', '-uall', '--', ...trackedPaths(context)]),
    git(context.root, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => ''),
  ])
  const files = parsePorcelain(status)
  const topLevel = (await git(context.root, ['rev-parse', '--show-toplevel'])).trim()
  // Porcelain paths are relative to the repository root. Show them relative to the project instead.
  const prefix = path.relative(topLevel, context.root).split(path.sep).join('/')
  const shown = files.map((file) => ({
    ...file,
    path: prefix !== '' && file.path.startsWith(`${prefix}/`) ? file.path.slice(prefix.length + 1) : file.path,
  }))
  return { enabled: true, repo: true, branch: branch.trim() || undefined, files: shown }
}

/**
 * Commit the changed content and upload files, or only `paths` of them. Local only: there is no push.
 * Only files that git reports as changed under the content and uploads folders can be named.
 */
export async function commitChanges(
  context: EditorContext,
  message: string,
  paths?: readonly string[],
): Promise<{ commit: string; files: number }> {
  if (!context.git) throw new GitError('disabled', 'Git commits are off. Set `git: true` in the bearminion() options.')
  const text = message.trim()
  if (text === '') throw new GitError('invalid', 'A commit message is required.')
  if (text.length > COMMIT_MESSAGE_LIMIT) throw new GitError('invalid', `The commit message is over ${COMMIT_MESSAGE_LIMIT} characters.`)
  const info = await gitInfo(context)
  if (!info.repo) throw new GitError('not_repo', 'This project is not in a git repository.')
  const allowed = new Set(info.files.map((file) => file.path))
  const chosen = paths === undefined ? [...allowed] : [...new Set(paths)]
  for (const item of chosen) {
    if (!allowed.has(item)) throw new GitError('invalid', `"${item}" has no changes under the content or uploads folders.`)
  }
  if (chosen.length === 0) throw new GitError('empty', 'There are no changes to commit.')
  await git(context.root, ['add', '--all', '--', ...chosen])
  await git(context.root, ['commit', '-m', text, '--', ...chosen])
  const commit = (await git(context.root, ['rev-parse', '--short', 'HEAD'])).trim()
  return { commit, files: chosen.length }
}

export { COMMIT_MESSAGE_LIMIT, GitError }
export type { ChangedFile, ChangeStatus, GitInfo, GitPort }

/** Commit changes on the local git work tree of the project. */
export function fileGit(context: EditorContext): GitPort {
  return {
    info: () => gitInfo(context),
    commit: (message, paths) => commitChanges(context, message, paths),
  }
}

/* ---------- version history ---------- */

const FIELD = '\x1f'
const RECORD = '\x1e'
const LOG_FORMAT = `${RECORD}%H${FIELD}%h${FIELD}%P${FIELD}%an${FIELD}%cI${FIELD}%s`

async function gitBytes(root: string, args: string[]): Promise<Buffer> {
  const { stdout } = await run('git', args, {
    cwd: root,
    encoding: 'buffer',
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  return stdout
}

function parseCommit(record: string): VersionCommit | undefined {
  const [sha, short, parents, author, at, ...subject] = record.replace(/^\n+|\n+$/g, '').split(FIELD)
  if (!sha || !short || at === undefined) return undefined
  const parent = parents?.split(' ').find((value) => value !== '')
  return { sha, short, message: subject.join(FIELD), author: author ?? '', at, ...(parent ? { parent } : {}) }
}

/** Parse `git diff-tree --name-status -z -M`. A rename (`R100`) carries the old path and then the new one. */
export function parseNameStatus(output: string): { path: string; status: VersionFileStatus; from?: string }[] {
  const parts = output.split('\0').filter((part) => part !== '')
  const files: { path: string; status: VersionFileStatus; from?: string }[] = []
  for (let index = 0; index < parts.length; ) {
    const code = parts[index] ?? ''
    if (code.startsWith('R') || code.startsWith('C')) {
      const from = parts[index + 1]
      const to = parts[index + 2]
      if (from && to) files.push(code.startsWith('R') ? { path: to, status: 'renamed', from } : { path: to, status: 'added' })
      index += 3
      continue
    }
    const file = parts[index + 1]
    if (file) files.push({ path: file, status: code.startsWith('A') ? 'added' : code.startsWith('D') ? 'deleted' : 'modified' })
    index += 2
  }
  return files
}

/** Read commits of the local work tree. Restoring commits when `git` is on and only writes the files when it is off. */
export function fileVersions(context: EditorContext): VersionsPort {
  const root = context.root
  const relative = (dir: string) => path.relative(root, dir).split(path.sep).join('/')
  const contentRel = relative(context.contentDir)
  const assetDirs = [context.uploadsDir, context.videosDir].filter((dir) => isInside(root, dir)).map(relative)

  function scope(also: readonly string[] = []): string[] {
    return [...new Set([...trackedPaths(context), ...also.filter(isProjectPath)])]
  }

  function describe(file: { path: string; status: VersionFileStatus; from?: string }): VersionFile {
    const inContent =
      contentRel === '' || contentRel === '.'
        ? file.path
        : file.path.startsWith(`${contentRel}/`)
          ? file.path.slice(contentRel.length + 1)
          : undefined
    const asset = file.path.startsWith('src/assets/') || assetDirs.some((dir) => file.path.startsWith(`${dir}/`))
    return { ...file, ...(inContent !== undefined && !asset ? { key: inContent } : {}), ...(asset ? { asset: true } : {}) }
  }

  async function ensureRepo() {
    if (!(await inRepo(root))) throw new VersionError('not_repo', 'This project is not in a git repository, so there is no commit history.')
  }

  async function commitOf(sha: string): Promise<VersionCommit | undefined> {
    if (!isSha(sha)) return undefined
    try {
      const out = await git(root, ['show', '-s', `--format=${LOG_FORMAT}`, `${sha}^{commit}`, '--'])
      return parseCommit(out.split(RECORD)[1] ?? '')
    } catch {
      return undefined
    }
  }

  async function filesOf(sha: string, also?: readonly string[]): Promise<VersionFile[]> {
    const out = await git(root, [
      'diff-tree',
      '--no-commit-id',
      '-r',
      '-M',
      '--root',
      '--name-status',
      '-z',
      '--relative',
      sha,
      '--',
      ...scope(also),
    ])
    return parseNameStatus(out).map(describe)
  }

  async function exists(file: string): Promise<boolean> {
    try {
      await access(path.join(root, file))
      return true
    } catch {
      return false
    }
  }

  async function same(file: string, bytes: Uint8Array): Promise<boolean> {
    try {
      return Buffer.from(bytes).equals(await readFile(path.join(root, file)))
    } catch {
      return false
    }
  }

  async function read(sha: string, file: string): Promise<Uint8Array | undefined> {
    if (!isSha(sha) || !isProjectPath(file)) return undefined
    try {
      return new Uint8Array(await gitBytes(root, ['show', `${sha}:./${file}`]))
    } catch {
      return undefined
    }
  }

  return {
    read,

    async list({ cursor, limit, also }) {
      await ensureRepo()
      const skip = cursor === undefined ? 0 : Number.parseInt(cursor, 10)
      if (!Number.isSafeInteger(skip) || skip < 0) throw new VersionError('invalid', 'Not a history cursor.')
      let out = ''
      try {
        out = await git(root, ['log', `--format=${LOG_FORMAT}`, `--skip=${skip}`, `-n`, String(limit + 1), '--', ...scope(also)])
      } catch {
        // A repository without commits yet.
        return { commits: [], restoreCommits: context.git }
      }
      const commits = out
        .split(RECORD)
        .map(parseCommit)
        .filter((commit): commit is VersionCommit => commit !== undefined)
      const branch = (await git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => '')).trim()
      return {
        commits: commits.slice(0, limit),
        restoreCommits: context.git,
        ...(commits.length > limit ? { cursor: String(skip + limit) } : {}),
        ...(branch && branch !== 'HEAD' ? { branch } : {}),
      }
    },

    async get(sha, also) {
      await ensureRepo()
      const commit = await commitOf(sha)
      if (!commit) return undefined
      return { commit, files: await filesOf(commit.sha, also) }
    },

    async restore(sha, { paths, also }) {
      await ensureRepo()
      const commit = await commitOf(sha)
      if (!commit) throw new VersionError('not_found', 'There is no such commit.')
      const all = await filesOf(commit.sha, also)
      const chosen = paths === undefined ? all : all.filter((file) => paths.includes(file.path))
      if (chosen.length === 0) throw new VersionError('empty', 'That commit changed none of those files.')
      const changes = await planRestore(commit.sha, chosen, { read, exists, same })
      if (changes.length === 0) throw new VersionError('empty', 'Those files are already as they were in that commit.')
      for (const change of changes) {
        if (!isProjectPath(change.path) || !isInside(root, path.join(root, change.path))) {
          throw new VersionError('invalid', `"${change.path}" is outside the project.`)
        }
      }
      const touched = changes.map((change) => change.path)
      const dirty = parsePorcelain(await git(root, ['status', '--porcelain=v1', '-z', '-uall', '--', ...touched]))
      if (dirty.length > 0) {
        throw new VersionError(
          'dirty',
          `Commit or discard the changes to ${dirty.map((file) => file.path).join(', ')} first: restoring would overwrite them.`,
        )
      }
      for (const change of changes) {
        const target = path.join(root, change.path)
        if ('remove' in change) await rm(target, { force: true })
        else {
          await mkdir(path.dirname(target), { recursive: true })
          await writeFile(target, change.bytes)
        }
      }
      const summary = changeSummary(changes)
      if (!context.git) return summary
      await git(root, ['add', '--all', '--', ...touched])
      await git(root, ['commit', '-m', restoreMessage(commit.short, changes), '--', ...touched])
      return { commit: (await git(root, ['rev-parse', '--short', 'HEAD'])).trim(), ...summary }
    },
  }
}
