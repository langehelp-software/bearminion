import { spawn, spawnSync } from 'node:child_process'
import type { PackageManager } from './package-manager.js'

export interface StepResult {
  ok: boolean
  /** The last lines of output, for the failure message. */
  output: string
}

/** Installs the site's dependencies. Output is captured so the spinner stays readable; a failure shows its tail. */
export function install(pm: PackageManager, cwd: string): Promise<StepResult> {
  return new Promise((resolve) => {
    const child = spawn(pm, ['install'], { cwd, shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: string[] = []
    const collect = (data: Buffer) => {
      chunks.push(data.toString())
      if (chunks.length > 400) chunks.splice(0, chunks.length - 400)
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.on('error', (error) => resolve({ ok: false, output: error.message }))
    child.on('close', (code) => resolve({ ok: code === 0, output: tail(chunks.join(''), 20) }))
  })
}

/** True when `cwd` is already inside a git work tree, so the site is part of a larger repository. */
export function insideGitRepository(cwd: string): boolean {
  const result = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, encoding: 'utf8' })
  return result.status === 0 && result.stdout.trim() === 'true'
}

/**
 * `git init` on `main` and a first commit. Without a configured git user the commit is skipped and reported, and the
 * repository is still created.
 */
export function initGit(cwd: string): { initialized: boolean; committed: boolean; reason?: string } {
  const run = (args: string[]) => spawnSync('git', args, { cwd, encoding: 'utf8' })
  const init = run(['init', '--initial-branch=main'])
  if (init.error || init.status !== 0) return { initialized: false, committed: false, reason: (init.error?.message ?? init.stderr).trim() }
  const add = run(['add', '--all'])
  if (add.status !== 0) return { initialized: true, committed: false, reason: add.stderr.trim() }
  const commit = run(['commit', '--quiet', '--no-verify', '--message', 'Initial commit from create-bearminion'])
  if (commit.status !== 0) return { initialized: true, committed: false, reason: (commit.stderr || commit.stdout).trim() }
  return { initialized: true, committed: true }
}

function tail(text: string, lines: number): string {
  return text.trimEnd().split('\n').slice(-lines).join('\n')
}
