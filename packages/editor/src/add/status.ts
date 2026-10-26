import fs from 'node:fs'
import path from 'node:path'
import { hashContent } from '../registry/hash.js'
import type { LockFile, Registry } from '../registry/types.js'

/**
 * How a file of the site compares with the installed release.
 * - `current`: it is this release's file.
 * - `outdated`: you never changed it, and the release has. `add` replaces it.
 * - `edited`: you changed it, and the release has not changed it since you got it. Nothing to do.
 * - `conflict`: you changed it, and the release did too. `add` stops on it.
 * - `differs`: it is not this release's file, and there is no lock to say who changed it. `add` stops on it.
 * - `missing`: the site has no such file.
 */
export type FileState = 'current' | 'outdated' | 'edited' | 'conflict' | 'differs' | 'missing'

/** Decides the state of one file from its hash in the site, in the release, and in the lock. */
export function classify(siteHash: string | undefined, release: { hash: string; history: string[] }, lockHash?: string): FileState {
  if (siteHash === undefined) return 'missing'
  if (siteHash === release.hash) return 'current'
  if (release.history.includes(siteHash) || siteHash === lockHash) return 'outdated'
  if (lockHash === undefined) return 'differs'
  return lockHash === release.hash ? 'edited' : 'conflict'
}

export interface SectionStatus {
  dir: string
  label: string
  /** The site has the section's directory. */
  added: boolean
  /** Files by state, for an added section. */
  counts: Partial<Record<FileState, number>>
}

export interface Status {
  version: string
  /** Every file of an added section that is not current, with the sections that use it. */
  files: Array<{ path: string; state: FileState; sections: string[] }>
  sections: SectionStatus[]
  /** The sections that `add` can bring up to date without asking: outdated files and nothing else. */
  updatable: string[]
}

/** Reads the site and compares it with the release. Writes nothing. */
export function statusOf(root: string, registry: Registry, lock: LockFile, sectionsPath: string): Status {
  const state = new Map<string, FileState>()
  const users = new Map<string, string[]>()
  const stateOf = (file: string): FileState => {
    let known = state.get(file)
    if (known === undefined) {
      const target = path.join(root, file)
      const siteHash = fs.existsSync(target) ? hashContent(file, fs.readFileSync(target)) : undefined
      known = classify(siteHash, registry.files[file] ?? { hash: '', history: [] }, lock.files[file]?.hash)
      state.set(file, known)
    }
    return known
  }

  const sections: SectionStatus[] = []
  for (const item of Object.values(registry.items)) {
    const added = fs.existsSync(path.join(root, sectionsPath, item.dir, 'definition.ts'))
    const counts: SectionStatus['counts'] = {}
    if (added) {
      for (const file of item.files) {
        const fileState = stateOf(file)
        counts[fileState] = (counts[fileState] ?? 0) + 1
        users.set(file, [...(users.get(file) ?? []), item.dir])
      }
    }
    sections.push({ dir: item.dir, label: item.label, added, counts })
  }

  const files = [...users.keys()]
    .sort()
    .map((file) => ({ path: file, state: stateOf(file), sections: users.get(file) ?? [] }))
    .filter((file) => file.state !== 'current')
  const updatable = sections
    .filter((section) => section.added && (section.counts.outdated ?? 0) > 0)
    .filter((section) => !section.counts.conflict && !section.counts.differs)
    .map((section) => section.dir)
  return { version: registry.version, files, sections, updatable }
}
