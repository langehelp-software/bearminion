import fs from 'node:fs'
import path from 'node:path'
import { LOCK_FILE, REGISTRY_SCHEMA_VERSION, type LockFile, type Registry } from '../registry/types.js'

/** The site's lock file, or an empty one for the template when it has none. */
export function readLock(root: string, template: string): LockFile {
  const file = path.join(root, LOCK_FILE)
  if (!fs.existsSync(file)) return { schemaVersion: REGISTRY_SCHEMA_VERSION, template, files: {} }
  const lock = JSON.parse(fs.readFileSync(file, 'utf8')) as LockFile
  if (lock.template !== template) {
    throw new Error(`${LOCK_FILE} belongs to the "${lock.template}" template, and this is "${template}".`)
  }
  return lock
}

/**
 * Notes that `paths` now hold what `registry` has, keeping an older entry whose hash is still right: the file has not
 * changed since that release, and that release is the one a later update has to start from.
 */
export function recordFiles(lock: LockFile, registry: Registry, paths: readonly string[]): LockFile {
  const files = { ...lock.files }
  for (const file of paths) {
    const hash = registry.files[file]?.hash
    if (hash === undefined) continue
    if (files[file]?.hash !== hash) files[file] = { version: registry.version, hash }
  }
  return { ...lock, files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1))) }
}

export function writeLock(root: string, lock: LockFile): void {
  fs.writeFileSync(path.join(root, LOCK_FILE), `${JSON.stringify(lock, null, 2)}\n`)
}
