import { createMigrator, type ContentMigrator } from './migrate.js'
import { DEFAULT_VIDEO_BYTE_LIMIT } from './videos.js'
import { DEFAULT_CONTENT_DIR, DEFAULT_UPLOADS_DIR, DEFAULT_VIDEOS_DIR, type ContentModel, type SectionRegistry } from './model.js'
import { asDirectory, resolveDir } from './security.js'
import type { SiteDefinition } from './site.js'
import { defaultTheme, type ThemeDefinition } from './theme.js'
import { createFileStore, type ContentStore } from './store.js'
import { resolveFormsConfig } from './forms-dev.js'
import { resolvePageRules, type PageRules } from './page.js'
import { resolveConvert, resolveMaxImageBytes, type ImageConvertOptions, type UploadRules } from './upload-rules.js'

export { API_PREFIX, DEFAULT_CONTENT_DIR, DEFAULT_UPLOADS_DIR, DEFAULT_VIDEOS_DIR } from './model.js'
export type { ContentModel, SectionRegistry } from './model.js'

export interface BearminionOptions extends ContentModel {
  /** Directory that contains `site.json` and `pages/`. Default `content`. */
  contentDir?: string
  /** Directory for uploaded images. Default `src/assets/uploads`. */
  uploadsDir?: string
  /** Directory for uploaded videos. It must be inside `public/`, which serves them as they are. Default `public/videos`. */
  videosDir?: string
  /** Largest video the editor accepts, in bytes. Default 50 MB. */
  maxVideoBytes?: number
  /**
   * Largest image the editor accepts, in bytes. Default 5 MB. The editor checks it in the browser before it uploads,
   * and the server checks it again.
   */
  maxImageBytes?: number
  /**
   * Re-encode images in the browser before they are uploaded, so phone photos stay out of the repository:
   * `{ to: 'webp', maxWidth: 2400, quality: 0.82 }`. Animated GIFs are never converted, and an image that would come
   * out larger is kept as it is. Default: off, images are uploaded as they are.
   */
  imageConvert?: false | ImageConvertOptions
  /**
   * Which page operations the editor allows: `{ rename: false, delete: false }` for a site whose addresses must not
   * change (they carry search ranking or are the target of redirects). Both default to true. A locked operation is
   * refused by the API as well as hidden in the editor. `rename: false` also blocks making another page the home page,
   * because that moves the old home page to a new address.
   */
  pages?: Partial<PageRules>
  /**
   * Vite module id loaded by the dev server to render a draft page.
   * Default `/src/lib/render-preview.ts`. Preview never writes to disk.
   */
  previewModule?: string
  /**
   * The folder that holds the section directories and the files `bearminion sync` generates from them, relative to the
   * project root. When set, `astro build`, `astro check` and `astro sync` stop if those files are stale, and
   * `astro dev` warns. Default: not checked.
   */
  sectionsDir?: string
  /**
   * The dev route for the forms in your site. A file `src/forms/contact.ts` that default-exports `defineForm(...)`
   * answers at `/api/contact` during `astro dev`, as a dry run unless `BEARMINION_FORMS_LIVE=on`. `dir` is the folder
   * (default `src/forms`) and `prefix` the path (default `/api`). `false` turns the route off, for a site whose
   * Astro adapter serves the endpoint itself.
   */
  forms?: false | { dir?: string; prefix?: string }
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
  const videosDir = resolveDir(root, options?.videosDir, DEFAULT_VIDEOS_DIR)
  return {
    root,
    contentDir,
    uploadsDir,
    videosDir,
    maxVideoBytes: options?.maxVideoBytes ?? DEFAULT_VIDEO_BYTE_LIMIT,
    maxImageBytes: resolveMaxImageBytes(options?.maxImageBytes),
    pageRules: resolvePageRules(options?.pages),
    imageConvert: resolveConvert(options?.imageConvert),
    sections: options.sections,
    site: options.site,
    theme: options.theme ?? defaultTheme,
    store: options.store ?? createFileStore({ root, contentDir, uploadsDir, videosDir }),
    migrator: createMigrator(options),
    git: options?.git === true,
    formsDir: resolveFormsConfig(options?.forms, root)?.dir ?? null,
  }
}
