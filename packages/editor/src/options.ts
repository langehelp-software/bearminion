import { createMigrator, type ContentMigrator } from './migrate.js'
import { DEFAULT_CONTENT_DIR, DEFAULT_UPLOADS_DIR, type ContentModel, type SectionRegistry } from './model.js'
import { asDirectory, resolveDir } from './security.js'
import type { SiteDefinition } from './site.js'
import { defaultTheme, type ThemeDefinition } from './theme.js'
import { createFileStore, type ContentStore } from './store.js'

export { API_PREFIX, DEFAULT_CONTENT_DIR, DEFAULT_UPLOADS_DIR } from './model.js'
export type { ContentModel, SectionRegistry } from './model.js'

export interface BearminionOptions extends ContentModel {
  /** Directory that contains `site.json` and `pages/`. Default `content`. */
  contentDir?: string
  /** Directory for uploaded images. Default `src/assets/uploads`. */
  uploadsDir?: string
  /**
   * Vite module id loaded by the dev server to render a draft page.
   * Default `/src/lib/render-preview.ts`. Preview never writes to disk.
   */
  previewModule?: string
  /**
   * Show Commit changes in the editor, which commits the changed content and uploads to the local git repository.
   * Off by default. It never pushes, and it does nothing outside a git work tree.
   */
  git?: boolean
  /**
   * Where content and uploads are read and written. Default: the local project, using `contentDir` and `uploadsDir`.
   * A custom store replaces those two folders for the editor API; undo history, the live-reload watcher and
   * `git` still work on the local project.
   */
  store?: ContentStore
}

export interface EditorContext {
  root: string
  contentDir: string
  uploadsDir: string
  sections: SectionRegistry
  site: SiteDefinition
  theme: ThemeDefinition
  store: ContentStore
  /** Upgrades files written under an older `schemaVersion` and stamps the current one on write. */
  migrator: ContentMigrator
  /** Commit changes is enabled. */
  git: boolean
}

export function resolveEditorContext(options: BearminionOptions | undefined, rootInput: string | URL): EditorContext {
  if (!options?.sections) {
    throw new Error("bearminion() needs the `sections` option: the site's section definitions.")
  }
  if (!options.site) {
    throw new Error("bearminion() needs the `site` option: the site's header and footer definition from defineSite().")
  }
  const root = asDirectory(rootInput)
  const contentDir = resolveDir(root, options?.contentDir, DEFAULT_CONTENT_DIR)
  const uploadsDir = resolveDir(root, options?.uploadsDir, DEFAULT_UPLOADS_DIR)
  return {
    root,
    contentDir,
    uploadsDir,
    sections: options.sections,
    site: options.site,
    theme: options.theme ?? defaultTheme,
    store: options.store ?? createFileStore({ root, contentDir, uploadsDir }),
    migrator: createMigrator(options),
    git: options?.git === true,
  }
}
