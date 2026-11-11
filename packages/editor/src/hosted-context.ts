import { type HandleMeta, handleEditorRequest } from './api.js'
import { type CollectionOptions, resolveCollections } from './collections.js'
import type { EditorContext } from './editor-context.js'
import { githubStore } from './github-store.js'
import { createMigrator } from './migrate.js'
import type { ContentModel } from './model.js'
import { type PageRules, resolvePageRules } from './page.js'
import type { ContentStore } from './store-core.js'
import { StoreError, StoreKeyError } from './store-error.js'
import { defaultTheme } from './theme.js'
import { type ImageConvertOptions, resolveConvert, resolveMaxImageBytes } from './upload-rules.js'
import { DEFAULT_VIDEO_BYTE_LIMIT } from './video-sniff.js'

/*
 * The editor API for a place that is not a developer's machine: a Worker, a serverless function. Web-standard APIs
 * only, no Node imports (a test keeps it that way). The caller signs the person in and passes
 * `{ authenticated: true }` with each request; there is no localhost check, undo history or Commit changes here,
 * because the repository is the history.
 */

export interface HostedEditorOptions extends ContentModel {
  /** Where content lives, such as `githubStore({ ... })`. */
  store: ContentStore
  /** Largest image accepted, in bytes. Default 5 MB. */
  maxImageBytes?: number
  /** Re-encode images in the browser before upload. Default: off. */
  imageConvert?: false | ImageConvertOptions
  /** Which page operations are allowed. */
  pages?: Partial<PageRules>
  /** Markdown collections, by id. See `collection()`. */
  collections?: Record<string, CollectionOptions>
}

/** The context for `handleEditorRequest`. */
export function createHostedContext(options: HostedEditorOptions): EditorContext {
  if (!options.sections) throw new Error("createHostedContext() needs the `sections` option: the site's section definitions.")
  if (!options.site) throw new Error('createHostedContext() needs the `site` option: the site definition from defineSite().')
  if (!options.store) throw new Error('createHostedContext() needs the `store` option, such as githubStore({ ... }).')
  return {
    // There is no local project: these folders mean nothing to a store that is not the file system.
    root: '',
    contentDir: '',
    uploadsDir: '',
    videosDir: '',
    maxVideoBytes: DEFAULT_VIDEO_BYTE_LIMIT,
    maxImageBytes: resolveMaxImageBytes(options.maxImageBytes),
    pageRules: resolvePageRules(options.pages),
    imageConvert: resolveConvert(options.imageConvert),
    sections: options.sections,
    site: options.site,
    theme: options.theme ?? defaultTheme,
    store: options.store,
    migrator: createMigrator(options),
    git: false,
    ...(options.collections ? { collections: resolveCollections(options.collections) } : {}),
  }
}

/** Handle one editor API request. Returns `null` for a path that is not the editor API. Sign the person in first. */
export function handleHostedRequest(
  request: Request,
  context: EditorContext,
  meta: Omit<HandleMeta, 'authenticated'> = {},
): Promise<Response | null> {
  return handleEditorRequest(request, context, { ...meta, authenticated: true })
}

export { collection } from './collections.js'
export type { CollectionOptions } from './collections.js'
export { githubStore, StoreError, StoreKeyError }
export type { EditorContext }
export type { GithubStoreOptions } from './github-store.js'
export type { ContentStore } from './store-core.js'
