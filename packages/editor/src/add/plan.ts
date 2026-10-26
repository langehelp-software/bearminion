import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { hashContent } from '../registry/hash.js'
import type { LockFile, Registry, RegistryItem } from '../registry/types.js'
import { missingPackages } from './packages.js'

/**
 * What `add` does with one file.
 * - `create`: the site has no such file.
 * - `same`: the site's file is this release's.
 * - `update`: the site's file is an earlier release's, untouched (the release history or the lock says so), so the new one replaces it.
 * - `conflict`: the site's file is neither, so the owner changed it. Nothing is written unless `--overwrite`.
 * - `overwrite`: a conflict that `--overwrite` replaces.
 */
export type FileAction = 'create' | 'same' | 'update' | 'conflict' | 'overwrite'

export interface PlannedFile {
  path: string
  action: FileAction
  /** The sections in this run that need the file. */
  sections: string[]
}

export interface Plan {
  sections: RegistryItem[]
  files: PlannedFile[]
  /** npm packages the sections import that the site does not list. */
  npm: Record<string, string>
  /** Files that exist and will be replaced while git shows them as changed. */
  dirty: string[]
}

const WRITES: ReadonlySet<FileAction> = new Set(['create', 'update', 'overwrite'])
export const writesFile = (action: FileAction) => WRITES.has(action)

/** Decides what happens to every file the sections need. Reads the site, writes nothing. */
export function planAdd(
  root: string,
  registry: Registry,
  sections: readonly RegistryItem[],
  options: { overwrite?: boolean; lock?: LockFile } = {},
): Plan {
  const needed = new Map<string, string[]>()
  for (const section of sections) {
    for (const file of section.files) needed.set(file, [...(needed.get(file) ?? []), section.dir])
  }
  const files: PlannedFile[] = [...needed.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([file, owners]) => {
      const entry = registry.files[file]
      if (entry === undefined) throw new Error(`The registry lists ${file} for a section but holds no copy of it.`)
      const target = path.join(root, file)
      let action: FileAction
      if (!fs.existsSync(target)) action = 'create'
      else {
        const hash = hashContent(file, fs.readFileSync(target))
        if (hash === entry.hash) action = 'same'
        else if (entry.history.includes(hash) || options.lock?.files[file]?.hash === hash) action = 'update'
        else action = options.overwrite ? 'overwrite' : 'conflict'
      }
      return { path: file, action, sections: owners }
    })
  const npm = missingPackages(root, Object.assign({}, ...sections.map((section) => section.npm)))
  return {
    sections: [...sections],
    files,
    npm,
    dirty: dirtyFiles(
      root,
      files.filter((file) => file.action === 'update' || file.action === 'overwrite').map((file) => file.path),
    ),
  }
}

/** Which of `paths` git reports as changed or untracked. Empty when there is no git or no repository. */
export function dirtyFiles(root: string, paths: readonly string[]): string[] {
  if (paths.length === 0) return []
  try {
    const out = execFileSync('git', ['status', '--porcelain', '--', ...paths], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => line.slice(3).replace(/^"|"$/g, ''))
  } catch {
    return []
  }
}

/** A section is added when every file it needs is the release's. */
export const isPresent = (plan: Plan) => plan.files.every((file) => file.action === 'same')
