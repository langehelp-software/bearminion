import fs from 'node:fs'
import path from 'node:path'
import { hashContent } from '../registry/hash.js'
import type { LockFile, Registry } from '../registry/types.js'
import { recordFiles } from './lock.js'
import type { FileAction } from './plan.js'

/*
 * `bearminion add type` (and `--files-only` alone): brings the files of a site made before content types up to the ones that publish declared
 * types (the route, the collections, the content readers, the listing's components). It writes the starter's own files
 * only. The content model and `astro.config.ts` are the site's and are never touched; `notes` says what to do there.
 */

export interface TypesFile {
  path: string
  action: FileAction
}

export interface TypesPlan {
  files: TypesFile[]
  dirty: string[]
  notes: string[]
}

const CONFIG_FILES = ['astro.config.ts', 'astro.config.mts', 'astro.config.mjs', 'astro.config.js']
export const TYPES_DOCS = 'https://docs.bearminion.com/content-types/'

export function planTypes(root: string, registry: Registry, lock: LockFile, overwrite: boolean): TypesPlan {
  const group = registry.groups?.types
  if (group === undefined) throw new Error('This copy of bearminion has no content type files. Reinstall the package.')
  const files: TypesFile[] = []
  for (const file of group.files) {
    const entry = registry.files[file]
    if (entry === undefined) throw new Error(`The registry lists ${file} for content types but holds no copy of it.`)
    const target = path.join(root, file)
    let action: FileAction
    if (!fs.existsSync(target)) action = 'create'
    else {
      const hash = hashContent(file, fs.readFileSync(target))
      if (hash === entry.hash) action = 'same'
      else if (entry.history.includes(hash) || lock.files[file]?.hash === hash) action = 'update'
      else action = overwrite ? 'overwrite' : 'conflict'
    }
    files.push({ path: file, action })
  }

  const notes: string[] = []
  const config = CONFIG_FILES.find((name) => fs.existsSync(path.join(root, name)))
  // The sitemap is filtered from a list the site's own config builds. A list of pages leaves entries out of it.
  if (config !== undefined && !fs.readFileSync(path.join(root, config), 'utf8').includes('siteRoutes')) {
    notes.push(
      `${config} is yours and was not changed. It filters the sitemap by the site's pages only, so entries and listing pages would be left out of it. Pass the routes instead: ${TYPES_DOCS}#the-sitemap`,
    )
  }
  return { files, dirty: [], notes }
}

export const writesTypes = (action: FileAction): boolean => action === 'create' || action === 'update' || action === 'overwrite'

/** Writes what the plan says and notes the files in the lock. Returns the paths written. A plan with conflicts is never applied. */
export function applyTypes(
  root: string,
  registryDir: string,
  registry: Registry,
  plan: TypesPlan,
  lock: LockFile,
): { written: string[]; lock: LockFile } {
  if (plan.files.some((file) => file.action === 'conflict')) throw new Error('The plan has conflicts. Nothing was written.')
  const written: string[] = []
  for (const file of plan.files) {
    if (!writesTypes(file.action)) continue
    const target = path.join(root, file.path)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(path.join(registryDir, 'files', file.path), target)
    written.push(file.path)
  }
  return {
    written,
    lock: recordFiles(
      lock,
      registry,
      plan.files.map((file) => file.path),
    ),
  }
}

/** What is left for the person to do: declaring a type. */
export function nextSteps(): string[] {
  return [
    'The site can now publish content types. To declare one, run:',
    '',
    '  npx bearminion add type',
    '',
    `It asks what the type is and writes it to src/lib/types. More: ${TYPES_DOCS}`,
  ]
}
