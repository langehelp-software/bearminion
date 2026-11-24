import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { readLock } from './add/lock.js'
import { SECTIONS_PATH } from './add/apply.js'
import { statusOf } from './add/status.js'
import type { EditorContext } from './editor-context.js'
import { REGISTRY_SCHEMA_VERSION, type Registry } from './registry/types.js'
import { buildSiteStatus, type FileCounts, type SiteStatus } from './site-status.js'
import { VERSION } from './version.js'

/** The registry `bearminion add` copies from, shipped next to `dist/` (and next to `src/` in this repository). */
const REGISTRY_FILE = fileURLToPath(new URL('../registry/default/registry.json', import.meta.url))

function readCatalog(file: string): Registry | undefined {
  try {
    const registry = JSON.parse(fs.readFileSync(file, 'utf8')) as Registry
    return registry.schemaVersion === REGISTRY_SCHEMA_VERSION ? registry : undefined
  } catch {
    return undefined
  }
}

/** Site status of a local project: its section files compared with this release, as `bearminion status` does. */
export function localSiteStatus(context: EditorContext, registryFile = REGISTRY_FILE): () => Promise<SiteStatus> {
  return async () => {
    const catalog = readCatalog(registryFile)
    let files: Record<string, FileCounts> | undefined
    if (catalog) {
      try {
        const status = statusOf(context.root, catalog, readLock(context.root, catalog.template), SECTIONS_PATH)
        files = Object.fromEntries(status.sections.filter((section) => section.added).map((section) => [section.dir, section.counts]))
      } catch {
        // An unreadable lock or file: the list still shows what is installed.
      }
    }
    return buildSiteStatus({
      version: VERSION,
      mode: 'local',
      sections: context.sections,
      ...(catalog ? { catalog } : {}),
      ...(files ? { files } : {}),
    })
  }
}
