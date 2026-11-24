import type { SectionRegistry } from './model.js'
import type { Collection } from './collections.js'
import type { ResolvedTypes } from './content-types.js'
import type { ContentMigrator } from './migrate.js'
import type { GitPort } from './git-types.js'
import type { PageRules } from './page.js'
import type { SiteDefinition } from './site.js'
import type { SiteStatus } from './site-status.js'
import type { ContentStore } from './store-core.js'
import type { ThemeDefinition } from './theme.js'
import type { UploadRules } from './upload-rules.js'
import type { VersionsPort } from './versions-types.js'

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
  /** The site's content types. Absent means only the built-in ones: the home page, the 404 page and `pages`. */
  types?: ResolvedTypes
  /** Markdown collections the editor can edit, by id. Absent when the site has none. */
  collections?: Record<string, Collection>
  /** The folder with the site's form handlers, or `null` when the `forms` option turns them off. */
  formsDir?: string | null
  /**
   * The commits of the content and the uploads: the local project's own work tree, or the store's repository. Absent
   * when there is no repository behind the content.
   */
  versions?: VersionsPort
  /**
   * Site status with the site's section files compared with this release. Local projects only; without it `GET /status`
   * answers from the registered sections.
   */
  siteStatus?: () => Promise<SiteStatus>
  /** Commit changes, when `git` is on and the project is a local git work tree. */
  commits?: GitPort
  /** The file of the form handler `name` in the site, or `null` when there is none. Local projects only. */
  formFile?: (name: string) => string | null
}
