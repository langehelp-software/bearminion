import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { hashContent } from './hash.js'
import type { RegistryHistory } from './types.js'

export function readHistory(file: string): RegistryHistory {
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as RegistryHistory) : {}
}

/** Adds a release to the history, keys sorted so the file diffs cleanly. Returns true when it changed. */
export function recordRelease(file: string, version: string, hashes: Record<string, string>): boolean {
  const history = readHistory(file)
  const sorted = Object.fromEntries(Object.entries(hashes).sort(([a], [b]) => (a < b ? -1 : 1)))
  if (JSON.stringify(history[version]) === JSON.stringify(sorted)) return false
  history[version] = sorted
  fs.writeFileSync(file, `${JSON.stringify(history, null, 2)}\n`)
  return true
}

/** Whether the recorded hashes of `version` are the ones the template has now. */
export function releaseMatches(file: string, version: string, hashes: Record<string, string>): boolean {
  const recorded = readHistory(file)[version]
  return recorded !== undefined && JSON.stringify(Object.entries(recorded).sort()) === JSON.stringify(Object.entries(hashes).sort())
}

/**
 * The hashes of `files` as `create-bearminion@version` shipped them, read from the published tarball. For a release
 * that was published without being recorded.
 */
export function hashesFromNpm(version: string, files: readonly string[]): Record<string, string> {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'bearminion-history-'))
  try {
    execFileSync('npm', ['pack', `create-bearminion@${version}`, '--silent', '--pack-destination', work], { stdio: 'pipe' })
    const tarball = fs.readdirSync(work).find((name) => name.endsWith('.tgz'))
    if (!tarball) throw new Error(`npm pack gave no tarball for create-bearminion@${version}.`)
    execFileSync('tar', ['-xzf', path.join(work, tarball), '-C', work, 'package/template'], { stdio: 'pipe' })
    const out: Record<string, string> = {}
    for (const file of files) {
      const source = path.join(work, 'package', 'template', file)
      if (fs.existsSync(source)) out[file] = hashContent(file, fs.readFileSync(source))
    }
    return out
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}
