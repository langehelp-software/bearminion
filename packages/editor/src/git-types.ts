/*
 * What the editor API knows about "Commit changes": the shapes and the port a local git work tree plugs into. Pure, so
 * the API can run where there is no git. `git.ts` is the implementation on top of the `git` command.
 */

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

/** What the editor needs from a version-control backend. Absent on the context means Commit changes is off. */
export interface GitPort {
  info(): Promise<GitInfo>
  commit(message: string, paths?: readonly string[]): Promise<{ commit: string; files: number }>
}

/** The port of a context with none: Commit changes is off. */
export const NO_GIT: GitPort = {
  async info() {
    return { enabled: false, repo: false, files: [] }
  },
  async commit() {
    throw new GitError('disabled', 'Git commits are off. Set `git: true` in the bearminion() options.')
  },
}
