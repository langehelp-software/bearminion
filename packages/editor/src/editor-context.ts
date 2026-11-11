import type { SectionRegistry } from './model.js'
import type { ContentMigrator } from './migrate.js'
import type { GitPort } from './git-types.js'
import type { HistoryPort } from './history-types.js'
import type { PageRules } from './page.js'
import type { SiteDefinition } from './site.js'
import type { ContentStore } from './store-core.js'
import type { ThemeDefinition } from './theme.js'
import type { UploadRules } from './upload-rules.js'

/*
 * The context every editor API call runs in. Types only: no Node imports, so a hosted editor can build its own.
 * `options.ts` builds the one for a local project.
 */

export interface EditorContext {
  root: string
  contentDir: string
  uploadsDir: string
  videosDir: string
  maxVideoBytes: number
  maxImageBytes: number
  pageRules: PageRules
  /** `imageConvert`, validated and with its defaults filled in. `null` when conversion is off. */
  imageConvert: UploadRules['convert']
  sections: SectionRegistry
  site: SiteDefinition
  theme: ThemeDefinition
  store: ContentStore
  /** Upgrades files written under an older `schemaVersion` and stamps the current one on write. */
  migrator: ContentMigrator
  /** Commit changes is enabled. */
  git: boolean
  /** The folder with the site's form handlers, or `null` when the `forms` option turns them off. */
  formsDir?: string | null
  /**
   * Undo history. The local editor keeps copies of what was saved in `.editor/history/`; a hosted editor has none,
   * because the repository is the history.
   */
  history?: HistoryPort
  /** Commit changes, when `git` is on and the project is a local git work tree. */
  commits?: GitPort
  /** The file of the form handler `name` in the site, or `null` when there is none. Local projects only. */
  formFile?: (name: string) => string | null
}
