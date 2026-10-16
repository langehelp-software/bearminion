import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import type { EditorContext } from './options.js'
import { isInside } from './security.js'

const run = promisify(execFile)

/** Longest commit message the editor sends. */
export const COMMIT_MESSAGE_LIMIT = 1000

export type ChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked'

export interface ChangedFile {
  /** Path relative to the project root, with `/` separators. */
  path: string
  status: ChangeStatus
}

export interface GitInfo {
  /** The `git` option is on. */
  enabled: boolean
  /** The project is inside a git work tree. */
  repo: boolean
  branch?: string
  files: ChangedFile[]
}

export class GitError extends Error {
  constructor(
    readonly code: 'disabled' | 'not_repo' | 'empty' | 'invalid' | 'failed',
    message: string,
  ) {
    super(message)
  }
}

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
  return [context.contentDir, context.uploadsDir]
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
